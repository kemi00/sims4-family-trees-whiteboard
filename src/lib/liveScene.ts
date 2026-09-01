import { CARD_H, CARD_MIN_W, TILE } from './constants.ts';
import type { Guides, Viewport } from '../types/whiteboard.ts';

export type LiveCamera = {
  read: () => Viewport;
  apply: (vp: Viewport) => void;
  commit: () => void;
  beginNav: () => void;
};

export function sceneTransformAttr(vp: Viewport): string {
  return `translate(${vp.tx},${vp.ty}) scale(${vp.k})`;
}

export function applySceneTransform(
  scene: SVGGElement | null,
  vp: Viewport,
): void {
  if (!scene) return;
  // SVG attribute, not CSS: WebKit often skips CSS transforms on <g>, which
  // blanks the board (Safari / some Chromium embeds).
  scene.style.removeProperty('transform');
  scene.style.removeProperty('transform-origin');
  scene.style.removeProperty('will-change');
  scene.setAttribute('transform', sceneTransformAttr(vp));
  scene.setAttribute('data-vp', JSON.stringify(vp));
}

export function queryNodeGroup(
  scene: Element,
  id: string,
): SVGGElement | null {
  const el = scene.querySelector(`g.node[data-id="${CSS.escape(id)}"]`);
  return el instanceof SVGGElement ? el : null;
}

export function collectNodeGroups(
  scene: Element | null,
  ids: Iterable<string>,
): Map<string, SVGGElement> {
  const out = new Map<string, SVGGElement>();
  if (!scene) return out;
  for (const id of ids) {
    const el = queryNodeGroup(scene, id);
    if (el) out.set(id, el);
  }
  return out;
}

export function applyNodeTranslates(
  scene: Element | null,
  origins: Record<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): void {
  if (!scene) return;
  for (const [id, o] of Object.entries(origins)) {
    const el = queryNodeGroup(scene, id);
    if (el) el.setAttribute('transform', `translate(${o.x + dx},${o.y + dy})`);
  }
}

export function restoreNodeTranslates(
  scene: Element | null,
  origins: Record<string, { x: number; y: number }>,
): void {
  applyNodeTranslates(scene, origins, 0, 0);
}

export function applyChromeTranslates(
  scene: Element | null,
  gids: Iterable<string>,
  worlds: Iterable<string>,
  dx: number,
  dy: number,
): void {
  if (!scene) return;
  const t = `translate(${dx},${dy})`;
  for (const gid of gids) {
    scene
      .querySelectorAll(`[data-gid="${CSS.escape(gid)}"]`)
      .forEach((el) => el.setAttribute('transform', t));
  }
  for (const world of worlds) {
    scene
      .querySelectorAll(`[data-world="${CSS.escape(world)}"]`)
      .forEach((el) => el.setAttribute('transform', t));
  }
}

export function restoreChromeTranslates(
  scene: Element | null,
  gids: Iterable<string>,
  worlds: Iterable<string>,
): void {
  applyChromeTranslates(scene, gids, worlds, 0, 0);
}

/** True when every endpoint is in the live-drag set (intra-unit ink). */
export function edgeEndsMoveTogether(
  ends: readonly string[],
  moving: ReadonlySet<string>,
): boolean {
  return ends.length > 0 && ends.every((id) => moving.has(id));
}

export function parseEdgeEndsAttr(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function applyEdgeTranslates(
  scene: Element | null,
  movingIds: Iterable<string>,
  dx: number,
  dy: number,
): void {
  if (!scene) return;
  const moving = movingIds instanceof Set ? movingIds : new Set(movingIds);
  const t = `translate(${dx},${dy})`;
  scene.querySelectorAll('#lEdges [data-ends]').forEach((el) => {
    const ends = parseEdgeEndsAttr(el.getAttribute('data-ends'));
    if (edgeEndsMoveTogether(ends, moving)) {
      el.setAttribute('transform', t);
    } else {
      el.setAttribute('transform', 'translate(0,0)');
    }
  });
}

export function restoreEdgeTranslates(scene: Element | null): void {
  scene?.querySelectorAll('#lEdges [data-ends]').forEach((el) => {
    el.setAttribute('transform', 'translate(0,0)');
  });
}

export type DragChrome = {
  guides: Guides | null;
  placement: { x: number; y: number; w: number; h: number } | null;
  snap: boolean;
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Draw snap guides / placement ghost without a React re-render of the board. */
export function paintDragChrome(host: SVGGElement | null, chrome: DragChrome): void {
  if (!host) return;
  host.replaceChildren();
  if (!chrome.snap) return;
  const { guides, placement } = chrome;
  if (guides) {
    for (const x of guides.gx) {
      host.appendChild(
        svgEl('line', {
          x1: String(x),
          y1: '-1000000',
          x2: String(x),
          y2: '1000000',
          stroke: '#1b6cd6',
          'stroke-width': '1',
          'stroke-dasharray': '4 4',
          opacity: '0.5',
        }),
      );
    }
    for (const y of guides.gy) {
      host.appendChild(
        svgEl('line', {
          x1: '-1000000',
          y1: String(y),
          x2: '1000000',
          y2: String(y),
          stroke: '#1b6cd6',
          'stroke-width': '1',
          'stroke-dasharray': '4 4',
          opacity: '0.5',
        }),
      );
    }
  }
  if (placement) {
    const g = svgEl('g', { 'pointer-events': 'none' });
    g.appendChild(
      svgEl('rect', {
        x: String(placement.x),
        y: String(placement.y),
        width: String(TILE),
        height: String(TILE),
        fill: '#1b6cd61a',
        stroke: 'none',
      }),
    );
    g.appendChild(
      svgEl('rect', {
        x: String(placement.x + TILE),
        y: String(placement.y),
        width: String(TILE),
        height: String(TILE),
        fill: '#1b6cd61a',
        stroke: 'none',
      }),
    );
    g.appendChild(
      svgEl('rect', {
        x: String(placement.x),
        y: String(placement.y),
        width: String(placement.w || CARD_MIN_W),
        height: String(placement.h || CARD_H),
        rx: '11',
        fill: 'none',
        stroke: '#1b6cd6',
        'stroke-width': '2.4',
        'stroke-dasharray': '7 5',
      }),
    );
    host.appendChild(g);
  }
}

export function clearDragChrome(host: SVGGElement | null): void {
  host?.replaceChildren();
}
