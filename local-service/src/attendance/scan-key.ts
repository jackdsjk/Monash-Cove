import { createHash } from "node:crypto";

/** Stable identity for an OCR source row: same content means no re-scan. */
export function attendanceScanKey(row: { id: string; title: string; text: string; url: string }) {
  return createHash("sha1").update(`${row.id}:${row.title}:${row.text}:${row.url}`).digest("hex");
}
