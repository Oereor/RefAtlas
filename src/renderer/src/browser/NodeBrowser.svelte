<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { NodeBrowserController } from './node-browser-controller'
  import SourceHeader from './SourceHeader.svelte'
  import Breadcrumb from './Breadcrumb.svelte'
  import ChildrenTable from './ChildrenTable.svelte'
  import ScalarValueView from './ScalarValueView.svelte'
  import { messages, uiLocale, formatRawError, formatUiCount } from '../i18n'
  let { browser }: { browser: NodeBrowserController } = $props()
  const changes = $derived(browser.changes)
  const source = $derived(browser.session.changes)
  const stale = $derived($source.active?.info.state === 'stale')
  const container = $derived(
    $changes.current?.kind === 'object' || $changes.current?.kind === 'array',
  )
  const pagination = $derived($changes.history.length > 0 || (container && !$changes.busy))
  const historyLimited = $derived(($changes.history[0]?.number ?? 1) > 1)
  let region = $state<HTMLElement>()
  let navigationFocus = $state(false)
  $effect(() => {
    if ($changes.pendingPointer !== null) navigationFocus = true
    if (navigationFocus && !$changes.busy) {
      navigationFocus = false
      untrack(
        () =>
          void tick().then(() => {
            ;(
              region?.querySelector<HTMLElement>(
                'tbody tr, [data-scalar-value], [data-scalar-segment]',
              ) ??
              region?.querySelector<HTMLElement>(
                '[data-action="return-root"], nav button[aria-current]',
              )
            )?.focus({ preventScroll: true })
          }),
      )
    }
  })
  function parentShortcut(element: HTMLElement) {
    const listener = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        event.key === 'ArrowLeft' &&
        !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')
      ) {
        event.preventDefault()
        void browser.parent()
      }
    }
    element.addEventListener('keydown', listener)
    return { destroy: () => element.removeEventListener('keydown', listener) }
  }
</script>

<main
  bind:this={region}
  class="node-browser"
  data-active-source={$source.active?.source.relativePath ?? ''}
  data-pending-source={$source.pending?.relativePath ?? ''}
  data-current-pointer={$changes.current?.address.pointer ?? $changes.recoveryPointer}
  data-browser-stale={stale}
  data-location-state={$changes.location}
  aria-busy={$source.reloading || $changes.busy}
  use:parentShortcut
