/**
 * Google Drive backup — App Data Folder.
 * Uses the Drive REST API v3 directly. No SDK.
 * Each Google account has its own isolated App Data folder.
 *
 * File structure in Drive App Data:
 *   manifest.json
 *   settings.json
 *   customer_000001.json
 *   customer_000002.json
 *   ...
 */

import { ensureFreshToken, hasDrivePermission, getSession } from "./googleAuth";
import { serializeCustomer, sha256Hex } from "./backup/customerSerializer";
import { db, customerFileId, type Customer } from "./db";
import { getPrintSize } from "./printSettings";
import { getShopName, getIncludeShopName } from "./communicationSettings";
import { attachSyncMetadata, type SyncedCustomer } from "./sync/conflictResolver";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MANIFEST = "manifest.json";
const SETTINGS_FILE = "settings.json";

// ── Auth header ───────────────────────────────────────────────────────────────

async function authHeader(): Promise<string> {
  const s = await ensureFreshToken();
  return `Bearer ${s.accessToken}`;
}

/** Fallback: get auth header synchronously (may be stale). */
function authHeaderSync(): string {
  const s = getSession();
  if (!s) throw new Error("Not signed in to Google");
  return `Bearer ${s.accessToken}`;
}

// ── Drive REST helpers ────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
}

/** List all files in the App Data folder. */
export async function listDriveFiles(): Promise<DriveFile[]> {
  const auth = await authHeader();
  const url =
    `${DRIVE}/files?spaces=appDataFolder&fields=files(id,name)&pageSize=1000`;
  const res = await fetch(url, {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
  const data: { files: DriveFile[] } = await res.json();
  return data.files ?? [];
}

/** Download a file by Drive file ID and return its text content. */
export async function downloadDriveFile(fileId: string): Promise<string> {
  const auth = await authHeader();
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`Drive download error: ${res.status}`);
  return res.text();
}

/**
 * Upload (create or update) a file in the App Data folder.
 * Uses multipart/related as required by the Drive multipart upload spec.
 */
export async function uploadDriveFile(
  name: string,
  content: string,
  existingId?: string,
): Promise<string> {
  const auth = await authHeader();
  const boundary = `bharti_${Date.now()}`;
  const meta = JSON.stringify(
    existingId ? {} : { name, parents: ["appDataFolder"] },
  );
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    meta,
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const url = existingId
    ? `${UPLOAD}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: auth,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload error ${res.status}: ${err}`);
  }
  const data: { id: string } = await res.json();
  return data.id;
}

/** Delete a file from Drive by its file ID. */
export async function deleteDriveFileById(fileId: string): Promise<void> {
  const auth = await authHeader();
  const res = await fetch(`${DRIVE}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete error: ${res.status}`);
  }
}

// ── Backup metadata (cached in localStorage) ──────────────────────────────────

interface BackupMeta {
  /** name → Drive file ID */
  files: Record<string, string>;
  /** name → sha256 of last uploaded JSON */
  hashes: Record<string, string>;
  lastBackup: string | null;
}

const META_KEY = "bharti-drive-meta";

function getMeta(): BackupMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : { files: {}, hashes: {}, lastBackup: null };
  } catch {
    return { files: {}, hashes: {}, lastBackup: null };
  }
}

function saveMeta(m: BackupMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(m));
}

export function clearDriveMeta(): void {
  localStorage.removeItem(META_KEY);
}

// ── Single-customer operations (used by sync engine) ─────────────────────────

/** Upload a single customer file to Drive. Returns the Drive file ID. */
export async function uploadSingleCustomer(customerId: number): Promise<string> {
  const customer = await db.customers.get(customerId);
  if (!customer) throw new Error(`Customer ${customerId} not found`);

  const serialized = await serializeCustomer(customer);
  const fileName = `${serialized.id}.json`;

  // Attach sync metadata
  const meta = getMeta();
  let existingSyncVersion: number | undefined;

  // Try to read existing cloud version's syncVersion
  const existingDriveId = meta.files[fileName];
  if (existingDriveId) {
    try {
      const existing = JSON.parse(await downloadDriveFile(existingDriveId)) as SyncedCustomer;
      existingSyncVersion = existing.syncVersion;
    } catch {
      // File might have been deleted or corrupted — proceed with fresh upload
    }
  }

  const synced = attachSyncMetadata(serialized, existingSyncVersion);
  const content = JSON.stringify(synced, null, 2);
  const hash = await sha256Hex(content);

  // Skip if unchanged
  if (meta.hashes[fileName] === hash && existingDriveId) {
    return existingDriveId;
  }

  const driveId = await uploadDriveFile(fileName, content, existingDriveId);
  meta.files[fileName] = driveId;
  meta.hashes[fileName] = hash;
  saveMeta(meta);

  return driveId;
}

