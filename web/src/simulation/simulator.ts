import { canTakeLoan, executeCommand, monthlyCashFlow, totalExpenses } from '../game-core/engine'
import { BIG_DEALS } from '../game-core/data'
import { evaluateOpportunity, getAiPolicy, shouldBuyFastTrackBusiness } from '../game-core/ai-policy'
import { choosePreRollStrategyCommand } from '../game-core/ai'
import type { AssetKind, DealSize, GameCommand, GameState, LongTermGoalId, PlayerState } from '../game-core/types'

type PurchaseCounts<Key extends string> = Record<Key, number>
export type FastTrackWinRoute = 'dream' | 'business-income' | 'expansion-income' | 'business-upgrade' | 'reinvestment-income'
export type FastTrackAction = 'sector-synergy' | 'growth-upgrade' | 'resilience-upgrade' | 'reinvest' | 'business-sale'

const emptyAssetCounts = (): PurchaseCounts<AssetKind> => ({
  'real-estate': 0,
  business: 0,
  stock: 0,
  fund: 0,
  cd: 0,
})

const emptyDealCounts = (): PurchaseCounts<DealSize> => ({ small: 0, big: 0 })
const minimumBigDealDownPayment = Math.min(...BIG_DEALS.map((deal) => deal.downPayment))

export type SimulationOptions = {
  games: number
  maxRounds: number
  baseSeed: number
  aiCount: 1 | 2 | 3
}

export type SimulatedGame = {
  seed: number
  rounds: number
  commands: number
  completed: boolean
  winnerProfession: string | null
  bankruptcies: number
  firstFastTrackRound: number | null
  fastTrackEntries: number
  winnerFastTrackRounds: number | null
  winnerRoute: FastTrackWinRoute | null
  fastTrackActions: Record<FastTrackAction, number>
  fastTrackPlayers: number
  ratRacePlayers: number
  assetPurchases: PurchaseCounts<AssetKind>
  dealPurchases: PurchaseCounts<DealSize>
  insurancePurchases: Record<string, number>
  insuranceClaims: Record<string, number>
  professionSkillTriggers: Record<string, number>
  professionSkillValue: Record<string, number>
  professionOutcomes: Array<{
    profession: string
    longTermGoal: LongTermGoalId
    longTermGoalCompleted: boolean
    won: boolean
    enteredFastTrack: boolean
    firstFastTrackRound: number | null
    bankrupt: boolean
  }>
}

export type ProfessionStats = {
  appearances: number
  wins: number
  winRate: number
  winRateLow95: number
  winRateHigh95: number
  fastTrackRate: number
  averageFirstFastTrackRound: number | null
  bankruptcyRate: number
}

export type SimulationReport = {
  options: SimulationOptions
  completedGames: number
  completionRate: number
  medianRounds: number | null
  p90Rounds: number | null
  medianFirstFastTrackRound: number | null
  p90FirstFastTrackRound: number | null
  gamesWithFastTrackEntryRate: number
  gamesWithBankruptcyRate: number
  averageBankruptcies: number
  medianWinnerFastTrackRounds: number | null
  p90WinnerFastTrackRounds: number | null
  oneRoundFastTrackWinRate: number
  winRoutes: Record<FastTrackWinRoute, { wins: number; medianFastTrackRounds: number | null; p90FastTrackRounds: number | null }>
  fastTrackActions: Record<FastTrackAction, number>
  averageCommands: number
  cutoffRatRacePlayers: number
  professionWins: Record<string, number>
  professionStats: Record<string, ProfessionStats>
  assetPurchases: PurchaseCounts<AssetKind>
  dealPurchases: PurchaseCounts<DealSize>
  insurancePurchases: Record<string, number>
  insuranceClaims: Record<string, number>
  professionSkillTriggers: Record<string, number>
  professionSkillValue: Record<string, number>
  games: SimulatedGame[]
}

