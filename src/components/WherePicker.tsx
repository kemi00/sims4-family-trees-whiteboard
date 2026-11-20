import { useEffect, useRef, useState } from 'react';
import { House, MapPin, GlobeHemisphereWest, Question } from '../icons.ts';
import { NOT_IN_WORLD } from '../lib/constants.ts';
import { lotKindLabel, lotRoomsLabel, lotSizeLabel } from '../lib/places.ts';
import { placesIn, searchPlaces, sizeOfLimit, type HomeChoice, type HomePlace } from '../lib/whereTheyLive.ts';

type Props = {
  /** Every household, free lot and world (homePlaces). */
  places: readonly HomePlace[];
  /** The world in view, whose places come first; null when none is. */
  inView: string | null;
  /** The household limit: a home they'd take past it says so, and still takes them. */
  limit: number | null;
  /** How many are moving: one, or a Needs a home box's sims. */
  adding: number;
  /** Offer Not decided yet: not to sims already waiting in Not in any world. */
  undecided?: boolean;
  onPick: (to: HomeChoice) => void;
};

/** A place, as the picker lists it: the icon, its name, where it is, and how full. */
function Row({ place, limit, adding, onPick }: { place: HomePlace; limit: number | null; adding: number; onPick: (to: HomeChoice) => void }) {
  if (place.kind === 'household') {
    const after = place.size + adding;
    const past = limit !== null && after > limit;
    return (
      <button type="button" className="where__row" onClick={() => onPick({ kind: 'household', gid: place.gid, world: place.world })}>
        <House aria-hidden="true" className="where__icon where__icon--home" />
        <span className="where__text">
          <span className="where__title">{place.hh}</span>
          <span className="where__sub">{[place.nb !== '-' && place.nb !== place.world ? place.nb : '', place.world].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={past ? 'where__meta where__meta--past' : 'where__meta'} title={past ? `They’d make ${after}, past the limit of ${limit}: the tag will say so` : undefined}>
          {past ? '⚠ ' : ''}
          {sizeOfLimit(place.size, limit)}
        </span>
      </button>
    );
  }
  if (place.kind === 'lot') {
    const lot = place.lot;
    return (
      <button type="button" className="where__row" onClick={() => onPick({ kind: 'lot', lot })}>
        <MapPin aria-hidden="true" className="where__icon where__icon--lot" />
        <span className="where__text">
          <span className="where__title">{lot.name}</span>
          <span className="where__sub">{[lotKindLabel(lot), lot.nb, lotSizeLabel(lot), lotRoomsLabel(lot)].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="where__meta">Free lot</span>
      </button>
    );
  }
  return (
    <button type="button" className="where__row" onClick={() => onPick({ kind: 'world', world: place.world })}>
      <GlobeHemisphereWest aria-hidden="true" className="where__icon" />
      <span className="where__text">
        <span className="where__title">Somewhere in {place.world}</span>
        <span className="where__sub">Choose the home later</span>
      </span>
    </button>
  );
}

/**
 * Where they'll live: the world in view's households (and how full each
 * is), its free lots and the world itself first, any other by search, and
 * Not decided yet always. Nothing here blocks: a home past the limit takes
 * them all the same, and a choice left for later puts them in a Needs a
 * home box whose tag says so.
 */
export function WherePicker({ places, inView, limit, adding, undecided = true, onPick }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // A frame later: the menu is hidden while it measures where it fits.
    const f = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, []);
  const world = inView && inView !== NOT_IN_WORLD ? inView : null;
  const shown = query.trim() ? searchPlaces(places, query) : world ? placesIn(places, world) : [];
  return (
    <div className="where">
      <input
        ref={inputRef}
        className="pmenu__search"
        type="search"
        aria-label="Find a household, lot or world"
        placeholder="Find a household, lot or world"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!query.trim() && world && <p className="where__head">{world}, in view</p>}
      <div className="where__list" role="group" aria-label={query.trim() ? 'Found' : world ? `${world}, in view` : 'Places'}>
        {shown.map((p) => (
          <Row
            key={p.kind === 'household' ? p.gid : p.kind === 'lot' ? `lot:${p.lot.world}|${p.lot.name}` : `world:${p.world}`}
            place={p}
            limit={limit}
            adding={adding}
            onPick={onPick}
          />
        ))}
        {query.trim() && !shown.length && <p className="where__none">No household, lot or world by that name.</p>}
      </div>
      {undecided && (
        <>
          <p className="where__head">Or</p>
          <button type="button" className="where__row" onClick={() => onPick({ kind: 'none' })}>
            <Question aria-hidden="true" className="where__icon" />
            <span className="where__text">
              <span className="where__title">Not decided yet</span>
              <span className="where__sub">{NOT_IN_WORLD} for now; the view goes to them</span>
            </span>
          </button>
        </>
      )}
    </div>
  );
}
