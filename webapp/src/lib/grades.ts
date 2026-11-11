import type { MoodleGradeCourse, MoodleGradeItem } from '../types'
import { buildCourseGrade, parseScorePercent, type CourseGrade } from './muster/gradeBreakdown'
import type { Assignment } from './muster/types'

export type GradeBand = 'HD' | 'D' | 'C' | 'P' | 'N'

export const BAND_LABEL: Record<GradeBand, string> = {
  HD: 'High Distinction',
  D: 'Distinction',
  C: 'Credit',
  P: 'Pass',
  N: 'Fail',
}

/** Monash 等级区间 */
export function band(mark: number): GradeBand {
  if (mark >= 80) return 'HD'
  if (mark >= 70) return 'D'
  if (mark >= 60) return 'C'
  if (mark >= 50) return 'P'
  return 'N'
}

/** 一个评分项占满分的百分比。Moodle 没给满分时算不出来，返回 null。 */
export function percentage(item: MoodleGradeItem): number | null {
  if (item.grade === null || !Number.isFinite(item.grade) || item.gradeMax === null || !Number.isFinite(item.gradeMax)) return null
  return parseScorePercent(String(item.grade), item.gradeMax)
}

export function isGradeReleased(item: MoodleGradeItem): boolean {
  return item.grade !== null && Number.isFinite(item.grade) ||
    !!item.gradeText?.trim() && !['-', '–', '—'].includes(item.gradeText.trim())
}

function gradeFields(item: MoodleGradeItem): Pick<Assignment, 'status' | 'grade' | 'gradeMax'> {
  return {
    status: isGradeReleased(item) ? 'graded' : 'pending',
    grade: item.grade !== null && Number.isFinite(item.grade) ? String(item.grade) : item.gradeText ?? undefined,
    gradeMax: item.gradeMax !== null && Number.isFinite(item.gradeMax) ? item.gradeMax : undefined,
  }
}

const validWeight = (weight: number | null | undefined) =>
  weight != null && Number.isFinite(weight) && weight >= 0 ? weight : undefined

function assessmentBreakdown(course: MoodleGradeCourse): CourseGrade | null {
  if (!course.assessmentStructure?.length) return null
  const rows: Assignment[] = course.assessmentStructure.map((row, index) => {
    const itemIndex = row.isCategory ? -1 : course.items.findIndex((item) => item.id === row.gradeItemId)
    const item = course.items[itemIndex]
    return {
      id: item ? itemIndex : -index - 1, name: row.name, courseId: 0,
      isCategory: row.isCategory, category: row.category ?? undefined,
      categoryId: row.categoryId ?? undefined, url: row.url ?? undefined,
      categoryWeight: validWeight(row.categoryWeight), weight: validWeight(row.weight),
      // Unmatched links remain pending, preserving their share in the denominator.
      ...(item ? gradeFields(item) : { status: 'pending' as const }),
    }
  })
  const result = buildCourseGrade(rows)
  return result.totalWeight > 0 ? result : null
}

/** Grades supplies scores; Assessments supplies grouping and weight provenance. */
export function gradeBreakdown(course: MoodleGradeCourse): CourseGrade {
  const structured = assessmentBreakdown(course)
  if (structured) return structured
  const assignments: Assignment[] = course.items.map((item, index) => ({
    id: index, name: item.name, courseId: 0, isCategory: false,
    url: item.url || 'moodle:gradebook', ...gradeFields(item), weight: validWeight(item.weight),
  }))
  return buildCourseGrade(assignments)
}

/** Shares come from the copied calculator, never from a second split algorithm. */
export function gradeItemWeights(course: MoodleGradeCourse, breakdown = gradeBreakdown(course)): Map<string, number | null> {
  const weights = new Map<string, number | null>(course.items.map((item) => [item.id, item.weight === 0 ? 0 : null]))
  for (const category of breakdown.categories) {
    for (const score of category.items) {
      const item = course.items[score.id]
      if (item && !score.placeholder) weights.set(item.id, score.share)
    }
  }
  return weights
}

export interface CourseSummary {
  /** 按权重折算的已得分数（在 `total` 之内） */
  earned: number
  /** 已评分但没拿到的权重 */
  lost: number
  /** 尚未评分的权重 */
  ungraded: number
  hidden: number
  /** Final-mark scale; partial published weights are never stretched to 100%. */
  total: number
  /** 已评分部分的权重 */
  gradedWeight: number
  /** Weighted released average; unknown weights/scores do not imply equal weighting. */
  current: number | null
  band: GradeBand | null
  gradedCount: number
  ungradedCount: number
  count: number
  /** 至少有可用权重；不代表整门课权重完整。 */
  hasWeights: boolean
  weightsComplete: boolean
  /** Moodle's own published course total, independent of the earned-weight estimate. */
  reported: number | null
}

/**
 * Reuse Muster's earned/graded/pending/hidden split. No arithmetic-average
 * fallback: Moodle may use categories, unequal weights or unpublished scores.
 */
export function courseSummary(course: MoodleGradeCourse): CourseSummary {
  const items = course.items
  const structured = assessmentBreakdown(course)
  const breakdown = structured ?? gradeBreakdown(course)
  const hasWeights = breakdown.totalWeight > 0 && breakdown.totalWeight <= 100.5
  const weights = gradeItemWeights(course, breakdown)
  const releasedWeightsKnown = structured !== null ||
    items.filter(isGradeReleased).every((item) => weights.get(item.id) != null)
  const gradedCount = items.filter(isGradeReleased).length
  const current = hasWeights && releasedWeightsKnown && breakdown.gradedWeight > 0 && breakdown.hiddenWeight === 0
    ? breakdown.earned / breakdown.gradedWeight * 100 : null

  return {
    earned: hasWeights ? breakdown.earned : 0,
    lost: hasWeights ? Math.max(0, breakdown.gradedWeight - breakdown.earned) : 0,
    ungraded: hasWeights ? breakdown.pendingWeight : 0,
    hidden: hasWeights ? breakdown.hiddenWeight : 0,
    total: 100,
    gradedWeight: hasWeights ? breakdown.gradedWeight : 0,
    current,
    band: current === null ? null : band(current),
    gradedCount,
    ungradedCount: items.length - gradedCount,
    count: items.length,
    hasWeights,
    weightsComplete: hasWeights && breakdown.weightsComplete &&
      (structured !== null || items.every((item) => weights.get(item.id) != null)),
    reported: course.total.earned !== null && Number.isFinite(course.total.earned) &&
      course.total.max !== null && Number.isFinite(course.total.max)
      ? parseScorePercent(String(course.total.earned), course.total.max) : null,
  }
}

/** Moodle 课程全名通常以单元代码开头；拆成「代码 · 名称」两段显示。 */
export function splitCourseName(courseName: string): { code: string; name: string } {
  const trimmed = courseName.trim()
  const match = /^([A-Z]{3}\d{4})[\s:·-]+(.+)$/i.exec(trimmed)
  if (!match) return { code: '', name: trimmed }
  return { code: match[1].toUpperCase(), name: match[2].trim() }
}

/** Moodle 打印的日期是账号语言下的文本；解析不了就当作没有时间。 */
export function parseMoodleDate(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}