const commandForDecision = (state: GameState): GameCommand | null => {
  const decision = state.pendingDecision
  if (!decision) return null
  const player = state.players.find((candidate) => candidate.id === decision.playerId)
  if (!player) throw new Error(`Pending decision references missing player ${decision.playerId}`)

  if (decision.type === 'deal-choice') {
    const reserve = getAiPolicy(state, player).reserve
    return {
      type: 'DRAW_DEAL',
      actorId: player.id,
      dealSize: player.cash - reserve >= minimumBigDealDownPayment ? 'big' : 'small',
    }
  }
  if (decision.type === 'opportunity') {
    const opportunity = decision.opportunity
    const evaluation = evaluateOpportunity(state, player, opportunity)
    const reserve = evaluation.reserve
    const shortfall = Math.max(0, opportunity.downPayment + reserve - player.cash)
    const loanAmount = Math.ceil(shortfall / 1000) * 1000
    const loanImprovesCashFlow = opportunity.cashFlow - loanAmount * 0.1 >= 100
    if (evaluation.attractive && loanImprovesCashFlow && loanAmount > 0 && loanAmount <= evaluation.maxLoan && !evaluation.isSecurity && canTakeLoan(player, loanAmount)) {
      return { type: 'TAKE_LOAN', actorId: player.id, amount: loanAmount }
    }
    const canBuy = evaluation.attractive && player.cash >= opportunity.downPayment
    return {
      type: canBuy ? 'BUY_OPPORTUNITY' : 'PASS_OPPORTUNITY',
      actorId: player.id,
    }
  }
  if (decision.type === 'charity') {
    return {
      type: 'CHOOSE_CHARITY',
      actorId: player.id,
      donate: player.cash - decision.donation >= getAiPolicy(state, player).charityReserve,
    }
  }
  if (decision.type === 'market') {
    const asset = player.assets.find((candidate) => candidate.id === decision.assetId)
    const costBasis = asset?.symbol
      ? (asset.costPerUnit ?? asset.downPayment) * (asset.quantity ?? 1)
      : asset?.downPayment ?? 0
    const netProceeds = decision.salePrice - (asset?.mortgage ?? 0)
    return {
      type: netProceeds >= costBasis || player.cash < getAiPolicy(state, player).distressCash
        ? 'SELL_MARKET_ASSET'
        : 'PASS_MARKET',
      actorId: player.id,
    }
  }
  if (decision.type === 'insolvency') {
    const amount = Math.ceil(Math.abs(player.cash) / 1000) * 1000
    const liquidationAsset = [...player.assets].sort((left, right) => right.downPayment - left.downPayment)[0]
    if (canTakeLoan(player, amount)) return { type: 'TAKE_LOAN', actorId: player.id, amount }
    return liquidationAsset
      ? { type: 'LIQUIDATE_ASSET', actorId: player.id, assetId: liquidationAsset.id }
      : { type: 'DECLARE_BANKRUPTCY', actorId: player.id }
  }
  if (decision.type === 'fast-track-business') {
    return {
      type:
        shouldBuyFastTrackBusiness(state, player, decision.business.cost, decision.business.cashFlow)
          ? 'BUY_FAST_TRACK_BUSINESS'
          : 'PASS_FAST_TRACK_BUSINESS',
      actorId: player.id,
    }
  }
  return {
    type: player.cash >= decision.cost ? 'BUY_DREAM' : 'PASS_DREAM',
    actorId: player.id,
  }
}

export const chooseAutoplayCommand = (state: GameState): GameCommand => {
  const decisionCommand = commandForDecision(state)
  if (decisionCommand) return decisionCommand

  const player = state.players[state.currentPlayerIndex]
  if (state.turnStage === 'awaiting-roll') {
    const strategyCommand = choosePreRollStrategyCommand(state)
    if (strategyCommand) return strategyCommand
    return {
      type: 'ROLL_DICE',
      actorId: player.id,
      diceCount: player.phase === 'fast-track' || player.charityTurns > 0 ? 2 : 1,
    }
  }
  const reserve = getAiPolicy(state, player).reserve
  const repayable = Math.min(
    player.bankLoan,
    Math.floor(Math.max(0, player.cash - reserve) / 100) * 100,
  )
  if (player.phase === 'rat-race' && repayable >= 100) {
    return { type: 'REPAY_LOAN', actorId: player.id, amount: repayable }
  }
  return { type: 'END_TURN', actorId: player.id }
}

