import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DatabaseOperationQueue } from "@/lib/db/operation-queue";
import { EXPLORE_ICON_NAMES, getExploreIcon } from "@/lib/explore/icons";
import { siteGateCannotBlockAdminConsole } from "@/proxy";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe("admin database admission queue", () => {
  test("runs up to its concurrency at once and starts the rest in order", async () => {
    const queue = new DatabaseOperationQueue({ concurrency: 2 });
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const task = (id: number) => async () => {
      started.push(id);
      running += 1;
      peak = Math.max(peak, running);
      await wait(20);
      running -= 1;
      return id;
    };

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((id) => queue.run(task(id), 1000))
    );
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(started).toEqual([1, 2, 3, 4, 5]);
  });

  test("defaults to fully serialized work", async () => {
    const queue = new DatabaseOperationQueue();
    let running = 0;
    let peak = 0;
    await Promise.all(
      [1, 2, 3].map(() =>
        queue.run(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await wait(10);
          running -= 1;
        }, 1000)
      )
    );
    expect(peak).toBe(1);
  });

  test("an operation whose wait expired never runs later", async () => {
    const queue = new DatabaseOperationQueue({ concurrency: 1 });
    let lateRan = false;
    const blocker = queue.run(() => wait(60), 1000);
    const late = queue.run(async () => {
      lateRan = true;
    }, 10);
    await expect(late).rejects.toThrow("queue wait expired");
    await blocker;
    await wait(20);
    expect(lateRan).toBe(false);
  });

  test("a failing or synchronously throwing operation frees its slot", async () => {
    const queue = new DatabaseOperationQueue({ concurrency: 1 });
    await expect(
      queue.run(() => {
        throw new Error("sync failure");
      }, 1000)
    ).rejects.toThrow("sync failure");
    await expect(queue.run(() => Promise.reject(new Error("async failure")), 1000)).rejects.toThrow("async failure");
    await expect(queue.run(async () => "next", 1000)).resolves.toBe("next");
  });

  test("admin connections are retired only after their in-flight work settles", async () => {
    const source = await readFile("lib/db/admin-database.ts", "utf8");
    expect(source).toContain("concurrency: getAdminPoolSize()");
    expect(source).toContain("max: getAdminPoolSize()");
    expect(source).toContain("if (expectedState.inFlight === 0)");
    expect(source).toContain("if (state.retired && state.inFlight === 0)");
  });
});

test("admin console skips the gate check only on a fresh, non-blocking status", () => {
  // Nothing cached yet in this process: the verified-session path must run.
  expect(siteGateCannotBlockAdminConsole()).toBe(false);
});

test("explore icons resolve curated names and fall back for unknown ones", () => {
  expect(EXPLORE_ICON_NAMES).toContain("Compass");
  expect(EXPLORE_ICON_NAMES).toContain("MapPin");
  expect(getExploreIcon("MapPin")).not.toBe(getExploreIcon("Compass"));
  expect(getExploreIcon("NotARealIcon")).toBe(getExploreIcon("Compass"));
  expect(getExploreIcon(null)).toBe(getExploreIcon("Compass"));
});
