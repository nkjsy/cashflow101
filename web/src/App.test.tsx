// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createGame, executeCommand, totalExpenses } from './game-core/engine'
import { chooseAutoplayCommand } from './simulation/simulator'
import { setLanguage } from './i18n'
import { platform, resetAdPacing, setPlatform } from './platform'

const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }))
vi.mock('./game-audio', () => ({ GameAudio: class { play = playSound; unlock = vi.fn() } }))

describe('cashflow app', () => {
  beforeEach(() => {
    localStorage.clear()
    setLanguage('zh')
    playSound.mockClear()
  })
  afterEach(cleanup)

  it('starts a guided or standard game with one to three AI opponents', () => {
    const { container } = render(<App />)

    expect(screen.getByRole('button', { name: /引导模式/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /标准模式/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('选择职业'), { target: { value: '医生' } })
    expect(screen.getByRole('img', { name: '医生职业雷达图，越靠外越有利' })).toBeInTheDocument()
    expect(screen.getByText('收入很高，但教育贷款和固定支出压力最大。')).toBeInTheDocument()
    expect(screen.getByText('失业保险理赔比例从 50% 提高到 75%。')).toBeInTheDocument()
    expect(screen.queryByLabelText('选择长期目标')).not.toBeInTheDocument()
    expect(screen.getByText(/开始新游戏后从三类配置、三级资产、无贷经营中随机揭晓/)).toBeInTheDocument()
    expect(screen.getByText('US$1,600')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '3 名' }))
    fireEvent.click(screen.getByRole('button', { name: '专家' }))
    fireEvent.change(screen.getByLabelText('AI 1 性格'), { target: { value: 'aggressive' } })
    expect(screen.getByText(/保留约 0.35 个月支出/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /开始新游戏/ }))

    expect(screen.getByText('AI 对手公开财务')).toBeInTheDocument()
    const soundButton = screen.getByTitle('关闭游戏音效')
    expect(soundButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(soundButton)
    expect(screen.getByTitle('开启游戏音效')).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('cashflow-lab-sound')).toBe('off')
    expect(screen.getAllByText('医生').length).toBeGreaterThan(0)
    expect(screen.getByText('林晓')).toBeInTheDocument()
    expect(screen.getByText('周远')).toBeInTheDocument()
    expect(screen.getByText('陈禾')).toBeInTheDocument()
    expect(screen.getAllByText(/AI · (保守型|均衡型|进取型)/)).toHaveLength(3)
    const savedGame = JSON.parse(localStorage.getItem('cashflow-lab-save-v1') ?? '{}')
    const savedSetup = savedGame.setup
    expect(savedSetup?.aiDifficulty).toBe('expert')
    expect(savedSetup?.aiPersonalities[0]).toBe('aggressive')
    expect(['diversified', 'master-asset', 'debt-free']).toContain(savedSetup?.longTermGoal)
    expect(savedGame.players[0].longTermGoal).toBe(savedSetup?.longTermGoal)
    expect(container.querySelectorAll('.space-guide')).toHaveLength(24)
    expect(screen.getAllByText(/抽取小买卖或大买卖/)).toHaveLength(12)
    expect(screen.getAllByText('机会', { selector: '.board-space span' })).toHaveLength(12)
    expect(screen.getAllByText('被动 / 支出', { exact: true })).toHaveLength(3)
    expect(screen.getAllByText('出圈进度', { exact: true })).toHaveLength(3)
    expect(screen.getAllByText('状态', { exact: true })).toHaveLength(3)
    expect(screen.getAllByLabelText(/，教师|，工程师|，护士|，维修技师|，会计师|，警员|，医生|，律师/).length).toBeGreaterThan(0)
    expect(screen.queryByText('住房贷款月供')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /总支出/ }))
    expect(screen.getByText('住房贷款月供')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /林晓/ }))

    expect(screen.getAllByText('工资收入').length).toBeGreaterThan(1)
    expect(screen.getByText('月现金流')).toBeInTheDocument()
    expect(screen.getAllByText('银行贷款月供（10%）').length).toBeGreaterThan(1)
    expect(screen.getByText('梦想')).toBeInTheDocument()
  }, 10000)

  it('ranks every player when the game ends', () => {
    const game = createGame(2, 42)
    game.winnerId = game.players[1].id
    game.players[1].phase = 'finished'
    game.players[2].bankrupt = true
    game.players[2].phase = 'finished'
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    const rows = [...container.querySelectorAll('.final-standing > div')]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('#1')
    expect(rows[0]).toHaveTextContent(game.players[1].name)
    expect(rows[0]).toHaveTextContent(/\d+[SABCD] 级 · 100 分/)
    expect(rows[0]).toHaveTextContent('阶段进展')
    expect(rows[0]).toHaveTextContent('现金流质量')
    expect(rows[0]).toHaveTextContent('资产经营')
    expect(rows[0]).toHaveTextContent('财务韧性')
    expect(rows[0]).toHaveTextContent('目标成就')
    expect(rows[2]).toHaveTextContent('#3')
    expect(rows[2]).toHaveTextContent(game.players[2].name)
    expect(container.querySelectorAll('.final-score-breakdown')).toHaveLength(3)
  })

  it('only renders board-space explanations in guided mode', () => {
    const game = createGame(1, 42)
    game.players[0].phase = 'fast-track'
    game.players[0].fastTrackIncome = 300000
    game.players[0].fastTrackGoal = 350000
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))
    localStorage.setItem('cashflow-lab-mode', 'standard')

    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    expect(container.querySelectorAll('.space-guide')).toHaveLength(0)
    expect(container.querySelectorAll('.board-space[tabindex="0"]')).toHaveLength(0)
    expect(screen.queryByText('收益日收入计算')).not.toBeInTheDocument()
    expect(screen.queryByText(/工资和每月现金流不参与/)).not.toBeInTheDocument()
  })

  it('shows purchased Fast Track businesses as separate holdings', () => {
    const game = createGame(1, 42)
    const player = game.players[0]
    player.phase = 'fast-track'
    player.fastTrackIncome = 314000
    player.fastTrackGoal = 350000
    player.fastTrackBusinesses = [{
      id: 'fast-track-clean-energy',
      name: '社区清洁能源网络',
      description: '测试企业',
      cost: 180000,
      cashFlow: 14000,
      sector: 'infrastructure',
    }]
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    expect(screen.getByText('自由快道企业', { selector: '.section-title span' })).toBeInTheDocument()
    expect(screen.getByText('社区清洁能源网络')).toBeInTheDocument()
    expect(screen.getByText('+US$14,000/收益日')).toBeInTheDocument()
    expect(screen.getByText('1 项持有')).toBeInTheDocument()
    expect(screen.getByText('基础设施')).toBeInTheDocument()
  })

  it('merges duplicate assets and displays their quantity', () => {
    const game = createGame(1, 42)
    const asset = {
      id: 'asset-neighborhood-laundry',
      name: '社区洗衣店',
      downPayment: 4000,
      mortgage: 16000,
      cashFlow: 240,
    }

    game.players[0].assets = [asset, asset]
    game.players[0].passiveIncome = 480
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    expect(screen.getByText('社区洗衣店')).toBeInTheDocument()
    expect(screen.getByText('×2')).toBeInTheDocument()
    expect(screen.getByText('+US$480/月')).toBeInTheDocument()
    expect(screen.getByText('抵押 US$32,000')).toBeInTheDocument()
  })

  it('plays distinct dice and market sounds when landing on Market', () => {
    const game = createGame(1, 1972)
    game.currentPlayerIndex = 0
    game.turnStage = 'awaiting-roll'
    game.players[0].position = 5
    game.seed = 42
    game.marketDeck = ['market-laundry']
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))
    fireEvent.click(screen.getByRole('button', { name: /掷骰子/ }))

    expect(playSound).toHaveBeenCalledWith('dice')
    expect(playSound).toHaveBeenCalledWith('market', 0.27)
  })

  it('continues an AI Market response during the human turn', async () => {
    const game = createGame(1, 42)
    const ai = game.players[1]
    const asset = {
      id: 'asset-neighborhood-laundry',
      name: '社区洗衣店',
      kind: 'business' as const,
      downPayment: 4000,
      mortgage: 16000,
      cashFlow: 240,
    }
    game.currentPlayerIndex = 0
    game.turnStage = 'awaiting-decision'
    ai.assets = [asset]
    ai.passiveIncome = asset.cashFlow
    game.pendingDecision = {
      type: 'market',
      playerId: ai.id,
      assetId: asset.id,
      assetName: asset.name,
      salePrice: 40000,
      cardId: 'market-laundry',
      responderIds: [ai.id],
    }
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))
    expect(screen.getByText(`${ai.name} 正在行动`)).toBeInTheDocument()

    await waitFor(() => {
      const savedGame = JSON.parse(localStorage.getItem('cashflow-lab-save-v1')!)
      expect(savedGame.pendingDecision).toBeNull()
      expect(savedGame.players[1].assets).toHaveLength(0)
    }, { timeout: 2500 })
  })

  it('celebrates entering the Fast Track before play continues', () => {
    const game = createGame(1, 42)
    const player = game.players[0]
    game.currentPlayerIndex = 0
    player.cash = 10000
    player.passiveIncome = totalExpenses(player) - 100
    game.pendingDecision = {
      type: 'opportunity',
      playerId: player.id,
      opportunity: {
        id: 'asset-fast-track-test',
        name: '出圈测试资产',
        description: '购买后进入自由快道。',
        downPayment: 1000,
        mortgage: 4000,
        cashFlow: 240,
      },
    }
    game.turnStage = 'awaiting-decision'
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))
    fireEvent.click(screen.getByRole('button', { name: '购买' }))

    expect(screen.getByRole('dialog', { name: '你进入了自由快道！' })).toBeInTheDocument()
    expect(screen.getByText('财务自由达成')).toBeInTheDocument()
    expect(screen.getByText(player.dream)).toBeInTheDocument()
    expect(screen.getByText('起始收入计算')).toBeInTheDocument()
    expect(screen.getByText(/只使用退出时的被动收入/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '驶入自由快道' }))
    expect(screen.queryByRole('dialog', { name: '你进入了自由快道！' })).not.toBeInTheDocument()
    expect(screen.getByText(`我的梦想：${player.dream}`)).toBeInTheDocument()
    expect(screen.getByText(`梦想：${player.dream}`)).toBeInTheDocument()
    const formulaButton = screen.getByRole('button', { name: '收益日收入计算方式' })
    expect(formulaButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(formulaButton)
    expect(formulaButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('收益日收入计算')).toBeInTheDocument()
    expect(screen.getByText('被动收入取整到最近千位；工资和每月现金流不参与。')).toBeInTheDocument()
  })

  it('explains Fast Track expansion and risk management with current values', () => {
    const game = createGame(1, 42)
    const player = game.players[0]
    game.currentPlayerIndex = 0
    player.phase = 'fast-track'
    player.cash = 200000
    player.fastTrackIncome = 120000
    player.fastTrackGoal = 150000
    player.insurance = 'job-loss'
    player.fastTrackBusinesses = [{ id: 'software', name: '企业软件服务平台', description: '测试企业', cost: 360000, cashFlow: 20000, sector: 'technology' }]
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    expect(screen.getByRole('button', { name: '扩张 0/3' })).toHaveAttribute('aria-describedby', 'expand-help')
    expect(screen.getByRole('combobox', { name: '选择自由快道企业' })).toHaveValue('software')
    expect(screen.getByRole('button', { name: '规模化' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '韧性化' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '再投资' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '出售企业' })).toBeEnabled()
    expect(screen.getByText(/最多扩张 3 次.*支付 US\$60,000.*固定增加 US\$6,000.*提升到 US\$126,000.*还差 US\$24,000.*仍需购买自由快道企业/)).toHaveClass('strategy-tooltip')
    expect(screen.getByRole('button', { name: '风控' })).toBeEnabled()
    expect(screen.queryByText('失业保险')).not.toBeInTheDocument()
    expect(screen.getByText(/支付 US\$25,000 获得维护保险.*重大维护损失由保险承担 50%.*执行后仍可掷骰/)).toHaveClass('strategy-tooltip')
    expect(screen.getByRole('button', { name: '梦想准备 0/3' })).toHaveAttribute('aria-describedby', 'dream-preparation-help')
    expect(screen.getByText(/达到 3\/3 不会直接获胜.*经过自己的梦想格也可购买.*仍须支付梦想/)).toHaveClass('strategy-tooltip')
    fireEvent.change(screen.getByLabelText('选择自由快道保险'), { target: { value: 'lawsuit' } })
    expect(screen.getByText(/支付 US\$25,000 获得诉讼保险.*商业诉讼损失由保险承担 50%/)).toHaveClass('strategy-tooltip')
    fireEvent.click(screen.getByRole('button', { name: '风控' }))
    expect(screen.getByText(/获得诉讼保险/, { selector: '.activity p' })).toBeInTheDocument()
  })

  it('describes profession differences from the player avatar', () => {
    const game = createGame(1, 42)
    game.currentPlayerIndex = 0
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    fireEvent.focus(screen.getAllByLabelText(`你，${game.players[0].profession}`)[0])

    expect(screen.getAllByText(game.players[0].profession).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/升级成本降低|保险理赔|财务整理的减免比例/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('选择升级资产')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '失业保险' })).toBeInTheDocument()
    expect(screen.getByText('先经营，或直接前进').closest('.ready-heading')).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/先购买企业或房地产等非证券资产/)).toHaveClass('strategy-tooltip')
    expect(screen.getByText(/打工圈只有失业事件.*维护险和诉讼险在进入自由快道后通过风控购买/)).toHaveClass('strategy-tooltip')
    expect(screen.getByText(/减免比例 10%.*减免额按 \$100 取整/)).toHaveClass('strategy-tooltip')
    expect(screen.queryByRole('button', { name: '借款' })).not.toBeInTheDocument()
  })

  it('shows asset types and upgrades the selected asset from the central controls', () => {
    const game = createGame(1, 42)
    const player = game.players[0]
    game.currentPlayerIndex = 0
    player.cash = 10000
    player.longTermGoal = 'diversified'
    player.assets = [{ id: 'upgrade-ui', name: '测试咖啡店', kind: 'business', downPayment: 3000, mortgage: 0, cashFlow: 500, baseCashFlow: 500, level: 1 }]
    player.passiveIncome = 500
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    expect(screen.getAllByText('企业').length).toBeGreaterThan(0)
    expect(screen.getByText('目标：三类配置')).toBeInTheDocument()
    expect(screen.getByText(/任意三种资产类型/)).toHaveClass('summary-tooltip')
    expect(screen.getByLabelText('选择升级资产')).toHaveDisplayValue('测试咖啡店 · 企业 · L1 · US$500/月')
    const upgradeButton = screen.getByRole('button', { name: /升级 US\$/ })
    expect(upgradeButton).toBeEnabled()

    fireEvent.click(upgradeButton)

    expect(screen.getByRole('alert')).toHaveTextContent(/升级 测试咖啡店 至 2 级/)
    expect(screen.getByText('L2')).toBeInTheDocument()
    expect(screen.getByText('+US$750/月')).toBeInTheDocument()
  })

  it('confirms financial review above the game surface', () => {
    const game = createGame(1, 42)
    const player = game.players[0]
    game.currentPlayerIndex = 0
    player.profession = '会计师'
    player.cash = 10000
    player.bankLoan = 10000
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))
    expect(screen.getByText(/减免比例 20%（基础 10% \+ 会计师 10 个百分点）.*预计减免 US\$1,000/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '财务整理' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/财务整理偿还.*额外减免 \$1,000/)
    expect(screen.getByRole('alert')).toHaveClass('success')
  })

  it('explains zero financial-review relief when repayment clears the loan', () => {
    const game = createGame(1, 42)
    const player = game.players[0]
    game.currentPlayerIndex = 0
    player.cash = 2000
    player.bankLoan = 1000
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    expect(screen.getByText(/预计减免 US\$0.*偿还后贷款已结清，因此没有可减免的剩余贷款/)).toBeInTheDocument()
  })

  it('continues with AI turns when the bankrupt human chooses to spectate', async () => {
    const game = createGame(2, 42)
    game.players[0].cash = -500
    game.pendingDecision = {
      type: 'insolvency',
      playerId: 'player-human',
      reason: '测试强制付款',
    }
    game.turnStage = 'awaiting-decision'
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续上次游戏/ }))

    fireEvent.click(screen.getByRole('button', { name: '宣布破产' }))

    expect(screen.getByRole('dialog', { name: '你的现金流无法继续维持' })).toBeInTheDocument()
    expect(screen.getByText(/破产会淘汰当前玩家/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始新游戏' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续旁观' }))

    expect(screen.queryByRole('dialog', { name: '你的现金流无法继续维持' })).not.toBeInTheDocument()
    await waitFor(() => {
      const savedGame = JSON.parse(localStorage.getItem('cashflow-lab-save-v1')!)
      expect(savedGame.currentPlayerIndex).not.toBe(0)
    }, { timeout: 2500 })
  })
})
describe('English app', () => {
  const visibleChinese = () =>
    (document.body.textContent ?? '').replace('中文', '').match(/[一-鿿]+/g) ?? []

  const autoplay = (game: ReturnType<typeof createGame>, steps: number) => {
    let state = game
    for (let step = 0; step < steps && !state.winnerId; step += 1) {
      const result = executeCommand(state, chooseAutoplayCommand(state))
      if (!result.ok) break
      state = result.state
    }
    return state
  }

  beforeEach(() => {
    localStorage.clear()
    setLanguage('en')
    playSound.mockClear()
  })
  afterEach(cleanup)

  it('sets up and starts a quick game without any Chinese on screen', () => {
    render(<App />)

    expect(visibleChinese()).toEqual([])
    expect(screen.getByRole('button', { name: 'Quick · ~12 min' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Choose profession'), { target: { value: '医生' } })
    expect(screen.getByText('Very high income, but the heaviest student loans and fixed costs.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start new game/ }))

    expect(screen.getByText('AI rivals’ public finances')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('cashflow-lab-save-v1') ?? '{}').setup.pace).toBe('quick')
    expect(visibleChinese()).toEqual([])
  })

  it('switches language in place and remembers it', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '中文' }))
    expect(screen.getByRole('button', { name: /开始新游戏/ })).toBeInTheDocument()
    expect(localStorage.getItem('cashflow-lab-lang')).toBe('zh')
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('button', { name: /Start new game/ })).toBeInTheDocument()
  })

  it('shows a played-out game, its log and final ranking in English', () => {
    const midGame = autoplay(createGame(3, 21), 400)
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(midGame))
    const { unmount } = render(<App />)
    expect(visibleChinese()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Continue last game/ }))
    expect(screen.getByText('Event log')).toBeInTheDocument()
    expect(visibleChinese()).toEqual([])
    unmount()

    const humanFreedomLaneTurn = (state: ReturnType<typeof createGame>) =>
      state.players[0].phase === 'fast-track' && (state.players[0].fastTrackTurns ?? 0) >= 2 && state.currentPlayerIndex === 0 && state.turnStage === 'awaiting-roll'
    let freedomLaneTurn = createGame(1, 1)
    for (let seed = 1; seed <= 20 && !humanFreedomLaneTurn(freedomLaneTurn); seed += 1) {
      freedomLaneTurn = createGame(1, seed, undefined, undefined, 'standard', undefined, 'scaled-equity', 'accelerated', 'global-v2', 'strategy-v1', undefined, 'quick')
      for (let step = 0; step < 4000 && !humanFreedomLaneTurn(freedomLaneTurn); step += 1) {
        const result = executeCommand(freedomLaneTurn, chooseAutoplayCommand(freedomLaneTurn))
        if (!result.ok || result.state.winnerId) break
        freedomLaneTurn = result.state
      }
    }
    expect(humanFreedomLaneTurn(freedomLaneTurn)).toBe(true)
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(freedomLaneTurn))
    const freedomLane = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Continue last game/ }))
    expect(screen.getByRole('button', { name: /Risk Cover/ })).toBeInTheDocument()
    expect(visibleChinese()).toEqual([])
    freedomLane.unmount()

    const finished = autoplay(midGame, 6000)
    expect(finished.winnerId).not.toBeNull()
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(finished))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Continue last game/ }))
    expect(screen.getByText('Game over')).toBeInTheDocument()
    expect(visibleChinese()).toEqual([])
  })
})

