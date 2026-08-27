/// <reference types="node" />

import { createGame } from '../game-core/engine'
import { aggregateSimulations } from './simulator'

const readNumber = (name: string, fallback: number) => {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

const games = readNumber('--games', 1000)
const maxRounds = readNumber('--max-rounds', 150)
const baseSeed = readNumber('--seed', 1)
const requestedAiCount = readNumber('--ai', 3)
if (![1, 2, 3].includes(requestedAiCount)) throw new Error('--ai must be 1, 2, or 3')
const aiCount = requestedAiCount as 1 | 2 | 3

const startedAt = performance.now()
const report = aggregateSimulations(
  { games, maxRounds, baseSeed, aiCount },
  (seed) => createGame(aiCount, seed),
)
const elapsed = performance.now() - startedAt

console.log(`\n现金流批量模拟：${games.toLocaleString('zh-CN')} 局，${aiCount + 1} 名玩家`)
console.log(`完成率：${(report.completionRate * 100).toFixed(1)}% (${report.completedGames}/${games})`)
console.log(`完成局轮数：中位数 ${report.medianRounds ?? '-'}，P90 ${report.p90Rounds ?? '-'}`)
console.log(`首次进入快车道：中位数 ${report.medianFirstFastTrackRound ?? '-'}，P90 ${report.p90FirstFastTrackRound ?? '-'}`)
console.log(`胜者快车道停留：中位数 ${report.medianWinnerFastTrackRounds ?? '-'}，P90 ${report.p90WinnerFastTrackRounds ?? '-'}`)
console.log(`进入快车道 1 轮内获胜：${(report.oneRoundFastTrackWinRate * 100).toFixed(1)}%`)
console.log('快车道获胜途径（胜局 / 占比 / 快车道轮数中位数 / P90）：')
const winRouteLabels = { dream: '购买梦想', 'business-income': '购买企业达到收入目标', 'expansion-income': '扩张达到收入目标', 'business-upgrade': '企业升级达到收入目标', 'reinvestment-income': '再投资达到收入目标' } as const
for (const [route, stats] of Object.entries(report.winRoutes)) {
  console.log(`  ${winRouteLabels[route as keyof typeof winRouteLabels]}：${stats.wins} / ${(stats.wins / report.completedGames * 100).toFixed(1)}% / ${stats.medianFastTrackRounds ?? '-'} / ${stats.p90FastTrackRounds ?? '-'}`)
}
console.log(`快车道新玩法触发量：${JSON.stringify(report.fastTrackActions)}`)
console.log(`有玩家进入快车道的对局：${(report.gamesWithFastTrackEntryRate * 100).toFixed(1)}%`)
console.log(`发生破产的对局：${(report.gamesWithBankruptcyRate * 100).toFixed(1)}%，平均每局 ${report.averageBankruptcies.toFixed(2)} 人`)
console.log(`平均命令数：${report.averageCommands.toFixed(1)}`)
console.log(`截止时仍在老鼠赛跑圈的玩家数：${report.cutoffRatRacePlayers}`)
console.log(`职业胜局：${JSON.stringify(report.professionWins)}`)
console.log('职业平衡（胜率 95% Wilson 区间）：')
for (const [profession, stats] of Object.entries(report.professionStats).sort(([, left], [, right]) => right.winRate - left.winRate)) {
  console.log(
    `  ${profession.padEnd(4, '　')} 参赛 ${String(stats.appearances).padStart(6)} | 胜率 ${(stats.winRate * 100).toFixed(2).padStart(6)}%` +
    ` [${(stats.winRateLow95 * 100).toFixed(2)}%, ${(stats.winRateHigh95 * 100).toFixed(2)}%]` +
    ` | 出圈 ${(stats.fastTrackRate * 100).toFixed(2).padStart(6)}% | 平均出圈 ${stats.averageFirstFastTrackRound?.toFixed(1).padStart(4) ?? '   -'} 轮` +
    ` | 破产 ${(stats.bankruptcyRate * 100).toFixed(2).padStart(5)}%`,
  )
}
console.log('职业 × 长期目标（胜率 / 目标完成率）：')
const goalLabels = { diversified: '三类配置', 'master-asset': '三级资产', 'debt-free': '无贷经营' } as const
const professionGoalOutcomes = report.games.flatMap((game) => game.professionOutcomes)
for (const profession of Object.keys(report.professionStats)) {
  const cells = Object.entries(goalLabels).map(([goal, label]) => {
    const outcomes = professionGoalOutcomes.filter((outcome) => outcome.profession === profession && outcome.longTermGoal === goal)
    if (outcomes.length === 0) return `${label} 无样本`
    const wins = outcomes.filter((outcome) => outcome.won).length
    const completions = outcomes.filter((outcome) => outcome.longTermGoalCompleted).length
    return `${label} ${(wins / outcomes.length * 100).toFixed(2)}% / ${(completions / outcomes.length * 100).toFixed(1)}% (n=${outcomes.length})`
  })
  console.log(`  ${profession.padEnd(4, '　')} ${cells.join(' | ')}`)
}
console.log(`资产购买量：${JSON.stringify(report.assetPurchases)}`)
console.log(`交易购买量：${JSON.stringify(report.dealPurchases)}`)
console.log(`保险购买量（按职业）：${JSON.stringify(report.insurancePurchases)}`)
console.log(`保险实际理赔量（职业:险种）：${JSON.stringify(report.insuranceClaims)}`)
console.log(`职业技能触发量：${JSON.stringify(report.professionSkillTriggers)}`)
console.log(`职业技能累计收益：${JSON.stringify(report.professionSkillValue)}`)
const cutoffSeeds = report.games.filter((game) => !game.completed).slice(0, 10).map((game) => game.seed)
console.log(`未完成示例种子：${cutoffSeeds.length > 0 ? cutoffSeeds.join(', ') : '无'}`)
console.log(`耗时：${elapsed.toFixed(0)}ms\n`)

if (report.completionRate < 0.8) process.exitCode = 2