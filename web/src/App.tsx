import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BanknoteArrowDown,
  Bot,
  BriefcaseBusiness,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  Cog,
  Dice5,
  Flag,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Hospital,
  PartyPopper,
  Play,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Volume2,
  VolumeX,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import './App.css'
import './game-details.css'
import { GameAudio } from './game-audio'
import { sessionStore, storage } from './platform/storage'
import { breakAdDue, platform, showBreakAd } from './platform'
import { formatLog, getLanguage, money, setLanguage, t, tn, tx, type Language } from './i18n'
import type { UiKey } from './i18n/ui-en'
import { playBasicAiTurn } from './game-core/ai'
import { aiPersonalityLabels } from './game-core/ai-policy'
import {
  BIG_DEALS,
  BOARD,
  DOODADS,
  DREAMS,
  FAST_TRACK_BOARD,
  FAST_TRACK_BUSINESSES,
  FAST_TRACK_DREAM_BY_POSITION,
  FAST_TRACK_RISKS,
  FAST_TRACK_DREAM_COSTS,
  MARKETS,
  PROFESSIONS,
  SMALL_DEALS,
  professionByTitle,
  fastTrackDreamCost,
} from './game-core/data'
import {
  FAST_TRACK_EXPANSION_GAIN,
  FAST_TRACK_EXPANSION_LIMIT,
  FAST_TRACK_GROWTH_UPGRADE_RATE,
  FAST_TRACK_REINVEST_RATE,
  FAST_TRACK_REINVEST_LIMIT,
  QUICK_PACE,
  STANDARD_FAST_TRACK_GOAL_GAIN,
  canTakeLoan,
  childMonthlyExpenses,
  createGame,
  currentEconomicCycle,
  assetUpgradeCost,
  executeCommand,
  fastTrackExpansionCost,
  fastTrackGoalGain,
  fastTrackStartingIncome,
  fastTrackBusinessIncome,
  fastTrackReinvestCost,
  fastTrackSaleProceeds,
  fastTrackUpgradeCost,
  insuranceCoverageRate,
  lawyerNegotiationBonus,
  monthlyCashFlow,
  totalExpenses,
} from './game-core/engine'
import { finalPlayerScore, groupAssets, playerProgress, playerStatusText } from './game-core/selectors'
import type {
  AiDifficulty,
  AiPersonality,
  DisplayMode,
  GameCommand,
  GameState,
  PlayerState,
  AssetKind,
  Asset,
  FastTrackBusiness,
  FastTrackSector,
  GamePace,
  SpaceType,
} from './game-core/types'

const SAVE_KEY = 'cashflow-lab-save-v1'
const MODE_KEY = 'cashflow-lab-mode'
const SOUND_KEY = 'cashflow-lab-sound'
const PACE_KEY = 'cashflow-lab-pace'

type Notice = { text: string; success?: boolean }

const restoreAssetInstances = (assets: Asset[]) => {
  const occurrences = new Map<string, number>()
  return assets.map((asset) => {
    const sourceId = asset.sourceId ?? asset.id
    const occurrence = (occurrences.get(sourceId) ?? 0) + 1
    occurrences.set(sourceId, occurrence)
    return {
      ...asset,
      id: asset.sourceId || occurrence === 1 ? asset.id : `${sourceId}#${occurrence}`,
      sourceId,
      kind: asset.kind ?? 'real-estate' as const,
      level: asset.level ?? 1 as const,
      baseCashFlow: asset.baseCashFlow ?? asset.cashFlow,
    }
  })
}

const restoreFastTrackBusinessInstances = (businesses: FastTrackBusiness[]) => {
  const occurrences = new Map<string, number>()
  return businesses.map((business) => {
    const sourceId = business.sourceId ?? business.id
    const occurrence = (occurrences.get(sourceId) ?? 0) + 1
    occurrences.set(sourceId, occurrence)
    const definition = FAST_TRACK_BUSINESSES.find((candidate) => candidate.id === sourceId)
    return {
      ...business,
      id: business.sourceId || occurrence === 1 ? business.id : `${sourceId}#${occurrence}`,
      sourceId,
      sector: business.sector ?? definition?.sector,
      baseCashFlow: business.baseCashFlow ?? definition?.cashFlow ?? business.cashFlow,
    }
  })
}

const professionPassives: Record<string, UiKey> = {
  教师: '完成长期目标时额外获得 $2,000，合计奖励 $5,000。',
  工程师: '企业升级成本降低 50%。',
  护士: '护理专长：牙科治疗支出降低 50%；添丁不增加儿童月支出。',
  维修技师: '房地产升级成本降低 20%。',
  会计师: '财务整理的减免比例固定增加 10 个百分点。',
  警员: '慈善捐赠的双骰效果额外持续 1 回合。',
  医生: '失业保险理赔比例从 50% 提高到 75%。',
  律师: '合同谈判：市场出售成交价提高 5%，每次最多 $1,000。',
}

const assetKindLabels: Record<AssetKind, UiKey> = {
  'real-estate': '房地产',
  business: '企业',
  stock: '股票',
  fund: '基金',
  cd: '存单',
}

const fastTrackSectorLabels: Record<FastTrackSector, UiKey> = {
  infrastructure: '基础设施',
  technology: '科技',
  community: '民生',
  education: '教育',
  healthcare: '医疗',
  logistics: '物流',
}

const spaceLabels: Record<SpaceType, UiKey> = {
  opportunity: '机会',
  payday: '发薪日',
  market: '市场',
  doodad: '额外支出',
  charity: '慈善',
  baby: '添丁',
  downsized: '失业',
}

const fastTrackSpaceLabels: Record<'cashflow-day' | 'business' | 'dream' | 'risk', UiKey> = {
  'cashflow-day': '收益日',
  business: '企业',
  dream: '梦想',
  risk: '风险',
} as const

const spaceDescriptions: Record<SpaceType, UiKey> = {
  opportunity: '抽取小买卖或大买卖，在查看首付、负债和现金流后决定是否投资。',
  payday: '领取一次月现金流：工资与被动收入减去总支出。经过或停在这里都会结算。',
  market: '翻开市场卡。持有匹配资产的玩家依次决定是否按报价出售，也可能发生证券拆股。',
  doodad: '抽取额外支出卡并立即付款。现金不足时需要借款或进入清算。',
  charity: '可捐出总收入的 10%，换取接下来三个回合使用两颗骰子。',
  baby: '家庭增加一名孩子，通常会增加每月孩子支出，最多三个；护士不增加儿童月支出。',
  downsized: '支付一次总支出，并在下一回合失业停掷；现金不足时需要借款或清算。',
}

const fastTrackSpaceDescriptions: Record<'cashflow-day' | 'business' | 'dream' | 'risk', UiKey> = {
  'cashflow-day': '领取自由快道现金流收入。经过或停在这里都会结算。',
  business: '抽取一个自由快道企业；购买后提高每个收益日的收入，达到收入目标即可获胜。',
  dream: '若这里是你选择的梦想且现金足够，可以购买梦想并立即获胜。',
  risk: '抽取风险卡，可能损失现金或自由快道收入。风险效果必须立即结算。',
} as const

const personalityDetails: Record<AiPersonality, UiKey> = {
  conservative: '保留约 1.25 个月支出；经营资产月回报至少 10%；投资借款最多 $1,000；较少为流动性折价出售。',
  balanced: '保留约半个月支出；经营资产月回报至少 8%；投资借款最多 $2,000；风险与增长居中。',
  aggressive: '保留约 0.35 个月支出；经营资产月回报至少 6%；投资借款最多 $4,000；更早止损换取现金。',
}

type PersonalitySelection = AiPersonality | 'auto'

const professionIcons: Record<string, LucideIcon> = {
  教师: GraduationCap,
  工程师: Cog,
  护士: Stethoscope,
  维修技师: Wrench,
  会计师: Calculator,
  警员: ShieldCheck,
  医生: Hospital,
  律师: Scale,
}

const loadGame = (): GameState | null => {
  try {
    const value = storage.get(SAVE_KEY)
    if (!value) return null
    const game = JSON.parse(value) as GameState
    if (!Array.isArray(game.players) || game.players.length < 2) throw new Error('Invalid save')
    const pendingDecision = game.pendingDecision?.type === 'market' && !game.pendingDecision.cardId
      ? null
      : game.pendingDecision
    return {
      ...game,
      schemaVersion: 2,
      setup: {
        aiCount: game.setup?.aiCount ?? game.players.length - 1,
        seed: game.setup?.seed ?? game.seed,
        dream: game.setup?.dream ?? game.players[0].dream,
        profession: game.setup?.profession ?? game.players[0].profession,
        longTermGoal: game.setup?.longTermGoal ?? game.players[0].longTermGoal ?? 'diversified',
        aiDifficulty: game.setup?.aiDifficulty ?? 'standard',
        aiPersonalities: game.setup?.aiPersonalities ?? game.players.slice(1).map((player) => player.aiPersonality ?? 'balanced'),
        marketPricingVersion: game.setup?.marketPricingVersion ?? 'legacy-fixed',
        fastTrackBalanceVersion: game.setup?.fastTrackBalanceVersion ?? 'legacy',
        ratRaceBalanceVersion: game.setup?.ratRaceBalanceVersion ?? 'legacy',
        strategyRulesVersion: game.setup?.strategyRulesVersion ?? 'legacy',
      },
      commandHistory: game.commandHistory ?? [],
      pendingDecision,
      turnStage: pendingDecision ? game.turnStage : game.pendingDecision ? 'awaiting-end' : game.turnStage,
      logs: game.logs.map((entry, index) => ({ ...entry, id: index })),
      smallDealDeck: game.smallDealDeck?.length ? game.smallDealDeck : SMALL_DEALS.map((card) => card.id),
      bigDealDeck: game.bigDealDeck?.length ? game.bigDealDeck : BIG_DEALS.map((card) => card.id),
      doodadDeck: game.doodadDeck?.length ? game.doodadDeck : DOODADS.map((card) => card.id),
      marketDeck: game.marketDeck?.length ? game.marketDeck : MARKETS.map((card) => card.id),
      fastTrackBusinessDeck: game.fastTrackBusinessDeck?.length ? game.fastTrackBusinessDeck : FAST_TRACK_BUSINESSES.map((business) => business.id),
      fastTrackRiskDeck: game.fastTrackRiskDeck?.length ? game.fastTrackRiskDeck : FAST_TRACK_RISKS.map((risk) => risk.id),
      smallDealIndex: game.smallDealIndex ?? game.opportunityIndex ?? 0,
      bigDealIndex: game.bigDealIndex ?? 0,
      doodadIndex: game.doodadIndex ?? 0,
      marketIndex: game.marketIndex ?? 0,
      fastTrackRiskIndex: game.fastTrackRiskIndex ?? 0,
      economicCycleIndex: game.economicCycleIndex ?? 0,
      players: game.players.map((player) => ({
        ...player,
        insurance: player.phase === 'fast-track' && player.insurance === 'job-loss' ? undefined : player.insurance,
        aiPersonality: player.isHuman ? undefined : player.aiPersonality ?? 'balanced',
        fastTrackTurns: player.fastTrackTurns ?? (player.phase === 'rat-race' ? 0 : 2),
        fastTrackBusinesses: restoreFastTrackBusinessInstances(player.fastTrackBusinesses ?? []),
        fastTrackOperation: undefined,
        fastTrackOperationsCompleted: player.fastTrackOperationsCompleted ?? 0,
        longTermGoal: player.longTermGoal ?? 'diversified',
        longTermGoalCompleted: player.longTermGoalCompleted ?? false,
        strategyActionUsed: player.strategyActionUsed ?? false,
        fastTrackStrategyUsed: player.fastTrackStrategyUsed ?? false,
        dreamPreparation: player.dreamPreparation ?? 0,
        assets: restoreAssetInstances(player.assets),
      })),
    }
  } catch {
    storage.remove(SAVE_KEY)
    sessionStore.set('cashflow-lab-save-notice', 'invalid')
    return null
  }
}

