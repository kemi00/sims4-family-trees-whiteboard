import stickerData from '../data/gazetteStickers.json' with { type: 'json' };

/** Each kind of story's moodlet name ("Just Married!"), from scripts/build-gazette-stickers.ts. */
export const STICKERS: Record<string, string> = stickerData.kinds;

/** A story's sticker: the game's moodlet for its kind (public/gazette-stickers/<kind>.webp). */
export function stickerUrl(kind: string): string | undefined {
  if (!STICKERS[kind]) return undefined;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}gazette-stickers/${kind}.webp`;
}
