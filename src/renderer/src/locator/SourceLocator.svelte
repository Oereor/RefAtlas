<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { SourceLocatorController } from './source-locator-controller'
  import { messages, uiLocale, formatRawError } from '../i18n'
  let { locator }: { locator: SourceLocatorController } = $props()
  const view = $derived(locator.changes)
  let dialog = $state<HTMLDialogElement>()
  let input = $state<HTMLInputElement>()
  let previousFocus: HTMLElement | null = null
  const listId = 'source-locator-results'
  $effect(() => {
    const opened = $view.open
    untrack(() => {
      if (opened && dialog && !dialog.open) {
        previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        dialog.showModal()
        input?.focus()
      } else if (!opened && dialog?.open) {
        dialog.close()
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
        previousFocus = null
      }
    })
  })
  $effect(() => {
    const selected = $view.selected
    if (selected >= 0)
      void tick().then(() =>
        dialog
          ?.querySelector<HTMLElement>('#source-locator-option-' + selected)
          ?.scrollIntoView({ block: 'nearest' }),
      )
  })
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      locator.close()
    } else if (event.target === input && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      locator.move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.target === input && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      void locator.activate()
    } else if (event.key === 'Tab') {
      const controls = [...dialog!.querySelectorAll<HTMLElement>('input,button:not(:disabled)')]
      const first = controls[0],
        last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }
</script>

<!-- Dialog owns keyboard navigation and focus containment. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="source-locator"
  aria-labelledby="source-locator-title"
  data-locator-state={$view.status}
  onkeydown={keydown}
  oncancel={(event) => {
    event.preventDefault()
    locator.close()
  }}
>
  <header>
    <h2 id="source-locator-title">{messages.locator_title({}, { locale: $uiLocale })}</h2>
    <button data-action="close-locator" onclick={() => locator.close()}
      >{messages.locator_close({}, { locale: $uiLocale })}</button
    >
  </header>
  <input
    bind:this={input}
    data-action="locator-query"
    role="combobox"
    aria-label={messages.locator_input({}, { locale: $uiLocale })}
    aria-autocomplete="list"
    aria-expanded={$view.open}
    aria-controls={listId}
    aria-activedescendant={$view.selected >= 0
      ? 'source-locator-option-' + $view.selected
      : undefined}
    placeholder={messages.locator_placeholder({}, { locale: $uiLocale })}
    value={$view.query}
    oninput={(event) => locator.setQuery(event.currentTarget.value)}
  />
  <div
    class="results"
    id={listId}
    role="listbox"
    tabindex="-1"
    aria-label={messages.locator_results({}, { locale: $uiLocale })}
    aria-busy={$view.status === 'building' || $view.status === 'loading'}
  >
    {#each $view.items as item, index (item.source.relativePath)}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div
        id={'source-locator-option-' + index}
        class="result"
        role="option"
        tabindex="-1"
        aria-selected={$view.selected === index}
        data-locator-source={item.source.relativePath}
        onmousedown={(event) => event.preventDefault()}
        onclick={() => void locator.activate(index)}
      >
        <strong>{item.name}</strong><span title={item.source.relativePath}
          >{item.source.relativePath}</span
        >
      </div>
    {/each}
  </div>
  <p class="status" role="status" aria-live="polite" data-locator-error={$view.error?.code}>
    {$view.status === 'building'
      ? messages.locator_building({}, { locale: $uiLocale })
      : $view.status === 'loading'
        ? messages.status_loading({}, { locale: $uiLocale })
        : $view.error
          ? messages.locator_failed(
              { reason: formatRawError($view.error, $uiLocale).message },
              { locale: $uiLocale },
            )
          : !$view.query
            ? messages.locator_input({}, { locale: $uiLocale })
            : $view.truncated
              ? messages.locator_truncated({}, { locale: $uiLocale })
              : !$view.items.length
                ? messages.locator_empty({}, { locale: $uiLocale })
                : ''}
  </p>
  <footer>
    <button
      data-action="refresh-locator"
      onclick={() => {
        locator.refresh()
        input?.focus()
      }}>{messages.locator_refresh({}, { locale: $uiLocale })}</button
    >
  </footer>
</dialog>

<style>
  .source-locator {
    width: min(600px, calc(100vw - 48px));
    max-height: calc(100vh - 80px);
    margin: 64px auto auto;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 12px 40px #0003;
  }
  .source-locator::backdrop {
    background: #0003;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
  }
  input {
    width: 100%;
    padding: 8px;
    font-size: 14px;
  }
  .results {
    max-height: min(420px, calc(100vh - 280px));
    overflow: auto;
    margin-top: 8px;
  }
  .result {
    padding: 8px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .result:hover {
    background: var(--hover);
  }
  .result[aria-selected='true'] {
    background: var(--selection);
    border-color: var(--focus);
  }
  strong,
  .result span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    font-size: 13px;
    font-weight: 500;
  }
  .result span {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11px;
    margin-top: 3px;
  }
  .status {
    color: var(--muted);
    font-size: 12px;
    min-height: 16px;
  }
  [data-locator-error] {
    color: var(--error);
  }
  footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
