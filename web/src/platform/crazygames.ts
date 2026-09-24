import type { Platform } from '.'
import { setStorageBackend, type KeyValueBackend } from './storage'

// Minimal typing for the parts of CrazyGames HTML5 SDK v3 this game uses.
// Docs: https://docs.crazygames.com/sdk/intro/
type Settings = { muteAudio: boolean }
type CrazyGamesSdk = {
  init: () => Promise<void>
  environment: 'local' | 'crazygames' | 'disabled'
  game: {
    gameplayStart: () => void
    gameplayStop: () => void
    loadingStop: () => void
    settings?: Settings
    addSettingsChangeListener: (listener: (settings: Settings) => void) => void
    removeSettingsChangeListener: (listener: (settings: Settings) => void) => void
  }
  ad: {
    requestAd: (type: 'midgame' | 'rewarded', callbacks: {
      adStarted?: () => void
      adFinished?: () => void
      adError?: (error: unknown) => void
    }) => void
  }
  data: KeyValueBackend
  user: { systemInfo?: { locale?: string } }
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSdk }
  }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
const SDK_LOAD_TIMEOUT_MS = 10000

const loadSdkScript = () => new Promise<void>((resolve, reject) => {
  if (window.CrazyGames?.SDK) {
    resolve()
    return
  }
  const script = document.createElement('script')
  const timer = window.setTimeout(() => reject(new Error('CrazyGames SDK load timed out')), SDK_LOAD_TIMEOUT_MS)
  script.src = SDK_URL
  script.async = true
  script.onload = () => {
    window.clearTimeout(timer)
    resolve()
  }
  script.onerror = () => {
    window.clearTimeout(timer)
    reject(new Error('CrazyGames SDK failed to load'))
  }
  document.head.appendChild(script)
})

// Returns null when the SDK is unavailable (blocked, offline, or an unsupported domain) so the
// game falls back to plain web behavior instead of failing to start.
export const createCrazyGamesPlatform = async (): Promise<Platform | null> => {
  try {
    await loadSdkScript()
    const sdk = window.CrazyGames!.SDK
    await sdk.init()
    if (sdk.environment === 'disabled') return null

    // CrazyGames requires saves to go through the Data module (it falls back to localStorage for guests).
    setStorageBackend(sdk.data)

    let gameplayActive = false
    return {
      name: 'crazygames',
      locale: sdk.user.systemInfo?.locale,
      gameplayStart: () => {
        if (gameplayActive) return
        gameplayActive = true
        sdk.game.gameplayStart()
      },
      gameplayStop: () => {
        if (!gameplayActive) return
        gameplayActive = false
        sdk.game.gameplayStop()
      },
      loadingStop: () => sdk.game.loadingStop(),
      showMidgameAd: (hooks) => new Promise((resolve) => {
        let started = false
        sdk.ad.requestAd('midgame', {
          adStarted: () => {
            started = true
            hooks.onStart()
          },
          adFinished: () => resolve('shown'),
          // Unfilled, adblock, cooldown or Basic Launch: carry on as if no ad was requested.
          adError: () => resolve(started ? 'shown' : 'skipped'),
        })
      }),
      isMuted: () => Boolean(sdk.game.settings?.muteAudio),
      onMuteChange: (listener) => {
        const handler = (settings: Settings) => listener(Boolean(settings.muteAudio))
        sdk.game.addSettingsChangeListener(handler)
        return () => sdk.game.removeSettingsChangeListener(handler)
      },
    }
  } catch {
    return null
  }
}
