// Electron Utility / Worker 私有入口。Native DB 对象从不进入消息。
const { parentPort, Worker, threadId } = require('node:worker_threads');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs'), path = require('node:path');
const port = parentPort || process.parentPort;
const send = m => port.postMessage(m);
const root = path.join(__dirname, 'artifacts/search-round2/execution-lane-closeout');
const role = process.argv.at(-1), context = new AsyncLocalStorage(), active = new Map();
let service, wid, avatar, info, scalar, scalarInfo, equipment, work, worker, workerReady, searchTail = Promise.resolve(), coldActivation = true;
let queue = [], progressLast = 0;
const eventLoop = monitorEventLoopDelay({ resolution: 10 }); eventLoop.enable();
function telemetry(id, value) {
  if (value.phase === 'resources-released' || value.phase.startsWith('blocking-') || value.phase === 'source-verified' || Date.now() - progressLast >= 100) { send({ type: 'progress', id, value }); progressLast = Date.now(); }
}
async function initialize() {
  work = (await import('./search2-closeout-work.mjs')).work;
  if (role === 'browser') {
    const { RawDataService } = require(path.join(root, 'production.cjs'));
    service = new RawDataService();
    for (const name of ['parserQueue', 'metadataQueue']) { const q = service[name], original = q.run.bind(q); q.run = (signal, action) => { const submitted = performance.now(), label = context.getStore(); return original(signal, async () => { const entered = performance.now(); try { return await action(); } finally { if (label) queue.push({ ...label, lane: name, queueMs: entered - submitted, executionMs: performance.now() - entered }); } }); }; }
    const { dataRoot } = await import('./common.mjs'), signal = new AbortController().signal;
    wid = (await service.execute({ kind: 'open', root: dataRoot }, signal)).workspaceId;
    avatar = { workspaceId: wid, relativePath: 'ExcelOutput/AvatarConfig.json' }; scalar = { workspaceId: wid, relativePath: 'TextMap/TextMapCHS.json' }; equipment = { workspaceId: wid, relativePath: 'ExcelOutput/EquipmentConfig.json' };
    info = await service.execute({ kind: 'info', source: avatar }, signal); scalarInfo = await service.execute({ kind: 'info', source: scalar }, signal);
    for (const [source, metadata] of [[avatar, info], [scalar, scalarInfo]]) await service.execute({ kind: 'read', address: { source, pointer: '' }, expectedRevision: metadata.revision }, signal);
  }
  send({ type: 'ready', role, pid: process.pid, threadId, runtime: process.versions, sqliteOwnerLocal: true });
}
async function ensureWorker() {
  if (worker) return workerReady;
  worker = new Worker(__filename, { argv: ['search'] });
  workerReady = new Promise((resolve, reject) => {
    worker.on('message', m => { if (m.type === 'ready') resolve(m); else send(m); });
    worker.on('error', e => { reject(e); send({ type: 'worker-error', error: e.stack }); });
    worker.on('exit', code => { const expected = worker.expectedExit; worker = null; workerReady = null; send({ type: 'worker-exit', code, expected, time: Date.now() }); if (code && !expected) send({ type: 'fatal', error: 'UNEXPLAINED_WORKER_EXIT_' + code }); });
  });
  return workerReady;
}
async function browser(m) {
  const signal = new AbortController().signal, observations = [], start = performance.now(), enteredAt = Date.now();
  const segment = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts/search/runtime.json'))).segmentFixture.pointer;
  const initialActivation = coldActivation;
  const actions = [
    ['listDirectory', () => service.execute({ kind: 'directory', workspaceId: wid, directory: 'ExcelOutput', cursor: null, limit: 100 }, signal)],
    ['getSourceInfo', () => service.execute({ kind: 'info', source: avatar }, signal)],
    ['readNode', () => service.execute({ kind: 'read', address: { source: avatar, pointer: '/0/AvatarID' }, expectedRevision: info.revision }, signal)],
    ['listNodeChildren', () => service.execute({ kind: 'children', address: { source: avatar, pointer: '/0' }, expectedRevision: info.revision, cursor: null, limit: 100 }, signal)],
    ['readScalarSegment', () => service.execute({ kind: 'segment', address: { source: scalar, pointer: segment }, expectedRevision: scalarInfo.revision, cursor: null, limit: 4096 }, signal)],
    ['sourceActivation', async () => { const acquired = await service.execute({ kind: 'info', source: equipment }, signal); const value = await service.execute({ kind: 'read', address: { source: equipment, pointer: '' }, expectedRevision: acquired.revision }, signal); coldActivation = false; return value; }],
  ];
  await Promise.all(actions.filter(([operation]) => !m.operation || operation === m.operation).map(async ([operation, action]) => { const began = performance.now(), beginAt = Date.now(); try { const value = await context.run({ id: m.id, operation }, action); observations.push({ operation, wallMs: performance.now() - began, beginAt, endAt: Date.now(), ok: true, bytes: Buffer.byteLength(JSON.stringify(value)), ...(operation === 'sourceActivation' ? { cache: initialActivation ? 'first full validation in this Utility' : 'registered current source/ranges' } : {}) }); } catch (e) { observations.push({ operation, wallMs: performance.now() - began, beginAt, endAt: Date.now(), ok: false, error: e.code || e.message }); } }));
  const result = { observations, queue: queue.filter(q => q.id === m.id), utilityWallMs: performance.now() - start, enteredAt, endedAt: Date.now(), eventLoop: { maxMs: eventLoop.max / 1e6, p99Ms: eventLoop.percentile(99) / 1e6 } };
  queue = queue.filter(q => q.id !== m.id); send({ type: 'result', id: m.id, result });
}
async function executeSearch(m) {
  const controller = new AbortController(); active.set(m.id, controller);
  send({ type: 'started', id: m.id, time: Date.now(), owner: { pid: process.pid, threadId } });
  try { const result = await work(m.kind, { signal: controller.signal, id: m.id, windowMs: m.windowMs, failureMode: m.failureMode, emit: value => telemetry(m.id, value) }); send({ type: 'result', id: m.id, result }); }
  catch (e) { send({ type: 'failed', id: m.id, error: e.stack }); }
  finally { active.delete(m.id); }
}
async function handle(m) {
  try {
    if (m.type === 'browser') await browser(m);
    else if (m.type === 'reset-monitor') { eventLoop.reset(); send({ type: 'result', id: m.id, result: { resetAt: Date.now() } }); }
    else if (m.type === 'prepare-worker') { const result = await ensureWorker(); send({ type: 'result', id: m.id, result }); }
    else if (m.type === 'search') {
      if (m.mode === 'worker') { await ensureWorker(); if (m.failureMode) worker.expectedExit = 23; worker.postMessage({ ...m, mode: 'local' }); }
      else { searchTail = searchTail.then(() => executeSearch(m)); await searchTail; }
    } else if (m.type === 'cancel') {
      const receivedAt = Date.now();
      if (m.mode === 'worker') { send({ type: 'cancel-forwarded', id: m.targetId, receivedAt, emittedAt: m.emittedAt }); worker.postMessage({ ...m, mode: 'local' }); }
      else { const controller = active.get(m.targetId); controller?.abort(); send({ type: 'cancel-ack', id: m.targetId, emittedAt: m.emittedAt, receivedAt, acknowledgedAt: Date.now(), taskActive: Boolean(controller), interruptionClaim: false }); }
    } else if (m.type === 'known-exit') {
      if (m.mode === 'worker') { await ensureWorker(); worker.expectedExit = 23; worker.postMessage({ ...m, mode: 'local' }); }
      else process.exit(23);
    } else if (m.type === 'close') {
      if (worker) { worker.expectedExit = 0; worker.postMessage({ type: 'close' }); while (worker) await new Promise(r => setTimeout(r, 10)); }
      service?.dispose(); eventLoop.disable(); send({ type: 'closed', pid: process.pid, time: Date.now() }); process.exit(0);
    }
  } catch (e) { send({ type: 'failed', id: m.id, error: e.stack }); }
}
port.on('message', m => handle(parentPort ? m : m.data));
initialize().catch(e => { send({ type: 'fatal', error: e.stack }); process.exit(1); });
