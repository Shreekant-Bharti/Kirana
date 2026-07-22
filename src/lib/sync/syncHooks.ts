/**
 * React hooks for sync integration.
 * Thin wrappers that components call after local data changes.
 */

import { useCallback } from "react";
import { enqueueSync } from "./syncQueue";
import { scheduleSync } from "./syncEngine";
import { canSyncDrive } from "../driveBackup";
import { useSyncStatus } from "./syncStatus";
import type { SyncStatus } from "./syncStatus";

// Re-export useSyncStatus for convenience
export { useSyncStatus } from "./syncStatus";
export type { SyncStatus } from "./syncStatus";

/**
 * Returns a `notifyChange` function that should be called after
 * any local IndexedDB write (add/edit/delete customer or transaction).
 *
 * It enqueues a sync task and schedules background sync.
 * If Drive sync is not available (no permission, not logged in),
 * it silently does nothing — the data is safely in IndexedDB.
 */
export function useSyncTrigger(): {
  notifyChange: (customerId: number, action?: "upsert" | "delete") => void;
} {
  const notifyChange = useCallback(
    (customerId: number, action: "upsert" | "delete" = "upsert") => {
      if (!canSyncDrive()) return;

      // Fire and forget — never block the UI
      enqueueSync(customerId, action)
        .then(() => scheduleSync())
        .catch((err) => console.warn("Failed to enqueue sync task:", err));
    },
    [],
  );

  return { notifyChange };
}
