<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { NodeBrowserController } from './node-browser-controller'
  import { messages, uiLocale, formatRawError, formatUiCount, formatByteSize } from '../i18n'
  let { browser }: { browser: NodeBrowserController } = $props()
  const find = $derived(browser.find)
  const changes = $derived(find.changes)
  const session = $derived(browser.session.changes)
  let input = $state<HTMLInputElement>()
  let returnFocus: HTMLElement | null = null
  const unavailable = $derived(
    $session.active?.info.state === 'stale' || $session.reloading || !!$session.pending,
  )
  let wasOpen = false
  $effect(() => {
    const opened = $changes.open
    if (opened && !wasOpen)
      untrack(() => {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        void tick().then(() => input?.focus({ preventScroll: true }))
      })
    wasOpen = opened
  })
  function close() {
    find.close()
    void tick().then(() => {
      const target = returnFocus?.isConnected
        ? returnFocus
        : (document.querySelector<HTMLElement>('[data-scalar-value], [data-scalar-segment]') ??
          document.querySelector<HTMLElement>('.node-browser tbody tr') ??
          document.querySelector<HTMLElement>('.node-browser nav button[aria-current]'))
      target?.focus({ preventScroll: true })
    })
  }
  function keyboard(element: HTMLElement) {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (event.key === 'Enter' && event.target === input) {
        event.preventDefault()
        event.stopPropagation()
        void (event.shiftKey ? find.previous() : find.next())
      }
    }
    element.addEventListener('keydown', listener)
    return { destroy: () => element.removeEventListener('keydown', listener) }
  }
</script>

{#if $changes.open}
  <form
    class="find-bar"
    role="search"
    aria-label={messages.find_title({}, { locale: $uiLocale })}
    data-find-state={$changes.status}
    onsubmit={(event) => {
      event.preventDefault()
      void find.next()
    }}
    use:keyboard
  >
    <div class="controls">
      <input
        bind:this={input}
        data-find-input
        value={$changes.query}
        readonly={unavailable}
        aria-label={messages.find_input({}, { locale: $uiLocale })}
        placeholder={messages.find_placeholder({}, { locale: $uiLocale })}
        oninput={(event) => find.setQuery(event.currentTarget.value)}
      />
      <button
        type="button"
        data-action="find-previous"
        disabled={unavailable || $changes.busy || $changes.position < 1}
        title={messages.find_previous({}, { locale: $uiLocale })}
        aria-label={messages.find_previous({}, { locale: $uiLocale })}
        onclick={() => void find.previous()}>↑</button
      >
      <button
        type="button"
        data-action="find-next"
        disabled={unavailable ||
          $changes.busy ||
          !$changes.query ||
          ($changes.complete && $changes.position >= $changes.matches.length - 1)}
        title={messages.find_next({}, { locale: $uiLocale })}
        aria-label={messages.find_next({}, { locale: $uiLocale })}
        onclick={() => void find.next()}>↓</button
      >
      <button
        type="button"
        data-action="find-close"
        title={messages.find_close({}, { locale: $uiLocale })}
        aria-label={messages.find_close({}, { locale: $uiLocale })}
        onclick={close}>×</button
      >
    </div>
    <div class="status" role="status" aria-live="polite" data-find-status>
      {#if unavailable || $changes.status === 'stale'}{messages.find_stale(
          {},
          { locale: $uiLocale },
        )}
      {:else if $changes.error}{messages.find_failed(
          { reason: formatRawError($changes.error, $uiLocale).message },
          { locale: $uiLocale },
        )}
      {:else if $changes.status === 'searching' || $changes.status === 'debouncing'}{messages.find_searching(
          {
            progress: formatByteSize($changes.scannedBytes, $uiLocale),
            size: formatByteSize($changes.sizeBytes, $uiLocale),
          },
          { locale: $uiLocale },
        )}
      {:else if $changes.status === 'no-match'}{messages.find_no_match({}, { locale: $uiLocale })}
      {:else if $changes.position >= 0}{messages.find_match(
          { number: formatUiCount($changes.matches[$changes.position].ordinal, $uiLocale) },
          { locale: $uiLocale },
        )} · {$changes.complete
          ? messages.find_complete({}, { locale: $uiLocale })
          : messages.find_incomplete({}, { locale: $uiLocale })}
      {:else}{messages.find_idle({}, { locale: $uiLocale })}{/if}
      {#if $changes.position === 0 && $changes.matches[0]?.ordinal === 1}<span
          >{messages.find_boundary_start({}, { locale: $uiLocale })}</span
        >{/if}
      {#if $changes.complete && $changes.position >= 0 && $changes.position === $changes.matches.length - 1}<span
          >{messages.find_boundary_end({}, { locale: $uiLocale })}</span
        >{/if}
      {#if $changes.restartRequired}<span
          >{messages.find_restart_needed({}, { locale: $uiLocale })}</span
        >{/if}
      {#if ($changes.matches[0]?.ordinal ?? 1) > 1}<span
          >{messages.find_history({}, { locale: $uiLocale })}</span
        >{/if}
    </div>
    {#if $changes.restartRequired || ($changes.matches[0]?.ordinal ?? 1) > 1}<button
        type="button"
        data-action="find-restart"
        disabled={unavailable || $changes.busy}
        onclick={() => void find.restart()}
        >{messages.find_restart({}, { locale: $uiLocale })}</button
      >{/if}
  </form>
{:else if $session.active}
  <div class="find-entry">
    <button
      data-action="find-open"
      title={messages.find_shortcut({}, { locale: $uiLocale })}
      onclick={() => find.open()}>{messages.find_title({}, { locale: $uiLocale })}</button
    >
  </div>
{/if}

<style>
  .find-bar,
  .find-entry {
    flex: none;
    padding: 6px 16px;
    border-bottom: 1px solid var(--border);
  }
  .controls {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  input {
    min-width: 0;
    flex: 1;
    font: 12px var(--mono);
    padding: 5px 8px;
  }
  .controls button {
    min-width: 30px;
  }
  .status {
    font-size: 11px;
    color: var(--muted);
    padding-top: 4px;
    overflow-wrap: anywhere;
  }
  .status span {
    display: block;
  }
  .find-entry {
    text-align: right;
  }
</style>