function PlayerAvatar({
  player,
  index,
  size = 'medium',
}: {
  player: PlayerState
  index: number
  size?: 'tiny' | 'small' | 'medium'
}) {
  const ProfessionIcon = professionIcons[player.profession] ?? BriefcaseBusiness
  const profile = professionByTitle(player.profession)
  return (
    <span
      aria-label={t('{name}，{profession}', { name: tn(player.name), profession: tn(player.profession) })}
      className={`player-avatar player-${index} ${size}`}
      tabIndex={size === 'medium' ? 0 : undefined}
      title={`${tn(player.name)} · ${tn(player.profession)}`}
    >
      <ProfessionIcon aria-hidden="true" />
      {profile && (
        <span className="profession-tooltip" role="tooltip">
          <strong>{tn(profile.title)}</strong>
          <p>{tn(profile.summary)}</p>
          <dl>
            <div><dt>{t('工资')}</dt><dd>{money(profile.salary)}</dd></div>
            <div><dt>{t('初始月结余')}</dt><dd>{money(profile.salary - profile.expenses)}</dd></div>
            <div><dt>{t('初始存款')}</dt><dd>{money(profile.savings)}</dd></div>
            <div><dt>{t('每名孩子支出')}</dt><dd>{money(profile.title === '护士' ? 0 : profile.perChildExpense)}</dd></div>
          </dl>
          <small>{t(professionPassives[profile.title])}</small>
        </span>
      )}
    </span>
  )
}