const numericPlayerValues = (player: PlayerState) => [
  player.cash,
  player.salary,
  player.baseExpenses,
  player.passiveIncome,
  player.bankLoan,
  player.fastTrackIncome,
  player.fastTrackGoal,
  player.fastTrackTurns ?? 0,
  player.fastTrackExpansions ?? 0,
  totalExpenses(player),
  monthlyCashFlow(player),
]

export const assertGameInvariants = (state: GameState) => {
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) {
    throw new Error(`Invalid currentPlayerIndex ${state.currentPlayerIndex}`)
  }
  if (state.pendingDecision && !state.players.some((player) => player.id === state.pendingDecision?.playerId)) {
    throw new Error(`Pending responder ${state.pendingDecision.playerId} does not exist`)
  }
  if (state.players.some((player) => (player.fastTrackExpansions ?? 0) < 0 || (player.fastTrackExpansions ?? 0) > 3)) {
    throw new Error('Fast Track expansion count is out of range')
  }
  for (const player of state.players) {
    if (numericPlayerValues(player).some((value) => !Number.isFinite(value))) {
      throw new Error(`Non-finite financial value for ${player.id}`)
    }
    if (
      player.bankLoan < 0 ||
      player.babies < 0 ||
      player.babies > 3 ||
      player.passiveIncome < 0 ||
      (player.fastTrackTurns ?? 0) < 0
    ) {
      throw new Error(`Invalid financial state for ${player.id}`)
    }
    const assetIncome = player.assets.reduce((sum, asset) => sum + asset.cashFlow, 0)
    if (assetIncome !== player.passiveIncome) {
      throw new Error(`Passive income mismatch for ${player.id}: ${player.passiveIncome} !== ${assetIncome}`)
    }
    for (const asset of player.assets) {
      if ((asset.quantity !== undefined && (!Number.isFinite(asset.quantity) || asset.quantity <= 0)) ||
          (asset.costPerUnit !== undefined && (!Number.isFinite(asset.costPerUnit) || asset.costPerUnit < 0))) {
        throw new Error(`Invalid security holding for ${player.id}: ${asset.id}`)
      }
    }
  }
}

