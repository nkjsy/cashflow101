export type Language = 'en' | 'zh'

// A translatable name from game data (profession, card, dream...). Stored in Chinese, translated on render.
export type NameParam = { n: string }
export type TextParam = string | number | NameParam | LocalText
// Chinese source template plus parameters. The template doubles as the translation key.
export type LocalText = { key: string; params?: Record<string, TextParam> }

export type Dictionary = Readonly<Record<string, string>>

const isLocalText = (value: TextParam): value is LocalText =>
  typeof value === 'object' && 'key' in value

const formatNumber = (value: number) => value.toLocaleString('en-US')

// Templates use {name} placeholders; {name|singular|plural} picks a word by the numeric parameter.
export const formatTemplate = (
  template: string,
  params: Record<string, TextParam> | undefined,
  renderParam: (value: TextParam) => string,
) =>
  template.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (match, name: string, one?: string, other?: string) => {
    const value = params?.[name]
    if (value === undefined) return match
    if (one !== undefined) return value === 1 ? one : other ?? ''
    return renderParam(value)
  })

export const renderText = (
  text: LocalText,
  language: Language,
  messages: Dictionary,
  names: Dictionary,
): string => {
  const template = language === 'en' ? messages[text.key] ?? text.key : text.key
  return formatTemplate(template, text.params, (value) => {
    if (typeof value === 'number') return formatNumber(value)
    if (typeof value === 'string') return value
    if (isLocalText(value)) return renderText(value, language, messages, names)
    return language === 'en' ? names[value.n] ?? value.n : value.n
  })
}
