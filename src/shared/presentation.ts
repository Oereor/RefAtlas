export type UiLocale = 'en' | 'zh-CN'
export type AppPresentationConfig = Readonly<{ initialLocale: UiLocale }>
export const UI_LOCALE_ARGUMENT = '--refatlas-ui-locale='

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'zh-CN'
}

export function normalizeSystemLocale(value: unknown): UiLocale {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function presentationConfigFromArguments(args: readonly string[]): AppPresentationConfig {
  const values = args.filter((arg) => arg.startsWith(UI_LOCALE_ARGUMENT))
  const value = values.length === 1 ? values[0].slice(UI_LOCALE_ARGUMENT.length) : undefined
  return Object.freeze({ initialLocale: isUiLocale(value) ? value : 'en' })
}
