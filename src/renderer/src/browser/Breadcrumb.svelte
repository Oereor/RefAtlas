<script lang="ts">
  import { splitPointer, joinPointer } from '../../../shared/raw'
  import type { NodeBrowserController } from './node-browser-controller'
  import { messages, uiLocale } from '../i18n'
  let { browser }: { browser: NodeBrowserController } = $props()
  const changes = $derived(browser.changes)
  const source = $derived(browser.session.changes)
  const tokens = $derived($changes.current ? splitPointer($changes.current.address.pointer) : [])
</script>

<nav class="breadcrumb" aria-label={messages.node_breadcrumb({}, { locale: $uiLocale })}>
  {#each ['', ...tokens] as token, index}
    {#if index}<span aria-hidden="true">›</span>{/if}
    <button
      data-pointer={joinPointer(tokens.slice(0, index))}
      disabled={$source.active?.info.state === 'stale'}
      aria-current={index === tokens.length ? 'location' : undefined}
      aria-label={messages.node_breadcrumb_go(
        {
          token:
            index === 0
              ? messages.node_root({}, { locale: $uiLocale })
              : token || messages.node_empty_key({}, { locale: $uiLocale }),
        },
        { locale: $uiLocale },
      )}
      title={index === 0 ? messages.node_root({}, { locale: $uiLocale }) : token}
      onclick={() => {
        if ($changes.source)
          void browser.navigate({
            source: $changes.source,
            pointer: joinPointer(tokens.slice(0, index)),
          })
      }}
    >
      {index === 0 ? messages.node_root({}, { locale: $uiLocale }) : token}
    </button>
  {/each}
</nav>

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: auto;
    padding: 4px 16px 10px;
    flex: none;
    white-space: nowrap;
    border-bottom: 1px solid var(--border);
  }
  button {
    white-space: pre;
    border: 0;
    background: transparent;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: none;
    min-width: 20px;
    font: 12px var(--mono);
    padding: 3px 5px;
  }
  span {
    color: var(--muted);
  }
</style>
