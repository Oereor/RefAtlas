<script lang="ts">
  import type { SourceSession } from '../state/source-session'
  import { formatRawError, messages, uiLocale } from '../i18n'
  let { session }: { session: SourceSession } = $props()
  const view = $derived(session.changes)
</script>

<main
  class="source-region"
  data-active-source={$view.active?.source.relativePath ?? ''}
  data-pending-source={$view.pending?.relativePath ?? ''}
>
  {#if $view.pending}<p class="pending" role="status">
      {messages.source_opening({}, { locale: $uiLocale })} <span>{$view.pending.relativePath}</span>
    </p>{/if}
  {#if $view.error}<p class="error" role="alert" data-error-code={$view.error.code}>
      {formatRawError($view.error, $uiLocale).message}
    </p>{/if}
  {#if $view.active}
    <h1>{$view.active.source.relativePath.split('/').at(-1)}</h1>
    <p class="source-path">{$view.active.source.relativePath}</p>
    <p>{messages.source_opened({}, { locale: $uiLocale })}</p>
    <dl>
      <dt>{messages.source_root_kind({}, { locale: $uiLocale })}</dt>
      <dd data-root-kind={$view.active.root.kind}>{$view.active.root.kind}</dd>
    </dl>
    <p class="muted">{messages.source_next_slice({}, { locale: $uiLocale })}</p>
  {:else}<p class="muted empty-source">{messages.source_empty({}, { locale: $uiLocale })}</p>{/if}
</main>

<style>
  .source-region {
    min-width: 0;
    overflow: auto;
    padding: 24px 28px;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    overflow-wrap: anywhere;
    margin: 0 0 10px;
  }
  .source-path,
  dd,
  .pending span {
    font-family: var(--mono);
    overflow-wrap: anywhere;
  }
  .source-path,
  .muted {
    color: var(--muted);
  }
  dl {
    display: flex;
    gap: 16px;
    font-size: 12px;
  }
  dd {
    margin: 0;
  }
  .error {
    color: var(--error);
  }
  .pending {
    color: var(--muted);
    font-size: 12px;
  }
  .empty-source {
    margin-top: 40px;
  }
</style>
