import { neighbourhoodIconUrl, worldIconUrl } from './places.ts';
import type { PosterCard, PosterModel } from './poster.ts';

/**
 * Draws a poster (PosterModel) as a PNG, in the board's look: whitish
 * blue-gray paper, the household's colour along the band's foot and down
 * each card's edge, planned sims dashed violet, the deceased faded. 1080 wide, as tall
 * as its rows need; names wrap and never cut short.
 */

const W = 1080;
const PAD = 64;
const COLS = 3;
const GAP = 24;
const CARD_W = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const CARD_H = 150;
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

/** Lines for a card: its name at the size that fits, then stage and role. */
function cardText(ctx: CanvasRenderingContext2D, c: PosterCard) {
  const name = fit(ctx, c.name, CARD_W - 44, 2, 30, 20, 700);
  ctx.font = font(21, 400);
  const role = c.role ? wrap(ctx, c.role, CARD_W - 44) : [];
  return { name, role };
}

function drawCard(ctx: CanvasRenderingContext2D, c: PosterCard, x: number, y: number, h: number) {
  ctx.save();
  roundRect(ctx, x, y, CARD_W, h, 16);
  ctx.fillStyle = c.planned ? C.planSoft : c.deceased ? C.recess : C.card;
  ctx.fill();
  ctx.lineWidth = c.planned ? 3 : 2;
  ctx.strokeStyle = c.planned ? C.plan : C.line;
  if (c.planned) ctx.setLineDash([10, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
  // The household's colour down the left edge, as on the board.
  ctx.save();
  roundRect(ctx, x, y, CARD_W, h, 16);
  ctx.clip();
  ctx.fillStyle = c.planned ? C.plan : c.color;
  ctx.globalAlpha = c.deceased ? 0.45 : 1;
  ctx.fillRect(x, y, 10, h);
  ctx.restore();

  const { name, role } = cardText(ctx, c);
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
function cardHeight(ctx: CanvasRenderingContext2D, c: PosterCard): number {
  const { name, role } = cardText(ctx, c);
  return Math.max(CARD_H, 24 + name.lines.length * name.size * 1.2 + 4 + 28 + role.length * 26 + 20);
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
  const rowLayout = model.rows.map((r) => {
    const heights: number[] = [];
    for (let i = 0; i < r.cards.length; i += COLS) {
      heights.push(Math.max(...r.cards.slice(i, i + COLS).map((c) => cardHeight(ctx, c))));
    }
    return { row: r, heights, h: (r.label ? 48 : 0) + heights.reduce((s, h) => s + h + GAP, 0) };
  });
  const bodyH = rowLayout.reduce((s, r) => s + r.h + 16, 0);
  const footH = 110;
  const H = Math.ceil(headH + lineH + 40 + bodyH + footH);
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
  let y = PAD;
  ctx.fillStyle = C.ink;
  ctx.font = font(title.size, 800);
  for (const l of title.lines) {
    ctx.fillText(l, PAD, y);
    y += title.size * 1.15;
  }
  y += 14;
  ctx.font = font(26, 400);
  ctx.fillStyle = C.ink2;
  for (const l of sub) {
    ctx.fillText(l, PAD, y);
    y += 34;
  }
  // The world's picture and the neighbourhood's icon, top right.
  let bx = W - PAD - 48;
  if (model.nb) {
    badge(ctx, nbImg, bx, PAD + 48, 48);
    bx -= 112;
  }
  if (model.world) badge(ctx, worldImg, bx, PAD + 48, 48);

  y = headH + 40;
  // A dynasty's line of succession.
  if (lineRows.length) {
    roundRect(ctx, PAD, y, W - PAD * 2, lineH - 28, 18);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = font(19, 700);
    ctx.fillStyle = C.ink3;
    ctx.fillText('LINE OF SUCCESSION', PAD + 24, y + 22);
    ctx.font = font(26, 600);
    ctx.fillStyle = C.ink;
    let ly = y + 22 + 32;
    for (const l of lineRows) {
      ctx.fillText(l, PAD + 24, ly);
      ly += 38;
    }
    y += lineH;
  }

  // The sims, row by row.
  for (const { row, heights } of rowLayout) {
    if (row.label) {
      ctx.font = font(20, 700);
      ctx.fillStyle = C.ink3;
      ctx.fillText(row.label.toUpperCase(), PAD, y + 10);
      y += 48;
    }
    heights.forEach((h, line) => {
      row.cards.slice(line * COLS, line * COLS + COLS).forEach((c, i) => drawCard(ctx, c, PAD + i * (CARD_W + GAP), y, h));
      y += h + GAP;
    });
    y += 16;
  }

  // Footer: the save's calendar, and where it was made.
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
