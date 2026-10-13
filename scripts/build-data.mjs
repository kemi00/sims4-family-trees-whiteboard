/**
 * Rebuilds src/data/whiteboard.json from u/SkyChips2Go's premade-sims spreadsheet.
 *
 * The source .xlsx is not in git. Download it to data/premade-sims.xlsx first;
 * see data/README.md.
 *
 * The merge is deliberately additive. Card coordinates and the relationship
 * edges between them were authored by hand and exist nowhere in the
 * spreadsheet, so this script never moves or deletes an existing card: it fills
 * in sims and pets that are missing, and refreshes only the descriptive fields
 * that the spreadsheet owns.
 *
 * Usage: node scripts/build-data.mjs [--check] [path/to.xlsx]
 *   --check  report what would change and exit non-zero if anything would,
 *            without writing the file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/data/whiteboard.json');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const XLSX = join(ROOT, args.find((a) => a.endsWith('.xlsx')) ?? 'data/premade-sims.xlsx');

/* ---------------------------------------------------------------- xlsx read */

/** Minimal xlsx reader: an xlsx is a zip of XML, and we only need cell text. */
function readWorkbook(file) {
  const dir = mkdtempSync(join(tmpdir(), 'wbxlsx-'));
  try {
    execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
    const strip = (s) =>
      s
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
    const shared = [
      ...readFileSync(join(dir, 'xl/sharedStrings.xml'), 'utf8').matchAll(
        /<si>([\s\S]*?)<\/si>/g,
      ),
    ].map((m) => strip(m[1]).trim());

    const sheetNames = [
      ...readFileSync(join(dir, 'xl/workbook.xml'), 'utf8').matchAll(
        /<sheet[^>]*name="([^"]+)"/g,
      ),
    ].map((m) => strip(m[1]));

    const sheets = {};
    sheetNames.forEach((name, i) => {
      const xml = readFileSync(join(dir, `xl/worksheets/sheet${i + 1}.xml`), 'utf8');
      const rows = [];
      for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = {};
        for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
          const [, col, attrs, body] = cm;
          const v = body.match(/<v>([\s\S]*?)<\/v>/);
          const inline = body.match(/<is>([\s\S]*?)<\/is>/);
          let val;
          if (/t="s"/.test(attrs) && v) val = shared[+v[1]];
          else if (inline) val = strip(inline[1]);
          else if (v) val = strip(v[1]);
          if (val != null && String(val).trim() !== '') cells[col] = String(val).trim();
        }
        if (Object.keys(cells).length) rows.push(cells);
      }
      sheets[name] = rows;
    });
    return sheets;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

/** Row 1 is a "Last Update" stamp and row 2 is the header, so data starts at 3. */
function table(rows, keys) {
  return rows.slice(2).map((cells) => {
    const o = {};
    keys.forEach((k, i) => {
      o[k] = cells[COLS[i]] ?? '';
    });
    return o;
  });
}

/* -------------------------------------------------------------- normalising */

/**
 * The Surname column doubles as a footnote marker for single-name characters,
 * holding a bare reference number ("Blue 295", "Guidry 506"). Those are not
 * surnames, and the existing board already stores such sims with none.
 */
const cleanSur = (s) => {
  const t = String(s).trim();
  return t === '-' || t === '' || /^\d+(\.\d+)?$/.test(t) ? '' : t;
};

/** Sims with no world of their own: the game's "Currently Not in World". */
const TOWNIE_WORLD = 'Not in any world';
const cleanWorld = (s) => {
  const t = String(s).trim();
  return t === '-' || t === '' ? TOWNIE_WORLD : t;
};

const dash = (s) => {
  const t = String(s).trim();
  return t === '' ? '-' : t;
};

const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const keyOf = (first, sur) => `${norm(first)}|${norm(cleanSur(sur))}`;

/* ------------------------------------------------------------------- inputs */

if (!existsSync(XLSX)) {
  console.error(`Missing spreadsheet: ${XLSX}`);
  console.error('Download from SkyChips2Go and save as data/premade-sims.xlsx — see data/README.md');
  process.exit(1);
}

