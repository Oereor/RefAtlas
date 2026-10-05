import { tick } from 'svelte'
import { workspace } from './state/app-state'
import { changeUiLocale, messages } from './i18n'
const locator = workspace.locator
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error('locator smoke: ' + code)
}
async function wait(check: () => boolean, milliseconds = 3000) {
  const deadline = performance.now() + milliseconds
  while (!check()) {
    assert(
      locator.snapshot.status !== 'error',
      'CATALOG_QUERY_FAILED:' + JSON.stringify(locator.snapshot.error),
    )
    assert(
      performance.now() < deadline,
      'WAIT_TIMEOUT:' +
        JSON.stringify({
          status: locator.snapshot.status,
          error: locator.snapshot.error,
          query: locator.snapshot.query,
          selected: locator.snapshot.selected,
          focus: document.activeElement?.outerHTML.slice(0, 300),
        }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await tick()
}
const input = () => document.querySelector<HTMLInputElement>('[data-action="locator-query"]')!
const dialog = () => document.querySelector<HTMLDialogElement>('.source-locator')!
function setQuery(query: string) {
  input().value = query
  input().dispatchEvent(new Event('input', { bubbles: true }))
}
let saved: { explorer: unknown; active: unknown; browser: unknown; focus: Element | null } | null =
  null
let shortcuts = 0,
  prevented = 0,
  prints = 0
let expected = ''
let previousGeneration: string | null = null
let previousActive: unknown = null
const keyObserved = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
    shortcuts++
    if (event.defaultPrevented) prevented++
  }
}
const printObserved = () => {
  prints++
}
export async function runSourceLocatorSmoke(stage: string): Promise<unknown> {
  if (stage === 'diagnostics')
    return {
      query: locator.snapshot.query,
      status: locator.snapshot.status,
      error: locator.snapshot.error,
      pendingSource: workspace.session.snapshot.pending,
      sessionError: workspace.session.snapshot.error,
      browserBusy: workspace.browser.snapshot.busy,
    }
  if (stage === 'prepare') {
    locator.open()
    locator.refresh()
    await wait(() => locator.snapshot.status === 'ready', 65000)
    locator.close()
    await tick()
    document.addEventListener('keydown', keyObserved)
    window.addEventListener('beforeprint', printObserved)
    const button = document.querySelector<HTMLButtonElement>('[data-action="open-locator"]')!
    button.focus()
    saved = {
      explorer: workspace.explorer.snapshot,
      active: workspace.session.snapshot.active,
      browser: workspace.browser.snapshot,
      focus: document.activeElement,
    }
    return { stage }
  }
  if (stage === 'opened') {
    await wait(() => dialog().open && document.activeElement === input())
    assert(locator.snapshot.query === '' && locator.snapshot.items.length === 0, 'EMPTY_PROMPT')
    return { stage, checks: ['native-shortcut', 'modal', 'input-focus', 'empty-prompt'] }
  }
  if (stage === 'results') {
    await wait(
      () => locator.snapshot.status === 'ready' && locator.snapshot.query === 'json',
      65000,
    )
    assert(
      locator.snapshot.items.length === 50 && locator.snapshot.truncated,
      'BOUNDED_BROAD_RESULTS',
    )
    assert(document.querySelectorAll('[data-locator-source]').length === 50, 'BOUNDED_DOM')
    assert(
      document.querySelector('[role=combobox]')?.getAttribute('aria-activedescendant') ===
        'source-locator-option-0',
      'ACTIVE_DESCENDANT',
    )
    return {
      stage,
      checks: ['native-text-input', 'bounded-results', 'truncated', 'listbox-options'],
    }
  }
  if (stage === 'down' || stage === 'up') {
    await wait(() => locator.snapshot.selected === (stage === 'down' ? 1 : 0))
    return { stage, checks: ['native-arrows', 'selection'] }
  }
  if (stage === 'tab-refresh' || stage === 'tab-close' || stage === 'tab-input') {
    const action =
      stage === 'tab-refresh'
        ? 'refresh-locator'
        : stage === 'tab-close'
          ? 'close-locator'
          : 'locator-query'
    await wait(() => document.activeElement?.getAttribute('data-action') === action)
    assert(dialog().contains(document.activeElement), 'TAB_CONTAINED')
    return { stage, checks: ['native-tab', 'focus-contained'] }
  }
  if (stage === 'locale-layout') {
    const query = locator.snapshot.query,
      items = locator.snapshot.items
    for (const locale of ['en', 'zh-CN'] as const) {
      changeUiLocale(locale)
      await tick()
      assert(
        document.getElementById('source-locator-title')!.textContent ===
          messages.locator_title({}, { locale }),
        'LOCALE_MESSAGE',
      )
      assert(locator.snapshot.query === query && locator.snapshot.items === items, 'RAW_CONTINUITY')
      assert(input().value === query && document.activeElement === input(), 'INPUT_CONTINUITY')
    }
    assert(
      dialog().getBoundingClientRect().right <= innerWidth &&
        dialog().getBoundingClientRect().bottom <= innerHeight,
      'DIALOG_FITS',
    )
    assert(
      !document.querySelector('vite-error-overlay') && document.body.innerText.length > 0,
      'PAGE_HEALTH',
    )
    return { stage, checks: ['locale-switch', 'raw-path-preserved', 'layout', 'no-overlay'] }
  }
  if (stage === 'cancelled') {
    await wait(() => !dialog().open)
    assert(
      workspace.explorer.snapshot === saved!.explorer &&
        workspace.session.snapshot.active === saved!.active &&
        workspace.browser.snapshot === saved!.browser,
      'CANCEL_PRESERVES_VIEWS',
    )
    assert(document.activeElement === saved!.focus, 'FOCUS_RESTORED')
    return { stage, checks: ['native-escape', 'state-preserved', 'focus-restored'] }
  }
  if (stage === 'enter-ready') {
    locator.open()
    await tick()
    setQuery('node-browser.json')
    await wait(() => locator.snapshot.status === 'ready' && locator.snapshot.items.length > 0)
    expected = locator.snapshot.items[0].source.relativePath
    return { stage }
  }
  if (stage === 'enter-activated') {
    await wait(
      () =>
        !locator.snapshot.open &&
        workspace.session.snapshot.active?.source.relativePath === expected &&
        !workspace.session.snapshot.pending,
    )
    assert(workspace.session.snapshot.active!.root.kind === 'object', 'ROOT_LOADED')
    assert(workspace.explorer.snapshot === saved!.explorer, 'EXPLORER_UNCHANGED')
    return { stage, checks: ['native-enter', 'existing-session-activation', 'root-loaded'] }
  }
  if (stage === 'click-ready') {
    locator.open()
    await tick()
    setQuery('bad.json')
    await wait(() => locator.snapshot.status === 'ready' && locator.snapshot.items.length === 1)
    previousGeneration = locator.snapshot.catalogGeneration
    return { stage }
  }
  if (stage === 'click-refreshed') {
    await wait(
      () =>
        locator.snapshot.status === 'ready' &&
        locator.snapshot.catalogGeneration !== previousGeneration,
      65000,
    )
    previousActive = workspace.session.snapshot.active
    return { stage }
  }
  if (stage === 'click-failed') {
    await wait(() => workspace.session.snapshot.error?.code === 'INVALID_JSON')
    assert(
      workspace.session.snapshot.active === previousActive,
      'ACTIVATION_FAILURE_PRESERVES_SOURCE',
    )
    locator.open()
    await tick()
    setQuery('说明🙂')
    await wait(() => locator.snapshot.status === 'ready' && locator.snapshot.items.length === 1)
    expected = locator.snapshot.items[0].source.relativePath
    return { stage }
  }
  if (stage === 'click-refresh') {
    await wait(() => workspace.session.snapshot.active?.source.relativePath === expected)
    assert(workspace.session.snapshot.active!.root.kind === 'null', 'CLICK_ROOT_LOADED')
    const active = document.querySelector<HTMLElement>('[data-source="' + expected + '"]')
    assert(active?.dataset.active === 'true', 'MATERIALIZED_ACTIVE_INDICATOR')
    return {
      stage,
      checks: [
        'explicit-refresh',
        'native-click-activation',
        'activation-failure-preserves-source',
        'natural-active-indicator',
      ],
    }
  }
  if (stage === 'real-data') {
    const reports = []
    locator.open()
    await tick()
    for (const query of ['AvatarSkill', 'MonsterSkill', 'TextMapCHS']) {
      setQuery(query)
      const started = performance.now()
      await wait(() => locator.snapshot.status === 'ready', 65000)
      const path =
        query === 'TextMapCHS' ? 'TextMap/TextMapCHS.json' : 'ExcelOutput/' + query + 'Config.json'
      const index = locator.snapshot.items.findIndex((item) => item.source.relativePath === path)
      assert(index >= 0, 'REAL_SOURCE_' + query)
      const queryMs = performance.now() - started
      await locator.activate(index)
      // Activation commits the root before the existing NodeBrowser's bounded first-page read.
      // Follow controller completion, as the real NodeBrowser gate does; IPC retains its deadline.
      await new Promise<void>((resolve) => {
        let done = false
        const unsubscribe = workspace.browser.changes.subscribe((state) => {
          if (!state.busy)
            void tick().then(() => {
              if (!done && !workspace.browser.snapshot.busy) {
                done = true
                unsubscribe()
                resolve()
              }
            })
        })
      })
      assert(
        !workspace.browser.snapshot.error,
        'REAL_BROWSER_ERROR:' + JSON.stringify(workspace.browser.snapshot.error),
      )
      assert(
        workspace.session.snapshot.active?.source.relativePath === path &&
          workspace.browser.snapshot.current?.address.pointer === '',
        'REAL_ACTIVATION_' + query,
      )
      reports.push({ query, path, queryMs })
      locator.open()
      await tick()
    }
    locator.close()
    await tick()
    return {
      stage,
      checks: ['real-paths', 'real-source-activation', 'root-node-browser'],
      queries: reports,
    }
  }
  if (stage === 'finish') {
    document.removeEventListener('keydown', keyObserved)
    window.removeEventListener('beforeprint', printObserved)
    assert(shortcuts > 0 && shortcuts === prevented && prints === 0, 'PRINT_NOT_INTERCEPTED')
    return {
      stage,
      checks: ['shortcut-default-prevented', 'no-print-event'],
      shortcuts,
      prevented,
      prints,
    }
  }
  throw Error('unknown locator stage ' + stage)
}
