/**
 * The games' own icons (the round pack icons the game shows in the
 * Gallery, from The Sims Wiki; the game fetches them, it doesn't ship
 * them), under public/places/packs, and the game each world comes from.
 * The board must work with and without any pack: a pack or world not
 * listed simply has no icon.
 */

/** Each game's icon file. */
const PACK_ICON: Record<string, string> = {
  'Base Game': 'base-game.webp',
  'Adventure Awaits': 'adventure-awaits.webp',
  'Businesses & Hobbies': 'businesses-and-hobbies.webp',
  'Cats & Dogs': 'cats-and-dogs.webp',
  'City Living': 'city-living.webp',
  'Cottage Living': 'cottage-living.webp',
  'Discover University': 'discover-university.webp',
  'Eco Lifestyle': 'eco-lifestyle.webp',
  'Enchanted by Nature': 'enchanted-by-nature.webp',
  'For Rent': 'for-rent.webp',
  'Get Famous': 'get-famous.webp',
  'Get Together': 'get-together.webp',
  'Get to Work': 'get-to-work.webp',
  'Growing Together': 'growing-together.webp',
  'High School Years': 'high-school-years.webp',
  'Horse Ranch': 'horse-ranch.webp',
  'Island Living': 'island-living.webp',
  'Journey to Batuu': 'journey-to-batuu.webp',
  'Life & Death': 'life-and-death.webp',
  Lovestruck: 'lovestruck.webp',
  'My Wedding Stories': 'my-wedding-stories.webp',
  'Paranormal Stuff': 'paranormal-stuff.webp',
  'Realm of Magic': 'realm-of-magic.webp',
  'Royalty & Legacy': 'royalty-and-legacy.webp',
  Seasons: 'seasons.webp',
  'Snowy Escape': 'snowy-escape.webp',
  StrangerVille: 'strangerville.webp',
  Vampires: 'vampires.webp',
  Werewolves: 'werewolves.webp',
};

/** The game each world comes from. Not in any world comes from none. */
const WORLD_PACK: Record<string, string> = {
  'Willow Creek': 'Base Game',
  'Oasis Springs': 'Base Game',
  Newcrest: 'Base Game',
  'Magnolia Promenade': 'Get to Work',
  Windenburg: 'Get Together',
  'San Myshuno': 'City Living',
  'Forgotten Hollow': 'Vampires',
  'Brindleton Bay': 'Cats & Dogs',
  'Del Sol Valley': 'Get Famous',
  StrangerVille: 'StrangerVille',
  Sulani: 'Island Living',
  Glimmerbrook: 'Realm of Magic',
  Britechester: 'Discover University',
  'Evergreen Harbor': 'Eco Lifestyle',
  'Mt. Komorebi': 'Snowy Escape',
  'Henford-on-Bagley': 'Cottage Living',
  Tartosa: 'My Wedding Stories',
  'Moonwood Mill': 'Werewolves',
  Copperdale: 'High School Years',
  'San Sequoia': 'Growing Together',
  'Chestnut Ridge': 'Horse Ranch',
  Tomarang: 'For Rent',
  'Ciudad Enamorada': 'Lovestruck',
  Ravenwood: 'Life & Death',
  Nordhaven: 'Businesses & Hobbies',
  'Gibbi Point': 'Adventure Awaits',
  Ondarion: 'Royalty & Legacy',
  Innisgreen: 'Enchanted by Nature',
  Batuu: 'Journey to Batuu',
};

function packFileUrl(file: string | undefined): string | undefined {
  if (!file) return undefined;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}places/packs/${file}`;
}

/** A game's icon, or undefined for one the board has none for. */
export function packIconUrl(pack: string): string | undefined {
  return packFileUrl(PACK_ICON[pack]);
}

/** The game a world comes from, or undefined (Not in any world, a world the board doesn't know). */
export function worldPack(world: string): string | undefined {
  return WORLD_PACK[world];
}

/** The icon of the game a world comes from. */
export function worldPackIconUrl(world: string): string | undefined {
  const pack = worldPack(world);
  return pack ? packIconUrl(pack) : undefined;
}
