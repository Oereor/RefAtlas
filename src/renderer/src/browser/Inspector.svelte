<script lang="ts">
  import type { NodeBrowserController } from './node-browser-controller'
  import { kindLabel } from './node-browser-model'
  import { messages, uiLocale, formatUiCount, formatByteSize } from '../i18n'
  let { browser, open = $bindable(true) }: { browser: NodeBrowserController; open?: boolean } =
    $props()
  const changes = $derived(browser.changes)
  const source = $derived(browser.session.changes)
  const target = $derived($changes.selectedChild?.node ?? $changes.current)
  const context = $derived(
    $changes.selectedChild
      ? { parentKind: $changes.current?.kind, key: $changes.selectedChild.key }
      : $changes.context,
  )
</script>

<aside
  class="inspector"
  class:collapsed={!open}
  aria-label={messages.inspector_title({}, { locale: $uiLocale })}
>
  <header>
    <button
      data-action="inspector-toggle"
      aria-expanded={open}
      aria-label={open
        ? messages.node_inspector_collapse({}, { locale: $uiLocale })
        : messages.node_inspector_expand({}, { locale: $uiLocale })}
      title={open
        ? messages.node_inspector_collapse({}, { locale: $uiLocale })
        : messages.node_inspector_expand({}, { locale: $uiLocale })}
      onclick={() => (open = !open)}>{open ? '›' : '‹'}</button
    >{#if open}<h2>{messages.inspector_title({}, { locale: $uiLocale })}</h2>{/if}
  </header>
  {#if open && target && $source.active}
    <div
      class="content"
      data-inspector-pointer={target.address.pointer}
      data-inspector-revision={target.revision}
    >
      <h3>{messages.node_node({}, { locale: $uiLocale })}</h3>
      <dl>
        {#if context}<dt>
            {context.parentKind === 'array'
              ? messages.node_index({}, { locale: $uiLocale })
              : messages.node_key({}, { locale: $uiLocale })}
          </dt>
          <dd data-inspector-key>{context.key}</dd>{/if}
        <dt>{messages.node_type({}, { locale: $uiLocale })}</dt>
        <dd>{kindLabel(target.kind, $uiLocale)}</dd>
        <dt>{messages.node_pointer({}, { locale: $uiLocale })}</dt>
        <dd class="raw" data-inspector-pointer-text>{target.address.pointer}</dd>
        <dt>{messages.node_children({}, { locale: $uiLocale })}</dt>
        <dd>{target.childCount === null ? '—' : formatUiCount(target.childCount, $uiLocale)}</dd>
      </dl>
      {#if $changes.selectedChild}<div class="actions">
          <button
            data-action="inspector-open"
            disabled={$source.active.info.state === 'stale'}
            onclick={() => void browser.openChild()}
            >{messages.node_open({}, { locale: $uiLocale })}</button
          >
        </div>{/if}
      <h3>{messages.node_source({}, { locale: $uiLocale })}</h3>
      <dl>
        <dt>{messages.node_file({}, { locale: $uiLocale })}</dt>
        <dd class="raw">{$source.active.source.relativePath.split('/').at(-1)}</dd>
        <dt>{messages.node_path({}, { locale: $uiLocale })}</dt>
        <dd class="raw">{$source.active.source.relativePath}</dd>
        <dt>{messages.node_revision({}, { locale: $uiLocale })}</dt>
        <dd class="raw">{$source.active.info.revision}</dd>
        <dt>{messages.node_status({}, { locale: $uiLocale })}</dt>
        <dd data-inspector-source-state>
          {$source.active.info.state === 'stale'
            ? messages.node_stale({}, { locale: $uiLocale })
            : messages.node_current({}, { locale: $uiLocale })}
        </dd>
        <dt>{messages.node_size({}, { locale: $uiLocale })}</dt>
        <dd>{formatByteSize($source.active.info.sizeBytes, $uiLocale)}</dd>
      </dl>
    </div>
  {/if}
</aside>

<style>
  .inspector {
    border-left: 1px solid var(--border);
    background: var(--surface-alt);
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    padding: 4px;
    gap: 6px;
    height: 36px;
    flex: none;
  }
  header button {
    border: 0;
    background: transparent;
    font-size: 18px;
    padding: 0 5px;
  }
  h2 {
    font-size: 11px;
    margin: 0;
    font-weight: 600;
  }
  .content {
    padding: 0 14px 16px;
    overflow: auto;
    font-size: 12px;
    user-select: text;
  }
  h3 {
    font-size: 11px;
    font-weight: 600;
    margin: 12px 0 10px;
  }
  dl {
    margin: 0;
  }
  dt {
    color: var(--muted);
    font-size: 11px;
    margin-top: 10px;
  }
  dd {
    margin: 3px 0 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    min-height: 14px;
  }
  .raw {
    font-family: var(--mono);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
</style>
