import { CARD_H, CARD_MIN_W, TILE } from './constants.ts';
import type { Guides, Viewport } from '../types/whiteboard.ts';

export type LiveCamera = {
  read: () => Viewport;
  apply: (vp: Viewport) => void;
  commit: () => void;
  beginNav: () => void;
};

export function applySceneTransform(
  scene: SVGGElement | null,
  vp: Viewport,
): void {
  if (!scene) return;
  scene.style.transform = `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.k})`;
  scene.style.transformOrigin = '0 0';
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
  els: Map<string, SVGGElement>,
  origins: Record<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): void {
  for (const [id, el] of els) {
    const o = origins[id];
    if (!o) continue;
    el.setAttribute('transform', `translate(${o.x + dx},${o.y + dy})`);
  }
}

export function restoreNodeTranslates(
  els: Map<string, SVGGElement>,
  origins: Record<string, { x: number; y: number }>,
): void {
  applyNodeTranslates(els, origins, 0, 0);
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
