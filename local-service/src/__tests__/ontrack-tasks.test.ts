import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySecretStore } from "../secrets.js";
import { configureOnTrackCredentials, fetchOnTrackAccount, fetchOnTrackProjects, fetchOnTrackTasks } from "../sources/ontrack.js";

let configDir: string;
let project: Record<string, unknown>;
let unit: Record<string, unknown>;
let catalogue: unknown[];
const baseUrl = "https://ontrack.example.invalid/api";

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "cove-ontrack-tasks-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", configDir);
  configureOnTrackCredentials(new MemorySecretStore());
  await writeFile(join(configDir, "session.json"), JSON.stringify({
    baseUrl, username: "fixture", authToken: "fixture-token", user: { id: 11 },
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  }));
  project = { id: 1, unit_id: 2, target_grade: 1, tasks: [] };
  unit = { id: 2, task_definitions: [{ id: 3, name: "Task", abbreviation: "1P", target_grade: 1, due_date: "2026-11-15" }] };
  catalogue = [{ id: 1, unit: { id: 2, code: "TEST1000" } }];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const path = String(input).replace(baseUrl, "");
    if (path === "/projects") return Response.json(catalogue);
    if (path === "/projects/1") return Response.json(project);
    if (path === "/units/2") return Response.json(unit);
    throw new Error(`Unexpected network call: ${path}`);
  }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(configDir, { recursive: true, force: true });
});

describe("OnTrack definition-first task catalogue", () => {
  it("shows definitions before instances exist, with no invented instance ID", async () => {
    expect(await fetchOnTrackTasks(1)).toEqual([expect.objectContaining({
      id: null, taskDefinitionId: 3, isInstantiated: false, status: "not_instantiated",
      visibility: "within_target", name: "Task", dueDate: "2026-11-15",
    })]);
    expect((await fetchOnTrackAccount())?.baseUrl).toBe(baseUrl);
  });

  it("recognizes flat course aliases and summary fallback when project detail omits the unit", async () => {
    unit.code = "TEST1000";
    unit.name = "Fixture unit";
    catalogue = [{ id: 1, unitId: 2 }, { id: 9, unit_id: 2 }];
    const projects = await fetchOnTrackProjects();
    expect(projects.map((entry) => entry.unitId)).toEqual([2, 2]);
    expect(projects.map((entry) => entry.unitCode)).toEqual(["TEST1000", "TEST1000"]);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/units/2"))).toHaveLength(1);
    delete project.unit_id;
    const summary = (await fetchOnTrackProjects())[0]!;
    expect(await fetchOnTrackTasks(1, summary)).toHaveLength(1);
  });

  it("merges camelCase instances and definitions, preferring the student's due date", async () => {
    unit = { id: 2, taskDefinitions: [{ id: 3, name: "Task", dueDate: "2026-11-15", targetDate: "2026-11-12" }] };
    project = { id: 1, unitId: 2, tasks: [{ id: 7, taskDefinitionId: 3, status: "working_on_it", dueDate: "2026-11-20", numNewComments: 4, timesAssessed: 2 }] };
    expect(await fetchOnTrackTasks(1)).toEqual([expect.objectContaining({
      id: 7, isInstantiated: true, dueDate: "2026-11-20", targetDueDate: "2026-11-12",
      numNewComments: 4, timesAssessed: 2,
    })]);
  });

  it("filters known higher-target and other-stream definitions", async () => {
    project.tutorial_enrolments = [{ tutorial_id: 10 }];
    unit.tutorials = [{ id: 10, tutorial_stream_abbr: "A" }];
    unit.tutorial_streams = [{ abbreviation: "A" }, { abbreviation: "B" }];
    unit.task_definitions = [
      { id: 3, target_grade: 1, tutorial_stream_abbr: "A" },
      { id: 4, target_grade: 2 },
      { id: 5, tutorial_stream_abbr: "B" },
    ];
    expect((await fetchOnTrackTasks(1)).map((task) => task.taskDefinitionId)).toEqual([3]);
    expect((await fetchOnTrackTasks(1, undefined, { includeNonApplicable: true })).map((task) => task.visibility))
      .toEqual(["within_target", "beyond_target", "tutorial_mismatch"]);
  });

  it("keeps unknown applicability visible without asserting it is required", async () => {
    unit.task_definitions = [{ id: 3, tutorial_stream_abbr: "A" }];
    expect((await fetchOnTrackTasks(1))[0]?.visibility).toBe("unknown");
    project.tutorial_enrolments = [{ tutorial_id: 99 }];
    unit.tutorials = [];
    unit.tutorial_streams = [{ abbreviation: "A" }];
    expect((await fetchOnTrackTasks(1))[0]?.visibility).toBe("unknown");
  });

  it("uses embedded definitions when an existing instance is absent from the unit catalogue", async () => {
    unit.task_definitions = [];
    project.tasks = [{ id: 7, task_definition_id: 3, definition: { id: 3, name: "Embedded" }, due_date: "2026-11-18" }];
    expect((await fetchOnTrackTasks(1))[0]).toMatchObject({ id: 7, name: "Embedded", dueDate: "2026-11-18", status: "unknown" });
  });

  it("rejects ambiguous duplicate instances instead of silently choosing one", async () => {
    project.tasks = [{ id: 7, task_definition_id: 3 }, { id: 8, task_definition_id: 3 }];
    await expect(fetchOnTrackTasks(1)).rejects.toThrow("ambiguous");
  });

  it("does not report successful empty data for missing course metadata", async () => {
    unit = { id: 2 };
    await expect(fetchOnTrackTasks(1)).rejects.toThrow("完整任务定义");
    catalogue = [{ id: 1 }];
    await expect(fetchOnTrackProjects()).rejects.toThrow("课程 ID");
  });
});
