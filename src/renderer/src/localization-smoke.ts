import { mount, tick, unmount } from 'svelte'
import { get } from 'svelte/store'
import LocalizationHarness from './LocalizationHarness.svelte'
import { changeUiLocale, isUiLocale, LOCALE_STORAGE_KEY, uiLocale } from './i18n'

const bootToken = crypto.randomUUID()
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('localization smoke: ' + message)
}

export async function runLocalizationSmoke(stage: string): Promise<unknown> {
  const bootstrap = window.appPresentationConfig
  assert(Object.keys(bootstrap).join(',') === 'initialLocale', 'bootstrap 必须是窄只读值')
  assert(isUiLocale(bootstrap.initialLocale), '无效 bootstrap locale')
  try {
    Reflect.set(bootstrap, 'initialLocale', 'fr')
  } catch {}
  assert(isUiLocale(bootstrap.initialLocale), 'bootstrap 不可修改')
  assert(document.documentElement.lang === get(uiLocale), '挂载前 html lang 已同步')
  assert(document.documentElement.dir === 'ltr', 'html dir')
  const checks: string[] = ['bootstrap-readonly', 'html-lang']
  if (stage === 'initial') {
    assert(get(uiLocale) === bootstrap.initialLocale, '首次使用 Main 系统 bootstrap')
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(LocalizationHarness, { target })
    try {
      await tick()
      const harness = document.getElementById('i18n-harness')!
      const button = document.getElementById('i18n-counter') as HTMLButtonElement
      button.click()
      button.click()
      ;(document.getElementById('interaction') as HTMLButtonElement).click()
      await tick()
      const token = harness.dataset.token
      const count = harness.dataset.count
      const raw = document.getElementById('i18n-raw')!.textContent
      const interactions = document.getElementById('interactions')!.textContent
      const beforeStatus = await window.foundation.getServiceStatus()
      assert(beforeStatus.ok, 'service 状态')
      for (const locale of ['en', 'zh-CN', 'en', 'zh-CN'] as const) {
        changeUiLocale(locale)
        await tick()
        assert(get(uiLocale) === locale && harness.dataset.locale === locale, 'reactive locale')
        assert(button.textContent === (locale === 'en' ? '2 items' : '2 项'), '可见参数消息')
        assert(button.getAttribute('aria-label') === (locale === 'en' ? 'Retry' : '重试'), 'ARIA')
        assert(button.title === (locale === 'en' ? 'Reload' : '重新加载'), 'title')
        assert(document.documentElement.lang === locale, '切换同步 lang')
        assert(localStorage.getItem(LOCALE_STORAGE_KEY) === locale, '切换持久化')
        assert(harness.dataset.token === token && harness.dataset.count === count, '组件 state')
        assert(document.getElementById('i18n-counter') === button, '组件未 remount')
        assert(document.getElementById('interactions')!.textContent === interactions, 'App state')
        assert(document.getElementById('i18n-raw')!.textContent === raw, 'raw 保真')
        assert(
          document.getElementById('i18n-fallback')!.textContent === 'Fallback ready',
          'en fallback',
        )
      }
      const afterStatus = await window.foundation.getServiceStatus()
      assert(
        afterStatus.ok && afterStatus.value.generation === beforeStatus.value.generation,
        '服务代次保留',
      )
      checks.push(
        'reactive-dom',
        'aria-title',
        'no-remount',
        'app-state',
        'service-generation',
        'raw-boundary',
        'fallback',
        'switch-persistence',
      )
    } finally {
      await unmount(component)
      target.remove()
    }
  } else if (stage === 'stored-zh') {
    assert(get(uiLocale) === 'zh-CN', 'reload 后中文偏好')
    changeUiLocale('en')
    checks.push('persisted-zh-restored')
  } else if (stage === 'stored-en') {
    assert(get(uiLocale) === 'en', 'reload 后英文偏好')
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr')
    checks.push('persisted-en-restored')
  } else if (stage === 'stored-invalid') {
    assert(get(uiLocale) === bootstrap.initialLocale, '非法偏好回退 bootstrap')
    localStorage.removeItem(LOCALE_STORAGE_KEY)
    checks.push('invalid-storage-fallback')
  } else throw new Error('无效 localization smoke stage')
  return {
    stage,
    bootstrap: bootstrap.initialLocale,
    effectiveLocale: get(uiLocale),
    bootToken,
    checks,
  }
}
