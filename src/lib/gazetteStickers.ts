import stickerData from '../data/gazetteStickers.json' with { type: 'json' };

/** Each kind of story's moodlet name ("Just Married!"), from scripts/build-gazette-stickers.ts. */
export const STICKERS: Record<string, string> = stickerData.kinds;

/** Each sticker's own size in pixels: it is never drawn larger (the moodlets are 40). */
const SIZES: Record<string, number> = (stickerData as { sizes?: Record<string, number> }).sizes ?? {};

/** The size to draw a sticker at: `want`, or its own size when that is smaller. */
export function stickerSize(kind: string, want: number): number {
  return Math.min(want, SIZES[kind] ?? want);
}

/** A story's sticker: the game's moodlet for its kind (public/gazette-stickers/<kind>.webp). */
export function stickerUrl(kind: string): string | undefined {
  if (!STICKERS[kind]) return undefined;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}gazette-stickers/${kind}.webp`;
}
