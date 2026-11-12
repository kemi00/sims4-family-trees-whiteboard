import type { SimNode } from '../types/whiteboard.ts';

/**
 * Pets as the game has them: cats and dogs come with Cats & Dogs, horses
 * with Horse Ranch. A pet's family is pets of its own kind: parents, a
 * litter, siblings. Pets don't marry or date, and no sim is their parent.
 */
export const PET_KINDS = [
  { species: 'Cat', pack: 'Cats & Dogs', young: 'Kitten' },
  { species: 'Dog', pack: 'Cats & Dogs', young: 'Puppy' },
  { species: 'Horse', pack: 'Horse Ranch', young: 'Foal' },
] as const;

export type PetKind = (typeof PET_KINDS)[number];

/** A pet's life stages as the board stores them; the young one reads as Kitten, Puppy or Foal. */
export const PET_AGES = ['Child', 'Adult', 'Elder'] as const;

/** The genders the game gives pets. */
export const PET_GENDERS = ['Female', 'Male'] as const;

export function petKind(species: string | undefined): PetKind | undefined {
  return PET_KINDS.find((k) => k.species === species);
}

/** The pack a species comes with: "Cats & Dogs", "Horse Ranch". */
export function petPack(species: string): string {
  return petKind(species)?.pack ?? '';
}

/** "Kitten", "Adult", "Elder": a pet's life stage in the game's words. */
export function petAgeLabel(species: string | undefined, age: string): string {
  if (age === 'Child') return petKind(species)?.young ?? 'Young';
  return age;
}

/** "kitten", "puppy", "foal": a pet's young, for sentences. */
export function youngWord(species: string | undefined): string {
  return (petKind(species)?.young ?? 'baby').toLowerCase();
}

/**
 * The pets you can add: those whose pack isn't switched off in Games (a
 * save switches off the packs it shows you don't have).
 */
export function petKindsAvailable(hiddenPacks: ReadonlySet<string>): PetKind[] {
  return PET_KINDS.filter((k) => !hiddenPacks.has(k.pack));
}

/**
 * Why two cards can't be family, when one is a pet: a pet and a sim, or
 * pets of two kinds. Null when they can (two of a kind, or two sims).
 */
export function petLinkWhy(a: Pick<SimNode, 'species'>, b: Pick<SimNode, 'species'>): string | null {
  if (!a.species && !b.species) return null;
  if (!a.species || !b.species) return 'Pets are family only to pets of their kind';
  if (a.species !== b.species) return `A ${a.species.toLowerCase()} and a ${b.species.toLowerCase()} aren’t family`;
  return null;
}

/** What a new pet's card starts with: an adult of its kind, named New, from its pack. */
export function newPetFields(species: string): Pick<SimNode, 'first' | 'sur' | 'age' | 'state' | 'gender' | 'species' | 'pack'> {
  return {
    first: 'New',
    sur: '',
    age: 'Adult',
    state: 'Pet',
    gender: PET_GENDERS[Math.floor(Math.random() * PET_GENDERS.length)]!,
    species,
    pack: petPack(species),
  };
}

/** "a cat", "a dog", "a horse"; "a sim" without a species. */
export function aKind(species: string | undefined): string {
  return species ? `a ${species.toLowerCase()}` : 'a sim';
}
