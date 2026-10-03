<script lang="ts">
  import type { WorkspaceController } from '../state/workspace-controller'
  import { changeUiLocale, isUiLocale, messages, uiLocale } from '../i18n'
  let { workspace }: { workspace: WorkspaceController } = $props()
  const view = $derived(workspace.changes)
</script>

<header class="toolbar">
  <strong>{messages.app_name({}, { locale: $uiLocale })}</strong>
  <span class="workspace-name" title={$view.displayName}>
    {$view.status === 'opening'
      ? messages.workspace_opening({}, { locale: $uiLocale })
      : $view.workspaceId
        ? $view.displayName || messages.workspace_generic_name({}, { locale: $uiLocale })
        : ''}
  </span>
  <button
    data-action="change-workspace"
    disabled={$view.status === 'opening'}
    onclick={() => void workspace.open()}
  >
    {$view.workspaceId
      ? messages.workspace_change({}, { locale: $uiLocale })
      : messages.workspace_open({}, { locale: $uiLocale })}
  </button>
  <label class="locale-control">
    <span aria-hidden="true">文/A</span>
    <select
      data-action="locale"
      aria-label={messages.locale_label({}, { locale: $uiLocale })}
      value={$uiLocale}
      onchange={(event) => {
        const value = event.currentTarget.value
        if (isUiLocale(value)) changeUiLocale(value)
      }}
    >
      <option value="en">{messages.locale_en({}, { locale: $uiLocale })}</option>
      <option value="zh-CN">{messages.locale_zh({}, { locale: $uiLocale })}</option>
    </select>
  </label>
</header>

<style>
  .toolbar {
    height: 44px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-alt);
  }
  strong {
    font-size: 14px;
    letter-spacing: -0.2px;
  }
  .workspace-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .locale-control {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .locale-control span {
    color: var(--muted);
    font-size: 11px;
  }
  select {
    max-width: 120px;
  }
</style>
