import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CircleAlert, Copy, Download, FileJson, FileText, RefreshCw } from 'lucide-react'
import { Button, DuePill, EmptyLine, PageTitle, Panel, Segmented } from '../components/ui'
import { fetchPack } from '../data/repository'
import {
  DEFAULT_OPTIONS,
  MISSING_DATA,
  selectPosts,
  toAssignmentPacks,
  toJSON,
  toMarkdown,
  type PackOptions,
} from '../lib/pack'
import { navigate } from '../lib/router'
import { fmtDue } from '../lib/time'
import { useStore } from '../store'
import type { PackResponse } from '../types'

type Scope = 'one' | 'course' | 'all'

const OPTION_LABELS: { key: keyof PackOptions; label: string; hint: string }[] = [
  { key: 'spec', label: '作业要求与附件清单', hint: 'Moodle 原文 · 附件未提供' },
  { key: 'rubric', label: '评分标准', hint: 'Moodle 没有提供' },
  { key: 'changes', label: '变更记录', hint: '截止时间、正文等改动' },
  { key: 'staffPosts', label: '教学人员的帖子与回复', hint: '标注为官方' },
  { key: 'studentPosts', label: '学生的提问与回复', hint: '标注为非官方' },
]

export function PackPage() {
  const { now } = useStore()
  const [payload, setPayload] = useState<PackResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('one')
  const [format, setFormat] = useState<'md' | 'json'>('md')
  const [opts, setOpts] = useState<PackOptions>(DEFAULT_OPTIONS)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPayload(await fetchPack())
    } catch (cause) {
      // Keep whatever was already on screen; only the banner changes.
      setError(cause instanceof Error ? cause.message : '无法读取作业资料')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const packs = useMemo(() => (payload ? toAssignmentPacks(payload) : []), [payload])
  const current = packs.find((p) => p.id === id) ?? packs[0] ?? null

  const scoped = useMemo(() => {
    if (!current) return []
    if (scope === 'one') return [current]
    if (scope === 'course') return packs.filter((p) => p.course === current.course)
    return packs
  }, [packs, current, scope])

  const output = useMemo(() => {
    if (!current) return ''
    return format === 'md' ? toMarkdown(scoped, opts, now) : toJSON(scoped, opts, now)
  }, [scoped, opts, format, now, current])

  const postCount = scoped.reduce((n, p) => n + selectPosts(p, opts).length, 0)
  const postsPerRole = payload?.postsPerRole ?? 6
  const filename = current
    ? `cove-${scope === 'all' ? 'all-assignments' : scope === 'course' ? current.course.toLowerCase() : current.id}.${format}`
    : `cove-pack.${format}`

  const download = () => {
    const url = URL.createObjectURL(new Blob([output], { type: format === 'md' ? 'text/markdown' : 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const copy = () => {
    const writing = navigator.clipboard?.writeText(output)
    void writing?.catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const banner = error && (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  )

  if (!current) {
    return (
      <div className="mx-auto max-w-[1240px] px-10 py-8">
        <PageTitle
          title="作业资料包"
          description="把作业要求、评分标准、变更记录和相关 Ed 帖子打包成 Markdown 或 JSON，交给你自己的 AI 工具参考。"
        />
        {banner}
        <Panel>
          <EmptyLine>
            <p className="font-semibold text-slate-700">
              {loading ? '正在读取 Moodle 作业…' : error ? '读取作业失败，见上方提示。' : '还没有可以打包的作业'}
            </p>
            {!loading && (
              <p className="mx-auto mt-1 max-w-[52ch]">
                {error
                  ? '资料包只读取本机已同步的数据，不会编造内容。稍后重试，或先到「来源」检查后端服务。'
                  : 'Moodle 里没有找到作业条目（module=assign）。先到「来源」连接 Moodle 并同步课程资料，再回来生成资料包。'}
              </p>
            )}
            {!loading && (
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate('/sources')}>
                  打开来源
                </Button>
                <Button variant="primary" size="sm" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5" /> 重新读取
                </Button>
              </div>
            )}
          </EmptyLine>
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1240px] px-10 py-8">
      <PageTitle
        title="作业资料包"
        description="把作业要求、评分标准、变更记录和相关 Ed 帖子打包成 Markdown 或 JSON，交给你自己的 AI 工具参考。"
      />

      {banner}

      <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-5">
        <div className="space-y-5">
          <Panel className="overflow-hidden">
            <p className="border-b border-line bg-slate-50/70 px-5 py-3 text-sm font-bold text-slate-900">选择作业</p>
            <ul className="scroll-y max-h-[calc(100vh-700px)] min-h-[180px] divide-y divide-line">
              {packs.map((p) => {
                const on = p.id === current.id
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setId(p.id)}
                      aria-current={on ? 'true' : undefined}
                      className={`w-full px-5 py-3 text-left transition-colors ${on ? 'bg-brand-50/70' : 'hover:bg-slate-50'}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-brand-700">{p.course}</span>
                        {p.dueAt === null ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-slate-500">
                            无截止时间
                          </span>
                        ) : (
                          <DuePill due={p.dueAt} now={now} />
                        )}
                      </span>
                      <span className={`mt-1 block truncate text-sm ${on ? 'font-semibold text-brand-900' : 'text-slate-800'}`}>
                        {p.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {p.posts.length} 个 Ed 帖子 · {p.changes.length} 处变更 ·{' '}
                        {p.dueAt === null ? 'Moodle 未提供截止时间' : `截止 ${fmtDue(p.dueAt)}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="border-t border-line bg-slate-50/40 px-5 py-2.5 text-xs leading-relaxed text-slate-500">
              Ed 帖子按课程关联：每门课取教学人员与学生各最近 {postsPerRole} 条；未标注作者角色的帖子不计入，也无法按作业线程精确匹配。
            </p>
          </Panel>

          <Panel className="p-5">
            <p className="text-sm font-bold text-slate-900">包含内容</p>
            <div className="mt-3 space-y-2.5">
              {OPTION_LABELS.map((o) => (
                <label key={o.key} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={opts[o.key]}
                    onChange={(e) => setOpts({ ...opts, [o.key]: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span>
                    <span className="text-slate-800">{o.label}</span>
                    <span className="ml-1.5 text-slate-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              每条帖子都会标明作者身份。学生的内容会标为非官方，避免 AI 把同学的猜测当成课程要求。
              <span className="mt-1.5 block">
                评分标准：{MISSING_DATA}。勾选后导出内容会如实写明，不会编造分项和分值。
              </span>
            </p>
          </Panel>
        </div>

        <Panel className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex items-center gap-2">
              <Segmented
                label="范围"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'one', label: '当前作业' },
                  { value: 'course', label: `${current.course} 全部` },
                  { value: 'all', label: '全部课程' },
                ]}
              />
              <Segmented
                label="格式"
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'md', label: 'Markdown' },
                  { value: 'json', label: 'JSON' },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={copy}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? '已复制' : '复制'}
              </Button>
              <Button variant="primary" onClick={download}>
                <Download className="h-4 w-4" />
                下载 .{format}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-line bg-slate-50/60 px-5 py-2 text-xs text-slate-500">
            {format === 'md' ? <FileText className="h-3.5 w-3.5" /> : <FileJson className="h-3.5 w-3.5" />}
            {filename} · {scoped.length} 项作业 · {postCount} 个帖子 · {output.length.toLocaleString()} 字符
          </div>
          <pre className="scroll-y h-[calc(100vh-290px)] min-h-[420px] px-6 py-5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-slate-800">
            {output}
          </pre>
        </Panel>
      </div>
    </div>
  )
}
