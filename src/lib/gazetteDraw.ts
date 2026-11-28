import { SITE_URL } from './credits.ts';
import type { Article, GazetteEdition } from './gazette.ts';

/** A newspaper's look on whitish blue-gray paper (no beige): ink, rules, a serif. */
const C = { paper: '#f3f5f8', ink: '#15202b', ink2: '#3b4757', ink3: '#697380', rule: '#15202b', soft: '#c9d1db' };
const SERIF = `Georgia, 'Times New Roman', Times, serif`;
const W = 1200;
const PAD = 60;
const GAP = 40;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
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

/** A sticker, tilted, with a white edge and a soft shadow: centred in a `slot`, at `size` (its own at most). */
function sticker(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, slot: number, tilt: number, own?: number) {
  const size = Math.min(slot, own ?? img.naturalWidth);
  ctx.save();
  ctx.translate(x + slot / 2, y + slot / 2);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.shadowColor = 'rgba(21,32,43,.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, size / 2 + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/**
 * An edition of the gazette as a PNG to share: masthead, the lead story, the
 * front page in two columns, then the inside columns, and a footer with the
 * site. The same words as the dialog; the stickers are the game's moodlets.
 */
export async function drawGazette(
  e: GazetteEdition,
  stickerOf: (kind: string) => string | undefined,
  /** The size to draw a sticker: never larger than its own (the moodlets are 40px). */
  sizeOf: (kind: string, want: number) => number = (_k, want) => want,
): Promise<Blob> {
  const kinds = [...new Set([e.lead, ...e.front].filter((a): a is Article => !!a).map((a) => a.kind))];
  const imgs = new Map(await Promise.all(kinds.map(async (k) => [k, await loadImage(stickerOf(k))] as const)));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');

  // Two passes: measure, then draw at the height measured.
  const pass = (draw: boolean): number => {
    let y = PAD;
    const text = (t: string, x: number, at: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
      if (!draw) return;
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(t, x, at);
      ctx.textAlign = 'left';
    };
    const rule = (at: number, h = 2) => {
      if (draw) {
        ctx.fillStyle = C.rule;
        ctx.fillRect(PAD, at, W - PAD * 2, h);
      }
    };
    ctx.textBaseline = 'top';
    // Masthead.
    text(`No. ${e.number}`, PAD, y, `600 20px ${SERIF}`, C.ink2);
    text(e.dateline, W / 2, y, `600 20px ${SERIF}`, C.ink2, 'center');
    text('§1', W - PAD, y, `600 20px ${SERIF}`, C.ink2, 'right');
    y += 34;
    rule(y, 4);
    y += 12;
    ctx.font = `700 76px ${SERIF}`;
    const title = wrap(ctx, e.title, W - PAD * 2);
    for (const l of title) {
      text(l, W / 2, y, `700 76px ${SERIF}`, C.ink, 'center');
      y += 84;
    }
    text('All the news fit to print, from your save', W / 2, y, `italic 400 22px ${SERIF}`, C.ink2, 'center');
    y += 36;
    rule(y, 2);
    rule(y + 6, 2);
    y += 32;

    // The lead.
    if (e.lead) {
      const img = imgs.get(e.lead.kind);
      const tx = img ? PAD + 150 : PAD;
      const tw = W - PAD - tx;
      ctx.font = `800 50px ${SERIF}`;
      const head = wrap(ctx, e.lead.headline.toUpperCase(), tw);
      ctx.font = `400 27px ${SERIF}`;
      const body = wrap(ctx, e.lead.body, tw);
      if (img && draw) sticker(ctx, img, PAD + 6, y + 6, 120, -6, sizeOf(e.lead.kind, 120));
      let ly = y;
      for (const l of head) {
        text(l, tx, ly, `800 50px ${SERIF}`, C.ink);
        ly += 56;
      }
      ly += 8;
      for (const l of body) {
        text(l, tx, ly, `400 27px ${SERIF}`, C.ink2);
        ly += 36;
      }
      y = Math.max(ly, y + 140) + 24;
      rule(y, 1);
      y += 24;
    }

    // The front page, two columns.
    if (e.front.length) {
      const cw = (W - PAD * 2 - GAP) / 2;
      const col = [y, y];
      e.front.forEach((a, i) => {
        const c = col[0]! <= col[1]! ? 0 : 1;
        const x = PAD + c * (cw + GAP);
        let cy = col[c]!;
        const img = imgs.get(a.kind);
        const tx = img ? x + 84 : x;
        const tw = cw - (tx - x);
        ctx.font = `800 28px ${SERIF}`;
        const head = wrap(ctx, a.headline, tw);
        ctx.font = `400 21px ${SERIF}`;
        const body = wrap(ctx, a.body, tw);
        if (img && draw) sticker(ctx, img, x + 4, cy + 4, 64, [4, -3, 7, -5][i % 4]!, sizeOf(a.kind, 64));
        const top = cy;
        for (const l of head) {
          text(l, tx, cy, `800 28px ${SERIF}`, C.ink);
          cy += 34;
        }
        cy += 4;
        for (const l of body) {
          text(l, tx, cy, `400 21px ${SERIF}`, C.ink2);
          cy += 28;
        }
        col[c] = Math.max(cy, top + 84) + 26;
      });
      y = Math.max(col[0]!, col[1]!);
      rule(y, 1);
      y += 24;
    }

    // The inside columns, flowing into two.
    if (e.columns.length) {
      const cw = (W - PAD * 2 - GAP) / 2;
      const col = [y, y];
      for (const section of e.columns) {
        const c = col[0]! <= col[1]! ? 0 : 1;
        const x = PAD + c * (cw + GAP);
        let cy = col[c]!;
        text(section.title.toUpperCase(), x, cy, `800 22px ${SERIF}`, C.ink);
        cy += 30;
        if (draw) {
          ctx.fillStyle = C.rule;
          ctx.fillRect(x, cy, cw, 2);
        }
        cy += 12;
        for (const a of section.articles.slice(0, 12)) {
          ctx.font = `700 20px ${SERIF}`;
          const head = wrap(ctx, a.headline, cw);
          ctx.font = `400 19px ${SERIF}`;
          const body = wrap(ctx, a.body, cw);
          for (const l of head) {
            text(l, x, cy, `700 20px ${SERIF}`, C.ink);
            cy += 25;
          }
          for (const l of body) {
            text(l, x, cy, `400 19px ${SERIF}`, C.ink2);
            cy += 25;
          }
          cy += 12;
        }
        if (section.articles.length > 12) {
          text(`And ${section.articles.length - 12} more in the board's story.`, x, cy, `italic 400 18px ${SERIF}`, C.ink3);
          cy += 28;
        }
        col[c] = cy + 20;
      }
      y = Math.max(col[0]!, col[1]!);
    }

    // The footer.
    rule(y, 2);
    y += 18;
    text('Printed from a Family Trees board', PAD, y, `italic 400 19px ${SERIF}`, C.ink3);
    text(SITE_URL.replace(/^https?:\/\//, ''), W - PAD, y, `600 19px ${SERIF}`, C.ink2, 'right');
    return y + 28 + PAD / 2;
  };

  canvas.width = W;
  canvas.height = Math.ceil(pass(false));
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  pass(true);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}
