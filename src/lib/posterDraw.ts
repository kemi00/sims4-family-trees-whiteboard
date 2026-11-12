import { neighbourhoodIconUrl, worldIconUrl } from './places.ts';
import type { PosterCard, PosterCouple, PosterModel } from './poster.ts';

/**
 * Draws a poster (PosterModel) as a PNG, in the board's look: whitish
 * blue-gray paper, the household's colour along the band's foot and down
 * each card's edge, planned sims dashed violet, the deceased faded. Each
 * row is one centred line of cards, so its family can be drawn: partners
 * joined side by side with rings (married), a heart (partners) or broken
 * rings (divorced), and a line from parents down to each child. 1080 wide,
 * wider when a row needs it; as tall as its rows. Names wrap, never cut.
 */

const BASE_W = 1080;
const PAD = 64;
/** Between cards in a row: room for a couple's mark. */
const GAP = 48;
const CARD_MAX_W = 300;
const CARD_MIN_W = 230;
const CARD_H = 150;
/** Between one row's cards and the next's: room for the lines to the children. */
const ROW_GAP = 84;
const LABEL_H = 46;
/** Under a row's label, the room its lines to the children run in. */
const BUS_H = 60;
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

/** The board's tokens, as hex: the canvas can't read CSS variables. */
const C = {
  paper: '#f4f7fb',
  card: '#ffffff',
  line: '#e1e7ef',
  ink: '#1b2b3a',
  ink2: '#4a5868',
  ink3: '#7d8a99',
  recess: '#eef2f7',
  band: '#e4ebf3',
  plan: '#7c3aed',
  planSoft: '#f6f2ff',
  /** Family lines, a shade darker than the rules. */
  link: '#8e9bab',
  heart: '#d64f7a',
};

const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

/** Lines of `text` no wider than `max`; a word too long for a line breaks within. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const push = (word: string) => {
    // A word wider than a line: break it by letters.
    let w = word;
    while (ctx.measureText(w).width > max && w.length > 1) {
      let i = w.length - 1;
      while (i > 1 && ctx.measureText(w.slice(0, i)).width > max) i--;
      lines.push(w.slice(0, i));
      w = w.slice(i);
    }
    return w;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= max) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = push(word);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The largest size from `from` down to `min` at which `text` fits in `maxLines`; at `min`, as many as it needs. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number, from: number, min: number, weight: number) {
  for (let size = from; size >= min; size -= 1) {
    ctx.font = font(size, weight);
    const lines = wrap(ctx, text, max);
    if (lines.length <= maxLines || size === min) return { size, lines };
  }
  ctx.font = font(min, weight);
  return { size: min, lines: wrap(ctx, text, max) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** A round picture with a white ring, or a blank ring when there is none. */
