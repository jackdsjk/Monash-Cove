import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, FileText, Search } from 'lucide-react'
import { useStore } from '../store'
import { navigate, type Route } from '../lib/router'
import { NAV } from './nav'
import { Source } from './ui'

type Result = { key: string; kind: 'page'; label: string; route: Route } | { key: string; kind: 'item'; label: string; id: string; meta: string; source: import('../data/model').SourceId }

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, items, openItem } = useStore()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, setPaletteOpen])

  useEffect(() => {
    if (paletteOpen) {
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [paletteOpen])

  const results = useMemo<Result[]>(() => {
    const s = q.trim().toLowerCase()
    const pages: Result[] = NAV.filter((n) => !s || n.label.toLowerCase().includes(s) || n.route.includes(s)).map((n) => ({
      key: n.route,
      kind: 'page',
      label: n.label,
      route: n.route,
    }))
    const found: Result[] = s
      ? items
          .filter((i) => `${i.course} ${i.title} ${i.author.name}`.toLowerCase().includes(s))
          .slice(0, 8)
          .map((i) => ({ key: i.id, kind: 'item', label: i.title, id: i.id, meta: i.course || '没能归到课程', source: i.source }))
      : []
    return [...pages, ...found]
  }, [q, items])

  if (!paletteOpen) return null

  const run = (r: Result) => {
    setPaletteOpen(false)
    if (r.kind === 'page') navigate(r.route)
    else openItem(r.id)
  }

  return (
    <div className="overlay-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/25 pt-[12vh]" onClick={() => setPaletteOpen(false)}>
      <div
        role="dialog"
        aria-label="跳转"
        onClick={(e) => e.stopPropagation()}
        className="dialog-enter w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && results[active]) {
                run(results[active])
              } else if (e.key === 'Escape') {
                setPaletteOpen(false)
              }
            }}
            placeholder="跳转到页面，或搜索课程、标题、发布者"
            className="h-12 flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-slate-500">Esc</kbd>
        </div>
        <ul className="scroll-y max-h-[50vh] py-1.5">
          {results.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-slate-500">没有匹配的结果</li>}
          {results.map((r, i) => (
            <li key={r.key}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => run(r)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${i === active ? 'bg-brand-50' : ''}`}
              >
                {r.kind === 'page' ? (
                  <>
                    <span className="w-14 text-xs text-slate-500">页面</span>
                    <span className="flex-1 text-slate-800">{r.label}</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-slate-800">{r.label}</span>
                    <span className="text-xs text-slate-500">{r.meta}</span>
                    <Source id={r.source} className="text-xs" />
                  </>
                )}
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
