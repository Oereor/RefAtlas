process.parentPort.on('message', event => {
  const port = event.ports[0];
  port.on('message', message => port.postMessage(message.data));
  port.start();
  port.postMessage({ type: 'ready', processType: process.type, node: process.versions.node, electron: process.versions.electron });
});
