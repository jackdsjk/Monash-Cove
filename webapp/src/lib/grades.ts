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

/** Adapt the gradebook to the copied Muster calculator once for every view. */
export function gradeBreakdown(course: MoodleGradeCourse): CourseGrade {
  const assignments: Assignment[] = course.items.map((item, index) => ({
    id: index, name: item.name, courseId: 0, isCategory: false,
    url: 'moodle:gradebook', status: item.grade === null ? 'pending' : 'graded',
    grade: item.grade === null || !Number.isFinite(item.grade) ? undefined : String(item.grade),
    gradeMax: item.gradeMax !== null && Number.isFinite(item.gradeMax) ? item.gradeMax : undefined,
    weight: item.weight !== null && Number.isFinite(item.weight) && item.weight >= 0 ? item.weight : undefined,
  }))
  return buildCourseGrade(assignments)
}

export interface CourseSummary {
  /** 按权重折算的已得分数（在 `total` 之内） */
  earned: number
  /** 已评分但没拿到的权重 */
  lost: number
  /** 尚未评分的权重 */
  ungraded: number
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
  /** 权重是否完整到可以按权重拆段 */
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
  const breakdown = gradeBreakdown(course)
  const hasWeights = items.length > 0 && breakdown.totalWeight > 0 && breakdown.totalWeight <= 100.5 &&
    items.every((item) => item.weight !== null && Number.isFinite(item.weight) && item.weight >= 0)
  const gradedCount = items.filter((item) => item.grade !== null && Number.isFinite(item.grade)).length
  const current = hasWeights && breakdown.gradedWeight > 0 && breakdown.hiddenWeight === 0
    ? breakdown.earned / breakdown.gradedWeight * 100 : null

  return {
    earned: hasWeights ? breakdown.earned : 0,
    lost: hasWeights ? Math.max(0, breakdown.gradedWeight - breakdown.earned) : 0,
    ungraded: hasWeights ? breakdown.pendingWeight + breakdown.hiddenWeight : 0,
    total: 100,
    gradedWeight: hasWeights ? breakdown.gradedWeight : 0,
    current,
    band: current === null ? null : band(current),
    gradedCount,
    ungradedCount: items.length - gradedCount,
    count: items.length,
    hasWeights,
    weightsComplete: hasWeights && breakdown.weightsComplete,
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
