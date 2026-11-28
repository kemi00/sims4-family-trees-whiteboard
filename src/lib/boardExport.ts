/**
 * The whole tree as one picture: the board's SVG as it is drawn now (every
 * card mounted and named, which the stage does while `exporting`), its
 * styles written onto each element, its pictures made part of it, then drawn
 * onto a canvas with a footer that names the board and links to the site.
 * The PDF is that picture on one page, its footer link clickable.
 */

/** What the board draws that is for using it, not for reading it: buttons on cards and tags, the grid. */
const NOT_IN_PICTURE = ['.hh-add', '.hh-ageup', '.node__more', '.node__baby', '.node__partner', '.node__celebrate', '.stage-tilegrid'];

/** The styles a picture of the board needs, copied from the page onto each element. */
const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'text-decoration',
  'visibility',
  'display',
] as const;

/** Room around the board, in board units. */
const MARGIN = 80;
/** The footer's height, in canvas pixels. */
const FOOT = 96;
/** A canvas stays within what every browser draws: a side and an area. */
const MAX_SIDE = 16000;
const MAX_AREA = 120_000_000;

export type BoardPicture = {
  canvas: HTMLCanvasElement;
  /** Where the footer's link is, in canvas pixels, for the PDF's link. */
  link: { x: number; y: number; w: number; h: number; url: string };
};

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read a picture'));
    r.readAsDataURL(b);
  });
}

/** The scale that fits a board `w` × `h` (plus the footer) in a canvas: at most 2, sharper on a small board. */
export function exportScale(w: number, h: number): number {
  return Math.min(2, MAX_SIDE / w, (MAX_SIDE - FOOT) / h, Math.sqrt(MAX_AREA / (w * h)));
}

/** Copies the page's styles onto the clone, element by element (both walked in the same order). */
function inlineStyles(from: Element, to: Element): void {
  const a = [from, ...from.querySelectorAll('*')];
  const b = [to, ...to.querySelectorAll('*')];
  for (let i = 0; i < a.length && i < b.length; i++) {
    const cs = getComputedStyle(a[i]!);
    const el = b[i] as SVGElement;
    let style = '';
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) style += `${p}:${v};`;
    }
    el.setAttribute('style', style);
  }
}

/** A rectangle in the board's own units. */
export type BoardRect = { x: number; y: number; w: number; h: number };

/** The board ready to draw: its SVG with styles and pictures written in, and where its content is. */
export type PreparedBoard = { svg: SVGSVGElement; box: BoardRect };

/**
 * The board, ready to draw any part of: `scene` is its content group (its pan
 * and zoom are dropped), `svg` gives its definitions (patterns, clips).
 */
export async function prepareBoard(svg: SVGSVGElement, scene: SVGGElement): Promise<PreparedBoard> {
  const b = scene.getBBox();
  const box = { x: b.x - MARGIN, y: b.y - MARGIN, w: b.width + MARGIN * 2, h: b.height + MARGIN * 2 };

  const clone = scene.cloneNode(true) as SVGGElement;
  // Styles first, while the clone still matches the page element for element.
  inlineStyles(scene, clone);
  clone.querySelectorAll(NOT_IN_PICTURE.join(',')).forEach((el) => el.remove());
  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    el.removeAttribute('class');
    el.removeAttribute('data-tip');
  }
  clone.removeAttribute('transform');

  const out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  out.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  out.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const defs = svg.querySelector('defs');
  if (defs) out.appendChild(defs.cloneNode(true));
  out.appendChild(clone);

  // Its pictures (world and neighbourhood icons, photos) made part of it: a picture drawn from an SVG loads nothing.
  const cache = new Map<string, Promise<string>>();
  await Promise.all(
    [...out.querySelectorAll('image')].map(async (img) => {
      const href = img.getAttribute('href') ?? img.getAttribute('xlink:href');
      if (!href || href.startsWith('data:')) return;
      let p = cache.get(href);
      if (!p) {
        p = fetch(href)
          .then((r) => r.blob())
          .then(blobToDataUrl)
          .catch(() => '');
        cache.set(href, p);
      }
      const data = await p;
      if (data) img.setAttribute('href', data);
      else img.remove();
    }),
  );
  return { svg: out, box };
}

/** The board's SVG showing `view`, `px` × `py` pixels, as text. */
function svgText(board: PreparedBoard, view: BoardRect, px: number, py: number): string {
  const { svg } = board;
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(py));
  return new XMLSerializer().serializeToString(svg);
}

