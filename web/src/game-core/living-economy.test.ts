import { describe, expect, it } from 'vitest'
import { BIG_DEALS, DOODADS, EXPANSION_CARD_IDS, FAST_TRACK_BOARD, FAST_TRACK_BUSINESSES, FAST_TRACK_DREAM_BY_POSITION, FAST_TRACK_RISKS, MARKETS, SECURITY_MARKET, SMALL_DEALS } from './data'
import { createGame as createSeededGame, executeCommand, replayGame, totalExpenses } from './engine'
import { chooseAutoplayCommand } from '../simulation/simulator'
import { playBasicAiTurn } from './ai'
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

  it('adds the expansion cards to new games only', () => {
    const living = createLivingGame()
    const legacy = createSeededGame(1, 42)
    const decks = (state: GameState) => [state.smallDealDeck, state.bigDealDeck, state.doodadDeck, state.marketDeck, state.fastTrackBusinessDeck, state.fastTrackRiskDeck]
    const allCards = [SMALL_DEALS, BIG_DEALS, DOODADS, MARKETS, FAST_TRACK_BUSINESSES, FAST_TRACK_RISKS]

    expect(decks(living).map((deck) => deck.length)).toEqual(allCards.map((cards) => cards.length))
    expect(decks(legacy).flat().filter((id) => EXPANSION_CARD_IDS.has(id))).toEqual([])
    expect(decks(legacy).map((deck) => deck.length)).toEqual(allCards.map((cards) => cards.filter((card) => !EXPANSION_CARD_IDS.has(card.id)).length))
    const knownIds = new Set(allCards.flat().map((card) => card.id))
    expect([...EXPANSION_CARD_IDS].filter((id) => !knownIds.has(id))).toEqual([])
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

  it('gives the unlockable professions their skills', () => {
    const developer = createLivingGame('程序员')
    developer.securityPrices = { ...developer.securityPrices, NOVA: 15 }
    developer.players[0].assets = [novaHolding()]
    const cashBefore = developer.players[0].cash
    const sold = run(developer, { type: 'SELL_SECURITY', actorId: 'player-human', assetId: 'stock-nova#1' })
    expect(sold.players[0].cash).toBe(cashBefore + 1500 + 100)
    expect(sold.logs.at(-1)?.message).toContain('量化交易 +$100')

    const chef = landOnHoliday(createLivingGame('厨师'))
    const teacher = landOnHoliday(createLivingGame('教师'))
    // $1,200 holiday × 0.75 lifestyle factor (low expenses) × 0.75 chef discount, rounded to $50.
    expect(chef.pendingDecision).toMatchObject({ type: 'doodad', cost: 700 })
    expect(teacher.pendingDecision).toMatchObject({ type: 'doodad', cost: 1000 })
  })

  it('lets a player pass a drawn deal on to the others for a finder’s fee', () => {
    const state = createSeededGame(2, 42, undefined, '教师', 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'standard', 'living-v1')
    state.currentPlayerIndex = 0
    const laundry = SMALL_DEALS.find((deal) => deal.id === 'asset-neighborhood-laundry')!
    state.players[1].cash = 20000
    state.pendingDecision = { type: 'opportunity', playerId: 'player-human', opportunity: laundry }
    state.turnStage = 'awaiting-decision'
    const offered = run(state, { type: 'TRANSFER_OPPORTUNITY', actorId: 'player-human' })
    expect(offered.pendingDecision).toMatchObject({ type: 'deal-offer', playerId: 'player-ai-1', sellerId: 'player-human', fee: 500, responderIds: ['player-ai-1', 'player-ai-2'] })

    const passedOn = run(offered, { type: 'DECLINE_DEAL_OFFER', actorId: 'player-ai-1' })
    expect(passedOn.pendingDecision).toMatchObject({ type: 'deal-offer', playerId: 'player-ai-2', responderIds: ['player-ai-2'] })
    const lapsed = run(passedOn, { type: 'DECLINE_DEAL_OFFER', actorId: 'player-ai-2' })
    expect(lapsed.pendingDecision).toBeNull()
    expect(lapsed.turnStage).toBe('awaiting-end')

    const buyerCash = offered.players[1].cash
    const sellerCash = offered.players[0].cash
    const taken = run(offered, { type: 'ACCEPT_DEAL_OFFER', actorId: 'player-ai-1' })
    expect(taken.players[1].cash).toBe(buyerCash - laundry.downPayment - 500)
    expect(taken.players[0].cash).toBe(sellerCash + 500)
    expect(taken.players[1].assets.map((asset) => asset.sourceId)).toEqual(['asset-neighborhood-laundry'])
    expect(taken.currentPlayerIndex).toBe(0)
    expect(taken.turnStage).toBe('awaiting-end')
  })

  it('only transfers property and business deals in the living economy', () => {
    const living = createLivingGame()
    living.pendingDecision = { type: 'opportunity', playerId: 'player-human', opportunity: SMALL_DEALS.find((deal) => deal.id === 'stock-nova')! }
    living.turnStage = 'awaiting-decision'
    expect(executeCommand(living, { type: 'TRANSFER_OPPORTUNITY', actorId: 'player-human' }).ok).toBe(false)

    const legacy = createSeededGame(1, 42)
    legacy.currentPlayerIndex = 0
    legacy.pendingDecision = { type: 'opportunity', playerId: 'player-human', opportunity: SMALL_DEALS[0] }
    legacy.turnStage = 'awaiting-decision'
    expect(executeCommand(legacy, { type: 'TRANSFER_OPPORTUNITY', actorId: 'player-human' }).ok).toBe(false)
  })

  it('does not let an AI answering an offer settle the human’s turn', () => {
    const state = createLivingGame()
    state.players[0].bankLoan = 2000
    state.players[0].cash = 20000
    state.players[1].cash = 50000
    state.pendingDecision = { type: 'opportunity', playerId: 'player-human', opportunity: SMALL_DEALS.find((deal) => deal.id === 'asset-neighborhood-laundry')! }
    state.turnStage = 'awaiting-decision'
    const offered = run(state, { type: 'TRANSFER_OPPORTUNITY', actorId: 'player-human' })
    const answered = playBasicAiTurn(offered)

    expect(answered.pendingDecision).toBeNull()
    expect(answered.players[0].bankLoan).toBe(2000)
    expect(answered.currentPlayerIndex).toBe(0)
    expect(answered.commandHistory.filter((command) => command.actorId === 'player-human').map((command) => command.type)).toEqual(['TRANSFER_OPPORTUNITY'])
  })

  it('pays half a Revenue Day on arrival in the Freedom Lane', () => {
    const state = createLivingGame()
    state.players[0].cash = 10000
    state.pendingDecision = { type: 'opportunity', playerId: 'player-human', opportunity: { ...SMALL_DEALS[0], downPayment: 1000, cashFlow: 3000 } }
    state.turnStage = 'awaiting-decision'
    const bought = run(state, { type: 'BUY_OPPORTUNITY', actorId: 'player-human' })
    const human = bought.players[0]

    expect(human.phase).toBe('fast-track')
    expect(human.cash).toBe(10000 - 1000 + human.fastTrackIncome / 2)
    expect(bought.logs.some((entry) => entry.message.includes('半个收益日的收入'))).toBe(true)
  })

  it('opens Freedom Lane deals from the first lap and lets players sponsor other dreams', () => {
    const landOn = (living: boolean, wanted: (position: number) => boolean) => {
      for (let position = 0; position < FAST_TRACK_BOARD.length; position += 1) {
        const state = living ? createLivingGame() : createSeededGame(1, 42)
        state.currentPlayerIndex = 0
        Object.assign(state.players[0], { phase: 'fast-track', position, fastTrackTurns: 0, fastTrackIncome: 300000, fastTrackGoal: 350000 })
        state.seed = 42
        const rolled = run(state, { type: 'ROLL_DICE', actorId: 'player-human' })
        if (wanted(rolled.players[0].position)) return rolled
      }
      throw new Error('no landing found')
    }
    const isBusiness = (position: number) => FAST_TRACK_BOARD[position] === 'business'
    const isOthersDream = (position: number) => FAST_TRACK_BOARD[position] === 'dream' && FAST_TRACK_DREAM_BY_POSITION[position] !== createLivingGame().players[0].dream

    expect(landOn(true, isBusiness).pendingDecision?.type).toBe('fast-track-business')
    expect(landOn(false, isBusiness).pendingDecision).toBeNull()
    expect(landOn(false, isOthersDream).pendingDecision).toBeNull()

    const sponsor = landOn(true, isOthersDream)
    expect(sponsor.pendingDecision).toMatchObject({ type: 'dream-sponsor', cost: 50000 })
    sponsor.players[0].cash = 80000
    const sponsored = run(sponsor, { type: 'SPONSOR_DREAM', actorId: 'player-human' })
    expect(sponsored.players[0]).toMatchObject({ cash: 30000, dreamPreparation: 1 })
    expect(sponsored.turnStage).toBe('awaiting-end')
    expect(run(sponsor, { type: 'PASS_DREAM_SPONSOR', actorId: 'player-human' }).players[0].dreamPreparation ?? 0).toBe(0)
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
    // Unlike the other cases, keep the seeded starting player: a replay rebuilds it from the seed.
    let state = createSeededGame(1, 42, undefined, '教师', 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'standard', 'living-v1')
    // Play until the first Splurge has been paid so the replay covers the new decision.
    for (let step = 0; step < 4000 && !state.winnerId && !state.commandHistory.some((command) => command.type === 'PAY_DOODAD'); step += 1) {
      state = run(state, chooseAutoplayCommand(state))
    }
    for (let step = 0; step < 200 && !state.winnerId; step += 1) state = run(state, chooseAutoplayCommand(state))
    expect(state.commandHistory.some((command) => command.type === 'PAY_DOODAD')).toBe(true)
    expect(replayGame(state)).toEqual(state)
  })
})
