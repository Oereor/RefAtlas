<script lang="ts">
  import AppShell from './components/AppShell.svelte'
  import FoundationDiagnostics from './FoundationDiagnostics.svelte'
  import { workspace } from './state/app-state'
  import './styles/base.css'
  const diagnostic = new URLSearchParams(location.search).has('smoke')
</script>

<AppShell {workspace} />
{#if diagnostic}<div class="diagnostic-harness"><FoundationDiagnostics /></div>{/if}