function AssetList({ assets }: { assets: PlayerState['assets'] }) {
  const groupedAssets = groupAssets(assets)
  if (groupedAssets.length === 0) {
    return (
      <p className="empty">
        <BriefcaseBusiness />{t('还没有资产，留意机会格。')}
      </p>
    )
  }

  return (
    <ul className="assets">
      {groupedAssets.map((asset) => (
        <li key={asset.id}>
          <span>
            {tn(asset.name)}{asset.symbol ? ` · ${asset.symbol}` : ''}
            <b className={`asset-kind ${asset.kind ?? 'real-estate'}`}>{t(assetKindLabels[asset.kind ?? 'real-estate'])}</b>
            {!asset.symbol && <b className="asset-level">L{asset.level ?? 1}</b>}
            {asset.count > 1 && <b className="asset-count">×{asset.count}</b>}
          </span>
          <span className="asset-values">
            <strong>{t('+{amount}/月', { amount: money(asset.totalCashFlow) })}</strong>
            <small>{asset.symbol ? t('成本 {amount}/份', { amount: money(asset.costPerUnit ?? 0) }) : t('抵押 {amount}', { amount: money(asset.totalMortgage) })}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function FastTrackBusinessList({ businesses }: { businesses: NonNullable<PlayerState['fastTrackBusinesses']> }) {
  return (
    <ul className="assets fast-track-businesses">
      {businesses.map((business, index) => (
        <li key={`${business.id}-${index}`}>
          <span>{tn(business.name)}<b className="asset-kind business">{business.sector ? t(fastTrackSectorLabels[business.sector]) : t('自由快道企业')}</b>{business.upgrade && <b className="asset-level">{business.upgrade === 'growth' ? t('增收') : t('抗风险')}</b>}</span>
          <span className="asset-values">
            <strong>{t('+{amount}/收益日', { amount: money(business.cashFlow) })}</strong>
            <small>{t('购入 {amount}', { amount: money(business.cost) })}{(business.reinvestments ?? 0) > 0 && t(' · 再投资 {count}/{limit}', { count: business.reinvestments ?? 0, limit: FAST_TRACK_REINVEST_LIMIT })}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function App() {
  const [mode, setMode] = useState<DisplayMode>(() =>
    storage.get(MODE_KEY) === 'standard' ? 'standard' : 'guided',
  )
  const [aiCount, setAiCount] = useState<1 | 2 | 3>(1)
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('standard')
  const [aiPersonalities, setAiPersonalities] = useState<PersonalitySelection[]>(['auto', 'auto', 'auto'])
  const [dream, setDream] = useState(DREAMS[0])
  const [profession, setProfession] = useState<string>(PROFESSIONS[0].title)
  const [game, setGame] = useState<GameState | null>(() => loadGame())
  const [showStart, setShowStart] = useState(() => Boolean(loadGame()))
  const [showFastTrackCelebration, setShowFastTrackCelebration] = useState(false)
  const [fastAi, setFastAi] = useState(false)
  const [spectating, setSpectating] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => storage.get(SOUND_KEY) !== 'off')
  const [language, setLanguageState] = useState<Language>(getLanguage)
  const [pace, setPace] = useState<GamePace>(() => storage.get(PACE_KEY) === 'standard' ? 'standard' : 'quick')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [adPlaying, setAdPlaying] = useState(false)
  const [platformMuted, setPlatformMuted] = useState(() => platform().isMuted())
  const audio = useRef(new GameAudio())
  const previousGame = useRef<GameState | null>(game)
  const adPending = useRef(false)
  const playedThisSession = useRef(false)
  const audible = soundEnabled && !platformMuted && !adPlaying
  const gameplayActive = Boolean(game) && !showStart && !adPlaying && !game?.winnerId && !(game?.players[0].bankrupt && !spectating)

  useEffect(() => storage.set(MODE_KEY, mode), [mode])
  useEffect(() => storage.set(SOUND_KEY, soundEnabled ? 'on' : 'off'), [soundEnabled])
  useEffect(() => storage.set(PACE_KEY, pace), [pace])
  useEffect(() => platform().onMuteChange(setPlatformMuted), [])
  useEffect(() => {
    if (gameplayActive) {
      playedThisSession.current = true
      platform().gameplayStart()
    }
    else platform().gameplayStop()
  }, [gameplayActive])
  useEffect(() => {
    // iOS suspends audio in the background and only resumes it inside a user gesture.
    const unlock = () => audio.current.unlock()
    window.addEventListener('pointerup', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerup', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
  // Runs `action` after a midgame ad when one is due; otherwise immediately (always on the web build).
  const afterBreakAd = (action: () => void) => {
    if (adPending.current) return
    if (!breakAdDue()) {
      action()
      return
    }
    adPending.current = true
    void showBreakAd({ onStart: () => setAdPlaying(true) }).finally(() => {
      adPending.current = false
      setAdPlaying(false)
      action()
    })
  }
  const changeLanguage = (next: Language) => {
    setLanguage(next)
    setLanguageState(next)
  }
  const showNotice = (next: Notice) => {
    setNotice(next)
    window.setTimeout(() => setNotice(null), 2400)
  }
  useEffect(() => {
    const previous = previousGame.current
    previousGame.current = game
    if (!game || !previous || showStart || !audible) return
    if (!previous.winnerId && game.winnerId) {
      audio.current.play('victory')
      return
    }
    if (game.players.some((player, index) => previous.players[index]?.phase === 'rat-race' && player.phase === 'fast-track')) {
      audio.current.play('milestone')
      return
    }
    if (game.players.some((player, index) => player.bankrupt && !previous.players[index]?.bankrupt)) {
      audio.current.play('bankrupt')
    }
  }, [game, showStart, audible])
  useEffect(() => {
    if (!game || showStart || showFastTrackCelebration || adPlaying) return
    storage.set(SAVE_KEY, JSON.stringify(game))
    const currentPlayer = game.players[game.currentPlayerIndex]
    if (game.winnerId) return
    const responder = game.pendingDecision
      ? game.players.find((player) => player.id === game.pendingDecision?.playerId)
      : null
    const scheduledPlayer = responder ?? currentPlayer
    if (scheduledPlayer.isHuman) {
      if (responder) return
      if (!spectating || !currentPlayer.bankrupt || game.turnStage !== 'awaiting-end') return
      const timer = window.setTimeout(() => {
        setGame((current) => current
          ? executeCommand(current, { type: 'END_TURN', actorId: currentPlayer.id }).state
          : null)
      }, fastAi ? 80 : 650)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(
      () => setGame((current) => (current ? playBasicAiTurn(current) : null)),
      fastAi ? 80 : 650,
    )
    return () => window.clearTimeout(timer)
  }, [game, showStart, showFastTrackCelebration, adPlaying, fastAi, spectating])

  const runCommand = (command: GameCommand) => {
    if (!game) return
    const result = executeCommand(game, command)
    if (result.ok) {
      if (audible) {
        const reachedMilestone = !game.winnerId && Boolean(result.state.winnerId)
          || game.players[0].phase === 'rat-race' && result.state.players[0].phase === 'fast-track'
        if (command.type === 'ROLL_DICE') {
          audio.current.play('dice')
          const before = game.players.find((player) => player.id === command.actorId)
          const after = result.state.players.find((player) => player.id === command.actorId)
          if (before && after) {
            const board = before.phase === 'fast-track' ? FAST_TRACK_BOARD : BOARD
            const steps = (after.position - before.position + board.length) % board.length
            const incomeSpace = before.phase === 'fast-track' ? 'cashflow-day' : 'payday'
            const passedIncomeDay = Array.from({ length: steps }, (_, index) =>
              board[(before.position + index + 1) % board.length],
            ).includes(incomeSpace)
            if (passedIncomeDay) audio.current.play('payday', 0.27)
            const landing = board[after.position]
            const landingCue = before.phase === 'fast-track'
              ? landing === 'cashflow-day'
                ? 'payday'
                : landing === 'risk'
                  ? 'risk'
                  : 'card'
              : landing === 'opportunity'
                ? 'card'
                : landing === 'market'
                  ? 'market'
                  : landing === 'payday'
                    ? 'payday'
                    : landing === 'charity'
                      ? 'charity'
                      : landing === 'baby'
                        ? 'baby'
                        : landing === 'downsized'
                          ? 'downsized'
                          : 'expense'
            if (!passedIncomeDay || landing !== incomeSpace) audio.current.play(landingCue, passedIncomeDay ? 0.5 : 0.27)
          }
        } else if (command.type === 'DRAW_DEAL') {
          audio.current.play('card')
        } else if (!reachedMilestone && command.type.startsWith('BUY_')) {
          audio.current.play('purchase')
        } else if (command.type === 'SELL_MARKET_ASSET') {
          audio.current.play('sale')
        } else if (command.type === 'TAKE_LOAN') {
          audio.current.play('loan')
        } else if (command.type === 'REPAY_LOAN') {
          audio.current.play('repay')
        } else if (command.type === 'CHOOSE_CHARITY' && command.donate) {
          audio.current.play('charity')
        } else if (command.type === 'LIQUIDATE_ASSET') {
          audio.current.play('expense')
        }
      }
      if (game.players[0].phase === 'rat-race' && result.state.players[0].phase === 'fast-track') {
        setShowFastTrackCelebration(true)
      }
      setGame(result.state)
      if (command.type === 'UPGRADE_ASSET' || command.type === 'FINANCIAL_REVIEW') {
        const lastLog = result.state.logs.at(-1)
        showNotice({ text: lastLog ? formatLog(lastLog) : t('策略操作已完成。'), success: true })
      }
      return
    }
    showNotice({
      text: result.error === 'INSUFFICIENT_CASH'
        ? command.type === 'UPGRADE_ASSET'
          ? t('现金不足，请积累足够现金后再升级。')
          : t('现金不足，先考虑银行贷款。')
        : t('当前不能执行这个动作。'),
    })
  }

  const reset = () => {
    storage.remove(SAVE_KEY)
    setGame(null)
    setShowStart(false)
    setShowFastTrackCelebration(false)
    setSpectating(false)
  }

  const startGame = () => {
    setGame(createGame(
      aiCount,
      Date.now() >>> 0,
      dream,
      profession,
      aiDifficulty,
      aiPersonalities.slice(0, aiCount).map((personality) => personality === 'auto' ? undefined : personality),
      'scaled-equity',
      'accelerated',
      'global-v2',
      'strategy-v1',
      undefined,
      pace,
    ))
    setSpectating(false)
    setShowStart(false)
  }

  const confirmDialog = confirmation && (
    <ConfirmDialog
      confirmation={confirmation}
      onCancel={() => setConfirmation(null)}
      onConfirm={() => {
        setConfirmation(null)
        confirmation.onConfirm()
      }}
    />
  )

  if (!game || showStart) {
    return (
      <>
      <StartScreen
        mode={mode}
        pace={pace}
        language={language}
        aiCount={aiCount}
        aiDifficulty={aiDifficulty}
        aiPersonalities={aiPersonalities}
        dream={dream}
        profession={profession}
        hasSave={Boolean(game)}
        onMode={setMode}
        onPace={setPace}
        onLanguage={changeLanguage}
        onAi={setAiCount}
        onAiDifficulty={setAiDifficulty}
        onAiPersonality={(index, personality) => setAiPersonalities((current) =>
          current.map((value, slot) => slot === index ? personality : value),
        )}
        onDream={setDream}
        onProfession={setProfession}
        onStart={() => {
          // Starting another game is a natural break for a midgame ad.
          const start = () => playedThisSession.current ? afterBreakAd(startGame) : startGame()
          if (!game) {
            start()
            return
          }
          setConfirmation({
            message: t('开始新游戏将覆盖当前存档，是否继续？'),
            confirmLabel: t('开始新游戏'),
            onConfirm: start,
          })
        }}
        onResume={() => setShowStart(false)}
      />
      {confirmDialog}
      </>
    )
  }

  return (
    <>
    <GameScreen
      game={game}
      mode={mode}
      language={language}
      notice={notice}
      showFastTrackCelebration={showFastTrackCelebration}
      fastAi={fastAi}
      spectating={spectating}
      soundEnabled={soundEnabled}
      onMode={setMode}
      onLanguage={changeLanguage}
      onFastAi={() => setFastAi((value) => !value)}
      onSpectate={() => setSpectating(true)}
      onSound={() => setSoundEnabled((enabled) => {
        if (!enabled) audio.current.play('card')
        return !enabled
      })}
      onMenu={() => setShowStart(true)}
      onCommand={runCommand}
      onDismissFastTrackCelebration={() => {
        setShowFastTrackCelebration(false)
        // Reaching the Freedom Lane is the game's level transition.
        afterBreakAd(() => {})
      }}
      onReset={reset}
      onRequestReset={() => setConfirmation({
        message: t('删除当前存档并返回设置？'),
        confirmLabel: t('删除存档并重新开始'),
        onConfirm: reset,
      })}
    />
    {confirmDialog}
    </>
  )
}

type Confirmation = { message: string; confirmLabel: string; onConfirm: () => void }

// In-game replacement for window.confirm, which sandboxed portal iframes may block.
function ConfirmDialog({ confirmation, onCancel, onConfirm }: { confirmation: Confirmation; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="help-backdrop confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-message" onMouseDown={(event) => event.stopPropagation()}>
        <p id="confirm-message">{confirmation.message}</p>
        <div className="game-over-actions">
          <button className="secondary" onClick={onCancel} autoFocus>{t('取消')}</button>
          <button className="primary" onClick={onConfirm}>{confirmation.confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

type StartProps = {
  mode: DisplayMode
  pace: GamePace
  language: Language
  aiCount: 1 | 2 | 3
  aiDifficulty: AiDifficulty
  aiPersonalities: PersonalitySelection[]
  dream: string
  profession: string
  hasSave: boolean
  onMode: (mode: DisplayMode) => void
  onPace: (pace: GamePace) => void
  onLanguage: (language: Language) => void
  onAi: (count: 1 | 2 | 3) => void
  onAiDifficulty: (difficulty: AiDifficulty) => void
  onAiPersonality: (index: number, personality: PersonalitySelection) => void
  onDream: (dream: string) => void
  onProfession: (profession: string) => void
  onStart: () => void
  onResume: () => void
}

function LanguageToggle({ language, onLanguage }: { language: Language; onLanguage: (language: Language) => void }) {
  return (
    <div className="language-toggle" role="group" aria-label="Language / 语言">
      <button className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} lang="en" onClick={() => onLanguage('en')}>EN</button>
      <button className={language === 'zh' ? 'active' : ''} aria-pressed={language === 'zh'} lang="zh-CN" onClick={() => onLanguage('zh')}>中文</button>
    </div>
  )
}

function StartScreen({ mode, pace, language, aiCount, aiDifficulty, aiPersonalities, dream, profession, hasSave, onMode, onPace, onLanguage, onAi, onAiDifficulty, onAiPersonality, onDream, onProfession, onStart, onResume }: StartProps) {
  const saveNotice = sessionStore.get('cashflow-lab-save-notice')
  return (
    <main className="start-shell">
      <header className="brand-bar">
        <span className="brand-mark"><CircleDollarSign /></span>
        <strong>Ratrace</strong>
        <span className="tag">{t('单机版')}</span>
        <LanguageToggle language={language} onLanguage={onLanguage} />
      </header>
      <section className="setup-workspace">
        <div className="setup-panel">
          {saveNotice && <p className="save-notice" role="alert">{t('存档格式无效或已损坏，已安全忽略。')}</p>}
          <div className="setup-hero">
            <div>
              <p className="eyebrow"><Sparkles /> {t('新游戏配置')}</p>
              <h1>Ratrace</h1>
              <p>{t('从工资单出发，建立资产，让现金流带你离开打工圈。')}</p>
            </div>
            <div className="setup-hero-actions">
              <span>{pace === 'quick' ? t('单机 · 约 12 分钟') : t('单机 · 约 35 分钟')}</span>
              {hasSave && (
                <button className="resume" onClick={onResume}>
                  <span><Play />{t('继续上次游戏')}</span><ChevronRight />
                </button>
              )}
            </div>
          </div>
          <div className="setup-main-grid">
            <section className="setup-section game-settings" aria-labelledby="game-settings-title">
              <div className="section-heading">
                <span>01</span>
                <div><strong id="game-settings-title">{t('对局设置')}</strong><small>{t('规则与对手')}</small></div>
              </div>
              <fieldset>
                <legend>{t('对局时长')}</legend>
                <div className="segments pace-segments" aria-label={t('对局时长')}>
                  <button className={pace === 'quick' ? 'active' : ''} aria-pressed={pace === 'quick'} onClick={() => onPace('quick')}>{t('快速局 · 约 12 分钟')}</button>
                  <button className={pace === 'standard' ? 'active' : ''} aria-pressed={pace === 'standard'} onClick={() => onPace('standard')}>{t('标准局 · 约 35 分钟')}</button>
                </div>
                <p className="setting-note"><Sparkles /> {pace === 'quick' ? t('规则相同：起始储蓄更多、交易现金流更高，自由快道收入目标减半。') : t('完整节奏：更长的打工圈积累和 $50,000 自由快道收入目标。')}</p>
              </fieldset>
              <fieldset>
                <legend>{t('游戏模式')}</legend>
                <div className="mode-options">
                  <ModeButton active={mode === 'guided'} icon={<Sparkles />} title={t('引导模式')} detail={t('关键节点提供解释与建议')} onClick={() => onMode('guided')} />
                  <ModeButton active={mode === 'standard'} icon={<Flag />} title={t('标准模式')} detail={t('保留规则提示，节奏更紧凑')} onClick={() => onMode('standard')} />
                </div>
              </fieldset>
              <div className="compact-settings">
                <fieldset>
                  <legend>{t('AI 对手')}</legend>
                  <div className="segments">
                    {([1, 2, 3] as const).map((count) => (
                      <button className={aiCount === count ? 'active' : ''} key={count} onClick={() => onAi(count)}>{t('{count} 名', { count })}</button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>{t('AI 难度')}</legend>
                  <div className="segments" aria-label={t('AI 难度')}>
                    {([['cautious', '稳健'], ['standard', '标准'], ['expert', '专家']] as const).map(([value, label]) => (
                      <button className={aiDifficulty === value ? 'active' : ''} key={value} onClick={() => onAiDifficulty(value)}>{t(label)}</button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <p className="setting-note"><Bot /> {t('对手会评估现金储备与投资回报，公开财务信息全程可见。')}</p>
              <div className="opponent-personalities">
                <div className="subsection-heading">
                  <strong>{t('AI 性格')}</strong>
                  <span>{t('风险偏好，可独立配置')}</span>
                </div>
                <div className="personality-selectors">
                  {Array.from({ length: aiCount }, (_, index) => {
                    const selection = aiPersonalities[index] ?? 'auto'
                    return (
                      <label key={index}>
                        <span>AI {index + 1}</span>
                        <select aria-label={t('AI {index} 性格', { index: index + 1 })} value={selection} onChange={(event) => onAiPersonality(index, event.target.value as PersonalitySelection)}>
                          <option value="auto">{t('自动分配')}</option>
                          <option value="conservative">{t('保守型')}</option>
                          <option value="balanced">{t('均衡型')}</option>
                          <option value="aggressive">{t('进取型')}</option>
                        </select>
                        <small>{selection === 'auto' ? t('按 seed 从三种性格中分配；可复现，但不是固定为某一种。') : t(personalityDetails[selection])}</small>
                      </label>
                    )
                  })}
                </div>
              </div>
            </section>
            <section className="setup-section player-settings" aria-labelledby="player-settings-title">
              <div className="section-heading">
                <span>02</span>
                <div><strong id="player-settings-title">{t('你的角色')}</strong><small>{t('职业与目标')}</small></div>
              </div>
              <fieldset>
                <legend>{t('你的长期目标')}</legend>
                <p className="setting-note goal-note"><Flag />{t('开始新游戏后从三类配置、三级资产、无贷经营中随机揭晓。')}</p>
              </fieldset>
              <fieldset>
                <legend>{t('你的职业')}</legend>
                <select aria-label={t('选择职业')} className="dream-select" value={profession} onChange={(event) => onProfession(event.target.value)}>
                  {PROFESSIONS.map((item) => <option key={item.title} value={item.title}>{t('{profession} · 月结余 {amount}', { profession: tn(item.title), amount: money(item.salary - item.expenses) })}</option>)}
                </select>
                <ProfessionRadar profession={profession} />
              </fieldset>
              <fieldset className="dream-field">
                <legend>{t('你的梦想')}</legend>
                <select aria-label={t('选择梦想')} className="dream-select" value={dream} onChange={(event) => onDream(event.target.value)}>
                  {DREAMS.map((item) => <option key={item} value={item}>{tn(item)}</option>)}
                </select>
              </fieldset>
            </section>
          </div>
          <div className="setup-footer">
            <p><Landmark /> {t('选择完成后即可开始，所有财务信息在对局中保持公开。')}</p>
            <button className="primary" onClick={onStart}><Dice5 />{t('开始新游戏')}</button>
          </div>
        </div>
      </section>
    </main>
  )
}

type Profession = (typeof PROFESSIONS)[number]

const radarDimensions: Array<{ label: UiKey; value: (item: Profession) => number }> = [
  { label: '收入', value: (item: Profession) => item.salary },
  { label: '月结余', value: (item: Profession) => item.salary - item.expenses },
  { label: '初始储蓄', value: (item: Profession) => item.savings },
  { label: '支出轻度', value: (item: Profession) => -item.expenses },
  { label: '育儿轻度', value: (item: Profession) => -(item.title === '护士' ? 0 : item.perChildExpense) },
]

function ProfessionRadar({ profession }: { profession: string }) {
  const selected = professionByTitle(profession) ?? PROFESSIONS[0]
  const centerX = 160
  const centerY = 91
  const radius = 62
  const pointAt = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / radarDimensions.length
    return `${centerX + Math.cos(angle) * radius * scale},${centerY + Math.sin(angle) * radius * scale}`
  }
  const scores = radarDimensions.map((dimension) => {
    const values = PROFESSIONS.map(dimension.value)
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    return 0.18 + (dimension.value(selected) - minimum) / (maximum - minimum) * 0.82
  })

  return (
    <section className="profession-comparison" aria-label={t('{profession}职业对比', { profession: tn(selected.title) })}>
      <div className="profession-summary">
        <strong>{tn(selected.title)}</strong>
        <span>{tn(selected.summary)}</span>
      </div>
      <svg className="profession-radar" viewBox="0 0 320 190" role="img" aria-label={t('{profession}职业雷达图，越靠外越有利', { profession: tn(selected.title) })}>
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon key={scale} className="radar-grid" points={radarDimensions.map((_, index) => pointAt(index, scale)).join(' ')} />
        ))}
        {radarDimensions.map((dimension, index) => {
          const [endX, endY] = pointAt(index, 1).split(',')
          const [labelX, labelY] = pointAt(index, 1.34).split(',')
          return (
            <g key={dimension.label}>
              <line className="radar-axis" x1={centerX} y1={centerY} x2={endX} y2={endY} />
              <text className="radar-label" x={labelX} y={labelY}>{t(dimension.label)}</text>
            </g>
          )
        })}
        <polygon className="radar-value" points={scores.map((score, index) => pointAt(index, score)).join(' ')} />
        {scores.map((score, index) => {
          const [x, y] = pointAt(index, score).split(',')
          return <circle key={radarDimensions[index].label} className="radar-point" cx={x} cy={y} r="3" />
        })}
      </svg>
      <div className="profession-facts">
        <span><small>{t('工资')}</small><strong>{money(selected.salary)}</strong></span>
        <span><small>{t('月结余')}</small><strong>{money(selected.salary - selected.expenses)}</strong></span>
        <span><small>{t('初始储蓄')}</small><strong>{money(selected.savings)}</strong></span>
        <span><small>{t('每名子女')}</small><strong>{t('-{amount}/月', { amount: money(selected.title === '护士' ? 0 : selected.perChildExpense) })}</strong></span>
      </div>
      <div className="profession-rules">
        <div><small>{t('职业技能')}</small><strong>{t(professionPassives[selected.title])}</strong></div>
      </div>
      <small className="radar-note">{t('相对全部职业归一化 · 越靠外越有利')}</small>
    </section>
  )
}

function ModeButton({
  active,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  title: string
  detail: string
  onClick: () => void
}) {
  return (
    <button className={`mode-card ${active ? 'selected' : ''}`} onClick={onClick}>
      <span className="mode-icon">{icon}</span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <i>{active && <Check />}</i>
    </button>
  )
}

type GameProps = {
  game: GameState
  mode: DisplayMode
  language: Language
  notice: Notice | null
  showFastTrackCelebration: boolean
  fastAi: boolean
  spectating: boolean
  soundEnabled: boolean
  onMode: (mode: DisplayMode) => void
  onLanguage: (language: Language) => void
  onFastAi: () => void
  onSpectate: () => void
  onSound: () => void
  onMenu: () => void
  onCommand: (command: GameCommand) => void
  onDismissFastTrackCelebration: () => void
  onReset: () => void
  onRequestReset: () => void
}

function GameScreen({ game, mode, language, notice, showFastTrackCelebration, fastAi, spectating, soundEnabled, onMode, onLanguage, onFastAi, onSpectate, onSound, onMenu, onCommand, onDismissFastTrackCelebration, onReset, onRequestReset }: GameProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [viewedPhase, setViewedPhase] = useState<'rat-race' | 'fast-track'>(() =>
    game.players[0].phase === 'fast-track' || game.players[0].fastTrackIncome > 0 ? 'fast-track' : 'rat-race',
  )
  const [seenGuides, setSeenGuides] = useState<string[]>(() => {
    try { return JSON.parse(storage.get('cashflow-lab-guides') ?? '[]') }
    catch { return [] }
  })
  const human = game.players[0]
  const roundedFastTrackPassiveIncome = Math.round(human.passiveIncome / 1000) * 1000
  const goalGain = `$${fastTrackGoalGain(human).toLocaleString('en-US')}`
  const fastTrackIncomeGain = human.fastTrackIncome - fastTrackStartingIncome(human)
  const current = game.players[game.currentPlayerIndex]
  const progress = playerProgress(human)
  const winner = game.players.find((player) => player.id === game.winnerId)
  const recentLogs = game.logs.slice(-4)
  const recentEvent = (text: string | RegExp) => recentLogs.some((entry) =>
    typeof text === 'string' ? entry.message.includes(text) : text.test(entry.message),
  )
  // Guide triggers match the Chinese `message`, which every log entry keeps regardless of display language.
  const guides: Array<{ id: string; show: boolean; title: UiKey; text: UiKey; params?: Record<string, string> }> = [
    { id: 'start', show: game.revision <= 1, title: '先读现金流表', text: '目标不是囤积工资，而是购买资产，让被动收入严格超过总支出。' },
    { id: 'deal', show: game.pendingDecision?.type === 'deal-choice' || game.pendingDecision?.type === 'opportunity', title: '判断一笔投资', text: '同时看首付、月现金流和买入后的现金储备；高价格不等于高回报。' },
    { id: 'payday', show: recentEvent('经过发薪日'), title: '经过发薪日立即结算', text: '工资、被动收入和全部月支出一起结算。月现金流为负时，经过发薪日也会扣减现金。' },
    { id: 'loan', show: recentEvent(/银行借款|偿还银行贷款/), title: '贷款会改变月现金流', text: '贷款以 $1,000 为单位，未偿余额每月产生 10% 支出。还款会降低支出，并可能帮助你达到财务自由。' },
    { id: 'charity', show: game.pendingDecision?.type === 'charity' || recentEvent('完成慈善捐赠'), title: '慈善换取三个有效回合', text: '捐赠总收入的 10% 后，未来三个自己的有效回合都可选择一颗或两颗骰子；因失业跳过的回合不消耗奖励。' },
    { id: 'doodad', show: recentEvent(/：.*支付 \$|当前无需支付/), title: '额外支出必须结算', text: '冲动消费是消费而不是资产，不产生被动收入；金额可能随孩子数量变化。' },
    { id: 'baby', show: recentEvent('家庭新增成员'), title: human.profession === '护士' ? '护理专长免除儿童月支出' : '孩子会提高固定支出', text: human.profession === '护士' ? '孩子数量仍会增加，按孩子计费的单次额外支出也照常结算，但儿童月支出保持为 $0。' : '每名孩子增加职业表中的每月孩子支出，最多计算三名；总支出上升会拉远财务自由目标。' },
    { id: 'downsized', show: recentEvent(/进入失业期|处于失业期/), title: '失业会付款并跳过回合', text: '落地时先支付一个月家庭总支出，随后跳过两个自己的回合；期间财务表仍保持不变。' },
    { id: 'market', show: game.pendingDecision?.type === 'market', title: '所有人依次响应市场', text: '比较净收入与成本；同一报价会按座位顺序询问每位符合条件的玩家。' },
    { id: 'security-split', show: recentEvent(/拆股|反向拆股|一拆二|二合一/), title: '拆股改变数量，不创造价值', text: '拆股会按比例调整持有份数和单位成本，总成本基础不变；之后的市场报价按新份数计算。' },
    { id: 'insolvency', show: game.pendingDecision?.type === 'insolvency', title: '先恢复现金为非负', text: '借款会新增月支出。无法持续借款时，可以清算资产或宣布破产。' },
    { id: 'fast-track', show: human.phase === 'fast-track', title: '自由快道收入只来自被动收入', text: '退出时的被动收入取整到最近 $1,000，再乘 100；工资和每月现金流不参与。之后提高收入 {gain}，或买下自己的梦想即可获胜。', params: { gain: goalGain } },
    { id: 'cashflow-day', show: recentEvent('经过自由快道收益日'), title: '收益日才发放自由快道收入', text: '进入自由快道时不会立刻获得现金；每次经过收益日，才领取当前自由快道收入。' },
    { id: 'fast-business', show: game.pendingDecision?.type === 'fast-track-business', title: '企业可以组合和经营', text: '企业收入计入 {gain} 目标；两个不同产业解锁 5% 协同。可以规模化、韧性化、再投资或出售企业。', params: { gain: goalGain } },
    { id: 'fast-risk', show: recentEvent(/税务审计|商业诉讼|离婚财产分割|合伙人违约|重大维护|经营损失/), title: '自由快道仍有经营风险', text: '自由快道没有失业事件，出圈时失业险会自动终止。风险可能扣减现金或永久降低收益日收入；维护险和诉讼险仍可理赔。' },
    { id: 'dream', show: game.pendingDecision?.type === 'dream', title: '只有自己的梦想能获胜', text: '每个梦想有固定棋盘格和独立价格。抵达并支付你开局选择的梦想价格，会立即结束游戏。' },
  ]
  const guide = mode === 'guided' ? guides.find((item) => item.show && !seenGuides.includes(item.id)) : undefined
  const finalScores = new Map(game.players.map((player) => [player.id, finalPlayerScore(player, game.winnerId)]))
  const rankedPlayers = [...game.players].sort((left, right) => {
    if (left.id === game.winnerId) return -1
    if (right.id === game.winnerId) return 1
    if (left.bankrupt !== right.bankrupt) return left.bankrupt ? 1 : -1
    const scoreDifference = finalScores.get(right.id)!.total - finalScores.get(left.id)!.total
    if (scoreDifference !== 0) return scoreDifference
    return game.players.indexOf(left) - game.players.indexOf(right)
  })

  return (
    <main className="game-shell">
      <section className={`progress-band ${human.phase === 'fast-track' ? 'fast-track-phase' : ''}`}>
        <div className="brand-compact top-brand"><CircleDollarSign /><strong>Ratrace</strong></div>
        <div className="track-toggle top-track-toggle" role="group" aria-label={t('切换棋盘')}>
          <button className={viewedPhase === 'rat-race' ? 'active' : ''} aria-pressed={viewedPhase === 'rat-race'} onClick={() => setViewedPhase('rat-race')}>{t('打工圈')}</button>
          <button className={viewedPhase === 'fast-track' ? 'active' : ''} aria-pressed={viewedPhase === 'fast-track'} onClick={() => setViewedPhase('fast-track')}>{t('自由快道')}</button>
        </div>
        <div className="progress-summary"><span>{game.setup.strategyRulesVersion === 'strategy-v1' && t('{cycle} · {rounds}轮 · ', { cycle: tn(currentEconomicCycle(game).name), rounds: 6 - ((game.turn - 1) % 6) })}{human.phase === 'fast-track' ? fastTrackIncomeGain >= 0 ? t('收入已增加 {amount} / {goal}', { amount: money(fastTrackIncomeGain), goal: goalGain }) : t('收入待恢复 {amount}', { amount: money(-fastTrackIncomeGain) }) : t('财务自由进度')}</span><strong>{progress}%</strong></div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <p className={human.phase === 'fast-track' ? 'fast-track-context' : undefined}>
          {human.phase === 'fast-track'
            ? <><span className="progress-dream"><Flag />{t('我的梦想：{dream}', { dream: tn(human.dream) })}</span><span>{fastTrackIncomeGain >= 0 ? t('已增加 {amount}', { amount: money(fastTrackIncomeGain) }) : t('仍需恢复 {amount}', { amount: money(-fastTrackIncomeGain) })}{t(' / 目标增加 {goal}', { goal: goalGain })}</span></>
            : t('被动收入 {passive} / 总支出 {expenses}', { passive: money(human.passiveIncome), expenses: money(totalExpenses(human)) })}
        </p>
        <div className="turn"><span>{t('第 {turn} 轮', { turn: game.turn })}</span><strong>{current.isHuman ? t('你的回合') : t('{name} 思考中', { name: tn(current.name) })}</strong></div>
        <div className="header-actions"><LanguageToggle language={language} onLanguage={onLanguage} /><button className="text-control" title={t('切换游戏提示密度')} onClick={() => onMode(mode === 'guided' ? 'standard' : 'guided')}>{mode === 'guided' ? t('引导') : t('标准')}</button><button className={`icon-button ${fastAi ? 'active' : ''}`} title={fastAi ? t('恢复 AI 动画') : t('快进 AI 动画')} onClick={onFastAi}><Bot /></button><button className={`icon-button ${soundEnabled ? 'active' : ''}`} title={soundEnabled ? t('关闭游戏音效') : t('开启游戏音效')} aria-pressed={soundEnabled} onClick={onSound}>{soundEnabled ? <Volume2 /> : <VolumeX />}</button><button className="icon-button" title={t('规则帮助')} onClick={() => setShowHelp(true)}><CircleHelp /></button><button className="icon-button" title={t('返回主菜单并保留存档')} onClick={onMenu}><House /></button><button className="icon-button" title={t('删除存档并重新开始')} onClick={onRequestReset}><RotateCcw /></button></div>
      </section>
      {winner && <section className="winner-banner"><Sparkles /><div><strong>{winner.isHuman ? t('你赢得了游戏！') : t('{name} 赢得了游戏', { name: tn(winner.name) })}</strong><span>{winner.isHuman ? t('你已经实现财务目标。') : t('查看事件记录了解最后一步。')}</span></div></section>}
      {guide && <section className="guide-card" aria-live="polite"><CircleHelp /><div><strong>{t(guide.title)}</strong><p>{t(guide.text, guide.params)}</p></div><button onClick={() => setSeenGuides((seen) => { const next = [...seen, guide.id]; storage.set('cashflow-lab-guides', JSON.stringify(next)); return next })}>{t('知道了')}</button></section>}
      <div className="game-grid">
        <Finance game={game} mode={mode} />
        <section className="play-area">
          <Board game={game} mode={mode} viewedPhase={viewedPhase} onCommand={onCommand} />
        </section>
        <Activity game={game} />
        <OpponentDashboard game={game} />
      </div>
      {showHelp && <div className="help-backdrop" role="presentation" onMouseDown={() => setShowHelp(false)}><section className="rules-panel" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}><header><div><small>{t('随时查阅')}</small><h2 id="rules-title">{t('游戏规则')}</h2></div><button className="icon-button" title={t('关闭规则')} onClick={() => setShowHelp(false)}>×</button></header><div className="rules-grid"><article><strong>{t('打工圈')}</strong><p>{t('经过发薪日结算月现金流。购买正现金流资产；被动收入严格超过总支出时进入自由快道。')}</p></article><article><strong>{t('贷款与破产')}</strong><p>{t('贷款以 $1,000 为单位，每月支付余额的 10%。现金为负时必须借款、清算或宣布破产。')}</p></article><article><strong>{t('市场与慈善')}</strong><p>{t('市场按座位顺序由符合条件的玩家响应。慈善换取未来三个有效回合的双骰选择。')}</p></article><article><strong>{t('自由快道')}</strong><p>{t('经营企业提高收入，出售企业筹集梦想资金。收入增加 {gain}，或买下自己的梦想即可获胜。', { gain: `$${(game.setup.pace === 'quick' ? QUICK_PACE.fastTrackGoalGain : STANDARD_FAST_TRACK_GOAL_GAIN).toLocaleString('en-US')}` })}</p></article></div><button className="primary wide" onClick={() => setShowHelp(false)}>{t('继续游戏')}</button></section></div>}
      {showFastTrackCelebration && (
        <div className="fast-track-celebration-backdrop" role="presentation">
          <section className="fast-track-celebration" role="dialog" aria-modal="true" aria-labelledby="fast-track-celebration-title">
            <span className="celebration-icon"><PartyPopper /></span>
            <small>{t('财务自由达成')}</small>
            <h2 id="fast-track-celebration-title">{t('你进入了自由快道！')}</h2>
            <p>{t('被动收入已经超过总支出。先体验一个完整的自由快道回合，随后企业投资与梦想购买将解锁。')}</p>
            <div className="celebration-metrics">
              <span><small>{t('收益日收入')}</small><strong>{money(human.fastTrackIncome)}</strong></span>
              <span><small>{t('收入目标')}</small><strong>{money(human.fastTrackGoal)}</strong></span>
              <span className="celebration-dream"><small>{t('你的梦想')}</small><strong>{tn(human.dream)}</strong></span>
            </div>
            {mode === 'guided' && (
              <div className="fast-track-formula entry-formula">
                <small>{t('起始收入计算')}</small>
                <strong>{t('{passive} → 取整 {rounded} × 100 = {income}', { passive: money(human.passiveIncome), rounded: money(roundedFastTrackPassiveIncome), income: money(human.fastTrackIncome) })}</strong>
                <p>{t('只使用退出时的被动收入；工资 {salary} 和每月现金流 {cashflow} 不代入公式。', { salary: money(human.salary), cashflow: money(monthlyCashFlow(human)) })}</p>
              </div>
            )}
            <button className="primary wide" onClick={onDismissFastTrackCelebration}>{t('驶入自由快道')}</button>
          </section>
        </div>
      )}
      {((human.bankrupt && !spectating) || winner) && (
        <div className="game-over-backdrop" role="presentation">
          <section className="game-over-dialog" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
            <span className={human.bankrupt ? 'game-over-icon bankrupt' : 'game-over-icon'}>
              {human.bankrupt ? <BanknoteArrowDown /> : <Sparkles />}
            </span>
            <small>{human.bankrupt && !winner ? t('你已退出本局') : t('游戏结束')}</small>
            <h2 id="game-over-title">
              {human.bankrupt
                ? t('你的现金流无法继续维持')
                : winner?.isHuman
                  ? t('你实现了财务目标')
                  : t('{name} 赢得了游戏', { name: tn(winner?.name ?? '') })}
            </h2>
            <p>
              {human.bankrupt
                ? t('破产会淘汰当前玩家；你的本局操作已经结束。{outcome}', { outcome: winner ? t('{name} 成为最后未破产玩家并获胜。', { name: tn(winner.name) }) : t('其他 AI 将继续对局。') })
                : t('本局已经产生胜者，所有游戏命令都已停止。')}
            </p>
            <div className="final-standing">
              {rankedPlayers.map((player, rank) => {
                const playerIndex = game.players.findIndex((candidate) => candidate.id === player.id)
                const score = finalScores.get(player.id)!
                return (
                <div key={player.id} className="final-standing-row">
                  <b className="rank-number">#{rank + 1}</b>
                  <PlayerAvatar player={player} index={playerIndex} size="small" />
                  <span><strong>{tn(player.name)}</strong><small>{player.bankrupt ? t('已破产') : player.id === game.winnerId ? t('胜者') : player.phase === 'fast-track' ? t('自由快道') : t('打工圈')}</small></span>
                  <span className="final-score-total"><b>{score.total}</b><small>{t('{grade} 级 · 100 分', { grade: score.grade })}</small></span>
                  <div className="final-score-breakdown" aria-label={t('{name}多维评分', { name: tn(player.name) })}>
                    {score.dimensions.map((dimension) => (
                      <span key={dimension.id} title={`${t(dimension.label as UiKey)} ${dimension.score}/${dimension.maximum}`}>
                        <small>{t(dimension.label as UiKey)}</small>
                        <i><em style={{ width: `${dimension.score / dimension.maximum * 100}%` }} /></i>
                        <b>{dimension.score}/{dimension.maximum}</b>
                      </span>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
            {human.bankrupt && !winner ? <div className="game-over-actions"><button className="secondary" onClick={onReset}>{t('开始新游戏')}</button><button className="primary" onClick={onSpectate}>{t('继续旁观')}</button></div> : <button className="primary wide" onClick={onReset}>{t('开始新游戏')}</button>}
          </section>
        </div>
      )}
      {notice && <div className={`toast ${notice.success ? 'success' : ''}`} role="alert">{notice.text}</div>}
    </main>
  )
}

function Title({ title, note }: { title: string; note: string }) {
  return <div className="section-title"><span>{title}</span><small>{note}</small></div>
}

function Finance({ game, mode }: { game: GameState; mode: DisplayMode }) {
  const [expensesExpanded, setExpensesExpanded] = useState(false)
  const [formulaExpanded, setFormulaExpanded] = useState(false)
  const human = game.players[0]
  const fixedExpenses = professionByTitle(human.profession)?.fixedExpenses
  const roundedFastTrackPassiveIncome = Math.round(human.passiveIncome / 1000) * 1000
  const longTermGoalReward = human.profession === '教师' ? '$5,000' : '$3,000'
  return (
    <aside className="finance-panel">
      <section className="panel identity">
        <PlayerAvatar player={human} index={0} />
        <div><small>{t('你的职业')}</small><strong>{tn(human.profession)}</strong></div>
        <div className="identity-goal">
          <div className="identity-goal-heading">
            <small>{t('目标')}</small>
            {human.phase === 'fast-track' && mode === 'guided' && (
              <span className={`formula-help ${formulaExpanded ? 'expanded' : ''}`}>
                <button
                  type="button"
                  className="formula-help-trigger"
                  title={t('收益日收入计算方式')}
                  aria-label={t('收益日收入计算方式')}
                  aria-expanded={formulaExpanded}
                  aria-describedby="fast-track-income-formula"
                  onClick={() => setFormulaExpanded((expanded) => !expanded)}
                >
                  <CircleHelp />
                </button>
                <span className="formula-tooltip fast-track-formula" id="fast-track-income-formula" role="tooltip">
                  <small>{t('收益日收入计算')}</small>
                  <strong>{money(human.passiveIncome)} → {money(roundedFastTrackPassiveIncome)} × 100 = {money(fastTrackStartingIncome(human))}</strong>
                  <span>{t('被动收入取整到最近千位；工资和每月现金流不参与。')}</span>
                </span>
              </span>
            )}
          </div>
          <strong>{human.phase === 'rat-race' ? t('被动收入超过总支出') : t('收益日收入达到 {amount}', { amount: money(human.fastTrackGoal) })}</strong>
          {human.phase === 'fast-track' && <span className="identity-dream"><Flag />{t('梦想：{dream}', { dream: tn(human.dream) })}</span>}
        </div>
        {game.setup.strategyRulesVersion === 'strategy-v1' && <div className="strategy-summary">
          <span title={t(professionPassives[human.profession])}>{t('职业能力')}</span>
          <span title={tn(currentEconomicCycle(game).description)}>{tn(currentEconomicCycle(game).name)}</span>
          <span className="summary-help" tabIndex={0}>{human.longTermGoalCompleted ? t('目标完成') : human.longTermGoal === 'master-asset' ? t('目标：三级资产') : human.longTermGoal === 'debt-free' ? t('目标：无贷经营') : t('目标：三类配置')}<span className="summary-tooltip" role="tooltip">{human.longTermGoal === 'master-asset' ? t('将任意一项非证券资产升级到 3 级。') : human.longTermGoal === 'debt-free' ? t('持有至少两项资产，并把银行贷款清偿为零。') : t('持有房地产、企业、股票、基金、存单中的任意三种资产类型。')}{t(' 完成后获得 {reward}。', { reward: longTermGoalReward })}</span></span>
          {human.insurance && <span>{human.insurance === 'job-loss' ? t('失业保险') : human.insurance === 'maintenance' ? t('维护保险') : t('诉讼保险')}</span>}
        </div>}
        <span className="cash">{t('现金 {amount}', { amount: money(human.cash) })}</span>
      </section>
      <section className="panel statement">
        <div className="section-title"><span>{t('每月现金流')}</span><strong>{money(monthlyCashFlow(human))}</strong></div>
        <dl>
          <div><dt>{t('工资收入')}</dt><dd>{money(human.salary)}</dd></div>
          <div><dt>{t('被动收入')}</dt><dd className="positive-text">{money(human.passiveIncome)}</dd></div>
          <div className="expense-total-row">
            <button type="button" aria-expanded={expensesExpanded} onClick={() => setExpensesExpanded((expanded) => !expanded)}>
              <span><ChevronRight className={expensesExpanded ? 'expanded' : ''} />{t('总支出')}</span>
              <strong>-{money(totalExpenses(human))}</strong>
            </button>
          </div>
          {expensesExpanded && (
            <div className="expense-breakdown">
              {fixedExpenses && <>
                <div><dt>{t('税费')}</dt><dd>-{money(fixedExpenses.taxes)}</dd></div>
                <div><dt>{t('住房贷款月供')}</dt><dd>-{money(fixedExpenses.mortgage)}</dd></div>
                <div><dt>{t('教育贷款月供')}</dt><dd>-{money(fixedExpenses.educationLoan)}</dd></div>
                <div><dt>{t('汽车贷款月供')}</dt><dd>-{money(fixedExpenses.carLoan)}</dd></div>
                <div><dt>{t('信用卡月供')}</dt><dd>-{money(fixedExpenses.creditCard)}</dd></div>
                <div><dt>{t('日常生活支出')}</dt><dd>-{money(fixedExpenses.living)}</dd></div>
              </>}
              <div><dt>{t('孩子支出（{count} 名）', { count: human.babies })}</dt><dd>-{money(childMonthlyExpenses(human))}</dd></div>
              <div><dt>{t('银行贷款月供（10%）')}</dt><dd>-{money(human.bankLoan * 0.1)}</dd></div>
            </div>
          )}
        </dl>
      </section>
      <section className="panel">
        <Title title={t('资产')} note={t('{count} 项持有', { count: human.assets.length })} />
        <AssetList assets={human.assets} />
        {(human.fastTrackBusinesses?.length ?? 0) > 0 && <>
          <Title title={t('自由快道企业')} note={`${t('{count} 项持有', { count: human.fastTrackBusinesses!.length })}${fastTrackBusinessIncome(human.fastTrackBusinesses!).synergy > 0 ? t(' · 多产业协同 +{amount}', { amount: money(fastTrackBusinessIncome(human.fastTrackBusinesses!).synergy) }) : ''}`} />
          <FastTrackBusinessList businesses={human.fastTrackBusinesses!} />
        </>}
      </section>
    </aside>
  )
}

function OpponentDashboard({ game }: { game: GameState }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const current = game.players[game.currentPlayerIndex]

  return (
    <section className="opponent-dashboard" aria-label={t('AI 对手公开财务')}>
      <Title title={t('AI 对手公开财务')} note={t('点击查看完整财务表')} />
      <div className="opponent-cards">
        {game.players.slice(1).map((player, offset) => {
          const index = offset + 1
          const expanded = expandedId === player.id
          const progress = playerProgress(player)
          const fixedExpenses = professionByTitle(player.profession)?.fixedExpenses
          return (
            <article className={`opponent-card ${player.id === current.id ? 'active' : ''}`} key={player.id}>
              <button
                className="opponent-summary"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : player.id)}
              >
                <PlayerAvatar player={player} index={index} size="small" />
                <span className="opponent-name"><strong>{tn(player.name)}<b>AI · {t(aiPersonalityLabels[player.aiPersonality ?? 'balanced'])}</b></strong><small>{tn(player.profession)} · {player.bankrupt ? t('已破产') : player.phase === 'rat-race' ? t('打工圈') : player.phase === 'fast-track' ? t('自由快道') : t('已完成')}</small></span>
                <ChevronDown className={expanded ? 'expanded' : ''} />
              </button>
              <div className="opponent-metrics">
                <span><small>{t('现金')}</small><strong>{money(player.cash)}</strong></span>
                <span><small>{t('被动 / 支出')}</small><strong>{money(player.passiveIncome)} / {money(totalExpenses(player))}</strong></span>
                <span><small>{player.phase === 'rat-race' ? t('出圈进度') : t('收入目标进度')}</small><strong>{progress}%</strong></span>
                <span><small>{t('状态')}</small><strong>{tx(playerStatusText(player))}</strong></span>
              </div>
              <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>
              {expanded && (
                <div className="opponent-details">
                  <dl>
                    <div><dt>{t('工资收入')}</dt><dd>{money(player.salary)}</dd></div>
                    <div><dt>{t('月现金流')}</dt><dd>{money(monthlyCashFlow(player))}</dd></div>
                    {fixedExpenses && <>
                      <div><dt>{t('税费')}</dt><dd>-{money(fixedExpenses.taxes)}</dd></div>
                      <div><dt>{t('住房贷款月供')}</dt><dd>-{money(fixedExpenses.mortgage)}</dd></div>
                      <div><dt>{t('教育 / 汽车 / 信用卡')}</dt><dd>-{money(fixedExpenses.educationLoan + fixedExpenses.carLoan + fixedExpenses.creditCard)}</dd></div>
                      <div><dt>{t('日常生活支出')}</dt><dd>-{money(fixedExpenses.living)}</dd></div>
                    </>}
                    <div><dt>{t('孩子支出（{count} 名）', { count: player.babies })}</dt><dd>-{money(childMonthlyExpenses(player))}</dd></div>
                    <div><dt>{t('银行贷款月供（10%）')}</dt><dd>-{money(player.bankLoan * 0.1)}</dd></div>
                    <div><dt>{t('总支出')}</dt><dd>-{money(totalExpenses(player))}</dd></div>
                    <div><dt>{t('梦想')}</dt><dd>{tn(player.dream)}</dd></div>
                  </dl>
                  <div className="opponent-assets">
                    <small>{t('资产与每月现金流')}</small>
                    <AssetList assets={player.assets} />
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Board({ game, mode, viewedPhase, onCommand }: { game: GameState; mode: DisplayMode; viewedPhase: 'rat-race' | 'fast-track'; onCommand: (command: GameCommand) => void }) {
  return (
    <div className="board-workspace">
      <TrackBoard
        game={game}
        phase={viewedPhase}
        guided={mode === 'guided'}
        decision={<Decision game={game} mode={mode} onCommand={onCommand} />}
      />
    </div>
  )
}

function TrackBoard({ game, phase, decision, guided }: { game: GameState; phase: 'rat-race' | 'fast-track'; decision: ReactNode; guided: boolean }) {
  const isFastTrack = phase === 'fast-track'
  const track = isFastTrack ? FAST_TRACK_BOARD : BOARD
  return (
    <section className={`track-panel ${isFastTrack ? 'fast-panel' : 'rat-panel'}`}>
      <header><strong>{isFastTrack ? t('自由快道') : t('打工圈')}</strong><span>{t('{count} 名玩家', { count: game.players.filter((player) => player.phase === phase).length })}</span></header>
      <div className={`board-grid ${isFastTrack ? 'fast-track-board' : ''}`} aria-label={isFastTrack ? t('自由快道') : t('打工圈')}>
        {track.map((space, index) => {
          const label = isFastTrack
            ? space === 'dream'
              ? tn(FAST_TRACK_DREAM_BY_POSITION[index])
              : t(fastTrackSpaceLabels[space as keyof typeof fastTrackSpaceLabels])
            : t(spaceLabels[space as SpaceType])
          const description = isFastTrack
            ? t(fastTrackSpaceDescriptions[space as keyof typeof fastTrackSpaceDescriptions])
            : t(spaceDescriptions[space as SpaceType])
          return (
            <div
              className={`board-space ${space} ${guided ? 'has-guide' : ''}`}
              key={`${space}-${index}`}
              title={guided ? undefined : label}
              tabIndex={guided ? 0 : undefined}
              aria-describedby={guided ? `space-guide-${phase}-${index}` : undefined}
            >
              <span>{label}</span>
              <div className="pieces">
                {game.players
                  .map((player, playerIndex) => ({ player, playerIndex }))
                  .filter(({ player }) => player.position === index && player.phase === phase)
                  .map(({ player, playerIndex }) => <PlayerAvatar player={player} index={playerIndex} size="tiny" key={player.id} />)}
              </div>
              {guided && (
                <span className="space-guide" id={`space-guide-${phase}-${index}`} role="tooltip">
                  <strong>{label}</strong>{description}
                </span>
              )}
            </div>
          )
        })}
        <div className="board-center">{decision}</div>
      </div>
    </section>
  )
}

function Activity({ game }: { game: GameState }) {
  return (
    <aside className="activity-panel">
      <Title title={t('事件记录')} note={t('最新在前')} />
      <div className="activity-list">
        {[...game.logs].reverse().map((entry) => {
          const playerIndex = game.players.findIndex((item) => item.id === entry.playerId)
          const player = game.players[playerIndex]
          return (
            <article className={`activity ${entry.tone}`} key={entry.id}>
              {player ? (
                <PlayerAvatar player={player} index={playerIndex} size="small" />
              ) : (
                <span className="system-avatar"><CircleDollarSign /></span>
              )}
              <div><strong>{player ? tn(player.name) : t('系统')}</strong><p>{formatLog(entry)}</p></div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}

function Decision({
  game,
  mode,
  onCommand,
}: {
  game: GameState
  mode: DisplayMode
  onCommand: (command: GameCommand) => void
}) {
  const [loanAmount, setLoanAmount] = useState(1000)
  const [upgradeAssetId, setUpgradeAssetId] = useState('')
  const [fastTrackBusinessId, setFastTrackBusinessId] = useState('')
  const [fastTrackInsurance, setFastTrackInsurance] = useState<'maintenance' | 'lawsuit'>('maintenance')
  const decision = game.pendingDecision
  const currentPlayer = game.players[game.currentPlayerIndex]
  const player = decision
    ? game.players.find((candidate) => candidate.id === decision.playerId) ?? currentPlayer
    : currentPlayer

  if (!player.isHuman) {
    return <div className="decision waiting"><Bot /><div><strong>{t('{name} 正在行动', { name: tn(player.name) })}</strong><p>{t('AI 的掷骰、购买和现金变化会记录在右侧。')}</p></div></div>
  }

  if (decision?.type === 'deal-choice') {
    return (
      <div className="decision deal">
        <span className="decision-icon"><HandCoins /></span>
        <div className="decision-copy"><small>{t('投资机会')}</small><h2>{t('选择一类交易')}</h2><p>{t('小生意投入较低；大买卖需要更多现金，但通常提供更高现金流。')}</p></div>
        <div className="decision-actions">
          <button className="secondary" onClick={() => onCommand({ type: 'DRAW_DEAL', actorId: player.id, dealSize: 'small' })}>{t('抽小生意')}</button>
          <button className="primary compact" onClick={() => onCommand({ type: 'DRAW_DEAL', actorId: player.id, dealSize: 'big' })}>{t('抽大买卖')}</button>
        </div>
      </div>
    )
  }

  if (decision?.type === 'opportunity') {
    const asset = decision.opportunity
    const shortfallLoan = Math.ceil(Math.max(0, asset.downPayment - player.cash) / 1000) * 1000
    const loanAvailable = shortfallLoan > 0 && canTakeLoan(player, shortfallLoan)
    return (
      <div className="decision deal">
        <span className="decision-icon"><HandCoins /></span>
        <div className="decision-copy">
          <small>{t('投资机会')} · {t(assetKindLabels[asset.kind ?? 'real-estate'])}</small><h2>{tn(asset.name)}</h2><p>{tn(asset.description)}</p>
          <div className="metrics">
            <span>{t('首付')}<strong>{money(asset.downPayment)}</strong></span>
            <span>{t('贷款')}<strong>{money(asset.mortgage)}</strong></span>
            <span>{t('月现金流')}<strong className="positive-text">+{money(asset.cashFlow)}</strong></span>
          </div>
          {mode === 'guided' && <p className="guide">{t('购买后保留 {amount} 现金。正现金流资产会持续提高被动收入。', { amount: money(player.cash - asset.downPayment) })}</p>}
        </div>
        <div className="decision-actions">
          <button className="secondary" onClick={() => onCommand({ type: 'PASS_OPPORTUNITY', actorId: player.id })}>{t('放弃')}</button>
          {shortfallLoan > 0 && <button className="loan" disabled={!loanAvailable} title={loanAvailable ? t('借款后仍需承担每月 10% 的银行贷款支出') : t('该贷款会使月现金流为负')} onClick={() => onCommand({ type: 'TAKE_LOAN', actorId: player.id, amount: shortfallLoan })}>{t('借款 {amount}', { amount: money(shortfallLoan) })}</button>}
          <button className="primary compact" disabled={player.cash < asset.downPayment} onClick={() => onCommand({ type: 'BUY_OPPORTUNITY', actorId: player.id })}>{t('购买')}</button>
        </div>
      </div>
    )
  }

  if (decision?.type === 'charity') {
    return (
      <div className="decision deal">
        <span className="decision-icon"><HeartPulse /></span>
        <div className="decision-copy"><small>{t('慈善')}</small><h2>{t('分享你的收入')}</h2><p>{t('捐赠 {amount}，未来三个回合可以使用双骰。', { amount: money(decision.donation) })}</p></div>
        <div className="decision-actions">
          <button className="secondary" onClick={() => onCommand({ type: 'CHOOSE_CHARITY', actorId: player.id, donate: false })}>{t('跳过')}</button>
          <button className="primary compact" onClick={() => onCommand({ type: 'CHOOSE_CHARITY', actorId: player.id, donate: true })}>{t('捐赠')}</button>
        </div>
      </div>
    )
  }

  if (decision?.type === 'market') {
    const asset = player.assets.find((candidate) => candidate.id === decision.assetId)
    const negotiationBonus = lawyerNegotiationBonus(player, decision.salePrice)
    const negotiatedSalePrice = decision.salePrice + negotiationBonus
    const netProceeds = asset ? negotiatedSalePrice - asset.mortgage : 0
    const costBasis = asset ? (asset.costPerUnit ?? asset.downPayment) * (asset.quantity ?? 1) : 0
    const profit = netProceeds - costBasis
    return (
      <div className="decision deal">
        <span className="decision-icon"><TrendingUp /></span>
        <div className="decision-copy"><small>{t('市场收购')}</small><h2>{tn(decision.assetName)}</h2><p>{t('市场成交价 {amount}', { amount: money(decision.salePrice) })}{(decision.levelPremium ?? 0) > 0 && <>{t('，L{level} 等级增值 ', { level: asset?.level ?? 1 })}<strong className="positive-text">+{money(decision.levelPremium ?? 0)}</strong></>}{negotiationBonus > 0 && <>{t('，合同谈判加成 ')}<strong className="positive-text">+{money(negotiationBonus)}</strong></>}{t('；成交款先扣除该资产抵押 {mortgage}，银行贷款不变，净收入 {net}。', { mortgage: money(asset?.mortgage ?? 0), net: money(netProceeds) })}{asset?.symbol && <strong className={profit >= 0 ? 'positive-text' : 'negative-text'}>{t(profit >= 0 ? ' 本次证券盈利 {amount}。' : ' 本次证券亏损 {amount}。', { amount: money(Math.abs(profit)) })}</strong>}{t('同类资产可逐项出售。')}</p></div>
        <div className="decision-actions">
          <button className="secondary" onClick={() => onCommand({ type: 'PASS_MARKET', actorId: player.id })}>{t('保留资产')}</button>
          <button className="primary compact" onClick={() => onCommand({ type: 'SELL_MARKET_ASSET', actorId: player.id })}>{t('出售一项')}</button>
        </div>
      </div>
    )
  }

  if (decision?.type === 'insolvency') {
    const shortfallLoan = Math.ceil(Math.abs(player.cash) / 1000) * 1000
    const loanAvailable = canTakeLoan(player, shortfallLoan)
    return (
      <div className="decision insolvency">
        <span className="decision-icon danger"><BanknoteArrowDown /></span>
        <div className="decision-copy">
          <small>{t('资不抵债处理')}</small><h2>{t('现金缺口 {amount}', { amount: money(Math.abs(player.cash)) })}</h2><p>{t(decision.reason as UiKey)}。{loanAvailable ? t('可以借款补足，') : t('继续借款会使月现金流为负，请')}{t('按首付 50% 清算资产，或宣布破产退出。')}</p>
          {player.assets.length > 0 && <div className="liquidation-actions">{groupAssets(player.assets).map((asset) => <button key={asset.id} onClick={() => onCommand({ type: 'LIQUIDATE_ASSET', actorId: player.id, assetId: asset.id })}>{t('清算 {asset}', { asset: tn(asset.name) })}{asset.count > 1 ? ` ×${asset.count}` : ''}{t(' · 回收 {amount}', { amount: money(asset.downPayment * 0.5) })}</button>)}</div>}
        </div>
        <div className="decision-actions">
          <button className="secondary danger-button" onClick={() => onCommand({ type: 'DECLARE_BANKRUPTCY', actorId: player.id })}>{t('宣布破产')}</button>
          <button className="primary compact" disabled={!loanAvailable} title={loanAvailable ? undefined : t('借款后的月现金流不能为负')} onClick={() => onCommand({ type: 'TAKE_LOAN', actorId: player.id, amount: shortfallLoan })}>{t('借款 {amount}', { amount: money(shortfallLoan) })}</button>
        </div>
      </div>
    )
  }

  if (decision?.type === 'fast-track-business') {
    return (
      <div className="decision deal fast-deal">
        <span className="decision-icon"><BriefcaseBusiness /></span>
        <div className="decision-copy"><small>{t('自由快道企业')}{decision.business.sector && ` · ${t(fastTrackSectorLabels[decision.business.sector])}`}</small><h2>{tn(decision.business.name)}</h2><p>{tn(decision.business.description)}</p><div className="metrics"><span>{t('价格')}<strong>{money(decision.business.cost)}</strong></span><span>{t('收益日收入')}<strong className="positive-text">+{money(decision.business.cashFlow)}</strong></span></div>{mode === 'guided' && <p className="guide">{t('持有至少两个不同产业后，全部自由快道企业获得 5% 收入协同。')}</p>}</div>
        <div className="decision-actions"><button className="secondary" onClick={() => onCommand({ type: 'PASS_FAST_TRACK_BUSINESS', actorId: player.id })}>{t('放弃')}</button><button className="primary compact" disabled={player.cash < decision.business.cost} onClick={() => onCommand({ type: 'BUY_FAST_TRACK_BUSINESS', actorId: player.id })}>{t('购买企业')}</button></div>
      </div>
    )
  }

  if (decision?.type === 'dream') {
    return (
      <div className="decision deal fast-deal">
        <span className="decision-icon"><Sparkles /></span>
        <div className="decision-copy"><small>{t('你的梦想')}</small><h2>{tn(decision.dream)}</h2><p>{t('支付 {amount} 实现梦想并立即赢得游戏。', { amount: money(decision.cost) })}</p></div>
        <div className="decision-actions"><button className="secondary" onClick={() => onCommand({ type: 'PASS_DREAM', actorId: player.id })}>{t('暂不实现')}</button><button className="primary compact" disabled={player.cash < decision.cost} onClick={() => onCommand({ type: 'BUY_DREAM', actorId: player.id })}>{t('实现梦想')}</button></div>
      </div>
    )
  }

  if (game.turnStage === 'awaiting-roll') {
    const upgradeableAssets = player.assets.filter((asset) => !asset.symbol && (asset.level ?? 1) < 3)
    const upgradeAssetLabels = new Map<string, string>()
    const upgradeNameCounts = new Map<string, number>()
    for (const asset of player.assets) {
      const count = (upgradeNameCounts.get(asset.name) ?? 0) + 1
      upgradeNameCounts.set(asset.name, count)
      upgradeAssetLabels.set(asset.id, `${tn(asset.name)}${player.assets.filter((candidate) => candidate.name === asset.name).length > 1 ? ` #${count}` : ''}`)
    }
    const selectedAssetId = upgradeableAssets.some((asset) => asset.id === upgradeAssetId) ? upgradeAssetId : upgradeableAssets[0]?.id ?? ''
    const selectedAsset = upgradeableAssets.find((asset) => asset.id === selectedAssetId)
    const upgradeCost = selectedAsset ? assetUpgradeCost(game, player, selectedAsset) : 0
    const reviewPayment = Math.min(player.bankLoan, Math.floor(Math.max(0, player.cash - 1000) / 1000) * 1000, 5000)
    const reviewRate = 10 + (currentEconomicCycle(game).id === 'high-interest' ? 10 : 0) + (player.profession === '会计师' ? 10 : 0)
    const reviewRelief = Math.min(Math.max(0, player.bankLoan - reviewPayment), Math.round(reviewPayment * reviewRate / 100 / 100) * 100)
    const expansionCost = fastTrackExpansionCost(player.fastTrackIncome)
    const expandedIncome = player.fastTrackIncome + FAST_TRACK_EXPANSION_GAIN
    const expansionLimitReached = (player.fastTrackExpansions ?? 0) >= FAST_TRACK_EXPANSION_LIMIT
    const dreamPreparation = player.dreamPreparation ?? 0
    const fastTrackBusinesses = player.fastTrackBusinesses ?? []
    const selectedFastTrackBusinessId = fastTrackBusinesses.some((business) => business.id === fastTrackBusinessId) ? fastTrackBusinessId : fastTrackBusinesses[0]?.id ?? ''
    const selectedFastTrackBusiness = fastTrackBusinesses.find((business) => business.id === selectedFastTrackBusinessId)
    const growthUpgradeCost = selectedFastTrackBusiness ? fastTrackUpgradeCost(selectedFastTrackBusiness, 'growth') : 0
    const resilienceUpgradeCost = selectedFastTrackBusiness ? fastTrackUpgradeCost(selectedFastTrackBusiness, 'resilience') : 0
    const growthUpgradeGain = selectedFastTrackBusiness ? Math.round(selectedFastTrackBusiness.cashFlow * FAST_TRACK_GROWTH_UPGRADE_RATE / 100) * 100 : 0
    const reinvestCost = selectedFastTrackBusiness ? fastTrackReinvestCost(fastTrackBusinesses, selectedFastTrackBusiness) : 0
    const reinvestGain = selectedFastTrackBusiness ? Math.round(selectedFastTrackBusiness.cashFlow * FAST_TRACK_REINVEST_RATE / 100) * 100 : 0
    const saleProceeds = selectedFastTrackBusiness ? fastTrackSaleProceeds(fastTrackBusinesses, selectedFastTrackBusiness) : 0
    const dreamStartingIncome = fastTrackStartingIncome(player)
    const dreamCost = game.setup.fastTrackBalanceVersion === 'accelerated'
      ? fastTrackDreamCost(player.dream, dreamStartingIncome)
      : game.setup.fastTrackBalanceVersion === 'income-scaled'
        ? fastTrackDreamCost(player.dream, dreamStartingIncome, 24)
        : FAST_TRACK_DREAM_COSTS[player.dream]
    const jobLossCoverage = Math.round(insuranceCoverageRate(player, 'job-loss') * 100)
    const fastTrackInsuranceCoverage = Math.round(insuranceCoverageRate(player, fastTrackInsurance) * 100)
    const actionUsed = player.phase === 'fast-track' ? player.fastTrackStrategyUsed : player.strategyActionUsed
    return (
      <div className="decision ready">
        <div className="ready-heading" tabIndex={mode === 'guided' ? 0 : undefined}><small>{t('第 {turn} 轮', { turn: game.turn })}{game.setup.strategyRulesVersion === 'strategy-v1' && ` · ${tn(currentEconomicCycle(game).name)}`}</small><h2>{game.setup.strategyRulesVersion === 'strategy-v1' ? actionUsed ? t('策略已执行，可以前进') : t('先经营，或直接前进') : t('准备前进')}</h2>{mode === 'guided' && <span className="strategy-heading-tooltip" role="tooltip">{game.setup.strategyRulesVersion === 'strategy-v1' ? t('{cycle} 每回合最多执行一项策略，之后仍可掷骰。', { cycle: tn(currentEconomicCycle(game).description) }) : t('经过发薪日会立即结算月现金流，停靠格随后生效。')}</span>}</div>
        <div className="turn-actions">
          {game.setup.strategyRulesVersion === 'strategy-v1' && player.phase === 'rat-race' && <div className="strategy-actions">
            <label className="strategy-control" tabIndex={0}><select aria-label={t('选择升级资产')} value={selectedAssetId} disabled={actionUsed || upgradeableAssets.length === 0} onChange={(event) => setUpgradeAssetId(event.target.value)}><option value="">{player.assets.length === 0 ? t('暂无资产') : t('没有可升级资产')}</option>{upgradeableAssets.map((asset) => <option key={asset.id} value={asset.id}>{upgradeAssetLabels.get(asset.id)} · {t(assetKindLabels[asset.kind ?? 'real-estate'])} · L{asset.level ?? 1} · {t('{amount}/月', { amount: money(asset.cashFlow) })}</option>)}</select><button aria-describedby="upgrade-help" disabled={actionUsed || !selectedAssetId} onClick={() => onCommand({ type: 'UPGRADE_ASSET', actorId: player.id, assetId: selectedAssetId })}><Wrench />{upgradeCost > 0 ? t('升级 {amount}', { amount: money(upgradeCost) }) : t('升级')}</button><span id="upgrade-help" className="strategy-tooltip" role="tooltip">{selectedAsset ? t('{kind}“{asset}”从 L{from} 升到 L{to} 需 {cost}；当前现金流 {cashflow}/月，每级增加基础月现金流的 50%。{shortfall}', {
              kind: t(assetKindLabels[selectedAsset.kind ?? 'real-estate']),
              asset: upgradeAssetLabels.get(selectedAsset.id) ?? '',
              from: selectedAsset.level ?? 1,
              to: (selectedAsset.level ?? 1) + 1,
              cost: money(upgradeCost),
              cashflow: money(selectedAsset.cashFlow),
              shortfall: player.cash < upgradeCost ? t(' 当前还差 {amount}。', { amount: money(upgradeCost - player.cash) }) : '',
            }) : t('先购买企业或房地产等非证券资产；股票、基金和存单不能升级。')}</span></label>
            <span className="strategy-control" tabIndex={0}><button aria-describedby="insurance-help" disabled={actionUsed || Boolean(player.insurance)} onClick={() => onCommand({ type: 'BUY_INSURANCE', actorId: player.id, insurance: 'job-loss' })}><ShieldCheck />{t('失业保险')}</button><span id="insurance-help" className="strategy-tooltip" role="tooltip">{t('打工圈只有失业事件：保险承担 {rate}% 的一个月总支出，但仍跳过 2 回合，理赔后自动消耗。维护险和诉讼险在进入自由快道后通过风控购买。', { rate: jobLossCoverage })}</span></span>
            <span className="strategy-control" tabIndex={0}><button aria-describedby="review-help" disabled={actionUsed || player.bankLoan <= 0} onClick={() => onCommand({ type: 'FINANCIAL_REVIEW', actorId: player.id })}><Calculator />{t('财务整理')}</button><span id="review-help" className="strategy-tooltip" role="tooltip">{t('本次偿还 {payment}，减免比例 {rate}%（基础 10%{accountant}{cycle}），预计减免 {relief}。', {
              payment: money(reviewPayment),
              rate: reviewRate,
              accountant: player.profession === '会计师' ? t(' + 会计师 10 个百分点') : '',
              cycle: currentEconomicCycle(game).id === 'high-interest' ? t(' + 高利率周期 10 个百分点') : '',
              relief: money(reviewRelief),
            })}{reviewPayment > 0 && reviewRelief === 0 ? t('偿还后贷款已结清，因此没有可减免的剩余贷款。') : t('减免额按 $100 取整，并受剩余贷款上限限制。')}</span></span>
          </div>}
          {game.setup.strategyRulesVersion === 'strategy-v1' && player.phase === 'fast-track' && <div className="strategy-actions fast-strategy-actions">
            <label className="strategy-control" tabIndex={0}><select aria-label={t('选择自由快道企业')} value={selectedFastTrackBusinessId} disabled={actionUsed || fastTrackBusinesses.length === 0} onChange={(event) => setFastTrackBusinessId(event.target.value)}><option value="">{t('暂无企业')}</option>{fastTrackBusinesses.map((business) => <option key={business.id} value={business.id}>{tn(business.name)} · {business.sector ? t(fastTrackSectorLabels[business.sector]) : t('未分类')} · {money(business.cashFlow)}</option>)}</select><button disabled={actionUsed || !selectedFastTrackBusiness || Boolean(selectedFastTrackBusiness.upgrade) || player.cash < growthUpgradeCost} onClick={() => selectedFastTrackBusiness && onCommand({ type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: player.id, businessId: selectedFastTrackBusiness.id, branch: 'growth' })}>{t('规模化')}</button><button disabled={actionUsed || !selectedFastTrackBusiness || Boolean(selectedFastTrackBusiness.upgrade) || player.cash < resilienceUpgradeCost} onClick={() => selectedFastTrackBusiness && onCommand({ type: 'FAST_TRACK_UPGRADE_BUSINESS', actorId: player.id, businessId: selectedFastTrackBusiness.id, branch: 'resilience' })}>{t('韧性化')}</button><span className="strategy-tooltip" role="tooltip">{t('每家企业只能选择一次分支。规模化支付 {growthCost}，该企业收入提高 50%（+{growthGain}）；韧性化支付 {resilienceCost}，所有自由快道风险损失降低 25%，多家最高叠加到 75%。', { growthCost: money(growthUpgradeCost), growthGain: money(growthUpgradeGain), resilienceCost: money(resilienceUpgradeCost) })}</span></label>
            <span className="strategy-control" tabIndex={0}><button disabled={actionUsed || !selectedFastTrackBusiness || (selectedFastTrackBusiness.reinvestments ?? 0) >= FAST_TRACK_REINVEST_LIMIT || player.cash < reinvestCost} onClick={() => selectedFastTrackBusiness && onCommand({ type: 'FAST_TRACK_REINVEST', actorId: player.id, businessId: selectedFastTrackBusiness.id })}>{t('再投资')}</button><button disabled={actionUsed || !selectedFastTrackBusiness} onClick={() => selectedFastTrackBusiness && onCommand({ type: 'FAST_TRACK_SELL_BUSINESS', actorId: player.id, businessId: selectedFastTrackBusiness.id })}>{t('出售企业')}</button><span className="strategy-tooltip" role="tooltip">{t('再投资立即支付 {reinvestCost}，该企业收入提高 25%（+{reinvestGain}），每家最多 {limit} 次；多产业协同使成本降低 20%。出售企业立即回收 {proceeds}，并失去该企业全部 {income} 收入；多产业协同使回收率从 70% 提高到 80%。', { reinvestCost: money(reinvestCost), reinvestGain: money(reinvestGain), limit: FAST_TRACK_REINVEST_LIMIT, proceeds: money(saleProceeds), income: money(selectedFastTrackBusiness?.cashFlow ?? 0) })}</span></span>
            <span className="strategy-control" tabIndex={0}><button aria-describedby="expand-help" disabled={actionUsed || expansionLimitReached || player.cash < expansionCost} onClick={() => onCommand({ type: 'FAST_TRACK_EXPAND', actorId: player.id })}><TrendingUp />{t('扩张 {count}/{limit}', { count: player.fastTrackExpansions ?? 0, limit: FAST_TRACK_EXPANSION_LIMIT })}</button><span id="expand-help" className="strategy-tooltip" role="tooltip">{t('本局最多扩张 {limit} 次。支付 {cost}，收益日收入固定增加 {gain}，从 {from} 提升到 {to}。', { limit: FAST_TRACK_EXPANSION_LIMIT, cost: money(expansionCost), gain: money(FAST_TRACK_EXPANSION_GAIN), from: money(player.fastTrackIncome), to: money(expandedIncome) })}{expansionLimitReached ? t('扩张次数已用完，请通过购买自由快道企业继续增加收入。') : expandedIncome >= player.fastTrackGoal ? t('本次扩张会立即达到收入目标。') : t('扩张后距离收入目标还差 {amount}，仍需购买自由快道企业或恢复受损收入。', { amount: money(player.fastTrackGoal - expandedIncome) })}{!expansionLimitReached && player.cash < expansionCost ? t(' 当前现金还差 {amount}。', { amount: money(expansionCost - player.cash) }) : !expansionLimitReached ? t('执行后仍可掷骰。') : ''}</span></span>
            <label className="strategy-control" tabIndex={0}><select aria-label={t('选择自由快道保险')} value={fastTrackInsurance} disabled={actionUsed || Boolean(player.insurance)} onChange={(event) => setFastTrackInsurance(event.target.value as typeof fastTrackInsurance)}><option value="maintenance">{t('维护')}</option><option value="lawsuit">{t('诉讼')}</option></select><button aria-describedby="risk-help" disabled={actionUsed || Boolean(player.insurance) || player.cash < 25000} onClick={() => onCommand({ type: 'FAST_TRACK_MANAGE_RISK', actorId: player.id, insurance: fastTrackInsurance })}><ShieldCheck />{t('风控')}</button><span id="risk-help" className="strategy-tooltip" role="tooltip">{t(fastTrackInsurance === 'maintenance' ? '支付 {cost} 获得维护保险；下一次重大维护损失由保险承担 {rate}% 后自动消耗。' : '支付 {cost} 获得诉讼保险；下一次商业诉讼损失由保险承担 {rate}% 后自动消耗。', { cost: money(25000), rate: fastTrackInsuranceCoverage })}{player.insurance ? t('当前已有保险，不能重复配置。') : player.cash < 25000 ? t(' 当前现金还差 {amount}。', { amount: money(25000 - player.cash) }) : t('根据想防范的风险选择保险；执行后仍可掷骰。')}</span></label>
            <span className="strategy-control" tabIndex={0}><button aria-describedby="dream-preparation-help" disabled={actionUsed || dreamPreparation >= 3 || player.cash < 50000} onClick={() => onCommand({ type: 'FAST_TRACK_PREPARE_DREAM', actorId: player.id })}><Flag />{t('梦想准备 {level}/3', { level: dreamPreparation })}</button><span id="dream-preparation-help" className="strategy-tooltip" role="tooltip">{t('每次支付 {cost} 增加 1 层。达到 3/3 不会直接获胜，只会解锁“移动途中经过自己的梦想格也可购买”，不再要求精确停留。触发后仍须支付梦想“{dream}”的价格 {price}。', { cost: money(50000), dream: tn(player.dream), price: money(dreamCost) })}{dreamPreparation >= 3 ? player.cash >= dreamCost ? t('准备已完成；经过梦想格时可选择支付并获胜。') : t('准备已完成；当前购买梦想还差 {amount}。', { amount: money(dreamCost - player.cash) }) : player.cash < 50000 ? t('当前推进准备还差 {amount}。', { amount: money(50000 - player.cash) }) : t('执行后仍可掷骰。')}</span></span>
          </div>}
          {player.charityTurns > 0 && player.phase === 'rat-race' ? <div className="dice-options"><button className="roll secondary" onClick={() => onCommand({ type: 'ROLL_DICE', actorId: player.id, diceCount: 1 })}><Dice5 />{t('1 骰')}</button><button className="roll" onClick={() => onCommand({ type: 'ROLL_DICE', actorId: player.id, diceCount: 2 })}><Dice5 />{t('2 骰')}</button></div> : <button className="roll" onClick={() => onCommand({ type: 'ROLL_DICE', actorId: player.id })}><Dice5 />{t('掷骰子')}</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="decision ready">
      <div><small>{t('行动已完成')}</small><h2>{t('查看本回合结果')}</h2><p>{t('确认现金与事件记录后，轮到下一位玩家。')}</p></div>
      <div className="turn-actions">
        {player.phase === 'rat-race' && player.bankLoan > 0 && <div className="bank-controls"><Landmark /><input aria-label={t('还款金额')} type="number" min="1000" step="1000" value={loanAmount} onChange={(event) => setLoanAmount(Math.max(1000, Math.floor(Number(event.target.value) / 1000) * 1000 || 1000))} /><button className="loan" disabled={loanAmount > player.cash || loanAmount > player.bankLoan} onClick={() => onCommand({ type: 'REPAY_LOAN', actorId: player.id, amount: loanAmount })}>{t('还款')}</button></div>}
        <button className="primary compact" onClick={() => onCommand({ type: 'END_TURN', actorId: player.id })}>{t('结束回合')}<ChevronRight /></button>
      </div>
    </div>
  )
}

export default App
