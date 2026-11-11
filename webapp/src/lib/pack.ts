import { FIELD_LABEL, type ChangeField } from '../data/model'
import type { PackResponse } from '../types'
import { DEFAULT_TIMEZONE, fmtDue, fmtWhen } from './time'

/**
 * 「Moodle 作业资料」的导出模型。移植自 cove-figma-make 的 `src/lib/pack.ts`：
 * 沿用原格式化逻辑并收窄为 Moodle 数据；时间用的是绝对时间戳而不是相对的
 * `dueOffsetH`，评分标准因为后端没有数据而固定为 null。
 */

export interface PackOptions {
  spec: boolean
  rubric: boolean
  changes: boolean
}

export const DEFAULT_OPTIONS: PackOptions = { spec: true, rubric: true, changes: true }

/** 后端确认没有的数据，导出处如实写这句，不补默认值。 */
export const MISSING_DATA = 'Moodle 没有提供这项数据'

export interface PackChange {
  field: string
  before: string
  after: string
  at: number
  source: string
}

export interface AssignmentPack {
  id: string
  courseId: string
  /** 课程代码，如 FIT1047 */
  course: string
  /** Moodle 的课程 shortname，如 FIT1047_S2_2026 */
  courseName: string
  title: string
  /** Moodle 没有提供截止时间时为 null，界面上单独说明。 */
  dueAt: number | null
  completedAt: number | null
  moodleUrl: string
  spec: string
  /** 后端没有评分标准数据；保留字段是为了让复选框的行为可解释。 */
  rubric: null
  changes: PackChange[]
}

const NOTE = '仅包含 Grades 成绩册已确认、本机已同步的 Moodle 评分作业与测验正文及关联变更。如有差异，以 Moodle 最新原文为准。'

function parseTime(value: string | null): number | null {
  if (!value) return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : null
}

/** 接口数据 → 导出模型。所有时间都转成毫秒，缺失字段保持缺失。 */
export function toAssignmentPacks(response: PackResponse): AssignmentPack[] {
  const packs = response.assignments.filter((entry) => {
    if (!entry.gradeItemId) return false
    try { return /^\/mod\/(assign|quiz)\/view\.php$/.test(new URL(entry.url).pathname) } catch { return false }
  }).map((entry) => ({
    id: entry.id,
    courseId: entry.courseId,
    course: entry.course,
    courseName: entry.courseName,
    title: entry.title,
    dueAt: parseTime(entry.dueAt),
    completedAt: parseTime(entry.completedAt),
    moodleUrl: entry.url,
    spec: entry.text,
    rubric: null,
    changes: entry.changes.flatMap((change) => {
      const at = parseTime(change.changedAt)
      if (at === null) return []
      return [
        {
          field: FIELD_LABEL[change.field as ChangeField] ?? change.field,
          before: change.before ?? '',
          after: change.after ?? '',
          at,
          source: 'Moodle',
        },
      ]
    }),
  }))

  return packs.sort((a, b) => {
    if (a.dueAt !== null && b.dueAt !== null) return a.dueAt - b.dueAt || a.course.localeCompare(b.course) || a.title.localeCompare(b.title)
    if (a.dueAt !== null) return -1
    if (b.dueAt !== null) return 1
    return a.course.localeCompare(b.course) || a.title.localeCompare(b.title)
  })
}

export type PackStatus = 'all' | 'upcoming' | 'overdue' | 'completed' | 'undated'

export interface PackFilters {
  courseId: string
  status: PackStatus
  query: string
}

export function assignmentPackStatus(pack: AssignmentPack, now: number): Exclude<PackStatus, 'all'> {
  if (pack.completedAt !== null) return 'completed'
  if (pack.dueAt === null) return 'undated'
  return pack.dueAt < now ? 'overdue' : 'upcoming'
}

/** Selection and exports use this same visible set, so a filter cannot export hidden work. */
export function filterAssignmentPacks(packs: AssignmentPack[], filters: PackFilters, now: number): AssignmentPack[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return packs.filter((pack) => (!filters.courseId || pack.courseId === filters.courseId) &&
    (filters.status === 'all' || assignmentPackStatus(pack, now) === filters.status) &&
    (!query || `${pack.course} ${pack.courseName} ${pack.title}`.toLocaleLowerCase().includes(query)))
}

export function toMarkdown(packs: AssignmentPack[], o: PackOptions, now: number, timezone = DEFAULT_TIMEZONE) {
  const out: string[] = []
  const first = packs[0]
  out.push(packs.length === 1 && first ? `# ${first.course} · ${first.title}` : `# Moodle 作业资料（${packs.length} 项作业）`)
  out.push('')
  out.push(`> 由 Cove 从 Moodle 导出 · ${fmtWhen(now, now, timezone)} · ${timezone}`)
  out.push(`> ${NOTE}`)

  for (const p of packs) {
    if (packs.length > 1) out.push('', '---', '', `## ${p.course} · ${p.title}`)
    const h = packs.length > 1 ? '###' : '##'
    out.push('', `${h} 基本信息`, '')
    out.push(`- 课程：${p.course}${p.courseName && p.courseName !== p.course ? ` · ${p.courseName}` : ''}`)
    out.push(`- 截止时间：${p.dueAt === null ? MISSING_DATA : fmtDue(p.dueAt, timezone)}`)
    out.push(`- Moodle 原文：${p.moodleUrl}`)

    if (o.spec) {
      out.push('', `${h} 作业要求（Moodle 原文）`, '', p.spec.trim() ? p.spec : MISSING_DATA)
    }
    if (o.rubric) {
      out.push('', `${h} 评分标准`, '', MISSING_DATA)
    }
    if (o.changes && p.changes.length) {
      out.push('', `${h} 变更记录`, '')
      p.changes.forEach((c) => out.push(`- ${c.field}：${c.before} → ${c.after}（${c.source}，检测于 ${fmtWhen(c.at, now, timezone)}）`))
    }
  }
  return out.join('\n') + '\n'
}

export function toJSON(packs: AssignmentPack[], o: PackOptions, now: number) {
  const iso = (at: number) => new Date(at).toISOString()
  return JSON.stringify(
    {
      exportedBy: 'Cove',
      exportedAt: iso(now),
      note: NOTE,
      assignments: packs.map((p) => ({
        course: p.course,
        courseName: p.courseName,
        title: p.title,
        dueAt: p.dueAt === null ? null : iso(p.dueAt),
        moodleUrl: p.moodleUrl,
        ...(o.spec && { specification: p.spec.trim() ? p.spec : MISSING_DATA }),
        ...(o.rubric && { rubric: p.rubric }),
        ...(o.changes && {
          changes: p.changes.map((c) => ({ field: c.field, before: c.before, after: c.after, source: c.source, detectedAt: iso(c.at) })),
        }),
      })),
    },
    null,
    2,
  )
}
