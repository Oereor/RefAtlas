import { afterEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import {
  isUiLocale,
  normalizeSystemLocale,
  presentationConfigFromArguments,
  UI_LOCALE_ARGUMENT,
} from '../src/shared/presentation'
import {
  initializeLocalization,
  resolveUiLocale,
  changeUiLocale,
  uiLocale,
  LOCALE_STORAGE_KEY,
  messages,
  formatUiCount,
  formatByteSize,
  formatRawError,
} from '../src/renderer/src/i18n'
import { localizationRawFixture } from '../src/renderer/src/localization-fixture'

function storage(initial?: string) {
  const values = new Map<string, string>(
    initial === undefined ? [] : [[LOCALE_STORAGE_KEY, initial]],
  )
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
afterEach(() => initializeLocalization('en'))
it('provides recovery messages in both supported locales', () => {
  for (const locale of ['en', 'zh-CN'] as const) {
    const options = { locale }
    const recovery = [
      messages.source_reload({}, options),
      messages.source_reloading({}, options),
      messages.source_reload_failed({ reason: messages.source_file_missing({}, options) }, options),
      messages.node_recovery_failed({ reason: messages.source_file_missing({}, options) }, options),
      messages.node_location_missing({}, options),
      messages.node_return_root({}, options),
    ]
    expect(recovery.every((value) => value.length > 0)).toBe(true)
    expect(recovery).not.toContain('source_reload')
  }
  expect(messages.node_location_missing({}, { locale: 'en' })).toBe(
    'The source was reloaded, but this location no longer exists.',
  )
  expect(messages.node_location_missing({}, { locale: 'zh-CN' })).toBe(
    '来源已重新加载，但此位置已不存在。',
  )
})

describe('presentation locale boundary', () => {
  it.each(['zh', 'zh-CN', 'zh-TW', 'zh-Hant', 'zh-Hans-CN', 'ZH-hk', ' zh-CN '])(
    'maps %s to zh-CN',
    (value) => {
      expect(normalizeSystemLocale(value)).toBe('zh-CN')
    },
  )
  it.each(['en-US', 'ja-JP', 'fr', '', undefined, null, 3])(
    'maps unsupported %s to en',
    (value) => {
      expect(normalizeSystemLocale(value)).toBe('en')
    },
  )
  it.each(['en', 'zh-CN'])('accepts supported preference %s', (value) => {
    expect(isUiLocale(value)).toBe(true)
    expect(resolveUiLocale(value === 'en' ? 'zh-CN' : 'en', storage(value))).toBe(value)
  })
  it.each(['zh-cn', 'en-US', 'fr', '', 'constructor'])('ignores invalid preference %s', (value) => {
    expect(isUiLocale(value)).toBe(false)
    expect(resolveUiLocale('zh-CN', storage(value))).toBe('zh-CN')
    expect(resolveUiLocale(undefined, storage(value))).toBe('en')
  })
  it('rejects malformed/duplicate bootstrap arguments and freezes the single-value shape', () => {
    const config = presentationConfigFromArguments(['--other', UI_LOCALE_ARGUMENT + 'zh-CN'])
    expect(config).toEqual({ initialLocale: 'zh-CN' })
    expect(Object.isFrozen(config)).toBe(true)
    for (const args of [
      [],
      [UI_LOCALE_ARGUMENT + 'fr'],
      [UI_LOCALE_ARGUMENT + 'en', UI_LOCALE_ARGUMENT + 'zh-CN'],
    ])
      expect(presentationConfigFromArguments(args)).toEqual({ initialLocale: 'en' })
  })
  it('initializes both locales and restores user preference through a new initialization', () => {
    const persisted = storage()
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(initializeLocalization(locale, persisted)).toBe(locale)
      expect(get(uiLocale)).toBe(locale)
      expect(messages.common_retry({}, { locale: get(uiLocale) })).toBe(
        locale === 'en' ? 'Retry' : '重试',
      )
    }
    changeUiLocale('en')
    expect(initializeLocalization('zh-CN', persisted)).toBe('en')
  })
  it('storage read/write failure does not block initialization or switching', () => {
    const unavailable = {
      getItem: () => {
        throw new Error('unavailable')
      },
      setItem: () => {
        throw new Error('unavailable')
      },
    }
    expect(initializeLocalization('zh-CN', unavailable)).toBe('zh-CN')
    expect(() => changeUiLocale('en')).not.toThrow()
    expect(get(uiLocale)).toBe('en')
    expect(() => changeUiLocale('fr' as never)).toThrow(TypeError)
  })
})

describe('localized presentation and immutable raw facts', () => {
  it('uses typed parameters and falls back to the English base message', () => {
    expect(messages.common_item_count({ count: '12' }, { locale: 'zh-CN' })).toBe('12 项')
    expect(messages.diagnostics_fallback_probe({}, { locale: 'zh-CN' })).toBe('Fallback ready')
  })
  it('changes presentation while retaining all raw strings, lexemes and identity', () => {
    const before = JSON.stringify(localizationRawFixture)
    const presentations = []
    for (const locale of ['en', 'zh-CN', 'en'] as const) {
      changeUiLocale(locale)
      presentations.push(formatRawError(localizationRawFixture, locale).message)
      expect(JSON.stringify(localizationRawFixture)).toBe(before)
      expect(localizationRawFixture.lexeme).toBe('1.00')
      expect(localizationRawFixture.surrogate.charCodeAt(0)).toBe(0xd800)
    }
    expect(presentations[0]).not.toBe(presentations[1])
    expect(presentations[0]).toBe(presentations[2])
  })
  it.each([
    'WORKSPACE_NOT_OPEN',
    'NOT_FOUND',
    'SOURCE_CHANGED',
    'STALE_CURSOR',
    'INVALID_JSON',
    'RESOURCE_LIMIT',
    'ACCESS_DENIED',
    'CANCELLED',
    'BUSY',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
    'SERVICE_EXIT',
    'INTERNAL',
  ])('maps %s without writing back to the protocol', (code) => {
    const error = Object.freeze({ code })
    expect(formatRawError(error, 'en').message).not.toBe(formatRawError(error, 'zh-CN').message)
    expect(error).toEqual({ code })
  })
  it('handles response limits and unknown codes without echoing arbitrary details', () => {
    const error = Object.freeze({
      code: 'RESOURCE_LIMIT',
      details: Object.freeze({ limit: 'RESPONSE_BYTES', arbitrary: 'x'.repeat(100000) }),
    })
    expect(formatRawError(error, 'en').message).toBe('The result exceeds the response size limit.')
    expect(formatRawError(error, 'zh-CN').message).toBe('结果超过响应大小限制。')
    expect(error.details.limit).toBe('RESPONSE_BYTES')
    expect(formatRawError({ code: '__proto__', details: error.details }, 'en')).toEqual(
      formatRawError({ code: 'INTERNAL' }, 'en'),
    )
  })
  it('formats only safe presentation metadata with decimal byte units', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(formatUiCount(1234567, locale)).toBe(new Intl.NumberFormat(locale).format(1234567))
      expect(formatByteSize(1234567, locale)).toMatch(/^1\.2 MB$/)
    }
    expect(formatByteSize(0, 'en')).toBe('0 B')
    expect(formatByteSize(0, 'zh-CN')).toBe('0 字节')
    for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatUiCount(invalid, 'en')).toThrow(RangeError)
      expect(() => formatByteSize(invalid, 'en')).toThrow(RangeError)
    }
  })
})
