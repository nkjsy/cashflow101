import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { AlertTriangle, CreditCard, Flag, HandCoins, PiggyBank, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react'
import { money, t, tn } from './i18n'
import { buildGameReport, type ReportHighlight, type ReportPoint } from './game-core/report'
import type { GameState } from './game-core/types'

const WIDTH = 600
const PADDING = { top: 14, right: 84, bottom: 22, left: 56 }

const niceMax = (value: number) => {
  if (value <= 0) return 1000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate * 4 >= value)!
  return step * 4
}

const compactMoney = (value: number) => {
  const size = Math.abs(value)
  if (size >= 1e6) return `$${Number((value / 1e6).toFixed(1))}M`
  if (size >= 1e4) return `$${Math.round(value / 1e3)}k`
  if (size >= 1e3) return `$${Number((value / 1e3).toFixed(1))}k`
  return `$${value}`
}

// Horizontal position of a round as a percentage of the chart width, matching LineChart's x scale.
const plotPercent = (points: ReportPoint[], round: number) => {
  const span = Math.max(1, points.at(-1)!.round - points[0].round)
  return (PADDING.left + (round - points[0].round) / span * (WIDTH - PADDING.left - PADDING.right)) / WIDTH * 100
}

type Series = { key: 'passive' | 'expenses' | 'cash'; label: string; value: (point: ReportPoint) => number }

// One y-axis per chart: income and expenses share $/month; cash gets its own chart below.
function LineChart({ points, series, height, hover, onHover, fastTrackRound, label }: {
  points: ReportPoint[]
  series: Series[]
  height: number
  hover: number | null
  onHover: (index: number | null) => void
  fastTrackRound: number | null
  label: string
}) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = height - PADDING.top - PADDING.bottom
  const values = points.flatMap((point) => series.map((line) => line.value(point)))
  const low = Math.min(0, ...values)
  const high = niceMax(Math.max(...values))
  const firstRound = points[0].round
  const span = Math.max(1, points.at(-1)!.round - firstRound)
  const x = (round: number) => PADDING.left + (round - firstRound) / span * plotWidth
  const y = (value: number) => PADDING.top + (1 - (value - low) / (high - low)) * plotHeight
  const ticks = Array.from({ length: 5 }, (_, index) => low + (high - low) * index / 4)
  const hoverPoint = hover !== null ? points[hover] : null

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const round = firstRound + (event.clientX - box.left) / box.width * span
    let nearest = 0
    points.forEach((point, index) => { if (Math.abs(point.round - round) < Math.abs(points[nearest].round - round)) nearest = index })
    onHover(nearest)
  }

  return (
    <svg className="report-chart" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={label}>
      {ticks.map((tick) => (
        <g key={tick} className="report-grid">
          <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(tick)} y2={y(tick)} />
          <text x={PADDING.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{compactMoney(Math.round(tick))}</text>
        </g>
      ))}
      <text className="report-axis" x={PADDING.left} y={height - 4}>{t('第 {round} 轮', { round: firstRound })}</text>
      <text className="report-axis" x={WIDTH - PADDING.right} y={height - 4} textAnchor="end">{t('第 {round} 轮', { round: points.at(-1)!.round })}</text>
      {fastTrackRound !== null && (
        <g className="report-milestone">
          <line x1={x(fastTrackRound)} x2={x(fastTrackRound)} y1={PADDING.top} y2={height - PADDING.bottom} />
          <text x={x(fastTrackRound) + 4} y={PADDING.top + 10}>{t('出圈')}</text>
        </g>
      )}
      {series.map((line) => {
        const last = points.at(-1)!
        return (
          <g key={line.key} className={`report-series series-${line.key}`}>
            <polyline points={points.map((point) => `${x(point.round)},${y(line.value(point))}`).join(' ')} />
            <text className="report-direct-label" x={x(last.round) + 8} y={y(line.value(last))} dy="0.32em">{line.label}</text>
          </g>
        )
      })}
      {hoverPoint && (
        <g className="report-hover">
          <line x1={x(hoverPoint.round)} x2={x(hoverPoint.round)} y1={PADDING.top} y2={height - PADDING.bottom} />
          {series.map((line) => <circle key={line.key} className={`series-${line.key}`} cx={x(hoverPoint.round)} cy={y(line.value(hoverPoint))} r={4.5} />)}
        </g>
      )}
      <rect
        className="report-hit"
        x={PADDING.left}
        y={PADDING.top}
        width={plotWidth}
        height={plotHeight}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => onHover(null)}
      />
    </svg>
  )
}

const highlightIcons: Record<ReportHighlight['kind'], LucideIcon> = {
  'first-asset': HandCoins,
  'best-deal': TrendingUp,
  'missed-deal': AlertTriangle,
  'best-sale': PiggyBank,
  'biggest-hit': AlertTriangle,
  credit: CreditCard,
  'fast-track': Flag,
}

