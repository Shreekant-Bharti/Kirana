// Incremental backup manager using the File System Access API.
// One directory. One file per customer. Only modified files are rewritten.

import { db, metaGet, metaSet, customerFileId } from "../db";
import { serializeCustomer, sha256Hex } from "./customerSerializer";
import { APP_VERSION, BACKUP_VERSION, type BackupManifest, type BackupSettings } from "./manifest";

const DIR_HANDLE_KEY = "backup:dirHandle";
const HASHES_KEY = "backup:hashes"; // Record<customerFileId, sha256>
const LAST_BACKUP_KEY = "backup:lastBackup"; // ISO string

type Hashes = Record<string, string>;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const h = await metaGet<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
  return h ?? null;
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  // @ts-expect-error non-standard
  if ((await handle.queryPermission?.({ mode: "readwrite" })) === "granted") return true;
  // @ts-expect-error non-standard
  return (await handle.requestPermission?.({ mode: "readwrite" })) === "granted";
}

export async function pickBackupDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error("Your browser does not support folder backups. Use Chrome, Edge, or another Chromium browser.");
  }
  // @ts-expect-error FSA
  const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
    id: "bharti-udhari-backup",
    mode: "readwrite",
    startIn: "documents",
  });
  await metaSet(DIR_HANDLE_KEY, handle);
  return handle;
}

export async function clearBackupDirectory(): Promise<void> {
  await metaSet(DIR_HANDLE_KEY, null);
  await metaSet(HASHES_KEY, {});
}

async function getOrCreateDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeJson(dir: FileSystemDirectoryHandle, name: string, content: string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

async function removeIfExists(dir: FileSystemDirectoryHandle, name: string) {
  try {
    await dir.removeEntry(name);
  } catch {
    /* ignore */
  }
}

export interface BackupResult {
  updated: number;
  removed: number;
  unchanged: number;
  totalCustomers: number;
  totalTransactions: number;
  lastBackup: string;
}

export async function backupNow(settings: BackupSettings): Promise<BackupResult> {
  let root = await getSavedDirectoryHandle();
  if (!root) root = await pickBackupDirectory();
  if (!(await ensurePermission(root))) throw new Error("Permission to write backup folder was denied.");

  const appDir = await getOrCreateDir(root, "Bharti_Udhari_Backup");
  const customersDir = await getOrCreateDir(appDir, "customers");

  const customers = await db.customers.toArray();
  const allTxs = await db.transactions.toArray();
  const txByCustomer = new Map<number, typeof allTxs>();
  for (const t of allTxs) {
    const list = txByCustomer.get(t.customerId) ?? [];
    list.push(t);
    txByCustomer.set(t.customerId, list);
  }

  const prevHashes = (await metaGet<Hashes>(HASHES_KEY)) ?? {};
  const newHashes: Hashes = {};
  const currentFileNames = new Set<string>();
  let updated = 0;
  let unchanged = 0;

  for (const c of customers) {
    if (c.id == null) continue;
    const fileId = customerFileId(c.id);
    const filename = `${fileId}.json`;
    currentFileNames.add(filename);

    const payload = await serializeCustomer(c, txByCustomer.get(c.id));
    const json = JSON.stringify(payload, null, 2);
    const hash = await sha256Hex(json);
    newHashes[fileId] = hash;

    if (prevHashes[fileId] === hash) {
      unchanged++;
      continue;
    }
    await writeJson(customersDir, filename, json);
    updated++;
  }

  // Remove files for deleted customers
  let removed = 0;
  for (const fileId of Object.keys(prevHashes)) {
    const filename = `${fileId}.json`;
    if (!currentFileNames.has(filename)) {
      await removeIfExists(customersDir, filename);
      removed++;
    }
  }

  const lastBackup = new Date().toISOString();
  const manifest: BackupManifest = {
    appVersion: APP_VERSION,
    backupVersion: BACKUP_VERSION,
    lastBackup,
    totalCustomers: customers.length,
    totalTransactions: allTxs.length,
    customerFiles: [...currentFileNames].sort(),
  };
  await writeJson(appDir, "manifest.json", JSON.stringify(manifest, null, 2));
  await writeJson(appDir, "settings.json", JSON.stringify(settings, null, 2));

  await metaSet(HASHES_KEY, newHashes);
  await metaSet(LAST_BACKUP_KEY, lastBackup);

  return {
    updated,
    removed,
    unchanged,
    totalCustomers: customers.length,
    totalTransactions: allTxs.length,
    lastBackup,
  };
}

export async function getLastBackupTime(): Promise<string | null> {
  return (await metaGet<string>(LAST_BACKUP_KEY)) ?? null;
}
