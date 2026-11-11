/**
 * Copyright 2026 Mark. Licensed under Apache-2.0; see LICENSE.
 * Copied from MarkChu-git/Always-Ontrack at 4e038b4af7f030cd4cdf07832c7e472184a2f519.
 * Cove adaptation: retain only read-only student-task projection and supporting types.
 */
/** Common user object returned by auth, projects, comments, and session payloads. */
export interface OnTrackUser {
  // Numeric user id when exposed by endpoint.
  id?: number;
  // Login username (often email-like).
  username?: string;
  // Preferred contact email.
  email?: string;
  // CamelCase first name variant.
  firstName?: string;
  // snake_case first name variant.
  first_name?: string;
  // CamelCase last name variant.
  lastName?: string;
  // snake_case last name variant.
  last_name?: string;
  // Role from user payload.
  role?: string;
  // Alternate role key seen in some payloads.
  system_role?: string;
  // Preserve unknown fields for forward compatibility.
  [key: string]: unknown;
}

/** Unit/course summary with optional task definition payloads. */
export interface UnitSummary {
  // Unit primary id.
  id: number;
  // Unit code (e.g. FIT1045).
  code?: string;
  // Human-readable unit name.
  name?: string;
  // CamelCase role field for current user in unit.
  myRole?: string;
  // snake_case role field for current user in unit.
  my_role?: string;
  // Whether unit is active.
  active?: boolean;
  // CamelCase task definitions list.
  taskDefinitions?: TaskDefinitionSummary[];
  // snake_case task definitions list.
  task_definitions?: TaskDefinitionSummary[];
  // Preserve unknown unit metadata.
  [key: string]: unknown;
}

/** File requirement metadata for upload-capable tasks. */
export interface TaskUploadRequirement {
  // Multipart key expected by upload endpoint (file0, file1, ...).
  key?: string;
  // Display name for requirement (server field; no `label` or per-file `max_size` exists).
  name?: string;
  // Requirement content category reported by the server (e.g. document, code).
  type?: string;
  // Preserve unknown requirement metadata.
  [key: string]: unknown;
}

/** Task definition metadata as exposed by unit/project endpoints. */
export interface TaskDefinitionSummary {
  // Task definition id.
  id?: number;
  // Short task code (P1, D4, etc.).
  abbreviation?: string;
  // Full task name.
  name?: string;
  // Target grade metadata for rubric workflows.
  targetGrade?: number;
  // CamelCase upload requirement list.
  uploadRequirements?: TaskUploadRequirement[];
  // snake_case upload requirement list.
  upload_requirements?: TaskUploadRequirement[];
  // Preserve unknown definition metadata.
  [key: string]: unknown;
}

/** Task instance within a project. */
export interface TaskSummary {
  // Task instance id in project.
  id: number;
  // Workflow status.
  status?: string;
  // Grade value when applicable.
  grade?: string | number;
  // Quality points when applicable.
  qualityPts?: number;
  // CamelCase due date.
  dueDate?: string;
  // snake_case due date.
  due_date?: string;
  // CamelCase completion date.
  completionDate?: string;
  // snake_case completion date.
  completion_date?: string;
  // CamelCase submission date.
  submissionDate?: string;
  // snake_case submission date.
  submission_date?: string;
  // CamelCase unread/new comment count.
  numNewComments?: number;
  // snake_case unread/new comment count.
  num_new_comments?: number;
  // CamelCase task definition id.
  taskDefinitionId?: number;
  // snake_case task definition id.
  task_definition_id?: number;
  // CamelCase upload requirements.
  uploadRequirements?: TaskUploadRequirement[];
  // snake_case upload requirements.
  upload_requirements?: TaskUploadRequirement[];
  // Embedded task definition object when provided.
  definition?: {
    // Embedded definition id.
    id?: number;
    // Embedded abbreviation.
    abbreviation?: string;
    // Embedded name.
    name?: string;
    // Embedded target grade.
    targetGrade?: number;
    // Embedded camelCase upload requirements.
    uploadRequirements?: TaskUploadRequirement[];
    // Embedded snake_case upload requirements.
    upload_requirements?: TaskUploadRequirement[];
    // Preserve unknown embedded fields.
    [key: string]: unknown;
  };
  // Preserve unknown task fields.
  [key: string]: unknown;
}

/** Project summary, typically with embedded unit and task arrays. */
export interface ProjectSummary {
  // Project id.
  id: number;
  // Requested/target grade.
  targetGrade?: number;
  // Submitted/achieved grade.
  submittedGrade?: number;
  // Enrollment flag for current user.
  enrolled?: boolean;
  // Associated unit summary.
  unit?: UnitSummary;
  // Project owner/student profile.
  student?: OnTrackUser;
  // Project task list.
  tasks?: TaskSummary[];
  // Preserve unknown project fields.
  [key: string]: unknown;
}
