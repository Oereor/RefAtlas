// Full runtime experiment lives in one actual Electron Utility Process.
import('./search-runtime.mjs').then(async ({ runRuntime }) => { await runRuntime(); process.parentPort.postMessage({ type: 'complete' }); }).catch(error => { process.parentPort.postMessage({ type: 'failed', error: error.stack }); });
