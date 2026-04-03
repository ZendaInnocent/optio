/**
 * Simple async mutex for serializing task claim operations.
 *
 * The task worker receives jobs from BullMQ which may arrive concurrently
 * (e.g. after a restart). This lock ensures only one claim operation runs
 * at a time, preventing state races on the same task.
 */
export interface ClaimLock {
  acquire(taskId: string, fn: () => Promise<void>): Promise<void>;
}

export function createClaimLock(): ClaimLock {
  let promise: Promise<void> | null = null;

  return {
    async acquire(taskId: string, fn: () => Promise<void>): Promise<void> {
      const prev = promise ?? Promise.resolve();
      const current = prev.then(
        () => fn(),
        () => fn(),
      );
      promise = current.catch(() => {});
      await current;
    },
  };
}
