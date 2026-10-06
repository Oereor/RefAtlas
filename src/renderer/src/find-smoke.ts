import { tick } from 'svelte'
import { workspace } from './state/app-state'
import { changeUiLocale, messages } from './i18n'
import type { RawBridge, RelativePath } from '../../shared/raw'
const browser = workspace.browser,
  find = browser.find
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error('Find smoke: ' + code)
}
async function wait(check: () => boolean) {
  const start = performance.now()
  while (!check()) {
    assert(
      performance.now() - start < 3000,
      'NATIVE_STATE_TIMEOUT:' +
        JSON.stringify({
          status: find.snapshot.status,
          busy: find.snapshot.busy,
          error: find.snapshot.error,
          pointer: browser.snapshot.current?.address.pointer,
          focus: document.activeElement?.outerHTML.slice(0, 180),
        }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await tick()
}
async function ready() {
  await new Promise<void>((resolve) => {
    let done = false
    const unsub = browser.changes.subscribe((state) => {
      if (!state.busy)
        void tick().then(() => {
          if (!done && !browser.snapshot.busy) {
            done = true
            unsub()
            resolve()
          }
        })
    })
  })
  assert(!browser.snapshot.error, 'BROWSER_ERROR:' + JSON.stringify(browser.snapshot.error))
}
async function finding() {
  await new Promise<void>((resolve) => {
    let done = false
    const unsub = find.changes.subscribe((state) => {
      if (!state.busy && state.status !== 'debouncing')
        void tick().then(() => {
          if (!done && !find.snapshot.busy && find.snapshot.status !== 'debouncing') {
            done = true
            unsub()
            resolve()
          }
        })
    })
  })
  assert(!find.snapshot.error, 'QUERY_ERROR:' + JSON.stringify(find.snapshot.error))
  await ready()
}
async function activate(path: string) {
  await workspace.session.activate({
    workspaceId: workspace.snapshot.workspaceId!,
    relativePath: path as RelativePath,
  })
  await ready()
  assert(workspace.session.snapshot.active?.source.relativePath === path, 'ACTIVATION_' + path)
}
const input = () => document.querySelector<HTMLInputElement>('[data-find-input]')!
const pointer = () => browser.snapshot.current?.address.pointer
function query(text: string) {
  input().value = text
  input().dispatchEvent(new Event('input', { bubbles: true }))
}
let saved: { current: unknown; selected: unknown; active: unknown } | null = null
let shortcuts = 0,
  prevented = 0,
  trusted = 0,
  escapeAt = 0,
  settledAt = 0,
  pending = 0
let revision: string | null = null
let restore: (() => void) | null = null
let frames = 0,
  animation = 0
const keyObserved = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    shortcuts++
    if (event.defaultPrevented) prevented++
    if (event.isTrusted) trusted++
  }
}
const escapeObserved = (event: KeyboardEvent) => {
  if (event.key === 'Escape') escapeAt = performance.now()
}
export async function runFindSmoke(stage: string): Promise<unknown> {
  if (stage === 'prepare') {
    await activate('find.json')
    browser.select(browser.snapshot.children[0])
    document.querySelector<HTMLElement>('tbody tr')!.focus()
    saved = {
      current: browser.snapshot.current,
      selected: browser.snapshot.selectedChild,
      active: workspace.session.snapshot.active,
    }
    document.addEventListener('keydown', keyObserved)
    document.addEventListener('keydown', escapeObserved, true)
    return { stage }
  }
  if (stage === 'opened') {
    await wait(() => find.snapshot.open && document.activeElement === input())
    assert(
      browser.snapshot.current === saved!.current &&
        browser.snapshot.selectedChild === saved!.selected &&
        workspace.session.snapshot.active === saved!.active,
      'OPEN_PRESERVES_BROWSER',
    )
    assert(shortcuts === 1 && prevented === 1 && trusted === 1, 'NATIVE_SHORTCUT_PREVENTED')
    return { stage, shortcuts, prevented, trusted }
  }
  if (stage === 'typed') {
    await wait(() => find.snapshot.query === '1407')
    await finding()
    assert(pointer() === '/SkillID', 'AUTO_FIRST_MATCH')
    assert(document.activeElement === input(), 'INPUT_FOCUS_RETAINED')
    assert(
      document.querySelector('[data-inspector-pointer]')?.getAttribute('data-inspector-pointer') ===
        '/SkillID',
      'INSPECTOR_MATCH',
    )
    return {
      stage,
      pointer: pointer(),
      matches: find.snapshot.matches.length,
      complete: find.snapshot.complete,
    }
  }
  if (stage === 'next') {
    await wait(() => find.snapshot.position === 1 && !find.snapshot.busy)
    assert(pointer() === '/related', 'ENTER_NEXT')
    assert(document.activeElement === input(), 'NEXT_FOCUS')
    return { stage }
  }
  if (stage === 'previous') {
    await wait(() => find.snapshot.position === 0 && !find.snapshot.busy)
    assert(pointer() === '/SkillID', 'SHIFT_ENTER_PREVIOUS')
    return { stage }
  }
  if (stage === 'locale-layout') {
    const matches = find.snapshot.matches,
      original = input().value,
      current = browser.snapshot.current
    for (const locale of ['zh-CN', 'en'] as const) {
      changeUiLocale(locale)
      await tick()
      assert(
        input().value === original &&
          find.snapshot.matches === matches &&
          browser.snapshot.current === current,
        'LOCALE_RAW_CONTINUITY',
      )
      assert(
        input().getAttribute('aria-label') === messages.find_input({}, { locale }),
        'LOCALIZED_INPUT',
      )
      assert(document.activeElement === input(), 'LOCALE_FOCUS')
    }
    return { stage, checks: ['locale-query-match-focus-continuity', 'bounded-find-bar'] }
  }
  if (stage === 'closed') {
    await wait(
      () => !find.snapshot.open && !!document.activeElement?.hasAttribute('data-scalar-value'),
    )
    assert(pointer() === '/SkillID', 'ESCAPE_PRESERVES_NODE')
    assert(document.activeElement?.hasAttribute('data-scalar-value'), 'RESTORED_CURRENT_FOCUS')
    return { stage }
  }
  if (stage === 'explicit-opened') {
    await wait(() => find.snapshot.open)
    await finding()
    assert(find.snapshot.query === '1407', 'REOPEN_QUERY')
    return { stage }
  }
  if (stage === 'button-next') {
    await wait(() => find.snapshot.position === 1 && !find.snapshot.busy)
    assert(pointer() === '/related', 'BUTTON_NEXT')
    return { stage }
  }
  if (stage === 'button-previous') {
    await wait(() => find.snapshot.position === 0 && !find.snapshot.busy)
    return { stage }
  }
  if (stage === 'button-closed') {
    await wait(() => !find.snapshot.open)
    return { stage }
  }
  if (stage === 'container-match') {
    find.open()
    await tick()
    query('entries')
    await find.next()
    await finding()
    assert(
      pointer() === '/entries' && browser.snapshot.current?.kind === 'array',
      'CONTAINER_KEY_TARGET',
    )
    assert(document.querySelector('.node-browser table'), 'CONTAINER_BROWSER')
    assert(
      document.querySelector('[data-inspector-pointer]')?.getAttribute('data-inspector-pointer') ===
        '/entries',
      'CONTAINER_INSPECTOR',
    )
    assert(
      document.querySelector('.node-browser nav [aria-current]')?.getAttribute('data-pointer') ===
        '/entries',
      'CONTAINER_BREADCRUMB',
    )
    assert(document.activeElement === input(), 'CONTAINER_INPUT_FOCUS')
    find.close()
    return { stage, pointer: pointer() }
  }
  if (stage === 'source-switch') {
    find.open()
    await tick()
    query('__pending_switch__')
    await activate('other.json')
    assert(
      !find.snapshot.open && find.snapshot.query === '' && find.snapshot.matches.length === 0,
      'SOURCE_SWITCH_CLEARS',
    )
    return { stage }
  }
  if (stage === 'stale-prepare') {
    await activate('find.json')
    find.open()
    await tick()
    query('1407')
    await find.next()
    await finding()
    revision = browser.snapshot.revision
    return { stage }
  }
  if (stage === 'stale') {
    await wait(() => workspace.session.snapshot.active?.info.state === 'stale')
    assert(find.snapshot.matches.length === 0 && input().readOnly, 'STALE_FIND_BOUNDARY')
    assert(
      document.querySelector<HTMLButtonElement>('[data-action="find-next"]')?.disabled,
      'STALE_DISABLED',
    )
    return { stage }
  }
  if (stage === 'reloaded') {
    await wait(
      () => !workspace.session.snapshot.reloading && browser.snapshot.revision !== revision,
    )
    await ready()
    assert(
      find.snapshot.query === '1407' && find.snapshot.matches.length === 0,
      'RELOAD_NO_OLD_MATCH',
    )
    assert(find.snapshot.status === 'idle', 'RELOAD_REQUIRES_EXPLICIT_FIND')
    return { stage }
  }
  if (stage === 'real-data') {
    const reports = []
    for (const [path, text] of [
      ['ExcelOutput/AvatarConfig.json', 'AvatarID'],
      ['ExcelOutput/AvatarSkillConfig.json', '1407'],
      ['TextMap/TextMapCHS.json', '攻击'],
    ]) {
      await activate(path)
      find.open()
      await tick()
      query(text)
      const started = performance.now()
      await find.next()
      await finding()
      assert(find.snapshot.position === 0, 'REAL_MATCH')
      const match = find.snapshot.matches[0]
      assert(pointer() === match.address.pointer, 'REAL_EXACT_NAVIGATION')
      reports.push({
        path,
        query: text,
        pointer: pointer(),
        elapsedMs: performance.now() - started,
        count: find.snapshot.matches.length,
        complete: find.snapshot.complete,
      })
      find.close()
    }
    const bridgeTarget = find as unknown as { bridge: RawBridge }
    const original = bridgeTarget.bridge
    bridgeTarget.bridge = {
      ...original,
      findInSource: async (args) => {
        pending++
        try {
          return await original.findInSource(args)
        } finally {
          pending--
          settledAt = performance.now()
        }
      },
    }
    restore = () => {
      bridgeTarget.bridge = original
    }
    find.open()
    await tick()
    input().focus()
    input().select()
    frames = 0
    const frame = () => {
      frames++
      animation = requestAnimationFrame(frame)
    }
    animation = requestAnimationFrame(frame)
    return { stage, reports }
  }
  if (stage === 'large-started') {
    await wait(
      () =>
        find.snapshot.query === '__large_no_match__' &&
        find.snapshot.status === 'searching' &&
        pending > 0,
    )
    return { stage }
  }
  if (stage === 'large-canceled') {
    await wait(() => !find.snapshot.open && pending === 0)
    cancelAnimationFrame(animation)
    restore?.()
    restore = null
    assert(escapeAt > 0 && settledAt >= escapeAt, 'CANCEL_SETTLED')
    assert(frames > 0, 'RENDERER_FRAMES_DURING_FIND')
    return { stage, cancelMs: settledAt - escapeAt, frames }
  }
  if (stage === 'finish') {
    find.close()
    document.removeEventListener('keydown', keyObserved)
    document.removeEventListener('keydown', escapeObserved, true)
    restore?.()
    return {
      stage,
      checks: [
        'structured-facts',
        'native-shortcut-typing-enter-shift-enter-escape',
        'next-previous-buttons',
        'source-revision-stale-reload',
        'focus-locale-continuity',
      ],
    }
  }
  throw new Error('Unknown Find stage ' + stage)
}
