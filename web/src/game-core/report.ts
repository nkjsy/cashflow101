import { BOARD } from './data'
import { replayGame, totalExpenses } from './engine'
import type { Asset, GameState, PlayerState } from './types'

export type ReportPoint = {
  round: number
  cash: number
  passiveIncome: number
  expenses: number
}

export type ReportHighlight =
  | { kind: 'first-asset'; round: number; asset: string; cashFlow: number }
  | { kind: 'best-deal'; round: number; asset: string; downPayment: number; cashFlow: number; annualReturn: number }
  | { kind: 'missed-deal'; round: number; asset: string; annualReturn: number }
  | { kind: 'best-sale'; round: number; asset: string; profit: number }
  | { kind: 'biggest-hit'; round: number; amount: number }
  | { kind: 'credit'; round: number; count: number; amount: number }
  | { kind: 'fast-track'; round: number }

export type GameReport = {
  points: ReportPoint[]
  fastTrackRound: number | null
  highlights: ReportHighlight[]
}

const annualReturn = (deal: Pick<Asset, 'downPayment' | 'cashFlow'>) =>
  deal.downPayment > 0 ? Math.round(deal.cashFlow * 12 / deal.downPayment * 100) : 0

const costBasis = (asset: Asset) =>
  asset.symbol ? (asset.costPerUnit ?? asset.downPayment) * (asset.quantity ?? 1) : asset.downPayment

const pointOf = (round: number, player: PlayerState): ReportPoint => ({
  round,
  cash: player.cash,
  passiveIncome: player.passiveIncome,
  expenses: totalExpenses(player),
})

// Rebuilds the game from its command history to chart one player's finances round by round
// and pick out the decisions worth talking about. Returns null when the save cannot be replayed.
export const buildGameReport = (game: GameState, playerId = game.players[0]?.id): GameReport | null => {
  if (!playerId || !game.commandHistory?.length) return null
  const find = (state: GameState) => state.players.find((player) => player.id === playerId)!
  const points: ReportPoint[] = []
  const found: {
    fastTrackRound?: number
    firstAsset?: Extract<ReportHighlight, { kind: 'first-asset' }>
    bestDeal?: Extract<ReportHighlight, { kind: 'best-deal' }>
    missedDeal?: Extract<ReportHighlight, { kind: 'missed-deal' }>
    bestSale?: Extract<ReportHighlight, { kind: 'best-sale' }>
    biggestHit?: Extract<ReportHighlight, { kind: 'biggest-hit' }>
    credit?: Extract<ReportHighlight, { kind: 'credit' }>
  } = {}

  try {
    replayGame(game, (before, command, after) => {
      if (points.length === 0) points.push(pointOf(before.turn, find(before)))
      if (after.turn !== before.turn) points.push(pointOf(after.turn, find(after)))
      const round = before.turn
      const playerBefore = find(before)
      const playerAfter = find(after)
      if (found.fastTrackRound === undefined && playerBefore.phase === 'rat-race' && playerAfter.phase === 'fast-track') found.fastTrackRound = round
      if (command.actorId !== playerId) return

      const decision = before.pendingDecision
      const bought = command.type === 'BUY_OPPORTUNITY' && decision?.type === 'opportunity'
        ? decision.opportunity
        : command.type === 'ACCEPT_DEAL_OFFER' && decision?.type === 'deal-offer' ? decision.opportunity : undefined
      if (bought) {
        const deal = bought
        found.firstAsset ??= { kind: 'first-asset', round, asset: deal.name, cashFlow: deal.cashFlow }
        const dealReturn = annualReturn(deal)
        if (deal.cashFlow > 0 && dealReturn > (found.bestDeal?.annualReturn ?? -1)) {
          found.bestDeal = { kind: 'best-deal', round, asset: deal.name, downPayment: deal.downPayment, cashFlow: deal.cashFlow, annualReturn: dealReturn }
        }
      }
      if (command.type === 'PASS_OPPORTUNITY' && decision?.type === 'opportunity') {
        const deal = decision.opportunity
        const dealReturn = annualReturn(deal)
        if (deal.cashFlow > 0 && playerBefore.cash >= deal.downPayment && dealReturn > (found.missedDeal?.annualReturn ?? -1)) {
          found.missedDeal = { kind: 'missed-deal', round, asset: deal.name, annualReturn: dealReturn }
        }
      }
      const soldAssetId = command.type === 'SELL_SECURITY'
        ? command.assetId
        : command.type === 'SELL_MARKET_ASSET' && decision?.type === 'market' ? decision.assetId : undefined
      const soldAsset = soldAssetId ? playerBefore.assets.find((asset) => asset.id === soldAssetId) : undefined
      if (soldAsset) {
        const profit = playerAfter.cash - playerBefore.cash - costBasis(soldAsset)
        if (profit > (found.bestSale?.profit ?? 0)) found.bestSale = { kind: 'best-sale', round, asset: soldAsset.name, profit }
      }
      // Forced costs: a cash-paid Splurge, or a legacy Splurge / layoff settled while rolling.
      const forcedCost = command.type === 'PAY_DOODAD' && command.method === 'cash' && decision?.type === 'doodad'
        ? decision.cost
        : command.type === 'ROLL_DICE' && playerAfter.phase === 'rat-race' && ['doodad', 'downsized'].includes(BOARD[playerAfter.position])
          ? Math.max(0, playerBefore.cash - playerAfter.cash)
          : 0
      if (forcedCost > (found.biggestHit?.amount ?? 0)) found.biggestHit = { kind: 'biggest-hit', round, amount: forcedCost }
      if (command.type === 'PAY_DOODAD' && command.method === 'credit' && decision?.type === 'doodad') {
        found.credit = { kind: 'credit', round: found.credit?.round ?? round, count: (found.credit?.count ?? 0) + 1, amount: (found.credit?.amount ?? 0) + decision.cost }
      }
    })
  } catch {
    return null
  }

  const finalPoint = pointOf(game.turn, find(game))
  if (points.at(-1)?.round === finalPoint.round) points[points.length - 1] = finalPoint
  else points.push(finalPoint)

  const { firstAsset, bestDeal, missedDeal, fastTrackRound } = found
  const highlights: Array<ReportHighlight | undefined> = [
    // The first purchase is often also the best deal; keep one line for it.
    firstAsset && !(bestDeal && bestDeal.round === firstAsset.round && bestDeal.asset === firstAsset.asset) ? firstAsset : undefined,
    bestDeal,
    found.bestSale,
    found.biggestHit,
    found.credit,
    fastTrackRound !== undefined ? { kind: 'fast-track', round: fastTrackRound } : undefined,
    // Only worth mentioning when the pass beat everything actually bought.
    missedDeal && missedDeal.annualReturn > (bestDeal?.annualReturn ?? 0) ? missedDeal : undefined,
  ]
  return {
    points,
    fastTrackRound: fastTrackRound ?? null,
    highlights: highlights.filter((highlight) => highlight !== undefined).sort((left, right) => left.round - right.round),
  }
}
