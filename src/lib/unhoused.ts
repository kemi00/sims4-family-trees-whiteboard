import { UNHOUSED_HH } from './constants.ts';

/** The household id of `world`'s Unhoused sims box. */
export function unhousedGid(world: string): string {
  return `${world}||${UNHOUSED_HH}`;
}

export function isUnhousedGid(gid: string): boolean {
  return gid.endsWith(`||${UNHOUSED_HH}`);
}
