import type { LocalText } from '../i18n/format'

export type DisplayMode = 'guided' | 'standard'
export type AiDifficulty = 'cautious' | 'standard' | 'expert'
export type AiPersonality = 'conservative' | 'balanced' | 'aggressive'
export type MarketPricingVersion = 'legacy-fixed' | 'scaled-equity'
export type FastTrackBalanceVersion = 'legacy' | 'income-scaled' | 'accelerated'
export type RatRaceBalanceVersion = 'legacy' | 'global-v2'
export type StrategyRulesVersion = 'legacy' | 'strategy-v1'
export type GamePace = 'standard' | 'quick'
export type EconomicCycleId = 'steady-growth' | 'property-boom' | 'high-interest'
export type LongTermGoalId = 'diversified' | 'master-asset' | 'debt-free'
export type InsuranceKind = 'job-loss' | 'maintenance' | 'lawsuit'

export type Phase = 'rat-race' | 'fast-track' | 'finished'

export type SpaceType =
  | 'opportunity'
  | 'payday'
  | 'market'
  | 'doodad'
  | 'charity'
  | 'baby'
  | 'downsized'

export type FastTrackSpaceType = 'cashflow-day' | 'business' | 'dream' | 'risk'

export type DealSize = 'small' | 'big'
export type AssetKind = 'real-estate' | 'business' | 'stock' | 'fund' | 'cd'

export type Asset = {
  id: string
  sourceId?: string
  name: string
  kind?: AssetKind
  downPayment: number
  mortgage: number
  cashFlow: number
  symbol?: string
  quantity?: number
  costPerUnit?: number
  level?: 1 | 2 | 3
  baseCashFlow?: number
}

export type PlayerState = {
  id: string
  name: string
  isHuman: boolean
  profession: string
  cash: number
  salary: number
  baseExpenses: number
  passiveIncome: number
  bankLoan: number
  babies: number
  perChildExpense: number
  assets: Asset[]
  position: number
  skippedTurns: number
  charityTurns: number
  phase: Phase
  fastTrackIncome: number
  fastTrackGoal: number
  fastTrackGoalGain?: number
  fastTrackTurns: number
  fastTrackBusinesses?: FastTrackBusiness[]
  fastTrackExpansions?: number
  fastTrackOperation?: FastTrackOperation
  fastTrackOperationsCompleted?: number
  dream: string
  bankrupt: boolean
  aiPersonality?: AiPersonality
  insurance?: InsuranceKind
  longTermGoal?: LongTermGoalId
  longTermGoalCompleted?: boolean
  nurseDoodadTriggers?: number
  nurseDoodadSavings?: number
  nurseBabyTriggers?: number
  engineerUpgradeTriggers?: number
  engineerUpgradeSavings?: number
  lawyerMarketTriggers?: number
  lawyerMarketBonus?: number
  strategyActionUsed?: boolean
  fastTrackStrategyUsed?: boolean
  dreamPreparation?: number
}

export type Opportunity = Asset & {
  description: string
  dealSize?: DealSize
}

export type DoodadCard = {
  id: string
  name: string
  description: string
  cost: number
  perChild?: number
}

export type MarketCard =
  | {
      id: string
      type: 'asset-offer'
      name: string
      description: string
      assetId?: string
      assetKind?: AssetKind
      salePrice?: number
      pricePerUnit?: number
      equityMultiple?: number
    }
  | {
      id: string
      type: 'security-split'
      name: string
      description: string
      symbol: string
      multiplier: number
    }

export type FastTrackBusiness = {
  id: string
  sourceId?: string
  name: string
  description: string
  cost: number
  cashFlow: number
  baseCashFlow?: number
  sector?: FastTrackSector
  upgrade?: 'growth' | 'resilience'
  reinvestments?: number
}

export type FastTrackSector = 'infrastructure' | 'technology' | 'community' | 'education' | 'healthcare' | 'logistics'

export type FastTrackOperation = {
  mode: 'reinvest' | 'dividend'
  businessId: string
}

export type FastTrackRisk = {
  id: string
  name: string
  description: string
  effect: 'cash-percent' | 'cash-fixed' | 'income-percent'
  amount: number
}

