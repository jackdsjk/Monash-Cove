import type { MoodleGradeCourse, MoodleGradeItem } from '../types'
import { buildCourseGrade, parseScorePercent, type CourseGrade } from './muster/gradeBreakdown'
import type { Assignment } from './muster/types'
import { courseSemester, type MoodleCoursePreferences } from './course-sync-preferences'

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
  if (isPassFail(item)) return null
  if (item.grade === null || !Number.isFinite(item.grade) || item.gradeMax === null || !Number.isFinite(item.gradeMax)) return null
  return parseScorePercent(String(item.grade), item.gradeMax)
}

export function isGradeReleased(item: MoodleGradeItem): boolean {
  if (/^(?:ungraded|not graded)$/i.test(item.gradeText?.trim() ?? '')) return false
  return item.grade !== null && Number.isFinite(item.grade) ||
    !!item.gradeText?.trim() && !['-', '–', '—'].includes(item.gradeText.trim())
}

export function isGradeMarked(item: MoodleGradeItem): boolean {
  if (/^(?:ungraded|not graded)$/i.test(item.gradeText?.trim() ?? '')) return false
  return isGradeReleased(item) || item.gradingState === 'graded'
}

/** Range is authoritative; exact Pass/Fail text supports snapshots predating Range. */
export function isPassFail(item: MoodleGradeItem): boolean {
  const range = item.gradeRange?.trim()
  if (range) return /^(?:pass|fail)(?:[\s,;/|–—-]+(?:pass|fail))+$/i.test(range)
  return /^(?:pass|fail)$/i.test(item.gradeText?.trim() ?? '')
}

export function isPassFailFailure(item: MoodleGradeItem): boolean {
  return isPassFail(item) && /^fail$/i.test(item.gradeText?.trim() ?? '')
}

/** Pending rows and passed requirements remain internal evidence, not visible results. */
export function isGradeVisible(item: MoodleGradeItem): boolean {
  return isGradeMarked(item) && (!isPassFail(item) || isPassFailFailure(item))
}

function withoutPassFail(course: MoodleGradeCourse, grade: CourseGrade): CourseGrade {
  if (!course.items.some(isPassFail)) return grade
  // Allocate against the complete original structure FIRST. Removing children
  // before the upstream split would inflate the other children's shares.
  const categories = grade.categories.flatMap((category) => {
    const items = category.items.filter((score) => !course.items[score.id] || !isPassFail(course.items[score.id]))
    if (!items.length) return []
    const sum = (state: 'graded' | 'hidden' | 'pending') => items.filter((item) => item.state === state).reduce((total, item) => total + item.share, 0)
    return [{ ...category, items, weight: items.reduce((total, item) => total + item.share, 0),
      earned: items.reduce((total, item) => total + item.share * (item.percent ?? 0) / 100, 0),
      gradedWeight: sum('graded'), hiddenWeight: sum('hidden'), pendingWeight: sum('pending') }]
  })
  const total = (field: 'weight' | 'earned' | 'gradedWeight' | 'hiddenWeight' | 'pendingWeight') => categories.reduce((sum, category) => sum + category[field], 0)
  const totalWeight = total('weight')
  return { ...grade, categories, totalWeight, earned: total('earned'),
    gradedWeight: total('gradedWeight'), hiddenWeight: total('hiddenWeight'), pendingWeight: total('pendingWeight'),
    // Removing a nonnumeric requirement cannot establish a numeric pass outlook.
    outcome: 'no-data', needed: 0, requiredAverage: null,
    weightsComplete: grade.weightsComplete && Math.abs(totalWeight - 100) < 0.5 }
}

export function gradeStatus(item: MoodleGradeItem): string {
  if (isGradeReleased(item)) return '已评分'
  if (item.gradingState === 'graded') return '已评分，分数未公开'
  return item.gradingState === 'submitted' ? '已提交，待评分' : '未评分'
}

function gradeFields(item: MoodleGradeItem): Pick<Assignment, 'status' | 'grade' | 'gradeMax'> {
  return {
    status: isGradeMarked(item) ? 'graded' : item.gradingState === 'submitted' ? 'submitted' : 'pending',
    grade: isGradeReleased(item) ? item.grade !== null && Number.isFinite(item.grade) ? String(item.grade) : item.gradeText ?? undefined : undefined,
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
  if (structured) return withoutPassFail(course, structured)
  const assignments: Assignment[] = course.items.map((item, index) => ({
    id: index, name: item.name, courseId: 0, isCategory: false,
    url: item.url || 'moodle:gradebook', ...gradeFields(item), weight: validWeight(item.weight),
  }))
  return withoutPassFail(course, buildCourseGrade(assignments))
}

/** Shares come from the copied calculator, never from a second split algorithm. */
export function gradeItemWeights(course: MoodleGradeCourse, breakdown = gradeBreakdown(course)): Map<string, number | null> {
  const weights = new Map<string, number | null>(course.items.map((item) => [item.id, !isPassFail(item) && item.weight === 0 ? 0 : null]))
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
  const items = course.items.filter((item) => !isPassFail(item))
  const structured = assessmentBreakdown(course)
  const breakdown = structured ? withoutPassFail(course, structured) : gradeBreakdown(course)
  const hasWeights = breakdown.totalWeight > 0 && breakdown.totalWeight <= 100.5
  const weights = gradeItemWeights(course, breakdown)
  const releasedWeightsKnown = structured !== null ||
    items.filter(isGradeReleased).every((item) => weights.get(item.id) != null)
  const gradedCount = items.filter(isGradeMarked).length
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

/**
 * Adapted from Muster src/components/GradeBreakdown.tsx useOutlook at ad2372683e0fbc4efb148af8b81840ae8dee5f39.
 * Copyright 2026 Poetrynan; see muster/LICENSE and NOTICE. Guard partial weights/unreadable scores.
 */
export function gradeOutlook(course: MoodleGradeCourse): string | null {
  if (course.items.some(isPassFail)) return null
  const summary = courseSummary(course)
  const grade = gradeBreakdown(course)
  if (!summary.weightsComplete || grade.hiddenWeight > 0) return null
  const fmt = (value: number) => Number(value.toFixed(1))
  switch (grade.outcome) {
    case 'passed': return `已得 ${fmt(grade.earned)} 个总评分，达到 50 分线。`
    case 'unreachable': return `剩余 ${fmt(grade.pendingWeight)}% 权重全部得分仍无法达到 50 分线，请核对课程要求。`
    case 'not-started': return `尚未评分，剩余 ${fmt(grade.pendingWeight)}% 权重。`
    case 'no-data': return null
    default: return `距 50 分线还差 ${fmt(grade.needed)} 分，剩余 ${fmt(grade.pendingWeight)}% 中需平均取得 ${fmt(grade.requiredAverage ?? 0)}%。`
  }
}

/** View-only filter: unknown terms survive; real course IDs control hidden/pinned state. */
export function gradeCoursesInView(courses: MoodleGradeCourse[], semester: string | null, preferences?: MoodleCoursePreferences | null): MoodleGradeCourse[] {
  return courses.filter((course) => {
    if (preferences?.hiddenCourseIds.includes(course.courseId)) return false
    const term = courseSemester(course.courseShortName || course.courseName)
    return !semester || !term || term === semester
  }).sort((a, b) => Number(preferences?.pinnedCourseIds.includes(b.courseId) ?? false) - Number(preferences?.pinnedCourseIds.includes(a.courseId) ?? false))
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
