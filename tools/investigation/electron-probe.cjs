const fs = require('node:fs');
const path = require('node:path');
const { app, utilityProcess } = require('electron');

const timeout = setTimeout(() => { console.error('Electron 探针超时'); app.exit(1); }, 15000);
app.whenReady().then(() => {
  const child = utilityProcess.fork(path.join(__dirname, 'electron-data.cjs'), [], { serviceName: 'RefAtlas Phase 0 非生产探针' });
  child.on('message', result => {
    const output = path.join(__dirname, 'artifacts', 'electron.json');
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
    clearTimeout(timeout);
    child.kill();
    app.exit(result.nodeSqlite.ok && result.betterSqlite.ok ? 0 : 1);
  });
  child.on('exit', code => { if (code && code !== 0) { clearTimeout(timeout); app.exit(code); } });
}).catch(error => { console.error('Electron 探针失败：' + error.stack); app.exit(1); });
