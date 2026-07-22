/**
 * Sync Engine — the core orchestrator for offline-first auto-sync.
 *
 * Responsibilities:
 * - Process the sync queue (upload pending changes to Drive)
 * - Pull changes from cloud (for multi-device sync)
 * - Debounce sync operations
 * - Handle errors with retry
 * - Update sync status reactively
 */

import { hasDrivePermission, getSession } from "../googleAuth";
import {
  uploadSingleCustomer,
  deleteDriveCustomer,
  backupToDrive,
  canSyncDrive,
} from "../driveBackup";
import {
  getPendingTasks,
  getPendingCount,
  markSyncing,
  markCompleted,
  markFailed,
  clearStuckTasks,
} from "./syncQueue";
import {
  setSyncing,
  setSynced,
  setSyncError,
  setPendingCount,
  setOffline,
  setOnline,
  getSyncStatus,
} from "./syncStatus";

// ── Singleton state ──────────────────────────────────────────────────────────

let syncInProgress = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 2_000; // Wait 2s after last change before syncing
const PERIODIC_SYNC_MS = 5 * 60_000; // Check every 5 minutes
let periodicTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/** Schedule a sync after a short debounce. Called after every local data change. */
export function scheduleSync(): void {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    processQueue();
  }, SYNC_DEBOUNCE_MS);

  // Immediately update pending count
  getPendingCount().then(setPendingCount).catch(() => {});
}

/** Process the entire sync queue immediately. */
export async function processQueue(): Promise<void> {
  // Pre-flight checks
  if (syncInProgress) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setOffline();
    return;
  }
  if (!getSession()) return;
  if (!canSyncDrive()) return;

  syncInProgress = true;
  setSyncing();

  try {
    // Clear any stuck tasks from previous sessions
    await clearStuckTasks();

    const tasks = await getPendingTasks();
    if (tasks.length === 0) {
      setSynced(new Date().toISOString());
      return;
    }

    let hasError = false;

    for (const task of tasks) {
      if (task.id == null) continue;

      try {
        await markSyncing(task.id);

        if (task.action === "delete") {
          await deleteDriveCustomer(task.customerId);
        } else {
          await uploadSingleCustomer(task.customerId);
        }

        await markCompleted(task.id);
      } catch (err) {
        console.warn(`Sync failed for customer ${task.customerId}:`, err);
        await markFailed(task.id);
        hasError = true;

        // If it's a network error, stop processing (will retry later)
        if (isNetworkError(err)) {
          setOffline();
          return;
        }
      }
    }

    // Update status
    const remaining = await getPendingCount();
    if (remaining === 0 && !hasError) {
      setSynced(new Date().toISOString());
    } else if (hasError) {
      setSyncError(`${remaining} changes failed to sync`);
    } else {
      setPendingCount(remaining);
    }
  } catch (err) {
    console.error("Sync queue processing error:", err);
    setSyncError(err instanceof Error ? err.message : "Sync failed");
  } finally {
    syncInProgress = false;
  }
}

/**
 * Full sync — uploads all pending changes AND updates manifest.
 * Used by the "Sync Now" button.
 */
export async function fullSync(): Promise<{ updated: number; unchanged: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("No internet connection");
  }
  if (!getSession()) {
    throw new Error("Not signed in");
  }

  syncInProgress = true;
  setSyncing();

  try {
    // First, process the granular queue
    await clearStuckTasks();
    const tasks = await getPendingTasks();

    for (const task of tasks) {
      if (task.id == null) continue;
      try {
        await markSyncing(task.id);
        if (task.action === "delete") {
          await deleteDriveCustomer(task.customerId);
        } else {
          await uploadSingleCustomer(task.customerId);
        }
        await markCompleted(task.id);
      } catch (err) {
        await markFailed(task.id);
        throw err;
      }
    }

    // Then do a full incremental backup (catches any settings changes, manifest update)
    const result = await backupToDrive();
    setSynced(result.lastBackup);

    return { updated: result.updated, unchanged: result.unchanged };
  } catch (err) {
    setSyncError(err instanceof Error ? err.message : "Sync failed");
    throw err;
  } finally {
    syncInProgress = false;
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/** Initialize sync engine — call once on app start. */
export function initSyncEngine(): void {
  if (typeof window === "undefined") return;

  // Listen for online/offline
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Listen for visibility change (user returns to app)
  document.addEventListener("visibilitychange", handleVisibility);

  // Start periodic sync
  periodicTimer = setInterval(handlePeriodicSync, PERIODIC_SYNC_MS);

  // Initial status check
  if (!navigator.onLine) {
    setOffline();
  } else {
    // Update pending count on start
    getPendingCount().then((count) => {
      if (count > 0) {
        setPendingCount(count);
        // Auto-sync pending items on app start
        scheduleSync();
      }
    }).catch(() => {});
  }
}

/** Tear down sync engine — call on unmount. */
export function destroySyncEngine(): void {
  if (typeof window === "undefined") return;

  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  document.removeEventListener("visibilitychange", handleVisibility);

  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
}

// ── Internal handlers ────────────────────────────────────────────────────────

function handleOnline(): void {
  setOnline();
  // Attempt to sync when coming back online
  scheduleSync();
}

function handleOffline(): void {
  setOffline();
}

function handleVisibility(): void {
  if (document.visibilityState === "visible" && navigator.onLine) {
    // User returned to app — check for pending syncs
    scheduleSync();
  }
}

function handlePeriodicSync(): void {
  if (document.visibilityState !== "visible") return;
  if (!navigator.onLine) return;
  if (syncInProgress) return;

  getPendingCount().then((count) => {
    if (count > 0) processQueue();
  }).catch(() => {});
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes("fetch")) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("network") || msg.includes("offline") || msg.includes("failed to fetch");
  }
  return false;
}
