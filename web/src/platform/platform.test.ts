// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MIN_AD_INTERVAL_MS, breakAdDue, platform, resetAdPacing, setPlatform, showBreakAd, type Platform } from '.'
import { setStorageBackend, storage } from './storage'

const webPlatform = platform()

const createFakePortal = (overrides: Partial<Platform> = {}): Platform & { ads: number } => {
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
    ...overrides,
  }
  return fake
}

describe('platform', () => {
  afterEach(() => {
    setPlatform(webPlatform)
    resetAdPacing()
  })

  it('never shows ads on the plain web build', async () => {
    resetAdPacing(0)
    expect(breakAdDue()).toBe(false)
    expect(await showBreakAd({ onStart: () => {} })).toBe('skipped')
  })

  it('spaces midgame ads at least three minutes apart', async () => {
    const portal = createFakePortal()
    setPlatform(portal)
    resetAdPacing(Date.now())
    expect(breakAdDue()).toBe(false)

    resetAdPacing(Date.now() - MIN_AD_INTERVAL_MS)
    expect(await showBreakAd({ onStart: () => {} })).toBe('shown')
    expect(portal.ads).toBe(1)
    expect(await showBreakAd({ onStart: () => {} })).toBe('skipped')
    expect(portal.ads).toBe(1)
  })

  it('routes saves to the platform store and survives a throwing backend', () => {
    const saved = new Map<string, string>()
    setStorageBackend({
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => void saved.set(key, value),
      removeItem: (key) => void saved.delete(key),
    })
    storage.set('slot', 'value')
    expect(saved.get('slot')).toBe('value')
    expect(localStorage.getItem('slot')).toBeNull()

    setStorageBackend({
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(storage.get('slot')).toBeNull()
    expect(() => storage.set('slot', 'x')).not.toThrow()
    setStorageBackend(localStorage)
  })
})
