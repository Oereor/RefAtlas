import { messages, changeUiLocale } from '../src/renderer/src/i18n'
import type { UiLocale } from '../src/shared/presentation'
import type { Locale } from '../src/renderer/src/i18n/generated/runtime.js'

// 此函数只由 tsc 检查，不作为运行时测试执行。
export function localizationTypeChecks(locale: Locale, uiLocale: UiLocale): void {
  const generatedLocale: Locale = uiLocale
  const supportedLocale: UiLocale = locale
  changeUiLocale(supportedLocale)
  messages.common_item_count({ count: '3' }, { locale: generatedLocale })
  // @ts-expect-error required count parameter
  messages.common_item_count({})
  // @ts-expect-error required inputs object
  messages.common_item_count()
  // @ts-expect-error unknown message ID
  messages.unknown_message()
  // @ts-expect-error unsupported generated locale
  messages.common_retry({}, { locale: 'fr' })
  // @ts-expect-error unsupported application locale
  changeUiLocale('fr')
}
