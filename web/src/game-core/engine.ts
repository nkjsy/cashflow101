import {
  BOARD,
  BIG_DEALS,
  DOODADS,
  DREAMS,
  FAST_TRACK_BOARD,
  FAST_TRACK_DREAM_BY_POSITION,
  FAST_TRACK_DREAM_COSTS,
  FAST_TRACK_BUSINESSES,
  FAST_TRACK_RISKS,
  fastTrackDreamCost,
  legacyFastTrackBusiness,
  incomeScaledFastTrackBusiness,
  legacyProfessionSavings,
  MARKETS,
  PROFESSIONS,
  SMALL_DEALS,
} from './data'
import type {
  Asset,
  AiDifficulty,
  AiPersonality,
  CommandResult,
  FastTrackBusiness,
  FastTrackBalanceVersion,
  GameCommand,
  GameLogEntry,
  GameState,
  InsuranceKind,
  LongTermGoalId,
  MarketCard,
  MarketPricingVersion,
  PlayerState,
  RatRaceBalanceVersion,
  StrategyRulesVersion,
  SpaceType,
} from './types'

export const ECONOMIC_CYCLES = [
  { id: 'steady-growth', name: '稳定增长', description: '企业升级成本降低 10%。' },
  { id: 'property-boom', name: '房地产繁荣', description: '房地产升级成本降低 20%。' },
  { id: 'high-interest', name: '高利率', description: '财务整理的减免比例增加 10 个百分点。' },
] as const

export const currentEconomicCycle = (state: GameState) =>
  ECONOMIC_CYCLES[Math.floor((state.turn - 1) / 6) % ECONOMIC_CYCLES.length]

export const FAST_TRACK_EXPANSION_GAIN = 6000
export const FAST_TRACK_EXPANSION_LIMIT = 3
export const FAST_TRACK_GROWTH_UPGRADE_COST_RATE = 0.5
export const FAST_TRACK_RESILIENCE_UPGRADE_COST_RATE = 0.25
export const FAST_TRACK_GROWTH_UPGRADE_RATE = 0.5
export const FAST_TRACK_REINVEST_COST_RATE = 0.25
export const FAST_TRACK_REINVEST_RATE = 0.25
export const FAST_TRACK_REINVEST_LIMIT = 2
export const FAST_TRACK_DIVERSIFIED_REINVEST_DISCOUNT = 0.2
export const FAST_TRACK_SELL_RECOVERY_RATE = 0.7
export const FAST_TRACK_DIVERSIFIED_SELL_RECOVERY_RATE = 0.8
export const fastTrackExpansionCost = (income: number) =>
  Math.max(50000, Math.round(income * 0.5 / 1000) * 1000)

export const fastTrackBusinessIncome = (businesses: FastTrackBusiness[]) => {
  const income = businesses.reduce((sum, business) => sum + business.cashFlow, 0)
  const sectors = new Set(businesses.map((business) => business.sector).filter(Boolean))
  const synergy = sectors.size >= 2 ? Math.round(income * 0.05 / 100) * 100 : 0
  return { income, synergy, total: income + synergy }
}

const replaceFastTrackBusinesses = (player: PlayerState, businesses: FastTrackBusiness[]) => {
  const previousIncome = fastTrackBusinessIncome(player.fastTrackBusinesses ?? []).total
  const nextIncome = fastTrackBusinessIncome(businesses).total
  return {
    fastTrackBusinesses: businesses,
    fastTrackIncome: Math.max(0, player.fastTrackIncome - previousIncome + nextIncome),
  }
}

const normalizedAsset = (asset: Asset): Asset => ({
  ...asset,
  level: asset.level ?? 1,
  baseCashFlow: asset.baseCashFlow ?? asset.cashFlow,
})

const portfolioBonus = (assets: Asset[], kind: Asset['kind']) => {
  const kinds = new Set(assets.map((asset) => asset.kind ?? 'real-estate'))
  const sameKind = assets.filter((asset) => (asset.kind ?? 'real-estate') === kind).length
  return (kinds.size >= 3 ? 0.1 : 0) + (sameKind >= 3 ? 0.15 : 0)
}

const recalculateAssets = (player: PlayerState, assets: Asset[]) => {
  const previousAssetIncome = player.assets.reduce((sum, asset) => sum + asset.cashFlow, 0)
  const unitemizedIncome = Math.max(0, player.passiveIncome - previousAssetIncome)
  const normalized = assets.map(normalizedAsset)
  const adjusted = normalized.map((asset) => {
    const kind = asset.kind ?? 'real-estate'
    const baseCashFlow = asset.baseCashFlow ?? asset.cashFlow
    const levelBonus = ((asset.level ?? 1) - 1) * 0.5
    const multiplier = 1 + levelBonus + portfolioBonus(normalized, kind)
    return { ...asset, cashFlow: Math.round(baseCashFlow * multiplier) }
  })
  return { assets: adjusted, passiveIncome: unitemizedIncome + adjusted.reduce((sum, asset) => sum + asset.cashFlow, 0) }
}

export const assetUpgradeCost = (state: GameState, player: PlayerState, asset: Asset) => {
  if ((asset.level ?? 1) >= 3) return 0
  const kind = asset.kind ?? 'real-estate'
  const base = Math.max(1000, Math.round((asset.baseCashFlow ?? asset.cashFlow) * 0.5 * 12 / 100) * 100)
  const professionDiscount = player.profession === '工程师' && kind === 'business'
    ? 0.5
    : player.profession === '维修技师' && kind === 'real-estate'
      ? 0.2
      : 0
  const cycle = currentEconomicCycle(state).id
  const cycleDiscount = cycle === 'property-boom' && kind === 'real-estate' ? 0.2 : cycle === 'steady-growth' && kind === 'business' ? 0.1 : 0
  return Math.max(500, Math.round(base * (1 - professionDiscount - cycleDiscount) / 100) * 100)
}

export const insuranceCost = (player: PlayerState, _insurance: InsuranceKind) => {
  return Math.max(500, Math.round((player.salary + player.passiveIncome) * 0.03 / 100) * 100)
}

export const insuranceCoverageRate = (player: PlayerState, insurance: InsuranceKind) =>
  player.profession === '医生' && insurance === 'job-loss'
    ? 0.75
    : 0.5

export const lawyerNegotiationBonus = (player: PlayerState, salePrice: number) =>
  player.profession === '律师' ? Math.min(1000, Math.round(salePrice * 0.05 / 100) * 100) : 0

const nextRandom = (seed: number) => {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0
  return { seed: nextSeed, value: nextSeed / 4294967296 }
}

const rollDie = (seed: number) => {
  const random = nextRandom(seed)
  return { seed: random.seed, value: Math.floor(random.value * 6) + 1 }
}

