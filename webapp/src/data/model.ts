export type SourceId = 'gmail' | 'ed' | 'moodle' | 'ontrack'

export const SOURCE_ORDER: SourceId[] = ['gmail', 'ed', 'moodle', 'ontrack']

export const SOURCE_LABEL: Record<SourceId, string> = {
  gmail: 'Gmail',
  ed: 'Ed',
  moodle: 'Moodle',
  ontrack: 'OnTrack',
}

export type AuthorRole = 'staff' | 'student' | 'system'

export const ROLE_LABEL: Record<AuthorRole, string> = {
  staff: '教学人员',
  student: '学生',
  system: '系统',
}

export interface Item {
  id: string
  source: SourceId
  /** 空字符串表示没能归到课程 */
  course: string
  title: string
  /** 平台原始对象类型，如 Assignment / Thread / Email，仅在详情里展示 */
  objectType: string
  author: { name: string; role: AuthorRole; title?: string }
  publishedAt: number
  firstSeenAt: number
  dueAt?: number
  /** 来源已确认的提交时间；有值表示已完成 */
  completedAt?: number
  /** 关键原句（证据） */
  excerpt: string
  body: string
  url: string
  location: string
  /** 多来源合并的同一事件 */
  merged?: { source: SourceId; label: string; url: string }[]
}

export type ChangeField =
  | 'due_at'
  | 'title'
  | 'location'
  | 'grade'
  | 'attachment'
  | 'reply'
  | 'body'
  | 'status'
  | 'course'

export const FIELD_LABEL: Record<ChangeField, string> = {
  due_at: '截止时间',
  title: '标题',
  location: '地点',
  grade: '成绩',
  attachment: '附件',
  reply: '回复',
  body: '正文',
  status: '状态',
  course: '课程',
}

export interface ItemChange {
  id: string
  itemId: string
  field: ChangeField
  before: string | number
  after: string | number
  detectedAt: number
}

export interface UserMark {
  read?: boolean
  submitted?: boolean
  judgment?: 'not_important' | 'not_for_me'
}

export const JUDGMENT_LABEL = {
  not_important: '不重要',
  not_for_me: '不是给我的',
} as const

export type SyncState = 'idle' | 'syncing' | 'error' | 'disconnected'

export interface SourceState {
  id: SourceId
  connected: boolean
  state: SyncState
  lastSyncAt?: number
  lastSuccessAt?: number
  error?: string
  itemCount: number
  account: string
}

export interface Course {
  code: string
  name: string
}

export const COURSES: Course[] = [
  { code: 'FIT2004', name: 'Algorithms and Data Structures' },
  { code: 'FIT2099', name: 'Object Oriented Design and Implementation' },
  { code: 'FIT3155', name: 'Advanced Data Structures and Algorithms' },
  { code: 'MAT1830', name: 'Discrete Mathematics for Computer Science' },
]
