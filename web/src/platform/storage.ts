export type KeyValueBackend = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// Portal iframes and privacy modes can make storage throw on access; never let that break the game.
const safeStore = (getBackend: () => KeyValueBackend) => ({
  get(key: string): string | null {
    try { return getBackend().getItem(key) } catch { return null }
  },
  set(key: string, value: string) {
    try { getBackend().setItem(key, value) } catch { /* storage unavailable or full */ }
  },
  remove(key: string) {
    try { getBackend().removeItem(key) } catch { /* storage unavailable */ }
  },
})

let persistentBackend: KeyValueBackend | null = null

// Platforms with their own save system (e.g. CrazyGames Data module) replace localStorage here.
export const setStorageBackend = (backend: KeyValueBackend) => {
  persistentBackend = backend
}

export const storage = safeStore(() => persistentBackend ?? localStorage)
export const sessionStore = safeStore(() => sessionStorage)
