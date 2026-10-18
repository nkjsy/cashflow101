import { useEffect, useMemo, useState } from 'react'
import { Award, CalendarCheck, ChartPie, Factory, Gem, HeartHandshake, House, Lock, ShieldCheck, Star, Swords, TrendingUp, Trophy, Undo2, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { loadAchievements, recordAchievements } from './achievements'
import { dailyResultOf, dailyStreak, isBetterDailyResult, loadDailyResults } from './daily'
import { ACHIEVEMENT_IDS, BIG_SALE_PROFIT, LANDLORD_PROPERTIES, QUICK_EXIT_ROUNDS, STOCK_TRADER_PROFIT, evaluateAchievements, type AchievementId } from './game-core/achievements'
import { UNLOCKABLE_PROFESSIONS } from './game-core/data'
import type { GameState } from './game-core/types'
import { money, t, tn } from './i18n'
import type { UiKey } from './i18n/ui-en'

const achievementInfo: Record<AchievementId, { icon: LucideIcon; title: UiKey; detail: () => string }> = {
  'first-win': { icon: Trophy, title: '初次自由', detail: () => t('赢得一局游戏。') },
  'quick-exit': { icon: Zap, title: '快速出圈', detail: () => t('快速局 {quick} 轮内、标准局 {standard} 轮内进入自由快道。', { quick: QUICK_EXIT_ROUNDS.quick, standard: QUICK_EXIT_ROUNDS.standard }) },
  'clean-exit': { icon: ShieldCheck, title: '无债一身轻', detail: () => t('进入自由快道时没有银行贷款和信用卡欠款。') },
  landlord: { icon: House, title: '包租公', detail: () => t('同时持有 {count} 项房地产。', { count: LANDLORD_PROPERTIES }) },
  'all-rounder': { icon: ChartPie, title: '全能投资者', detail: () => t('同时持有房地产、企业、股票、基金和存单。') },
  'stock-trader': { icon: TrendingUp, title: '低买高卖', detail: () => t('一局内按市价卖出证券累计盈利 {amount}。', { amount: money(STOCK_TRADER_PROFIT) }) },
  'big-sale': { icon: Gem, title: '一笔大单', detail: () => t('单笔出售资产盈利 {amount} 以上。', { amount: money(BIG_SALE_PROFIT) }) },
  'cash-only': { icon: Wallet, title: '现金为王', detail: () => t('从不刷信用卡并赢得一局。') },
  dreamer: { icon: Star, title: '梦想成真', detail: () => t('买下自己的梦想获胜。') },
  tycoon: { icon: Factory, title: '企业帝国', detail: () => t('同时拥有 3 家自由快道企业。') },
  philanthropist: { icon: HeartHandshake, title: '乐善好施', detail: () => t('一局内完成 3 次慈善捐赠。') },
  comeback: { icon: Undo2, title: '绝地反击', detail: () => t('曾经现金告急，最终仍然获胜。') },
  'expert-slayer': { icon: Swords, title: '以一敌三', detail: () => t('在专家难度下击败 3 名 AI。') },
  'daily-streak': { icon: CalendarCheck, title: '每日不缺席', detail: () => t('每日挑战连胜 3 天。') },
}

const nextUnlock = (count: number) => UNLOCKABLE_PROFESSIONS.find((profession) => count < profession.requiredAchievements)

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const unlocked = loadAchievements()
  const count = Object.keys(unlocked).length
  const next = nextUnlock(count)
  return (
    <div className="help-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="rules-panel achievements-panel" role="dialog" aria-modal="true" aria-labelledby="achievements-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>{t('{count}/{total} 已解锁', { count, total: ACHIEVEMENT_IDS.length })}</small><h2 id="achievements-title">{t('成就')}</h2></div>
          <button className="icon-button" title={t('关闭')} onClick={onClose}>×</button>
        </header>
        <div className="achievement-unlocks">
          {UNLOCKABLE_PROFESSIONS.map((profession) => (
            <span key={profession.title} className={count >= profession.requiredAchievements ? 'unlocked' : ''}>
              {count >= profession.requiredAchievements ? <Award /> : <Lock />}
              {t('{count} 个成就解锁职业：{profession}', { count: profession.requiredAchievements, profession: tn(profession.title) })}
            </span>
          ))}
          {next && <small>{t('再获得 {count} 个成就即可解锁{profession}。', { count: next.requiredAchievements - count, profession: tn(next.title) })}</small>}
        </div>
        <ul className="achievement-list">
          {ACHIEVEMENT_IDS.map((id) => {
            const info = achievementInfo[id]
            const Icon = info.icon
            const date = unlocked[id]
            return (
              <li key={id} className={date ? 'unlocked' : 'locked'}>
                <span className="achievement-icon">{date ? <Icon /> : <Lock />}</span>
                <span><strong>{t(info.title)}</strong><small>{info.detail()}</small></span>
                {date && <time dateTime={date}>{date}</time>}
              </li>
            )
          })}
        </ul>
        <button className="primary wide" onClick={onClose}>{t('继续')}</button>
      </section>
    </div>
  )
}

// Records the achievements earned in a finished game and shows the new ones.
export function AchievementSummary({ game }: { game: GameState }) {
  // Snapshot before recording, so a second effect run (StrictMode, remounts) cannot hide what is new.
  const [before] = useState(loadAchievements)
  const date = game.setup.dailyChallenge
  const result = date ? dailyResultOf(game) : null
  // Count today's daily result even if DailySummary has not stored it yet.
  const dailyResults = date ? loadDailyResults() : {}
  const streak = date
    ? dailyStreak(result && isBetterDailyResult(result, dailyResults[date]) ? { ...dailyResults, [date]: result } : dailyResults, date)
    : 0
  const earned = useMemo(() => evaluateAchievements(game, { dailyStreak: streak }), [game, streak])
  const earnedKey = earned.join(',')
  useEffect(() => {
    if (earnedKey) recordAchievements(earnedKey.split(',') as AchievementId[])
  }, [earnedKey])
  const fresh = earned.filter((id) => !before[id])
  if (fresh.length === 0) return null
  const beforeCount = Object.keys(before).length
  const afterCount = beforeCount + fresh.length
  const unlockedProfessions = UNLOCKABLE_PROFESSIONS.filter((profession) => beforeCount < profession.requiredAchievements && afterCount >= profession.requiredAchievements)
  return (
    <section className="achievement-summary" aria-label={t('新成就')}>
      <small><Award />{t('新成就')}</small>
      <ul>
        {fresh.map((id) => {
          const Icon = achievementInfo[id].icon
          return <li key={id} title={achievementInfo[id].detail()}><Icon />{t(achievementInfo[id].title)}</li>
        })}
      </ul>
      {unlockedProfessions.map((profession) => (
        <p key={profession.title}>{t('解锁新职业：{profession}！在开始界面选择即可使用。', { profession: tn(profession.title) })}</p>
      ))}
    </section>
  )
}
