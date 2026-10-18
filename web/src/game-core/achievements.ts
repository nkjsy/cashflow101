import { replayGame } from './engine'
import type { Asset, AssetKind, GameState } from './types'

export const ACHIEVEMENT_IDS = [
  'first-win',
  'quick-exit',
  'clean-exit',
  'landlord',
  'all-rounder',
  'stock-trader',
  'big-sale',
  'cash-only',
  'dreamer',
  'tycoon',
  'philanthropist',
  'comeback',
  'expert-slayer',
  'daily-streak',
] as const

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number]

export const QUICK_EXIT_ROUNDS = { quick: 6, standard: 16 } as const
export const STOCK_TRADER_PROFIT = 1500
export const BIG_SALE_PROFIT = 50000
export const LANDLORD_PROPERTIES = 4

const ALL_ASSET_KINDS: AssetKind[] = ['real-estate', 'business', 'stock', 'fund', 'cd']

const costBasis = (asset: Asset) =>
  asset.symbol ? (asset.costPerUnit ?? asset.downPayment) * (asset.quantity ?? 1) : asset.downPayment

// Everything the human player achieved in one game. Replays the command history so
// achievements reflect the whole game, not just where it ended.
export const evaluateAchievements = (game: GameState, context: { dailyStreak?: number } = {}): AchievementId[] => {
  const human = game.players[0]
  const won = game.winnerId === human.id
  const stats = {
    maxRealEstate: 0,
    heldAllKinds: false,
    securitiesProfit: 0,
    maxSaleProfit: 0,
    charityCount: 0,
    hadCashCrunch: false,
    usedCredit: false,
    exitRound: null as number | null,
    exitDebtFree: false,
    maxBusinesses: 0,
    wonByDream: false,
  }

  try {
    if (game.commandHistory?.length) {
      replayGame(game, (before, command, after) => {
        const playerBefore = before.players[0]
        const player = after.players[0]
        stats.maxRealEstate = Math.max(stats.maxRealEstate, player.assets.filter((asset) => asset.kind === 'real-estate').length)
        const kinds = new Set(player.assets.map((asset) => asset.kind ?? 'real-estate'))
        stats.heldAllKinds ||= ALL_ASSET_KINDS.every((kind) => kinds.has(kind))
        stats.maxBusinesses = Math.max(stats.maxBusinesses, player.fastTrackBusinesses?.length ?? 0)
        stats.hadCashCrunch ||= after.pendingDecision?.type === 'insolvency' && after.pendingDecision.playerId === human.id
        if (stats.exitRound === null && playerBefore.phase === 'rat-race' && player.phase === 'fast-track') {
          stats.exitRound = before.turn
          stats.exitDebtFree = player.bankLoan === 0 && (player.creditCardDebt ?? 0) === 0
        }
        if (command.actorId !== human.id) return

        const decision = before.pendingDecision
        const soldAssetId = command.type === 'SELL_SECURITY'
          ? command.assetId
          : command.type === 'SELL_MARKET_ASSET' && decision?.type === 'market' ? decision.assetId : undefined
        const soldAsset = soldAssetId ? playerBefore.assets.find((asset) => asset.id === soldAssetId) : undefined
        if (soldAsset) {
          const profit = player.cash - playerBefore.cash - costBasis(soldAsset)
          stats.maxSaleProfit = Math.max(stats.maxSaleProfit, profit)
          if (command.type === 'SELL_SECURITY') stats.securitiesProfit += profit
        }
        if (command.type === 'CHOOSE_CHARITY' && command.donate) stats.charityCount += 1
        if (command.type === 'PAY_DOODAD' && command.method === 'credit') stats.usedCredit = true
        if (command.type === 'BUY_DREAM' && after.winnerId === human.id) stats.wonByDream = true
      })
    }
  } catch {
    // An unreplayable save still earns the achievements its final state proves.
  }

  const pace = game.setup.pace ?? 'standard'
  const earned: Record<AchievementId, boolean> = {
    'first-win': won,
    'quick-exit': stats.exitRound !== null && stats.exitRound <= QUICK_EXIT_ROUNDS[pace],
    'clean-exit': stats.exitRound !== null && stats.exitDebtFree,
    landlord: stats.maxRealEstate >= LANDLORD_PROPERTIES,
    'all-rounder': stats.heldAllKinds,
    'stock-trader': stats.securitiesProfit >= STOCK_TRADER_PROFIT,
    'big-sale': stats.maxSaleProfit >= BIG_SALE_PROFIT,
    'cash-only': won && game.setup.economyRulesVersion === 'living-v1' && !stats.usedCredit,
    dreamer: stats.wonByDream,
    tycoon: stats.maxBusinesses >= 3,
    philanthropist: stats.charityCount >= 3,
    comeback: won && stats.hadCashCrunch,
    'expert-slayer': won && game.setup.aiDifficulty === 'expert' && game.setup.aiCount === 3,
    'daily-streak': (context.dailyStreak ?? 0) >= 3,
  }
  return ACHIEVEMENT_IDS.filter((id) => earned[id])
}
