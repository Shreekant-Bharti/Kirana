/**
 * Conflict Resolver — handles multi-device data conflicts.
 * Strategy: "Latest Version Wins" at the customer level.
 * Transactions within a customer are merged (union by serial+createdAt key).
 */

import type { SerializedCustomer, SerializedTx } from "../backup/customerSerializer";

// ── Device ID ────────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = "bharti-device-id";

function generateDeviceId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "device_";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ── Enhanced customer metadata for sync ──────────────────────────────────────

export interface SyncMetadata {
  syncVersion: number;
  lastDeviceId: string;
  lastSyncTime: number;
}

export type SyncedCustomer = SerializedCustomer & Partial<SyncMetadata>;

/** Attach sync metadata to a serialized customer before upload. */
export function attachSyncMetadata(
  customer: SerializedCustomer,
  existingSyncVersion?: number,
): SyncedCustomer {
  return {
    ...customer,
    syncVersion: (existingSyncVersion ?? 0) + 1,
    lastDeviceId: getDeviceId(),
    lastSyncTime: Date.now(),
  };
}

// ── Conflict detection ───────────────────────────────────────────────────────

export interface ConflictResult {
  hasConflict: boolean;
  winner: "local" | "cloud" | "merge";
  merged?: SyncedCustomer;
}

/**
 * Detect and resolve conflicts between local and cloud versions.
 * Returns which version should be used and optionally a merged result.
 */
export function resolveConflict(
  local: SerializedCustomer,
  cloud: SyncedCustomer,
  lastKnownSyncTime: number,
): ConflictResult {
  // No conflict if cloud hasn't changed since our last sync
  if (cloud.lastSyncTime != null && cloud.lastSyncTime <= lastKnownSyncTime) {
    return { hasConflict: false, winner: "local" };
  }

  // Both modified since last sync — conflict!
  // Strategy: merge transactions, latest customer metadata wins
  const localUpdatedAt = local.updatedAt ?? 0;
  const cloudUpdatedAt = cloud.updatedAt ?? 0;

  // Merge transactions — union by composite key (serial + createdAt)
  const mergedTxs = mergeTransactions(local.transactions, cloud.transactions);

  // Customer-level metadata: latest wins
  const baseCustomer = localUpdatedAt >= cloudUpdatedAt ? local : cloud;

  const merged: SyncedCustomer = {
    ...baseCustomer,
    transactions: mergedTxs,
    updatedAt: Math.max(localUpdatedAt, cloudUpdatedAt),
    syncVersion: ((cloud.syncVersion ?? 0) + 1),
    lastDeviceId: getDeviceId(),
    lastSyncTime: Date.now(),
  };

  return {
    hasConflict: true,
    winner: "merge",
    merged,
  };
}

// ── Transaction merging ──────────────────────────────────────────────────────

function txKey(t: SerializedTx): string {
  return `${t.serial}_${t.createdAt}`;
}

/**
 * Merge two sets of transactions.
 * Uses serial+createdAt as a composite unique key.
 * If both sides have the same key, keep the one with the latest createdAt.
 * Result is sorted by serial.
 */
function mergeTransactions(
  localTxs: SerializedTx[],
  cloudTxs: SerializedTx[],
): SerializedTx[] {
  const map = new Map<string, SerializedTx>();

  // Cloud first, then local overwrites where keys match
  for (const t of cloudTxs) {
    map.set(txKey(t), t);
  }
  for (const t of localTxs) {
    const key = txKey(t);
    const existing = map.get(key);
    if (!existing || t.createdAt >= existing.createdAt) {
      map.set(key, t);
    }
  }

  // Re-sort by serial and re-number
  const sorted = [...map.values()].sort((a, b) => a.serial - b.serial);
  return sorted.map((t, i) => ({ ...t, serial: i + 1 }));
}