export const simulateGame = (
  createState: (seed: number) => GameState,
  seed: number,
  maxRounds: number,
): SimulatedGame => {
  let state = createState(seed)
  let commands = 0
  let firstFastTrackRound: number | null = null
  const fastTrackPlayerIds = new Set<string>()
  const firstFastTrackRoundByPlayer = new Map<string, number>()
  const assetPurchases = emptyAssetCounts()
  const dealPurchases = emptyDealCounts()
  const insurancePurchases: Record<string, number> = {}
  const insuranceClaims: Record<string, number> = {}
  let winnerRoute: FastTrackWinRoute | null = null
  const fastTrackActions: Record<FastTrackAction, number> = { 'sector-synergy': 0, 'growth-upgrade': 0, 'resilience-upgrade': 0, reinvest: 0, 'business-sale': 0 }
  const commandLimit = maxRounds * state.players.length * 8
  const assertWithContext = () => {
    try {
      assertGameInvariants(state)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Seed ${seed}, revision ${state.revision}: ${message}`)
    }
  }

  while (!state.winnerId && state.turn <= maxRounds && commands < commandLimit) {
    assertWithContext()
    const beforeRevision = state.revision
    const command = chooseAutoplayCommand(state)
    if (command.type === 'BUY_OPPORTUNITY' && state.pendingDecision?.type === 'opportunity') {
      const opportunity = state.pendingDecision.opportunity
      assetPurchases[opportunity.kind ?? 'real-estate'] += 1
      dealPurchases[opportunity.dealSize ?? 'small'] += 1
    }
    if (command.type === 'BUY_INSURANCE') {
      const profession = state.players.find((player) => player.id === command.actorId)?.profession ?? '未知'
      insurancePurchases[profession] = (insurancePurchases[profession] ?? 0) + 1
    }
    if (command.type === 'FAST_TRACK_UPGRADE_BUSINESS') {
      const key = command.branch === 'growth' ? 'growth-upgrade' : 'resilience-upgrade'
      fastTrackActions[key] += 1
    }
    if (command.type === 'FAST_TRACK_REINVEST') fastTrackActions.reinvest += 1
    if (command.type === 'FAST_TRACK_SELL_BUSINESS') fastTrackActions['business-sale'] += 1
    if (command.type === 'BUY_FAST_TRACK_BUSINESS' && state.pendingDecision?.type === 'fast-track-business') {
      const player = state.players.find((candidate) => candidate.id === command.actorId)!
      const sectors = new Set((player.fastTrackBusinesses ?? []).map((business) => business.sector).filter(Boolean))
      const offeredSector = state.pendingDecision.business.sector
      if (sectors.size === 1 && offeredSector && !sectors.has(offeredSector)) fastTrackActions['sector-synergy'] += 1
    }
    const insuranceBefore = new Map(state.players.map((player) => [player.id, player.insurance]))
    const result = executeCommand(state, command)
    if (!result.ok) {
      throw new Error(`Seed ${seed}, revision ${state.revision}: ${command.type} failed with ${result.error}`)
    }
    state = result.state
    if (state.winnerId && !winnerRoute) {
      winnerRoute = command.type === 'BUY_DREAM'
        ? 'dream'
        : command.type === 'BUY_FAST_TRACK_BUSINESS'
          ? 'business-income'
          : command.type === 'FAST_TRACK_EXPAND'
            ? 'expansion-income'
            : command.type === 'FAST_TRACK_UPGRADE_BUSINESS'
              ? 'business-upgrade'
              : command.type === 'FAST_TRACK_REINVEST'
                ? 'reinvestment-income'
                : null
    }
    for (const player of state.players) {
      const claimedInsurance = insuranceBefore.get(player.id)
      if (!claimedInsurance || player.insurance) continue
      const key = `${player.profession}:${claimedInsurance}`
      insuranceClaims[key] = (insuranceClaims[key] ?? 0) + 1
    }
    for (const player of state.players) {
      if (player.phase !== 'fast-track') continue
      fastTrackPlayerIds.add(player.id)
      if (!firstFastTrackRoundByPlayer.has(player.id)) firstFastTrackRoundByPlayer.set(player.id, state.turn)
      firstFastTrackRound ??= state.turn
    }
    commands += 1
    if (state.revision <= beforeRevision) throw new Error(`Revision did not advance for ${command.type}`)
  }

  assertWithContext()
  const winner = state.players.find((player) => player.id === state.winnerId)
  const professionSkillTriggers: Record<string, number> = {}
  const professionSkillValue: Record<string, number> = {}
  for (const player of state.players) {
    if (player.profession === '护士') {
      professionSkillTriggers.护士 = (professionSkillTriggers.护士 ?? 0)
        + (player.nurseDoodadTriggers ?? 0)
        + (player.nurseBabyTriggers ?? 0)
      professionSkillTriggers['护士:牙科'] = (professionSkillTriggers['护士:牙科'] ?? 0)
        + (player.nurseDoodadTriggers ?? 0)
      professionSkillTriggers['护士:添丁'] = (professionSkillTriggers['护士:添丁'] ?? 0)
        + (player.nurseBabyTriggers ?? 0)
      professionSkillValue.护士 = (professionSkillValue.护士 ?? 0) + (player.nurseDoodadSavings ?? 0)
    }
    if (player.profession === '律师') {
      professionSkillTriggers.律师 = (professionSkillTriggers.律师 ?? 0) + (player.lawyerMarketTriggers ?? 0)
      professionSkillValue.律师 = (professionSkillValue.律师 ?? 0) + (player.lawyerMarketBonus ?? 0)
    }
    if (player.profession === '工程师') {
      professionSkillTriggers.工程师 = (professionSkillTriggers.工程师 ?? 0) + (player.engineerUpgradeTriggers ?? 0)
      professionSkillValue.工程师 = (professionSkillValue.工程师 ?? 0) + (player.engineerUpgradeSavings ?? 0)
    }
  }
  return {
    seed,
    rounds: state.turn,
    commands,
    completed: Boolean(state.winnerId),
    winnerProfession: winner?.profession ?? null,
    bankruptcies: state.players.filter((player) => player.bankrupt).length,
    firstFastTrackRound,
    fastTrackEntries: fastTrackPlayerIds.size,
    winnerFastTrackRounds: winner?.phase === 'finished' ? (winner.fastTrackTurns ?? 0) : null,
    winnerRoute,
    fastTrackActions,
    fastTrackPlayers: state.players.filter((player) => player.phase === 'fast-track' || (!player.bankrupt && player.phase === 'finished')).length,
    ratRacePlayers: state.players.filter((player) => player.phase === 'rat-race').length,
    assetPurchases,
    dealPurchases,
    insurancePurchases,
    insuranceClaims,
    professionSkillTriggers,
    professionSkillValue,
    professionOutcomes: state.players.map((player) => ({
      profession: player.profession,
      longTermGoal: player.longTermGoal ?? 'diversified',
      longTermGoalCompleted: player.longTermGoalCompleted ?? false,
      won: player.id === state.winnerId,
      enteredFastTrack: fastTrackPlayerIds.has(player.id),
      firstFastTrackRound: firstFastTrackRoundByPlayer.get(player.id) ?? null,
      bankrupt: player.bankrupt,
    })),
  }
}

const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

const wilsonInterval = (successes: number, total: number): [number, number] => {
  if (total === 0) return [0, 0]
  const z = 1.96
  const rate = successes / total
  const denominator = 1 + z * z / total
  const center = (rate + z * z / (2 * total)) / denominator
  const margin = z * Math.sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator
  return [Math.max(0, center - margin), Math.min(1, center + margin)]
}

export const aggregateSimulations = (
  options: SimulationOptions,
  createState: (seed: number) => GameState,
): SimulationReport => {
  const games = Array.from({ length: options.games }, (_, index) =>
    simulateGame(createState, (options.baseSeed + index) >>> 0, options.maxRounds),
  )
  const completed = games.filter((game) => game.completed)
  const gamesWithFastTrackEntry = games.filter((game) => game.firstFastTrackRound !== null)
  const fastTrackWins = games.filter((game) => game.winnerFastTrackRounds !== null)
  const professionWins: Record<string, number> = {}
  const professionStats: Record<string, ProfessionStats> = {}
  const assetPurchases = emptyAssetCounts()
  const dealPurchases = emptyDealCounts()
  const insurancePurchases: Record<string, number> = {}
  const insuranceClaims: Record<string, number> = {}
  const professionSkillTriggers: Record<string, number> = {}
  const professionSkillValue: Record<string, number> = {}
  const fastTrackActions: Record<FastTrackAction, number> = { 'sector-synergy': 0, 'growth-upgrade': 0, 'resilience-upgrade': 0, reinvest: 0, 'business-sale': 0 }
  const winRoutes = Object.fromEntries(
    (['dream', 'business-income', 'expansion-income', 'business-upgrade', 'reinvestment-income'] as FastTrackWinRoute[]).map((route) => {
      const routeGames = completed.filter((game) => game.winnerRoute === route)
      const rounds = routeGames.flatMap((game) => game.winnerFastTrackRounds === null ? [] : [game.winnerFastTrackRounds])
      return [route, {
        wins: routeGames.length,
        medianFastTrackRounds: percentile(rounds, 0.5),
        p90FastTrackRounds: percentile(rounds, 0.9),
      }]
    }),
  ) as SimulationReport['winRoutes']
  for (const game of completed) {
    if (game.winnerProfession) {
      professionWins[game.winnerProfession] = (professionWins[game.winnerProfession] ?? 0) + 1
    }
  }
  for (const game of games) {
    for (const action of Object.keys(fastTrackActions) as FastTrackAction[]) fastTrackActions[action] += game.fastTrackActions[action]
    for (const kind of Object.keys(assetPurchases) as AssetKind[]) assetPurchases[kind] += game.assetPurchases[kind]
    for (const size of Object.keys(dealPurchases) as DealSize[]) dealPurchases[size] += game.dealPurchases[size]
    for (const [profession, count] of Object.entries(game.insurancePurchases)) {
      insurancePurchases[profession] = (insurancePurchases[profession] ?? 0) + count
    }
    for (const [key, count] of Object.entries(game.insuranceClaims)) {
      insuranceClaims[key] = (insuranceClaims[key] ?? 0) + count
    }
    for (const [profession, count] of Object.entries(game.professionSkillTriggers)) {
      professionSkillTriggers[profession] = (professionSkillTriggers[profession] ?? 0) + count
    }
    for (const [profession, value] of Object.entries(game.professionSkillValue)) {
      professionSkillValue[profession] = (professionSkillValue[profession] ?? 0) + value
    }
  }
  const professionOutcomes = games.flatMap((game) => game.professionOutcomes)
  for (const profession of new Set(professionOutcomes.map((outcome) => outcome.profession))) {
    const outcomes = professionOutcomes.filter((outcome) => outcome.profession === profession)
    const wins = outcomes.filter((outcome) => outcome.won).length
    const fastTrackEntries = outcomes.filter((outcome) => outcome.enteredFastTrack)
    const [winRateLow95, winRateHigh95] = wilsonInterval(wins, outcomes.length)
    professionStats[profession] = {
      appearances: outcomes.length,
      wins,
      winRate: wins / outcomes.length,
      winRateLow95,
      winRateHigh95,
      fastTrackRate: fastTrackEntries.length / outcomes.length,
      averageFirstFastTrackRound: fastTrackEntries.length === 0
        ? null
        : fastTrackEntries.reduce((sum, outcome) => sum + outcome.firstFastTrackRound!, 0) / fastTrackEntries.length,
      bankruptcyRate: outcomes.filter((outcome) => outcome.bankrupt).length / outcomes.length,
    }
  }

  return {
    options,
    completedGames: completed.length,
    completionRate: games.length === 0 ? 0 : completed.length / games.length,
    medianRounds: percentile(completed.map((game) => game.rounds), 0.5),
    p90Rounds: percentile(completed.map((game) => game.rounds), 0.9),
    medianFirstFastTrackRound: percentile(gamesWithFastTrackEntry.map((game) => game.firstFastTrackRound!), 0.5),
    p90FirstFastTrackRound: percentile(gamesWithFastTrackEntry.map((game) => game.firstFastTrackRound!), 0.9),
    gamesWithFastTrackEntryRate: games.length === 0 ? 0 : gamesWithFastTrackEntry.length / games.length,
    gamesWithBankruptcyRate:
      games.length === 0 ? 0 : games.filter((game) => game.bankruptcies > 0).length / games.length,
    averageBankruptcies:
      games.length === 0 ? 0 : games.reduce((sum, game) => sum + game.bankruptcies, 0) / games.length,
    medianWinnerFastTrackRounds: percentile(fastTrackWins.map((game) => game.winnerFastTrackRounds!), 0.5),
    p90WinnerFastTrackRounds: percentile(fastTrackWins.map((game) => game.winnerFastTrackRounds!), 0.9),
    oneRoundFastTrackWinRate:
      fastTrackWins.length === 0
        ? 0
        : fastTrackWins.filter((game) => game.winnerFastTrackRounds! <= 1).length / fastTrackWins.length,
      winRoutes,
      fastTrackActions,
    averageCommands:
      games.length === 0 ? 0 : games.reduce((sum, game) => sum + game.commands, 0) / games.length,
    cutoffRatRacePlayers: games
      .filter((game) => !game.completed)
      .reduce((sum, game) => sum + game.ratRacePlayers, 0),
    professionWins,
    professionStats,
    assetPurchases,
    dealPurchases,
    insurancePurchases,
    insuranceClaims,
    professionSkillTriggers,
    professionSkillValue,
    games,
  }
}