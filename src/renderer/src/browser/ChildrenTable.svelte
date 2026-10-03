<script lang="ts">
  import type { NodeBrowserController, ChildItem } from './node-browser-controller'
  import { kindLabel } from './node-browser-model'
  import { messages, uiLocale, formatUiCount } from '../i18n'
  let { browser }: { browser: NodeBrowserController } = $props()
  const changes = $derived(browser.changes)
  const source = $derived(browser.session.changes)
  let table = $state<HTMLTableElement>()
  function move(event: KeyboardEvent, index: number, child: ChildItem) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    let next = index
    if (event.key === 'ArrowDown') next = Math.min(index + 1, $changes.children.length - 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = $changes.children.length - 1
    else if (event.key === 'Enter') {
      event.preventDefault()
      void browser.openChild(child)
      return
    } else if (event.key === 'Escape') {
      event.preventDefault()
      browser.select(null)
      return
    } else return
    event.preventDefault()
    browser.select($changes.children[next])
    const row = table?.querySelectorAll<HTMLTableRowElement>('tbody tr')[next]
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest' })
  }
</script>

{#if $changes.children.length}
  <div class="table-scroll">
    <table bind:this={table} aria-label={messages.node_children({}, { locale: $uiLocale })}>
      <colgroup
        ><col class="key-col" /><col class="type-col" /><col /><col class="count-col" /></colgroup
      >
      <thead
        ><tr
          ><th scope="col"
            >{$changes.current?.kind === 'array'
              ? messages.node_index({}, { locale: $uiLocale })
              : messages.node_key({}, { locale: $uiLocale })}</th
          >
          <th scope="col">{messages.node_type({}, { locale: $uiLocale })}</th><th scope="col"
            >{messages.node_preview({}, { locale: $uiLocale })}</th
          ><th scope="col" class="count">{messages.node_children({}, { locale: $uiLocale })}</th
          ></tr
        ></thead
      >
      <tbody
        >{#each $changes.children as child, index (child.node.address.pointer)}
          <tr
            data-node-pointer={child.node.address.pointer}
            aria-selected={$changes.selectedChild === child}
            data-selected={$changes.selectedChild === child ? 'true' : undefined}
            tabindex={$changes.selectedChild === child || (!$changes.selectedChild && index === 0)
              ? 0
              : -1}
            onclick={() => browser.select(child)}
            onkeydown={(event) => move(event, index, child)}
            ondblclick={() => void browser.openChild(child)}
          >
            <td title={String(child.key)}
              ><button
                class="key-button"
                tabindex="-1"
                disabled={$source.active?.info.state === 'stale'}
                aria-label={($changes.current?.kind === 'array'
                  ? messages.node_index({}, { locale: $uiLocale })
                  : messages.node_key({}, { locale: $uiLocale })) +
                  ': ' +
                  (String(child.key) || messages.node_empty_key({}, { locale: $uiLocale }))}
                onclick={(event) => {
                  event.stopPropagation()
                  browser.select(child)
                }}>{child.key}</button
              ></td
            >
            <td data-kind={child.node.kind}>{kindLabel(child.node.kind, $uiLocale)}</td>
            <td class="preview" title={child.node.preview ?? ''}
              >{child.node.kind === 'object'
                ? '{ … }'
                : child.node.kind === 'array'
                  ? '[ … ]'
                  : (child.node.preview ?? '—')}</td
            >
            <td class="count"
              >{child.node.childCount === null
                ? '—'
                : formatUiCount(child.node.childCount, $uiLocale)}</td
            >
          </tr>
        {/each}</tbody
      >
    </table>
  </div>
{:else if !$changes.busy && !$changes.error}<p class="empty" data-empty-container>
    {messages.node_empty({}, { locale: $uiLocale })}
  </p>{/if}

<style>
  .table-scroll {
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
  table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
    min-width: 440px;
    font-size: 12px;
  }
  .key-col {
    width: 26%;
  }
  .type-col {
    width: 78px;
  }
  .count-col {
    width: 78px;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    background: var(--surface-alt);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  th,
  td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  td:first-child,
  .preview {
    font-family: var(--mono);
  }
  .count {
    text-align: right;
  }
  tr[data-selected] {
    background: var(--selection);
  }
  tbody tr:hover {
    background: var(--hover);
  }
  tbody tr:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -1px;
  }
  .key-button {
    border: 0;
    background: transparent;
    padding: 0;
    max-width: 100%;
    min-height: 0;
    font: inherit;
    color: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre;
  }

  .empty {
    padding: 20px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
