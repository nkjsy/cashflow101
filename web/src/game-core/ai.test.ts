import { describe, expect, it } from 'vitest'
import { choosePreRollStrategyCommand, playBasicAiTurn } from './ai'
import { evaluateOpportunity, getAiPolicy, shouldBuyFastTrackBusiness } from './ai-policy'
import { FAST_TRACK_DREAM_COSTS } from './data'
import { createGame, executeCommand } from './engine'
import type { CommandResult } from './types'

describe('basic AI', () => {
  it('plays a complete turn and passes control onward', () => {
    const game = createGame(2, 42)
    game.currentPlayerIndex = 0
    const rolled = executeCommand(game, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(rolled.ok).toBe(true)
    if (!rolled.ok) return
    let decisionResolved: CommandResult = rolled
    if (decisionResolved.state.pendingDecision?.type === 'deal-choice') {
      decisionResolved = executeCommand(decisionResolved.state, { type: 'DRAW_DEAL', actorId: 'player-human', dealSize: 'small' })
    }
    if (decisionResolved.ok && decisionResolved.state.pendingDecision?.type === 'opportunity') {
      decisionResolved = executeCommand(decisionResolved.state, { type: 'PASS_OPPORTUNITY', actorId: 'player-human' })
    }
    if (decisionResolved.ok && decisionResolved.state.pendingDecision?.type === 'charity') {
      decisionResolved = executeCommand(decisionResolved.state, { type: 'CHOOSE_CHARITY', actorId: 'player-human', donate: false })
    }
    expect(decisionResolved.ok).toBe(true)
    if (!decisionResolved.ok) return
    const ended = executeCommand(decisionResolved.state, { type: 'END_TURN', actorId: 'player-human' })
    expect(ended.ok).toBe(true)
    if (!ended.ok) return

    const afterAi = playBasicAiTurn(ended.state)

    expect(afterAi.currentPlayerIndex).toBe(2)
    expect(afterAi.turnStage).toBe('awaiting-roll')
    expect(afterAi.revision).toBeGreaterThan(ended.state.revision)
  })

  it('borrows sustainably to buy an attractive cashflow asset', () => {
    const game = createGame(1, 42)
    game.currentPlayerIndex = 1
    const ai = game.players[1]
    ai.aiPersonality = 'balanced'
    ai.cash = 2000
    ai.baseExpenses = 2000
    game.pendingDecision = {
      type: 'opportunity',
      playerId: ai.id,
      opportunity: {
        id: 'asset-ai-test',
        name: 'AI 测试资产',
        kind: 'business',
        dealSize: 'small',
        description: '验证 AI 借款买入。',
        downPayment: 3000,
        mortgage: 7000,
        cashFlow: 500,
      },
    }
    game.turnStage = 'awaiting-decision'

    const result = playBasicAiTurn(game)

    expect(result.players[1].assets).toHaveLength(1)
    expect(result.players[1].bankLoan).toBe(2000)
    expect(result.players[1].passiveIncome).toBe(500)
  })

  it('draws Big Deals only when the minimum down payment and reserve are affordable', () => {
    const modestGame = createGame(1, 42)
    modestGame.currentPlayerIndex = 1
    modestGame.players[1].cash = 10000
    modestGame.pendingDecision = { type: 'deal-choice', playerId: modestGame.players[1].id }
    modestGame.turnStage = 'awaiting-decision'

    const modestResult = playBasicAiTurn(modestGame)

    expect(modestResult.smallDealIndex).toBe(1)
    expect(modestResult.bigDealIndex).toBe(0)

    const wealthyGame = createGame(1, 42)
    wealthyGame.currentPlayerIndex = 1
    wealthyGame.players[1].cash = 30000
    wealthyGame.pendingDecision = { type: 'deal-choice', playerId: wealthyGame.players[1].id }
    wealthyGame.turnStage = 'awaiting-decision'

    const wealthyResult = playBasicAiTurn(wealthyGame)

    expect(wealthyResult.smallDealIndex).toBe(0)
    expect(wealthyResult.bigDealIndex).toBe(1)
  })

  it.each([
    { kind: 'fund' as const, name: '城市指数基金', downPayment: 2000, cashFlow: 40 },
    { kind: 'cd' as const, name: '社区银行存单', downPayment: 3000, cashFlow: 90 },
  ])('buys an affordable stable-income $kind without borrowing', ({ kind, name, downPayment, cashFlow }) => {
    const game = createGame(1, 42)
    game.currentPlayerIndex = 1
    const ai = game.players[1]
    ai.cash = totalExpensesForTest(ai) + downPayment + 1000
    game.pendingDecision = {
      type: 'opportunity',
      playerId: ai.id,
      opportunity: {
        id: `test-${kind}`,
        name,
        kind,
        dealSize: 'small',
        symbol: kind === 'fund' ? 'CITY' : 'CD12',
        description: '验证稳定收益证券策略。',
        downPayment,
        mortgage: 0,
        cashFlow,
      },
    }
    game.turnStage = 'awaiting-decision'

    const result = playBasicAiTurn(game)

    expect(result.players[1].assets).toHaveLength(1)
    expect(result.players[1].assets[0].kind).toBe(kind)
    expect(result.players[1].bankLoan).toBe(0)
  })

  it('assigns deterministic, varied AI personalities without changing the seed stream', () => {
    const first = createGame(3, 42)
    const second = createGame(3, 42)

    expect(first.players.slice(1).map((player) => player.aiPersonality)).toEqual(
      second.players.slice(1).map((player) => player.aiPersonality),
    )
    expect(new Set(first.players.slice(1).map((player) => player.aiPersonality)).size).toBe(3)
    expect(first.seed).toBe(second.seed)
  })

  it('lets aggressive AI accept a marginal deal that conservative AI rejects', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    ai.cash = 20000
    const opportunity = {
      id: 'marginal-business', name: '边际生意', kind: 'business' as const,
      description: '7% 月回报率。', downPayment: 10000, mortgage: 0, cashFlow: 700,
    }

    ai.aiPersonality = 'conservative'
    expect(evaluateOpportunity(game, ai, opportunity).attractive).toBe(false)
    ai.aiPersonality = 'aggressive'
    expect(evaluateOpportunity(game, ai, opportunity).attractive).toBe(true)
  })

  it('expert AI responds to an opponent reaching the Fast Track', () => {
    const game = createGame(2, 42, undefined, undefined, 'expert')
    const ai = game.players[1]
    ai.aiPersonality = 'balanced'
    ai.cash = 20000
    const opportunity = {
      id: 'pressure-business', name: '追赶投资', kind: 'business' as const,
      description: '压力下可接受。', downPayment: 10000, mortgage: 0, cashFlow: 700,
    }

    expect(evaluateOpportunity(game, ai, opportunity).attractive).toBe(false)
    game.players[2].phase = 'fast-track'
    expect(evaluateOpportunity(game, ai, opportunity).attractive).toBe(true)
  })

  it('expert AI preserves an affordable dream before buying a Fast Track business', () => {
    const game = createGame(1, 42, undefined, undefined, 'expert')
    const ai = game.players[1]
    ai.phase = 'fast-track'
    ai.fastTrackIncome = 0
    ai.fastTrackGoal = 50000
    ai.cash = (FAST_TRACK_DREAM_COSTS[ai.dream] ?? 250000) + 10000

    expect(shouldBuyFastTrackBusiness(game, ai, 20000, 1000)).toBe(false)
    expect(shouldBuyFastTrackBusiness(game, ai, 10000, ai.fastTrackGoal)).toBe(true)
  })

  it('stops expanding after three Fast Track expansions', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.phase = 'fast-track'
    ai.cash = 1000000
    ai.fastTrackIncome = 300000
    ai.fastTrackGoal = 350000
    ai.fastTrackExpansions = 3
    ai.dreamPreparation = 3

    expect(choosePreRollStrategyCommand(game)).toBeNull()
  })

  it('growth-upgrades and then reinvests in Fast Track businesses', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.phase = 'fast-track'
    ai.cash = 1000000
    ai.fastTrackIncome = 320000
    ai.fastTrackGoal = 350000
    ai.fastTrackExpansions = 3
    ai.aiPersonality = 'aggressive'
    ai.fastTrackBusinesses = [{ id: 'software', name: '软件', description: '测试', cost: 100000, cashFlow: 20000, sector: 'technology' }]

    expect(choosePreRollStrategyCommand(game)).toEqual({ type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: ai.id, businessId: 'software', branch: 'growth' })

    ai.fastTrackBusinesses[0].upgrade = 'growth'
    expect(choosePreRollStrategyCommand(game)).toEqual({ type: 'FAST_TRACK_REINVEST', actorId: ai.id, businessId: 'software' })
  })

  it('sells a business only when the proceeds fund the selected dream', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.phase = 'fast-track'
    ai.fastTrackIncome = 320000
    ai.fastTrackGoal = 350000
    ai.fastTrackExpansions = 3
    ai.dreamPreparation = 3
    ai.cash = 100000
    ai.fastTrackBusinesses = [{ id: 'software', name: '软件', description: '测试', cost: 360000, cashFlow: 20000, sector: 'technology', upgrade: 'growth', reinvestments: 2 }]

    const dreamCost = getAiPolicy(game, ai).dreamCost
    ai.cash = dreamCost - 200000

    expect(choosePreRollStrategyCommand(game)).toEqual({ type: 'FAST_TRACK_SELL_BUSINESS', actorId: ai.id, businessId: 'software' })
  })

  it('buys the doctor insurance specialty when reserves allow it', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.profession = '医生'
    ai.cash = 100000

    expect(choosePreRollStrategyCommand(game)).toEqual({ type: 'BUY_INSURANCE', actorId: ai.id, insurance: 'job-loss' })
  })

  it.each(['护士', '律师'] as const)('does not treat insurance as a generic mandatory action for %s', (profession) => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.profession = profession
    ai.cash = 100000
    ai.assets = [
      { id: 'insured-1', name: '资产一', kind: 'business', downPayment: 1000, mortgage: 0, cashFlow: 200, baseCashFlow: 100, level: 3 },
      { id: 'insured-2', name: '资产二', kind: 'real-estate', downPayment: 1000, mortgage: 0, cashFlow: 200, baseCashFlow: 100, level: 3 },
      { id: 'insured-3', name: '资产三', kind: 'business', downPayment: 1000, mortgage: 0, cashFlow: 200, baseCashFlow: 100, level: 3 },
    ]
    ai.passiveIncome = 600

    expect(choosePreRollStrategyCommand(game)).toBeNull()
  })

  it('does not buy insurance without sufficient reserves or while already insured', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.profession = '医生'
    ai.cash = 0
    expect(choosePreRollStrategyCommand(game)).toBeNull()

    ai.cash = 100000
    ai.insurance = 'job-loss'
    expect(choosePreRollStrategyCommand(game)).toBeNull()
  })

  it('leaves optional job-loss insurance to non-doctor players', () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    game.currentPlayerIndex = 1
    ai.profession = '护士'
    ai.cash = 100000

    expect(choosePreRollStrategyCommand(game)).toBeNull()
  })
})

const totalExpensesForTest = (player: ReturnType<typeof createGame>['players'][number]) =>
  player.baseExpenses + player.babies * player.perChildExpense + player.bankLoan * 0.1