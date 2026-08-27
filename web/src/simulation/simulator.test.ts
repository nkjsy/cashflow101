import { describe, expect, it } from 'vitest'
import { createGame } from '../game-core/engine'
import { aggregateSimulations } from './simulator'

describe('headless game simulation', () => {
  it('runs 500 seeded games within the target duration without invariant violations', () => {
    const report = aggregateSimulations(
      { games: 500, maxRounds: 100, baseSeed: 1, aiCount: 3 },
      (seed) => createGame(3, seed),
    )

    expect(report.games).toHaveLength(500)
    expect(report.averageCommands).toBeGreaterThan(0)
    expect(report.games.every((game) => game.commands < 100 * 4 * 8)).toBe(true)
    expect(report.completionRate).toBeGreaterThanOrEqual(0.95)
    expect(report.medianRounds).toBeLessThanOrEqual(50)
    expect(report.p90Rounds).toBeLessThanOrEqual(70)
    expect(report.gamesWithFastTrackEntryRate).toBeGreaterThanOrEqual(0.95)
    expect(report.medianFirstFastTrackRound).toBeLessThanOrEqual(28)
    expect(report.p90FirstFastTrackRound).toBeLessThanOrEqual(45)
    expect(report.gamesWithBankruptcyRate).toBeLessThanOrEqual(0.35)
    expect(report.oneRoundFastTrackWinRate).toBe(0)
    expect(Object.values(report.winRoutes).reduce((sum, route) => sum + route.wins, 0)).toBe(report.completedGames)
    expect(report.winRoutes['business-income'].wins).toBeGreaterThan(0)
    expect(report.winRoutes.dream.wins).toBeGreaterThan(0)
    expect(report.medianWinnerFastTrackRounds).toBeGreaterThanOrEqual(4)
    expect(report.medianWinnerFastTrackRounds).toBeLessThanOrEqual(8)
    expect(Object.keys(report.professionStats)).toHaveLength(8)
    expect(report.games.every((game) => game.professionOutcomes.every((outcome) => outcome.longTermGoal))).toBe(true)
    expect(Object.values(report.insurancePurchases).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0)
    expect(Object.values(report.insuranceClaims).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0)
    expect(report.professionSkillTriggers.护士).toBeGreaterThan(0)
    expect(report.professionSkillTriggers['护士:牙科']).toBeGreaterThan(0)
    expect(report.professionSkillTriggers['护士:添丁']).toBeGreaterThan(0)
    expect(report.professionSkillTriggers.律师).toBeGreaterThan(0)
    expect(report.professionSkillTriggers.工程师).toBeGreaterThan(0)
    expect(report.professionSkillValue.护士).toBeGreaterThan(0)
    expect(report.professionSkillValue.律师).toBeGreaterThan(0)
    expect(report.professionSkillValue.工程师).toBeGreaterThan(0)
    expect(Object.values(report.professionStats).every((stats) => stats.appearances > 0)).toBe(true)
    expect(Object.values(report.professionStats).reduce((sum, stats) => sum + stats.appearances, 0)).toBe(2000)
  })
})