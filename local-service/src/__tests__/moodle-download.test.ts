import { describe, expect, it } from "vitest";
import { fileNameForDownload, safeDownloadName } from "../moodle-download.js";

describe("Moodle download file names", () => {
  it("uses the resource title and preserves the real extension", () => {
    expect(fileNameForDownload("FIT1047.pdf", "FIT1047 Textbook (pdf version)", "application/pdf")).toBe(
      "FIT1047 Textbook (pdf version).pdf",
    );
  });

  it("uses a title without an extension plus the MIME extension", () => {
    expect(fileNameForDownload("pluginfile.php", "Week 1 slides", "application/pdf")).toBe("Week 1 slides.pdf");
  });

  it("keeps an extension already present in the title", () => {
    expect(fileNameForDownload("download.bin", "Week 1 notes.docx", "application/octet-stream")).toBe(
      "Week 1 notes.docx",
    );
  });

  it("sanitizes unsafe characters", () => {
    expect(safeDownloadName('a/b:c*?"<>|.pdf')).toBe("a_b_c______.pdf");
  });
});
