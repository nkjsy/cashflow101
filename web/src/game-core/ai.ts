import { FAST_TRACK_EXPANSION_GAIN, FAST_TRACK_EXPANSION_LIMIT, FAST_TRACK_GROWTH_UPGRADE_RATE, FAST_TRACK_REINVEST_LIMIT, FAST_TRACK_REINVEST_RATE, assetUpgradeCost, canTakeLoan, executeCommand, fastTrackExpansionCost, fastTrackReinvestCost, fastTrackSaleProceeds, fastTrackUpgradeCost, insuranceCost } from './engine'
import { BIG_DEALS } from './data'
import { evaluateOpportunity, getAiPolicy, shouldBuyFastTrackBusiness } from './ai-policy'
import type { GameCommand, GameState } from './types'

const minimumBigDealDownPayment = Math.min(...BIG_DEALS.map((deal) => deal.downPayment))

const apply = (state: GameState, command: GameCommand) => {
  const result = executeCommand(state, command)
  return result.ok ? result.state : state
}

export const choosePreRollStrategyCommand = (state: GameState): GameCommand | null => {
  if (state.setup.strategyRulesVersion !== 'strategy-v1' || state.turnStage !== 'awaiting-roll') return null
  const player = state.players[state.currentPlayerIndex]
  if (player.phase === 'fast-track') {
    if (player.fastTrackStrategyUsed) return null
    const policy = getAiPolicy(state, player)
    const businesses = player.fastTrackBusinesses ?? []
    const incomeGap = player.fastTrackGoal - player.fastTrackIncome
    const growthCandidate = businesses
      .filter((business) => !business.upgrade)
      .map((business) => ({ business, cost: fastTrackUpgradeCost(business, 'growth'), gain: Math.round(business.cashFlow * FAST_TRACK_GROWTH_UPGRADE_RATE / 100) * 100 }))
      .filter(({ cost }) => player.cash >= cost * 1.25)
      .sort((left, right) => right.gain / right.cost - left.gain / left.cost)[0]
    if (growthCandidate && (growthCandidate.gain >= incomeGap || policy.personality === 'aggressive')) {
      return { type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: player.id, businessId: growthCandidate.business.id, branch: 'growth' }
    }
    const reinvestCandidate = businesses
      .filter((business) => (business.reinvestments ?? 0) < FAST_TRACK_REINVEST_LIMIT)
      .map((business) => ({ business, cost: fastTrackReinvestCost(businesses, business), gain: Math.round(business.cashFlow * FAST_TRACK_REINVEST_RATE / 100) * 100 }))
      .filter(({ cost }) => player.cash >= cost * 1.25)
      .sort((left, right) => right.gain / right.cost - left.gain / left.cost)[0]
    if (reinvestCandidate && (reinvestCandidate.gain >= incomeGap || !growthCandidate)) {
      return { type: 'FAST_TRACK_REINVEST', actorId: player.id, businessId: reinvestCandidate.business.id }
    }
    if (policy.personality === 'conservative') {
      const resilienceCandidate = businesses.find((business) => !business.upgrade && player.cash >= fastTrackUpgradeCost(business, 'resilience') * 1.25)
      if (resilienceCandidate) return { type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: player.id, businessId: resilienceCandidate.id, branch: 'resilience' }
    }
    const expansionCost = fastTrackExpansionCost(player.fastTrackIncome)
    if ((player.fastTrackExpansions ?? 0) < FAST_TRACK_EXPANSION_LIMIT && player.cash >= expansionCost * 1.25 && (FAST_TRACK_EXPANSION_GAIN >= incomeGap || businesses.length === 0)) {
      return { type: 'FAST_TRACK_EXPAND', actorId: player.id }
    }
    const saleCandidate = businesses
      .map((business) => ({ business, proceeds: fastTrackSaleProceeds(businesses, business) }))
      .filter(({ proceeds }) => player.cash < policy.dreamCost && player.cash + proceeds >= policy.dreamCost)
      .sort((left, right) => right.proceeds - left.proceeds)[0]
    if (saleCandidate) {
      return { type: 'FAST_TRACK_SELL_BUSINESS', actorId: player.id, businessId: saleCandidate.business.id }
    }
    if ((player.dreamPreparation ?? 0) < 3 && player.cash >= 150000) return { type: 'FAST_TRACK_PREPARE_DREAM', actorId: player.id }
    return null
  }
  if (player.strategyActionUsed) return null
  const reserve = getAiPolicy(state, player).reserve
  const upgrade = player.assets
    .filter((asset) => !asset.symbol && (asset.level ?? 1) < 3)
    .map((asset) => ({ asset, cost: assetUpgradeCost(state, player, asset) }))
    .filter(({ cost }) => player.cash - cost >= reserve)
    .sort((left, right) => left.cost / (left.asset.baseCashFlow ?? left.asset.cashFlow) - right.cost / (right.asset.baseCashFlow ?? right.asset.cashFlow))[0]
  if (upgrade) return { type: 'UPGRADE_ASSET', actorId: player.id, assetId: upgrade.asset.id }
  if (player.bankLoan >= 5000 && player.cash - 5000 >= reserve) return { type: 'FINANCIAL_REVIEW', actorId: player.id }
  if (!player.insurance && player.profession === '医生') {
    const cost = insuranceCost(player, 'job-loss')
    if (player.cash - cost >= reserve) {
      return { type: 'BUY_INSURANCE', actorId: player.id, insurance: 'job-loss' }
    }
  }
  return null
}

