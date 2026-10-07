/** Admit work before it reaches a shared recoverable connection. A queued
 * request that expires must never execute later, and recycling a connection
 * must never interrupt another operation already using it.
 * Each admitted operation must enforce its own execution deadline.
 *
 * `concurrency` bounds how many admitted operations run at once (default 1,
 * fully serialized). Callers that raise it must size their pool to match and
 * retire a connection only after its in-flight operations finish.
 */
export class DatabaseOperationQueue {
  private readonly concurrency: number;
  private running = 0;
  private readonly pending: Array<{ isExpired: () => boolean; start: () => void }> = [];

  constructor({ concurrency = 1 }: { concurrency?: number } = {}) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
  }

  run<T>(operation: () => Promise<T>, waitMs: number): Promise<T> {
    if (this.pending.length >= 64) {
      return Promise.reject(new Error("Database operation queue is full"));
    }

    return new Promise<T>((resolve, reject) => {
      let expired = false;
      const entry = {
        isExpired: () => expired,
        start: () => {
          clearTimeout(timer);
          this.running += 1;
          Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => {
              this.running -= 1;
              this.drain();
            });
        },
      };
      const timer = setTimeout(() => {
        const index = this.pending.indexOf(entry);
        if (index === -1) return;
        expired = true;
        this.pending.splice(index, 1);
        reject(new Error("Database operation queue wait expired"));
      }, waitMs);

      this.pending.push(entry);
      this.drain();
    });
  }

  private drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (next && !next.isExpired()) next.start();
    }
  }
}