function badge(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = C.recess;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Lines for a card `w` wide: its name at the size that fits, its role, then what the lines can't show. */
function cardText(ctx: CanvasRenderingContext2D, c: PosterCard, w: number) {
  const name = fit(ctx, c.name, w - 44, 2, 30, 20, 700);
  ctx.font = font(21, 400);
  const role = c.role ? wrap(ctx, c.role, w - 44) : [];
  ctx.font = font(20, 400);
  const notes = (c.notes ?? []).flatMap((n) => wrap(ctx, n, w - 44));
  return { name, role, notes };
}

function drawCard(ctx: CanvasRenderingContext2D, c: PosterCard, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = c.planned ? C.planSoft : c.deceased ? C.recess : C.card;
  ctx.fill();
  ctx.lineWidth = c.planned ? 3 : 2;
  ctx.strokeStyle = c.planned ? C.plan : C.line;
  if (c.planned) ctx.setLineDash([10, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
  // The household's colour down the left edge, as on the board.
  ctx.save();
  roundRect(ctx, x, y, w, h, 16);
  ctx.clip();
  ctx.fillStyle = c.planned ? C.plan : c.color;
  ctx.globalAlpha = c.deceased ? 0.45 : 1;
  ctx.fillRect(x, y, 10, h);
  ctx.restore();

  const { name, role, notes } = cardText(ctx, c, w);
  let ty = y + 24;
  ctx.textBaseline = 'top';
  ctx.fillStyle = c.deceased ? C.ink3 : C.ink;
  ctx.font = font(name.size, 700);
  for (const l of name.lines) {
    ctx.fillText(l, x + 28, ty);
    ty += name.size * 1.2;
  }
  ty += 4;
  ctx.font = font(21, 400);
  ctx.fillStyle = c.planned ? C.plan : C.ink2;
  ctx.fillText(stageLine(c), x + 28, ty);
  ty += 28;
  ctx.fillStyle = C.ink2;
  for (const l of role) {
    ctx.fillText(l, x + 28, ty);
    ty += 26;
  }
  ctx.font = font(20, 400);
  ctx.fillStyle = C.ink3;
  for (const l of notes) {
    ctx.fillText(l, x + 28, ty);
    ty += 25;
  }
  ctx.restore();
}

/** "Adult", "Elder · passed away", "Passed away" (age unknown), "Child · planned". */
function stageLine(c: PosterCard): string {
  const known = c.stage && c.stage !== 'Unknown';
  if (c.deceased) return known ? `${c.stage} · passed away` : 'Passed away';
  if (c.planned && c.stage !== 'Not born yet') return known ? `${c.stage} · planned` : 'Planned';
  return known ? c.stage : '';
}

/** A card's height: its text, at least CARD_H. */
function cardHeight(ctx: CanvasRenderingContext2D, c: PosterCard, w: number): number {
  const { name, role, notes } = cardText(ctx, c, w);
  return Math.max(CARD_H, 24 + name.lines.length * name.size * 1.2 + 4 + 28 + role.length * 26 + notes.length * 25 + 20);
}

type Mark = PosterCouple['type'];

/**
 * A couple's mark, centred on (x, y), as the board draws it: two rings
 * linked for a marriage, a heart for partners, two rings apart and struck
 * through for a divorce. Violet when planned; a planned end strikes it
 * through in violet. Parents of a child together get no mark.
 */
function drawMark(ctx: CanvasRenderingContext2D, type: Mark, x: number, y: number, planned: boolean, ending: boolean) {
  if (type === 'coparents') return;
  const ink = planned ? C.plan : C.ink2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = planned ? C.plan : C.link;
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ink;
  if (type === 'marriage') {
    for (const dx of [-4, 4]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, 6.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (type === 'romance') {
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.bezierCurveTo(x - 13, y - 1, x - 7, y - 12, x, y - 5);
    ctx.bezierCurveTo(x + 7, y - 12, x + 13, y - 1, x, y + 8);
    ctx.fillStyle = planned ? C.plan : C.heart;
    ctx.fill();
  } else {
    for (const dx of [-6, 6]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - 9, y + 9);
    ctx.lineTo(x + 9, y - 9);
    ctx.stroke();
  }
  if (ending && type !== 'divorced') {
    ctx.strokeStyle = C.plan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 11);
    ctx.lineTo(x + 11, y - 11);
    ctx.stroke();
  }
  ctx.restore();
}

/** A line along `points`, solid or dashed, in the family lines' colour or violet. */
function polyline(ctx: CanvasRenderingContext2D, points: [number, number][], opts: { planned?: boolean; dashed?: boolean; width?: number }) {
  ctx.save();
  ctx.strokeStyle = opts.planned ? C.plan : C.link;
  ctx.lineWidth = opts.width ?? 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts.dashed || opts.planned) ctx.setLineDash(opts.dashed ? [4, 7] : [10, 7]);
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

/** The poster as a PNG. */
export async function drawPoster(model: PosterModel): Promise<Blob> {
  const [worldImg, nbImg] = await Promise.all([
    loadImage(model.world ? worldIconUrl(model.world) : undefined),
    loadImage(model.world && model.nb ? neighbourhoodIconUrl(model.world, model.nb) : undefined),
  ]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');

  // Each row is one line: cards as wide as fit the widest row, the poster wider past that.
  const widest = Math.max(1, ...model.rows.map((r) => r.cards.length));
  const cw = Math.max(CARD_MIN_W, Math.min(CARD_MAX_W, (BASE_W - PAD * 2 - GAP * (widest - 1)) / widest));
  const W = Math.ceil(Math.max(BASE_W, PAD * 2 + widest * cw + (widest - 1) * GAP));

  // Measure first: the poster is as tall as its rows.
  const badges = (model.world ? 1 : 0) + (model.nb ? 1 : 0);
  const textMax = W - PAD * 2 - badges * 112;
  const title = fit(ctx, model.title, textMax, 2, 60, 40, 800);
  ctx.font = font(26, 400);
  const sub = model.subtitle ? wrap(ctx, model.subtitle, textMax) : [];
  const headH = Math.max(240, PAD + title.lines.length * title.size * 1.15 + 14 + sub.length * 34 + 48);
  ctx.font = font(26, 600);
  const lineText = model.line?.join('   →   ') ?? '';
  const lineRows = lineText ? wrap(ctx, lineText, W - PAD * 2 - 40) : [];
  const lineH = lineRows.length ? 44 + 32 + lineRows.length * 38 + 28 : 0;

  // Its story, the latest moments: when, then what, each wrapped.
  const STORY_MAX = 10;
  const story = model.story?.slice(-STORY_MAX) ?? [];
  const earlier = (model.story?.length ?? 0) - story.length;
  ctx.font = font(22, 400);
  const storyText = story.map((l) => wrap(ctx, l.text, W - PAD * 2 - 48));
  const storyH = story.length ? 44 + 30 + storyText.reduce((h, t) => h + 24 + t.length * 30 + 10, 0) + (earlier ? 34 : 0) + 24 : 0;

  // Where each card goes: rows stacked, each centred.
  const rowsTop = headH + 40 + lineH + storyH;
  type Spot = { x: number; y: number; h: number; row: number };
  const spot = new Map<string, Spot>();
  const rowGeo: { labelY?: number; top: number; h: number }[] = [];
  let y = rowsTop;
  // A row's label heads the gap above it, the lines to its sims run under the label.
  const rowOfCard = new Map<string, number>();
  model.rows.forEach((r, ri) => r.cards.forEach((c) => rowOfCard.set(c.id, ri)));
  const fed = new Set(model.families.map((f) => Math.min(...f.children.map((k) => rowOfCard.get(k.id) ?? Infinity))));
  const busMid: number[] = [];
  model.rows.forEach((r, ri) => {
    const labelY = r.label ? (ri ? y + 20 : y) : undefined;
    const bus = fed.has(ri) ? BUS_H : 8;
    if (!ri) y += r.label ? LABEL_H : 0;
    else y += r.label ? 20 + LABEL_H + bus : ROW_GAP;
    busMid.push(r.label ? y - bus / 2 : y - ROW_GAP / 2);
    const h = Math.max(CARD_H, ...r.cards.map((c) => cardHeight(ctx, c, cw)));
    const x0 = (W - (r.cards.length * cw + (r.cards.length - 1) * GAP)) / 2;
    r.cards.forEach((c, i) => spot.set(c.id, { x: x0 + i * (cw + GAP), y, h, row: ri }));
    rowGeo.push({ ...(labelY !== undefined ? { labelY } : {}), top: y, h });
    y += h;
  });

  // The key: only the marks this poster uses.
  const used = new Set(model.couples.map((c) => c.type));
  const key: { mark?: Mark; line?: boolean; text: string }[] = [
    ...(used.has('marriage') ? [{ mark: 'marriage' as const, text: 'Married' }] : []),
    ...(used.has('romance') ? [{ mark: 'romance' as const, text: 'Partners' }] : []),
    ...(used.has('divorced') ? [{ mark: 'divorced' as const, text: 'Divorced' }] : []),
    ...(model.families.length ? [{ line: true, text: 'Parents and children' }] : []),
  ];
  const anyPlanned =
    model.couples.some((c) => c.planned || c.ending) || model.families.some((f) => f.children.some((k) => k.planned));
  if (key.length && anyPlanned) key.push({ text: 'Violet: planned, not in your save yet' });
  // Its items in lines as wide as the poster.
  ctx.font = font(20, 500);
  const keyLines: { item: (typeof key)[number]; x: number }[][] = [];
  let kx = PAD;
  for (const item of key) {
    const w = (item.mark ? 44 : item.line ? 40 : 0) + ctx.measureText(item.text).width;
    if (!keyLines.length || (kx + w > W - PAD && kx > PAD)) {
      keyLines.push([]);
      kx = PAD;
    }
    keyLines[keyLines.length - 1]!.push({ item, x: kx });
    kx += w + 32;
  }
  const keyH = keyLines.length ? keyLines.length * 44 + 20 : 0;
  const footH = 110;
  const H = Math.ceil(y + 48 + keyH + footH);
  canvas.width = W;
  canvas.height = H;

  // Paper.
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // The band: whitish blue-gray, the household's colour along its foot
  // (a warm colour tinted pale would turn beige).
  ctx.fillStyle = C.band;
  ctx.fillRect(0, 0, W, headH);
  ctx.fillStyle = model.color;
  ctx.fillRect(0, headH - 10, W, 10);
  ctx.textBaseline = 'top';
  let ty = PAD;
  ctx.fillStyle = C.ink;
  ctx.font = font(title.size, 800);
  for (const l of title.lines) {
    ctx.fillText(l, PAD, ty);
    ty += title.size * 1.15;
  }
  ty += 14;
  ctx.font = font(26, 400);
  ctx.fillStyle = C.ink2;
  for (const l of sub) {
    ctx.fillText(l, PAD, ty);
    ty += 34;
  }
  // The world's picture and the neighbourhood's icon, top right.
  let bx = W - PAD - 48;
  if (model.nb) {
    badge(ctx, nbImg, bx, PAD + 48, 48);
    bx -= 112;
  }
  if (model.world) badge(ctx, worldImg, bx, PAD + 48, 48);

  // A dynasty's line of succession.
  if (lineRows.length) {
    const ly0 = headH + 40;
    roundRect(ctx, PAD, ly0, W - PAD * 2, lineH - 28, 18);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = font(19, 700);
    ctx.fillStyle = C.ink3;
    ctx.fillText('LINE OF SUCCESSION', PAD + 24, ly0 + 22);
    ctx.font = font(26, 600);
    ctx.fillStyle = C.ink;
    let ly = ly0 + 22 + 32;
    for (const l of lineRows) {
      ctx.fillText(l, PAD + 24, ly);
      ly += 38;
    }
  }

  // Each label's divider: a faint rule from its words across the poster, under the lines.
  ctx.font = font(20, 700);
  model.rows.forEach((r, ri) => {
    const ly = rowGeo[ri]!.labelY;
    if (!r.label || ly === undefined) return;
    const from = PAD + ctx.measureText(r.label.toUpperCase()).width + 16;
    ctx.fillStyle = C.line;
    ctx.fillRect(from, ly + 19, W - PAD - from, 2);
  });

  // Its story so far, from the chronicle.
  if (story.length) {
    const sy0 = headH + 40 + lineH;
    roundRect(ctx, PAD, sy0, W - PAD * 2, storyH - 24, 18);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textBaseline = 'top';
    ctx.font = font(19, 700);
    ctx.fillStyle = C.ink3;
    ctx.fillText('THE STORY SO FAR', PAD + 24, sy0 + 22);
    let sy = sy0 + 22 + 34;
    story.forEach((l, i) => {
      ctx.font = font(19, 600);
      ctx.fillStyle = C.ink3;
      ctx.fillText(l.when, PAD + 24, sy);
      sy += 24;
      ctx.font = font(22, 400);
      ctx.fillStyle = C.ink;
      for (const t of storyText[i]!) {
        ctx.fillText(t, PAD + 24, sy);
        sy += 30;
      }
      sy += 10;
    });
    if (earlier) {
      ctx.font = font(19, 500);
      ctx.fillStyle = C.ink3;
      ctx.fillText(`And ${earlier === 1 ? '1 earlier moment' : `${earlier} earlier moments`} in the board’s Chronicle.`, PAD + 24, sy);
    }
  }

  // Family lines first, so cards sit over any that pass behind them.
  const coupleOf = new Map<string, PosterCouple>();
  for (const c of model.couples) coupleOf.set([c.a, c.b].sort().join('|'), c);
  const centre = (id: string) => spot.get(id)!.x + cw / 2;
  const intoRow = new Map<number, number>();
  const busesInto = new Map<number, number>();
  for (const f of model.families) {
    const row = Math.min(...f.children.map((k) => spot.get(k.id)?.row ?? Infinity));
    if (Number.isFinite(row)) busesInto.set(row, (busesInto.get(row) ?? 0) + 1);
  }
  for (const f of model.families) {
    const kids = f.children.filter((k) => spot.has(k.id));
    const parents = f.parents.filter((p) => spot.has(p));
    if (!kids.length || !parents.length) continue;
    const row = Math.min(...kids.map((k) => spot.get(k.id)!.row));
    const geo = rowGeo[row]!;
    // The bus runs in the gap above the children's row, under its label, a little apart from its neighbours'.
    const n = busesInto.get(row) ?? 1;
    const k = intoRow.get(row) ?? 0;
    intoRow.set(row, k + 1);
    const spread = Math.min(12, (BUS_H - 20) / Math.max(1, n - 1));
    const busY = row === 0 ? geo.top - 20 : busMid[row]! + (k - (n - 1) / 2) * spread;
    // From the couple's mark between them, or down from each parent.
    const together = parents.length === 2 && coupleOf.has([...parents].sort().join('|'));
    const drops: [number, number][] = together
      ? (() => {
          const [a, b] = parents.map((p) => spot.get(p)!).sort((p, q) => p.x - q.x);
          return [[(a!.x + cw + b!.x) / 2, a!.y + a!.h / 2]];
        })()
      : parents.map((p) => [centre(p), spot.get(p)!.y + spot.get(p)!.h]);
    // A parent below the children (rare): no line rather than one upwards.
    if (drops.some(([, dy]) => dy > busY)) continue;
    const xs = [...drops.map(([x]) => x), ...kids.map((kid) => centre(kid.id))];
    for (const [dx, dy] of drops) polyline(ctx, [[dx, dy], [dx, busY]], {});
    polyline(ctx, [[Math.min(...xs), busY], [Math.max(...xs), busY]], {});
    for (const kid of kids) {
      const s = spot.get(kid.id)!;
      polyline(ctx, [[centre(kid.id), busY], [centre(kid.id), s.y]], { planned: kid.planned, dashed: kid.adopted && !kid.planned });
    }
  }
  // Each couple joined across the gap between them.
  for (const c of model.couples) {
    const [a, b] = [spot.get(c.a), spot.get(c.b)].sort((p, q) => (p?.x ?? 0) - (q?.x ?? 0));
    if (!a || !b) continue;
    const my = a.y + a.h / 2;
    polyline(ctx, [[a.x + cw, my], [b.x, my]], { planned: c.planned, width: c.type === 'coparents' ? 2 : 3 });
  }

  // Row labels: the generation dividers, their words over any line passing behind.
  model.rows.forEach((r, ri) => {
    const ly = rowGeo[ri]!.labelY;
    if (!r.label || ly === undefined) return;
    ctx.font = font(20, 700);
    const text = r.label.toUpperCase();
    ctx.fillStyle = C.paper;
    ctx.fillRect(PAD - 8, ly + 4, ctx.measureText(text).width + 16, 30);
    ctx.fillStyle = C.ink3;
    ctx.textBaseline = 'top';
    ctx.fillText(text, PAD, ly + 10);
  });

  // The sims.
  for (const r of model.rows) for (const c of r.cards) {
    const s = spot.get(c.id)!;
    drawCard(ctx, c, s.x, s.y, cw, s.h);
  }
  // Couples' marks over the line between them.
  for (const c of model.couples) {
    const [a, b] = [spot.get(c.a), spot.get(c.b)].sort((p, q) => (p?.x ?? 0) - (q?.x ?? 0));
    if (a && b) drawMark(ctx, c.type, (a.x + cw + b.x) / 2, a.y + a.h / 2, c.planned, c.ending);
  }

  // The key, then the footer: the save's calendar, and where it was made.
  keyLines.forEach((line, li) => {
    const kyMid = H - footH - keyH + 10 + li * 44 + 22;
    ctx.textBaseline = 'middle';
    for (const { item, x } of line) {
      let tx = x;
      if (item.mark) {
        drawMark(ctx, item.mark, x + 18, kyMid, false, false);
        tx += 44;
      } else if (item.line) {
        polyline(ctx, [[x + 4, kyMid - 12], [x + 4, kyMid], [x + 28, kyMid], [x + 28, kyMid + 12]], { width: 3 });
        tx += 40;
      }
      ctx.font = font(20, 500);
      ctx.fillStyle = item.mark || item.line ? C.ink2 : C.plan;
      ctx.fillText(item.text, tx, kyMid);
    }
  });
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, H - footH + 20, W - PAD * 2, 2);
  ctx.textBaseline = 'middle';
  ctx.font = font(21, 500);
  ctx.fillStyle = C.ink3;
  const fy = H - footH / 2 + 10;
  if (model.calendar) ctx.fillText(model.calendar, PAD, fy);
  ctx.textAlign = 'right';
  ctx.fillText('Family Trees Whiteboard', W - PAD, fy);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'),
  );
}
