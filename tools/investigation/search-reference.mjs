// Independent complete source reference using stream-json, with exact occurrence-by-occurrence B parity.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import parser from 'stream-json/parser.js';
import { dataRoot } from './common.mjs';
import { output, save, database, now, escape, guard, exactKey, cpLength, histogram } from './search-lib.mjs';

const queries = [
  ['common-number', 'VALUE', 'exact', '1001', 'common ID-like number; also probes numeric-looking string'],
  ['rare-number', 'VALUE', 'exact', '6186714091647966180', 'known real unsafe integer from Avatar raw access'],
  ['numeric-string', 'STRING', 'exact', '1001', 'distinguish string from number; zero is a valid finding'],
  ['common-field', 'FIELD', 'exact', 'ID', 'common raw field'],
  ['rare-field', 'FIELD', 'exact', 'BattleDialogOffset', 'known uncommon Equipment field'],
  ['filename', 'FILE', 'exact', 'AvatarConfig.json', 'known basename'],
  ['path', 'FILE', 'contains', 'Level/Mission', 'real relative directory fragment'],
  ['chs-1', 'STRING', 'contains', '拍', 'one Chinese code point'],
  ['chs-2', 'STRING', 'contains', '拍摄', 'two Chinese code points; previous unicode61 omissions'],
  ['chs-3', 'STRING', 'contains', '拍摄模式', 'four Chinese code points'],
  ['ascii', 'STRING', 'contains', 'Avatar', 'raw ASCII substring and casing'],
  ['punctuation', 'STRING', 'contains', '，', 'literal punctuation'],
  ['common-scalar', 'VALUE', 'exact', '0', 'very common number and any identical raw string'],
  ['rare-scalar', 'STRING', 'contains', 'Avatar_Mar_7th', 'real internal identifier substring'],
  ['zero', 'VALUE', 'contains', '__RefAtlas_no_match_20261004_7e195a__', 'deliberately absent token, verified rather than assumed'],
  ['japanese', 'STRING', 'contains', '撮影', 'Japanese TextMap phrase'],
  ['vietnamese', 'STRING', 'contains', 'chụp', 'Vietnamese literal text, case-sensitive'],
  ['numeric-substring', 'NUMBER', 'contains', '1001', 'lexical numeric substring'],
  ['field-substring', 'FIELD', 'contains', 'Avatar', 'all object members including container fields'],
  ['boolean-literal', 'VALUE', 'exact', 'true', 'boolean and string same literal, keep types distinct'],
  ['null-literal', 'VALUE', 'exact', 'null', 'null and string same literal, possibly no null occurrences'],
  ['ascii-case', 'STRING', 'contains', 'avatar', 'paired case-sensitive experience probe'],
  ['feff', 'STRING', 'contains', '\ufeff', 'real JP U+FEFF exposes production tokenizer data loss'],
  ['feff-exact', 'STRING', 'exact', '\ufeff{F#私}{M#俺}が大魔王？マジで？', 'real source exact string fidelity regression'],
];
export const queryObjects = queries.map(([label, scope, match, query, reason], id) => ({ id, label, scope, match, query, reason }));
export function matches(q, fact) {
  if (q.scope === 'FILE') return false;
  if (q.scope === 'FIELD' && fact.class !== 'FIELD') return false;
  if (q.scope === 'VALUE' && fact.class !== 'VALUE') return false;
  if (q.scope === 'STRING' && fact.kind !== 'string') return false;
  if (q.scope === 'NUMBER' && fact.kind !== 'number') return false;
  return q.match === 'exact' ? fact.text === q.query : fact.text.includes(q.query);
}

