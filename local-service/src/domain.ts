export type Source = "gmail" | "ed" | "moodle";
export type ContentType =
  | "required_action"
  | "requirement_change"
  | "staff_announcement"
  | "staff_answer"
  | "peer_question"
  | "learning_material"
  | "assessment_fact"
  | "administrative"
  | "promotion"
  | "noise";
export type Importance = "critical" | "important" | "reference" | "skip";
export type ActionRequired = "yes" | "no" | "uncertain";
export type OpenOriginal = "required" | "optional" | "no";

export interface FixtureItem {
  id: string;
  source: Source;
  course: string;
  title: string;
  authorRole: string;
  text: string;
  ageHours: number;
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
}

export interface StoredItem {
  id: string;
  source: Source;
  sourceItemId: string;
  course: string;
  title: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
  ageHours: number;
  dueAt: string | null;
  deadlineKind: string | null;
  contentHash: string;
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
  text: string;
  triageVersion: string;
  model: string;
  read: boolean;
  correction?: {
    pinned?: boolean;
    dismissed?: boolean;
    feedback?: { reason: string; note: string; at: string };
  };
}

export interface NewItem {
  id: string;
  source: Source;
  sourceItemId: string;
  course: string;
  title: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
  dueAt?: string | null;
  deadlineKind?: string | null;
  contentHash: string;
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
  text: string;
  triageVersion: string;
  model: string;
}

export interface SourceStatus {
  id: Source;
  label: string;
  status: "connected" | "degraded" | "error" | "disconnected" | "fixture";
  lastSyncAt: string | null;
  lastError: string | null;
  itemCount: number;
  contentCount?: number;
}

export interface BriefResponse {
  items: StoredItem[];
  sources: SourceStatus[];
  syncedAt: string | null;
  lastCheckedAt: string | null;
}

export interface MoodleCourseSummary {
  id: number;
  shortname: string;
  fullname: string;
}

export interface MoodleContentRow {
  id: string;
  courseId: string;
  courseName: string;
  sectionNumber: number;
  sectionTitle: string;
  module: string;
  title: string;
  url: string;
  text: string;
  updatedAt: string;
}

export interface ApiError {
  error: { code: string; message: string; retryable: boolean };
}