/** The whole board as an SVG file: drawn by any browser, sharp at any zoom. */
export function boardSvgFile(board: PreparedBoard): Blob {
  return new Blob([svgText(board, board.box, Math.round(board.box.w), Math.round(board.box.h))], { type: 'image/svg+xml' });
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

/**
 * Part of the board (`view`, all of it by default) as a picture, `scale`
 * pixels a board unit (what fits a canvas by default), with a footer: what
 * it is on the left, the site on the right (a link in the PDF).
 */
export async function drawBoardPicture(
  board: PreparedBoard,
  foot: { left: string; right: string; url: string },
  view: BoardRect = board.box,
  scale = exportScale(view.w, view.h),
): Promise<BoardPicture> {
  const pw = Math.max(1, Math.round(view.w * scale));
  const ph = Math.max(1, Math.round(view.h * scale));
  const url = URL.createObjectURL(new Blob([svgText(board, view, pw, ph)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The board couldn’t be drawn'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(pw, 900);
    canvas.height = ph + FOOT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.fillStyle = '#f6f8fb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, 0, 0, pw, ph);
    const fy = ph;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, fy, canvas.width, FOOT);
    ctx.fillStyle = '#d5dbe3';
    ctx.fillRect(0, fy, canvas.width, 2);
    ctx.textBaseline = 'middle';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#1b2b3a';
    ctx.fillText(foot.left, 40, fy + FOOT / 2);
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = '#1b6cd6';
    ctx.textAlign = 'right';
    const lw = ctx.measureText(foot.right).width;
    ctx.fillText(foot.right, canvas.width - 40, fy + FOOT / 2);
    ctx.textAlign = 'left';
    return { canvas, link: { x: canvas.width - 40 - lw, y: fy + FOOT / 2 - 20, w: lw, h: 40, url: foot.url } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A page's scale: board type at its own size or a little larger, within a canvas. */
export function pageScale(w: number, h: number): number {
  return Math.min(1.25, 12000 / w, 12000 / h, Math.sqrt(100_000_000 / (w * h)));
}

const enc = new TextEncoder();

/** One page of a PDF: a JPEG `w` × `h` pixels and the link on it. */
export type PdfPage = { jpeg: Uint8Array; w: number; h: number; link?: BoardPicture['link'] };

/**
 * A PDF of pictures, one a page, each with its link (in the picture's
 * pixels). A page is its picture at 72 dpi from 96, shrunk to the 200-inch
 * side a PDF reader allows.
 */
export function pdfOfPages(pages: readonly PdfPage[]): Blob {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let at = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(b);
    at += b.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = at;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  // Objects: 1 catalog, 2 pages, then four a page (page, image, contents, link).
  const first = 3;
  const ids = pages.map((_, i) => first + i * 4);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${ids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((pg, i) => {
    const id = ids[i]!;
    const k = Math.min(0.75, 14400 / Math.max(pg.w, pg.h));
    const pw = +(pg.w * k).toFixed(2);
    const ph = +(pg.h * k).toFixed(2);
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R${pg.link ? ` /Annots [${id + 3} 0 R]` : ''} >>`);
    obj(id + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
      push(pg.jpeg);
      push('\nendstream');
    });
    const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(id + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    const l = pg.link;
    obj(
      id + 3,
      l
        ? `<< /Type /Annot /Subtype /Link /Rect [${+(l.x * k).toFixed(2)} ${+(ph - (l.y + l.h) * k).toFixed(2)} ${+((l.x + l.w) * k).toFixed(2)} ${+(ph - l.y * k).toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.url)}) >> >>`
        : '<< >>',
    );
  });
  const count = first + pages.length * 4;
  const xref = at;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** A one-page PDF of one picture. */
export function pdfOfJpeg(jpeg: Uint8Array, w: number, h: number, link?: BoardPicture['link']): Blob {
  return pdfOfPages([{ jpeg, w, h, ...(link ? { link } : {}) }]);
}

/**
 * Each world's part of the board, for a page of its own: around its cards,
 * with room above for the household and world tags. In `order`, then any
 * other world; cards with no place yet (w 0) are left out.
 */
export function worldRects(
  nodes: readonly { world: string; x: number; y: number; w: number; h: number }[],
  order: readonly string[] = [],
): { world: string; rect: BoardRect }[] {
  const by = new Map<string, { l: number; t: number; r: number; b: number }>();
  for (const n of nodes) {
    if (!n.w || !n.h) continue;
    const e = by.get(n.world) ?? { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    e.l = Math.min(e.l, n.x);
    e.t = Math.min(e.t, n.y);
    e.r = Math.max(e.r, n.x + n.w);
    e.b = Math.max(e.b, n.y + n.h);
    by.set(n.world, e);
  }
  const rank = new Map(order.map((w, i) => [w, i]));
  return [...by]
    .sort(([a], [b]) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b))
    .map(([world, e]) => ({ world, rect: { x: e.l - 140, y: e.t - 220, w: e.r - e.l + 280, h: e.b - e.t + 340 } }));
}
