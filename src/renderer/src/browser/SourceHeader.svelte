<script lang="ts">
  import type { ActiveSource } from '../state/source-session'
  import { formatByteSize, messages, uiLocale } from '../i18n'
  let { active }: { active: ActiveSource } = $props()
</script>

<header class="source-header">
  <div class="heading">
    <h1 title={active.source.relativePath}>{active.source.relativePath.split('/').at(-1)}</h1>
    <span data-source-state={active.info.state}
      >{active.info.state === 'stale'
        ? messages.node_stale({}, { locale: $uiLocale })
        : messages.node_current({}, { locale: $uiLocale })}</span
    >
  </div>
  <p class="path" title={active.source.relativePath}>{active.source.relativePath}</p>
  <p class="metadata">
    <span>{formatByteSize(active.info.sizeBytes, $uiLocale)}</span>
    <span
      >{active.info.validated
        ? messages.node_validated({}, { locale: $uiLocale })
        : messages.node_unvalidated({}, { locale: $uiLocale })}</span
    >
    <span class="accessible" data-root-kind={active.root.kind}></span>
  </p>
</header>

<style>
  .source-header {
    padding: 16px 20px 8px;
    flex: none;
    min-width: 0;
  }
  .heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  h1 {
    font-size: 17px;
    margin: 0;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .heading span {
    font-size: 11px;
    color: var(--muted);
    flex: none;
  }
  p {
    margin: 6px 0;
    font-size: 12px;
    color: var(--muted);
  }
  .path {
    font-family: var(--mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .metadata {
    display: flex;
    gap: 16px;
    font-size: 11px;
  }
  .accessible {
    display: none;
  }
</style>
