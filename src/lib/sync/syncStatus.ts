/**
 * Reactive Sync Status — observable sync state for React components.
 * Uses useSyncExternalStore for tear-free reads.
 */

import { useSyncExternalStore } from "react";

export type SyncState = "synced" | "pending" | "syncing" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncTime: string | null;
  error?: string;
}

const LAST_SYNC_KEY = "bharti-last-sync";

// ── Internal state ───────────────────────────────────────────────────────────

let currentStatus: SyncStatus = {
  state: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "synced",
  pendingCount: 0,
  lastSyncTime:
    typeof window !== "undefined" ? localStorage.getItem(LAST_SYNC_KEY) : null,
};

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function updateSyncStatus(partial: Partial<SyncStatus>): void {
  currentStatus = { ...currentStatus, ...partial };
  if (partial.lastSyncTime) {
    try {
      localStorage.setItem(LAST_SYNC_KEY, partial.lastSyncTime);
    } catch { /* quota exceeded — ignore */ }
  }
  emitChange();
}

export function setOnline(): void {
  if (currentStatus.state === "offline") {
    updateSyncStatus({
      state: currentStatus.pendingCount > 0 ? "pending" : "synced",
    });
  }
}

export function setOffline(): void {
  updateSyncStatus({ state: "offline" });
}

export function setSyncing(): void {
  updateSyncStatus({ state: "syncing" });
}

export function setSynced(lastSyncTime: string): void {
  updateSyncStatus({ state: "synced", pendingCount: 0, lastSyncTime, error: undefined });
}

export function setSyncError(error: string): void {
  updateSyncStatus({ state: "error", error });
}

export function setPendingCount(count: number): void {
  updateSyncStatus({
    pendingCount: count,
    state:
      count > 0 && currentStatus.state !== "syncing" && currentStatus.state !== "offline"
        ? "pending"
        : currentStatus.state,
  });
}

// ── React hook ───────────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SyncStatus {
  return currentStatus;
}

function getServerSnapshot(): SyncStatus {
  return {
    state: "synced",
    pendingCount: 0,
    lastSyncTime: null,
  };
}

/** React hook — returns current sync status, reactively updates on changes. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
