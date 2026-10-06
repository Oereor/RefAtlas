<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { WorkspaceController } from '../state/workspace-controller'
  import WorkspaceToolbar from './WorkspaceToolbar.svelte'
  import NodeBrowser from '../browser/NodeBrowser.svelte'
  import Inspector from '../browser/Inspector.svelte'
  import SourceExplorer from '../explorer/SourceExplorer.svelte'
  import SourceLocator from '../locator/SourceLocator.svelte'
  import { messages, uiLocale, formatRawError } from '../i18n'
  let { workspace }: { workspace: WorkspaceController } = $props()
  const view = $derived(workspace.changes)
  let inspectorOpen = $state(true)
  onMount(() => {
    const visibility = () =>
      workspace.session.setMonitoringVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', visibility)
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault()
        if (!workspace.locator.snapshot.open && workspace.snapshot.status === 'open') {
          workspace.browser.find.open()
          void tick().then(() =>
            document
              .querySelector<HTMLInputElement>('[data-find-input]')
              ?.focus({ preventScroll: true }),
          )
        }
        return
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'p'
      ) {
        event.preventDefault()
        if (workspace.snapshot.status === 'open') workspace.locator.open()
      }
    }
    document.addEventListener('keydown', shortcut)
    visibility()
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('keydown', shortcut)
      void workspace.dispose()
    }
  })
</script>

<div class="app-shell" data-workspace-state={$view.status}>
  <WorkspaceToolbar {workspace} />
  <SourceLocator locator={workspace.locator} />
  {#if $view.workspaceId}
    <div
      class="workspace-layout"
      style:grid-template-columns={`280px minmax(0, 1fr) ${inspectorOpen ? 280 : 32}px`}
    >
      <SourceExplorer explorer={workspace.explorer} session={workspace.session} />
      <NodeBrowser browser={workspace.browser} />
      <Inspector browser={workspace.browser} bind:open={inspectorOpen} />
    </div>
  {:else}
    <main class="workspace-empty">
      <div>
        <h1>{messages.app_name({}, { locale: $uiLocale })}</h1>
        <p>{messages.workspace_empty({}, { locale: $uiLocale })}</p>
        <button
          data-action="open-workspace"
          disabled={$view.status === 'opening'}
          onclick={() => void workspace.open()}
        >
          {messages.workspace_open({}, { locale: $uiLocale })}
        </button>
        {#if $view.error}<p role="alert" data-error-code={$view.error.code}>
            {formatRawError($view.error, $uiLocale).message}
          </p>{/if}
      </div>
    </main>
  {/if}
</div>

<style>
  .app-shell {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .workspace-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 32px;
  }
  .workspace-empty {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .workspace-empty > div {
    max-width: 440px;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
  }
  p {
    color: var(--muted);
  }
  [role='alert'] {
    color: var(--error);
  }
</style>
