import { UNLOCKABLE_PROFESSIONS } from './game-core/data'
import type { AchievementId } from './game-core/achievements'
import { storage } from './platform/storage'

const ACHIEVEMENTS_KEY = 'cashflow-lab-achievements'

// Unlocked achievements with the UTC date each was first earned.
export type UnlockedAchievements = Partial<Record<AchievementId, string>>

export const loadAchievements = (): UnlockedAchievements => {
  try {
    const parsed = JSON.parse(storage.get(ACHIEVEMENTS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Adds newly earned achievements and returns only the ones that were not unlocked before.
export const recordAchievements = (earned: AchievementId[], date = new Date().toISOString().slice(0, 10)) => {
  const unlocked = loadAchievements()
  const fresh = earned.filter((id) => !unlocked[id])
  if (fresh.length > 0) storage.set(ACHIEVEMENTS_KEY, JSON.stringify({ ...unlocked, ...Object.fromEntries(fresh.map((id) => [id, date])) }))
  return fresh
}

export const isProfessionUnlocked = (title: string, unlockedCount: number) => {
  const unlockable = UNLOCKABLE_PROFESSIONS.find((profession) => profession.title === title)
  return !unlockable || unlockedCount >= unlockable.requiredAchievements
}
