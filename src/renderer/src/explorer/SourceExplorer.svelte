<script lang="ts">
  import { tick, untrack } from 'svelte'
  import * as treeView from '@zag-js/tree-view'
  import { useMachine, normalizeProps } from '@zag-js/svelte'
  import { createVirtualizer, defaultRangeExtractor } from '@tanstack/svelte-virtual'
  import type { ExplorerController, ExplorerNode } from './explorer-controller'
  import { EXPLORER_LIMITS } from './explorer-controller'
  import type { SourceSession } from '../state/source-session'
  import { messages, uiLocale, formatRawError } from '../i18n'
  import { sameSource } from '../../../shared/raw'
  let { explorer, session }: { explorer: ExplorerController; session: SourceSession } = $props()
  const changes = $derived(explorer.changes)
  const source = $derived(session.changes)
  let viewport: HTMLDivElement | undefined = $state()
  let scrollEpoch = 0
  const treeId = 'source-explorer-' + crypto.randomUUID()
  const collection = $derived.by(() => {
    $changes.directories
    return treeView.collection<ExplorerNode>({
      rootNode: explorer.tree(),
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
    })
  })
  const service = useMachine(treeView.machine as treeView.Machine<ExplorerNode>, () => ({
    id: treeId,
    collection,
    selectionMode: 'single' as const,
    expandedValue: explorer.expandedIds,
    selectedValue: $changes.selectedId ? [$changes.selectedId] : [],
    focusedValue: $changes.focusedId,
    translations: { treeLabel: messages.explorer_title({}, { locale: $uiLocale }) },
    onSelectionChange: ({ selectedValue }) => {
      const id = selectedValue[0]
      if (id && explorer.find(id)) explorer.select(id)
    },
    onFocusChange: ({ focusedValue }) => explorer.focus(focusedValue),
    onExpandedChange: ({ expandedValue }) => {
      const old = explorer.expandedIds
      for (const id of old)
        if (!expandedValue.includes(id)) {
          const entry = explorer.find(id)?.entry
          if (entry?.kind === 'directory') explorer.collapse(entry.path)
        }
      for (const id of expandedValue)
        if (!old.includes(id)) {
          const entry = explorer.find(id)?.entry
          if (entry?.kind === 'directory') void explorer.expand(entry.path, id)
        }
    },
    scrollToIndexFn: ({ index, getElement }) => {
      const focusEpoch = ++scrollEpoch
      $virtualizer.scrollToIndex(index, { align: 'auto' })
      void tick().then(() => {
        if (focusEpoch === scrollEpoch) getElement()?.focus({ preventScroll: true })
      })
    },
  }))
  const api = $derived(treeView.connect(service, normalizeProps))
  const visible = $derived(api.getVisibleNodes())
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLElement>({
    count: 0,
    getScrollElement: () => viewport ?? null,
    estimateSize: () => EXPLORER_LIMITS.rowHeight,
    overscan: EXPLORER_LIMITS.overscan,
  })
  $effect(() => {
    const rows = visible,
      element = viewport,
      focusedId = $changes.focusedId
    const focusedIndex = rows.findIndex((row) => row.node.id === focusedId)
    untrack(() =>
      $virtualizer.setOptions({
        count: rows.length,
        getScrollElement: () => element ?? null,
        getItemKey: (index) => rows[index]?.node.id ?? index,
        rangeExtractor: (range) => {
          const indices = defaultRangeExtractor(range)
          if (focusedIndex >= 0 && !indices.includes(focusedIndex)) indices.push(focusedIndex)
          return indices.sort((a, b) => a - b)
        },
      }),
    )
  })
  $effect(() => {
    const items = $virtualizer.getVirtualItems(),
      rows = visible
    const range = $virtualizer.range
    for (const item of items) {
      const node = rows[item.index]?.node
      if (
        node?.status === 'more' &&
        node.directory !== undefined &&
        range &&
        item.index >= range.startIndex - EXPLORER_LIMITS.overscan &&
        item.index <= range.endIndex + EXPLORER_LIMITS.overscan
      )
        void explorer.more(node.directory, true)
    }
  })
  const treeProps = $derived(api.getTreeProps())
  function statusText(node: ExplorerNode): string {
    if (node.error?.details?.limit === 'EXPLORER_CACHE')
      return messages.explorer_cache_limit({}, { locale: $uiLocale })
    if (node.error) return formatRawError(node.error, $uiLocale).message
    return node.status === 'loading'
      ? messages.status_loading({}, { locale: $uiLocale })
      : node.status === 'empty'
        ? messages.explorer_empty({}, { locale: $uiLocale })
        : messages.explorer_load_more({}, { locale: $uiLocale })
  }
  function action(node: ExplorerNode): void {
    if (node.directory === undefined) return
    if (node.action === 'refresh') void explorer.refresh(node.directory)
    else if (node.action === 'retry') void explorer.retry(node.directory)
    else if (node.action === 'more') void explorer.more(node.directory)
  }
  function rowProps(node: ExplorerNode, indexPath: number[]) {
    const props =
      node.kind === 'directory'
        ? {
            ...api.getBranchProps({ node, indexPath }),
            ...api.getBranchControlProps({ node, indexPath }),
            role: 'treeitem' as const,
          }
        : api.getItemProps({ node, indexPath })
    const click = props.onclick
    return {
      ...props,
      onclick: (event: MouseEvent & { currentTarget: EventTarget & HTMLElement }) => {
        click?.(event)
        if (node.kind === 'status') action(node)
      },
    }
  }