/** Delete a customer file from Drive by customer ID. */
export async function deleteDriveCustomer(customerId: number): Promise<void> {
  const fileName = `${customerFileId(customerId)}.json`;
  const meta = getMeta();
  const driveId = meta.files[fileName];
  if (driveId) {
    await deleteDriveFileById(driveId);
    delete meta.files[fileName];
    delete meta.hashes[fileName];
    saveMeta(meta);
  }
}

/** Download and parse a single customer file from Drive. */
export async function downloadCustomerFile(fileId: string): Promise<SyncedCustomer> {
  const raw = await downloadDriveFile(fileId);
  return JSON.parse(raw) as SyncedCustomer;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BackupResult {
  updated: number;
  unchanged: number;
  lastBackup: string;
}

/**
 * Incremental backup: only uploads files whose content has changed.
 */
export async function backupToDrive(): Promise<BackupResult> {
  const meta = getMeta();

  // Refresh Drive file ID cache on first run or if stale
  if (Object.keys(meta.files).length === 0) {
    const existing = await listDriveFiles();
    for (const f of existing) meta.files[f.name] = f.id;
  }

  let updated = 0;
  let unchanged = 0;

  async function syncFile(name: string, content: string) {
    const hash = await sha256Hex(content);
    if (meta.hashes[name] === hash) { unchanged++; return; }
    const id = await uploadDriveFile(name, content, meta.files[name]);
    meta.files[name] = id;
    meta.hashes[name] = hash;
    updated++;
  }

  // Settings
  const settingsJson = JSON.stringify({
    theme: localStorage.getItem("bharti-theme") ?? "system",
    printSize: getPrintSize(),
    shopName: getShopName(),
    includeShopName: getIncludeShopName(),
  }, null, 2);
  await syncFile(SETTINGS_FILE, settingsJson);

  // Customers
  const customers = await db.customers.toArray();
  const activeNames = new Set<string>();
  for (const c of customers) {
    const sc = await serializeCustomer(c);
    const synced = attachSyncMetadata(sc, (meta.hashes[`${sc.id}.json`] ? undefined : 0));
    const fileName = `${sc.id}.json`; // e.g. customer_000001.json
    activeNames.add(fileName);
    await syncFile(fileName, JSON.stringify(synced, null, 2));
  }

  // Manifest (always update — timestamp changes)
  const manifest = {
    version: 1,
    lastBackup: new Date().toISOString(),
    customerCount: customers.length,
    files: meta.files,
    hashes: meta.hashes,
  };
  await syncFile(MANIFEST, JSON.stringify(manifest, null, 2));
  meta.lastBackup = manifest.lastBackup;
  saveMeta(meta);

  return { updated, unchanged, lastBackup: manifest.lastBackup };
}

export interface RestoreResult {
  customers: number;
  transactions: number;
}

/**
 * Downloads all backup files from Drive and rebuilds IndexedDB.
 * Existing local data is replaced.
 */
export async function restoreFromDrive(): Promise<RestoreResult> {
  const allFiles = await listDriveFiles();
  const byName = new Map(allFiles.map((f) => [f.name, f.id]));

  const manifestId = byName.get(MANIFEST);
  if (!manifestId) throw new Error("No backup found in your Google Drive App Data.");

  let customerCount = 0;
  let txCount = 0;

  await db.transaction("rw", db.customers, db.transactions, async () => {
    await db.transactions.clear();
    await db.customers.clear();

    for (const [name, fileId] of byName) {
      if (!name.startsWith("customer_")) continue;
      const raw = await downloadDriveFile(fileId);
      const sc = JSON.parse(raw);

      const customer: Customer = {
        id: sc.numericId,
        name: sc.name,
        mobileNumber: sc.mobileNumber,
        whatsappNumber: sc.whatsappNumber,
        createdAt: sc.createdAt,
        updatedAt: sc.updatedAt,
      };
      const id = await db.customers.put(customer);

      const txs = (sc.transactions ?? []).map((t: {
        serial: number; item: string; price: number; date: string; createdAt?: number;
      }) => ({
        customerId: id,
        serial: t.serial,
        item: t.item,
        price: t.price,
        date: t.date,
        createdAt: t.createdAt ?? Date.now(),
      }));

      if (txs.length) {
        await db.transactions.bulkAdd(txs);
        txCount += txs.length;
      }
      customerCount++;
    }
  });

  // Update local cache
  const newMeta: BackupMeta = {
    files: Object.fromEntries(byName),
    hashes: {},
    lastBackup: new Date().toISOString(),
  };
  saveMeta(newMeta);

  return { customers: customerCount, transactions: txCount };
}

/** Returns true if a backup manifest exists in Drive. */
export async function driveBackupExists(): Promise<boolean> {
  try {
    const files = await listDriveFiles();
    return files.some((f) => f.name === MANIFEST);
  } catch {
    return false;
  }
}

/** Returns the timestamp of the last successful Drive backup, or null. */
export function getLastDriveBackup(): string | null {
  return getMeta().lastBackup;
}

/** Check if Drive sync is possible (logged in + has Drive permission). */
export function canSyncDrive(): boolean {
  return hasDrivePermission();
}
