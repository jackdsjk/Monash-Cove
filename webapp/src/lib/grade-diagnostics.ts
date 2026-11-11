import type { MoodleGradeCourse } from '../types'
import { gradeBreakdown, isGradeMarked } from './grades'

/**
 * Adapted from Muster src/lib/diagnostics.ts (ad2372683e0fbc4efb148af8b81840ae8dee5f39).
 * Copyright 2026 Poetrynan. PolyForm Noncommercial 1.0.0; see muster/LICENSE and NOTICE.
 * Deliberate allowlist: no names, IDs, URLs, feedback, scores, outcomes or raw errors.
 */
function gradeShape(grade: string | undefined, max: number | null): string {
  const value = (grade ?? '').trim()
  if (!value || ['-', '–', '—'].includes(value)) return 'none'
  if (/-?\d+(?:\.\d+)?\s*(?:\/|out of)\s*\d/i.test(value)) return 'ratio'
  if (/%/.test(value)) return 'percent'
  if (/^-?\d+(\.\d+)?$/.test(value)) return max != null ? 'bare+max' : 'bare-no-max'
  return 'text'
}

export function buildGradeDiagnosticReport(courses: MoodleGradeCourse[]): string {
  const lines = ['Cove grade structure diagnostic (no scores, names, IDs or content)', `courses=${courses.length}`]
  courses.forEach((course, index) => {
    const rows = course.assessmentStructure ?? []
    const shapes: Record<string, number> = {}
    course.items.forEach((item) => {
      const shape = gradeShape(item.grade !== null ? String(item.grade) : item.gradeText ?? undefined, item.gradeMax)
      shapes[shape] = (shapes[shape] ?? 0) + 1
    })
    const breakdown = gradeBreakdown(course)
    lines.push(`course#${index + 1}: items=${course.items.length} categories=${rows.filter((row) => row.isCategory).length}` +
      ` marked=${course.items.filter(isGradeMarked).length}` +
      ` withMax=${course.items.filter((item) => item.gradeMax != null).length}` +
      ` linked=${rows.filter((row) => !!row.url).length} categoryIds=${rows.filter((row) => row.categoryId != null).length}` +
      ` matched=${rows.filter((row) => !row.isCategory && row.gradeItemId != null).length}` +
      ` gradeShapes=${JSON.stringify(shapes)} weightTotal=${Number(breakdown.totalWeight.toFixed(1))}` +
      ` weightsComplete=${breakdown.weightsComplete} structureStale=${course.assessmentStale === true}` +
      ` structureWarning=${!!course.assessmentWarning} detailWarning=${!!course.detailWarning}`)
  })
  return lines.join('\n')
}
