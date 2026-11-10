import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchBrief, setItemCompleted } from '../data/repository'
import type { Item } from '../data/model'
import { fmtCountdown, fmtDue } from '../lib/time'
import { Button, Course, DuePill, PageTitle, Panel, SectionHeader, Source, Tag } from '../components/ui'

const H = 3600_000
const COLS = 'grid-cols-[180px_110px_76px_84px_minmax(0,1fr)_110px]'

export function DeadlinesPage() {
  const { items, now, marks, openItem, setMark } = useStore()
  const [completed, setCompleted] = useState<Record<string, boolean>>({})

  // 已提交以本地服务的 completed_at 为准；服务不可用时退回本地标记，不展示推断结果。
  useEffect(() => {
    let active = true
    void fetchBrief()
      .then(({ items: brief }) => {
        if (!active) return
        const next: Record<string, boolean> = {}
        for (const item of brief) next[item.id] = Boolean(item.completedAt)
        setCompleted(next)
      })
      .catch(() => {
        /* 读不到就沿用本地标记 */
      })
    return () => {
      active = false
    }
  }, [])

  const withDue = items.filter((i) => i.dueAt).sort((a, b) => a.dueAt! - b.dueAt!)

  const groups: { title: string; list: Item[] }[] = [
    { title: '已截止', list: withDue.filter((i) => i.dueAt! <= now).reverse() },
    { title: '24 小时内', list: withDue.filter((i) => i.dueAt! > now && i.dueAt! - now <= 24 * H) },
    { title: '7 天内', list: withDue.filter((i) => i.dueAt! - now > 24 * H && i.dueAt! - now <= 7 * 24 * H) },
    { title: '更晚', list: withDue.filter((i) => i.dueAt! - now > 7 * 24 * H) },
  ]

  const isSubmitted = (id: string) => Boolean(marks[id]?.submitted) || Boolean(completed[id])

  const toggleSubmitted = (id: string, next: boolean) => {
    const previous = isSubmitted(id)
    setMark(id, { submitted: next ? true : undefined })
    setCompleted((prev) => ({ ...prev, [id]: next }))
    void setItemCompleted(id, next ? true : null).catch(() => {
      setMark(id, { submitted: previous ? true : undefined })
      setCompleted((prev) => ({ ...prev, [id]: previous }))
    })
  }

  return (
    <div className="mx-auto max-w-[1240px] px-10 py-8">
      <PageTitle title="截止时间" description={`共 ${withDue.length} 项有结构化截止时间。没有结构化截止时间的条目不显示。`} />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title}>
            <SectionHeader title={g.title} count={g.list.length} />
            <Panel className="overflow-hidden">
              {g.list.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">无</p>
              ) : (
                <div className="divide-y divide-line">
                  {g.list.map((i) => {
                    const submitted = isSubmitted(i.id)
                    return (
                      <div key={i.id} className={`grid items-center gap-3 px-5 py-3 text-sm hover:bg-brand-50/50 ${COLS} ${submitted ? 'text-slate-500' : 'text-slate-800'}`}>
                        <span>{fmtDue(i.dueAt!)}</span>
                        <span className="flex items-center gap-2">
                          <DuePill due={i.dueAt!} now={now} />
                          <span className="sr-only">{fmtCountdown(i.dueAt!, now)}</span>
                        </span>
                        <Course code={i.course} />
                        <Source id={i.source} />
                        <button onClick={() => openItem(i.id)} className="truncate text-left hover:text-brand-700 hover:underline">
                          {i.title}
                        </button>
                        <span className="flex justify-end">
                          {submitted ? (
                            <button onClick={() => toggleSubmitted(i.id, false)} title="撤销已提交标记">
                              <Tag tone="green">已提交</Tag>
                            </button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => toggleSubmitted(i.id, true)}>
                              标记已提交
                            </Button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </section>
        ))}
      </div>
    </div>
  )
}
