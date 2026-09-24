/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Target portal for this build: `web` (itch.io / self-hosted, default) or `crazygames`.
  readonly VITE_PLATFORM?: 'web' | 'crazygames'
}