const highlightText = (highlight: ReportHighlight) => {
  switch (highlight.kind) {
    case 'first-asset': return t('第 {round} 轮：买下第一项资产“{asset}”，每月 +{amount}。', { round: highlight.round, asset: tn(highlight.asset), amount: money(highlight.cashFlow) })
    case 'best-deal': return t('第 {round} 轮：回报最高的投资“{asset}”，首付 {down}，每月 +{amount}，年回报 {roi}%。', { round: highlight.round, asset: tn(highlight.asset), down: money(highlight.downPayment), amount: money(highlight.cashFlow), roi: highlight.annualReturn })
    case 'missed-deal': return t('第 {round} 轮：放弃了“{asset}”，它的年回报 {roi}% 比你买下的都高。', { round: highlight.round, asset: tn(highlight.asset), roi: highlight.annualReturn })
    case 'best-sale': return t('第 {round} 轮：卖出“{asset}”，赚了 {amount}。', { round: highlight.round, asset: tn(highlight.asset), amount: money(highlight.profit) })
    case 'biggest-hit': return t('第 {round} 轮：最大一笔意外支出 {amount}。', { round: highlight.round, amount: money(highlight.amount) })
    case 'credit': return t('从第 {round} 轮起刷卡 {count} 次，共 {amount}。', { round: highlight.round, count: highlight.count, amount: money(highlight.amount) })
    case 'fast-track': return t('第 {round} 轮：被动收入超过总支出，进入自由快道！', { round: highlight.round })
  }
}

const tone = (highlight: ReportHighlight) =>
  highlight.kind === 'missed-deal' || highlight.kind === 'biggest-hit' || highlight.kind === 'credit' ? 'negative' : 'positive'

export function GameReport({ game }: { game: GameState }) {
  const report = useMemo(() => buildGameReport(game), [game])
  const [hover, setHover] = useState<number | null>(null)
  if (!report || report.points.length < 2) return null
  const { points } = report
  const hoverPoint = hover !== null ? points[hover] : null
  const incomeSeries: Series[] = [
    { key: 'passive', label: t('被动收入'), value: (point) => point.passiveIncome },
    { key: 'expenses', label: t('总支出'), value: (point) => point.expenses },
  ]
  const cashSeries: Series[] = [{ key: 'cash', label: t('现金'), value: (point) => point.cash }]
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    setHover((current) => Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + step)))
  }

  return (
    <section className="game-report" aria-labelledby="game-report-title">
      <header>
        <Sparkles />
        <h3 id="game-report-title">{t('局后报告')}</h3>
        {report.fastTrackRound !== null && <span>{t('第 {round} 轮出圈', { round: report.fastTrackRound })}</span>}
      </header>
      <div className="report-legend" aria-hidden="true">
        <span><i className="series-passive" />{t('被动收入')}</span>
        <span><i className="series-expenses" />{t('总支出')}</span>
        <small>{t('每月')}</small>
      </div>
      <div
        className="report-charts"
        tabIndex={0}
        aria-label={t('用左右方向键逐轮查看')}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <LineChart points={points} series={incomeSeries} height={190} hover={hover} onHover={setHover} fastTrackRound={report.fastTrackRound} label={t('你的被动收入与总支出（每月）')} />
        <h4>{t('每轮结束时的现金')}</h4>
        <LineChart points={points} series={cashSeries} height={110} hover={hover} onHover={setHover} fastTrackRound={report.fastTrackRound} label={t('每轮结束时的现金')} />
        {hoverPoint && (
          <div className="report-tooltip" role="status" style={{ left: `${Math.min(80, Math.max(16, plotPercent(points, hoverPoint.round)))}%` }}>
            <small>{t('第 {round} 轮', { round: hoverPoint.round })}</small>
            <span><i className="series-passive" /><strong>{money(hoverPoint.passiveIncome)}</strong>{t('被动收入')}</span>
            <span><i className="series-expenses" /><strong>{money(hoverPoint.expenses)}</strong>{t('总支出')}</span>
            <span><i className="series-cash" /><strong>{money(hoverPoint.cash)}</strong>{t('现金')}</span>
          </div>
        )}
      </div>
      {report.highlights.length > 0 && (
        <>
          <h4>{t('关键时刻')}</h4>
          <ul className="report-highlights">
            {report.highlights.map((highlight) => {
              const Icon = highlightIcons[highlight.kind]
              return <li key={`${highlight.kind}-${highlight.round}`} className={tone(highlight)}><Icon aria-hidden="true" />{highlightText(highlight)}</li>
            })}
          </ul>
        </>
      )}
      <details className="report-table">
        <summary>{t('查看数据表')}</summary>
        <table>
          <thead><tr><th>{t('轮次')}</th><th>{t('现金')}</th><th>{t('被动收入')}</th><th>{t('总支出')}</th></tr></thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.round}><td>{point.round}</td><td>{money(point.cash)}</td><td>{money(point.passiveIncome)}</td><td>{money(point.expenses)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
