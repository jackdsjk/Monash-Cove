import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type CoveDatabase } from "../db.js";
import { CacheIdentityChangedError, ResourceCache, type CacheScope } from "../resource-cache.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const databases: CoveDatabase[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });
function database(path = ":memory:"): CoveDatabase {
  const db = createDatabase({ dbPath: path, seed: false });
  databases.push(db);
  return db;
}
const scope: CacheScope = { source: "moodle", identity: "account-a", resource: "grades:v1", ttlMs: 1000, currentIdentity: async () => "account-a" };

describe("account-scoped resource snapshots", () => {
  it("merges concurrent reads and caches a successful empty result", async () => {
    const db = database();
    const cache = new ResourceCache(db);
    const gate = deferred<{ data: string[] }>();
    const load = vi.fn(() => gate.promise);
    const first = cache.read(scope, load);
    const second = cache.read(scope, load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    gate.resolve({ data: [] });
    expect((await first).data).toEqual([]);
    expect((await second).data).toEqual([]);
    expect((await cache.read(scope, load)).data).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns stale data during one refresh and preserves success time on failure", async () => {
    const db = database();
    let clock = Date.parse("2026-11-10T00:00:00Z");
    const cache = new ResourceCache(db, () => clock);
    const first = await cache.read(scope, async () => ({ data: [1] }));
    clock += 2000;
    const gate = deferred<{ data: number[] }>();
    const load = vi.fn(() => gate.promise);
    const stale = await cache.read(scope, load);
    expect(stale.data).toEqual([1]);
    expect(stale.cache).toMatchObject({ refreshing: true, stale: true, fetchedAt: first.cache.fetchedAt });
    await cache.read(scope, load);
    expect(load).toHaveBeenCalledTimes(1);
    gate.reject(new Error("fixture outage"));
    await vi.waitFor(() => expect(db.getResourceSnapshot("moodle", "account-a", "grades:v1")?.error).toBe("fixture outage"));
    const failed = await cache.read(scope, load);
    expect(failed.cache).toMatchObject({ error: "fixture outage", fetchedAt: first.cache.fetchedAt, refreshing: false });
    expect(load).toHaveBeenCalledTimes(1);
    const retried = await cache.read({ ...scope, force: true }, async () => ({ data: [2] }));
    expect(retried.data).toEqual([2]);
    expect(retried.cache.error).toBeNull();
  });

  it("retains persisted snapshots across service restart without loading upstream", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cove-snapshot-"));
    const firstDb = createDatabase({ dbPath: join(directory, "cache.sqlite"), seed: false });
    try {
      await new ResourceCache(firstDb).read(scope, async () => ({ data: ["stored"] }));
      firstDb.close();
      const nextDb = createDatabase({ dbPath: join(directory, "cache.sqlite"), seed: false });
      try {
        const load = vi.fn(async () => ({ data: ["remote"] }));
        expect((await new ResourceCache(nextDb).read(scope, load)).data).toEqual(["stored"]);
        expect(load).not.toHaveBeenCalled();
        nextDb.clearAll({ keepConnections: true });
        expect(nextDb.getResourceSnapshot("moodle", "account-a", "grades:v1")).toBeNull();
      } finally { nextDb.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("returns a refresh published while the final identity check was waiting", async () => {
    const db = database();
    let clock = Date.parse("2026-11-10T00:00:00Z");
    const cache = new ResourceCache(db, () => clock);
    await cache.read(scope, async () => ({ data: [1] }));
    clock += 2000;
    const gate = deferred<void>();
    let identityReads = 0;
    const pending = cache.read({ ...scope, currentIdentity: async () => {
      if (++identityReads === 2) await gate.promise;
      return "account-a";
    } }, async () => ({ data: [2] }));
    await vi.waitFor(() => expect(db.getResourceSnapshot("moodle", "account-a", "grades:v1")?.data).toEqual([2]));
    gate.resolve();
    const result = await pending;
    expect(result.data).toEqual([2]);
    expect(result.cache).toMatchObject({ refreshing: false, stale: false });
  });

  it("rejects late writes after account changes, explicit invalidation, or close", async () => {
    for (const action of ["identity", "invalidate", "close"]) {
      const db = database();
      const cache = new ResourceCache(db);
      let identity = "account-a";
      const gate = deferred<{ data: string[] }>();
      const load = vi.fn(() => gate.promise);
      const pending = cache.read({ ...scope, currentIdentity: async () => identity }, load);
      const outcome = pending.catch((error: unknown) => error);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      if (action === "identity") identity = "account-b";
      if (action === "invalidate") cache.invalidate("moodle");
      if (action === "close") cache.close();
      gate.resolve({ data: ["old account"] });
      expect(await outcome).toBeInstanceOf(CacheIdentityChangedError);
      expect(db.getResourceSnapshot("moodle", "account-a", "grades:v1")).toBeNull();
    }
  });
});
