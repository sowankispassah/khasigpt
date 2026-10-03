/** Admit work before it reaches a shared recoverable connection. A queued
 * request that expires must never execute later, and recycling a connection
 * must never interrupt another operation already using it.
 * Each admitted operation must enforce its own execution deadline.
 */
export class DatabaseOperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;

  run<T>(operation: () => Promise<T>, waitMs: number): Promise<T> {
    if (this.waiting >= 64) {
      return Promise.reject(new Error("Database operation queue is full"));
    }
    this.waiting += 1;
    let expired = false;
    let started = false;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!started) {
          expired = true;
          this.waiting -= 1;
          reject(new Error("Database operation queue wait expired"));
        }
      }, waitMs);

      const queued = this.tail.then(async () => {
        if (expired) return;
        started = true;
        this.waiting -= 1;
        clearTimeout(timer);
        try {
          resolve(await operation());
        } catch (error) {
          reject(error);
        }
      });
      this.tail = queued;
    });
  }
}
