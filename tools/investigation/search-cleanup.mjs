// 仅删除已核实位于本调查自有目录的 SQLite 与合成 fixture；默认只列清单。
import fs from 'node:fs';
import path from 'node:path';
import { root, output, save } from './search-lib.mjs';
const owned=fs.realpathSync(root),run=process.argv.includes('--execute');
if(owned!==path.resolve(import.meta.dirname,'artifacts','search'))throw new Error('UNEXPECTED_OWNED_ROOT');
const includeLargeJson=process.argv.includes('--include-large-json');
const names=fs.readdirSync(owned).filter(name=>/\.db(?:-(?:wal|shm|journal))?$/.test(name)||/^fixture-.*\.json$/.test(name)||name==='lifecycle-source.json'||includeLargeJson&&/^[\w-]+\.json$/.test(name)&&fs.lstatSync(path.join(owned,name)).isFile()&&fs.statSync(path.join(owned,name)).size>4*1024**2);
const targets=names.map(name=>path.join(owned,name)),temp=path.join(owned,'sqlite-temp');
if(fs.existsSync(temp)){if(fs.realpathSync(temp)!==temp)throw new Error('TEMP_ROOT_SYMLINK');for(const name of fs.readdirSync(temp))targets.push(path.join(temp,name));}
const files=targets.map(absolute=>{
  const name=path.relative(owned,absolute);
  if(![owned,temp].includes(path.dirname(absolute))||!fs.lstatSync(absolute).isFile()||fs.lstatSync(absolute).isSymbolicLink())throw new Error('CLEANUP_OUTSIDE_OWNED_ROOT');
  return {name,absolute,bytes:fs.statSync(absolute).size};
});
console.log(JSON.stringify({execute:run,root:owned,files,bytes:files.reduce((n,f)=>n+f.bytes,0)}));
if(run) {for(const f of files)fs.unlinkSync(f.absolute);save('cleanup.json',{root:owned,files,includeLargeJson,removedBytes:files.reduce((n,f)=>n+f.bytes,0),completedAt:new Date().toISOString()});}
