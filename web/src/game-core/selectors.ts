import { fastTrackGoalGain, fastTrackStartingIncome, freedomProgress, totalExpenses } from './engine'
import type { Asset, PlayerState } from './types'
import { renderText, type LocalText } from '../i18n/format'

export type FinalScoreDimension = {
  id: 'progress' | 'cashflow' | 'portfolio' | 'resilience' | 'achievement'
  label: string
  score: number
  maximum: number
}

export type FinalPlayerScore = {
  total: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
  dimensions: FinalScoreDimension[]
}

const boundedScore = (value: number, maximum: number) =>
  Math.max(0, Math.min(maximum, Math.round(value)))

export type GroupedAsset = Asset & {
  count: number
  totalCashFlow: number
  totalMortgage: number
}

export const groupAssets = (assets: Asset[]): GroupedAsset[] => {
  const grouped = new Map<string, GroupedAsset>()

  for (const asset of assets) {
    const groupKey = `${asset.sourceId ?? asset.id}:${asset.level ?? 1}`
    const existing = grouped.get(groupKey)
    if (existing) {
      existing.count += asset.quantity ?? 1
      existing.totalCashFlow += asset.cashFlow
      existing.totalMortgage += asset.mortgage
      continue
    }

    grouped.set(groupKey, {
      ...asset,
      count: asset.quantity ?? 1,
      totalCashFlow: asset.cashFlow,
      totalMortgage: asset.mortgage,
    })
  }

  return [...grouped.values()]
}

export const playerStatusText = (player: PlayerState): LocalText => {
  if (player.bankrupt) return { key: '破产' }
  if (player.skippedTurns > 0) return { key: '失业中 · 剩余 {turns} 回合', params: { turns: player.skippedTurns } }
  if (player.charityTurns > 0) return { key: '慈善双骰 · 剩余 {turns} 回合', params: { turns: player.charityTurns } }
  return { key: '正常' }
}

export const playerStatus = (player: PlayerState) => renderText(playerStatusText(player), 'zh', {}, {})

export const playerProgress = (player: PlayerState) => {
  if (player.phase === 'finished') return 100
  if (player.phase === 'rat-race') return freedomProgress(player)
  const startingIncome = fastTrackStartingIncome(player)
  return Math.max(
    0,
    Math.min(100, Math.round(((player.fastTrackIncome - startingIncome) / fastTrackGoalGain(player)) * 100)),
  )
}

export const finalPlayerScore = (player: PlayerState, winnerId: string | null): FinalPlayerScore => {
  const expenses = Math.max(1, totalExpenses(player))
  const isFastTrack = player.phase === 'fast-track' || (player.phase === 'finished' && player.fastTrackIncome > 0)
  const progress = player.bankrupt
    ? 0
    : player.id === winnerId
      ? 30
      : isFastTrack
        ? 20 + playerProgress(player) * 0.1
        : playerProgress(player) * 0.2

  const cashflow = isFastTrack
    ? player.fastTrackIncome / Math.max(1, player.fastTrackGoal) * 20
    : player.passiveIncome / expenses * 20

  const assetKinds = new Set(player.assets.map((asset) => asset.kind).filter(Boolean)).size
  const upgradedAssets = player.assets.filter((asset) => (asset.level ?? 1) > 1).length
  const businesses = player.fastTrackBusinesses ?? []
  const businessSectors = new Set(businesses.map((business) => business.sector).filter(Boolean)).size
  const businessImprovements = businesses.reduce(
    (sum, business) => sum + (business.upgrade ? 1 : 0) + (business.reinvestments ?? 0),
    0,
  )
  const portfolio = isFastTrack
    ? Math.min(8, businesses.length * 4) + Math.min(8, businessSectors * 4) + Math.min(4, businessImprovements * 2)
    : Math.min(8, player.assets.length * 2) + Math.min(8, assetKinds * 2) + Math.min(4, upgradedAssets * 2)

  const reserveBase = isFastTrack ? Math.max(50000, player.fastTrackIncome) : expenses
  const resilience = Math.min(10, Math.max(0, player.cash) / reserveBase * 5) + (player.bankLoan === 0 ? 5 : 0)
  const achievement = (player.id === winnerId ? 8 : 0) + (player.longTermGoalCompleted ? 4 : 0) + Math.min(3, player.dreamPreparation ?? 0)

  const dimensions: FinalScoreDimension[] = [
    { id: 'progress', label: '阶段进展', score: boundedScore(progress, 30), maximum: 30 },
    { id: 'cashflow', label: '现金流质量', score: boundedScore(cashflow, 20), maximum: 20 },
    { id: 'portfolio', label: '资产经营', score: boundedScore(portfolio, 20), maximum: 20 },
    { id: 'resilience', label: '财务韧性', score: boundedScore(resilience, 15), maximum: 15 },
    { id: 'achievement', label: '目标成就', score: boundedScore(achievement, 15), maximum: 15 },
  ]
  const total = dimensions.reduce((sum, dimension) => sum + dimension.score, 0)
  const grade = total >= 90 ? 'S' : total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D'

  return { total, grade, dimensions }
}