const shuffle = <Item,>(items: readonly Item[], seed: number) => {
  const shuffled = [...items]
  let nextSeed = seed
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = nextRandom(nextSeed)
    nextSeed = random.seed
    const target = Math.floor(random.value * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return { items: shuffled, seed: nextSeed }
}

export const childMonthlyExpenses = (player: PlayerState) =>
  player.profession === '护士' ? 0 : player.babies * player.perChildExpense

export const totalExpenses = (player: PlayerState) =>
  player.baseExpenses + childMonthlyExpenses(player) + player.bankLoan * 0.1

export const monthlyCashFlow = (player: PlayerState) =>
  player.salary + player.passiveIncome - totalExpenses(player)

export const canTakeLoan = (player: PlayerState, amount: number) =>
  amount > 0 && amount % 1000 === 0 && monthlyCashFlow(player) - amount * 0.1 >= 0

export const freedomProgress = (player: PlayerState) => {
  const expenses = totalExpenses(player)
  return expenses === 0 ? 100 : Math.min(100, Math.round((player.passiveIncome / expenses) * 100))
}

const createPlayer = (
  index: number,
  isHuman: boolean,
  profession: (typeof PROFESSIONS)[number],
  dream: string,
  longTermGoal: LongTermGoalId,
  aiPersonality?: AiPersonality,
  ratRaceBalanceVersion: RatRaceBalanceVersion = 'global-v2',
): PlayerState => {
  const cashFlow = profession.salary - profession.expenses
  const savings = ratRaceBalanceVersion === 'legacy'
    ? legacyProfessionSavings(profession.title, profession.savings)
    : profession.savings
  return {
    id: isHuman ? 'player-human' : `player-ai-${index}`,
    name: isHuman ? '你' : ['林晓', '周远', '陈禾'][index - 1],
    isHuman,
    profession: profession.title,
    cash: cashFlow + savings,
    salary: profession.salary,
    baseExpenses: profession.expenses,
    passiveIncome: 0,
    bankLoan: 0,
    babies: 0,
    perChildExpense: profession.perChildExpense,
    assets: [],
    position: 0,
    skippedTurns: 0,
    charityTurns: 0,
    phase: 'rat-race',
    fastTrackIncome: 0,
    fastTrackGoal: 0,
    fastTrackTurns: 0,
    fastTrackBusinesses: [],
    fastTrackExpansions: 0,
    fastTrackOperationsCompleted: 0,
    dream,
    bankrupt: false,
    aiPersonality,
    longTermGoal,
    longTermGoalCompleted: false,
    nurseDoodadTriggers: 0,
    nurseDoodadSavings: 0,
    nurseBabyTriggers: 0,
    engineerUpgradeTriggers: 0,
    engineerUpgradeSavings: 0,
    lawyerMarketTriggers: 0,
    lawyerMarketBonus: 0,
    strategyActionUsed: false,
    fastTrackStrategyUsed: false,
    dreamPreparation: 0,
  }
}

export const createGame = (
  aiCount: 1 | 2 | 3,
  seed = 20260713,
  humanDream?: string,
  humanProfession?: string,
  aiDifficulty: AiDifficulty = 'standard',
  aiPersonalities?: Array<AiPersonality | undefined>,
  marketPricingVersion: MarketPricingVersion = 'scaled-equity',
  fastTrackBalanceVersion: FastTrackBalanceVersion = 'accelerated',
  ratRaceBalanceVersion: RatRaceBalanceVersion = 'global-v2',
  strategyRulesVersion: StrategyRulesVersion = 'strategy-v1',
  humanLongTermGoal?: LongTermGoalId,
): GameState => {
  const professions = shuffle(PROFESSIONS, seed)
  const dreams = shuffle(DREAMS, professions.seed)
  const smallDeals = shuffle(SMALL_DEALS.map((deal) => deal.id), dreams.seed)
  const bigDeals = shuffle(BIG_DEALS.map((deal) => deal.id), smallDeals.seed)
  const doodads = shuffle(DOODADS.map((card) => card.id), bigDeals.seed)
  const markets = shuffle(MARKETS.map((card) => card.id), doodads.seed)
  const fastTrackBusinesses = shuffle(FAST_TRACK_BUSINESSES.map((business) => business.id), seed ^ 0x46544231)
  const fastTrackRisks = shuffle(FAST_TRACK_RISKS.map((risk) => risk.id), seed ^ 0x46545231)
  const personalities = shuffle<AiPersonality>(['conservative', 'balanced', 'aggressive'], seed ^ 0x41495031)
  const longTermGoals: LongTermGoalId[] = ['diversified', 'master-asset', 'debt-free']
  const longTermGoalOffset = ((seed ^ 0x474f414c) >>> 0) % longTermGoals.length
  const selectedHumanLongTermGoal = humanLongTermGoal ?? longTermGoals[longTermGoalOffset]
  const startingPlayer = nextRandom(markets.seed)
  const playerCount = aiCount + 1
  const selectedProfession = PROFESSIONS.find((profession) => profession.title === humanProfession)
  const orderedProfessions = selectedProfession
    ? [selectedProfession, ...professions.items.filter((profession) => profession.title !== selectedProfession.title)]
    : professions.items
  const selectedDream = humanDream ?? dreams.items[0]
  const selectedPersonalities = Array.from(
    { length: aiCount },
    (_, index) => aiPersonalities?.[index] ?? personalities.items[index % personalities.items.length],
  )
  return {
    schemaVersion: 2,
    setup: {
      aiCount,
      seed,
      dream: selectedDream,
      profession: humanProfession,
      longTermGoal: selectedHumanLongTermGoal,
      aiDifficulty,
      aiPersonalities: selectedPersonalities,
      marketPricingVersion,
      fastTrackBalanceVersion,
      ratRaceBalanceVersion,
      strategyRulesVersion,
    },
    commandHistory: [],
    revision: 0,
    seed: startingPlayer.seed,
    turn: 1,
    turnStage: 'awaiting-roll',
    currentPlayerIndex: Math.floor(startingPlayer.value * playerCount),
    players: Array.from({ length: playerCount }, (_, index) =>
      createPlayer(
        index,
        index === 0,
        orderedProfessions[index % orderedProfessions.length],
        index === 0 ? selectedDream : dreams.items[index % dreams.items.length],
        index === 0
          ? selectedHumanLongTermGoal
          : longTermGoals[(longTermGoalOffset + index) % longTermGoals.length],
        index === 0 ? undefined : selectedPersonalities[index - 1],
        ratRaceBalanceVersion,
      ),
    ),
    pendingDecision: null,
    opportunityIndex: 0,
    fastTrackIndex: 0,
    fastTrackRiskIndex: 0,
    smallDealDeck: smallDeals.items,
    bigDealDeck: bigDeals.items,
    doodadDeck: doodads.items,
    marketDeck: markets.items,
    fastTrackBusinessDeck: fastTrackBusinesses.items,
    fastTrackRiskDeck: fastTrackRisks.items,
    smallDealIndex: 0,
    bigDealIndex: 0,
    doodadIndex: 0,
    marketIndex: 0,
    logs: [
      {
        id: 0,
        playerId: 'system',
        message: `新游戏开始：职业、梦想、牌堆与起始玩家已随机生成。你将与 ${aiCount} 名 AI 对手竞争。`,
        tone: 'neutral',
      },
    ],
    winnerId: null,
    economicCycleIndex: 0,
  }
}

const appendLog = (
  state: GameState,
  playerId: string,
  message: string,
  tone: GameLogEntry['tone'] = 'neutral',
) => ({
  ...state,
  logs: [
    ...state.logs,
    { id: (state.logs.at(-1)?.id ?? -1) + 1, playerId, message, tone },
  ].slice(-40),
})

const updatePlayer = (state: GameState, playerId: string, update: (player: PlayerState) => PlayerState) => ({
  ...state,
  players: state.players.map((player) => (player.id === playerId ? update(player) : player)),
})

const completeLongTermGoal = (state: GameState, playerId: string) => {
  const player = state.players.find((candidate) => candidate.id === playerId)!
  if (player.longTermGoalCompleted) return state
  const kinds = new Set(player.assets.map((asset) => asset.kind ?? 'real-estate'))
  const completed = player.longTermGoal === 'diversified'
    ? kinds.size >= 3
    : player.longTermGoal === 'master-asset'
      ? player.assets.some((asset) => (asset.level ?? 1) >= 3)
      : player.assets.length >= 2 && player.bankLoan === 0
  if (!completed) return state
  const reward = player.profession === '教师' ? 5000 : 3000
  const nextState = updatePlayer(state, playerId, (current) => ({ ...current, cash: current.cash + reward, longTermGoalCompleted: true }))
  return appendLog(nextState, playerId, `完成长期目标，获得 $${reward.toLocaleString('zh-CN')} 策略奖励。`, 'positive')
}

const removeAssetOnce = (player: PlayerState, assetId: string) => {
  const assetIndex = player.assets.findIndex((asset) => asset.id === assetId)
  if (assetIndex < 0) return player
  const assets = player.assets.filter((_, index) => index !== assetIndex)
  return {
    ...player,
    ...recalculateAssets(player, assets),
  }
}

const requireSolvency = (state: GameState, playerId: string, reason: string) => {
  const player = state.players.find((candidate) => candidate.id === playerId)!
  if (player.cash >= 0 || player.bankrupt) return state
  return appendLog(
    {
      ...state,
      pendingDecision: { type: 'insolvency', playerId, reason },
      turnStage: 'awaiting-decision',
    },
    playerId,
    `现金缺口 $${Math.abs(player.cash).toLocaleString('zh-CN')}，需要借款、清算资产或宣布破产。`,
    'negative',
  )
}

const settlePaydays = (state: GameState, playerId: string, from: number, steps: number) => {
  let nextState = state
  for (let step = 1; step <= steps; step += 1) {
    const position = (from + step) % BOARD.length
    if (BOARD[position] !== 'payday') continue
    const player = nextState.players.find((candidate) => candidate.id === playerId)!
    const amount = monthlyCashFlow(player)
    nextState = updatePlayer(nextState, playerId, (current) => ({ ...current, cash: current.cash + amount }))
    nextState = appendLog(
      nextState,
      playerId,
      `经过发薪日，${amount >= 0 ? '获得' : '支付'} $${Math.abs(amount).toLocaleString('zh-CN')}。`,
      amount >= 0 ? 'positive' : 'negative',
    )
  }
  return nextState
}

const baseMarketPrice = (
  card: Extract<MarketCard, { type: 'asset-offer' }>,
  asset: PlayerState['assets'][number],
  pricingVersion: MarketPricingVersion,
) =>
  card.pricePerUnit !== undefined
    ? card.pricePerUnit * (asset.quantity ?? 1)
    : pricingVersion === 'scaled-equity' && card.equityMultiple !== undefined
      ? asset.mortgage + Math.round(asset.downPayment * card.equityMultiple)
      : card.salePrice ?? (card.id === 'market-apartment'
        ? 70000
        : card.id === 'market-business'
          ? 45000
          : asset.mortgage + asset.downPayment * 2)

const marketPrice = (
  card: Extract<MarketCard, { type: 'asset-offer' }>,
  asset: PlayerState['assets'][number],
  pricingVersion: MarketPricingVersion,
) => {
  const basePrice = baseMarketPrice(card, asset, pricingVersion)
  const levelRate = asset.symbol ? 0 : (asset.level ?? 1) === 3 ? 0.2 : (asset.level ?? 1) === 2 ? 0.1 : 0
  const levelPremium = Math.round(Math.max(0, basePrice - asset.mortgage) * levelRate / 100) * 100
  return { salePrice: basePrice + levelPremium, levelPremium }
}

const matchesMarketCard = (card: Extract<MarketCard, { type: 'asset-offer' }>, asset: PlayerState['assets'][number]) =>
  (card.assetId !== undefined && (asset.sourceId ?? asset.id) === card.assetId) ||
  (card.assetKind !== undefined && asset.kind === card.assetKind)

const nextMarketDecision = (
  state: GameState,
  card: Extract<MarketCard, { type: 'asset-offer' }>,
  responderIds: string[],
): GameState => {
  const [playerId, ...remainingIds] = responderIds
  if (!playerId) return { ...state, pendingDecision: null }
  const player = state.players.find((candidate) => candidate.id === playerId)
  const asset = player?.assets.find((candidate) => matchesMarketCard(card, candidate))
  if (!player || player.bankrupt || !asset) return nextMarketDecision(state, card, remainingIds)
  const { salePrice, levelPremium } = marketPrice(card, asset, state.setup.marketPricingVersion ?? 'legacy-fixed')
  return appendLog(
    {
      ...state,
      pendingDecision: {
        type: 'market', playerId, assetId: asset.id, assetName: asset.name, salePrice, levelPremium,
        cardId: card.id, responderIds,
      },
    },
    playerId,
    `${card.name}：${asset.name} 报价 $${salePrice.toLocaleString('zh-CN')}${levelPremium > 0 ? `（L${asset.level} 等级增值 +$${levelPremium.toLocaleString('zh-CN')}）` : ''}。`,
  )
}

const resolveMarket = (state: GameState, playerId: string): GameState => {
  const deck = state.marketDeck?.length ? state.marketDeck : MARKETS.map((card) => card.id)
  const cardId = deck[(state.marketIndex ?? 0) % deck.length]
  const card = MARKETS.find((candidate) => candidate.id === cardId) ?? MARKETS[0]
  let nextState: GameState = { ...state, marketIndex: (state.marketIndex ?? 0) + 1 }

  if (card.type === 'security-split') {
    let affected = 0
    nextState = {
      ...nextState,
      players: nextState.players.map((candidate) => ({
        ...candidate,
        assets: candidate.assets.map((asset) => {
          if (asset.symbol !== card.symbol) return asset
          affected += 1
          return {
            ...asset,
            quantity: Math.max(1, Math.floor((asset.quantity ?? 1) * card.multiplier)),
            costPerUnit: (asset.costPerUnit ?? asset.downPayment) / card.multiplier,
          }
        }),
      })),
    }
    return appendLog(nextState, playerId, `${card.name}：${affected > 0 ? card.description : '当前无人持有对应证券。'}`)
  }

  const triggerIndex = nextState.players.findIndex((candidate) => candidate.id === playerId)
  const eligiblePlayers = Array.from({ length: nextState.players.length }, (_, offset) =>
    nextState.players[(triggerIndex + offset) % nextState.players.length],
  ).filter((candidate) => !candidate.bankrupt && candidate.assets.some((asset) => matchesMarketCard(card, asset)))
  if (eligiblePlayers.length === 0) return appendLog(nextState, playerId, `${card.name}：当前无人持有符合报价的资产。`)
  return nextMarketDecision(nextState, card, eligiblePlayers.map((player) => player.id))
}

const resolveLanding = (state: GameState, playerId: string, space: SpaceType): GameState => {
  const player = state.players.find((candidate) => candidate.id === playerId)!
  if (space === 'opportunity') {
    return appendLog(
      {
        ...state,
        pendingDecision: { type: 'deal-choice', playerId },
      },
      playerId,
      '抵达投资机会：选择小生意或大买卖牌堆。',
    )
  }
  if (space === 'charity') {
    const donation = Math.round((player.salary + player.passiveIncome) * 0.1)
    return appendLog(
      { ...state, pendingDecision: { type: 'charity', playerId, donation } },
      playerId,
      `可以捐赠 $${donation.toLocaleString('zh-CN')}，换取 3 回合双骰选择。`,
    )
  }
  if (space === 'doodad') {
    const deck = state.doodadDeck?.length ? state.doodadDeck : DOODADS.map((card) => card.id)
    const cardId = deck[(state.doodadIndex ?? 0) % deck.length]
    const card = DOODADS.find((candidate) => candidate.id === cardId) ?? DOODADS[0]
    const lifestyleFactor = state.setup.ratRaceBalanceVersion === 'global-v2'
      ? Math.min(1.5, Math.max(0.75, player.baseExpenses / 3000))
      : 1
    const lifestyleCost = Math.round(card.cost * lifestyleFactor / 50) * 50
    const originalCost = lifestyleCost + (card.perChild ?? 0) * player.babies
    const careSavings = player.profession === '护士' && card.id === 'doodad-dental'
      ? Math.round(originalCost * 0.5 / 50) * 50
      : 0
    const cost = originalCost - careSavings
    const nextState = updatePlayer(state, playerId, (current) => ({
      ...current,
      cash: current.cash - cost,
      nurseDoodadTriggers: (current.nurseDoodadTriggers ?? 0) + (careSavings > 0 ? 1 : 0),
      nurseDoodadSavings: (current.nurseDoodadSavings ?? 0) + careSavings,
    }))
    return appendLog(
      { ...nextState, doodadIndex: (state.doodadIndex ?? 0) + 1 },
      playerId,
      `${card.name}：${card.description}${cost > 0 ? ` 支付 $${cost.toLocaleString('zh-CN')}${careSavings > 0 ? `，生活照护节省 $${careSavings.toLocaleString('zh-CN')}` : ''}。` : ' 当前无需支付。'}`,
      cost > 0 ? 'negative' : 'neutral',
    )
  }
  if (space === 'baby') {
    const nextState = updatePlayer(state, playerId, (current) => ({
      ...current,
      babies: Math.min(3, current.babies + 1),
      nurseBabyTriggers: (current.nurseBabyTriggers ?? 0)
        + (current.profession === '护士' && current.babies < 3 ? 1 : 0),
    }))
    return appendLog(
      nextState,
      playerId,
      player.profession === '护士'
        ? '家庭新增成员，护理经验使儿童月支出不增加。'
        : '家庭新增成员，每月支出上升。',
      player.profession === '护士' ? 'positive' : 'negative',
    )
  }
  if (space === 'downsized') {
    const expenses = totalExpenses(player)
    const insured = player.insurance === 'job-loss'
    const cost = insured ? Math.round(expenses * (1 - insuranceCoverageRate(player, 'job-loss'))) : expenses
    const skippedTurns = 2
    const nextState = updatePlayer(state, playerId, (current) => ({
      ...current,
      cash: current.cash - cost,
      skippedTurns,
      insurance: insured ? undefined : current.insurance,
    }))
    return appendLog(
      nextState,
      playerId,
      `进入失业期：${insured ? `保险承担 ${Math.round(insuranceCoverageRate(player, 'job-loss') * 100)}%，` : ''}支付 $${cost.toLocaleString('zh-CN')}，并跳过 ${skippedTurns} 回合。`,
      'negative',
    )
  }
  if (space === 'market') {
    return resolveMarket(state, playerId)
  }
  return state
}

const settleFastTrackCashflowDays = (
  state: GameState,
  playerId: string,
  from: number,
  steps: number,
) => {
  let nextState = state
  for (let step = 1; step <= steps; step += 1) {
    const position = (from + step) % FAST_TRACK_BOARD.length
    if (FAST_TRACK_BOARD[position] !== 'cashflow-day') continue
    const player = nextState.players.find((candidate) => candidate.id === playerId)!
    nextState = updatePlayer(nextState, playerId, (current) => ({
      ...current,
      cash: current.cash + player.fastTrackIncome,
    }))
    nextState = appendLog(
      nextState,
      playerId,
      `经过快车道现金流日，获得 $${player.fastTrackIncome.toLocaleString('zh-CN')}。`,
      'positive',
    )
  }
  return nextState
}

const resolvePreparedDreamPass = (state: GameState, playerId: string, from: number, steps: number) => {
  const player = state.players.find((candidate) => candidate.id === playerId)!
  if ((player.dreamPreparation ?? 0) < 3) return state
  for (let step = 1; step <= steps; step += 1) {
    const position = (from + step) % FAST_TRACK_BOARD.length
    if (FAST_TRACK_DREAM_BY_POSITION[position] !== player.dream) continue
    const startingIncome = player.fastTrackGoal - 50000
    const cost = state.setup.fastTrackBalanceVersion === 'accelerated'
      ? fastTrackDreamCost(player.dream, startingIncome)
      : state.setup.fastTrackBalanceVersion === 'income-scaled'
        ? fastTrackDreamCost(player.dream, startingIncome, 24)
        : FAST_TRACK_DREAM_COSTS[player.dream]
    return appendLog({ ...state, pendingDecision: { type: 'dream', playerId, dream: player.dream, cost } }, playerId, `梦想准备完成，经过“${player.dream}”时可以实现梦想。`, 'positive')
  }
  return state
}

const resolveFastTrackLanding = (state: GameState, playerId: string): GameState => {
  const player = state.players.find((candidate) => candidate.id === playerId)!
  const space = FAST_TRACK_BOARD[player.position]
  if ((space === 'business' || space === 'dream') && (player.fastTrackTurns ?? 0) < 2) {
    return appendLog(
      state,
      playerId,
      `首次体验快车道，本回合暂不开放${space === 'business' ? '企业投资' : '梦想购买'}。`,
    )
  }
  if (space === 'business') {
    const deck = state.fastTrackBusinessDeck?.length
      ? state.fastTrackBusinessDeck
      : FAST_TRACK_BUSINESSES.map((business) => business.id)
    const businessId = deck[(state.fastTrackIndex ?? 0) % deck.length]
    const business = FAST_TRACK_BUSINESSES.find((candidate) => candidate.id === businessId) ?? FAST_TRACK_BUSINESSES[0]
    const offeredBusiness = state.setup.fastTrackBalanceVersion === 'accelerated'
      ? business
      : state.setup.fastTrackBalanceVersion === 'income-scaled'
        ? incomeScaledFastTrackBusiness(business)
        : legacyFastTrackBusiness(business)
    return appendLog(
      {
        ...state,
        fastTrackIndex: (state.fastTrackIndex ?? 0) + 1,
        pendingDecision: { type: 'fast-track-business', playerId, business: offeredBusiness },
      },
      playerId,
      `发现快车道企业：${offeredBusiness.name}。`,
    )
  }
  if (space === 'dream') {
    const dream = FAST_TRACK_DREAM_BY_POSITION[player.position]
    if (dream !== player.dream) {
      return appendLog(state, playerId, `抵达梦想格“${dream}”，但这不是你选择的梦想。`)
    }
    return appendLog(
      {
        ...state,
        pendingDecision: {
          type: 'dream',
          playerId,
          dream,
          cost: state.setup.fastTrackBalanceVersion === 'accelerated'
            ? fastTrackDreamCost(dream, player.fastTrackGoal - 50000)
            : state.setup.fastTrackBalanceVersion === 'income-scaled'
              ? fastTrackDreamCost(dream, player.fastTrackGoal - 50000, 24)
              : FAST_TRACK_DREAM_COSTS[dream],
        },
      },
      playerId,
      `抵达你的梦想格：${dream}。`,
    )
  }
  if (space === 'risk') {
    const deck = state.fastTrackRiskDeck?.length
      ? state.fastTrackRiskDeck
      : FAST_TRACK_RISKS.map((risk) => risk.id)
    const riskId = deck[(state.fastTrackRiskIndex ?? 0) % deck.length]
    const risk = FAST_TRACK_RISKS.find((candidate) => candidate.id === riskId) ?? FAST_TRACK_RISKS[0]
    const covered = player.insurance === 'maintenance' && risk.id === 'risk-maintenance' || player.insurance === 'lawsuit' && risk.id === 'risk-lawsuit'
    const rawLoss = risk.effect === 'cash-percent'
      ? Math.round(player.cash * risk.amount)
      : risk.effect === 'cash-fixed'
        ? risk.amount
        : Math.round(player.fastTrackIncome * risk.amount)
    const resilientBusinesses = (player.fastTrackBusinesses ?? []).filter((business) => business.upgrade === 'resilience').length
    const resilienceRate = Math.min(0.75, resilientBusinesses * 0.25)
    const resilientLoss = Math.round(rawLoss * (1 - resilienceRate))
    const coverageRate = covered ? insuranceCoverageRate(player, player.insurance!) : 0
    const loss = covered ? Math.round(resilientLoss * (1 - coverageRate)) : resilientLoss
    const nextState = updatePlayer(state, playerId, (current) => risk.effect === 'income-percent'
      ? { ...current, fastTrackIncome: Math.max(0, current.fastTrackIncome - loss) }
      : { ...current, cash: Math.max(0, current.cash - loss), insurance: covered ? undefined : current.insurance })
    return appendLog(
      { ...nextState, fastTrackRiskIndex: (state.fastTrackRiskIndex ?? 0) + 1 },
      playerId,
      `${risk.name}：${resilienceRate > 0 ? `韧性化减免 ${Math.round(resilienceRate * 100)}%；` : ''}${covered ? `保险承担 ${Math.round(coverageRate * 100)}%；` : risk.description}${risk.effect === 'income-percent' ? ' 现金流日收入' : ' 现金'}减少 $${loss.toLocaleString('zh-CN')}。`,
      'negative',
    )
  }
  return state
}

const checkFastTrack = (state: GameState, playerId: string) => {
  const player = state.players.find((candidate) => candidate.id === playerId)!
  if (player.phase !== 'rat-race' || player.passiveIncome <= totalExpenses(player)) return state
  const roundedPassiveIncome = Math.round(player.passiveIncome / 1000) * 1000
  const fastTrackIncome = roundedPassiveIncome * 100
  const jobLossInsuranceEnded = player.insurance === 'job-loss'
  const nextState = updatePlayer(state, playerId, (current) => ({
    ...current,
    phase: 'fast-track',
    fastTrackIncome,
    fastTrackGoal: fastTrackIncome + 50000,
    position: 0,
    insurance: jobLossInsuranceEnded ? undefined : current.insurance,
  }))
  return appendLog(
    nextState,
    playerId,
    `被动收入超过总支出，进入快车道！${jobLossInsuranceEnded ? ' 快车道没有失业事件，失业保险自动终止。' : ''}`,
    'positive',
  )
}

const finish = (state: GameState) => ({ ...state, revision: state.revision + 1 })

const reachesFastTrackIncomeVictory = (_state: GameState, player: PlayerState, income: number) =>
  income >= player.fastTrackGoal

const executeCommandInternal = (state: GameState, command: GameCommand): CommandResult => {
  const currentPlayer = state.players[state.currentPlayerIndex]
  const actor = state.players.find((player) => player.id === command.actorId)
  const isPendingResponder = state.pendingDecision?.playerId === command.actorId
  if (!actor || (command.actorId !== currentPlayer.id && !isPendingResponder)) {
    return { ok: false, state, error: 'NOT_YOUR_TURN' }
  }
  if (state.winnerId) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }

  if (command.type === 'ROLL_DICE') {
    if (state.pendingDecision || state.turnStage !== 'awaiting-roll') {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const diceCount =
      command.diceCount ??
      (currentPlayer.phase === 'fast-track' || currentPlayer.charityTurns > 0 ? 2 : 1)
    let seed = state.seed
    const values: number[] = []
    for (let index = 0; index < diceCount; index += 1) {
      const roll = rollDie(seed)
      seed = roll.seed
      values.push(roll.value)
    }
    const steps = values.reduce((sum, value) => sum + value, 0)
    const from = currentPlayer.position
    const trackLength = currentPlayer.phase === 'fast-track' ? FAST_TRACK_BOARD.length : BOARD.length
    const to = (from + steps) % trackLength
    let nextState = { ...state, seed }
    nextState = updatePlayer(nextState, currentPlayer.id, (player) => ({
      ...player,
      position: to,
      fastTrackTurns:
        player.phase === 'fast-track' ? (player.fastTrackTurns ?? 0) + 1 : player.fastTrackTurns,
      charityTurns: Math.max(0, player.charityTurns - (player.charityTurns > 0 ? 1 : 0)),
    }))
    nextState = appendLog(nextState, currentPlayer.id, `掷出 ${values.join(' + ')}，前进 ${steps} 格。`)
    if (currentPlayer.phase === 'fast-track') {
      nextState = settleFastTrackCashflowDays(nextState, currentPlayer.id, from, steps)
      if (!nextState.winnerId) nextState = resolvePreparedDreamPass(nextState, currentPlayer.id, from, steps)
      if (!nextState.winnerId && !nextState.pendingDecision) nextState = resolveFastTrackLanding(nextState, currentPlayer.id)
    } else {
      nextState = settlePaydays(nextState, currentPlayer.id, from, steps)
      nextState = resolveLanding(nextState, currentPlayer.id, BOARD[to])
      nextState = requireSolvency(nextState, currentPlayer.id, '强制支出或发薪日结算')
    }
    nextState = {
      ...nextState,
      turnStage: nextState.pendingDecision ? 'awaiting-decision' : 'awaiting-end',
    }
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'DRAW_DEAL') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'deal-choice' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const isSmall = command.dealSize === 'small'
    const cards = isSmall ? SMALL_DEALS : BIG_DEALS
    const deck = isSmall
      ? (state.smallDealDeck?.length ? state.smallDealDeck : cards.map((card) => card.id))
      : (state.bigDealDeck?.length ? state.bigDealDeck : cards.map((card) => card.id))
    const index = isSmall ? (state.smallDealIndex ?? 0) : (state.bigDealIndex ?? 0)
    const cardId = deck[index % deck.length]
    const opportunity = cards.find((card) => card.id === cardId) ?? cards[0]
    const nextState: GameState = {
      ...state,
      pendingDecision: { type: 'opportunity', playerId: actor.id, opportunity },
      smallDealIndex: isSmall ? index + 1 : (state.smallDealIndex ?? 0),
      bigDealIndex: isSmall ? (state.bigDealIndex ?? 0) : index + 1,
      opportunityIndex: state.opportunityIndex + 1,
    }
    return {
      ok: true,
      state: finish(appendLog(nextState, actor.id, `抽取${isSmall ? '小生意' : '大买卖'}：${opportunity.name}。`)),
    }
  }

  if (command.type === 'BUY_OPPORTUNITY') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'opportunity' || decision.playerId !== command.actorId) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    if (currentPlayer.cash < decision.opportunity.downPayment) {
      return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    }
    const passiveIncomeBefore = currentPlayer.passiveIncome
    let nextState = updatePlayer(state, currentPlayer.id, (player) => {
      const sourceId = decision.opportunity.id
      const existingIds = new Set(player.assets.map((asset) => asset.id))
      let instanceNumber = 1
      while (existingIds.has(`${sourceId}#${instanceNumber}`)) instanceNumber += 1
      const asset = normalizedAsset({
        ...decision.opportunity,
        id: `${sourceId}#${instanceNumber}`,
        sourceId,
      })
      const finances = recalculateAssets(player, [...player.assets, asset])
      return { ...player, cash: player.cash - decision.opportunity.downPayment, ...finances }
    })
    const passiveIncomeAfter = nextState.players.find((player) => player.id === currentPlayer.id)!.passiveIncome
    const totalIncomeGain = passiveIncomeAfter - passiveIncomeBefore
    const portfolioIncomeGain = totalIncomeGain - decision.opportunity.cashFlow
    const incomeMessage = portfolioIncomeGain > 0
      ? `被动收入实际 +$${totalIncomeGain.toLocaleString('zh-CN')}/月（资产本身 +$${decision.opportunity.cashFlow.toLocaleString('zh-CN')}，组合加成 +$${portfolioIncomeGain.toLocaleString('zh-CN')}）。`
      : `被动收入 +$${decision.opportunity.cashFlow.toLocaleString('zh-CN')}/月。`
    nextState = appendLog(
      { ...nextState, pendingDecision: null, turnStage: 'awaiting-end' },
      currentPlayer.id,
      `购买 ${decision.opportunity.name}，${incomeMessage}`,
      'positive',
    )
    nextState = completeLongTermGoal(nextState, currentPlayer.id)
    nextState = checkFastTrack(nextState, currentPlayer.id)
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'PASS_OPPORTUNITY') {
    if (state.pendingDecision?.type !== 'opportunity') {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    return {
      ok: true,
      state: finish(
        appendLog(
          { ...state, pendingDecision: null, turnStage: 'awaiting-end' },
          currentPlayer.id,
          '放弃了这次投资机会。',
        ),
      ),
    }
  }

  if (command.type === 'CHOOSE_CHARITY') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'charity') {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    if (command.donate && currentPlayer.cash < decision.donation) {
      return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    }
    let nextState: GameState = { ...state, pendingDecision: null, turnStage: 'awaiting-end' }
    if (command.donate) {
      const charityDuration = currentPlayer.profession === '警员' ? 4 : 3
      nextState = updatePlayer(nextState, currentPlayer.id, (player) => ({
        ...player,
        cash: player.cash - decision.donation,
        charityTurns: player.charityTurns + charityDuration,
      }))
    }
    nextState = appendLog(
      nextState,
      currentPlayer.id,
      command.donate ? `完成慈善捐赠，未来 ${currentPlayer.profession === '警员' ? 4 : 3} 回合可以使用双骰。` : '放弃了慈善捐赠。',
      command.donate ? 'positive' : 'neutral',
    )
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'TAKE_LOAN') {
    if (actor.phase !== 'rat-race' || (actor.id !== currentPlayer.id && state.pendingDecision?.type !== 'insolvency')) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    if (!canTakeLoan(actor, command.amount)) {
      return { ok: false, state, error: 'INVALID_AMOUNT' }
    }
    let nextState = updatePlayer(state, actor.id, (player) => ({
      ...player,
      cash: player.cash + command.amount,
      bankLoan: player.bankLoan + command.amount,
    }))
    const updatedActor = nextState.players.find((player) => player.id === actor.id)!
    if (state.pendingDecision?.type === 'insolvency' && updatedActor.cash >= 0) {
      nextState = { ...nextState, pendingDecision: null, turnStage: 'awaiting-end' }
    }
    return {
      ok: true,
      state: finish(
        appendLog(nextState, actor.id, `银行借款 $${command.amount.toLocaleString('zh-CN')}。`, 'negative'),
      ),
    }
  }

  if (command.type === 'REPAY_LOAN') {
    if (
      actor.id !== currentPlayer.id ||
      actor.phase !== 'rat-race' ||
      state.turnStage !== 'awaiting-end' ||
      state.pendingDecision !== null ||
      command.amount <= 0 ||
      command.amount % 100 !== 0 ||
      command.amount > actor.cash ||
      command.amount > actor.bankLoan
    ) {
      return { ok: false, state, error: 'INVALID_AMOUNT' }
    }
    let nextState = updatePlayer(state, actor.id, (player) => ({
      ...player,
      cash: player.cash - command.amount,
      bankLoan: player.bankLoan - command.amount,
    }))
    nextState = appendLog(nextState, actor.id, `偿还银行贷款 $${command.amount.toLocaleString('zh-CN')}。`, 'positive')
    nextState = checkFastTrack(nextState, actor.id)
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'SELL_MARKET_ASSET') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'market' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const asset = actor.assets.find((candidate) => candidate.id === decision.assetId)
    if (!asset) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const negotiationBonus = lawyerNegotiationBonus(actor, decision.salePrice)
    const negotiatedSalePrice = decision.salePrice + negotiationBonus
    const netProceeds = negotiatedSalePrice - asset.mortgage
    const costBasis = asset.symbol
      ? (asset.costPerUnit ?? asset.downPayment) * (asset.quantity ?? 1)
      : asset.downPayment
    const realizedProfit = netProceeds - costBasis
    let nextState = updatePlayer(state, actor.id, (player) => {
      const withoutAsset = removeAssetOnce(player, decision.assetId)
      return {
        ...withoutAsset,
        cash: withoutAsset.cash + netProceeds,
        lawyerMarketTriggers: (withoutAsset.lawyerMarketTriggers ?? 0) + (negotiationBonus > 0 ? 1 : 0),
        lawyerMarketBonus: (withoutAsset.lawyerMarketBonus ?? 0) + negotiationBonus,
      }
    })
    const card = MARKETS.find((candidate): candidate is Extract<MarketCard, { type: 'asset-offer' }> =>
      candidate.id === decision.cardId && candidate.type === 'asset-offer',
    )
    if (!card) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const updatedActor = nextState.players.find((player) => player.id === actor.id)!
    const stillOwnsMatchingAsset = updatedActor.assets.some((candidate) => matchesMarketCard(card, candidate))
    nextState = nextMarketDecision(
      nextState,
      card,
      stillOwnsMatchingAsset ? decision.responderIds : decision.responderIds.slice(1),
    )
    nextState = appendLog(
      { ...nextState, turnStage: nextState.pendingDecision ? 'awaiting-decision' : 'awaiting-end' },
      actor.id,
      `按市场报价出售 ${decision.assetName}${negotiationBonus > 0 ? `，合同谈判增加成交价 $${negotiationBonus.toLocaleString('zh-CN')}` : ''}；成交款先扣除该资产抵押 $${asset.mortgage.toLocaleString('zh-CN')}，银行贷款不变，净收入 $${netProceeds.toLocaleString('zh-CN')}，${realizedProfit >= 0 ? '盈利' : '亏损'} $${Math.abs(realizedProfit).toLocaleString('zh-CN')}。`,
      realizedProfit >= 0 ? 'positive' : 'negative',
    )
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'PASS_MARKET') {
    const decision = state.pendingDecision
    if (decision?.type !== 'market' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const card = MARKETS.find((candidate): candidate is Extract<MarketCard, { type: 'asset-offer' }> =>
      candidate.id === decision.cardId && candidate.type === 'asset-offer',
    )
    if (!card) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const nextState = nextMarketDecision(state, card, decision.responderIds.slice(1))
    return {
      ok: true,
      state: finish(appendLog({ ...nextState, turnStage: nextState.pendingDecision ? 'awaiting-decision' : 'awaiting-end' }, actor.id, '放弃市场收购报价。')),
    }
  }

  if (command.type === 'LIQUIDATE_ASSET') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'insolvency' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const asset = actor.assets.find((candidate) => candidate.id === command.assetId)
    if (!asset) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const recovery = Math.round(asset.downPayment * 0.5)
    let nextState = updatePlayer(state, actor.id, (player) => {
      const withoutAsset = removeAssetOnce(player, command.assetId)
      return { ...withoutAsset, cash: withoutAsset.cash + recovery }
    })
    const updatedActor = nextState.players.find((player) => player.id === actor.id)!
    nextState = appendLog(nextState, actor.id, `清算 ${asset.name}，回收 $${recovery.toLocaleString('zh-CN')}。`, 'negative')
    if (updatedActor.cash >= 0) nextState = { ...nextState, pendingDecision: null, turnStage: 'awaiting-end' }
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'DECLARE_BANKRUPTCY') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'insolvency' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    let nextState = updatePlayer(state, actor.id, (player) => ({ ...player, bankrupt: true, phase: 'finished' }))
    const remainingPlayers = nextState.players.filter((player) => !player.bankrupt)
    nextState = appendLog(
      { ...nextState, pendingDecision: null, turnStage: 'awaiting-end', winnerId: remainingPlayers.length === 1 ? remainingPlayers[0].id : null },
      actor.id,
      '无法完成强制付款，宣布破产并退出游戏。',
      'negative',
    )
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'BUY_FAST_TRACK_BUSINESS') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'fast-track-business' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    if ((actor.fastTrackTurns ?? 0) < 2) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    if (actor.cash < decision.business.cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const sourceId = decision.business.sourceId ?? decision.business.id
    const existingIds = new Set((actor.fastTrackBusinesses ?? []).map((business) => business.id))
    let instanceId = sourceId
    let instanceNumber = 2
    while (existingIds.has(instanceId)) {
      instanceId = `${sourceId}#${instanceNumber}`
      instanceNumber += 1
    }
    const business = { ...decision.business, id: instanceId, sourceId, baseCashFlow: decision.business.baseCashFlow ?? decision.business.cashFlow }
    const businesses = [...(actor.fastTrackBusinesses ?? []), business]
    const businessChanges = replaceFastTrackBusinesses(actor, businesses)
    const incomeGain = businessChanges.fastTrackIncome - actor.fastTrackIncome
    const synergy = fastTrackBusinessIncome(businesses).synergy
    const newIncome = businessChanges.fastTrackIncome
    const won = reachesFastTrackIncomeVictory(state, actor, newIncome)
    let nextState = updatePlayer(state, actor.id, (player) => ({
      ...player,
      cash: player.cash - decision.business.cost,
      ...businessChanges,
      phase: won ? 'finished' : player.phase,
    }))
    nextState = appendLog(
      { ...nextState, pendingDecision: null, turnStage: 'awaiting-end', winnerId: won ? actor.id : state.winnerId },
      actor.id,
      `购买 ${decision.business.name}，现金流日收入 +$${incomeGain.toLocaleString('zh-CN')}${synergy > 0 ? `（含多产业协同 $${synergy.toLocaleString('zh-CN')}）` : ''}${won ? '，达成收入目标并获胜！' : '。'}`,
      'positive',
    )
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'PASS_FAST_TRACK_BUSINESS') {
    if (state.pendingDecision?.type !== 'fast-track-business' || state.pendingDecision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    return { ok: true, state: finish({ ...state, pendingDecision: null, turnStage: 'awaiting-end' }) }
  }

  if (command.type === 'BUY_DREAM') {
    const decision = state.pendingDecision
    if (!decision || decision.type !== 'dream' || decision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    if ((actor.fastTrackTurns ?? 0) < 2) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    if (actor.cash < decision.cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    let nextState = updatePlayer(state, actor.id, (player) => ({ ...player, cash: player.cash - decision.cost, phase: 'finished' }))
    nextState = appendLog(
      { ...nextState, pendingDecision: null, turnStage: 'awaiting-end', winnerId: actor.id },
      actor.id,
      `实现梦想“${decision.dream}”，赢得游戏！`,
      'positive',
    )
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'PASS_DREAM') {
    if (state.pendingDecision?.type !== 'dream' || state.pendingDecision.playerId !== actor.id) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    return { ok: true, state: finish({ ...state, pendingDecision: null, turnStage: 'awaiting-end' }) }
  }

  if (command.type === 'FAST_TRACK_EXPAND') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'fast-track' || state.turnStage !== 'awaiting-roll' || actor.fastTrackStrategyUsed || (actor.fastTrackExpansions ?? 0) >= FAST_TRACK_EXPANSION_LIMIT) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const cost = fastTrackExpansionCost(actor.fastTrackIncome)
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const income = actor.fastTrackIncome + FAST_TRACK_EXPANSION_GAIN
    const won = reachesFastTrackIncomeVictory(state, actor, income)
    const nextState = updatePlayer(state, actor.id, (player) => ({ ...player, cash: player.cash - cost, fastTrackIncome: income, fastTrackExpansions: (player.fastTrackExpansions ?? 0) + 1, fastTrackStrategyUsed: true, phase: won ? 'finished' : player.phase }))
    return { ok: true, state: finish(appendLog({ ...nextState, winnerId: won ? actor.id : state.winnerId }, actor.id, `扩张现有企业（${(actor.fastTrackExpansions ?? 0) + 1}/${FAST_TRACK_EXPANSION_LIMIT}），支付 $${cost.toLocaleString('zh-CN')}，现金流日收入 +$${FAST_TRACK_EXPANSION_GAIN.toLocaleString('zh-CN')}${won ? '，达成收入目标！' : '。'}`, 'positive')) }
  }

  if (command.type === 'FAST_TRACK_UPGRADE_BUSINESS') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'fast-track' || state.turnStage !== 'awaiting-roll' || actor.fastTrackStrategyUsed) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const business = (actor.fastTrackBusinesses ?? []).find((candidate) => candidate.id === command.businessId && !candidate.upgrade)
    if (!business) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const cost = fastTrackUpgradeCost(business, command.branch)
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const growthGain = command.branch === 'growth' ? Math.round(business.cashFlow * FAST_TRACK_GROWTH_UPGRADE_RATE / 100) * 100 : 0
    const businesses = (actor.fastTrackBusinesses ?? []).map((candidate) => candidate.id === business.id
      ? { ...candidate, upgrade: command.branch, cashFlow: candidate.cashFlow + growthGain }
      : candidate)
    const businessChanges = replaceFastTrackBusinesses(actor, businesses)
    const won = reachesFastTrackIncomeVictory(state, actor, businessChanges.fastTrackIncome)
    const nextState = updatePlayer(state, actor.id, (player) => ({
      ...player,
      ...businessChanges,
      cash: player.cash - cost,
      fastTrackStrategyUsed: true,
      phase: won ? 'finished' : player.phase,
    }))
    return { ok: true, state: finish(appendLog(
      { ...nextState, winnerId: won ? actor.id : state.winnerId },
      actor.id,
      `将“${business.name}”升级为${command.branch === 'growth' ? `规模化，支付 $${cost.toLocaleString('zh-CN')}，企业收入提高 50%（+$${growthGain.toLocaleString('zh-CN')}）` : `韧性化，支付 $${cost.toLocaleString('zh-CN')}，所有快车道风险损失降低 25%`}${won ? '，达成收入目标！' : '。'}`,
      'positive',
    )) }
  }

  if (command.type === 'FAST_TRACK_REINVEST' || command.type === 'FAST_TRACK_OPERATE' && command.mode === 'reinvest') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'fast-track' || state.turnStage !== 'awaiting-roll' || actor.fastTrackStrategyUsed) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const business = (actor.fastTrackBusinesses ?? []).find((candidate) => candidate.id === command.businessId)
    if (!business || (business.reinvestments ?? 0) >= FAST_TRACK_REINVEST_LIMIT) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const cost = fastTrackReinvestCost(actor.fastTrackBusinesses ?? [], business)
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const incomeGain = Math.round(business.cashFlow * FAST_TRACK_REINVEST_RATE / 100) * 100
    const businesses = (actor.fastTrackBusinesses ?? []).map((candidate) => candidate.id === business.id
      ? { ...candidate, cashFlow: candidate.cashFlow + incomeGain, reinvestments: (candidate.reinvestments ?? 0) + 1 }
      : candidate)
    const businessChanges = replaceFastTrackBusinesses(actor, businesses)
    const won = reachesFastTrackIncomeVictory(state, actor, businessChanges.fastTrackIncome)
    const nextState = updatePlayer(state, actor.id, (player) => ({
      ...player,
      ...businessChanges,
      cash: player.cash - cost,
      fastTrackStrategyUsed: true,
      phase: won ? 'finished' : player.phase,
    }))
    return { ok: true, state: finish(appendLog(
      { ...nextState, winnerId: won ? actor.id : state.winnerId },
      actor.id,
      `再投资“${business.name}”：支付 $${cost.toLocaleString('zh-CN')}，企业收入提高 25%（+$${incomeGain.toLocaleString('zh-CN')}）${won ? '，达成收入目标！' : '。'}`,
      'positive',
    )) }
  }

  if (command.type === 'FAST_TRACK_SELL_BUSINESS' || command.type === 'FAST_TRACK_OPERATE' && command.mode === 'dividend') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'fast-track' || state.turnStage !== 'awaiting-roll' || actor.fastTrackStrategyUsed) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const business = (actor.fastTrackBusinesses ?? []).find((candidate) => candidate.id === command.businessId)
    if (!business) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const proceeds = fastTrackSaleProceeds(actor.fastTrackBusinesses ?? [], business)
    const businesses = (actor.fastTrackBusinesses ?? []).filter((candidate) => candidate.id !== business.id)
    const businessChanges = replaceFastTrackBusinesses(actor, businesses)
    const nextState = updatePlayer(state, actor.id, (player) => ({
      ...player,
      ...businessChanges,
      cash: player.cash + proceeds,
      fastTrackStrategyUsed: true,
    }))
    return { ok: true, state: finish(appendLog(
      nextState,
      actor.id,
      `出售“${business.name}”，回收 $${proceeds.toLocaleString('zh-CN')}，移除该企业及其现金流。`,
      'neutral',
    )) }
  }

  if (command.type === 'FAST_TRACK_MANAGE_RISK') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'fast-track' || state.turnStage !== 'awaiting-roll' || actor.fastTrackStrategyUsed || actor.insurance) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const cost = 25000
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const insurance = command.insurance ?? 'maintenance'
    const nextState = updatePlayer(state, actor.id, (player) => ({ ...player, cash: player.cash - cost, insurance, fastTrackStrategyUsed: true }))
    return { ok: true, state: finish(appendLog(nextState, actor.id, `投入 $25,000 管理经营风险，获得${insurance === 'maintenance' ? '维护' : '诉讼'}保险。`)) }
  }

  if (command.type === 'FAST_TRACK_PREPARE_DREAM') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'fast-track' || state.turnStage !== 'awaiting-roll' || actor.fastTrackStrategyUsed || (actor.dreamPreparation ?? 0) >= 3) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const cost = 50000
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const preparation = (actor.dreamPreparation ?? 0) + 1
    const nextState = updatePlayer(state, actor.id, (player) => ({ ...player, cash: player.cash - cost, dreamPreparation: preparation, fastTrackStrategyUsed: true }))
    const message = preparation === 3
      ? `梦想准备达到 3/3，支付 $50,000。尚未获胜；以后移动经过自己的梦想格时，可以支付梦想价格实现梦想。`
      : `推进梦想准备至 ${preparation}/3，支付 $50,000。`
    return { ok: true, state: finish(appendLog(nextState, actor.id, message, 'positive')) }
  }

  if (command.type === 'UPGRADE_ASSET') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'rat-race' || state.turnStage !== 'awaiting-roll' || actor.strategyActionUsed) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const asset = actor.assets.find((candidate) => candidate.id === command.assetId && !candidate.symbol && (candidate.level ?? 1) < 3)
    if (!asset) return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    const cost = assetUpgradeCost(state, actor, asset)
    const engineerSavings = actor.profession === '工程师' && asset.kind === 'business'
      ? assetUpgradeCost(state, { ...actor, profession: '' }, asset) - cost
      : 0
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    let nextState = updatePlayer(state, actor.id, (player) => {
      let upgraded = false
      const assets = player.assets.map((candidate) => {
        if (upgraded || candidate.id !== command.assetId || candidate.symbol || (candidate.level ?? 1) >= 3) return candidate
        upgraded = true
        return { ...normalizedAsset(candidate), level: ((candidate.level ?? 1) + 1) as 2 | 3 }
      })
      return {
        ...player,
        cash: player.cash - cost,
        strategyActionUsed: true,
        engineerUpgradeTriggers: (player.engineerUpgradeTriggers ?? 0) + (engineerSavings > 0 ? 1 : 0),
        engineerUpgradeSavings: (player.engineerUpgradeSavings ?? 0) + engineerSavings,
        ...recalculateAssets(player, assets),
      }
    })
    nextState = completeLongTermGoal(appendLog(nextState, actor.id, `升级 ${asset.name} 至 ${((asset.level ?? 1) + 1)} 级，支付 $${cost.toLocaleString('zh-CN')}。`, 'positive'), actor.id)
    nextState = checkFastTrack(nextState, actor.id)
    return { ok: true, state: finish(nextState) }
  }

  if (command.type === 'BUY_INSURANCE') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'rat-race' || state.turnStage !== 'awaiting-roll' || actor.strategyActionUsed || actor.insurance) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const cost = insuranceCost(actor, command.insurance)
    if (actor.cash < cost) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const nextState = updatePlayer(state, actor.id, (player) => ({ ...player, cash: player.cash - cost, insurance: command.insurance, strategyActionUsed: true }))
    return { ok: true, state: finish(appendLog(nextState, actor.id, `购买${command.insurance === 'job-loss' ? '失业' : command.insurance === 'maintenance' ? '维护' : '诉讼'}保险，支付 $${cost.toLocaleString('zh-CN')}。`)) }
  }

  if (command.type === 'FINANCIAL_REVIEW') {
    if (state.setup.strategyRulesVersion !== 'strategy-v1' || actor.phase !== 'rat-race' || state.turnStage !== 'awaiting-roll' || actor.strategyActionUsed || actor.bankLoan <= 0) {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    const payment = Math.min(actor.bankLoan, Math.floor(Math.max(0, actor.cash - 1000) / 1000) * 1000, 5000)
    if (payment <= 0) return { ok: false, state, error: 'INSUFFICIENT_CASH' }
    const reliefRate = 0.1 + (currentEconomicCycle(state).id === 'high-interest' ? 0.1 : 0) + (actor.profession === '会计师' ? 0.1 : 0)
    const relief = Math.min(actor.bankLoan - payment, Math.round(payment * reliefRate / 100) * 100)
    let nextState = updatePlayer(state, actor.id, (player) => ({ ...player, cash: player.cash - payment, bankLoan: player.bankLoan - payment - relief, strategyActionUsed: true }))
    nextState = completeLongTermGoal(nextState, actor.id)
    const message = relief > 0
      ? `财务整理偿还 $${payment.toLocaleString('zh-CN')}，额外减免 $${relief.toLocaleString('zh-CN')}。`
      : `财务整理偿还 $${payment.toLocaleString('zh-CN')}，贷款已结清，无剩余贷款可额外减免。`
    return { ok: true, state: finish(appendLog(nextState, actor.id, message, 'positive')) }
  }

  if (command.type === 'END_TURN') {
    if (state.pendingDecision || state.turnStage !== 'awaiting-end') {
      return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
    }
    let nextIndex = state.currentPlayerIndex
    let nextState = state
    let foundNextPlayer = false
    do {
      nextIndex = (nextIndex + 1) % state.players.length
      const candidate = nextState.players[nextIndex]
      if (candidate.skippedTurns > 0) {
        nextState = updatePlayer(nextState, candidate.id, (player) => ({
          ...player,
          skippedTurns: player.skippedTurns - 1,
        }))
        nextState = appendLog(nextState, candidate.id, '处于失业期，跳过本回合。', 'negative')
        continue
      }
      foundNextPlayer = !candidate.bankrupt
    } while (!foundNextPlayer)
    return {
      ok: true,
      state: finish({
        ...nextState,
        currentPlayerIndex: nextIndex,
        turn: nextIndex === 0 ? state.turn + 1 : state.turn,
        turnStage: 'awaiting-roll',
        players: nextState.players.map((player, index) => index === nextIndex
          ? { ...player, strategyActionUsed: false, fastTrackStrategyUsed: false }
          : player),
      }),
    }
  }

  return { ok: false, state, error: 'COMMAND_NOT_ALLOWED' }
}

