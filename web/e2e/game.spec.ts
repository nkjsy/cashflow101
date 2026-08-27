import { expect, test, type Page } from '@playwright/test'

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
}

test('start screen is usable', async ({ page }, testInfo) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /现金流.*实验室/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /引导模式/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /标准模式/ })).toBeVisible()
  await page.getByLabel('选择职业').selectOption('医生')
  await expect(page.getByRole('img', { name: '医生职业雷达图，越靠外越有利' })).toBeVisible()
  await expect(page.getByText('收入很高，但教育贷款和固定支出压力最大。')).toBeVisible()
  await expect(page.getByRole('button', { name: /开始新游戏/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('start-screen.png'), fullPage: true })
})

test('selected dream stays visible after entering the Fast Track', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: /开始新游戏/ }).click()
  await page.waitForFunction(() => Boolean(localStorage.getItem('cashflow-lab-save-v1')))
  const dream = await page.evaluate(() => {
    const key = 'cashflow-lab-save-v1'
    const game = JSON.parse(localStorage.getItem(key)!)
    const player = game.players[0]
    player.phase = 'fast-track'
    player.passiveIncome = 3000
    player.fastTrackIncome = 314000
    player.fastTrackGoal = 350000
    player.fastTrackTurns = 2
    localStorage.setItem(key, JSON.stringify(game))
    return player.dream as string
  })

  await page.reload()
  await page.getByRole('button', { name: /继续上次游戏/ }).click()

  await expect(page.getByText(`我的梦想：${dream}`)).toBeVisible()
  await expect(page.getByText(`梦想：${dream}`, { exact: true })).toBeVisible()
  await expect(page.getByText('28%', { exact: true })).toBeVisible()
  await expect(page.locator('.progress-summary')).toContainText('收入已增加 US$14,000 / $50,000')
  const formulaButton = page.getByRole('button', { name: '计算方式' })
  await expect(formulaButton).toBeVisible()
  await expect(page.getByText('现金流日收入计算')).toBeHidden()
  await formulaButton.click()
  await expect(page.getByText('现金流日收入计算')).toBeVisible()
  await expect(page.getByText('被动收入取整到最近千位；工资和每月现金流不参与。')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('fast-track-dream.png'), fullPage: true })
})

test('strategy feedback stays above the opponent dashboard', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '3 名' }).click()
  await page.getByRole('button', { name: /开始新游戏/ }).click()
  await page.waitForFunction(() => Boolean(localStorage.getItem('cashflow-lab-save-v1')))
  await page.evaluate(() => {
    const key = 'cashflow-lab-save-v1'
    const game = JSON.parse(localStorage.getItem(key)!)
    game.currentPlayerIndex = 0
    game.turnStage = 'awaiting-roll'
    game.pendingDecision = null
    game.players[0].cash = 10000
    game.players[0].bankLoan = 5000
    game.players[0].strategyActionUsed = false
    localStorage.setItem(key, JSON.stringify(game))
  })

  await page.reload()
  await page.getByRole('button', { name: /继续上次游戏/ }).click()
  await page.getByRole('button', { name: '财务整理' }).click()

  const feedback = page.getByRole('alert')
  await expect(feedback).toContainText('财务整理偿还')
  await expect(feedback).toHaveClass(/success/)
  const feedbackBounds = await feedback.boundingBox()
  expect(feedbackBounds).not.toBeNull()
  expect(feedbackBounds!.y).toBeGreaterThanOrEqual(0)
  expect(feedbackBounds!.y + feedbackBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  const feedbackIsTopmost = await feedback.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === element
  })
  expect(feedbackIsTopmost).toBe(true)
  if (testInfo.project.name === 'desktop') {
    const opponents = await page.locator('.opponent-dashboard').boundingBox()
    expect(opponents).not.toBeNull()
    expect(feedbackBounds!.y + feedbackBounds!.height).toBeLessThan(opponents!.y)
  }
  await page.screenshot({ path: testInfo.outputPath('strategy-feedback.png'), fullPage: true })
})

