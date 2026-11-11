/**
 * The Magic Realm (Realm of Magic) is a hidden neighbourhood of Glimmerbrook,
 * reached through the portal there or a Glimmerstone: not a world of its own.
 * The game's save lists it as a region, and boards before 2026-11-11 had it
 * as a world; both now read as Glimmerbrook, neighbourhood The Magic Realm.
 */
export const MAGIC_REALM = 'The Magic Realm';
/** The world the Magic Realm belongs to. */
export const MAGIC_REALM_WORLD = 'Glimmerbrook';

/** The world a save's region, or an older board's world, belongs to: Glimmerbrook for the Magic Realm. */
export function homeWorld(world: string): string {
  return world === MAGIC_REALM ? MAGIC_REALM_WORLD : world;
}

/** A household id from when the Magic Realm was a world, as it is in Glimmerbrook. */
export function realmGid(gid: string): string {
  const old = `${MAGIC_REALM}||`;
  return gid.startsWith(old) ? `${MAGIC_REALM_WORLD}||${gid.slice(old.length)}` : gid;
}
