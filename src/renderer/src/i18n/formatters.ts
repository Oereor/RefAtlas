import type { UiLocale } from '../../../shared/presentation'
import * as messages from './generated/messages.js'

const countFormatters = {
  en: new Intl.NumberFormat('en'),
  'zh-CN': new Intl.NumberFormat('zh-CN'),
}
const sizeFormatters = {
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 1 }),
  'zh-CN': new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }),
}
function requireCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Presentation metadata must be a non-negative safe integer')
}

export function formatUiCount(value: number, locale: UiLocale): string {
  requireCount(value)
  return countFormatters[locale].format(value)
}

export function formatByteSize(bytes: number, locale: UiLocale): string {
  requireCount(bytes)
  const units = [messages.unit_byte({}, { locale }), 'kB', 'MB', 'GB', 'TB', 'PB']
  let unit = 0
  let value = bytes
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return sizeFormatters[locale].format(value) + ' ' + units[unit]
}