const sheets = readWorkbook(XLSX);
const simRows = table(sheets['List of Sims'], [
  'first', 'sur', 'hh', 'age', 'state', 'gender', 'frame', 'oplay', 'nb', 'world', 'pack',
]);
const petRows = table(sheets['List of Pets'], [
  'first', 'sur', 'hh', 'age', 'species', 'breed', 'gender', 'oplay', 'nb', 'world', 'pack',
]);

const prev = JSON.parse(readFileSync(OUT, 'utf8'));
const worldColor = (world) =>
  prev.worlds.find((w) => w.name === world)?.color ?? '#9aa0a6';

/* --------------------------------------------------------------- card sizing */

const CARD_W = 200;
const CARD_H = 66;
/** Rough advance width per character at the 10.5px detail font, measured in-browser. */
const CH = 5.35;
const TEXT_X = 16;
const TEXT_PAD = 14;

const detailLine = (row) =>
  [row.breed, row.oplay].map((s) => String(s || '').trim()).filter((s) => s && s !== '-').join(' · ');

/** Pets carry a breed on the detail line, so their cards widen to fit it. */
const cardWidth = (row) =>
  Math.max(CARD_W, Math.ceil(TEXT_X + detailLine(row).length * CH + TEXT_PAD));

/* ------------------------------------------------------------------- merging */

const changes = { addedSims: [], addedPets: [], updated: [], newGroups: [], drift: [], orphans: [] };

const nodes = prev.nodes.map((n) => ({ ...n }));
const byKey = new Map(nodes.map((n) => [keyOf(n.first, n.sur), n]));
const usedIds = new Set(nodes.map((n) => n.id));

/** Ids are display names on this board; disambiguate only on a real collision. */
function uniqueId(base) {
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }
  for (let i = 2; ; i++) {
    const cand = `${base} (${i})`;
    if (!usedIds.has(cand)) {
      usedIds.add(cand);
      return cand;
    }
  }
}

/** Fields the spreadsheet owns. Identity, grouping and geometry are excluded. */
const OWNED = ['age', 'state', 'gender', 'nb', 'oplay', 'pack', 'species', 'breed'];

function refresh(node, row) {
  for (const f of OWNED) {
    const want = row[f];
    if (want == null || want === '') continue;
    const have = node[f] ?? '';
    if (norm(have) !== norm(want)) {
      changes.updated.push(`${node.id}: ${f} "${have}" -> "${want}"`);
      node[f] = want;
    }
  }
  const world = cleanWorld(row.world);
  const hh = row.hh.trim() || cleanSur(row.sur) || row.first.trim();
  const gid = `${world}||${hh}`;
  if (norm(node.world) !== norm(world)) {
    changes.updated.push(`${node.id}: world "${node.world}" -> "${world}"`);
    node.world = world;
    node.color = worldColor(world);
    node.oworld = world;
  }
  if (norm(node.hh) !== norm(hh)) {
    changes.updated.push(`${node.id}: hh "${node.hh}" -> "${hh}"`);
    node.hh = hh;
  }
  if (node.gid !== gid) {
    changes.updated.push(`${node.id}: gid "${node.gid}" -> "${gid}"`);
    node.gid = gid;
  }
}

function makeNode(row, isPet) {
  const first = row.first.trim();
  const sur = cleanSur(row.sur);
  const world = cleanWorld(row.world);
  const hh = row.hh.trim() || sur || first;
  const id = uniqueId([first, sur].filter(Boolean).join(' '));
  const play = row.oplay.trim();
  const node = {
    id,
    gid: `${world}||${hh}`,
    first,
    sur,
    age: row.age.trim(),
    // Pets have a Species column where sims have Life State.
    state: isPet ? 'Pet' : row.state.trim() || 'Sim',
    gender: row.gender.trim() || '-',
    hh,
    world,
    nb: dash(row.nb),
    color: worldColor(world),
    // Mirrors the flag already on the board: set for sims who live nowhere.
    townie: play === 'Townie' || play === 'NPC',
    oworld: world,
    onb: dash(row.nb),
    ohh: hh,
    oplay: play,
    pack: row.pack.trim(),
    ox: 0,
    oy: 0,
  };
  if (isPet) {
    node.species = row.species.trim();
    node.breed = row.breed.trim();
  }
  return node;
}