test('game screen remains usable after starting with three AI players', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '3 名' }).click()
  await page.getByRole('button', { name: /开始新游戏/ }).click()

  await expect(page.getByRole('button', { name: /掷骰子/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '借款', exact: true })).toHaveCount(0)
  const insuranceTooltip = page.getByText(/Rat Race 只有失业事件：保险承担 (50|75)% 的一个月总支出，但仍跳过 2 回合，理赔后自动消耗。维护险和诉讼险在进入快车道后通过风控购买。/)
  await expect(insuranceTooltip).toBeHidden()
  await page.getByRole('button', { name: '失业保险' }).focus()
  await expect(insuranceTooltip).toBeVisible()
  const tooltipBounds = await insuranceTooltip.boundingBox()
  expect(tooltipBounds).not.toBeNull()
  expect(tooltipBounds!.y).toBeGreaterThanOrEqual(0)
  expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  const tooltipIsTopmost = await insuranceTooltip.evaluate((tooltip) => {
    const bounds = tooltip.getBoundingClientRect()
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest('.strategy-tooltip') === tooltip
  })
  expect(tooltipIsTopmost).toBe(true)
  await page.locator('.ready-heading').focus()
  await expect(page.getByText(/每回合最多执行一项策略/)).toBeVisible()
  const goal = page.locator('.strategy-summary .summary-help')
  await expect(goal).toHaveText(/目标：(三类配置|三级资产|无贷经营)/)
  await goal.focus()
  await expect(goal.locator('.summary-tooltip')).toContainText(/任意三种资产类型|非证券资产升级到 3 级|持有至少两项资产/)
  await expectNoHorizontalOverflow(page)
  await expect(page.getByLabel('老鼠赛跑圈')).toBeVisible()
  await expect(page.getByLabel('快车道')).toHaveCount(0)
  await page.getByRole('button', { name: '快车道', exact: true }).click()
  await expect(page.getByLabel('快车道')).toBeVisible()
  await expect(page.getByLabel('老鼠赛跑圈')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /掷骰子/ })).toBeVisible()
  await page.getByRole('button', { name: 'Rat Race', exact: true }).click()
  await expect(page.getByLabel('老鼠赛跑圈')).toBeVisible()
  await expect(page.getByRole('region', { name: 'AI 对手公开财务' }).getByRole('button', { name: /陈禾/ })).toBeVisible()
  await expect(page.getByText('财务自由进度')).toBeVisible()
  const fastAiButton = page.getByRole('button', { name: /快进 AI 动画|恢复 AI 动画/ })
  const fastAiBounds = await fastAiButton.boundingBox()
  expect(fastAiBounds).not.toBeNull()
  expect(fastAiBounds!.x + fastAiBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  const soundButton = page.getByRole('button', { name: /关闭游戏音效|开启游戏音效/ })
  await expect(soundButton).toBeVisible()
  const soundBounds = await soundButton.boundingBox()
  expect(soundBounds).not.toBeNull()
  expect(soundBounds!.x + soundBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  for (const control of await page.locator('.header-actions button').all()) {
    const bounds = await control.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
  await page.getByRole('button', { name: /总支出/ }).click()
  const humanLoanPayment = page.locator('.finance-panel').getByText('银行贷款月供（10%）')
  await expect(humanLoanPayment).toBeVisible()
  if (testInfo.project.name === 'desktop') {
    const board = await page.getByLabel('老鼠赛跑圈').boundingBox()
    const decision = await page.locator('.decision').boundingBox()
    const opponents = await page.locator('.opponent-dashboard').boundingBox()
    expect(board).not.toBeNull()
    expect(decision).not.toBeNull()
    expect(opponents).not.toBeNull()
    expect(decision!.x).toBeGreaterThanOrEqual(board!.x)
    expect(decision!.y).toBeGreaterThanOrEqual(board!.y)
    expect(decision!.x + decision!.width).toBeLessThanOrEqual(board!.x + board!.width)
    expect(decision!.y + decision!.height).toBeLessThanOrEqual(board!.y + board!.height)
    expect(board!.y + board!.height).toBeLessThanOrEqual(opponents!.y)
    expect(opponents!.y + opponents!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    const loanPayment = await humanLoanPayment.boundingBox()
    expect(loanPayment).not.toBeNull()
    expect(loanPayment!.y + loanPayment!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  }
  const firstOpponentSummary = page.locator('.opponent-summary').first()
  await firstOpponentSummary.click()
  await expect(page.getByText('梦想', { exact: true })).toBeVisible()
  await expect(page.getByText('银行贷款月供（10%）').first()).toBeVisible()
  if (testInfo.project.name === 'desktop') {
    const summary = await firstOpponentSummary.boundingBox()
    const details = await page.locator('.opponent-details').boundingBox()
    expect(summary).not.toBeNull()
    expect(details).not.toBeNull()
    expect(details!.y + details!.height).toBeLessThanOrEqual(summary!.y)
    expect(details!.y).toBeGreaterThanOrEqual(0)
  }
  await expectNoHorizontalOverflow(page)
  await page.waitForFunction(() => Boolean(localStorage.getItem('cashflow-lab-save-v1')))
  await page.evaluate(() => {
    const key = 'cashflow-lab-save-v1'
    const game = JSON.parse(localStorage.getItem(key)!)
    const asset = {
      id: 'asset-scroll-test', name: '滚动测试资产', kind: 'business', dealSize: 'small',
      description: '验证资产列表滚动。', downPayment: 1000, mortgage: 0, cashFlow: 100,
    }
    game.players[0].assets = Array.from({ length: 12 }, (_, index) => ({ ...asset, id: `${asset.id}-${index}` }))
    game.players[0].passiveIncome = 1200
    localStorage.setItem(key, JSON.stringify(game))
  })
  await page.reload()
  await page.getByRole('button', { name: /继续上次游戏/ }).click()
  const assetList = page.locator('.finance-panel .assets')
  await expect(assetList).toBeVisible()
  const assetOverflow = await assetList.evaluate((element) => element.scrollHeight > element.clientHeight)
  expect(assetOverflow).toBe(true)
  if (testInfo.project.name === 'desktop') {
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientHeight,
      content: document.documentElement.scrollHeight,
    }))
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  }
  await page.screenshot({ path: testInfo.outputPath('game-screen.png'), fullPage: true })
})