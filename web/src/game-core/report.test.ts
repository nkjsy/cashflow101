import { describe, expect, it } from 'vitest'
import { playBasicAiTurn } from './ai'
import { createGame, executeCommand, totalExpenses } from './engine'
import { buildGameReport } from './report'
import { chooseAutoplayCommand } from '../simulation/simulator'
import type { GameState } from './types'

const playToEnd = (state: GameState) => {
  let next = state
  for (let step = 0; step < 6000 && !next.winnerId; step += 1) {
    const actorId = next.pendingDecision?.playerId ?? next.players[next.currentPlayerIndex].id
    next = next.players.find((player) => player.id === actorId)!.isHuman
      ? executeCommand(next, chooseAutoplayCommand(next)).state
      : playBasicAiTurn(next)
  }
  return next
}

describe('game report', () => {
  const finished = playToEnd(createGame(2, 7, undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'standard', 'living-v1'))
  const report = buildGameReport(finished)!

  it('charts one point per round, ending on the final state', () => {
    expect(finished.winnerId).not.toBeNull()
    expect(report.points.map((point) => point.round)).toEqual(Array.from({ length: finished.turn }, (_, index) => index + 1))
    const human = finished.players[0]
    expect(report.points.at(-1)).toEqual({ round: finished.turn, cash: human.cash, passiveIncome: human.passiveIncome, expenses: totalExpenses(human) })
  })

  it('marks the round the player reached the Freedom Lane', () => {
    expect(report.fastTrackRound).not.toBeNull()
    expect(report.highlights).toContainEqual({ kind: 'fast-track', round: report.fastTrackRound })
    const pointAfterExit = report.points.find((point) => point.round === report.fastTrackRound! + 1)!
    expect(pointAfterExit.passiveIncome).toBeGreaterThan(pointAfterExit.expenses)
  })

  it('lists highlights in round order without repeating the first purchase', () => {
    const rounds = report.highlights.map((highlight) => highlight.round)
    expect(rounds).toEqual([...rounds].sort((left, right) => left - right))
    const purchases = report.highlights.flatMap((highlight) =>
      highlight.kind === 'first-asset' || highlight.kind === 'best-deal' ? [`${highlight.round}:${highlight.asset}`] : [])
    expect(purchases.length).toBeGreaterThan(0)
    expect(new Set(purchases).size).toBe(purchases.length)
  })

  it('returns null when there is no history to replay', () => {
    expect(buildGameReport(createGame(1, 1))).toBeNull()
    expect(buildGameReport({ ...finished, commandHistory: [{ type: 'BUY_DREAM', actorId: 'player-human' }] })).toBeNull()
  })
})
