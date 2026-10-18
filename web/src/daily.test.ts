// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createDailyGame, dailyDate, dailySeed, dailyStreak, isBetterDailyResult, loadDailyResults, recordDailyResult } from './daily'
import { replayGame } from './game-core/engine'

describe('daily challenge', () => {
  beforeEach(() => localStorage.clear())

  it('deals the same game to everyone on the same UTC day', () => {
    expect(dailyDate(new Date('2026-10-18T23:30:00-08:00'))).toBe('2026-10-19')
    expect(dailySeed('2026-10-18')).toBe(dailySeed('2026-10-18'))
    expect(dailySeed('2026-10-18')).not.toBe(dailySeed('2026-10-19'))
    const game = createDailyGame('2026-10-18')
    expect(game).toEqual(createDailyGame('2026-10-18'))
    expect(game.setup).toMatchObject({ dailyChallenge: '2026-10-18', pace: 'quick', economyRulesVersion: 'living-v1', aiCount: 2 })
    expect(replayGame(game).players).toEqual(game.players)
  })

  it('ranks wins first, then fewer rounds, then score', () => {
    expect(isBetterDailyResult({ won: true, rounds: 20, score: 50 }, { won: false, rounds: 8, score: 90 })).toBe(true)
    expect(isBetterDailyResult({ won: true, rounds: 9, score: 70 }, { won: true, rounds: 10, score: 90 })).toBe(true)
    expect(isBetterDailyResult({ won: true, rounds: 10, score: 70 }, { won: true, rounds: 10, score: 90 })).toBe(false)
    expect(isBetterDailyResult({ won: false, rounds: 30, score: 60 }, { won: false, rounds: 12, score: 55 })).toBe(true)
  })

  it('keeps only the best result of the day', () => {
    expect(recordDailyResult('2026-10-18', { won: false, rounds: 12, score: 55 })).toBe(true)
    expect(recordDailyResult('2026-10-18', { won: true, rounds: 14, score: 80 })).toBe(true)
    expect(recordDailyResult('2026-10-18', { won: true, rounds: 16, score: 95 })).toBe(false)
    expect(loadDailyResults()['2026-10-18']).toEqual({ won: true, rounds: 14, score: 80 })
  })

  it('counts consecutive won days, including yesterday while today is unplayed', () => {
    const won = { won: true, rounds: 10, score: 80 }
    const results = { '2026-10-15': won, '2026-10-16': won, '2026-10-17': won, '2026-10-13': won }
    expect(dailyStreak(results, '2026-10-18')).toBe(3)
    expect(dailyStreak({ ...results, '2026-10-18': won }, '2026-10-18')).toBe(4)
    expect(dailyStreak({ ...results, '2026-10-17': { ...won, won: false } }, '2026-10-18')).toBe(0)
    expect(dailyStreak({}, '2026-10-18')).toBe(0)
  })
})
