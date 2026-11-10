import { useEffect, useMemo, type ReactNode } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { useStore } from '../store'
import { navigate } from '../lib/router'
import { FIELD_LABEL, SOURCE_LABEL, SOURCE_ORDER, type Item } from '../data/model'
import { isHiddenByUser, lastActivity, pickSuggestions } from '../lib/brief'
import { useTime } from '../lib/time'
import { formatChangeValue } from './ItemDrawer'
import { Button, Course, Role, Source, SOURCE_MARK } from './ui'

const MAX_CHANGES = 5
const MAX_NEW = 4

export function LaunchSummary() {
  const { fmtDate, fmtWhen, hm, timezone } = useTime()
  const { summaryOpen, setSummaryOpen, openedSince, items, changes, marks, now, sources, lastViewedAt, openItem, markWindowViewed, syncSource } = useStore()

  useEffect(() => {
    if (!summaryOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSummaryOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [summaryOpen, setSummaryOpen])

  const d = useMemo(() => {
    const visible = items.filter((i) => !isHiddenByUser(marks[i.id]))
    const win = visible.filter((i) => lastActivity(i, changes) >= openedSince)
    const ids = new Set(win.map((i) => i.id))
    const byId = new Map(items.map((i) => [i.id, i]))
    const winChanges = changes.filter((c) => c.detectedAt >= openedSince && ids.has(c.itemId)).sort((a, b) => b.detectedAt - a.detectedAt)
    const fresh = win.filter((i) => i.course !== '' && i.firstSeenAt >= openedSince).sort((a, b) => b.firstSeenAt - a.firstSeenAt)
    const noCourse = win.filter((i) => i.course === '').sort((a, b) => b.firstSeenAt - a.firstSeenAt)
    const counts = Object.fromEntries(SOURCE_ORDER.map((s) => [s, win.filter((i) => i.source === s).length])) as Record<string, number>
    const pending = visible.filter((i) => lastActivity(i, changes) >= lastViewedAt).length
    return { win, winChanges, byId, fresh, noCourse, counts, pending, suggestions: pickSuggestions(win, changes, openedSince, now) }
  }, [items, changes, marks, openedSince, lastViewedAt, now])

  if (!summaryOpen) return null

  const close = () => setSummaryOpen(false)
  const open = (i: Item) => {
    close()
    navigate('/')
    openItem(i.id)
  }
  const failed = sources.filter((s) => s.state === 'error')
  const empty = d.win.length === 0

  const row = (key: string, i: Item, right: ReactNode, left?: ReactNode) => (
    <li key={key}>
      <button onClick={() => open(i)} className="grid w-full grid-cols-[64px_72px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-brand-50/60">
        {left ?? <Source id={i.source} />}
        <Course code={i.course} />
        <span className="truncate text-slate-800">{i.title}</span>
        <span className="flex min-w-0 items-center justify-end gap-1.5 text-slate-600">{right}</span>
      </button>
    </li>
  )

  const block = (title: string, count: number, children: ReactNode, more?: number) => (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        <span className="text-[13px] text-slate-500">{count}</span>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">{children}</ul>
      {!!more && <p className="mt-1.5 text-xs text-slate-500">另有 {more} 条，在首页查看</p>}
    </section>
  )

  return (
    <div className="overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-title"
        onClick={(e) => e.stopPropagation()}
        className="dialog-enter flex max-h-[88vh] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        <header className="relative shrink-0 border-b border-brand-100 bg-brand-50/70 px-6 pt-5 pb-4">
          <button onClick={close} aria-label="关闭" className="absolute top-4 right-4 rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
          <p className="text-xs text-brand-800">本次打开 · {fmtDate(now)} {hm(now)}</p>
          <h2 id="launch-title" className="mt-1 text-lg font-semibold text-slate-900">
            {empty ? '自上次打开以来没有新的更新' : `自上次打开以来，有 ${d.win.length} 条更新`}
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-600">
            上次打开：{fmtWhen(openedSince, now)}
            {!empty && ` · ${d.winChanges.length} 处字段变更，${d.fresh.length} 条新增，${d.noCourse.length} 条没能归到课程`}
          </p>

          <div className="mt-4 grid grid-cols-2 divide-x divide-brand-100 rounded-xl border border-brand-100 bg-white sm:grid-cols-4">
            {SOURCE_ORDER.map((s) => (
              <div key={s} className="px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span aria-hidden className={`h-2 w-2 rounded-[2px] ${SOURCE_MARK[s]}`} />
                  {SOURCE_LABEL[s]}
                </p>
                <p className="mt-0.5 text-xl font-semibold text-slate-900">{d.counts[s] ?? 0}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="scroll-y flex-1 space-y-5 px-6 py-5">
          {failed.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-900">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                {SOURCE_LABEL[s.id]} 同步失败，{s.lastSuccessAt ? `${fmtWhen(s.lastSuccessAt, now)} 之后的` : ''}内容没有计入。
              </span>
              <Button size="sm" onClick={() => syncSource(s.id)} disabled={s.state === 'syncing'} className="border-red-300 text-red-800">
                重新同步
              </Button>
            </div>
          ))}

          {empty ? (
            <p className="py-6 text-center text-[13px] text-slate-600">
              {d.pending > 0 ? `首页还有 ${d.pending} 条你没有标记为已查看的更新。` : '所有来源都没有新的变化。'}
            </p>
          ) : (
            <>
              {d.suggestions.length > 0 &&
                block(
                  '建议先看',
                  d.suggestions.length,
                  d.suggestions.map(({ item, reason }) =>
                    row(`s-${item.id}`, item, <Source id={item.source} />, <span className="truncate text-xs font-medium text-brand-700">{reason}</span>),
                  ),
                )}

              {d.winChanges.length > 0 &&
                block(
                  '字段变更',
                  d.winChanges.length,
                  d.winChanges.slice(0, MAX_CHANGES).map((c) => {
                    const i = d.byId.get(c.itemId)!
                    return row(
                      c.id,
                      i,
                      <>
                        <span className="text-slate-500">{FIELD_LABEL[c.field]}</span>
                        <span className="max-w-[120px] truncate text-slate-500 line-through decoration-slate-400">{formatChangeValue(c, c.before, timezone)}</span>
                        <span className="text-slate-400">→</span>
                        <span className="max-w-[150px] truncate font-medium text-slate-900">{formatChangeValue(c, c.after, timezone)}</span>
                      </>,
                    )
                  }),
                  d.winChanges.length - MAX_CHANGES,
                )}

              {d.fresh.length > 0 &&
                block(
                  '新增',
                  d.fresh.length,
                  d.fresh.slice(0, MAX_NEW).map((i) =>
                    row(
                      i.id,
                      i,
                      <>
                        <span className="max-w-[140px] truncate">{i.author.name}</span>
                        <Role role={i.author.role} />
                      </>,
                    ),
                  ),
                  d.fresh.length - MAX_NEW,
                )}

              {d.noCourse.length > 0 &&
                block(
                  '没能归到课程',
                  d.noCourse.length,
                  d.noCourse.map((i) =>
                    row(
                      i.id,
                      i,
                      <>
                        <span className="max-w-[140px] truncate">{i.author.name}</span>
                        <Role role={i.author.role} />
                      </>,
                    ),
                  ),
                )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-slate-50/70 px-6 py-3">
          <span className="text-xs text-slate-500">关闭后，这些内容仍在「自上次查看」中</span>
          <div className="flex flex-wrap gap-2">
            <Button onClick={close}>稍后再看</Button>
            {!empty && (
              <Button
                onClick={() => {
                  markWindowViewed()
                  close()
                }}
              >
                全部标记为已查看
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                close()
                navigate('/')
              }}
            >
              查看全部更新
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
