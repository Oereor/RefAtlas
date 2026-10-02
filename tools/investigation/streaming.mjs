import fs from 'node:fs';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import parser from 'stream-json/parser.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import streamObject from 'stream-json/streamers/stream-object.js';

export function createObserver() {
  const result = { shape: null, records: 0, maxDepth: 0, numberTokens: 0, unsafeIntegerTokens: 0,
    unsigned64Tokens: 0, unsafeExamples: [], keyExamples: [], tokens: 0, maxRecordCharacters: 0 };
  let depth = 0;
  let recordCharacters = 0;
  function consume(token) {
    result.tokens++;
    const start = token.name === 'startObject' || token.name === 'startArray';
    const end = token.name === 'endObject' || token.name === 'endArray';
    const scalar = ['stringValue', 'numberValue', 'nullValue', 'trueValue', 'falseValue'].includes(token.name);
    if (start) {
      if (depth === 0) result.shape = token.name === 'startArray' ? 'array' : 'object';
      if (depth === 1) { result.records++; recordCharacters = 0; }
      depth++;
      result.maxDepth = Math.max(result.maxDepth, depth);
    }
    if (scalar && depth === 1) { result.records++; recordCharacters = 0; }
    if (token.name === 'keyValue' && result.keyExamples.length < 12) result.keyExamples.push(token.value);
    if (token.name === 'numberValue') {
      result.numberTokens++;
      if (/^-?\d{16,}$/.test(token.value)) {
        const integer = BigInt(token.value);
        if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) {
          result.unsafeIntegerTokens++;
          if (result.unsafeExamples.length < 6) result.unsafeExamples.push(token.value);
        }
        if (integer > 9223372036854775807n) result.unsigned64Tokens++;
      }
    }
    if (depth >= 1) recordCharacters += token.value == null ? 1 : String(token.value).length;
    if (end) depth--;
    if (depth === 1 && (end || scalar)) result.maxRecordCharacters = Math.max(result.maxRecordCharacters, recordCharacters);
  }
  return { result, consume };
}

export async function observe(source) {
  const observer = createObserver();
  await pipeline(source, parser.asStream({ streamValues: false }), new Writable({
    objectMode: true,
    write(token, encoding, callback) {
      try { observer.consume(token); callback(); } catch (error) { callback(error); }
    }
  }));
  return observer.result;
}

export async function collectRecords(filename, shape, limit = 50000) {
  const collected = [];
  const streamer = shape === 'array' ? streamArray : streamObject;
  await pipeline(fs.createReadStream(filename), parser.asStream({ streamValues: false }),
    streamer.asStream({ numberAsString: true }), new Writable({ objectMode: true,
      write(record, encoding, callback) {
        if (collected.length < limit) collected.push(record);
        callback();
      }
    }));
  return collected;
}

export async function countLines(filename) {
  let newlines = 0;
  let lastByte = null;
  for await (const chunk of fs.createReadStream(filename)) {
    for (const byte of chunk) if (byte === 10) newlines++;
    lastByte = chunk.at(-1);
  }
  return newlines + (lastByte != null && lastByte !== 10 ? 1 : 0);
}
