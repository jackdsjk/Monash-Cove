import { FIELD_LABEL, ROLE_LABEL, type ChangeField } from '../data/model'
import type { PackResponse } from '../types'
import { fmtDue, fmtWhen } from './time'

/**
 * 「作业资料包」的导出模型。移植自 cove-figma-make 的 `src/lib/pack.ts`：
 * 格式化逻辑保持一致，数据从真实接口来，所以时间用的是绝对时间戳而不是相对的
 * `dueOffsetH`，评分标准因为后端没有数据而固定为 null。
 */

export interface PackOptions {
  spec: boolean
  rubric: boolean
  changes: boolean
  staffPosts: boolean
  studentPosts: boolean
}

export const DEFAULT_OPTIONS: PackOptions = { spec: true, rubric: true, changes: true, staffPosts: true, studentPosts: true }

/** 后端确认没有的数据，导出处如实写这句，不补默认值。 */
export const MISSING_DATA = 'Moodle 没有提供这项数据'

export type PackRole = 'staff' | 'student'

export interface PackReply {
  author: string
  role: PackRole
  title?: string
  at: number
  body: string
  endorsed?: boolean
}

export interface PackPost {
  id: string
  /** Ed 讨论编号；解析不出来时是 null，导出时不写 #。 */
  number: number | null
  title: string
  category: string
  author: string
  role: PackRole
  authorTitle?: string
  at: number
  pinned?: boolean
  body: string
  url: string
  replies: PackReply[]
}

export interface PackChange {
  field: string
  before: string
  after: string
  at: number
  source: string
}

export interface AssignmentPack {
  id: string
  /** 课程代码，如 FIT1047 */
  course: string
  /** Moodle 的课程 shortname，如 FIT1047_S2_2026 */
  courseName: string
  title: string
  /** Moodle 没有提供截止时间时为 null，界面上单独说明。 */
  dueAt: number | null
  moodleUrl: string
  spec: string
  /** 后端没有评分标准数据；保留字段是为了让复选框的行为可解释。 */
  rubric: null
  changes: PackChange[]
  posts: PackPost[]
}

const hasStaff = (p: PackPost) => p.role === 'staff' || p.replies.some((r) => r.role === 'staff')

/** 按选项筛选帖子：只要教学人员内容时，保留含教学人员回复的帖子，但去掉学生回复 */
export function selectPosts(pack: AssignmentPack, o: PackOptions): PackPost[] {
  return pack.posts
    .filter((p) => (o.studentPosts ? true : hasStaff(p)))
    .filter((p) => (o.staffPosts ? true : !hasStaff(p)))
    .map((p) => ({ ...p, replies: p.replies.filter((r) => (r.role === 'staff' ? o.staffPosts : o.studentPosts)) }))
}

const NOTE =
  '标注为「教学人员」的内容来自课程官方，代表课程要求；标注为「学生」的内容是同学的提问或猜测，不代表课程要求。如有冲突，以 Moodle 作业原文和最新变更为准。Ed 帖子按课程关联，不保证每条都针对这一份作业；来源没有标注作者角色的帖子未收录。'

function who(name: string, role: PackRole, title?: string) {
  const label = `${ROLE_LABEL[role]}${title ? ` · ${title}` : ''}`
  // 本地服务没有存 Ed 作者姓名；有姓名时才把姓名放进括号外，绝不猜一个。
  return name ? `${name}（${label}）` : label
}

function parseTime(value: string | null): number | null {
  if (!value) return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : null
}

