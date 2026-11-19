import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SaveLotZone } from '../types/whiteboard.ts';
import { freeLotsIn, householdLots, lotKindLabel, lotPick, lotsIn, saveLotCatalog, vacantLotsIn } from './places.ts';
import { moveDestination } from './householdMove.ts';

describe('saved residential venues and vacancies', () => {
  const zones: SaveLotZone[] = [
    { world: 'Sulani', hash: 225771521, zone: '1', venue: 229251, name: 'Lagoon Look', beds: 2, baths: 1 },
    { world: 'Sulani', hash: 3988783106, zone: '2', venue: 229251, name: 'Sapphire Shores', beds: 3, baths: 3 },
    { world: 'Sulani', hash: 2227044354, zone: '3', venue: 28614, name: 'Pier Perfection', beds: 1, baths: 1 },
    { world: 'Sulani', hash: 1467547650, zone: '4', venue: 229251, name: 'Reef Finery', occupied: true },
    { world: 'Sulani', hash: 1225392129, zone: '5', venue: 229251, name: 'Converted Sand Bar', beds: 1, baths: 1 },
    { world: 'Sulani', hash: 1241251844, zone: '6', venue: 16869, name: 'Tangled Flat' },
    { world: 'Windenburg', hash: 3130523649, zone: '7', venue: 229251, name: 'Mid-Nowhere', beds: 2, baths: 1 },
  ];
  const catalog = saveLotCatalog(zones);
  const nodes = [
    { gid: 'Sulani||Talla', world: 'Sulani', hh: 'Talla', lot: 'Lagoon Look' },
    { gid: 'Sulani||Illes', world: 'Sulani', hh: 'Illes', lot: 'Pier Perfection' },
  ];
  const homes = householdLots(nodes, catalog);
  const households = new Map(nodes.map((n) => [n.gid, n.hh]));

  it('recognises tiny homes across worlds and uses the saved rooms on formerly empty lots', () => {
    const sapphire = lotsIn('Sulani', catalog).find((l) => l.zone === '2')!;
    assert.deepEqual([sapphire.venue, sapphire.kind, sapphire.beds, sapphire.baths], ['tiny', 'house', 3, 3]);
    assert.equal(lotKindLabel(sapphire), 'Tiny home');
    assert.ok(freeLotsIn('Sulani', homes, catalog).some((l) => l.zone === '2'));
    assert.ok(freeLotsIn('Windenburg', homes, catalog).some((l) => l.zone === '7'));
    assert.equal(homes.get('Sulani||Talla')?.venue, 'tiny');
  });

  it('includes community lots converted to tiny homes and excludes homes converted to bars', () => {
    const free = freeLotsIn('Sulani', homes, catalog);
    assert.ok(free.some((l) => l.name === 'Converted Sand Bar'));
    assert.ok(!lotsIn('Sulani', catalog).some((l) => l.zone === '6'));
    assert.ok(!free.some((l) => l.zone === '4'));
  });

  it('shows saved vacancies with their planned households while keeping them out of move pickers', () => {
    const vacancies = vacantLotsIn('Sulani', homes, households, catalog);
    assert.deepEqual(vacancies.filter((l) => l.reservedFor).map((l) => [l.name, l.reservedFor?.hh]).sort(), [
      ['Lagoon Look', 'Talla'], ['Pier Perfection', 'Illes'],
    ]);
    assert.ok(!vacancies.some((l) => l.zone === '4'));
    assert.ok(!freeLotsIn('Sulani', homes, catalog).some((l) => l.zone === '1' || l.zone === '3'));
    const reserved = vacancies.find((l) => l.zone === '3')!;
    assert.equal(moveDestination([], [], [], 'Sulani', lotPick(reserved), 'Other', catalog)?.lot, 'Pier Perfection');
    // The real board's existing reservation prevents assigning a second household.
    const boardNodes = nodes as Parameters<typeof moveDestination>[1];
    assert.equal(moveDestination([], boardNodes, [], 'Sulani', lotPick(reserved), 'Other', catalog), null);
    assert.ok(!catalog.get('Sulani')?.some((l) => l.reservedFor), 'display labels must not mutate the catalog');
  });

  it('keeps unsaved board reservations out of the box when no save can establish vacancy', () => {
    const originalHomes = householdLots(nodes);
    assert.ok(!vacantLotsIn('Sulani', originalHomes, households).some((l) => l.name === 'Pier Perfection'));
  });
});
