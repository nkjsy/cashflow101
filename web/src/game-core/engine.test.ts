import { describe, expect, it } from 'vitest'
import { MARKETS, PROFESSIONS, SMALL_DEALS } from './data'
import { assetUpgradeCost, canTakeLoan, createGame as createSeededGame, currentEconomicCycle, executeCommand, insuranceCost, insuranceCoverageRate, monthlyCashFlow, pacedOpportunity, QUICK_PACE, fastTrackGoalGain, fastTrackStartingIncome, replayGame, totalExpenses } from './engine'
import { chooseAutoplayCommand } from '../simulation/simulator'

const createGame = (...args: Parameters<typeof createSeededGame>) => {
  const state = createSeededGame(...args)
  state.currentPlayerIndex = 0
  return state
}

describe('game core', () => {
  it('creates one human and the selected number of AI players', () => {
    const state = createGame(3, 42)

    expect(state.players).toHaveLength(4)
    expect(state.players[0].isHuman).toBe(true)
    expect(state.players.slice(1).every((player) => !player.isHuman)).toBe(true)
  })

  it('keeps each profession expense breakdown equal to its fixed expense total', () => {
    for (const profession of PROFESSIONS) {
      const breakdownTotal = Object.values(profession.fixedExpenses).reduce((sum, expense) => sum + expense, 0)
      expect(breakdownTotal).toBe(profession.expenses)
    }
  })

  it('uses normalized savings in new games and legacy savings in old rules', () => {
    const current = createSeededGame(1, 42, undefined, '医生')
    const legacy = createSeededGame(1, 42, undefined, '医生', 'standard', undefined, 'scaled-equity', 'income-scaled', 'legacy')

    expect(current.players[0].cash).toBe(6700)
    expect(legacy.players[0].cash).toBe(9100)
  })

  it('scales lifestyle Doodads only in new games', () => {
    const current = createGame(1, 42, undefined, '教师')
    const legacy = createGame(1, 42, undefined, '教师', 'standard', undefined, 'scaled-equity', 'income-scaled', 'legacy')
    for (const state of [current, legacy]) {
      state.players[0].cash = 2000
      state.players[0].position = 7
      state.doodadDeck = ['doodad-holiday']
      state.seed = 42
    }

    const currentResult = executeCommand(current, { type: 'ROLL_DICE', actorId: 'player-human' })
    const legacyResult = executeCommand(legacy, { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(currentResult.ok && currentResult.state.players[0].cash).toBe(1000)
    expect(legacyResult.ok && legacyResult.state.players[0].cash).toBe(800)
  })

  it('is deterministic for the same seed and command', () => {
    const first = executeCommand(createGame(1, 42), { type: 'ROLL_DICE', actorId: 'player-human' })
    const second = executeCommand(createGame(1, 42), { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(first).toEqual(second)
  })

  it('preserves explicitly selected AI personalities through replay', () => {
    const personalities = ['aggressive', 'conservative', 'balanced'] as const
    const state = createSeededGame(3, 42, '环游世界', '工程师', 'expert', [...personalities])

    expect(state.players.slice(1).map((player) => player.aiPersonality)).toEqual(personalities)
    expect(state.setup.aiPersonalities).toEqual(personalities)
    expect(replayGame(state)).toEqual(state)
  })

  it('keeps event log IDs unique after the 40-entry display cap', () => {
    let state = createGame(1, 42)
    state.logs = Array.from({ length: 40 }, (_, id) => ({
      id,
      playerId: 'system',
      message: `事件 ${id}`,
      tone: 'neutral' as const,
    }))
    state.players[0].position = 0
    state.seed = 42

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.logs).toHaveLength(40)
    expect(new Set(result.state.logs.map((entry) => entry.id)).size).toBe(40)
    expect(result.state.logs.at(-1)?.id).toBeGreaterThan(39)
  })

  it('replays every successful command from the original setup', () => {
    const initial = createGame(1, 42, '环游世界', '工程师')
    const rolled = executeCommand(initial, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(rolled.ok).toBe(true)
    if (!rolled.ok) return

    expect(replayGame(rolled.state)).toEqual(rolled.state)
  })

  it('rejects commands from another player without changing state', () => {
    const state = createGame(1, 42)
    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-ai-1' })

    expect(result).toEqual({ ok: false, state, error: 'NOT_YOUR_TURN' })
  })

  it('adds loan payments to expenses and lowers monthly cash flow', () => {
    const state = createGame(1, 42)
    const before = state.players[0]
    const result = executeCommand(state, { type: 'TAKE_LOAN', actorId: 'player-human', amount: 2000 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const after = result.state.players[0]
    expect(totalExpenses(after) - totalExpenses(before)).toBe(200)
    expect(monthlyCashFlow(after) - monthlyCashFlow(before)).toBe(-200)
  })

  it('requires loans to use 1000 increments', () => {
    const state = createGame(1, 42)
    const result = executeCommand(state, { type: 'TAKE_LOAN', actorId: 'player-human', amount: 500 })

    expect(result).toEqual({ ok: false, state, error: 'INVALID_AMOUNT' })
  })

  it('allows repaying a 100-unit remainder created by financial review', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    state.currentPlayerIndex = 0
    state.turnStage = 'awaiting-end'
    player.cash = 5000
    player.bankLoan = 4500

    const result = executeCommand(state, { type: 'REPAY_LOAN', actorId: player.id, amount: 4500 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].bankLoan).toBe(0)
  })

  it('rejects a loan that would make monthly cash flow negative', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.salary = 3300
    player.baseExpenses = 2550

    expect(canTakeLoan(player, 7000)).toBe(true)
    expect(canTakeLoan(player, 8000)).toBe(false)
    const result = executeCommand(state, { type: 'TAKE_LOAN', actorId: player.id, amount: 8000 })
    expect(result).toEqual({ ok: false, state, error: 'INVALID_AMOUNT' })
  })

  it('allows only one roll before ending the turn', () => {
    const first = executeCommand(createGame(1, 7), { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = executeCommand(first.state, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error).toBe('COMMAND_NOT_ALLOWED')
  })

  it('skips a downsized player even when the counter reaches zero', () => {
    const state = createGame(2, 7)
    state.turnStage = 'awaiting-end'
    state.players[1].skippedTurns = 1

    const result = executeCommand(state, { type: 'END_TURN', actorId: 'player-human' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.currentPlayerIndex).toBe(2)
    expect(result.state.players[1].skippedTurns).toBe(0)
  })

  it('offers a market sale to matching players in turn order', () => {
    const state = createGame(1, 1972, undefined, '教师')
    const asset = {
      id: 'asset-neighborhood-laundry',
      name: '社区洗衣店',
      downPayment: 4000,
      mortgage: 16000,
      cashFlow: 240,
    }
    state.players[0].position = 5
    state.players[0].assets = [asset]
    state.players[0].passiveIncome = 240
    state.players[1].assets = [asset]
    state.players[1].passiveIncome = 240
    state.seed = 42
    state.marketDeck = ['market-laundry']

    const rolled = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(rolled.ok).toBe(true)
    if (!rolled.ok) return
    expect(rolled.state.pendingDecision?.type).toBe('market')
    expect(rolled.state.pendingDecision?.playerId).toBe('player-human')
    expect(rolled.state.players[1].assets).toHaveLength(1)

    const sold = executeCommand(rolled.state, { type: 'SELL_MARKET_ASSET', actorId: 'player-human' })
    expect(sold.ok).toBe(true)
    if (!sold.ok) return
    expect(sold.state.players[0].assets).toHaveLength(0)
    expect(sold.state.players[0].cash).toBeGreaterThan(state.players[0].cash)
    expect(sold.state.pendingDecision?.type).toBe('market')
    expect(sold.state.pendingDecision?.playerId).toBe('player-ai-1')

    const aiSold = executeCommand(sold.state, { type: 'SELL_MARKET_ASSET', actorId: 'player-ai-1' })
    expect(aiSold.ok).toBe(true)
    if (!aiSold.ok) return
    expect(aiSold.state.players[1].assets).toHaveLength(0)
    expect(aiSold.state.players[1].passiveIncome).toBe(0)
    expect(aiSold.state.pendingDecision).toBeNull()
  })

  it('scales category-wide market offers to each asset instead of paying one fixed windfall', () => {
    const state = createGame(1, 1972)
    const parking = {
      id: 'asset-parking',
      name: '社区停车位',
      kind: 'real-estate' as const,
      downPayment: 3500,
      mortgage: 11500,
      cashFlow: 430,
    }
    state.players[0].position = 5
    state.players[0].assets = [parking]
    state.players[0].passiveIncome = parking.cashFlow
    state.players[0].bankLoan = 5000
    state.seed = 42
    state.marketDeck = ['market-apartment']
    const cashBefore = state.players[0].cash

    const rolled = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(rolled.ok).toBe(true)
    if (!rolled.ok || rolled.state.pendingDecision?.type !== 'market') return
    expect(rolled.state.pendingDecision.salePrice).toBe(25500)

    const sold = executeCommand(rolled.state, { type: 'SELL_MARKET_ASSET', actorId: 'player-human' })
    expect(sold.ok).toBe(true)
    if (!sold.ok) return
    expect(sold.state.players[0].cash).toBe(cashBefore + 14000)
    expect(sold.state.players[0].bankLoan).toBe(5000)
    expect(sold.state.logs.at(-1)?.message).toContain('银行贷款不变')
    expect(sold.state.logs.at(-1)?.message).toContain('盈利 $10,500')
  })

  it.each([
    { level: 2 as const, expectedPrice: 26900, expectedPremium: 1400 },
    { level: 3 as const, expectedPrice: 28300, expectedPremium: 2800 },
  ])('adds $level asset appreciation only to market equity', ({ level, expectedPrice, expectedPremium }) => {
    const state = createGame(1, 1972)
    state.players[0].position = 5
    state.players[0].assets = [{
      id: 'asset-parking#1', sourceId: 'asset-parking', name: '社区停车位', kind: 'real-estate',
      downPayment: 3500, mortgage: 11500, cashFlow: level === 2 ? 645 : 860, baseCashFlow: 430, level,
    }]
    state.players[0].passiveIncome = state.players[0].assets[0].cashFlow
    state.seed = 42
    state.marketDeck = ['market-apartment']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(result.ok).toBe(true)
    if (!result.ok || result.state.pendingDecision?.type !== 'market') return
    expect(result.state.pendingDecision.salePrice).toBe(expectedPrice)
    expect(result.state.pendingDecision.levelPremium).toBe(expectedPremium)
    expect(result.state.logs.at(-1)?.message).toContain(`等级增值 +$${expectedPremium.toLocaleString('zh-CN')}`)
  })

  it('does not add asset-level appreciation to securities', () => {
    const state = createGame(1, 42)
    state.players[0].position = 5
    state.players[0].assets = [{
      id: 'stock-nova#1', sourceId: 'stock-nova', name: 'NOVA 科技股', kind: 'stock', symbol: 'NOVA',
      quantity: 100, costPerUnit: 10, downPayment: 1000, mortgage: 0, cashFlow: 0, level: 3,
    }]
    state.seed = 42
    state.marketDeck = ['market-nova-high']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(result.ok).toBe(true)
    if (!result.ok || result.state.pendingDecision?.type !== 'market') return
    expect(result.state.pendingDecision.salePrice).toBe(3500)
    expect(result.state.pendingDecision.levelPremium).toBe(0)
  })

  it('keeps legacy category prices for existing saves and their replays', () => {
    const state = createGame(1, 1972, undefined, undefined, undefined, undefined, 'legacy-fixed')
    state.players[0].position = 5
    state.players[0].assets = [{
      id: 'asset-parking', name: '社区停车位', kind: 'real-estate',
      downPayment: 3500, mortgage: 11500, cashFlow: 430,
    }]
    state.players[0].passiveIncome = 430
    state.seed = 42
    state.marketDeck = ['market-apartment']

    const rolled = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(rolled.ok).toBe(true)
    if (!rolled.ok || rolled.state.pendingDecision?.type !== 'market') return
    expect(rolled.state.pendingDecision.salePrice).toBe(70000)
  })

  it('does not pause market resolution for a bankrupt human while spectating', () => {
    const state = createGame(1, 1972)
    state.currentPlayerIndex = 1
    state.players[0].bankrupt = true
    state.players[0].phase = 'finished'
    state.players[0].assets = [{
      id: 'asset-neighborhood-laundry',
      name: '社区洗衣店',
      downPayment: 4000,
      mortgage: 16000,
      cashFlow: 240,
    }]
    state.players[0].passiveIncome = 240
    state.players[1].position = 5
    state.seed = 42
    state.marketDeck = ['market-laundry']

    const rolled = executeCommand(state, { type: 'ROLL_DICE', actorId: state.players[1].id })

    expect(rolled.ok).toBe(true)
    if (!rolled.ok) return
    expect(rolled.state.pendingDecision).toBeNull()
    expect(rolled.state.turnStage).toBe('awaiting-end')
    expect(rolled.state.players[0].assets).toHaveLength(1)
  })

  it('pauses on a mandatory-payment shortfall and allows half-down-payment liquidation', () => {
    const state = createGame(1, 1972)
    const asset = {
      id: 'asset-vending-route',
      name: '自动售货机路线',
      downPayment: 2500,
      mortgage: 7500,
      cashFlow: 150,
    }
    state.players[0].cash = 100
    state.players[0].baseExpenses = 2550
    state.players[0].babies = 0
    state.players[0].assets = [asset]
    state.players[0].passiveIncome = 150
    state.players[0].position = 7
    state.doodadDeck = ['doodad-holiday']
    state.seed = 42

    const rolled = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(rolled.ok).toBe(true)
    if (!rolled.ok) return
    expect(rolled.state.pendingDecision?.type).toBe('insolvency')
    expect(rolled.state.players[0].cash).toBe(-900)

    const liquidated = executeCommand(rolled.state, {
      type: 'LIQUIDATE_ASSET',
      actorId: 'player-human',
      assetId: asset.id,
    })
    expect(liquidated.ok).toBe(true)
    if (!liquidated.ok) return
    expect(liquidated.state.players[0].assets).toHaveLength(0)
    expect(liquidated.state.players[0].cash).toBe(350)
    expect(liquidated.state.pendingDecision).toBeNull()
  })

  it('enters the Fast Track after passive income strictly exceeds expenses', () => {
    const state = createGame(1, 42)
    state.players[0].cash = 10000
    state.players[0].passiveIncome = totalExpenses(state.players[0]) - 100
    state.pendingDecision = {
      type: 'opportunity',
      playerId: 'player-human',
      opportunity: {
        id: 'asset-test',
        name: '测试资产',
        description: '用于验证出圈。',
        downPayment: 1000,
        mortgage: 4000,
        cashFlow: 240,
      },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_OPPORTUNITY', actorId: 'player-human' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].phase).toBe('fast-track')
    expect(result.state.players[0].fastTrackIncome).toBe(300000)
    expect(result.state.players[0].fastTrackGoal).toBe(350000)
    expect(result.state.players[0].cash).toBe(9000)
    expect(result.state.players[0].fastTrackTurns).toBe(0)
  })

  it('ends job-loss insurance on Fast Track entry because unemployment cannot occur there', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = 10000
    player.insurance = 'job-loss'
    player.passiveIncome = totalExpenses(player) - 100
    state.pendingDecision = {
      type: 'opportunity',
      playerId: player.id,
      opportunity: { id: 'exit-asset', name: '出圈资产', description: '用于验证保险转换。', downPayment: 1000, mortgage: 0, cashFlow: 200 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_OPPORTUNITY', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].phase).toBe('fast-track')
    expect(result.state.players[0].insurance).toBeUndefined()
    expect(result.state.logs.at(-1)?.message).toContain('自由快道没有失业事件，失业保险自动终止')
  })

  it('explains when a zero-income stock triggers Fast Track through portfolio income', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    const assetIncome = totalExpenses(player) - 100
    const firstAssetIncome = Math.floor(assetIncome / 2)
    const secondAssetIncome = assetIncome - firstAssetIncome
    player.cash = 10000
    player.assets = [
      { id: 'property-test', name: '测试房产', kind: 'real-estate', downPayment: 1000, mortgage: 0, cashFlow: firstAssetIncome, baseCashFlow: firstAssetIncome },
      { id: 'business-test', name: '测试企业', kind: 'business', downPayment: 1000, mortgage: 0, cashFlow: secondAssetIncome, baseCashFlow: secondAssetIncome },
    ]
    player.passiveIncome = assetIncome
    state.pendingDecision = {
      type: 'opportunity', playerId: player.id,
      opportunity: { id: 'stock-harbor', name: 'HARB 港口股', kind: 'stock', symbol: 'HARB', quantity: 100, costPerUnit: 20, description: '测试证券。', downPayment: 2000, mortgage: 0, cashFlow: 0 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_OPPORTUNITY', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expectedPortfolioGain = Math.round(firstAssetIncome * 1.1) + Math.round(secondAssetIncome * 1.1) - assetIncome
    expect(result.state.players[0].passiveIncome).toBe(assetIncome + expectedPortfolioGain)
    expect(result.state.players[0].phase).toBe('fast-track')
    expect(result.state.logs.find((entry) => entry.message.includes('购买 HARB 港口股'))?.message)
      .toContain(`资产本身 +$0，组合加成 +$${expectedPortfolioGain.toLocaleString('zh-CN')}`)
  })

  it('does not enter the Fast Track when passive income only equals expenses', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = 10000
    player.passiveIncome = totalExpenses(player) - 100
    state.pendingDecision = {
      type: 'opportunity', playerId: player.id,
      opportunity: { id: 'equal-test', name: '持平资产', description: '现金流刚好持平。', downPayment: 1000, mortgage: 0, cashFlow: 100 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_OPPORTUNITY', actorId: player.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].phase).toBe('rat-race')
  })

  it('rounds passive income to the nearest thousand for Fast Track income', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = 10000
    player.baseExpenses = 1000
    player.passiveIncome = 999
    state.pendingDecision = {
      type: 'opportunity', playerId: player.id,
      opportunity: { id: 'round-test', name: '取整资产', description: '跨过取整边界。', downPayment: 1000, mortgage: 0, cashFlow: 502 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_OPPORTUNITY', actorId: player.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].fastTrackIncome).toBe(200000)
  })

  it('upgrades an asset before rolling and only allows one strategy action', () => {
    const state = createGame(1, 42, undefined, '工程师')
    const player = state.players[0]
    player.cash = 20000
    player.assets = [{ id: 'upgrade-test', name: '测试公寓', kind: 'real-estate', downPayment: 5000, mortgage: 10000, cashFlow: 500, baseCashFlow: 500, level: 1 }]
    player.passiveIncome = 500
    const cost = assetUpgradeCost(state, player, player.assets[0])

    const upgraded = executeCommand(state, { type: 'UPGRADE_ASSET', actorId: player.id, assetId: 'upgrade-test' })

    expect(upgraded.ok).toBe(true)
    if (!upgraded.ok) return
    expect(upgraded.state.players[0].assets[0].level).toBe(2)
    expect(upgraded.state.players[0].passiveIncome).toBe(750)
    expect(upgraded.state.players[0].cash).toBe(20000 - cost)
    expect(executeCommand(upgraded.state, { type: 'BUY_INSURANCE', actorId: player.id, insurance: 'job-loss' }).ok).toBe(false)
  })

  it('upgrades the selected instance when duplicate assets have different IDs', () => {
    const state = createGame(1, 42, undefined, '工程师')
    const player = state.players[0]
    player.cash = 20000
    player.assets = [
      { id: 'coffee#1', sourceId: 'coffee', name: '测试咖啡店', kind: 'business', downPayment: 5000, mortgage: 10000, cashFlow: 500, baseCashFlow: 500, level: 1 },
      { id: 'coffee#2', sourceId: 'coffee', name: '测试咖啡店', kind: 'business', downPayment: 5000, mortgage: 10000, cashFlow: 500, baseCashFlow: 500, level: 1 },
    ]
    player.passiveIncome = 1000

    const result = executeCommand(state, { type: 'UPGRADE_ASSET', actorId: player.id, assetId: 'coffee#2' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].assets.map((asset) => asset.level)).toEqual([1, 2])
    expect(result.state.players[0].assets.map((asset) => asset.cashFlow)).toEqual([500, 750])
  })

  it('allows only one active insurance policy at a time', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = 100000
    player.insurance = 'job-loss'

    expect(executeCommand(state, { type: 'BUY_INSURANCE', actorId: player.id, insurance: 'lawsuit' }).ok).toBe(false)

    player.phase = 'fast-track'
    expect(executeCommand(state, { type: 'FAST_TRACK_MANAGE_RISK', actorId: player.id }).ok).toBe(false)
  })

  it('offers maintenance or lawsuit insurance through Fast Track risk management', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 100000

    const lawsuit = executeCommand(state, { type: 'FAST_TRACK_MANAGE_RISK', actorId: player.id, insurance: 'lawsuit' })

    expect(lawsuit.ok).toBe(true)
    if (!lawsuit.ok) return
    expect(lawsuit.state.players[0].insurance).toBe('lawsuit')
    expect(lawsuit.state.players[0].cash).toBe(75000)
    expect(lawsuit.state.logs.at(-1)?.message).toContain('获得诉讼保险')

    player.fastTrackStrategyUsed = false
    const legacyMaintenance = executeCommand(state, { type: 'FAST_TRACK_MANAGE_RISK', actorId: player.id })
    expect(legacyMaintenance.ok && legacyMaintenance.state.players[0].insurance).toBe('maintenance')
  })

  it('recalculates portfolio bonuses after liquidating an asset', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.assets = [
      { id: 'home', name: '公寓', kind: 'real-estate', downPayment: 1000, mortgage: 0, cashFlow: 110, baseCashFlow: 100, level: 1 },
      { id: 'shop', name: '商店', kind: 'business', downPayment: 1000, mortgage: 0, cashFlow: 110, baseCashFlow: 100, level: 1 },
      { id: 'fund', name: '基金', kind: 'fund', downPayment: 1000, mortgage: 0, cashFlow: 110, baseCashFlow: 100, level: 1 },
    ]
    player.passiveIncome = 330
    player.cash = -100
    state.pendingDecision = { type: 'insolvency', playerId: player.id, reason: '测试组合失效' }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'LIQUIDATE_ASSET', actorId: player.id, assetId: 'fund' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].assets.map((asset) => asset.cashFlow)).toEqual([100, 100])
    expect(result.state.players[0].passiveIncome).toBe(200)
  })

  it('changes the public economic cycle every six rounds deterministically', () => {
    const state = createGame(1, 42)
    expect(currentEconomicCycle(state).id).toBe('steady-growth')
    state.turn = 7
    expect(currentEconomicCycle(state).id).toBe('property-boom')
    state.turn = 13
    expect(currentEconomicCycle(state).id).toBe('high-interest')
  })

  it('wins by increasing Fast Track income after completing an operation', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 1000000
    player.fastTrackIncome = 300000
    player.fastTrackGoal = 350000
    player.fastTrackTurns = 2
    player.fastTrackOperationsCompleted = 1
    state.pendingDecision = {
      type: 'fast-track-business',
      playerId: player.id,
      business: {
        id: 'business-test',
        name: '职业教育平台',
        description: '测试企业',
        cost: 420000,
        cashFlow: 50000,
      },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_FAST_TRACK_BUSINESS', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.winnerId).toBe(player.id)
    expect(result.state.players[0].phase).toBe('finished')
    expect(result.state.players[0].fastTrackBusinesses).toEqual([
      expect.objectContaining({ id: 'business-test', name: '职业教育平台', cashFlow: 50000 }),
    ])
  })

  it('wins immediately when Fast Track income reaches the goal', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 1000000
    player.fastTrackIncome = 300000
    player.fastTrackGoal = 350000
    player.fastTrackTurns = 2
    state.pendingDecision = {
      type: 'fast-track-business', playerId: player.id,
      business: { id: 'business-milestone', name: '里程碑企业', description: '测试企业', cost: 100000, cashFlow: 50000 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_FAST_TRACK_BUSINESS', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].fastTrackIncome).toBe(350000)
    expect(result.state.players[0].phase).toBe('finished')
    expect(result.state.winnerId).toBe(player.id)
  })

  it('allows one Fast Track management choice before rolling', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 500000
    player.fastTrackIncome = 300000
    player.fastTrackGoal = 350000

    const expanded = executeCommand(state, { type: 'FAST_TRACK_EXPAND', actorId: player.id })

    expect(expanded.ok).toBe(true)
    if (!expanded.ok) return
    expect(expanded.state.players[0].fastTrackIncome).toBe(306000)
    expect(expanded.state.players[0].fastTrackExpansions).toBe(1)
    expect(expanded.state.players[0].fastTrackStrategyUsed).toBe(true)
    expect(executeCommand(expanded.state, { type: 'FAST_TRACK_PREPARE_DREAM', actorId: player.id }).ok).toBe(false)
    expect(executeCommand(expanded.state, { type: 'ROLL_DICE', actorId: player.id }).ok).toBe(true)
  })

  it('does not win immediately when dream preparation reaches three', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 500000
    player.fastTrackIncome = 300000
    player.fastTrackGoal = 350000
    player.dreamPreparation = 2

    const result = executeCommand(state, { type: 'FAST_TRACK_PREPARE_DREAM', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].dreamPreparation).toBe(3)
    expect(result.state.players[0].phase).toBe('fast-track')
    expect(result.state.winnerId).toBeNull()
    expect(result.state.logs.at(-1)?.message).toContain('尚未获胜')
  })

  it('caps Fast Track expansion at three uses without allowing expansion-only victory', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 500000
    player.fastTrackIncome = 312000
    player.fastTrackGoal = 350000
    player.fastTrackExpansions = 2

    const third = executeCommand(state, { type: 'FAST_TRACK_EXPAND', actorId: player.id })

    expect(third.ok).toBe(true)
    if (!third.ok) return
    expect(third.state.players[0].fastTrackIncome).toBe(318000)
    expect(third.state.players[0].fastTrackExpansions).toBe(3)
    expect(third.state.winnerId).toBeNull()
    const nextTurn = { ...third.state, turnStage: 'awaiting-roll' as const, players: third.state.players.map((candidate) => ({ ...candidate, fastTrackStrategyUsed: false })) }
    expect(executeCommand(nextTurn, { type: 'FAST_TRACK_EXPAND', actorId: player.id }).ok).toBe(false)
  })

  it('requires more than three expansions and the strongest single business to win', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 1000000
    player.fastTrackIncome = 318000
    player.fastTrackGoal = 350000
    player.fastTrackExpansions = 3
    player.fastTrackTurns = 2
    state.pendingDecision = {
      type: 'fast-track-business',
      playerId: player.id,
      business: { id: 'strongest-business', name: '最强企业', description: '测试企业', cost: 550000, cashFlow: 24000 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_FAST_TRACK_BUSINESS', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].fastTrackIncome).toBe(342000)
    expect(result.state.players[0].phase).toBe('fast-track')
    expect(result.state.winnerId).toBeNull()
  })

  it('adds a five percent synergy after buying businesses in two sectors', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 1000000
    player.fastTrackIncome = 314000
    player.fastTrackGoal = 400000
    player.fastTrackTurns = 2
    player.fastTrackBusinesses = [{ id: 'energy', name: '能源', description: '测试', cost: 100000, cashFlow: 14000, sector: 'infrastructure' }]
    state.pendingDecision = {
      type: 'fast-track-business', playerId: player.id,
      business: { id: 'software', name: '软件', description: '测试', cost: 100000, cashFlow: 20000, sector: 'technology' },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_FAST_TRACK_BUSINESS', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].fastTrackIncome).toBe(335700)
    expect(result.state.logs.at(-1)?.message).toContain('多产业协同 $1,700')
  })

  it('upgrades each Fast Track business into one permanent branch', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 200000
    player.fastTrackIncome = 320000
    player.fastTrackGoal = 350000
    player.fastTrackBusinesses = [{ id: 'software', name: '软件', description: '测试', cost: 100000, cashFlow: 20000, sector: 'technology' }]

    const result = executeCommand(state, { type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: player.id, businessId: 'software', branch: 'growth' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(150000)
    expect(result.state.players[0].fastTrackIncome).toBe(330000)
    expect(result.state.players[0].fastTrackBusinesses?.[0]).toMatchObject({ upgrade: 'growth', cashFlow: 30000 })
    const nextTurn = { ...result.state, turnStage: 'awaiting-roll' as const, players: result.state.players.map((candidate) => ({ ...candidate, fastTrackStrategyUsed: false })) }
    expect(executeCommand(nextTurn, { type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: player.id, businessId: 'software', branch: 'resilience' }).ok).toBe(false)
  })

  it('reinvests cash immediately for a percentage income increase', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 100000
    player.fastTrackIncome = 320000
    player.fastTrackGoal = 350000
    player.position = 23
    player.fastTrackBusinesses = [{ id: 'software', name: '软件', description: '测试', cost: 100000, cashFlow: 20000, sector: 'technology' }]

    const result = executeCommand(state, { type: 'FAST_TRACK_REINVEST', actorId: player.id, businessId: 'software' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(75000)
    expect(result.state.players[0].fastTrackBusinesses?.[0]).toMatchObject({ cashFlow: 25000, reinvestments: 1 })
    expect(result.state.players[0].fastTrackIncome).toBe(325000)
    expect(result.state.logs.at(-1)?.message).toContain('企业收入提高 25%（+$5,000）')
  })

  it('sells a Fast Track business for substantial cash and removes its income', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 100000
    player.fastTrackIncome = 320000
    player.fastTrackGoal = 350000
    player.fastTrackBusinesses = [{ id: 'software', name: '软件', description: '测试', cost: 360000, cashFlow: 20000, sector: 'technology' }]

    const result = executeCommand(state, { type: 'FAST_TRACK_SELL_BUSINESS', actorId: player.id, businessId: 'software' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(352000)
    expect(result.state.players[0].fastTrackIncome).toBe(300000)
    expect(result.state.players[0].fastTrackBusinesses).toEqual([])
  })

  it('reduces income risk losses for resilience-upgraded businesses', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 0
    player.fastTrackIncome = 300000
    player.fastTrackGoal = 350000
    player.position = 23
    player.fastTrackBusinesses = [{ id: 'energy', name: '能源', description: '测试', cost: 100000, cashFlow: 20000, sector: 'infrastructure', upgrade: 'resilience' }]
    state.fastTrackRiskDeck = ['risk-bad-partner']
    state.seed = 42

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].fastTrackIncome).toBe(277500)
    expect(result.state.logs.some((entry) => entry.message.includes('韧性化减免 25%'))).toBe(true)
  })

  it('replays strategy commands under the original strategy rules version', () => {
    const state = createSeededGame(1, 42)
    const actor = state.players[state.currentPlayerIndex]
    const rolled = executeCommand(state, { type: 'ROLL_DICE', actorId: actor.id })
    expect(rolled.ok).toBe(true)
    if (!rolled.ok) return

    const replayed = replayGame(rolled.state)

    expect(replayed.setup.strategyRulesVersion).toBe('strategy-v1')
    expect(replayed.commandHistory).toEqual(rolled.state.commandHistory)
  })

  it('does not win when Fast Track income is one dollar below the goal', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.cash = 1000000
    player.fastTrackIncome = 300000
    player.fastTrackGoal = 350000
    player.fastTrackTurns = 2
    state.pendingDecision = {
      type: 'fast-track-business', playerId: player.id,
      business: { id: 'business-boundary', name: '边界企业', description: '还差一美元。', cost: 1, cashFlow: 49999 },
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_FAST_TRACK_BUSINESS', actorId: player.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.winnerId).toBeNull()
  })

  it('caps children at three and applies a named Fast Track risk without negative cash', () => {
    const family = createGame(1, 42)
    family.players[0].babies = 3
    family.players[0].position = 17
    family.seed = 42
    const babyRoll = executeCommand(family, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(babyRoll.ok).toBe(true)
    if (!babyRoll.ok) return
    expect(babyRoll.state.players[0].babies).toBe(3)

    const fast = createGame(1, 42)
    fast.players[0].phase = 'fast-track'
    fast.players[0].cash = 10
    fast.players[0].fastTrackIncome = 300000
    fast.players[0].fastTrackGoal = 350000
    fast.players[0].position = 23
    fast.fastTrackRiskDeck = ['risk-tax-audit']
    fast.seed = 42
    const riskRoll = executeCommand(fast, { type: 'ROLL_DICE', actorId: 'player-human' })
    expect(riskRoll.ok).toBe(true)
    if (!riskRoll.ok) return
    expect(riskRoll.state.players[0].cash).toBeGreaterThanOrEqual(0)
    expect(riskRoll.state.logs.some((entry) => entry.message.includes('税务审计'))).toBe(true)
  })

  it('can enter the Fast Track by repaying a bank loan', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = 5000
    player.bankLoan = 1000
    player.passiveIncome = totalExpenses(player)
    state.turnStage = 'awaiting-end'

    const result = executeCommand(state, { type: 'REPAY_LOAN', actorId: player.id, amount: 1000 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].bankLoan).toBe(0)
    expect(result.state.players[0].phase).toBe('fast-track')
  })

  it('uses the profession selected by the human without assigning it to an AI', () => {
    const state = createSeededGame(3, 42, undefined, '医生')

    expect(state.players[0].profession).toBe('医生')
    expect(state.players.slice(1).some((player) => player.profession === '医生')).toBe(false)
  })

  it('uses the selected human goal and preserves it in replay setup', () => {
    const state = createSeededGame(3, 42, undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', 'debt-free')

    expect(state.players[0].longTermGoal).toBe('debt-free')
    expect(state.setup.longTermGoal).toBe('debt-free')
    expect(replayGame(state)).toEqual(state)
  })

  it('randomly selects and persists one human goal from the seed', () => {
    const first = createSeededGame(1, 42)
    const repeated = createSeededGame(1, 42)
    const goals = new Set(Array.from({ length: 12 }, (_, index) => createSeededGame(1, index + 1).setup.longTermGoal))

    expect(first.setup.longTermGoal).toBe(first.players[0].longTermGoal)
    expect(repeated.setup.longTermGoal).toBe(first.setup.longTermGoal)
    expect(goals).toEqual(new Set(['diversified', 'master-asset', 'debt-free']))
    expect(replayGame(first)).toEqual(first)
  })

  it('does not give teachers an upgrade discount', () => {
    const state = createSeededGame(1, 42, undefined, '教师')
    const player = state.players[0]
    const asset = { id: 'category-test', name: '分类测试', downPayment: 1000, mortgage: 0, cashFlow: 1000, baseCashFlow: 1000, level: 1 as const }
    state.turn = 13

    expect(assetUpgradeCost(state, player, { ...asset, kind: 'business' })).toBe(6000)
    expect(assetUpgradeCost(state, player, { ...asset, kind: 'fund' })).toBe(6000)
    expect(assetUpgradeCost(state, player, { ...asset, kind: 'real-estate' })).toBe(6000)
  })

  it('keeps engineer and technician upgrade specialties disjoint', () => {
    const engineerState = createSeededGame(1, 42, undefined, '工程师')
    const technicianState = createSeededGame(1, 42, undefined, '维修技师')
    const asset = { id: 'specialty-test', name: '专精测试', downPayment: 1000, mortgage: 0, cashFlow: 1000, baseCashFlow: 1000, level: 1 as const }
    engineerState.turn = 13
    technicianState.turn = 13

    expect(assetUpgradeCost(engineerState, engineerState.players[0], { ...asset, kind: 'business' })).toBe(3000)
    expect(assetUpgradeCost(engineerState, engineerState.players[0], { ...asset, kind: 'real-estate' })).toBe(6000)
    expect(assetUpgradeCost(technicianState, technicianState.players[0], { ...asset, kind: 'business' })).toBe(6000)
    expect(assetUpgradeCost(technicianState, technicianState.players[0], { ...asset, kind: 'real-estate' })).toBe(4800)
  })

  it('charges the same insurance premium regardless of profession', () => {
    const remainingCash = (profession: string, insurance: 'job-loss' | 'maintenance' | 'lawsuit') => {
      const state = createSeededGame(1, 42, undefined, profession)
      const player = state.players[0]
      state.currentPlayerIndex = 0
      player.cash = 100000
      player.salary = 40000
      player.passiveIncome = 0
      const result = executeCommand(state, { type: 'BUY_INSURANCE', actorId: player.id, insurance })
      expect(result.ok).toBe(true)
      return result.state.players[0].cash
    }

    expect(remainingCash('护士', 'maintenance')).toBe(98800)
    expect(remainingCash('医生', 'job-loss')).toBe(98800)
    expect(remainingCash('律师', 'lawsuit')).toBe(98800)
  })

  it('applies insurance specialties when claims trigger', () => {
    const nurse = createSeededGame(1, 42, undefined, '护士').players[0]
    const lawyer = createSeededGame(1, 42, undefined, '律师').players[0]
    const doctor = createSeededGame(1, 42, undefined, '医生').players[0]

    expect(insuranceCoverageRate(nurse, 'maintenance')).toBe(0.5)
    expect(insuranceCoverageRate(nurse, 'lawsuit')).toBe(0.5)
    expect(insuranceCoverageRate(lawyer, 'lawsuit')).toBe(0.5)
    expect(insuranceCoverageRate(lawyer, 'maintenance')).toBe(0.5)
    expect(insuranceCoverageRate(doctor, 'job-loss')).toBe(0.75)
    expect(insuranceCost(doctor, 'job-loss')).toBe(500)
  })

  it('applies 75 percent coverage when an insured doctor is downsized', () => {
    const state = createGame(1, 42, undefined, '医生')
    const player = state.players[0]
    player.cash = 10000
    player.position = 9
    player.insurance = 'job-loss'
    state.seed = 42

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(8500)
    expect(result.state.players[0].skippedTurns).toBe(2)
    expect(result.state.players[0].insurance).toBeUndefined()
    expect(result.state.logs.at(-1)?.message).toContain('保险承担 75%')
  })

  it('only halves dental treatment costs for nurses', () => {
    const state = createGame(1, 42, undefined, '护士')
    const player = state.players[0]
    player.cash = 10000
    player.position = 23
    state.seed = 42
    state.doodadDeck = ['doodad-dental']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(9450)
    expect(result.state.players[0].nurseDoodadTriggers).toBe(1)
    expect(result.state.players[0].nurseDoodadSavings).toBe(550)
    expect(result.state.logs.at(-1)?.message).toContain('生活照护节省 $550')
  })

  it('does not discount other nurse Doodads', () => {
    const state = createGame(1, 42, undefined, '护士')
    const player = state.players[0]
    player.cash = 10000
    player.position = 23
    state.seed = 42
    state.doodadDeck = ['doodad-phone']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(9500)
    expect(result.state.players[0].nurseDoodadTriggers).toBe(0)
    expect(result.state.players[0].nurseDoodadSavings).toBe(0)
  })

  it('adds a child without increasing nurse monthly expenses', () => {
    const state = createGame(1, 42, undefined, '护士')
    const player = state.players[0]
    const expensesBefore = totalExpenses(player)
    player.position = 17
    state.seed = 42

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].babies).toBe(1)
    expect(result.state.players[0].nurseBabyTriggers).toBe(1)
    expect(totalExpenses(result.state.players[0])).toBe(expensesBefore)
    expect(result.state.logs.at(-1)?.message).toContain('儿童月支出不增加')
  })

  it('adds a capped lawyer negotiation bonus to market sale proceeds', () => {
    const state = createGame(1, 42, undefined, '律师')
    const player = state.players[0]
    player.cash = 1000
    player.assets = [{ id: 'lawyer-sale', name: '谈判资产', kind: 'business', downPayment: 10000, mortgage: 20000, cashFlow: 1000 }]
    player.passiveIncome = 1000
    state.pendingDecision = { type: 'market', playerId: player.id, assetId: 'lawyer-sale', assetName: '谈判资产', salePrice: 80000, cardId: 'market-business', responderIds: [player.id] }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'SELL_MARKET_ASSET', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(62000)
    expect(result.state.players[0].lawyerMarketTriggers).toBe(1)
    expect(result.state.players[0].lawyerMarketBonus).toBe(1000)
    expect(result.state.logs.at(-1)?.message).toContain('合同谈判增加成交价 $1,000')
  })

  it('extends charity dice by one turn only for police officers', () => {
    const donate = (profession: string) => {
      const state = createSeededGame(1, 42, undefined, profession)
      const player = state.players[0]
      state.currentPlayerIndex = 0
      player.cash = 10000
      state.pendingDecision = { type: 'charity', playerId: player.id, donation: 1000 }
      state.turnStage = 'awaiting-decision'
      const result = executeCommand(state, { type: 'CHOOSE_CHARITY', actorId: player.id, donate: true })
      expect(result.ok).toBe(true)
      return result.state.players[0].charityTurns
    }

    expect(donate('警员')).toBe(4)
    expect(donate('教师')).toBe(3)
  })

  it('preserves charity dice turns when unemployment skips a turn', () => {
    const state = createGame(2, 42)
    const current = state.players[0]
    const unemployed = state.players[1]
    state.currentPlayerIndex = 0
    state.turnStage = 'awaiting-end'
    unemployed.skippedTurns = 1
    unemployed.charityTurns = 4

    const result = executeCommand(state, { type: 'END_TURN', actorId: current.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[1].skippedTurns).toBe(0)
    expect(result.state.players[1].charityTurns).toBe(4)
  })

  it('gives teachers a 5000 reward for completing a long-term goal', () => {
    const state = createSeededGame(1, 42, undefined, '教师', 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', 'master-asset')
    const player = state.players[0]
    player.cash = 20000
    player.assets = [{ id: 'teacher-goal', name: '社区企业', kind: 'business', downPayment: 1000, mortgage: 0, cashFlow: 1500, baseCashFlow: 1000, level: 2 }]
    player.passiveIncome = 1500
    const cost = assetUpgradeCost(state, player, player.assets[0])

    const result = executeCommand(state, { type: 'UPGRADE_ASSET', actorId: player.id, assetId: 'teacher-goal' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].longTermGoalCompleted).toBe(true)
    expect(result.state.players[0].cash).toBe(20000 - cost + 5000)
    expect(result.state.logs.at(-1)?.message).toContain('获得 $5,000 策略奖励')
  })

  it.each([
    { profession: '教师', turn: 1, bankLoan: 10000, expectedRelief: 500 },
    { profession: '会计师', turn: 1, bankLoan: 10000, expectedRelief: 1000 },
    { profession: '会计师', turn: 13, bankLoan: 10000, expectedRelief: 1500 },
    { profession: '会计师', turn: 13, bankLoan: 5500, expectedRelief: 500 },
  ])('calculates financial-review relief for $profession in turn $turn', ({ profession, turn, bankLoan, expectedRelief }) => {
    const state = createSeededGame(1, 42, undefined, profession)
    const player = state.players[0]
    state.currentPlayerIndex = 0
    state.turn = turn
    player.cash = 10000
    player.bankLoan = bankLoan

    const result = executeCommand(state, { type: 'FINANCIAL_REVIEW', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(5000)
    expect(result.state.players[0].bankLoan).toBe(bankLoan - 5000 - expectedRelief)
    expect(result.state.logs.at(-1)?.message).toContain(`额外减免 $${expectedRelief.toLocaleString('zh-CN')}`)
  })

  it('explains zero relief when the financial-review payment clears the loan', () => {
    const state = createSeededGame(1, 42, undefined, '会计师')
    const player = state.players[0]
    player.cash = 2000
    player.bankLoan = 1000

    const result = executeCommand(state, { type: 'FINANCIAL_REVIEW', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].bankLoan).toBe(0)
    expect(result.state.logs.at(-1)?.message).toContain('贷款已结清，无剩余贷款可额外减免')
  })

  it('can realize a loss when selling a security into a low market', () => {
    expect(MARKETS.some((card) => card.id === 'market-nova-low')).toBe(true)
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = 1000
    player.assets = [{
      id: 'stock-nova', name: 'NOVA 科技股', kind: 'stock', symbol: 'NOVA', quantity: 100,
      costPerUnit: 10, downPayment: 1000, mortgage: 0, cashFlow: 0,
    }]
    state.pendingDecision = {
      type: 'market', playerId: player.id, assetId: 'stock-nova', assetName: 'NOVA 科技股', salePrice: 400,
      cardId: 'market-nova-low', responderIds: [player.id],
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'SELL_MARKET_ASSET', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].cash).toBe(1400)
    expect(result.state.players[0].assets).toHaveLength(0)
    expect(result.state.logs.at(-1)).toMatchObject({ tone: 'negative' })
  })

  it('wins immediately after buying the selected dream', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.fastTrackTurns = 2
    player.cash = 300000
    state.pendingDecision = {
      type: 'dream',
      playerId: player.id,
      dream: player.dream,
      cost: 250000,
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_DREAM', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.winnerId).toBe(player.id)
    expect(result.state.players[0].cash).toBe(50000)
  })

  it('scales a dream price to twelve beginning Fast Track incomes in new games', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.fastTrackTurns = 2
    player.position = 0
    player.dream = '开一家社区图书馆'
    player.fastTrackIncome = 500000
    player.fastTrackGoal = 550000
    state.currentPlayerIndex = 0
    state.turnStage = 'awaiting-roll'

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id, diceCount: 2 })

    expect(result.ok).toBe(true)
    expect(result.state.pendingDecision?.type).toBe('dream')
    if (!result.ok || result.state.pendingDecision?.type !== 'dream') return
    expect(result.state.pendingDecision.cost).toBe(6000000)
  })

  it('preserves the previous twenty-four-income dream price', () => {
    const state = createGame(1, 42, undefined, undefined, 'standard', undefined, 'scaled-equity', 'income-scaled')
    const player = state.players[0]
    player.phase = 'fast-track'
    player.fastTrackTurns = 2
    player.position = 0
    player.dream = '开一家社区图书馆'
    player.fastTrackIncome = 500000
    player.fastTrackGoal = 550000

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id, diceCount: 2 })

    expect(result.ok).toBe(true)
    expect(result.state.pendingDecision?.type).toBe('dream')
    if (!result.ok || result.state.pendingDecision?.type !== 'dream') return
    expect(result.state.pendingDecision.cost).toBe(12000000)
  })

  it('preserves legacy Fast Track business cash flow for old saves', () => {
    const state = createGame(1, 42, undefined, undefined, 'standard', undefined, 'scaled-equity', 'legacy')
    const player = state.players[0]
    player.phase = 'fast-track'
    player.fastTrackTurns = 2
    player.position = 22
    state.fastTrackBusinessDeck = ['fast-track-clean-energy']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id, diceCount: 2 })

    expect(result.ok).toBe(true)
    if (!result.ok || result.state.pendingDecision?.type !== 'fast-track-business') return
    expect(result.state.pendingDecision.business.cashFlow).toBe(20000)
  })

  it('preserves the previous income-scaled Fast Track values', () => {
    const state = createGame(1, 42, undefined, undefined, 'standard', undefined, 'scaled-equity', 'income-scaled')
    const player = state.players[0]
    player.phase = 'fast-track'
    player.fastTrackTurns = 2
    player.position = 22
    state.fastTrackBusinessDeck = ['fast-track-clean-energy']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: player.id, diceCount: 2 })

    expect(result.ok).toBe(true)
    if (!result.ok || result.state.pendingDecision?.type !== 'fast-track-business') return
    expect(result.state.pendingDecision.business.cashFlow).toBe(8000)
  })

  it('does not allow a dream purchase during the first Fast Track turn', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.phase = 'fast-track'
    player.fastTrackTurns = 1
    player.cash = 300000
    state.pendingDecision = {
      type: 'dream',
      playerId: player.id,
      dream: player.dream,
      cost: 250000,
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'BUY_DREAM', actorId: player.id })

    expect(result).toEqual({ ok: false, state, error: 'COMMAND_NOT_ALLOWED' })
  })

  it('awards victory to the last solvent player after bankruptcy', () => {
    const state = createGame(1, 42)
    const player = state.players[0]
    player.cash = -500
    state.pendingDecision = {
      type: 'insolvency',
      playerId: player.id,
      reason: '测试强制付款',
    }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'DECLARE_BANKRUPTCY', actorId: player.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].bankrupt).toBe(true)
    expect(result.state.winnerId).toBe('player-ai-1')
  })

  it('randomizes setup deterministically from the seed', () => {
    expect(createSeededGame(3, 2026)).toEqual(createSeededGame(3, 2026))
    expect(createSeededGame(3, 2026).smallDealDeck).not.toEqual(createSeededGame(3, 2027).smallDealDeck)
  })

  it('shuffles Fast Track business and risk decks deterministically', () => {
    const first = createGame(1, 42)
    const same = createGame(1, 42)
    const different = createGame(1, 43)

    expect(first.fastTrackBusinessDeck).toEqual(same.fastTrackBusinessDeck)
    expect(first.fastTrackRiskDeck).toEqual(same.fastTrackRiskDeck)
    expect(first.fastTrackBusinessDeck).not.toEqual(different.fastTrackBusinessDeck)
    expect(first.fastTrackRiskDeck).not.toEqual(different.fastTrackRiskDeck)
  })

  it('draws from the selected Small Deal deck', () => {
    const state = createGame(1, 42)
    state.smallDealDeck = ['stock-nova']
    state.pendingDecision = { type: 'deal-choice', playerId: 'player-human' }
    state.turnStage = 'awaiting-decision'

    const result = executeCommand(state, { type: 'DRAW_DEAL', actorId: 'player-human', dealSize: 'small' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.pendingDecision).toMatchObject({
      type: 'opportunity',
      opportunity: { id: 'stock-nova', kind: 'stock', quantity: 100 },
    })
    expect(result.state.smallDealIndex).toBe(1)
  })

  it('allows a sustainable bank loan while deciding whether to buy a Deal', () => {
    const state = createGame(1, 42)
    state.players[0].cash = 1000
    state.pendingDecision = {
      type: 'opportunity',
      playerId: 'player-human',
      opportunity: {
        id: 'asset-loan-window', name: '借款窗口测试', kind: 'business', dealSize: 'small',
        description: '验证看到交易后可以借款。', downPayment: 3000, mortgage: 7000, cashFlow: 300,
      },
    }
    state.turnStage = 'awaiting-decision'

    const borrowed = executeCommand(state, { type: 'TAKE_LOAN', actorId: 'player-human', amount: 2000 })

    expect(borrowed.ok).toBe(true)
    if (!borrowed.ok) return
    expect(borrowed.state.pendingDecision?.type).toBe('opportunity')
    const bought = executeCommand(borrowed.state, { type: 'BUY_OPPORTUNITY', actorId: 'player-human' })
    expect(bought.ok).toBe(true)
  })

  it('applies a security split without changing the total cost basis', () => {
    const state = createGame(1, 42)
    state.players[0].position = 5
    state.players[0].assets = [{
      id: 'stock-nova', name: 'NOVA 科技股', kind: 'stock', symbol: 'NOVA', quantity: 100,
      costPerUnit: 10, downPayment: 1000, mortgage: 0, cashFlow: 0,
    }]
    state.seed = 42
    state.marketDeck = ['market-nova-split']

    const result = executeCommand(state, { type: 'ROLL_DICE', actorId: 'player-human' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const holding = result.state.players[0].assets[0]
    expect(holding.quantity).toBe(200)
    expect(holding.costPerUnit).toBe(5)
    expect((holding.quantity ?? 0) * (holding.costPerUnit ?? 0)).toBe(1000)
  })
})
describe('quick pace', () => {
  const quickGame = (seed = 42) => createGame(1, seed, undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'quick')

  it('keeps standard setups unchanged', () => {
    const standard = createGame(1, 42)
    expect(standard.setup.pace).toBeUndefined()
    expect(standard.players[0].cash).toBe(createGame(1, 42, undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'standard').players[0].cash)
  })

  it('starts with more savings, capped for high earners', () => {
    const standard = createGame(1, 42, undefined, '教师')
    const quick = createGame(1, 42, undefined, '教师', 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'quick')
    const teacher = PROFESSIONS.find((profession) => profession.title === '教师')!
    expect(quick.setup.pace).toBe('quick')
    expect(quick.players[0].cash - standard.players[0].cash).toBe(Math.round(teacher.savings * QUICK_PACE.savingsMultiplier / 100) * 100 - teacher.savings)
    const doctor = createGame(1, 42, undefined, '医生', 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'quick').players[0]
    expect(doctor.cash).toBe(doctor.salary - doctor.baseExpenses + QUICK_PACE.savingsCap)
  })

  it('draws deals with boosted cash flow', () => {
    const state = quickGame()
    state.pendingDecision = { type: 'deal-choice', playerId: state.players[0].id }
    state.turnStage = 'awaiting-decision'
    const result = executeCommand(state, { type: 'DRAW_DEAL', actorId: state.players[0].id, dealSize: 'small' })
    expect(result.ok).toBe(true)
    if (!result.ok || result.state.pendingDecision?.type !== 'opportunity') throw new Error('Expected an opportunity')
    const drawn = result.state.pendingDecision.opportunity
    const original = [...SMALL_DEALS].find((deal) => deal.id === drawn.id)!
    expect(drawn).toEqual(pacedOpportunity(original, 'quick'))
    if (original.cashFlow > 0) expect(drawn.cashFlow).toBeGreaterThan(original.cashFlow)
  })

  it('halves the Freedom Lane income target and keeps replay deterministic', () => {
    const state = quickGame()
    const player = state.players[0]
    player.cash = 10000
    player.passiveIncome = totalExpenses(player) - 100
    state.pendingDecision = {
      type: 'opportunity',
      playerId: player.id,
      opportunity: { id: 'exit-asset', name: '出圈资产', description: '用于验证快速局目标。', downPayment: 1000, mortgage: 0, cashFlow: 200 },
    }
    state.turnStage = 'awaiting-decision'
    const result = executeCommand(state, { type: 'BUY_OPPORTUNITY', actorId: player.id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const exited = result.state.players[0]
    expect(exited.phase).toBe('fast-track')
    expect(fastTrackGoalGain(exited)).toBe(QUICK_PACE.fastTrackGoalGain)
    expect(fastTrackStartingIncome(exited)).toBe(exited.fastTrackIncome)

    let game = quickGame(7)
    for (let step = 0; step < 60; step += 1) {
      const next = executeCommand(game, chooseAutoplayCommand(game))
      if (!next.ok) break
      game = next.state
    }
    expect(replayGame(game)).toEqual(game)
  })
})
