/**
 * Sim photos: pictures you add to a sim (a screenshot from the game), kept
 * in this browser's IndexedDB by card id, and in the board file you
 * download (photosForFile), so a board moved to another browser or device
 * brings them along. Never uploaded anywhere. Each is cut to a square and
 * made small (PHOTO_SIZE) before it is stored: about 10 KB a photo.
 */

import type { ShowToggles, SimNode } from '../types/whiteboard.ts';

/** Infants to teens: with Silhouettes on, a silhouette stands in for their photo until they're young adults. */
const YOUNGER_THAN_YA = new Set(['Infant', 'Toddler', 'Child', 'Teen']);

/**
 * What a card shows in its photo circle: the sim's photo, or with
 * Silhouettes on a silhouette for an infant to teen (they change as they
 * grow). Nothing with Photos off, for a pet, or for a sim with no photo.
 */
export function cardPhoto(
  n: Pick<SimNode, 'id' | 'age' | 'species'>,
  show: Pick<ShowToggles, 'photos' | 'silhouettes'>,
  urls: ReadonlyMap<string, string>,
): string | undefined {
  if (!show.photos || n.species) return undefined;
  if (show.silhouettes && YOUNGER_THAN_YA.has(n.age)) return 'silhouette';
  return urls.get(n.id);
}

const DB_NAME = 'sims4-board-photos';
const STORE = 'photos';
/** Pixels a side: sharp on a card's 44px circle and a poster's 96px one. */
export const PHOTO_SIZE = 192;

type PhotoRecord = { id: string; blob: Blob; at: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser keeps no photos'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Photos could not open'));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Photos could not be saved'));
        };
      }),
  );
}

/** Every photo this browser keeps, by card id. Empty when IndexedDB is unavailable (a private window). */
export async function loadPhotos(): Promise<Map<string, Blob>> {
  try {
    const all = await run('readonly', (s) => s.getAll() as IDBRequest<PhotoRecord[]>);
    return new Map(all.map((r) => [r.id, r.blob]));
  } catch {
    return new Map();
  }
}

export function savePhoto(id: string, blob: Blob): Promise<unknown> {
  return run('readwrite', (s) => s.put({ id, blob, at: new Date().toISOString() } satisfies PhotoRecord));
}

export function deletePhoto(id: string): Promise<unknown> {
  return run('readwrite', (s) => s.delete(id));
}

/**
 * Where to cut a square from a picture `w` × `h`: the middle of a wide one,
 * and near the top of a tall one, where a sim's face is in a game
 * screenshot or a Create a Sim portrait.
 */
export function squareCrop(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.min(w, h);
  const x = Math.round((w - side) / 2);
  const y = h > w ? Math.round(Math.min(h - side, (h - side) * 0.2)) : Math.round((h - side) / 2);
  return { x, y, side };
}

/** A picture file as a small square WebP (or PNG where WebP can't be written). */
export async function photoFromFile(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { x, y, side } = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, x, y, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (out && out.type === 'image/webp') return out;
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

/** A picture as text (a data URL): how a board file carries its photos. */
async function blobToDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/webp'};base64,${btoa(bin)}`;
}

/**
 * The photos of a board's cards, as text to keep in its file: card id → a
 * data URL of the small square picture. Only the cards the board has.
 */
export async function photosForFile(urls: ReadonlyMap<string, string>, cardIds: ReadonlySet<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [id, url] of urls) {
    if (!cardIds.has(id)) continue;
    try {
      out[id] = await blobToDataUrl(await (await fetch(url)).blob());
    } catch {
      // A photo that can't be read stays in the browser only.
    }
  }
  return out;
}

/** A board file's photos, back as pictures: only pictures, and only small ones (a photo is about 10 KB). */
export async function photosFromFile(photos: unknown): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  if (!photos || typeof photos !== 'object') return out;
  for (const [id, data] of Object.entries(photos as Record<string, unknown>)) {
    if (typeof data !== 'string' || !/^data:image\/(webp|png|jpeg);base64,/.test(data) || data.length > 400_000) continue;
    try {
      out.set(id, await (await fetch(data)).blob());
    } catch {
      // Not a picture: left out.
    }
  }
  return out;
}
