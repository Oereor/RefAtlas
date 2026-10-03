<script lang="ts">
  import type { NodeBrowserController } from './node-browser-controller'
  import { kindLabel, scalarText } from './node-browser-model'
  import { messages, uiLocale, formatUiCount } from '../i18n'
  let { browser }: { browser: NodeBrowserController } = $props()
  const changes = $derived(browser.changes)
</script>

<section class="value-view" aria-label={messages.node_value({}, { locale: $uiLocale })}>
  <h2>{kindLabel($changes.current!.kind, $uiLocale)}</h2>
  {#if $changes.scalar}<pre data-scalar-value tabindex="-1">{scalarText($changes.scalar)}</pre>
  {:else if $changes.segment}<p class="segment-label">
      {messages.node_segment(
        { number: formatUiCount($changes.history[$changes.position].number, $uiLocale) },
        { locale: $uiLocale },
      )}
    </p>
    <pre data-scalar-segment tabindex="-1">{$changes.segment.text}</pre>
    <p class="limits">{messages.node_segment_limits({}, { locale: $uiLocale })}</p>{/if}
</section>

<style>
  .value-view {
    padding: 16px 20px;
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }
  pre {
    font: 13px/1.6 var(--mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0;
    user-select: text;
  }
  .segment-label,
  .limits {
    font-size: 11px;
    color: var(--muted);
  }
</style>
