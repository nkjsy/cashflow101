import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initLanguage } from './i18n'
import { initPlatform } from './platform'

// The portal SDK must be ready before the first render: saves and the player's locale come from it.
const activePlatform = await initPlatform()
initLanguage(activePlatform.locale)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
activePlatform.loadingStop()
