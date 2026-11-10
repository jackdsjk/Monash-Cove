import { useEffect, useState } from 'react'
import { Drawer } from 'antd'
import { ArrowRight, Check, ExternalLink, Layers, X } from 'lucide-react'
import { useStore } from '../store'
import { FIELD_LABEL, JUDGMENT_LABEL, SOURCE_LABEL, type ItemChange } from '../data/model'
import { DEFAULT_TIMEZONE, fmtCountdown, fmtDue, useTime } from '../lib/time'
import { Button, Role, Source } from './ui'

export function formatChangeValue(c: ItemChange, v: string | number, timezone = DEFAULT_TIMEZONE) {
  if (c.field !== 'due_at' || v === '') return String(v)
  const at = typeof v === 'number' ? v : Date.parse(v)
  return Number.isFinite(at) ? fmtDue(at, timezone) : String(v)
}

export function ItemDrawer() {
  const { fmtDue, fmtWhen, timezone } = useTime()
  const { openItemId, openItem, items, changes, courses, marks, setMark, completionUpdates, setCompleted, now } = useStore()
  const item = items.find((i) => i.id === openItemId)
  const [fullText, setFullText] = useState(false)

  useEffect(() => {
    setFullText(false)
  }, [openItemId])

  const drawerProps = {
    title: '条目详情',
    onClose: () => openItem(null),
    getContainer: false as const,
    size: 'min(500px, 100vw)',
    closable: { placement: 'end' as const, 'aria-label': '关闭' },
    closeIcon: <X aria-hidden className="h-4 w-4" />,
    focusable: { trap: true, focusTriggerAfterClose: true },
    styles: { body: { padding: 0, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' } },
  }
  // Keep the primitive mounted while closing so it can restore focus to the trigger.
  if (!item) return <Drawer {...drawerProps} open={false} />

  const mark = marks[item.id] ?? {}
  const itemChanges = changes.filter((c) => c.itemId === item.id).sort((a, b) => b.detectedAt - a.detectedAt)
  const course = courses.find((c) => c.code === item.course)
  const canSubmit = !!item.dueAt
  const completion = completionUpdates[item.id]

  return (
    <Drawer {...drawerProps} open>
        <div className="flex min-h-12 shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2 text-[13px] text-slate-600">
            <Source id={item.source} />
            <span className="text-slate-300">/</span>
            <span className="truncate">{item.location}</span>
          </div>
        </div>

        <div className="scroll-y min-h-0 flex-1 space-y-6 overscroll-contain px-5 py-5">
          <div>
            <p className="text-xs text-slate-500">
              {course ? [course.code, course.name].filter(Boolean).join(' · ') : item.course || '没能归到课程'} · {item.objectType}
            </p>
            <h2 className="mt-1.5 text-[17px] leading-snug font-semibold text-slate-900">{item.title}</h2>
          </div>

          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-slate-500">发布者</dt>
            <dd className="flex flex-wrap items-center gap-2 text-slate-800">
              {item.author.name}
              {item.author.title && <span className="text-slate-500">{item.author.title}</span>}
              <Role role={item.author.role} />
            </dd>
            <dt className="text-slate-500">发布时间</dt>
            <dd className="text-slate-800">{fmtWhen(item.publishedAt, now)}</dd>
            <dt className="text-slate-500">首次同步</dt>
            <dd className="text-slate-800">{fmtWhen(item.firstSeenAt, now)}</dd>
            {item.dueAt && (
              <>
                <dt className="text-slate-500">截止时间</dt>
                <dd className="text-slate-800">
                  {fmtDue(item.dueAt)}
                  <span className="ml-2 text-slate-500">{fmtCountdown(item.dueAt, now)}</span>
                </dd>
              </>
            )}
          </dl>

          {item.merged && item.merged.length > 0 && (
            <div className="rounded-md border border-brand-200 bg-brand-50/60 px-3.5 py-3 text-[13px]">
              <p className="flex items-center gap-1.5 font-medium text-brand-900">
                <Layers className="h-3.5 w-3.5" />
                已合并 {item.merged.length + 1} 个来源，只计为一条
              </p>
              <ul className="mt-2 space-y-1 text-slate-700">
                <li>
                  主条目：{SOURCE_LABEL[item.source]} · {item.location}
                </li>
                {item.merged.map((m) => (
                  <li key={m.url}>
                    同一事件：{SOURCE_LABEL[m.source]} ·{' '}
                    <a href={m.url} target="_blank" rel="noreferrer" className="text-brand-700 underline-offset-2 hover:underline">
                      {m.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {itemChanges.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold text-slate-500">字段变更</h3>
              <div className="divide-y divide-line rounded-md border border-line">
                {itemChanges.map((c) => (
                  <div key={c.id} className="px-3.5 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{FIELD_LABEL[c.field]}</span>
                      <span>检测于 {fmtWhen(c.detectedAt, now)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-slate-500 line-through decoration-slate-400">{formatChangeValue(c, c.before, timezone)}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-label="改为" />
                      <span className="font-medium text-slate-900">{formatChangeValue(c, c.after, timezone)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold text-slate-500">原文关键句</h3>
            <blockquote className="border-l-2 border-brand-400 bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-800">
              {item.excerpt}
            </blockquote>
            <button onClick={() => setFullText((v) => !v)} className="mt-2 text-xs font-medium text-brand-700 hover:underline">
              {fullText ? '收起全文' : '查看本地保存的全文'}
            </button>
            {fullText && (
              <pre className="mt-2 rounded-md border border-line bg-white px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-slate-700">
                {item.body}
              </pre>
            )}
          </section>

          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-md border border-slate-300 px-3.5 py-2.5 text-[13px] font-medium text-slate-800 hover:border-brand-400 hover:bg-brand-50/50"
          >
            在 {SOURCE_LABEL[item.source]} 中打开原文
            <ExternalLink className="h-4 w-4 text-slate-500" />
          </a>
        </div>

        <div className="shrink-0 border-t border-line bg-slate-50/70 px-5 py-3.5">
          <p className="mb-2 text-xs text-slate-500">你的标记（只影响你自己的视图）</p>
          <div className="flex flex-wrap gap-2">
            <Toggle on={!!mark.read} onClick={() => setMark(item.id, { read: mark.read ? undefined : true })}>
              已读
            </Toggle>
            {canSubmit && (
              <Toggle on={!!item.completedAt} disabled={completion?.pending} onClick={() => void setCompleted(item.id, !item.completedAt)}>
                已提交
              </Toggle>
            )}
            {(Object.keys(JUDGMENT_LABEL) as (keyof typeof JUDGMENT_LABEL)[]).map((k) => (
              <Toggle
                key={k}
                on={mark.judgment === k}
                onClick={() => setMark(item.id, { judgment: mark.judgment === k ? undefined : k })}
              >
                {JUDGMENT_LABEL[k]}
              </Toggle>
            ))}
          </div>
          {completion?.pending && <p role="status" className="mt-2 text-xs text-slate-500">正在保存提交标记…</p>}
          {completion?.error && <p role="alert" className="mt-2 text-xs text-red-700">保存失败：{completion.error}。再次点击可重试。</p>}
          {mark.judgment && (
            <p className="mt-2 text-xs text-slate-500">这条不会出现在「自上次查看」中，切换到「全部」可以找回。</p>
          )}
        </div>
    </Drawer>
  )
}

function Toggle({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <Button
      size="sm"
      aria-pressed={on}
      variant={on ? 'primary' : 'secondary'}
      onClick={onClick}
      disabled={disabled}
    >
      {on && <Check className="h-3.5 w-3.5" />}
      {children}
    </Button>
  )
}
