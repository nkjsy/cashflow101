// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { isProfessionUnlocked, loadAchievements, recordAchievements } from './achievements'

describe('achievement storage', () => {
  beforeEach(() => localStorage.clear())

  it('records each achievement once, with the date it was first earned', () => {
    expect(recordAchievements(['first-win', 'clean-exit'], '2026-10-18')).toEqual(['first-win', 'clean-exit'])
    expect(recordAchievements(['first-win', 'landlord'], '2026-10-19')).toEqual(['landlord'])
    expect(loadAchievements()).toEqual({ 'first-win': '2026-10-18', 'clean-exit': '2026-10-18', landlord: '2026-10-19' })
  })

  it('unlocks the extra professions at their achievement counts', () => {
    expect(isProfessionUnlocked('教师', 0)).toBe(true)
    expect(isProfessionUnlocked('程序员', 2)).toBe(false)
    expect(isProfessionUnlocked('程序员', 3)).toBe(true)
    expect(isProfessionUnlocked('厨师', 5)).toBe(false)
    expect(isProfessionUnlocked('厨师', 6)).toBe(true)
  })
})