</script>

<section class="explorer" {...api.getRootProps()}>
  <div class="explorer-header">
    <h2 {...api.getLabelProps()}>{messages.explorer_title({}, { locale: $uiLocale })}</h2>
    <button
      data-action="refresh-explorer"
      aria-label={messages.explorer_refresh({}, { locale: $uiLocale })}
      title={messages.explorer_refresh({}, { locale: $uiLocale })}
      onclick={() => void explorer.refresh()}>↻</button
    >
  </div>
  <div
    bind:this={viewport}
    {...treeProps}
    class="tree-viewport"
    data-logical-rows={visible.length}
    onkeydown={(event) => {
      treeProps.onkeydown?.(event)
      if (event.key === 'Enter') {
        const id = (event.target as HTMLElement).closest('[data-value]')?.getAttribute('data-value')
        const node = id ? collection.findNode(id) : undefined
        if (node?.source) void session.activate(node.source)
        else if (node?.action) action(node)
      }
    }}
  >
    <div class="tree-spacer" style:height={`${$virtualizer.getTotalSize()}px`}>
      {#each $virtualizer.getVirtualItems() as item (item.key)}
        {@const row = visible[item.index]}
        {#if row}
          {@const node = row.node}
          {@const active =
            node.source && $source.active && sameSource(node.source, $source.active.source)}
          {@const pending =
            node.source && $source.pending && sameSource(node.source, $source.pending)}
          <div
            {...rowProps(node, row.indexPath)}
            class="tree-row"
            class:status-row={node.kind === 'status'}
            data-node-kind={node.kind}
            data-directory={node.directory}
            data-source={node.source?.relativePath}
            data-active={active ? 'true' : undefined}
            data-pending={pending ? 'true' : undefined}
            aria-label={node.kind === 'status' ? statusText(node) : node.name}
            aria-setsize={node.unknownSize ? -1 : collection.getSiblingNodes(row.indexPath).length}
            aria-posinset={row.indexPath.at(-1)! + 1}
            aria-busy={pending ||
              (node.kind === 'directory'
                ? $changes.directories.get(node.directory!)?.status === 'loading'
                : undefined)}
            aria-current={active ? 'true' : undefined}
            title={node.kind === 'status' ? statusText(node) : node.name}
            style={`height:${EXPLORER_LIMITS.rowHeight}px;transform:translateY(${item.start}px);padding-left:${8 + (row.indexPath.length - 1) * 14}px`}
            ondblclick={() => {
              if (node.source) void session.activate(node.source)
            }}
          >
            <span class="chevron" aria-hidden="true"
              >{node.kind === 'directory' ? (api.getNodeState(row).expanded ? '⌄' : '›') : ''}</span
            >
            <span class="file-icon" aria-hidden="true"
              >{node.kind === 'directory' ? '▱' : node.kind === 'source' ? '{}' : ''}</span
            >
            <span class="row-name">{node.kind === 'status' ? statusText(node) : node.name}</span>
            {#if node.action === 'retry' || node.action === 'refresh'}<span class="row-action"
                >{node.action === 'refresh'
                  ? messages.explorer_refresh_directory({}, { locale: $uiLocale })
                  : messages.common_retry({}, { locale: $uiLocale })}</span
              >{/if}
            {#if pending}<span
                class="spinner"
                aria-label={messages.source_opening({}, { locale: $uiLocale })}
              ></span>
            {:else if active}<span
                class="active-indicator"
                aria-label={messages.source_active({}, { locale: $uiLocale })}>●</span
              >{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
  <div class="accessible-status" role="status" aria-live="polite">
    {[...$changes.directories.values()].some(
      (record) => record.status === 'loading' || record.paging,
    )
      ? messages.status_loading({}, { locale: $uiLocale })
      : ''}
  </div>
</section>

<style>
  .explorer {
    border-right: 1px solid var(--border);
    background: var(--surface-alt);
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .explorer-header {
    height: 36px;
    padding: 0 8px 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex: none;
  }
  h2 {
    font-size: 11px;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.3px;
  }
  .explorer-header button {
    border: 0;
    background: transparent;
    font-size: 18px;
    padding: 0 6px;
  }
  .tree-viewport {
    flex: 1;
    overflow: auto;
    min-height: 0;
    position: relative;
  }
  .tree-spacer {
    position: relative;
    width: 100%;
  }
  .tree-row {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    padding-right: 8px;
    white-space: nowrap;
    font-size: 12px;
    cursor: default;
  }
  .tree-row:hover {
    background: var(--hover);
  }
  .tree-row[data-selected] {
    background: var(--selection);
  }
  .tree-row:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -1px;
  }
  .row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chevron {
    width: 10px;
    flex: none;
    color: var(--muted);
  }
  .file-icon {
    width: 15px;
    flex: none;
    color: var(--muted);
    font: 11px var(--mono);
  }
  .status-row {
    color: var(--muted);
  }
  .row-action {
    margin-left: auto;
    color: var(--accent);
    font-size: 11px;
  }
  .active-indicator {
    margin-left: auto;
    color: var(--accent);
    font-size: 7px;
  }
  .spinner {
    margin-left: auto;
    width: 10px;
    height: 10px;
    border: 1px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  .accessible-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
