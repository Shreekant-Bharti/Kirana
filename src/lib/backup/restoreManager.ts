// Restore from a Bharti_Udhari_Backup directory.
import { db, metaSet, parseCustomerFileId, type Customer, type Transaction } from "../db";
import type { SerializedCustomer } from "./customerSerializer";
import type { BackupManifest, BackupSettings } from "./manifest";
import { sha256Hex } from "./customerSerializer";
import { isFileSystemAccessSupported } from "./backupManager";

export interface RestoreResult {
  customers: number;
  transactions: number;
  settings: BackupSettings | null;
}

async function readJson<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

async function pickRestoreDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error("Your browser does not support folder restore. Use Chrome, Edge, or another Chromium browser.");
  }
  // @ts-expect-error FSA
  return window.showDirectoryPicker({ id: "bharti-udhari-backup", mode: "readwrite", startIn: "documents" });
}

/** Locate the backup dir: accept either the parent (containing Bharti_Udhari_Backup) or the backup dir itself. */
async function resolveBackupRoot(handle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  // If handle itself has manifest.json, use it.
  try {
    await handle.getFileHandle("manifest.json");
    return handle;
  } catch {
    /* fall through */
  }
  try {
    return await handle.getDirectoryHandle("Bharti_Udhari_Backup");
  } catch {
    throw new Error("Selected folder does not contain a Bharti_Udhari_Backup.");
  }
}

export async function restoreFromDirectory(): Promise<RestoreResult> {
  const picked = await pickRestoreDirectory();
  const appDir = await resolveBackupRoot(picked);

  const manifest = await readJson<BackupManifest>(appDir, "manifest.json");
  if (!manifest) throw new Error("manifest.json missing or invalid.");
  const settings = await readJson<BackupSettings>(appDir, "settings.json");

  const customersDir = await appDir.getDirectoryHandle("customers");

  const serialized: SerializedCustomer[] = [];
  const entries = (customersDir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
  for await (const [name, entry] of entries) {
    if (entry.kind !== "file" || !name.endsWith(".json")) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    try {
      serialized.push(JSON.parse(await file.text()) as SerializedCustomer);
    } catch {
      /* skip corrupt file */
    }
  }

  // Rewrite IndexedDB atomically.
  const hashes: Record<string, string> = {};
  await db.transaction("rw", db.customers, db.transactions, async () => {
    await db.transactions.clear();
    await db.customers.clear();
    for (const sc of serialized) {
      const numericId = sc.numericId ?? parseCustomerFileId(sc.id) ?? undefined;
      const customer: Customer = {
        id: numericId,
        name: sc.name,
        mobileNumber: sc.mobileNumber,
        whatsappNumber: sc.whatsappNumber,
        createdAt: sc.createdAt,
        updatedAt: sc.updatedAt,
      };
      const id = await db.customers.put(customer);
      const txs: Transaction[] = (sc.transactions ?? []).map((t) => ({
        customerId: id,
        serial: t.serial,
        item: t.item,
        price: t.price,
        date: t.date,
        createdAt: t.createdAt ?? Date.now(),
      }));
      if (txs.length) await db.transactions.bulkAdd(txs);
    }
  });

  // Refresh hashes so next incremental backup only writes real deltas.
  for (const sc of serialized) {
    const json = JSON.stringify(sc, null, 2);
    hashes[sc.id] = await sha256Hex(json);
  }
  await metaSet("backup:hashes", hashes);
  await metaSet("backup:lastBackup", manifest.lastBackup);

  const totalTx = serialized.reduce((s, c) => s + (c.transactions?.length ?? 0), 0);
  return { customers: serialized.length, transactions: totalTx, settings };
}