/** 接口数据 → 导出模型。所有时间都转成毫秒，缺失字段保持缺失。 */
export function toAssignmentPacks(response: PackResponse): AssignmentPack[] {
  const packs = response.assignments.map((entry) => ({
    id: `${entry.course.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'course'}-${entry.id.slice(0, 8)}`,
    course: entry.course,
    courseName: entry.courseName,
    title: entry.title,
    dueAt: parseTime(entry.dueAt),
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
    posts: entry.posts.map((post) => ({
      id: post.id,
      number: post.number,
      title: post.title,
      category: '',
      author: '',
      role: post.authorRole,
      at: parseTime(post.publishedAt) ?? 0,
      body: post.text,
      url: post.url,
      replies: [],
    })),
  }))

  return packs.sort((a, b) => {
    if (a.dueAt !== null && b.dueAt !== null) return a.dueAt - b.dueAt || a.course.localeCompare(b.course) || a.title.localeCompare(b.title)
    if (a.dueAt !== null) return -1
    if (b.dueAt !== null) return 1
    return a.course.localeCompare(b.course) || a.title.localeCompare(b.title)
  })
}

export function toMarkdown(packs: AssignmentPack[], o: PackOptions, now: number) {
  const out: string[] = []
  const first = packs[0]
  out.push(packs.length === 1 && first ? `# ${first.course} · ${first.title}` : `# 作业资料包（${packs.length} 项作业）`)
  out.push('')
  out.push(`> 由 Cove 从 Moodle 与 Ed 导出 · ${fmtWhen(now, now)}`)
  out.push(`> ${NOTE}`)

  for (const p of packs) {
    if (packs.length > 1) out.push('', '---', '', `## ${p.course} · ${p.title}`)
    const h = packs.length > 1 ? '###' : '##'
    out.push('', `${h} 基本信息`, '')
    out.push(`- 课程：${p.course}${p.courseName && p.courseName !== p.course ? ` · ${p.courseName}` : ''}`)
    out.push(`- 截止时间：${p.dueAt === null ? MISSING_DATA : fmtDue(p.dueAt)}`)
    out.push(`- Moodle 原文：${p.moodleUrl}`)

    if (o.spec) {
      out.push('', `${h} 作业要求（Moodle 原文）`, '', p.spec.trim() ? p.spec : MISSING_DATA)
    }
    if (o.rubric) {
      out.push('', `${h} 评分标准`, '', MISSING_DATA)
    }
    if (o.changes && p.changes.length) {
      out.push('', `${h} 变更记录`, '')
      p.changes.forEach((c) => out.push(`- ${c.field}：${c.before} → ${c.after}（${c.source}，检测于 ${fmtWhen(c.at, now)}）`))
    }
    const posts = selectPosts(p, o)
    if (posts.length) {
      out.push('', `${h} Ed 帖子（${posts.length}）`)
      posts.forEach((post) => {
        const label = post.number === null ? post.title : `#${post.number} ${post.title}`
        out.push('', `${h}# ${label}${post.pinned ? '（置顶）' : ''}`, '')
        out.push(`- 作者：${who(post.author, post.role, post.authorTitle)}`)
        out.push(`- 时间：${fmtWhen(post.at, now)}${post.category ? ` · 分类：${post.category}` : ''}`)
        out.push(`- 链接：${post.url}`)
        out.push('', ...post.body.split('\n').map((l) => `> ${l}`))
        post.replies.forEach((r) => {
          out.push('', `**回复 · ${who(r.author, r.role, r.title)}${r.endorsed ? ' · 已被认可' : ''}**`, '', ...r.body.split('\n').map((l) => `> ${l}`))
        })
      })
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
        edPosts: selectPosts(p, o).map((post) => ({
          number: post.number,
          title: post.title,
          category: post.category,
          pinned: !!post.pinned,
          author: { name: post.author, role: post.role, title: post.authorTitle ?? null, official: post.role === 'staff' },
          postedAt: iso(post.at),
          url: post.url,
          body: post.body,
          replies: post.replies.map((r) => ({
            author: { name: r.author, role: r.role, title: r.title ?? null, official: r.role === 'staff' },
            postedAt: iso(r.at),
            endorsed: !!r.endorsed,
            body: r.body,
          })),
        })),
      })),
    },
    null,
    2,
  )
}