if (process.argv[1] === import.meta.filename) {
  save('queries.json', queryObjects);
  const diagnostic=process.argv.slice(2).find(arg=>!arg.startsWith('--')),repair=process.argv.includes('--repair-investigation');
  const db = database('B.db', true), truth = database(diagnostic?'truth-diagnostic.db':'truth.db');
  truth.exec('CREATE TABLE truth(id INTEGER PRIMARY KEY,mask INTEGER NOT NULL);');
  const add = truth.prepare('INSERT INTO truth VALUES(?,?)');
  const getRows = db.prepare('SELECT id,class,kind,pointer_key,exact_key FROM facts WHERE file_id=? ORDER BY id');
  const files = db.prepare('SELECT * FROM files ORDER BY id').all().filter(f=>!diagnostic||f.path===diagnostic);
  const controller = new AbortController(); process.on('SIGINT', () => controller.abort());
  const counts = queryObjects.map(() => 0), unaddressableCounts = queryObjects.map(() => 0), started = now(); let checked = 0, matched = 0, rawFacts = 0;
  const types = {}, lengths = Object.fromEntries(['field','string','number','path'].map(k => [k,histogram()]));
  const ambiguousSources = [], nonNfc = {}, idLike = {number:0,string:0}, special = {unpaired:0,nul:0,negativeZero:0,decimal:0,exponent:0};
  const containers={count:0,serializedBytes:0,queries:['拍','1001'],matched:[0,0],scalarMatched:[0,0]},corrections=[];
  let activeRows, activePath;
  try {
    for (const [i, file] of files.entries()) {
      guard(controller.signal);
      lengths.path.add(cpLength(file.path));
      for (const q of queryObjects.filter(q => q.scope === 'FILE')) if (q.match === 'exact' ? path.posix.basename(file.path) === q.query || file.path === q.query : file.path.includes(q.query)) counts[q.id]++;
      const rows = file.state === 'ready' ? getRows.iterate(file.id) : null, stack = []; let duplicateKeys = 0, sourceFacts = 0;
      activeRows=rows;activePath=file.path;
      const emit = fact => {
        rawFacts++; sourceFacts++; types[fact.kind] = (types[fact.kind] || 0) + 1; lengths[fact.kind]?.add(cpLength(fact.text));
        if (fact.text.normalize('NFC') !== fact.text) nonNfc[fact.kind] = (nonNfc[fact.kind] || 0) + 1;
        if (!fact.text.isWellFormed()) special.unpaired++;
        if (fact.text.includes('\0')) special.nul++;
        if (['number','string'].includes(fact.kind) && /^[1-9][0-9]{3,19}$/.test(fact.text)) idLike[fact.kind]++;
        if (fact.kind === 'number') { if (/^-0(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(fact.text)) special.negativeZero++; if (fact.text.includes('.')) special.decimal++; if (/[eE]/.test(fact.text)) special.exponent++; }
        if (!rows) { for (const q of queryObjects) if (matches(q,fact)) unaddressableCounts[q.id]++; return; }
        const row = rows.next().value;
        if (!row || row.class !== fact.class || row.kind !== fact.kind) throw new Error('REFERENCE_STRUCTURE_PARITY:' + JSON.stringify({ file: file.path, row, fact }));
        if(JSON.parse(row.pointer_key)!==fact.pointer||row.exact_key!==exactKey(fact.kind,fact.text)) {
          if(!repair)throw new Error('REFERENCE_PARITY:'+JSON.stringify({file:file.path,row,fact}));
          corrections.push({file:file.path,id:row.id,old:row,new:{...fact,exact_key:exactKey(fact.kind,fact.text)}});
        }
        checked++;
        let mask = 0;
        for (const q of queryObjects) if (matches(q, fact)) { counts[q.id]++; mask |= 1 << q.id; }
        if (mask) { add.run(row.id, mask); matched++; }
      };
      const locate = () => {
        const parent = stack.at(-1), k = parent ? parent.array ? parent.count : parent.key : null;
        const pointer = parent ? parent.pointer + '/' + escape(k) : '';
        if (parent) { if(parent.count++) parent.serializedBytes++; if (!parent.array) { const text=JSON.stringify(k); parent.serializedBytes+=Buffer.byteLength(text)+1; containers.queries.forEach((q,j)=>{if(text.includes(q))parent.matches.add(j);}); emit({ class: 'FIELD', kind: 'field', pointer, text: k }); } }
        return pointer;
      };
      truth.exec('BEGIN');
      await pipeline(fs.createReadStream(path.join(dataRoot, file.path)), parser.asStream({ streamKeys: false, streamStrings: false, streamNumbers: false }), new Writable({ objectMode: true, write(token, encoding, callback) {
        try {
          if (token.name === 'keyValue') { const f=stack.at(-1); if(f.keys.has(token.value)) duplicateKeys++; f.keys.add(token.value); f.key = token.value; }
          else if (token.name === 'startObject' || token.name === 'startArray') stack.push({ pointer: locate(), array: token.name === 'startArray', count: 0, keys:new Set(),serializedBytes:2,matches:new Set() });
          else if (token.name === 'endObject' || token.name === 'endArray') { const f=stack.pop(); containers.count++;containers.serializedBytes+=f.serializedBytes;for(const j of f.matches)containers.matched[j]++;const parent=stack.at(-1);if(parent){parent.serializedBytes+=f.serializedBytes;for(const j of f.matches)parent.matches.add(j);} }
          else if (['stringValue', 'numberValue', 'nullValue', 'trueValue', 'falseValue'].includes(token.name)) {
            const kind = token.name === 'stringValue' ? 'string' : token.name === 'numberValue' ? 'number' : token.name === 'nullValue' ? 'null' : 'boolean';
            const pointer=locate(),text=kind === 'null' ? 'null' : String(token.value),serialized=kind==='string'?JSON.stringify(text):text;
            emit({ class: 'VALUE', kind, pointer, text });
            const parent=stack.at(-1);if(parent)parent.serializedBytes+=Buffer.byteLength(serialized);containers.queries.forEach((q,j)=>{if(serialized.includes(q)){containers.scalarMatched[j]++;parent?.matches.add(j);}});
          }
          callback();
        } catch (e) { callback(e); }
      } }));
      if (rows && !rows.next().done) throw new Error('REFERENCE_OMITTED_OCCURRENCE');
      if (duplicateKeys) ambiguousSources.push({path:file.path,duplicateKeys,rawFacts:sourceFacts,indexed:false});
      truth.exec('COMMIT');
      if (i % 5000 === 0 || i === files.length - 1) { console.log(JSON.stringify({ stage: 'reference', sources: i + 1, checked, matched, seconds: (now() - started) / 1000 })); save('reference-progress.json', { sources: i + 1, checked, matched }); }
    }
    activeRows?.return();activeRows=null;
    if(repair&&corrections.length){const writer=database('B.db'),update=writer.prepare('UPDATE facts SET pointer_key=?,exact_key=?,text=?,cp_length=? WHERE id=?');writer.transaction(()=>{for(const correction of corrections){const f=correction.new;update.run(JSON.stringify(f.pointer),f.exact_key,f.text.isWellFormed()?f.text:null,cpLength(f.text),correction.id);const actual=writer.prepare('SELECT pointer_key,exact_key FROM facts WHERE id=?').get(correction.id);if(actual.pointer_key!==JSON.stringify(f.pointer)||actual.exact_key!==f.exact_key)throw new Error('CORRECTION_VERIFICATION');}})();writer.pragma('wal_checkpoint(TRUNCATE)');writer.close();}
    save('fidelity-corrections.json',{corrections,applied:repair,productionModified:false});
    truth.pragma('wal_checkpoint(TRUNCATE)');
    save(diagnostic?'reference-diagnostic.json':'reference.json', { queries: queryObjects.map(q => ({ ...q, count: counts[q.id], unaddressableRawMatches:unaddressableCounts[q.id], fullRawMatches:counts[q.id]+unaddressableCounts[q.id] })), sources: files.length, occurrencesCompared: checked, matchedOccurrenceRows: matched, wallMs: now() - started, independentParser: 'stream-json 3.7.0, numberValue raw lexeme, no Assembler', complete: true, indexedScopeComplete:true, workspaceSearchComplete:ambiguousSources.length===0, occurrenceParityAfterInvestigationCorrections:true,productionTokenizerParity:false,productionParityIssue:'known U+FEFF segmented decoder loss; investigation raw-string observation corrected; production unchanged',fidelityCorrections:corrections.length, census:{rawFacts,types,lengths:Object.fromEntries(Object.entries(lengths).map(([k,v])=>[k,v.result()])),nonNfc,idLike,special,ambiguousSources,containers},resourceUsage: process.resourceUsage() });
    console.log(JSON.stringify({ complete: true, checked, counts }));
  } catch(e) { console.error(JSON.stringify({failedSource:activePath,error:e.message}));throw e; }
  finally { activeRows?.return();if (truth.inTransaction) truth.exec('ROLLBACK'); truth.close(); db.close(); }
}
