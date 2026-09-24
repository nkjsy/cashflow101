export type PlatformName = 'web' | 'crazygames'

export type AdHooks = {
  // Called when the ad actually starts playing: pause the game and mute audio here.
  onStart: () => void
}

export type Platform = {
  name: PlatformName
  // Player locale reported by the portal, e.g. "en-US"; falls back to the browser language.
  locale?: string
  gameplayStart: () => void
  gameplayStop: () => void
  loadingStop: () => void
  // Resolves once the ad finished or failed; the game must work the same either way.
  showMidgameAd: (hooks: AdHooks) => Promise<'shown' | 'skipped'>
  isMuted: () => boolean
  onMuteChange: (listener: (muted: boolean) => void) => () => void
}

const webPlatform: Platform = {
  name: 'web',
  gameplayStart: () => {},
  gameplayStop: () => {},
  loadingStop: () => {},
  showMidgameAd: async () => 'skipped',
  isMuted: () => false,
  onMuteChange: () => () => {},
}

let current: Platform = webPlatform

export const platform = () => current

// Test hook and fallback path: swap in another platform implementation.
export const setPlatform = (next: Platform) => {
  current = next
}

export const initPlatform = async () => {
  // Statically known at build time, so the web build tree-shakes the CrazyGames adapter away.
  if (import.meta.env.VITE_PLATFORM === 'crazygames') {
    const { createCrazyGamesPlatform } = await import('./crazygames')
    current = await createCrazyGamesPlatform() ?? webPlatform
  }
  return current
}

// Midgame ads only at natural breaks, at most one per interval, and never in the first minutes of play.
export const MIN_AD_INTERVAL_MS = 3 * 60 * 1000
let lastAdAt = Date.now()

export const resetAdPacing = (timestamp = Date.now()) => {
  lastAdAt = timestamp
}

// Synchronous check so callers can skip the async path entirely when no ad will play.
export const breakAdDue = () =>
  current.name !== 'web' && Date.now() - lastAdAt >= MIN_AD_INTERVAL_MS

export const showBreakAd = async (hooks: AdHooks) => {
  if (!breakAdDue()) return 'skipped'
  lastAdAt = Date.now()
  return current.showMidgameAd(hooks)
}
