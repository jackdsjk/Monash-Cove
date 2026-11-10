// Adapted from Muster `src/services/examSchedule.test.ts`. That suite is mostly store/API
// orchestration (refreshExamSchedule), which this port explicitly excludes; only the pure
// examErrorKey assertions are carried over, unchanged.
import { expect, it } from "vitest";
import { examErrorKey } from "./examSchedule";

it("never labels capture timeouts and network errors as expired SSO", () => {
  expect(examErrorKey("PORTAL_CAPTURE_TIMEOUT")).toBe("dashboard.examsCaptureFailed");
  expect(examErrorKey("PORTAL_NETWORK_ERROR")).toBe("dashboard.examsNetworkFailed");
  expect(examErrorKey("PORTAL_LOGIN_REQUIRED")).toBe("dashboard.examsLoginRequired");
  expect(examErrorKey("PORTAL_ACCOUNT_MISMATCH")).toBe("dashboard.examsAccountMismatch");
});

it("treats unreadable portal exam data as a data error, not expired sign-in", () => {
  const error = "PORTAL_EXAM_SCHEMA: exam 1/2 (eventKind=standard): start.time is not an integer; start=object{time:string}, end=object{time:integer}";
  expect(examErrorKey(error)).toBe("dashboard.examsDataUnavailable");
  expect(examErrorKey("PORTAL_EXAM_UNAVAILABLE")).toBe("dashboard.examsDataUnavailable");
});

it("maps credential, webview and unknown failures to their own keys", () => {
  expect(examErrorKey("PORTAL_CREDENTIAL_FAILED")).toBe("dashboard.examsCredentialFailed");
  expect(examErrorKey("PORTAL_WEBVIEW_CRASHED")).toBe("dashboard.examsCaptureFailed");
  expect(examErrorKey("PORTAL_TIMEOUT")).toBe("dashboard.examsNetworkFailed");
  expect(examErrorKey("offline")).toBe("dashboard.examsFailed");
  expect(examErrorKey(null)).toBe("dashboard.examsFailed");
});
