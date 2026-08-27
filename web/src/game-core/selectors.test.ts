import { describe, expect, it } from 'vitest'
import { createGame } from './engine'
import { finalPlayerScore, groupAssets, playerProgress, playerStatus } from './selectors'

describe('game presentation selectors', () => {
  it('groups duplicate assets and totals their cash flow and mortgage', () => {
    const asset = {
      id: 'asset-laundry',
      name: '社区洗衣店',
      downPayment: 4000,
      mortgage: 16000,
      cashFlow: 240,
    }

    expect(groupAssets([asset, asset])).toEqual([
      {
        ...asset,
        count: 2,
        totalCashFlow: 480,
        totalMortgage: 32000,
      },
    ])
  })

  it('separates different levels of the same asset source', () => {
    const base = {
      name: '社区洗衣店', kind: 'business' as const, downPayment: 4000, mortgage: 16000,
      baseCashFlow: 240, cashFlow: 240, sourceId: 'asset-laundry',
    }

    const grouped = groupAssets([
      { ...base, id: 'asset-laundry#1', level: 1 },
      { ...base, id: 'asset-laundry#2', level: 2, cashFlow: 360 },
    ])

    expect(grouped).toHaveLength(2)
    expect(grouped.map((asset) => asset.level)).toEqual([1, 2])
    expect(grouped.map((asset) => asset.totalCashFlow)).toEqual([240, 360])
  })

  it('exposes temporary player status without internal AI information', () => {
    const player = createGame(1, 42).players[1]
    player.charityTurns = 2

    expect(playerStatus(player)).toBe('慈善双骰 · 剩余 2 回合')
  })

  it('reports progress toward the 50000 Fast Track income increase', () => {
    const player = createGame(1, 42).players[0]
    player.phase = 'fast-track'
    player.fastTrackIncome = 325000
    player.fastTrackGoal = 350000

    expect(playerProgress(player)).toBe(50)
  })

  it('reports zero progress while income is still below its Fast Track starting value', () => {
    const player = createGame(1, 42).players[0]
    player.phase = 'fast-track'
    player.fastTrackIncome = 295000
    player.fastTrackGoal = 350000

    expect(playerProgress(player)).toBe(0)
  })

  it('scores final performance across five bounded dimensions', () => {
    const game = createGame(1, 42)
    const winner = game.players[0]
    winner.phase = 'finished'
    winner.fastTrackIncome = 350000
    winner.fastTrackGoal = 350000
    winner.longTermGoalCompleted = true
    winner.dreamPreparation = 3

    const result = finalPlayerScore(winner, winner.id)

    expect(result.dimensions).toHaveLength(5)
    expect(result.dimensions.map((dimension) => dimension.maximum)).toEqual([30, 20, 20, 15, 15])
    expect(result.total).toBe(result.dimensions.reduce((sum, dimension) => sum + dimension.score, 0))
    expect(result.dimensions.every((dimension) => dimension.score >= 0 && dimension.score <= dimension.maximum)).toBe(true)
    expect(finalPlayerScore(winner, winner.id)).toEqual(result)
  })

  it('gives a bankrupt player no stage-progress score while preserving earned dimensions', () => {
    const player = createGame(1, 42).players[1]
    player.bankrupt = true
    player.phase = 'finished'
    player.assets = [{ id: 'asset', name: '资产', kind: 'business', downPayment: 1000, mortgage: 0, cashFlow: 100 }]

    const result = finalPlayerScore(player, null)

    expect(result.dimensions.find((dimension) => dimension.id === 'progress')?.score).toBe(0)
    expect(result.dimensions.find((dimension) => dimension.id === 'portfolio')?.score).toBeGreaterThan(0)
  })
})