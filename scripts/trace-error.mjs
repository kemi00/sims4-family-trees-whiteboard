#!/usr/bin/env node
/**
 * Traces a problem report's file:line:column back to the source, with the
 * build's hidden source map (vite.config.ts writes one per build):
 *
 *   pnpm build   # on the commit the report names ("build abc1234")
 *   node scripts/trace-error.mjs index-AbC123.js:10:2141 [more positions]
 *
 * Looks for each file's .map in dist/assets.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const vlq = (s) => {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of s) {
    const d = B64.indexOf(ch);
    value += (d & 31) << shift;
    if (d & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
};

const cache = new Map();
function decoded(file) {
  if (cache.has(file)) return cache.get(file);
  const map = JSON.parse(readFileSync(join('dist/assets', `${file}.map`), 'utf8'));
  const lines = [];
  let src = 0;
  let oLine = 0;
  let oCol = 0;
  let name = 0;
  for (const line of map.mappings.split(';')) {
    let col = 0;
    const segs = [];
    for (const seg of line.split(',')) {
      if (!seg) continue;
      const v = vlq(seg);
      col += v[0];
      if (v.length >= 4) {
        src += v[1];
        oLine += v[2];
        oCol += v[3];
        if (v.length >= 5) name += v[4];
        segs.push({ col, src, oLine, oCol, name: v.length >= 5 ? name : -1 });
      }
    }
    lines.push(segs);
  }
  const out = { map, lines };
  cache.set(file, out);
  return out;
}

for (const arg of process.argv.slice(2)) {
  const m = /^(.+\.js):(\d+):(\d+)$/.exec(arg);
  if (!m) {
    console.log(`${arg}: not file.js:line:column`);
    continue;
  }
  const [, file, line, col] = m;
  const { map, lines } = decoded(file);
  // Stack columns are 1-based, map columns 0-based.
  const segs = lines[Number(line) - 1] ?? [];
  const at = Number(col) - 1;
  let best = null;
  for (const s of segs) if (s.col <= at) best = s;
  console.log(
    best
      ? `${arg} -> ${map.sources[best.src]}:${best.oLine + 1}:${best.oCol + 1}${best.name >= 0 ? ` (${map.names[best.name]})` : ''}`
      : `${arg}: no mapping`,
  );
}