const playBasicAiTurnInternal = (state: GameState): GameState => {
  const player = state.pendingDecision
    ? state.players.find((candidate) => candidate.id === state.pendingDecision?.playerId) ?? state.players[state.currentPlayerIndex]
    : state.players[state.currentPlayerIndex]
  if (player.isHuman) return state

  let nextState = state
  if (state.turnStage === 'awaiting-roll') {
    const strategyCommand = choosePreRollStrategyCommand(state)
    if (strategyCommand) nextState = apply(nextState, strategyCommand)
    nextState = apply(nextState, {
      type: 'ROLL_DICE',
      actorId: player.id,
      diceCount: player.phase === 'fast-track' || player.charityTurns > 0 ? 2 : 1,
    })
  }
  let decision = nextState.pendingDecision

  if (decision && decision.playerId !== player.id) return nextState

  if (decision?.type === 'deal-choice') {
    const reserve = getAiPolicy(nextState, player).reserve
    nextState = apply(nextState, {
      type: 'DRAW_DEAL',
      actorId: player.id,
      dealSize: player.cash - reserve >= minimumBigDealDownPayment ? 'big' : 'small',
    })
    decision = nextState.pendingDecision
  }
  if (decision?.type === 'opportunity') {
    const opportunity = decision.opportunity
    const evaluation = evaluateOpportunity(nextState, player, opportunity)
    const reserve = evaluation.reserve
    const shortfall = Math.max(0, opportunity.downPayment + reserve - player.cash)
    const loanAmount = Math.ceil(shortfall / 1000) * 1000
    const loanImprovesCashFlow = opportunity.cashFlow - loanAmount * 0.1 >= 100
    if (evaluation.attractive && loanImprovesCashFlow && loanAmount > 0 && loanAmount <= evaluation.maxLoan && !evaluation.isSecurity && canTakeLoan(player, loanAmount)) {
      nextState = apply(nextState, { type: 'TAKE_LOAN', actorId: player.id, amount: loanAmount })
    }
    const updatedPlayer = nextState.players.find((candidate) => candidate.id === player.id) ?? player
    const shouldBuy = evaluation.attractive && updatedPlayer.cash >= opportunity.downPayment
    nextState = apply(nextState, {
      type: shouldBuy ? 'BUY_OPPORTUNITY' : 'PASS_OPPORTUNITY',
      actorId: player.id,
    })
  } else if (decision?.type === 'charity') {
    const policy = getAiPolicy(nextState, player)
    nextState = apply(nextState, {
      type: 'CHOOSE_CHARITY',
      actorId: player.id,
      donate: player.cash - decision.donation >= policy.charityReserve,
    })
  } else if (decision?.type === 'market') {
    const asset = player.assets.find((candidate) => candidate.id === decision.assetId)
    const proceeds = asset ? decision.salePrice - asset.mortgage : 0
    const costBasis = asset
      ? asset.symbol
        ? (asset.costPerUnit ?? asset.downPayment) * (asset.quantity ?? 1)
        : asset.downPayment
      : Infinity
    nextState = apply(nextState, {
      type: proceeds >= costBasis || player.cash < getAiPolicy(nextState, player).distressCash
        ? 'SELL_MARKET_ASSET'
        : 'PASS_MARKET',
      actorId: player.id,
    })
  } else if (decision?.type === 'insolvency') {
    const current = nextState.players[nextState.currentPlayerIndex]
    const amount = Math.ceil(Math.abs(current.cash) / 1000) * 1000
    const liquidationAsset = [...current.assets].sort((left, right) => right.downPayment - left.downPayment)[0]
    nextState = apply(
      nextState,
      canTakeLoan(current, amount)
        ? { type: 'TAKE_LOAN', actorId: player.id, amount }
        : liquidationAsset
          ? { type: 'LIQUIDATE_ASSET', actorId: player.id, assetId: liquidationAsset.id }
          : { type: 'DECLARE_BANKRUPTCY', actorId: player.id },
    )
  } else if (decision?.type === 'fast-track-business') {
    nextState = apply(nextState, {
      type:
        shouldBuyFastTrackBusiness(nextState, player, decision.business.cost, decision.business.cashFlow)
          ? 'BUY_FAST_TRACK_BUSINESS'
          : 'PASS_FAST_TRACK_BUSINESS',
      actorId: player.id,
    })
  } else if (decision?.type === 'dream') {
    nextState = apply(nextState, {
      type: player.cash >= decision.cost ? 'BUY_DREAM' : 'PASS_DREAM',
      actorId: player.id,
    })
  }

  if (nextState.winnerId || nextState.turnStage !== 'awaiting-end') return nextState
  const updatedPlayer = nextState.players[nextState.currentPlayerIndex]
  const reserve = getAiPolicy(nextState, updatedPlayer).reserve
  const repayable = Math.min(
    updatedPlayer.bankLoan,
    Math.floor(Math.max(0, updatedPlayer.cash - reserve) / 100) * 100,
  )
  if (updatedPlayer.phase === 'rat-race' && repayable >= 100) {
    return apply(nextState, { type: 'REPAY_LOAN', actorId: updatedPlayer.id, amount: repayable })
  }
  return apply(nextState, { type: 'END_TURN', actorId: player.id })
}

