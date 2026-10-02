import { mount } from 'svelte'
import App from './App.svelte'
import { runFoundationGuardSmoke, runFoundationSmoke } from './smoke'

mount(App, { target: document.getElementById('app')! })
if (new URLSearchParams(location.search).get('smoke') === '1')
  window.runFoundationSmoke = runFoundationSmoke
if (new URLSearchParams(location.search).get('smoke') === 'guard')
  window.runFoundationGuardSmoke = runFoundationGuardSmoke