describe('portal integration', () => {
  const webPlatform = platform()
  const createFakePortal = () => {
    const fake = {
      name: 'crazygames' as const,
      ads: 0,
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      loadingStop: vi.fn(),
      showMidgameAd: async (hooks: { onStart: () => void }) => {
        fake.ads += 1
        hooks.onStart()
        return 'shown' as const
      },
      isMuted: () => false,
      onMuteChange: () => () => {},
    }
    return fake
  }

  beforeEach(() => {
    localStorage.clear()
    setLanguage('en')
    playSound.mockClear()
  })
  afterEach(() => {
    cleanup()
    setPlatform(webPlatform)
    resetAdPacing()
  })

  it('reports gameplay and only shows ads between games, never before the first one', async () => {
    const portal = createFakePortal()
    setPlatform(portal)
    resetAdPacing(0)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Start new game/ }))
    expect(screen.getByText('Event log')).toBeInTheDocument()
    expect(portal.ads).toBe(0)
    expect(portal.gameplayStart).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('Main menu (game is saved)'))
    expect(portal.gameplayStop).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Start new game/ }))
    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation).toHaveTextContent('overwrite your current save')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Start new game' }))

    expect(await screen.findByText('Event log')).toBeInTheDocument()
    expect(portal.ads).toBe(1)
  })

  it('shows a break ad when the player reaches the Freedom Lane', async () => {
    const portal = createFakePortal()
    setPlatform(portal)
    const game = createGame(1, 42)
    game.currentPlayerIndex = 0
    const player = game.players[0]
    player.cash = 10000
    player.passiveIncome = totalExpenses(player) - 100
    game.pendingDecision = {
      type: 'opportunity',
      playerId: player.id,
      opportunity: { id: 'asset-fast-track-test', name: '出圈测试资产', description: '购买后进入自由快道。', downPayment: 1000, mortgage: 4000, cashFlow: 240 },
    }
    game.turnStage = 'awaiting-decision'
    localStorage.setItem('cashflow-lab-save-v1', JSON.stringify(game))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Continue last game/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }))
    resetAdPacing(0)
    fireEvent.click(screen.getByRole('button', { name: 'Hit the Freedom Lane' }))

    await waitFor(() => expect(portal.ads).toBe(1))
  })

  it('confirms save deletion inside the game instead of a browser dialog', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Start new game/ }))
    fireEvent.click(screen.getByTitle('Delete save and restart'))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Event log')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Delete save and restart'))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete save and restart' }))
    expect(screen.getByRole('button', { name: /Start new game/ })).toBeInTheDocument()
    expect(localStorage.getItem('cashflow-lab-save-v1')).toBeNull()
  })
})
