import { describe, expect, it } from "vitest";
import { buildUpdateStatus, compareVersions } from "../update.js";

describe("Cove update check", () => {
  it("compares semantic versions", () => {
    expect(compareVersions("0.1.2", "0.1.1")).toBe(1);
    expect(compareVersions("v0.1.2", "0.1.2")).toBe(0);
    expect(compareVersions("0.2.0", "0.10.0")).toBe(-1);
  });

  it("marks a newer release as an update", () => {
    const status = buildUpdateStatus("0.1.2", {
      tag: "v0.1.3",
      version: "0.1.3",
      name: "Cove 0.1.3",
      url: "https://example.test/release",
      publishedAt: "2026-11-02T00:00:00Z",
      notes: "Notes",
      prerelease: false,
    });
    expect(status.hasUpdate).toBe(true);
    expect(status.releaseUrl).toBe("https://example.test/release");
  });
});
