/**
 * Types copied from Muster (`src/services/api.ts`, `src/types/index.ts`) for the
 * framework-free helpers in this directory. Only the fields those helpers read are kept.
 */

export interface Assignment {
  id: number;
  name: string;
  courseId: number;
  dueDate?: string;
  /** Due date in RFC3339 ISO form ("Monday, 23 March 2026, 9:00 AM" can't be parsed by JS Date, so the backend converts it) */
  dueDateIso?: string;
  status: "pending" | "submitted" | "graded" | "upcoming";
  grade?: string;
  url?: string;
  /** Assessment type: regular `assignment` or `quiz` (Task #37, determined by the backend from the Assessments section). */
  assessmentType?: "assignment" | "quiz";
  /** Weight percentage, e.g. 25 means 25% (Task #37, extracted from the activity name "(Weight: 25%)"). */
  weight?: number;
  /** Assessment category, e.g. "Written" / "Quiz / Test" (Task #37, grouping headings from h1/h2 in the Assessments section). */
  category?: string;
  /** Whether a submission status exists ("-" / empty = untrackable, excluded from the progress denominator) */
  hasSubmissionStatus?: boolean;
  /** Category row of the Assessments widget ("1. Quiz / Test  9%"), not a gradable item. */
  isCategory?: boolean;
  /** Weight of the whole category; children inherit it in `weight`, so it must be split, not summed. */
  categoryWeight?: number;
  /** Id of the owning category row. Category names repeat (FIT5201: two "Artefact" rows). */
  categoryId?: number;
  /** Max score from the gradebook range, to convert a bare score into a percentage. */
  gradeMax?: number;
}

export interface ExamSchedule {
  startAt?: string;
  endAt?: string;
  timezone?: string;
  id: string;
  courseId?: number;
  courseName: string;
  courseCode: string;
  examType: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  seatNumber?: string;
  durationMinutes?: number;
  instructions?: string;
  url?: string;
}