const explainAiDecision = (state: GameState) => {
  const decision = state.pendingDecision
  const player = decision
    ? state.players.find((candidate) => candidate.id === decision.playerId)
    : state.players[state.currentPlayerIndex]
  const policy = player ? getAiPolicy(state, player) : null
  const style = policy ? `采用${policy.personality === 'conservative' ? '保守' : policy.personality === 'aggressive' ? '进取' : '均衡'}策略` : '按当前策略'
  if (!decision) return '按当前骰子权益推进回合，并在结束前优先偿还不影响现金储备的贷款。'
  if (decision.type === 'deal-choice') return `${style}，先保留现金储备，再判断是否负担得起大买卖最低首付。`
  if (decision.type === 'opportunity') return `${style}，综合回报率、现金储备和可持续借款；基金与存单不使用贷款。`
  if (decision.type === 'market') return `${style}，报价达到成本时卖出，现金紧张时也会折价换取流动性。`
  if (decision.type === 'charity') return `${style}，捐赠后仍达到目标现金储备才换取三回合双骰。`
  if (decision.type === 'insolvency') return '先尝试可持续借款，再清算首付最高的资产，最后才宣布破产。'
  if (decision.type === 'fast-track-business') return `${style}；专家会优先保留实现所选梦想所需的现金。`
  if (decision.type === 'dream') return '现金足以支付所选梦想时立即实现，否则保留现金。'
  return '根据现金储备处理当前选择。'
}

export const playBasicAiTurn = (state: GameState): GameState => {
  const actor = state.pendingDecision
    ? state.players.find((player) => player.id === state.pendingDecision?.playerId)
    : state.players[state.currentPlayerIndex]
  const reason = explainAiDecision(state)
  const result = playBasicAiTurnInternal(state)
  if (!actor || result.revision === state.revision) return result
  const id = (result.logs.at(-1)?.id ?? -1) + 1
  return {
    ...result,
    logs: [...result.logs, { id, playerId: actor.id, message: `AI 判断：${reason}`, tone: 'neutral' as const }].slice(-40),
  }
}