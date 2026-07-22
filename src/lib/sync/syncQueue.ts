/**
 * Persistent Sync Queue — stored in IndexedDB (syncQueue table).
 * Tracks which customers need to be synced to Google Drive.
 * Tasks survive app restarts. Deduplicated by customerId.
 */

import { db, type SyncTask } from "../db";

// ── Queue operations ─────────────────────────────────────────────────────────

/** Add or update a sync task for a customer. Deduplicates by customerId. */
export async function enqueueSync(
  customerId: number,
  action: "upsert" | "delete" = "upsert",
): Promise<void> {
  // Check if there's already a pending/failed task for this customer
  const existing = await db.syncQueue
    .where("customerId")
    .equals(customerId)
    .filter((t) => t.status === "pending" || t.status === "failed")
    .first();

  if (existing?.id != null) {
    // Update existing task instead of creating a duplicate
    await db.syncQueue.update(existing.id, {
      action,
      createdAt: Date.now(),
      attempts: 0,
      lastAttempt: undefined,
      status: "pending",
    });
  } else {
    await db.syncQueue.add({
      customerId,
      action,
      createdAt: Date.now(),
      attempts: 0,
      status: "pending",
    });
  }
}

/** Get all pending tasks (pending or failed with retries remaining). */
export async function getPendingTasks(): Promise<SyncTask[]> {
  const MAX_ATTEMPTS = 5;
  return db.syncQueue
    .where("status")
    .anyOf(["pending", "failed"])
    .filter((t) => t.attempts < MAX_ATTEMPTS)
    .toArray();
}

/** Get count of pending tasks. */
export async function getPendingCount(): Promise<number> {
  return db.syncQueue
    .where("status")
    .anyOf(["pending", "failed"])
    .count();
}

/** Mark a task as syncing (in progress). */
export async function markSyncing(taskId: number): Promise<void> {
  await db.syncQueue.update(taskId, {
    status: "syncing",
    lastAttempt: Date.now(),
  });
}

/** Mark a task as completed and remove it. */
export async function markCompleted(taskId: number): Promise<void> {
  await db.syncQueue.delete(taskId);
}

/** Mark a task as failed (will be retried). */
export async function markFailed(taskId: number): Promise<void> {
  const task = await db.syncQueue.get(taskId);
  if (!task) return;
  await db.syncQueue.update(taskId, {
    status: "failed",
    attempts: task.attempts + 1,
    lastAttempt: Date.now(),
  });
}

/** Clear all completed/orphaned syncing tasks. */
export async function clearStuckTasks(): Promise<void> {
  // Tasks stuck in "syncing" for more than 5 minutes are reset to pending
  const STUCK_THRESHOLD = 5 * 60_000;
  const now = Date.now();
  const stuckTasks = await db.syncQueue
    .where("status")
    .equals("syncing")
    .filter((t) => t.lastAttempt != null && now - t.lastAttempt! > STUCK_THRESHOLD)
    .toArray();

  for (const t of stuckTasks) {
    if (t.id != null) {
      await db.syncQueue.update(t.id, { status: "pending" });
    }
  }
}

/** Clear the entire queue (used on logout). */
export async function clearQueue(): Promise<void> {
  await db.syncQueue.clear();
}
