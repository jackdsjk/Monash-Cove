/**
 * Ported from Muster `src/services/examSchedule.ts`.
 *
 * Only the pure error→message-key mapping is portable here: Muster's
 * `refreshExamSchedule()` orchestration mutates its app store, calls the Tauri `fetchExams`
 * API, and depends on its i18n catalogue, all of which this task excludes. The mapping is
 * reproduced byte-for-byte apart from its return type, which Muster declares as
 * `TranslationKey`; this repo has no i18n catalogue, so the exact key strings are declared
 * locally as a union instead.
 */

export type ExamErrorKey =
  | "dashboard.examsLoginRequired"
  | "dashboard.examsAccountMismatch"
  | "dashboard.examsCredentialFailed"
  | "dashboard.examsCaptureFailed"
  | "dashboard.examsNetworkFailed"
  | "dashboard.examsDataUnavailable"
  | "dashboard.examsFailed";

export function examErrorKey(error: string | null): ExamErrorKey {
  if (error?.includes("PORTAL_LOGIN_REQUIRED")) return "dashboard.examsLoginRequired";
  if (error?.includes("PORTAL_ACCOUNT_MISMATCH")) return "dashboard.examsAccountMismatch";
  if (error?.includes("PORTAL_CREDENTIAL")) return "dashboard.examsCredentialFailed";
  if (error?.includes("PORTAL_CAPTURE") || error?.includes("PORTAL_WEBVIEW")) return "dashboard.examsCaptureFailed";
  if (error?.includes("PORTAL_NETWORK") || error?.includes("PORTAL_TIMEOUT")) return "dashboard.examsNetworkFailed";
  if (error?.includes("PORTAL_EXAM_")) return "dashboard.examsDataUnavailable";
  return "dashboard.examsFailed";
}
