import type { EdMaterialFile, EdMaterialSlide } from '../types'

/** Natural ordering uses the platform's numeric collation, including Week 2 before Week 10. */
const titleOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function learningWeek(title: string): number | null {
  const match = /(?:\b(?:week|wk)\s*[-_:]?\s*(\d+)\b|第\s*(\d+)\s*周)/i.exec(title.normalize('NFKC'))
  return match ? Number(match[1] ?? match[2]) : null
}

export function compareLearningTitles(a: { title: string }, b: { title: string }): number {
  const aWeek = learningWeek(a.title)
  const bWeek = learningWeek(b.title)
  if (aWeek !== null || bWeek !== null) {
    if (aWeek === null) return 1
    if (bWeek === null) return -1
    if (aWeek !== bWeek) return aWeek - bWeek
  }
  return titleOrder.compare(a.title, b.title)
}

/** The legacy material pages searched local titles rather than refetching upstream. */
export function matchesLearningSearch(query: string, ...text: string[]): boolean {
  const needle = query.trim().normalize('NFKC').toLocaleLowerCase()
  return !needle || text.some((value) => value.normalize('NFKC').toLocaleLowerCase().includes(needle))
}

/** A lesson entry can contain both a video and downloadable files. */
export function matchesEdFileKind(file: EdMaterialFile, kind: string): boolean {
  return kind === 'all' || kind === 'file' || kind === file.kind
}

export function matchesEdMaterialKind(slide: EdMaterialSlide, kind: string): boolean {
  return kind === 'all' || slide.type === kind || slide.files.some((file) => matchesEdFileKind(file, kind))
}
