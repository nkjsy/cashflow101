import { storage } from '../platform/storage'
import type { GameLogEntry } from '../game-core/types'
import { CONTENT_EN } from './content-en'
import { renderText, type Language, type LocalText, type TextParam } from './format'
import { LOG_EN } from './log-en'
import { UI_EN, type UiKey } from './ui-en'

export type { Language, LocalText } from './format'

const LANGUAGE_KEY = 'cashflow-lab-lang'
const MESSAGES = { ...LOG_EN, ...UI_EN }

const detectLanguage = (locale?: string): Language => {
  const saved = storage.get(LANGUAGE_KEY)
  if (saved === 'en' || saved === 'zh') return saved
  try {
    return (locale ?? navigator.language).toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

const applyDocumentLanguage = (language: Language) => {
  try { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en' } catch { /* no DOM */ }
}

let currentLanguage: Language = detectLanguage()
applyDocumentLanguage(currentLanguage)

export const getLanguage = () => currentLanguage

// Re-detect once the platform is ready: its storage may hold a saved choice and its locale beats the browser's.
export const initLanguage = (locale?: string) => {
  currentLanguage = detectLanguage(locale)
  applyDocumentLanguage(currentLanguage)
}

export const setLanguage = (language: Language) => {
  currentLanguage = language
  storage.set(LANGUAGE_KEY, language)
  applyDocumentLanguage(language)
}

// UI copy: the key is the Chinese source template, `{name}` placeholders are filled from params.
export const t = (key: UiKey, params?: Record<string, TextParam>) =>
  renderText({ key, params }, currentLanguage, MESSAGES, CONTENT_EN)

// Game-data names and descriptions (professions, cards, dreams...).
export const tn = (name: string) =>
  currentLanguage === 'en' ? CONTENT_EN[name] ?? name : name

export const tx = (text: LocalText) => renderText(text, currentLanguage, MESSAGES, CONTENT_EN)

export const formatLog = (entry: GameLogEntry) => (entry.text ? tx(entry.text) : entry.message)

export const money = (value: number) =>
  new Intl.NumberFormat(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
