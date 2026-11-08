import type { SimNode } from '../types/whiteboard.ts';

type Props = {
  /** The lit dynasty's members. */
  ids: ReadonlySet<string>;
  byid: Record<string, SimNode>;
  onShowAll: () => void;
  onDone: () => void;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Says which dynasty is lit from the Dynasties panel and how far its
 * members are spread, while the highlight is on. Its members can live in
 * several worlds, so Show all fits them on screen together.
 */
export function DynastyBanner({ ids, byid, onShowAll, onDone }: Props) {
  const members = [...ids].map((id) => byid[id]).filter((n): n is SimNode => !!n);
  const name = members.find((n) => n.dynasty)?.dynasty ?? 'This';
  const homes = new Set(members.map((n) => n.gid)).size;
  const worlds = new Set(members.map((n) => n.world)).size;
  return (
    <div
      className="bloodline-banner family-banner"
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p>
        The {name} dynasty: <b>{plural(members.length, 'sim')}</b> in <b>{plural(homes, 'household')}</b>
        {worlds > 1 ? (
          <>
            , across <b>{plural(worlds, 'world')}</b>
          </>
        ) : null}
        <span className="family-banner__roles">Its members glow; everyone else is dimmed. Esc also ends it.</span>
      </p>
      <button type="button" className="banner__alt" onClick={onShowAll}>
        Show all
      </button>
      <button type="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
