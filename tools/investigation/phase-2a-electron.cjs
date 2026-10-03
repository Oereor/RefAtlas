// 非生产 Main ↔ Utility MessagePort 探针，无 BrowserWindow / 产品 bridge。
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { app, utilityProcess, MessageChannelMain } = require('electron');
const profile = path.join(__dirname, 'artifacts', 'phase-2a-electron-profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
let child;
let port;
const timeout = setTimeout(() => { child?.kill(); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const { distribution, bytes, inspectBuffer } = await import('./phase-2a-helper.mjs');
  const { sourcePath } = await import('./common.mjs');
  const avatar = inspectBuffer(fs.readFileSync(sourcePath('ExcelOutput/AvatarConfig.json')), { retainDepth: 100 }).raw.items[0];
  const cases = [{ label: 'real Avatar /0', payload: avatar }];
  for (const kib of [16, 64, 256, 1024]) {
    cases.push({ label: `synthetic string ${kib} KiB`, payload: { kind: 'string', value: '中'.repeat(Math.floor(kib * 1024 / 3)) } });
    cases.push({ label: `synthetic broad tree ${kib} KiB`, payload: { kind: 'array', items: Array.from({ length: Math.floor(kib * 1024 / 80) }, () => ({ kind: 'object', entries: [{ key: 'n', value: { kind: 'number', lexeme: '16752756560315677817' } }] })) } });
  }
  child = utilityProcess.fork(path.join(__dirname, 'phase-2a-electron-utility.cjs'), [], { serviceName: 'RefAtlas Phase 2A investigation' });
  const channel = new MessageChannelMain(); port = channel.port1;
  let received;
  const ready = new Promise(resolve => { received = resolve; });
  port.on('message', event => received?.(event.data)); port.start();
  child.postMessage({ type: 'port' }, [channel.port2]);
  const runtime = await ready;
  if (runtime.type !== 'ready') throw new Error('utility handshake');
  const results = [];
  for (const entry of cases) {
    const times = [];
    for (let run = 0; run < 11; run++) {
      const start = performance.now();
      const response = new Promise(resolve => { received = resolve; });
      port.postMessage(entry.payload);
      const value = await response;
      if (run === 0 && bytes(value) !== bytes(entry.payload)) throw new Error('IPC payload changed');
      if (run) times.push(performance.now() - start);
    }
    results.push({ label: entry.label, utf8JsonBytes: bytes(entry.payload), rttMs: distribution(times) });
  }
  const evidence = { date: '2026-10-03', runtime, versions: process.versions, repeats: 10, warmups: 1,
    scope: 'Main ↔ Utility MessagePort; no renderer/Preload/UI; real small record + synthetic sizes; warm same process pair', results };
  fs.writeFileSync(path.join(__dirname, 'artifacts', 'phase-2a-electron.json'), JSON.stringify(evidence, null, 2) + '\n');
  port.close(); child.kill(); clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack); port?.close(); child?.kill(); clearTimeout(timeout); app.exit(1); });
