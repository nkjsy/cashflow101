import { describe, expect, it } from 'vitest'
import { playBasicAiTurn } from './ai'
import { ACHIEVEMENT_IDS, evaluateAchievements } from './achievements'
import { createGame, executeCommand } from './engine'
import { chooseAutoplayCommand } from '../simulation/simulator'

describe('achievements', () => {
  it('awards final-state achievements even without a replayable history', () => {
    const game = createGame(3, 1, undefined, undefined, 'expert')
    expect(evaluateAchievements(game)).toEqual([])

    game.winnerId = 'player-human'
    expect(evaluateAchievements(game)).toEqual(['first-win', 'expert-slayer'])
    expect(evaluateAchievements(game, { dailyStreak: 3 })).toContain('daily-streak')
    expect(evaluateAchievements({ ...game, setup: { ...game.setup, aiDifficulty: 'standard' } })).toEqual(['first-win'])
  })

  it('reads the whole game history of a finished game', () => {
    let state = createGame(2, 1, undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'standard', 'living-v1')
    for (let step = 0; step < 6000 && !state.winnerId; step += 1) {
      const actorId = state.pendingDecision?.playerId ?? state.players[state.currentPlayerIndex].id
      state = state.players.find((player) => player.id === actorId)!.isHuman
        ? executeCommand(state, chooseAutoplayCommand(state)).state
        : playBasicAiTurn(state)
    }
    const earned = evaluateAchievements(state)

    expect(state.winnerId).toBe('player-human')
    expect(earned).toContain('first-win')
    expect(earned.every((id) => ACHIEVEMENT_IDS.includes(id))).toBe(true)
    expect(earned.includes('cash-only')).toBe(!state.commandHistory.some((command) => command.actorId === 'player-human' && command.type === 'PAY_DOODAD' && command.method === 'credit'))
    expect(evaluateAchievements(state)).toEqual(earned)
  })
})
