import { describe, expect, it } from 'vitest'
import { SECURITY_MARKET } from './data'
import { createGame as createSeededGame, executeCommand, replayGame, totalExpenses } from './engine'
import { chooseAutoplayCommand } from '../simulation/simulator'
import type { Asset, GameCommand, GameState } from './types'

const createLivingGame = (profession = '教师') => {
  const state = createSeededGame(1, 42, undefined, profession, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'standard', 'living-v1')
  state.currentPlayerIndex = 0
  return state
}

const run = (state: GameState, command: GameCommand) => {
  const result = executeCommand(state, command)
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`)
  return result.state
}

// Seed 42 rolls a 2 for the human; position 7 lands on a Splurge.
const landOnHoliday = (state: GameState, cash = 2000) => {
  state.players[0].cash = cash
  state.players[0].position = 7
  state.doodadDeck = ['doodad-holiday']
  state.seed = 42
  return run(state, { type: 'ROLL_DICE', actorId: 'player-human' })
}

const novaHolding = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'stock-nova#1', sourceId: 'stock-nova', name: 'NOVA 科技股', kind: 'stock', symbol: 'NOVA',
  quantity: 100, costPerUnit: 10, downPayment: 1000, mortgage: 0, cashFlow: 0, level: 1, baseCashFlow: 0,
  ...overrides,
})

describe('living economy', () => {
  it('starts every security at its base price', () => {
    const state = createLivingGame()
    for (const security of SECURITY_MARKET) {
      expect(state.securityPrices?.[security.symbol]).toBe(security.basePrice)
      expect(state.securityHistory?.[security.symbol]).toEqual([security.basePrice])
    }
    expect(createSeededGame(1, 42).securityPrices).toBeUndefined()
  })

  it('lets the player choose how to pay a Splurge', () => {
    const landed = landOnHoliday(createLivingGame())
    expect(landed.pendingDecision).toMatchObject({ type: 'doodad', cardId: 'doodad-holiday', cost: 1000 })
    expect(landed.players[0].cash).toBe(2000)
    expect(landed.turnStage).toBe('awaiting-decision')

    const paidCash = run(landed, { type: 'PAY_DOODAD', actorId: 'player-human', method: 'cash' })
    expect(paidCash.players[0].cash).toBe(1000)
    expect(paidCash.pendingDecision).toBeNull()
    expect(paidCash.turnStage).toBe('awaiting-end')

    const expensesBefore = totalExpenses(landed.players[0])
    const charged = run(landed, { type: 'PAY_DOODAD', actorId: 'player-human', method: 'credit' })
    expect(charged.players[0]).toMatchObject({ cash: 2000, creditCardDebt: 1000, creditCardPayment: 50 })
    expect(totalExpenses(charged.players[0])).toBe(expensesBefore + 50)
  })

  it('refuses a credit charge that would make monthly cash flow negative', () => {
    const state = createLivingGame()
    state.players[0].baseExpenses = state.players[0].salary
    const landed = landOnHoliday(state)

    expect(executeCommand(landed, { type: 'PAY_DOODAD', actorId: 'player-human', method: 'credit' })).toMatchObject({ ok: false, error: 'COMMAND_NOT_ALLOWED' })
    expect(executeCommand(landed, { type: 'PAY_DOODAD', actorId: 'player-human', method: 'cash' }).ok).toBe(true)
  })

  it('asks for a loan or sale when a cash payment leaves cash negative', () => {
    const landed = landOnHoliday(createLivingGame(), 400)
    const paid = run(landed, { type: 'PAY_DOODAD', actorId: 'player-human', method: 'cash' })

    expect(paid.players[0].cash).toBe(-600)
    expect(paid.pendingDecision).toMatchObject({ type: 'insolvency' })
  })

  it('pays off the whole credit card balance and lowers expenses', () => {
    const charged = run(landOnHoliday(createLivingGame()), { type: 'PAY_DOODAD', actorId: 'player-human', method: 'credit' })
    const expensesBefore = totalExpenses(charged.players[0])
    const repaid = run(charged, { type: 'REPAY_CREDIT_CARD', actorId: 'player-human' })

    expect(repaid.players[0]).toMatchObject({ cash: 1000, creditCardDebt: 0, creditCardPayment: 0 })
    expect(totalExpenses(repaid.players[0])).toBe(expensesBefore - 50)

    charged.players[0].cash = 999
    expect(executeCommand(charged, { type: 'REPAY_CREDIT_CARD', actorId: 'player-human' })).toMatchObject({ ok: false, error: 'INSUFFICIENT_CASH' })
  })

  it('moves prices once per round, deterministically and within bounds', () => {
    const endRound = () => {
      const state = createLivingGame()
      state.currentPlayerIndex = 1
      state.turnStage = 'awaiting-end'
      return run(state, { type: 'END_TURN', actorId: 'player-ai-1' })
    }
    const first = endRound()

    expect(first.turn).toBe(2)
    expect(first).toEqual(endRound())
    for (const security of SECURITY_MARKET) {
      const price = first.securityPrices![security.symbol]
      expect(first.securityHistory![security.symbol]).toEqual([security.basePrice, price])
      expect(price).toBeGreaterThanOrEqual(1)
      expect(price).toBeLessThanOrEqual(security.basePrice * 4)
    }
    expect(SECURITY_MARKET.some((security) => first.securityPrices![security.symbol] !== security.basePrice)).toBe(true)

    const midRound = createLivingGame()
    midRound.turnStage = 'awaiting-end'
    expect(run(midRound, { type: 'END_TURN', actorId: 'player-human' }).securityHistory!.NOVA).toHaveLength(1)
  })

  it('prices stock and fund deals at the current market price', () => {
    const state = createLivingGame()
    state.securityPrices = { ...state.securityPrices, NOVA: 6 }
    state.smallDealDeck = ['stock-nova']
    state.pendingDecision = { type: 'deal-choice', playerId: 'player-human' }
    state.turnStage = 'awaiting-decision'
    const drawn = run(state, { type: 'DRAW_DEAL', actorId: 'player-human', dealSize: 'small' })

    expect(drawn.pendingDecision).toMatchObject({ type: 'opportunity', opportunity: { costPerUnit: 6, downPayment: 600 } })
  })

  it('sells a security at the market price on the player’s turn', () => {
    const state = createLivingGame()
    state.securityPrices = { ...state.securityPrices, NOVA: 15 }
    state.players[0].assets = [novaHolding()]
    const cashBefore = state.players[0].cash
    const sold = run(state, { type: 'SELL_SECURITY', actorId: 'player-human', assetId: 'stock-nova#1' })

    expect(sold.players[0].cash).toBe(cashBefore + 1500)
    expect(sold.players[0].assets).toEqual([])
    expect(sold.logs.at(-1)?.message).toContain('盈利 $500')

    state.pendingDecision = { type: 'deal-choice', playerId: 'player-human' }
    state.turnStage = 'awaiting-decision'
    expect(executeCommand(state, { type: 'SELL_SECURITY', actorId: 'player-human', assetId: 'stock-nova#1' }).ok).toBe(false)

    const legacy = createSeededGame(1, 42)
    legacy.currentPlayerIndex = 0
    legacy.players[0].assets = [novaHolding()]
    expect(executeCommand(legacy, { type: 'SELL_SECURITY', actorId: 'player-human', assetId: 'stock-nova#1' }).ok).toBe(false)
  })

  it('can sell a security to cover a cash shortfall', () => {
    const state = createLivingGame()
    state.players[0].assets = [novaHolding()]
    state.players[0].cash = -500
    state.pendingDecision = { type: 'insolvency', playerId: 'player-human', reason: 'test' }
    state.turnStage = 'awaiting-decision'
    const sold = run(state, { type: 'SELL_SECURITY', actorId: 'player-human', assetId: 'stock-nova#1' })

    expect(sold.players[0].cash).toBe(500)
    expect(sold.pendingDecision).toBeNull()
    expect(sold.turnStage).toBe('awaiting-end')
  })

  it('lets market news set the price of the security it names', () => {
    const state = createLivingGame()
    state.players[0].position = 5
    state.seed = 42
    state.marketDeck = ['market-nova-high']
    const landed = run(state, { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(landed.players[0].position).toBe(7)
    expect(landed.securityPrices?.NOVA).toBe(35)
    expect(landed.securityHistory?.NOVA.at(-1)).toBe(35)
  })

  it('replays a living-economy game to the same state', () => {
    let state = createLivingGame()
    for (let step = 0; step < 400 && !state.winnerId; step += 1) {
      state = run(state, chooseAutoplayCommand(state))
    }
    expect(state.commandHistory.some((command) => command.type === 'PAY_DOODAD')).toBe(true)
    expect(replayGame(state)).toEqual(state)
  })
})
