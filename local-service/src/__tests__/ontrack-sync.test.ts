import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type CoveDatabase } from "../db.js";
import * as ontrack from "../sources/ontrack.js";
import { syncOnTrack } from "../sync/ontrack.js";

vi.mock("../sources/ontrack.js", async (original) => ({
  ...await original<typeof import("../sources/ontrack.js")>(),
  onTrackCacheIdentity: vi.fn(), fetchOnTrackAccount: vi.fn(),
  fetchOnTrackProjects: vi.fn(), fetchOnTrackTasks: vi.fn(), fetchOnTrackComments: vi.fn(),
}));

const account: ontrack.OnTrackAccount = {
  userId: 1, baseUrl: "https://ontrack.example.invalid/api", username: "fixture",
  firstName: "", lastName: "", email: "", expiresAt: null, refreshedAt: null,
};
const project = { id: 10, unitId: 20, unitCode: "UNIT", unitName: "Fixture" };
const task: ontrack.OnTrackTask = {
  id: 30, taskDefinitionId: 40, isInstantiated: true, visibility: "within_target",
  abbreviation: "1.1P", name: "Fixture task", description: "", status: "working_on_it",
  dueDate: "2026-11-20", targetDueDate: null, submissionDate: null, completionDate: null,
  weighting: null, timesAssessed: 0, numNewComments: 0,
};
let db: CoveDatabase;
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "cove-ontrack-sync-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", directory);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked"); }));
  vi.mocked(ontrack.onTrackCacheIdentity).mockResolvedValue("fixture-identity");
  vi.mocked(ontrack.fetchOnTrackAccount).mockResolvedValue(account);
  vi.mocked(ontrack.fetchOnTrackProjects).mockResolvedValue([project]);
  vi.mocked(ontrack.fetchOnTrackTasks).mockResolvedValue([task]);
  vi.mocked(ontrack.fetchOnTrackComments).mockResolvedValue([
    { id: "old", type: "text", comment: "Old feedback", authorId: 2, authorName: "Fixture", createdAt: new Date(Date.now() - 100 * 86400_000).toISOString() },
    { id: "recent", type: "assessment", comment: "Recent assessment", authorId: 2, authorName: "Fixture", createdAt: new Date().toISOString() },
    { id: "own", type: "text", comment: "Own message", authorId: 1, authorName: "Fixture", createdAt: new Date().toISOString() },
  ]);
  db = createDatabase({ dbPath: ":memory:" });
});

afterEach(() => {
  db.close(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("OnTrack feedback backfill", () => {
  it("bypasses incremental retention and scanned flags on every explicit backfill, without duplicates", async () => {
    expect(await syncOnTrack(db, account)).toMatchObject({ tasks: 1, feedback: 1 });
    await syncOnTrack(db, account);
    expect(ontrack.fetchOnTrackComments).toHaveBeenCalledTimes(1);
    const onProgress = vi.fn();
    expect(await syncOnTrack(db, account, { full: true, onProgress })).toMatchObject({ tasks: 1, feedback: 2 });
    await syncOnTrack(db, account, { full: true });
    expect(ontrack.fetchOnTrackComments).toHaveBeenCalledTimes(3);
    expect(db.listItems()).toHaveLength(3);
    expect(db.getItem("ontrack:feedback:old")?.text).toBe("Old feedback");
    expect(db.getItem("ontrack:feedback:own")).toBeNull();
    expect(onProgress.mock.calls).toEqual([[0, 1], [1, 1]]);
    expect(db.getItem("ontrack:task:30")?.url).toBe("https://ontrack.example.invalid/#/projects/10/tasks/40");
  });

  it("isolates scan flags by project and account", async () => {
    vi.mocked(ontrack.fetchOnTrackProjects).mockResolvedValue([project, { ...project, id: 11 }]);
    await syncOnTrack(db, account);
    expect(vi.mocked(ontrack.fetchOnTrackComments).mock.calls).toEqual([[10, 40], [11, 40]]);
    const secondAccount = { ...account, userId: 3 };
    vi.mocked(ontrack.fetchOnTrackAccount).mockResolvedValue(secondAccount);
    vi.mocked(ontrack.onTrackCacheIdentity).mockResolvedValue("second-identity");
    await syncOnTrack(db, secondAccount);
    expect(ontrack.fetchOnTrackComments).toHaveBeenCalledTimes(4);
  });

  it("keeps definition-only tasks distinct and preserves their identity when instantiated", async () => {
    vi.mocked(ontrack.fetchOnTrackTasks).mockResolvedValue([
      { ...task, id: null, isInstantiated: false, status: "not_instantiated" },
      { ...task, id: null, isInstantiated: false, taskDefinitionId: 41, status: "not_instantiated", visibility: "unknown" },
    ]);
    await syncOnTrack(db, account);
    const id = "ontrack:task:project:10:definition:40";
    db.markChecked([id]);
    expect(db.getItem("ontrack:task:project:10:definition:41")).toMatchObject({ importance: "reference", actionRequired: "uncertain", dueAt: null });
    expect(ontrack.fetchOnTrackComments).not.toHaveBeenCalled();
    vi.mocked(ontrack.fetchOnTrackTasks).mockResolvedValue([task]);
    await syncOnTrack(db, account);
    expect(db.getItem(id)).toMatchObject({ read: true, text: expect.stringContaining("working_on_it") });
    expect(db.getItem("ontrack:task:30")).toBeNull();
    expect(db.listItems().filter((item) => item.sourceItemId.startsWith("task:"))).toHaveLength(2);
  });

  it("includes currently non-applicable instantiated tasks and their old feedback only during backfill", async () => {
    vi.mocked(ontrack.fetchOnTrackTasks).mockImplementation(async (_id, _project, options) => options?.includeNonApplicable
      ? [{ ...task, visibility: "beyond_target" }] : []);
    await syncOnTrack(db, account);
    expect(db.listItems()).toHaveLength(0);
    const result = await syncOnTrack(db, account, { full: true });
    expect(result).toMatchObject({ tasks: 1, feedback: 2 });
    expect(db.getItem("ontrack:task:30")).toMatchObject({ importance: "reference", actionRequired: "no", dueAt: null });
    expect(db.getItem("ontrack:feedback:old")?.text).toBe("Old feedback");
  });

  it("rejects unknown account IDs before any project or feedback reads", async () => {
    await expect(syncOnTrack(db, { ...account, userId: 0 }, { full: true })).rejects.toThrow("账户身份");
    expect(ontrack.fetchOnTrackProjects).not.toHaveBeenCalled();
    expect(db.listItems()).toHaveLength(0);
  });

  it("rejects a late task response after disconnect without writing its data or scan flags", async () => {
    vi.mocked(ontrack.fetchOnTrackTasks).mockImplementationOnce(async () => {
      vi.mocked(ontrack.onTrackCacheIdentity).mockResolvedValue(null);
      return [task];
    });
    await expect(syncOnTrack(db, account, { full: true })).rejects.toThrow("连接已更改");
    expect(db.listItems()).toHaveLength(0);
    expect(db.listSources().find((source) => source.id === "ontrack")?.lastSyncAt).toBeNull();
  });
});
