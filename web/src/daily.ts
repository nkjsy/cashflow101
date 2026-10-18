import { createGame } from './game-core/engine'
import { finalPlayerScore } from './game-core/selectors'
import type { GameState } from './game-core/types'
import { storage } from './platform/storage'

const DAILY_RESULTS_KEY = 'cashflow-lab-daily-results'

export type DailyResult = { won: boolean; rounds: number; score: number }

// The challenge day follows UTC so every player gets the same deck at the same moment.
export const dailyDate = (now = new Date()) => now.toISOString().slice(0, 10)

// FNV-1a over the date, so each day maps to a stable 32-bit seed.
export const dailySeed = (date: string) => {
  let hash = 0x811c9dc5
  for (const character of `ratrace-daily-${date}`) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// Fixed settings keep every attempt comparable: quick pace, two standard AIs, and the
// profession and dream the seed deals out.
export const createDailyGame = (date: string): GameState => {
  const game = createGame(2, dailySeed(date), undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'quick', 'living-v1')
  return { ...game, setup: { ...game.setup, dailyChallenge: date } }
}

export const dailyResultOf = (game: GameState): DailyResult | null => {
  const human = game.players[0]
  if (!game.winnerId && !human.bankrupt) return null
  return { won: game.winnerId === human.id, rounds: game.turn, score: finalPlayerScore(human, game.winnerId).total }
}

// A win beats a loss, fewer rounds beat more, and a higher score breaks ties.
export const isBetterDailyResult = (candidate: DailyResult, current?: DailyResult) => {
  if (!current) return true
  if (candidate.won !== current.won) return candidate.won
  if (candidate.won && candidate.rounds !== current.rounds) return candidate.rounds < current.rounds
  return candidate.score > current.score
}

export const loadDailyResults = (): Record<string, DailyResult> => {
  try {
    const parsed = JSON.parse(storage.get(DAILY_RESULTS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Stores the result if it beats the day's best and returns whether it did.
export const recordDailyResult = (date: string, result: DailyResult) => {
  const results = loadDailyResults()
  if (!isBetterDailyResult(result, results[date])) return false
  storage.set(DAILY_RESULTS_KEY, JSON.stringify({ ...results, [date]: result }))
  return true
}

const previousDate = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return dailyDate(day)
}

// Consecutive won days ending today, or ending yesterday while today is still unplayed.
export const dailyStreak = (results: Record<string, DailyResult>, today: string) => {
  let date = results[today]?.won ? today : previousDate(today)
  let streak = 0
  while (results[date]?.won) {
    streak += 1
    date = previousDate(date)
  }
  return streak
}
