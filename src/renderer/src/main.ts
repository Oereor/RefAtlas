import { mount } from 'svelte'
import App from './App.svelte'
import { runFoundationGuardSmoke, runFoundationSmoke } from './smoke'
import { runRawSmoke } from './raw-smoke'
import { initializeBrowserLocalization } from './i18n'
import { runLocalizationSmoke } from './localization-smoke'
import { runExplorerSmoke } from './explorer-smoke'

initializeBrowserLocalization()

mount(App, { target: document.getElementById('app')! })
if (new URLSearchParams(location.search).get('smoke') === '1') {
  window.runFoundationSmoke = runFoundationSmoke
  window.runRawSmoke = runRawSmoke
  window.runLocalizationSmoke = runLocalizationSmoke
  window.runExplorerSmoke = runExplorerSmoke
}
if (new URLSearchParams(location.search).get('smoke') === 'guard')
  window.runFoundationGuardSmoke = runFoundationGuardSmoke
