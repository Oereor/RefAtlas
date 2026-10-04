import { mount, tick, unmount } from 'svelte'
import SourceExplorer from './explorer/SourceExplorer.svelte'
import { ExplorerController } from './explorer/explorer-controller'
import { SourceSession } from './state/source-session'
import { workspace } from './state/app-state'
import { changeUiLocale, uiLocale } from './i18n'
import { get } from 'svelte/store'
import type { DirectoryPath, JsonPointer, RawBridge, RelativePath } from '../../shared/raw'

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error('explorer smoke: ' + code)
}
async function waitFor(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 3000
  while (!check()) {
    assert(performance.now() < deadline, 'UI_SETTLE_TIMEOUT')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await tick()
}
const path = (value: string) => value as DirectoryPath
const activeOf = (session: SourceSession) => session.snapshot.active
const rows = () => [...document.querySelectorAll<HTMLElement>('.tree-row')]
const tree = () => document.querySelector<HTMLElement>('[role=tree]')!
function folder(name: string, parent = '') {
  const entry = workspace.explorer.snapshot.directories
    .get(path(parent))
    ?.entries.find((item) => item.entry.name === name)
  assert(entry?.entry.kind === 'directory', 'DIRECTORY_ENTRY_' + name)
  return entry
}
async function expand(name: string, parent = ''): Promise<void> {
  const entry = folder(name, parent)
  if (entry.entry.kind === 'directory') await workspace.explorer.expand(entry.entry.path, entry.id)
  await tick()
}
async function full(directory: string): Promise<void> {
  while (workspace.explorer.snapshot.directories.get(path(directory))?.nextCursor) {
    await workspace.explorer.more(path(directory))
    assert(!workspace.explorer.snapshot.directories.get(path(directory))?.error, 'PAGE_FAILED')
    await waitFor(() => !workspace.explorer.snapshot.directories.get(path(directory))!.paging)
  }
}
let selectedBeforeKeyboard: string | null = null
let firstActiveRevision = ''

export async function runExplorerSmoke(stage: string): Promise<unknown> {
  if (stage === 'initial') {
    assert(workspace.snapshot.status === 'closed', 'INITIAL_CLOSED')
    await workspace.open()
    assert(workspace.snapshot.status === 'closed', 'INITIAL_CANCEL')
    await workspace.open()
    await tick()
    assert(workspace.snapshot.workspaceId && tree(), 'WORKSPACE_OPEN')
    const row = rows().find((row) => row.dataset.directory === 'nested')
    assert(row, 'NESTED_VISIBLE')
    row.focus()
    return { stage, checks: ['empty-shell', 'picker-cancel', 'workspace-open', 'root-visible'] }
  }
  if (stage === 'expanded') {
    await waitFor(
      () => workspace.explorer.snapshot.directories.get(path('nested'))?.status === 'ready',
    )
    assert(workspace.explorer.snapshot.directories.get(path('nested'))!.expanded, 'RIGHT_EXPANDS')
    assert(
      rows().some((row) => row.dataset.source === 'nested/child.json'),
      'CHILD_VISIBLE',
    )
    return { stage, checks: ['arrow-right-expand'] }
  }
  if (stage === 'entered') {
    await waitFor(() => document.activeElement?.getAttribute('data-source') === 'nested/child.json')
    return { stage, checks: ['arrow-right-enter', 'focus'] }
  }
  if (stage === 'selected') {
    await waitFor(() => workspace.explorer.snapshot.selectedId !== null)
    selectedBeforeKeyboard = workspace.explorer.snapshot.selectedId
    assert(selectedBeforeKeyboard && !workspace.session.snapshot.active, 'SELECTION_NOT_ACTIVATION')
    assert(document.activeElement?.getAttribute('aria-selected') === 'true', 'ARIA_SELECTED')
    return { stage, checks: ['space-selection', 'selection-separate', 'aria-selected'] }
  }
  if (stage === 'activated') {
    await waitFor(
      () => workspace.session.snapshot.active?.source.relativePath === 'nested/child.json',
    )
    const active = workspace.session.snapshot.active!
    firstActiveRevision = active.info.revision
    assert(active.root.kind === 'number' && active.root.address.pointer === '', 'ROOT_READ')
    assert(
      document.querySelector('[data-active-source]')?.getAttribute('data-active-source') ===
        'nested/child.json',
      'CENTER_UPDATES',
    )
    return { stage, checks: ['enter-activation', 'root-read', 'center-placeholder', 'active-row'] }
  }
  if (stage === 'up') {
    await waitFor(
      () =>
        document.activeElement?.getAttribute('data-directory') === 'nested' &&
        document.activeElement?.getAttribute('data-value') ===
          workspace.explorer.snapshot.focusedId,
    )
    return { stage, checks: ['arrow-up-parent-focus'] }
  }
  if (stage === 'up-down') {
    await waitFor(
      () =>
        document.activeElement?.getAttribute('data-source') === 'nested/child.json' &&
        document.activeElement?.getAttribute('data-value') ===
          workspace.explorer.snapshot.focusedId,
    )
    assert(
      document.activeElement?.getAttribute('data-source') === 'nested/child.json',
      'UP_DOWN_RETURNS_CHILD',
    )
    return { stage, checks: ['arrow-up-down'] }
  }
  if (stage === 'parent') {
    await waitFor(() => document.activeElement?.getAttribute('data-directory') === 'nested')
    return { stage, checks: ['arrow-left-parent'] }
  }
  if (stage === 'collapsed') {
    await waitFor(() => !workspace.explorer.snapshot.directories.get(path('nested'))!.expanded)
    assert(
      document.activeElement?.getAttribute('data-directory') === 'nested',
      'LEFT_PARENT_COLLAPSE',
    )
    const firstPage = performance.now()
    await expand('large')
    const firstPageMs = performance.now() - firstPage
    const append = performance.now()
    await full('large')
    await tick()
    const appendMs = performance.now() - append
    assert(
      workspace.explorer.snapshot.directories.get(path('large'))!.entries.length === 5000,
      'LARGE_COMPLETE',
    )
    const logical = Number(tree().dataset.logicalRows),
      mounted = rows().length
    assert(logical >= 5000 && mounted < 100, 'VIRTUAL_DOM_BOUND')
    rows()[0].focus()
    return {
      stage,
      checks: ['arrow-left-parent-collapse', 'pagination', 'virtualization'],
      logical,
      mounted,
      firstPageMs,
      appendMs,
    }
  }
  if (stage === 'end') {
    await waitFor(
      () =>
        tree().scrollTop > 100000 &&
        document.activeElement?.getAttribute('data-source')?.startsWith('说明') === true &&
        rows().some((row) => row.dataset.source?.startsWith('说明')),
    )
    const active = document.activeElement as HTMLElement
    assert(active?.getAttribute('role') === 'treeitem', 'END_FOCUS_MOUNTED')
    assert(
      active.getAttribute('data-value') === workspace.explorer.snapshot.focusedId,
      'FOCUS_STATE',
    )
    assert(rows().length < 100, 'SCROLL_DOM_BOUND')
    const longName = rows().find((row) => row.dataset.source?.startsWith('说明'))
    assert(
      longName &&
        longName.title === longName.dataset.source &&
        longName.getAttribute('aria-label') === longName.title,
      'UNICODE_FULL_NAME',
    )
    assert(
      Math.abs(longName.getBoundingClientRect().height - 24) < 1 &&
        getComputedStyle(longName.querySelector('.row-name')!).textOverflow === 'ellipsis',
      'FIXED_ROW_ELLIPSIS',
    )
    const endScroll = tree().scrollTop
    tree().scrollTop = 60000
    await tick()
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    assert(document.activeElement === active, 'MANUAL_SCROLL_RETAINS_FOCUS')
    tree().scrollTop = endScroll
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    const scroll = tree().scrollTop,
      selection = workspace.explorer.snapshot.selectedId,
      focused = workspace.explorer.snapshot.focusedId,
      expanded = workspace.explorer.expandedIds.join(),
      session = workspace.session.snapshot.active
    for (const locale of ['en', 'zh-CN', 'en', 'zh-CN'] as const) {
      changeUiLocale(locale)
      await tick()
      assert(
        get(uiLocale) === locale && document.documentElement.lang === locale,
        'REACTIVE_LOCALE',
      )
      assert(
        workspace.explorer.snapshot.selectedId === selection &&
          workspace.explorer.snapshot.focusedId === focused &&
          workspace.explorer.expandedIds.join() === expanded,
        'LOCALE_TREE_CONTINUITY',
      )
      assert(
        workspace.session.snapshot.active === session && tree().scrollTop === scroll,
        'LOCALE_SESSION_SCROLL',
      )
    }
    return {
      stage,
      checks: [
        'end-scroll-focus',
        'manual-scroll-focus-retained',
        'unicode-long-name-fixed-height',
        'locale-tree-session-scroll',
      ],
      mounted: rows().length,
      scrollTop: scroll,
    }
  }
  if (stage === 'component-boundaries') {
    const target = document.createElement('div')
    target.style.cssText =
      'position:fixed;inset:80px auto auto 300px;width:280px;height:360px;display:flex;z-index:10'
    document.body.append(target)
    let failRoot = true,
      hold = false,
      settle: (() => void) | undefined
    const bridge: RawBridge = {
      ...window.raw,
      listDirectory: async (input) => {
        if (failRoot) {
          failRoot = false
          return { ok: false, error: { code: 'ACCESS_DENIED' } }
        }
        const result = await window.raw.listDirectory(input)
        if (hold && input.directory === 'nested')
          await new Promise<void>((resolve) => {
            settle = resolve
          })
        return result
      },
    }
    const explorer = new ExplorerController(bridge),
      session = new SourceSession(bridge)
    const component = mount(SourceExplorer, { target, props: { explorer, session } })
    try {
      await explorer.open(workspace.snapshot.workspaceId!)
      await tick()
      const error = target.querySelector<HTMLElement>('[data-node-kind=status]')!
      assert(
        error &&
          error.getAttribute('role') === 'treeitem' &&
          explorer.tree().children!.at(-1)!.action === 'retry',
        'ERROR_RETRY_ROW',
      )
      error.click()
      await waitFor(() => explorer.snapshot.directories.get(path(''))!.status === 'ready')
      const nested = explorer.snapshot.directories
        .get(path(''))!
        .entries.find((item) => item.entry.name === 'nested')!
      hold = true
      const old = explorer.expand(path('nested'), nested.id)
      await waitFor(() => !!settle)
      await tick()
      const branch = target.querySelector<HTMLElement>(
        '[data-directory=nested][data-node-kind=directory]',
      )!
      assert(branch.getAttribute('aria-busy') === 'true', 'DIRECTORY_BUSY')
      branch.click()
      await tick()
      assert(
        !explorer.snapshot.directories.get(path('nested'))!.expanded,
        'CLICK_COLLAPSES_LOADING',
      )
      settle!()
      await old
      assert(
        explorer.snapshot.directories.get(path('nested'))!.status === 'unloaded',
        'LATE_RESULT_IGNORED',
      )
      hold = false
      await explorer.expand(path('nested'), nested.id)
      await tick()
      const child = target.querySelector<HTMLElement>('[data-source="nested/child.json"]')!
      child.click()
      await tick()
      assert(!session.snapshot.active && explorer.snapshot.selectedId, 'COMPONENT_SELECT_ONLY')
      child.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await waitFor(() => session.snapshot.active !== null)
      const opened = activeOf(session)
      assert(opened, 'DOUBLE_CLICK_RESULT_' + JSON.stringify(session.snapshot.error))
      assert(opened.root.kind === 'number', 'DOUBLE_CLICK_ACTIVATES')
      return {
        stage,
        checks: [
          'component-error-retry',
          'directory-busy-aria',
          'collapse-loading-click',
          'late-result-guard',
          'double-click-activation',
        ],
      }
    } finally {
      if (session.snapshot.active)
        await window.raw.releaseSource({
          requestId: crypto.randomUUID(),
          source: session.snapshot.active.source,
        })
      explorer.reset(null)
      session.reset()
      await unmount(component)
      target.remove()
    }
  }
  if (stage === 'home') {
    await waitFor(() => tree().scrollTop === 0)
    assert(
      document.activeElement?.getAttribute('data-value') === rows()[0].dataset.value,
      'HOME_FOCUS',
    )
    const id = workspace.snapshot.workspaceId!,
      active = workspace.session.snapshot.active!
    await workspace.session.activate({ workspaceId: id, relativePath: 'bad.json' as RelativePath })
    assert(
      workspace.session.snapshot.error?.code === 'INVALID_JSON' &&
        workspace.session.snapshot.active === active,
      'FAILED_OPEN_PRESERVES_ACTIVE',
    )
    await workspace.session.activate({
      workspaceId: id,
      relativePath: 'other.json' as RelativePath,
    })
    assert(workspace.session.snapshot.active?.root.kind === 'object', 'SWITCH_SUCCESS')
    const old = await window.raw.readNode({
      requestId: crypto.randomUUID(),
      address: active.root.address,
      expectedRevision: active.info.revision,
    })
    assert(!old.ok && old.error.code === 'SOURCE_CHANGED', 'OLD_SOURCE_RELEASED')
    const current = workspace.session.snapshot.active
    await workspace.explorer.refresh()
    await tick()
    assert(workspace.session.snapshot.active === current, 'REFRESH_KEEPS_SESSION')
    const before = workspace.explorer.snapshot,
      source = workspace.session.snapshot.active
    await workspace.open()
    await tick()
    assert(
      workspace.explorer.snapshot === before && workspace.session.snapshot.active === source,
      'CANCEL_PRESERVES_STATE',
    )
    return {
      stage,
      checks: [
        'home',
        'invalid-json-preserves-active',
        'switch-release',
        'refresh-preserves-session',
        'cancel-preserves-tree-session',
      ],
      firstActiveRevision,
      selection: selectedBeforeKeyboard,
    }
  }
  if (stage === 'switched') {
    const old = workspace.snapshot.workspaceId
    await workspace.open()
    await tick()
    assert(
      workspace.snapshot.workspaceId !== old && !workspace.session.snapshot.active,
      'WORKSPACE_SWITCH_RESETS',
    )
    assert(
      rows().some((row) => row.dataset.source === 'switched.json'),
      'NEW_ROOT',
    )
    return { stage, checks: ['workspace-switch', 'new-root', 'session-reset'] }
  }
  if (stage === 'real-data') {
    const begin = performance.now()
    await workspace.open()
    await tick()
    const rootMs = performance.now() - begin
    const first = performance.now()
    await expand('ExcelOutput')
    const excelFirstMs = performance.now() - first
    const append = performance.now()
    await full('ExcelOutput')
    const excelAppendMs = performance.now() - append
    const excel = workspace.explorer.snapshot.directories.get(path('ExcelOutput'))!
    assert(excel.entries.length === 2253, 'REAL_EXCEL_COUNT')
    await expand('Config')
    await expand('Level', 'Config')
    await expand('Mission', 'Config/Level')
    await full('Config/Level/Mission')
    const mission = workspace.explorer.snapshot.directories.get(path('Config/Level/Mission'))!
    assert(
      mission.entries.length === 2845 &&
        mission.entries.every((item) => item.entry.kind === 'directory'),
      'REAL_MISSION_COUNT',
    )
    await tick()
    assert(Number(tree().dataset.logicalRows) > 5000 && rows().length < 100, 'REAL_VIRTUAL_ROWS')
    // Listing and selection alone never acquire a source.
    const avatar = excel.entries.find((item) => item.entry.name === 'AvatarConfig.json')!,
      equipment = excel.entries.find((item) => item.entry.name === 'EquipmentConfig.json')!
    assert(avatar.entry.kind === 'source' && equipment.entry.kind === 'source', 'REPRESENTATIVES')
    const unregistered = await window.raw.releaseSource({
      requestId: crypto.randomUUID(),
      source: avatar.entry.source,
    })
    assert(unregistered.ok && !unregistered.value.released, 'NO_LISTING_REGISTRATION')
    workspace.explorer.select(avatar.id)
    assert(!workspace.session.snapshot.active, 'REAL_SELECT_ONLY')
    const activation = performance.now()
    await workspace.session.activate(avatar.entry.source)
    const avatarMs = performance.now() - activation
    const old = activeOf(workspace.session)
    assert(old, 'REAL_AVATAR_ACTIVATION_' + JSON.stringify(workspace.session.snapshot.error))
    assert(old.root.kind === 'array', 'REAL_AVATAR_ROOT')
    await workspace.session.activate(equipment.entry.source)
    assert(
      workspace.session.snapshot.active!.source.relativePath === 'ExcelOutput/EquipmentConfig.json',
      'REAL_SWITCH',
    )
    const released = await window.raw.readNode({
      requestId: crypto.randomUUID(),
      address: old.root.address,
      expectedRevision: old.info.revision,
    })
    assert(!released.ok && released.error.code === 'SOURCE_CHANGED', 'REAL_RELEASE')
    return {
      stage,
      checks: [
        'real-root',
        'real-excel-pages',
        'real-mission-pages',
        'real-virtualization',
        'real-selection',
        'real-activation-root-switch-release',
        'no-mass-registration',
      ],
      rootMs,
      excelFirstMs,
      excelAppendMs,
      avatarMs,
      logical: Number(tree().dataset.logicalRows),
      mounted: rows().length,
      excel: excel.entries.length,
      mission: mission.entries.length,
    }
  }
  throw new Error('invalid explorer smoke stage')
}