export type PendingDecision =
  | { type: 'deal-choice'; playerId: string }
  | { type: 'opportunity'; playerId: string; opportunity: Opportunity }
  | { type: 'charity'; playerId: string; donation: number }
  | { type: 'market'; playerId: string; assetId: string; assetName: string; salePrice: number; levelPremium?: number; cardId: string; responderIds: string[] }
  | { type: 'insolvency'; playerId: string; reason: string }
  | { type: 'fast-track-business'; playerId: string; business: FastTrackBusiness }
  | { type: 'dream'; playerId: string; dream: string; cost: number }

export type GameLogEntry = {
  id: number
  playerId: string
  // Chinese rendering of `text`; older saves only have this field.
  message: string
  text?: LocalText
  tone: 'neutral' | 'positive' | 'negative'
}

export type GameState = {
  schemaVersion: 2
  setup: {
    aiCount: number
    seed: number
    dream: string
    profession?: string
    longTermGoal?: LongTermGoalId
    aiDifficulty?: AiDifficulty
    aiPersonalities?: AiPersonality[]
    marketPricingVersion?: MarketPricingVersion
    fastTrackBalanceVersion?: FastTrackBalanceVersion
    ratRaceBalanceVersion?: RatRaceBalanceVersion
    strategyRulesVersion?: StrategyRulesVersion
    pace?: GamePace
  }
  commandHistory: GameCommand[]
  revision: number
  seed: number
  turn: number
  turnStage: 'awaiting-roll' | 'awaiting-decision' | 'awaiting-end'
  currentPlayerIndex: number
  players: PlayerState[]
  pendingDecision: PendingDecision | null
  opportunityIndex: number
  fastTrackIndex: number
  fastTrackRiskIndex: number
  smallDealDeck: string[]
  bigDealDeck: string[]
  doodadDeck: string[]
  marketDeck: string[]
  fastTrackBusinessDeck: string[]
  fastTrackRiskDeck: string[]
  smallDealIndex: number
  bigDealIndex: number
  doodadIndex: number
  marketIndex: number
  logs: GameLogEntry[]
  winnerId: string | null
  economicCycleIndex: number
}

export type GameCommand =
  | { type: 'ROLL_DICE'; actorId: string; diceCount?: 1 | 2 }
  | { type: 'DRAW_DEAL'; actorId: string; dealSize: DealSize }
  | { type: 'BUY_OPPORTUNITY'; actorId: string }
  | { type: 'PASS_OPPORTUNITY'; actorId: string }
  | { type: 'CHOOSE_CHARITY'; actorId: string; donate: boolean }
  | { type: 'TAKE_LOAN'; actorId: string; amount: number }
  | { type: 'REPAY_LOAN'; actorId: string; amount: number }
  | { type: 'SELL_MARKET_ASSET'; actorId: string }
  | { type: 'PASS_MARKET'; actorId: string }
  | { type: 'LIQUIDATE_ASSET'; actorId: string; assetId: string }
  | { type: 'DECLARE_BANKRUPTCY'; actorId: string }
  | { type: 'BUY_FAST_TRACK_BUSINESS'; actorId: string }
  | { type: 'PASS_FAST_TRACK_BUSINESS'; actorId: string }
  | { type: 'BUY_DREAM'; actorId: string }
  | { type: 'PASS_DREAM'; actorId: string }
  | { type: 'UPGRADE_ASSET'; actorId: string; assetId: string }
  | { type: 'BUY_INSURANCE'; actorId: string; insurance: InsuranceKind }
  | { type: 'FINANCIAL_REVIEW'; actorId: string }
  | { type: 'FAST_TRACK_EXPAND'; actorId: string }
  | { type: 'FAST_TRACK_UPGRADE_BUSINESS'; actorId: string; businessId: string; branch: 'growth' | 'resilience' }
  | { type: 'FAST_TRACK_OPERATE'; actorId: string; businessId: string; mode: 'reinvest' | 'dividend' }
  | { type: 'FAST_TRACK_REINVEST'; actorId: string; businessId: string }
  | { type: 'FAST_TRACK_SELL_BUSINESS'; actorId: string; businessId: string }
  | { type: 'FAST_TRACK_MANAGE_RISK'; actorId: string; insurance?: 'maintenance' | 'lawsuit' }
  | { type: 'FAST_TRACK_PREPARE_DREAM'; actorId: string }
  | { type: 'END_TURN'; actorId: string }

export type CommandResult =
  | { ok: true; state: GameState }
  | {
      ok: false
      state: GameState
      error: 'NOT_YOUR_TURN' | 'COMMAND_NOT_ALLOWED' | 'INVALID_AMOUNT' | 'INSUFFICIENT_CASH'
    }