// Existing cards: refresh descriptive fields, and grow to the new card height.
for (const row of [...simRows, ...petRows]) {
  const hit = byKey.get(keyOf(row.first, row.sur));
  if (hit) refresh(hit, row);
}

// Cards on the board that the spreadsheet does not list are left untouched.
const sheetKeys = new Set([...simRows, ...petRows].map((r) => keyOf(r.first, r.sur)));
for (const n of nodes) {
  if (!sheetKeys.has(keyOf(n.first, n.sur))) changes.orphans.push(`${n.id} (${n.state})`);
}

// Newcomers — positions are computed at runtime by src/lib/layout.ts.
for (const row of simRows) {
  if (byKey.has(keyOf(row.first, row.sur))) continue;
  const n = makeNode(row, false);
  nodes.push(n);
  byKey.set(keyOf(row.first, row.sur), n);
  changes.addedSims.push(n.id);
}
for (const row of petRows) {
  if (byKey.has(keyOf(row.first, row.sur))) continue;
  const n = makeNode(row, true);
  nodes.push(n);
  byKey.set(keyOf(row.first, row.sur), n);
  changes.addedPets.push(`${n.id} (${n.species})`);
}

/** Drop derived geometry — the layout engine owns x/y/w/h. */
function stripGeom(n) {
  const { x, y, w, h, ...rest } = n;
  return { ...rest, ox: rest.ox ?? 0, oy: rest.oy ?? 0 };
}

const outNodes = nodes.map(stripGeom);

/* -------------------------------------------------------------------- groups */

const groups = [];
const haveGid = new Set();
for (const n of outNodes) {
  if (!n.gid || haveGid.has(n.gid)) continue;
  haveGid.add(n.gid);
  const prevG = prev.groups.find((g) => g.gid === n.gid);
  if (prevG) {
    groups.push({ ...prevG });
  } else {
    groups.push({
      gid: n.gid,
      hh: n.hh,
      world: n.world,
      nb: n.nb,
      color: worldColor(n.world),
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
    changes.newGroups.push(n.gid);
  }
}

/* -------------------------------------------------------------------- output */

const out = { nodes: outNodes, edges: prev.edges, groups, worlds: prev.worlds };

const petCount = outNodes.filter((n) => n.species).length;
const report = [
  `sims on board      : ${outNodes.length - petCount}`,
  `pets on board      : ${petCount}`,
  `edges preserved    : ${out.edges.length} (was ${prev.edges.length})`,
  `groups             : ${groups.length} (was ${prev.groups.length}, +${changes.newGroups.length})`,
  ``,
  `added sims         : ${changes.addedSims.length}`,
  `added pets         : ${changes.addedPets.length}`,
  `fields refreshed   : ${changes.updated.length}`,
  `board-only cards kept untouched              : ${changes.orphans.length}`,
];
console.log(report.join('\n'));
if (changes.orphans.length) console.log('  ->', changes.orphans.join(', '));
if (changes.updated.length > 0)
  console.log('  updates:', changes.updated.slice(0, 10).join(' ; '), changes.updated.length > 10 ? '…' : '');
if (changes.addedPets.length) console.log('  pets:', changes.addedPets.join(', '));

if (CHECK) {
  const dirty =
    changes.addedSims.length + changes.addedPets.length + changes.updated.length + changes.newGroups.length;
  if (dirty) {
    console.error(`\n--check: ${dirty} change(s) pending; run without --check to write.`);
    process.exit(1);
  }
  console.log('\n--check: up to date.');
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`\nwrote ${OUT}`);
}