>
  {#if $source.pending}<p class="notice" role="status">
      {messages.source_opening({}, { locale: $uiLocale })}
      <span>{$source.pending.relativePath}</span>
    </p>{/if}
  {#if $source.error}<p class="notice error" role="alert" data-error-code={$source.error.code}>
      {$source.errorOperation === 'reload'
        ? messages.source_reload_failed(
            {
              reason:
                $source.error.code === 'NOT_FOUND'
                  ? messages.source_file_missing({}, { locale: $uiLocale })
                  : formatRawError($source.error, $uiLocale).message,
            },
            { locale: $uiLocale },
          )
        : formatRawError($source.error, $uiLocale).message}
    </p>{/if}
  {#if $source.active}
    <SourceHeader
      active={$source.active}
      busy={$source.reloading || $changes.location === 'RECOVERING'}
      onreload={() => void browser.reload()}
    />
    {#if $changes.current}<Breadcrumb {browser} />{/if}
    {#if stale}<p class="notice stale" role="alert">
        {messages.node_stale_boundary({}, { locale: $uiLocale })}
      </p>{/if}
    {#if $source.reloading || $changes.busy}<p class="notice" role="status">
        {$source.reloading
          ? messages.source_reloading({}, { locale: $uiLocale })
          : messages.node_loading({}, { locale: $uiLocale })}
      </p>{/if}
    {#if $changes.location === 'LOCATION_MISSING'}
      <div class="notice error" role="status" data-location-missing>
        <p>{messages.node_location_missing({}, { locale: $uiLocale })}</p>
        <p class="raw-pointer">{$changes.recoveryPointer}</p>
        <button
          data-action="return-root"
          disabled={stale || $changes.busy}
          onclick={() => void browser.returnToRoot()}
          >{messages.node_return_root({}, { locale: $uiLocale })}</button
        >
      </div>
    {/if}
    {#if $changes.error && !stale}<div
        class="notice error"
        role="alert"
        data-node-error-code={$changes.error.code}
      >
        {$changes.recoveryPointer !== null
          ? messages.node_recovery_failed(
              {
                reason:
                  $changes.error.code === 'NOT_FOUND'
                    ? messages.source_file_missing({}, { locale: $uiLocale })
                    : formatRawError($changes.error, $uiLocale).message,
              },
              { locale: $uiLocale },
            )
          : formatRawError($changes.error, $uiLocale).message}
        <button
          data-action="node-retry"
          disabled={$changes.busy}
          onclick={() =>
            void ($changes.error?.code === 'STALE_CURSOR' ? browser.restart() : browser.retry())}
          >{$changes.error.code === 'STALE_CURSOR'
            ? messages.node_restart({}, { locale: $uiLocale })
            : messages.common_retry({}, { locale: $uiLocale })}</button
        >
      </div>{/if}
    {#if $changes.current}
      {#key $changes.revision}
        {#if container}<ChildrenTable {browser} />{:else}<ScalarValueView {browser} />{/if}
      {/key}
    {/if}
    {#if pagination}
      <footer class="pagination" aria-label={messages.node_children({}, { locale: $uiLocale })}>
        <span data-page-range
          >{#if container && $changes.children.length}
            {$changes.current!.childCount === null
              ? messages.node_range(
                  {
                    start: formatUiCount($changes.children[0].ordinal + 1, $uiLocale),
                    end: formatUiCount($changes.children.at(-1)!.ordinal + 1, $uiLocale),
                  },
                  { locale: $uiLocale },
                )
              : messages.node_range_total(
                  {
                    start: formatUiCount($changes.children[0].ordinal + 1, $uiLocale),
                    end: formatUiCount($changes.children.at(-1)!.ordinal + 1, $uiLocale),
                    total: formatUiCount($changes.current!.childCount!, $uiLocale),
                  },
                  { locale: $uiLocale },
                )}
          {/if}</span
        >
        <button
          data-action="node-previous"
          disabled={stale ||
            $changes.busy ||
            $changes.position < 1 ||
            $changes.error?.code === 'STALE_CURSOR'}
          onclick={() => void browser.previous()}
          >{messages.node_previous({}, { locale: $uiLocale })}</button
        >
        <button
          data-action="node-next"
          disabled={stale ||
            $changes.busy ||
            !$changes.nextCursor ||
            $changes.error?.code === 'STALE_CURSOR'}
          onclick={() => void browser.next()}
          >{messages.node_next({}, { locale: $uiLocale })}</button
        >
        {#if historyLimited}<button
            data-action="node-restart"
            disabled={stale || $changes.busy}
            title={messages.node_history_limit({}, { locale: $uiLocale })}
            onclick={() => void browser.restart()}
            >{messages.node_restart({}, { locale: $uiLocale })}</button
          >{/if}
      </footer>
    {/if}
  {:else}<p class="notice empty">{messages.source_empty({}, { locale: $uiLocale })}</p>{/if}
</main>

<style>
  .node-browser {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .notice {
    font-size: 12px;
    padding: 8px 20px;
    margin: 0;
    flex: none;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .notice span {
    font-family: var(--mono);
  }
  .raw-pointer {
    font-family: var(--mono);
    white-space: pre-wrap;
  }
  .error,
  .stale {
    color: var(--error);
  }
  .notice button {
    margin-left: 8px;
  }
  .empty {
    margin-top: 40px;
  }
  .pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    flex: none;
    font-size: 11px;
  }
  .pagination span {
    margin-right: auto;
    color: var(--muted);
  }
</style>
