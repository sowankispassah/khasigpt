import type postgres from "postgres";
import { DatabaseOperationQueue } from "@/lib/db/operation-queue";
import { withTimeout } from "@/lib/utils/async";

type SqlClient = ReturnType<typeof postgres>;

/** Drizzle's Postgres.js adapter uses unsafe()/values() and begin(). Admit
 * those operations before the driver, so a stalled socket cannot swallow the
 * entire startup fan-out. Transactions keep their own reserved client.
 */
export function createManagedClient(create: () => SqlClient) {
  const queue = new DatabaseOperationQueue();
  let client = create();
  const options = client.options;
  let lastCompletedAt = 0;

  function recycle() {
    const unhealthy = client;
    client = create();
    // Drizzle installs date/JSON parsers on the initial client's options.
    Object.assign(client.options.parsers, options.parsers);
    Object.assign(client.options.serializers, options.serializers);
    lastCompletedAt = 0;
    void unhealthy.end({ timeout: 0 }).catch(() => undefined);
  }

  async function run<T>(operation: (sql: SqlClient) => PromiseLike<T>): Promise<T> {
    return queue.run(async () => {
      // Wall-clock time detects an idle/frozen function even when its socket
      // keepalive and idle timers did not run while Vercel suspended it.
      if (lastCompletedAt > 0 && Date.now() - lastCompletedAt > 1000) {
        try {
          await withTimeout(client.unsafe("select 1"), 1500);
        } catch {
          console.warn("[db.connection] Liveness check failed; replacing connection before query execution.");
          recycle();
          await withTimeout(client.unsafe("select 1"), 3000);
        }
      }
      try {
        // No writes or transactions are replayed after an uncertain result.
        return await withTimeout(Promise.resolve(operation(client)), 20_000);
      } catch (error) {
        if (error instanceof Error && /timeout|connection|socket|econn|epipe/i.test(error.message)) {
          recycle();
        }
        throw error;
      } finally {
        lastCompletedAt = Date.now();
      }
    }, 8000);
  }

  return new Proxy(client, {
    get(_target, key) {
      if (key === "options") return options;
      if (key === "unsafe") {
        return (...args: Parameters<SqlClient["unsafe"]>) => {
          let arrayRows = false;
          let pending: Promise<unknown> | undefined;
          const result = {
            values() { arrayRows = true; return result; },
            // biome-ignore lint/suspicious/noThenProperty: Drizzle requires Postgres.js's lazy, awaitable query contract.
            then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
              pending ??= run((sql) => {
                const query = sql.unsafe(...args);
                return arrayRows ? query.values() : query;
              });
              return pending.then(resolve, reject);
            },
          };
          return result;
        };
      }
      if (key === "begin") {
        return (callback: (sql: postgres.TransactionSql) => Promise<unknown>) =>
          run((sql) => sql.begin(callback));
      }
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

/** Preserve the configured connection budget while avoiding protocol
 * pipelining within a connection. Each lane owns exactly one connection. */
export function createManagedPool(create: () => SqlClient, size: number) {
  const lanes = Array.from({ length: Math.max(1, size) }, () => createManagedClient(create));
  const first = lanes[0];
  let index = 0;
  return new Proxy(first, {
    get(target, key) {
      if (key === "end") return (options: { timeout?: number }) => Promise.all(lanes.map((lane) => lane.end(options)));
      if (key === "unsafe" || key === "begin") {
        const lane = lanes[index++ % lanes.length];
        // Postgres.js connections retain the original parser objects. Copy
        // Drizzle's registrations after initialization; do not replace them.
        Object.assign(lane.options.parsers, first.options.parsers);
        Object.assign(lane.options.serializers, first.options.serializers);
        return Reflect.get(lane, key);
      }
      return Reflect.get(target, key);
    },
  });
}
