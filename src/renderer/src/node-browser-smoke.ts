import { tick } from 'svelte'
import { get } from 'svelte/store'
import { workspace } from './state/app-state'
import { changeUiLocale, uiLocale } from './i18n'
import { scalarText } from './browser/node-browser-model'
import type { JsonPointer, RelativePath } from '../../shared/raw'

const browser = workspace.browser
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error('node browser smoke: ' + code)
}
async function inputObserved(check: () => boolean) {
  const deadline = performance.now() + 3000
  while (!check()) {
    assert(performance.now() < deadline, 'NATIVE_INPUT_NOT_OBSERVED')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await tick()
}
async function ready() {
  // Follow controller completion; real requests retain the existing IPC/work/runner deadlines.
  await new Promise<void>((resolve) => {
    let done = false
    const unsubscribe = browser.changes.subscribe((state) => {
      if (!state.busy)
        void tick().then(() => {
          if (!done && !browser.snapshot.busy) {
            done = true
            unsubscribe()
            resolve()
          }
        })
    })
  })
  await tick()
  assert(
    !browser.snapshot.error,
    'REQUEST_' +
      browser.snapshot.source?.relativePath +
      ':' +
      browser.snapshot.current?.address.pointer +
      ':' +
      browser.snapshot.error?.code,
  )
}

const rows = () => [...document.querySelectorAll<HTMLElement>('table tbody tr[data-node-pointer]')]
const button = (action: string) => {
  const element = document.querySelector<HTMLButtonElement>('[data-action="' + action + '"]')
  assert(element, 'BUTTON_' + action)
  return element
}
const ordinal = () => browser.snapshot.children[0]?.ordinal
const current = () => browser.snapshot.current!.address.pointer
function row(pointer: string) {
  const element = rows().find((row) => row.dataset.nodePointer === pointer)
  assert(element, 'ROW_' + pointer)
  return element
}
async function open(pointer: string) {
  row(pointer).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await ready()
  assert(current() === pointer, 'NAVIGATED_' + pointer)
}
async function root() {
  const element = document.querySelector<HTMLButtonElement>(
    'nav.breadcrumb button[data-pointer=""]',
  )
  assert(element && !element.disabled, 'ROOT_BREADCRUMB')
  element.click()
  await ready()
  assert(current() === '', 'ROOT_LOCATION')
}
async function activate(relativePath: string) {
  const start = performance.now()
  let rootCommittedAt: number | null = null
  const unsubscribe = workspace.session.changes.subscribe(({ active }) => {
    if (active?.source.relativePath === relativePath && rootCommittedAt === null)
      rootCommittedAt = performance.now()
  })
  await workspace.session.activate({
    workspaceId: workspace.snapshot.workspaceId!,
    relativePath: relativePath as RelativePath,
  })
  await ready()
  unsubscribe()
  assert(
    workspace.session.snapshot.active?.source.relativePath === relativePath,
    'ACTIVATION_' + relativePath,
  )
  return {
    rootCommitMs: rootCommittedAt! - start,
    firstViewAfterRootMs: performance.now() - rootCommittedAt!,
  }
}
const inspector = () => document.querySelector<HTMLElement>('[data-inspector-pointer]')!
const value = () => document.querySelector<HTMLElement>('[data-scalar-value]')?.textContent
const metrics: Record<string, number> = {}
export async function runNodeBrowserSmoke(stage: string): Promise<unknown> {
  if (stage === 'initial') {
    await workspace.open()
    const start = performance.now()
    await activate('node-browser.json')
    metrics.rootAndChildrenMs = performance.now() - start
    assert(current() === '' && rows().length === 9, 'ROOT_TABLE')
    assert(document.querySelectorAll('table th[scope=col]').length === 4, 'TABLE_HEADERS')
    assert(button('inspector-toggle').getAttribute('aria-expanded') === 'true', 'INSPECTOR_DEFAULT')
    assert(inspector().dataset.inspectorPointer === '', 'INSPECTOR_CURRENT')
    rows()[0].focus()
    return {
      stage,
      checks: ['root-header', 'direct-children', 'table-headers', 'inspector-current'],
      rootAndChildrenMs: metrics.rootAndChildrenMs,
    }
  }
  if (stage === 'table-end' || stage === 'table-home') {
    await inputObserved(
      () => document.activeElement === (stage === 'table-end' ? rows().at(-1) : rows()[0]),
    )
    const expected = stage === 'table-end' ? rows().at(-1)! : rows()[0]
    assert(document.activeElement === expected, 'TABLE_HOME_END_FOCUS')
    assert(current() === '', 'TABLE_KEYBOARD_SELECT_ONLY')
    return { stage, checks: ['table-home-end-up-down-focus'] }
  }
  if (stage === 'selected') {
    await inputObserved(() => browser.snapshot.selectedChild?.key === 'z')
    assert(current() === '' && browser.snapshot.selectedChild?.key === 'z', 'ARROW_SELECT_ONLY')
    assert(document.activeElement?.getAttribute('aria-selected') === 'true', 'ROW_ARIA')
    assert(inspector().dataset.inspectorPointer === '/z', 'INSPECTOR_SELECTED')
    return {
      stage,
      checks: ['keyboard-selection-separate', 'selected-row-aria', 'inspector-child'],
    }
  }
  if (stage === 'scalar') {
    await inputObserved(() => current() === '/z')
    await ready()
    await inputObserved(() => document.activeElement?.hasAttribute('data-scalar-value') === true)
    assert(current() === '/z' && value() === '-0', 'ENTER_EXACT_SCALAR')
    assert(document.activeElement?.hasAttribute('data-scalar-value'), 'NAVIGATION_FOCUS')
    assert(browser.snapshot.selectedChild === null, 'CLEAR_SELECTION')
    return {
      stage,
      checks: ['enter-navigation', 'exact-negative-zero', 'value-focus', 'selection-cleared'],
    }
  }
  if (stage === 'parent') {
    await inputObserved(() => current() === '')
    await ready()
    await inputObserved(() => document.activeElement === rows()[0])
    assert(current() === '' && rows().length === 9, 'ALT_LEFT_PARENT')
    assert(document.activeElement === rows()[0], 'TABLE_FOCUS')
    return { stage, checks: ['alt-left-parent', 'table-focus'] }
  }
  if (stage === 'flow') {
    const begin = performance.now()
    const selectionStart = performance.now()
    row('/d').click()
    await tick()
    metrics.inspectorUpdateMs = performance.now() - selectionStart
    assert(current() === '' && inspector().dataset.inspectorPointer === '/d', 'CLICK_SELECTION')
    assert(row('/d').textContent?.includes('1.00'), 'PREVIEW_LEXEME')
    button('inspector-open').click()
    await ready()
    assert(value() === '1.00', 'OPEN_NODE_LEXEME')
    await root()
    await open('/n')
    assert(value() === '16752756560315677817', 'LARGE_INTEGER')
    await root()
    await open('/a~0b~1c')
    await open('/a~0b~1c/')
    await open('/a~0b~1c//0')
    assert(
      value() === '1e+3' && browser.snapshot.context?.parentKind === 'object',
      'NUMERIC_KEY_OBJECT',
    )
    const crumbs = [...document.querySelectorAll<HTMLButtonElement>('nav.breadcrumb button')]
    assert(
      crumbs.length === 4 &&
        crumbs[1].textContent?.trim() === 'a~b/c' &&
        crumbs[2].textContent?.trim() === '' &&
        crumbs[3].textContent?.trim() === '0',
      'DECODED_BREADCRUMB',
    )
    assert(crumbs[2].getAttribute('aria-label'), 'EMPTY_KEY_NAME')
    crumbs[1].click()
    await ready()
    assert(current() === '/a~0b~1c', 'ANCESTOR_CLICK')
    await root()
    await open('/entries')
    assert(rows().length === 100 && ordinal() === 0, 'FIRST_PAGE')
    const next = performance.now()
    button('node-next').click()
    await ready()
    metrics.nextPageMs = performance.now() - next
    assert(rows().length === 100 && ordinal() === 100, 'NEXT_REPLACES')
    button('node-next').click()
    await ready()
    assert(rows().length === 5 && button('node-next').disabled, 'LAST_PAGE')
    button('node-previous').click()
    await ready()
    assert(ordinal() === 100, 'PREVIOUS_CURSOR')
    await root()
    await open('/long')
    const first = browser.snapshot.segment!.text
    assert([...first].length === 4096, 'SEGMENT_LIMIT')
    const segment = performance.now()
    button('node-next').click()
    await ready()
    metrics.segmentMs = performance.now() - segment
    assert(
      browser.snapshot.history[browser.snapshot.position].number === 2 &&
        browser.snapshot.segment!.text !== first,
      'NEXT_SEGMENT',
    )
    button('node-previous').click()
    await ready()
    assert(browser.snapshot.segment!.text === first, 'PREVIOUS_SEGMENT')
    const location = current(),
      session = workspace.session.snapshot.active,
      payload = browser.snapshot.segment
    for (const locale of ['en', 'zh-CN', 'en', 'zh-CN'] as const) {
      changeUiLocale(locale)
      await tick()
      assert(
        current() === location &&
          workspace.session.snapshot.active === session &&
          browser.snapshot.segment === payload,
        'LOCALE_SEGMENT_STATE',
      )
    }
    await root()
    row('/n').click()
    await tick()
    const children = browser.snapshot.children,
      selected = browser.snapshot.selectedChild,
      scroll = document.querySelector('.table-scroll')!.scrollTop,
      focus = row('/n')
    focus.focus()
    for (const locale of ['en', 'zh-CN'] as const) {
      changeUiLocale(locale)
      await tick()
      assert(
        browser.snapshot.children === children &&
          browser.snapshot.selectedChild === selected &&
          document.activeElement === focus &&
          document.querySelector('.table-scroll')!.scrollTop === scroll &&
          button('inspector-toggle').getAttribute('aria-expanded') === 'true',
        'LOCALE_TABLE_STATE',
      )
    }
    metrics.navigationSequenceMs = performance.now() - begin
    return {
      stage,
      checks: [
        'click-vs-navigation',
        'inspector-open',
        'all-numeric-lexemes',
        'special-keys-breadcrumb',
        'previous-next-replacement',
        'segment-pagination',
        'locale-node-page-segment-inspector-focus',
      ],
      ...metrics,
    }
  }
  if (stage === 'narrow') {
    await tick()
    assert(
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      'WINDOW_OVERFLOW',
    )
    const region = document.querySelector<HTMLElement>('main.node-browser')!,
      wide = region.getBoundingClientRect().width
    button('inspector-toggle').click()
    await tick()
    assert(region.getBoundingClientRect().width > wide + 200, 'INSPECTOR_COLLAPSE_WIDTH')
    const locale = get(uiLocale)
    changeUiLocale(locale === 'en' ? 'zh-CN' : 'en')
    await tick()
    assert(button('inspector-toggle').getAttribute('aria-expanded') === 'false', 'COLLAPSE_LOCALE')
    button('inspector-toggle').click()
    await tick()
    return {
      stage,
      checks: ['900x600-overflow', 'inspector-collapse', 'locale-collapse-preserved'],
    }
  }
  if (stage === 'root-kinds') {
    const roots = [
      ['object', '{}'],
      ['array', '[]'],
      ['number', '1.00'],
      ['string', '中文🙂'],
      ['boolean', 'true'],
      ['null', 'null'],
    ]
    for (const [kind, text] of roots) {
      await activate('node-browser-roots/' + kind + '.json')
      assert(browser.snapshot.current?.kind === kind && current() === '', 'ROOT_' + kind)
      if (kind === 'object' || kind === 'array')
        assert(document.querySelector('[data-empty-container]'), 'EMPTY_' + kind)
      else assert(value() === text, 'ROOT_VALUE_' + kind)
    }
    await activate('node-browser.json')
    await workspace.session.activate({
      workspaceId: workspace.snapshot.workspaceId!,
      relativePath: 'huge.json' as RelativePath,
    })
    assert(
      workspace.session.snapshot.error?.code === 'RESOURCE_LIMIT' &&
        workspace.session.snapshot.active?.source.relativePath === 'node-browser.json',
      'RESOURCE_FAILURE_PRESERVES',
    )
    await activate('node-browser.json')
    await open('/entries')
    return {
      stage,
      checks: ['six-root-kinds', 'empty-container', 'resource-limit-preserves-source'],
    }
  }
  if (stage === 'stale') {
    const before = browser.snapshot.children
    button('node-next').click()
    const deadline = performance.now() + 3000
    while (workspace.session.snapshot.active?.info.state !== 'stale') {
      assert(performance.now() < deadline, 'STALE_TIMEOUT')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await tick()
    assert(browser.snapshot.children === before && rows().length === 100, 'STALE_RETAINS')
    assert(
      button('node-next').disabled && button('node-previous').disabled,
      'STALE_PAGINATION_DISABLED',
    )
    assert(
      [...document.querySelectorAll<HTMLButtonElement>('nav.breadcrumb button')].every(
        (button) => button.disabled,
      ),
      'STALE_BREADCRUMB_DISABLED',
    )
    row('/entries/0').click()
    await tick()
    assert(button('inspector-open').disabled, 'STALE_OPEN_DISABLED')
    return {
      stage,
      checks: ['source-changed-single-stale', 'old-content-retained', 'stale-navigation-disabled'],
    }
  }
  if (stage === 'real-data') {
    await workspace.open()
    const reports: unknown[] = []
    for (const file of [
      'ExcelOutput/AvatarConfig.json',
      'ExcelOutput/EquipmentConfig.json',
      'ExcelOutput/AvatarSkillConfig.json',
    ]) {
      const start = performance.now()
      const activation = await activate(file)
      const rootMs = performance.now() - start,
        count = browser.snapshot.current!.childCount
      assert(
        browser.snapshot.current?.kind === 'array' && rows().length <= 100 && rows().length > 0,
        'REAL_ARRAY',
      )
      if (browser.snapshot.nextCursor) {
        const before = browser.snapshot.children
        button('node-next').click()
        await ready()
        assert(browser.snapshot.children !== before && rows().length <= 100, 'REAL_NEXT')
        button('node-previous').click()
        await ready()
        assert(ordinal() === 0, 'REAL_PREVIOUS')
      }
      row('/0').click()
      await tick()
      assert(
        inspector().dataset.inspectorPointer === '/0' && current() === '',
        'REAL_INSPECTOR_SELECT',
      )
      await open('/0')
      const child = browser.snapshot.children.find(
        (child) => !['array', 'object'].includes(child.node.kind),
      )
      assert(child, 'REAL_SCALAR_CHILD')
      const pointer = child.node.address.pointer,
        nav = performance.now()
      await open(pointer)
      assert(
        browser.snapshot.scalar && value() === scalarText(browser.snapshot.scalar),
        'REAL_RAW_SCALAR',
      )
      const scalarMs = performance.now() - nav
      await root()
      assert(current() === '', 'REAL_BREADCRUMB_ROOT')
      reports.push({ file, count, pointer, rootAndChildrenMs: rootMs, ...activation, scalarMs })
    }
    for (const [file, pointer] of [
      ['TextMap/TextMapCHS.json', ''],
      ['Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json', '/DimensionList'],
      ['Config/SoundBankLookUp.json', '/Events'],
    ]) {
      await activate(file)
      if (pointer)
        await browser.navigate({
          source: browser.snapshot.source!,
          pointer: pointer as JsonPointer,
        })
      await ready()
      assert(rows().length > 0 && rows().length <= 100, 'REAL_REPRESENTATIVE_PAGE')
      reports.push({ file, pointer, rows: rows().length })
    }
    return {
      stage,
      checks: [
        'actual-controller-ui-real-sources',
        'first-children',
        'real-next-previous',
        'inspector-selection',
        'container-scalar-navigation',
        'breadcrumb-return',
        'six-representative-sources',
      ],
      sources: reports,
    }
  }
  throw new Error('unknown NodeBrowser stage ' + stage)
}