export const executeCommand = (state: GameState, command: GameCommand): CommandResult => {
  const result = executeCommandInternal(state, command)
  if (!result.ok) return result
  return {
    ok: true,
    state: {
      ...result.state,
      commandHistory: [...(state.commandHistory ?? []), command],
    },
  }
}

export const replayGame = (game: GameState): GameState => {
  const setup = game.setup
  let replayed = createGame(
    setup.aiCount as 1 | 2 | 3,
    setup.seed,
    setup.dream,
    setup.profession,
    setup.aiDifficulty,
    setup.aiPersonalities,
    setup.marketPricingVersion ?? 'legacy-fixed',
    setup.fastTrackBalanceVersion ?? 'legacy',
    setup.ratRaceBalanceVersion ?? 'legacy',
    setup.strategyRulesVersion ?? 'legacy',
    setup.longTermGoal,
  )
  for (const command of game.commandHistory ?? []) {
    const result = executeCommandInternal(replayed, command)
    if (!result.ok) throw new Error(`Replay failed at ${command.type}: ${result.error}`)
    replayed = { ...result.state, commandHistory: [...replayed.commandHistory, command] }
  }
  return replayed
}

const hasFastTrackSynergy = (businesses: FastTrackBusiness[]) =>
  new Set(businesses.map((business) => business.sector).filter(Boolean)).size >= 2

export const fastTrackUpgradeCost = (business: FastTrackBusiness, branch: 'growth' | 'resilience') =>
  Math.round(business.cost * (branch === 'growth' ? FAST_TRACK_GROWTH_UPGRADE_COST_RATE : FAST_TRACK_RESILIENCE_UPGRADE_COST_RATE) / 1000) * 1000

export const fastTrackReinvestCost = (businesses: FastTrackBusiness[], business: FastTrackBusiness) => {
  const discount = hasFastTrackSynergy(businesses) ? FAST_TRACK_DIVERSIFIED_REINVEST_DISCOUNT : 0
  return Math.round(business.cost * FAST_TRACK_REINVEST_COST_RATE * (1 - discount) / 1000) * 1000
}

export const fastTrackSaleProceeds = (businesses: FastTrackBusiness[], business: FastTrackBusiness) =>
  Math.round(business.cost * (hasFastTrackSynergy(businesses) ? FAST_TRACK_DIVERSIFIED_SELL_RECOVERY_RATE : FAST_TRACK_SELL_RECOVERY_RATE) / 1000) * 1000