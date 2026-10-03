import { readonly, writable } from 'svelte/store'
import { isUiLocale } from '../../../shared/presentation'
import type { UiLocale } from '../../../shared/presentation'
import { setLocale } from './generated/runtime.js'

export const LOCALE_STORAGE_KEY = 'refatlas.locale'
type LocaleStorage = Pick<Storage, 'getItem' | 'setItem'>
const state = writable<UiLocale>('en')
export const uiLocale = readonly(state)
let persistence: LocaleStorage | undefined
let page: Document | undefined

export function resolveUiLocale(initialLocale: unknown, storage?: LocaleStorage): UiLocale {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY)
    if (isUiLocale(stored)) return stored
  } catch {}
  return isUiLocale(initialLocale) ? initialLocale : 'en'
}

function apply(locale: UiLocale): void {
  setLocale(locale, { reload: false })
  if (page) {
    page.documentElement.lang = locale
    page.documentElement.dir = 'ltr'
  }
  state.set(locale)
}

export function initializeLocalization(
  initialLocale: unknown,
  storage?: LocaleStorage,
  document?: Document,
): UiLocale {
  persistence = storage
  page = document
  const locale = resolveUiLocale(initialLocale, storage)
  apply(locale)
  return locale
}

export function initializeBrowserLocalization(): UiLocale {
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch {}
  return initializeLocalization(window.appPresentationConfig?.initialLocale, storage, document)
}

export function changeUiLocale(locale: UiLocale): void {
  if (!isUiLocale(locale)) throw new TypeError('Unsupported UI locale')
  apply(locale)
  try {
    persistence?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {}
}
