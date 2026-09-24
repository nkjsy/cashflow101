import { describe, expect, it } from 'vitest'
import { playBasicAiTurn } from '../game-core/ai'
import { BIG_DEALS, DOODADS, DREAMS, FAST_TRACK_BUSINESSES, FAST_TRACK_RISKS, MARKETS, PROFESSIONS, SMALL_DEALS } from '../game-core/data'
import { ECONOMIC_CYCLES, createGame, executeCommand } from '../game-core/engine'
import type { GameLogEntry, GameState } from '../game-core/types'
import { chooseAutoplayCommand } from '../simulation/simulator'
import { CONTENT_EN } from './content-en'
import { formatTemplate, renderText } from './format'
import { LOG_EN } from './log-en'
import { UI_EN } from './ui-en'

const HAN = /[一-鿿]/

const playCollectingLogs = (initial: GameState, maxSteps: number) => {
  const logs = new Map<number, GameLogEntry>()
  let state = initial
  for (let step = 0; step < maxSteps && !state.winnerId; step += 1) {
    const actorId = state.pendingDecision?.playerId ?? state.players[state.currentPlayerIndex].id
    const actor = state.players.find((player) => player.id === actorId)!
    const next = actor.isHuman
      ? executeCommand(state, chooseAutoplayCommand(state)).state
      : playBasicAiTurn(state)
    if (next === state) break
    state = next
    for (const entry of state.logs) logs.set(entry.id, entry)
  }
  return { state, logs: [...logs.values()] }
}

describe('translations', () => {
  it('fills placeholders, nested texts, names and plurals', () => {
    expect(formatTemplate('{count} {count|turn|turns}', { count: 1 }, String)).toBe('1 turn')
    expect(formatTemplate('{count} {count|turn|turns}', { count: 3 }, String)).toBe('3 turns')
    const text = { key: '购买 {asset}，{income}', params: { asset: { n: '社区洗衣店' }, income: { key: '被动收入 +${amount}/月。', params: { amount: 1200 } } } }
    expect(renderText(text, 'zh', LOG_EN, CONTENT_EN)).toBe('购买 社区洗衣店，被动收入 +$1,200/月。')
    expect(renderText(text, 'en', LOG_EN, CONTENT_EN)).toBe('Bought Neighborhood Laundromat. Passive income +$1,200/mo.')
  })

  it('has English for every piece of game data', () => {
    const names = [
      ...PROFESSIONS.flatMap((profession) => [profession.title, profession.summary]),
      ...DREAMS,
      ...[...SMALL_DEALS, ...BIG_DEALS].flatMap((deal) => [deal.name, deal.description]),
      ...DOODADS.flatMap((card) => [card.name, card.description]),
      ...MARKETS.flatMap((card) => [card.name, card.description]),
      ...FAST_TRACK_BUSINESSES.flatMap((business) => [business.name, business.description]),
      ...FAST_TRACK_RISKS.flatMap((risk) => [risk.name, risk.description]),
      ...ECONOMIC_CYCLES.flatMap((cycle) => [cycle.name, cycle.description]),
      '你', '林晓', '周远', '陈禾',
    ]
    expect(names.filter((name) => !CONTENT_EN[name])).toEqual([])
  })

  it('keeps English dictionaries free of untranslated Chinese', () => {
    const values = [...Object.values(LOG_EN), ...Object.values(UI_EN), ...Object.values(CONTENT_EN)]
    expect(values.filter((value) => HAN.test(value))).toEqual([])
  })

  it('renders every engine and AI log in English across full games', () => {
    const untranslated = new Set<string>()
    for (const [seed, pace] of [[11, 'standard'], [12, 'quick'], [13, 'standard'], [14, 'quick']] as const) {
      const game = createGame(3, seed, undefined, undefined, 'expert', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, pace)
      const { state, logs } = playCollectingLogs(game, 4000)
      expect(state.winnerId).not.toBeNull()
      expect(logs.some((entry) => entry.message.includes('经过自由快道收益日'))).toBe(true)
      for (const entry of logs) {
        expect(entry.text).toBeDefined()
        const english = renderText(entry.text!, 'en', LOG_EN, CONTENT_EN)
        if (HAN.test(english)) untranslated.add(english)
        expect(renderText(entry.text!, 'zh', LOG_EN, CONTENT_EN)).toBe(entry.message)
      }
    }
    expect([...untranslated]).toEqual([])
  })
})
