import { FAST_TRACK_DREAM_COSTS, fastTrackDreamCost } from './data'
import { totalExpenses } from './engine'
import type { GameState, Opportunity, PlayerState } from './types'

const personalitySettings = {
  conservative: { reserveMonths: 1.25, operatingReturn: 0.1, maxLoan: 1000, distressRatio: 0.1 },
  balanced: { reserveMonths: 0.5, operatingReturn: 0.08, maxLoan: 2000, distressRatio: 0.25 },
  aggressive: { reserveMonths: 0.35, operatingReturn: 0.06, maxLoan: 4000, distressRatio: 0.5 },
} as const

export const aiPersonalityLabels = {
  conservative: '保守型',
  balanced: '均衡型',
  aggressive: '进取型',
} as const

export const getAiPolicy = (state: GameState, player: PlayerState) => {
  const personality = player.aiPersonality ?? 'balanced'
  const difficulty = state.setup.aiDifficulty ?? 'standard'
  const settings = personalitySettings[personality]
  const opponentPressure = difficulty === 'expert' && state.players.some((candidate) =>
    candidate.id !== player.id && !candidate.bankrupt && candidate.phase === 'fast-track',
  )
  const difficultyReturnAdjustment = difficulty === 'cautious' ? 0.02 : opponentPressure ? -0.015 : 0
  const reserveMonths = Math.max(0.25, settings.reserveMonths + (difficulty === 'cautious' ? 0.25 : opponentPressure ? -0.2 : 0))

  return {
    personality,
    difficulty,
    opponentPressure,
    reserve: Math.max(1000, totalExpenses(player) * reserveMonths),
    operatingReturn: settings.operatingReturn + difficultyReturnAdjustment,
    maxLoan: difficulty === 'cautious' ? Math.min(1000, settings.maxLoan) : settings.maxLoan + (opponentPressure ? 1000 : 0),
    distressCash: totalExpenses(player) * settings.distressRatio,
    charityReserve: Math.max(1000, totalExpenses(player) * reserveMonths),
    dreamCost: state.setup.fastTrackBalanceVersion === 'accelerated'
      ? fastTrackDreamCost(player.dream, player.fastTrackGoal - 50000)
      : state.setup.fastTrackBalanceVersion === 'income-scaled'
        ? fastTrackDreamCost(player.dream, player.fastTrackGoal - 50000, 24)
        : FAST_TRACK_DREAM_COSTS[player.dream] ?? 250000,
  }
}

export const evaluateOpportunity = (state: GameState, player: PlayerState, opportunity: Opportunity) => {
  const policy = getAiPolicy(state, player)
  const monthlyReturn = opportunity.downPayment > 0 ? opportunity.cashFlow / opportunity.downPayment : 0
  const cashAfterPurchase = player.cash - opportunity.downPayment
  const attractiveStock =
    opportunity.kind === 'stock' &&
    (opportunity.costPerUnit ?? Infinity) <= (policy.personality === 'aggressive' ? 25 : 20) &&
    cashAfterPurchase >= totalExpenses(player) * (policy.personality === 'aggressive' ? 1 : 2)
  const stableIncomeSecurity =
    (opportunity.kind === 'fund' && monthlyReturn >= 0.02 || opportunity.kind === 'cd' && monthlyReturn >= 0.025) &&
    cashAfterPurchase >= totalExpenses(player)
  const isSecurity = opportunity.kind === 'stock' || opportunity.kind === 'fund' || opportunity.kind === 'cd'

  return {
    ...policy,
    isSecurity,
    attractive: monthlyReturn >= policy.operatingReturn || attractiveStock || stableIncomeSecurity,
  }
}

export const shouldBuyFastTrackBusiness = (state: GameState, player: PlayerState, cost: number, cashFlow: number) => {
  if (player.cash < cost) return false
  const policy = getAiPolicy(state, player)
  const reachesIncomeGoal = player.fastTrackIncome + cashFlow >= player.fastTrackGoal
  const canPreserveDream = player.cash - cost >= policy.dreamCost
  if (policy.difficulty === 'expert' && player.cash >= policy.dreamCost) return reachesIncomeGoal || canPreserveDream
  if (policy.personality === 'conservative') return reachesIncomeGoal || player.cash - cost >= policy.dreamCost * 0.5
  return true
}
