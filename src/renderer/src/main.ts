import { runFindSmoke } from './find-smoke'
import { mount } from 'svelte'
import App from './App.svelte'
import { runFoundationGuardSmoke, runFoundationSmoke } from './smoke'
import { runRawSmoke } from './raw-smoke'
import { initializeBrowserLocalization } from './i18n'
import { runLocalizationSmoke } from './localization-smoke'
import { runExplorerSmoke } from './explorer-smoke'
import { runNodeBrowserSmoke } from './node-browser-smoke'
import { runSourceLocatorSmoke } from './source-locator-smoke'

initializeBrowserLocalization()

mount(App, { target: document.getElementById('app')! })
if (new URLSearchParams(location.search).get('smoke') === '1') {
  window.runFoundationSmoke = runFoundationSmoke
  window.runRawSmoke = runRawSmoke
  window.runLocalizationSmoke = runLocalizationSmoke
  window.runExplorerSmoke = runExplorerSmoke
  window.runNodeBrowserSmoke = runNodeBrowserSmoke
  window.runSourceLocatorSmoke = runSourceLocatorSmoke
  window.runFindSmoke = runFindSmoke
}
if (new URLSearchParams(location.search).get('smoke') === 'guard')
  window.runFoundationGuardSmoke = runFoundationGuardSmoke
