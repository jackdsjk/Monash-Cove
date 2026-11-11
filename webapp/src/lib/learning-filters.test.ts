import { describe, expect, it } from 'vitest'
import { compareLearningTitles, learningWeek, matchesEdFileKind, matchesEdMaterialKind, matchesLearningSearch } from './learning-filters'

describe('learning material filters', () => {
  it('orders weeks from earliest to latest without mutating the source list', () => {
    const titles = ['Week 10 - Lecture', 'Week 2 - Lecture 10', 'Week 01 - Intro', 'Week 2 - Lecture 2']
    const source = titles.map((title) => ({ title }))
    expect([...source].sort(compareLearningTitles).map((item) => item.title))
      .toEqual(['Week 01 - Intro', 'Week 2 - Lecture 2', 'Week 2 - Lecture 10', 'Week 10 - Lecture'])
    expect(source.map((item) => item.title)).toEqual(titles)
  })

  it('recognizes explicit week labels and retains material with no declared week', () => {
    expect(learningWeek('Week0 Orientation')).toBe(0)
    expect(learningWeek('Wk-12 Revision')).toBe(12)
    expect(learningWeek('第 ２ 周 练习')).toBe(2)
    expect(learningWeek('Assignment 10')).toBeNull()
    expect(learningWeek('Weekend 2')).toBeNull()
    expect([{ title: 'Guide 10' }, { title: 'Week 2' }, { title: 'Guide 2' }].sort(compareLearningTitles))
      .toEqual([{ title: 'Week 2' }, { title: 'Guide 2' }, { title: 'Guide 10' }])
  })

  it('finds attachments on video entries without losing video classification', () => {
    const pdf = { name: 'Lecture.pdf', url: 'https://ed.example.invalid/lecture.pdf', kind: 'pdf' as const }
    const slide = { id: 1, title: 'Video', type: 'video' as const, url: '', text: '', markdown: '', videoUrls: ['https://ed.example.invalid/video'], files: [pdf] }
    expect(matchesEdMaterialKind(slide, 'video')).toBe(true)
    expect(matchesEdMaterialKind(slide, 'file')).toBe(true)
    expect(matchesEdMaterialKind(slide, 'pdf')).toBe(true)
    expect(matchesEdMaterialKind(slide, 'slides')).toBe(false)
    expect(matchesEdMaterialKind({ ...slide, files: [{ ...pdf, kind: 'slides' }] }, 'slides')).toBe(true)
    expect(matchesEdFileKind(pdf, 'file')).toBe(true)
    expect(matchesEdFileKind(pdf, 'video')).toBe(false)
  })

  it('searches titles and section names case-insensitively without inventing a week', () => {
    expect(matchesLearningSearch('  READING ', 'Week 2', 'Required Reading')).toBe(true)
    expect(matchesLearningSearch('week 2', 'Week 2', 'Lecture')).toBe(true)
    expect(matchesLearningSearch('PDF', 'Week 1', 'Quiz')).toBe(false)
    expect(matchesLearningSearch(' ', 'Untitled')).toBe(true)
  })
})
