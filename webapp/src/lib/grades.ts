import type { MoodleGradeCourse, MoodleGradeItem } from '../types'

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
  if (item.grade === null || item.gradeMax === null || item.gradeMax <= 0) return null
  return (item.grade / item.gradeMax) * 100
}

export interface CourseSummary {
  /** 按权重折算的已得分数（在 `total` 之内） */
  earned: number
  /** 已评分但没拿到的权重 */
  lost: number
  /** 尚未评分的权重 */
  ungraded: number
  /** 课程权重合计；Moodle 没给权重时按 100 计 */
  total: number
  /** 已评分部分的权重 */
  gradedWeight: number
  /** 当前平均：只按已评分项，权重齐时按权重加权 */
  current: number | null
  band: GradeBand | null
  gradedCount: number
  ungradedCount: number
  count: number
  /** 权重是否完整到可以按权重拆段 */
  hasWeights: boolean
}

/**
 * 和 Moodle 一样只看已评分项：权重齐全时按权重折算，
 * 缺权重时退回已评分项的算术平均，两种情况都不把未评分当 0 分。
 */
export function courseSummary(course: MoodleGradeCourse): CourseSummary {
  const items = course.items
  const hasWeights = items.length > 0 && items.every((item) => item.weight !== null && item.weight > 0)
  const marks: number[] = []
  let gradedWeight = 0
  let earnedWeight = 0
  let gradedCount = 0

  for (const item of items) {
    const pct = percentage(item)
    if (item.grade !== null) gradedCount += 1
    if (pct !== null) marks.push(pct)
    if (!hasWeights) continue
    const weight = item.weight as number
    if (pct === null) continue
    gradedWeight += weight
    earnedWeight += (pct / 100) * weight
  }

  const total = hasWeights ? items.reduce((sum, item) => sum + (item.weight as number), 0) : 100
  const current =
    marks.length === 0 ? null : hasWeights && gradedWeight > 0 ? (earnedWeight / gradedWeight) * 100 : marks.reduce((a, b) => a + b, 0) / marks.length
  const earned = hasWeights ? earnedWeight : current ?? 0

  return {
    earned,
    lost: hasWeights ? gradedWeight - earnedWeight : 0,
    // 没有权重就算不出「还剩多少权重」；不拿条目数冒充权重。
    ungraded: hasWeights ? total - gradedWeight : 0,
    total,
    gradedWeight: hasWeights ? gradedWeight : 0,
    current,
    band: current === null ? null : band(current),
    gradedCount,
    ungradedCount: items.length - gradedCount,
    count: items.length,
    hasWeights,
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
