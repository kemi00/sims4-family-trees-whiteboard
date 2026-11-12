import type { HomeRoom } from '../lib/homeRoom.ts';
import { HOUSEHOLD_MAX } from '../lib/homeRoom.ts';
import { lotKindLabel, lotRoomsLabel, lotSizeLabel, type GameLot } from '../lib/places.ts';
import { useState } from 'react';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { livingPlace } from '../lib/connectionLog.ts';
import { waitText, type ElderTime, type PlanItem, type PlanState } from '../lib/householdPlan.ts';
import { daysText, oldAgeSoonText } from '../lib/lifeClock.ts';
import { windowText, type PlanWindow } from '../lib/matchClock.ts';
import type { Group, SaveGameInfo, SimNode, World } from '../types/whiteboard.ts';
import { WorldMoveForm } from './WorldMoveForm.tsx';
import { BookOpenText, ImageSquare } from '../icons.ts';

type Props = {
  group: Group;
  /** The plan items this household's sims are in. */
  items: PlanItem[];
  /** Other households' items that playing this one helps along. */
  unblocks: PlanItem[];
  /** The sims to move in before the game has this household (householdsNotInGame). */
  notInGame?: string[];
  /** The game lot it lives on, named before its neighbourhood. */
  lot?: string;
  /** Room on that lot for everyone, planned babies too (homeRoom). */
  room?: HomeRoom | null;
  /** The whole household moves to a free lot that fits. */
  onMoveToLot?: (lot: GameLot) => void;
  elders: ElderTime[];
  nameOf: (id: string) => string;
  /** "the Munch household". */
  hhOf: (gid: string) => string;
  /** A save was imported, so ages and countdowns come from it. */
  fromSave: boolean;
  /** The last save's clock and calendar, for the matchmaking clock's days. */
  game?: SaveGameInfo | null;
  /** Sims to glow on the board while a line is hovered or focused; null to stop. */
  onHover: (ids: string[] | null) => void;
  /** A line was clicked: show its sims. */
  onPick: (item: PlanItem) => void;
  onPickSim: (id: string) => void;
  onClose: () => void;
  /** Make a poster of the household. */
  onPoster?: () => void;
  /** Open the Chronicle on the household's story; absent while the story is empty. */
  onStory?: () => void;
  /** Set when the household can move to another world: the board's worlds and households. */
  move?: {
    worlds: World[];
    groups: Group[];
    nodes: SimNode[];
    onMove: (world: string, house?: string) => void;
  };
};

/** "Elsa Bjergsen", "Elsa Bjergsen and Joaquin Le Chien", "Elsa, Joaquin and Hugo". */
function listNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const SECTIONS: { state: PlanState; title: string }[] = [
  { state: 'ready', title: 'Ready' },
  { state: 'waiting', title: 'Waiting' },
  { state: 'offPlan', title: 'Off plan' },
];

/**
 * One household's plan, for the household you feel like playing: what
 * you can do today, what waits and on whom, what the game did instead,
 * how long its elders have, and what playing it helps along elsewhere.
 * Only the verdict: who the sims are is on the board, and hovering a line
 * lights them up there.
 */
export function HouseholdBrief({
  group,
  items,
  unblocks,
  notInGame,
  lot,
  room,
  onMoveToLot,
  elders,
  nameOf,
  hhOf,
  fromSave,
  game,
  onHover,
  onPick,
  onPickSim,
  onClose,
  onPoster,
  onStory,
  move,
}: Props) {
  const sheet = usePanelSheet();
  const [moveOpen, setMoveOpen] = useState(false);
  const place = [lot, livingPlace(group.nb, group.world)].filter(Boolean).join(', ');
  const hover = (ids: string[]) => ({
    onMouseEnter: () => onHover(ids),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(ids),
    onBlur: () => onHover(null),
  });
  const line = (i: PlanItem) => (
    <li key={i.id}>
      <button type="button" className={`brief__item brief__item--${i.state}`} {...hover(i.sims)} onClick={() => onPick(i)}>
        {i.text}
        {i.waits.map((w) => (
          <span key={`${w.sim}|${w.why}`} className="brief__why">
            {waitText(w, nameOf, hhOf)}
          </span>
        ))}
        {i.window && <WindowLine w={i.window} babies={i.kind === 'baby'} nameOf={nameOf} hhOf={hhOf} game={game} />}
        {i.note && <span className="brief__note">{i.note}</span>}
        {i.yourNote && <span className="brief__yours">{i.yourNote}</span>}
      </button>
    </li>
  );

  return (
    <aside
      className={sheet ? 'brief brief--sheet' : 'brief'}
      role="dialog"
      aria-label={`The ${group.hh} household’s plan`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="brief__head">
        <span className="brief__dot" style={{ background: group.color }} aria-hidden />
        <div className="brief__title">
          <b>{group.hh}</b>
          {place && <span>{place}</span>}
        </div>
        {onStory && (
          <button
            type="button"
            className="brief__close brief__poster"
            aria-label={`The story of the ${group.hh} household`}
            title="Story: what happened to this household in your uploads"
            onClick={onStory}
          >
            <BookOpenText aria-hidden="true" />
          </button>
        )}
        {onPoster && (
          <button
            type="button"
            className="brief__close brief__poster"
            aria-label={`Make a poster of the ${group.hh} household`}
            title="Poster: a picture of this household to keep or share"
            onClick={onPoster}
          >
            <ImageSquare aria-hidden="true" />
          </button>
        )}
        <button type="button" className="brief__close" aria-label="Close the household plan" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </header>
      {room && <HomeSection room={room} world={group.world} onMoveToLot={onMoveToLot} />}
      {move && (
        <>
          <button
            type="button"
            className="brief__movebtn"
            aria-expanded={moveOpen}
            aria-controls="briefMove"
            onClick={() => setMoveOpen((o) => !o)}
          >
            ↪ Move to another world
          </button>
          {moveOpen && (
            <div id="briefMove" className="brief__moveform">
              <WorldMoveForm
                idPrefix="briefMove"
                group={group}
                worlds={move.worlds}
                groups={move.groups}
                nodes={move.nodes}
                onMove={move.onMove}
              />
            </div>
          )}
        </>
      )}
      {notInGame && (
        <p className="brief__away">
          <b>Not in your game yet.</b> Move {listNames(notInGame.map(nameOf))} in, then upload a save: until then there’s no
          household to play.
        </p>
      )}
      {!items.length && (
        <p className="brief__empty">
          Nothing planned for this household yet. Plan a sim with the + on its tag, a baby with the + under a couple or a sim, or a
          couple with Connect.
        </p>
      )}
      {SECTIONS.map(({ state, title }) => {
        const list = items.filter((i) => i.state === state);
        if (!list.length) return null;
        return (
          <section key={state} className="brief__section">
            <h3>
              {title} <span className="brief__count">{list.length}</span>
            </h3>
            {state === 'offPlan' && (
              <p className="brief__hint">The game went another way. Open one of these sims to follow the game or keep your plan.</p>
            )}
            <ul>{list.map(line)}</ul>
          </section>
        );
      })}
      {elders.length > 0 && (
        <section className="brief__section">
          <h3>Elders</h3>
          <ul>
            {elders.map((e) => (
              <li key={e.id}>
                <button type="button" className="brief__item brief__item--elder" {...hover([e.id])} onClick={() => onPickSim(e.id)}>
                  {nameOf(e.id)}
                  <span className="brief__why">
                    Elder for {daysText(e.elderDays)} · {oldAgeSoonText(e.oldAgeIn)}
                    {e.frozen ? ' of aging' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {unblocks.length > 0 && (
        <section className="brief__section">
          <h3>Also helps</h3>
          <p className="brief__hint">
            Playing {hhOf(group.gid)} also helps {unblocks.length === 1 ? 'this plan' : `these ${unblocks.length} plans`} in
            other households:
          </p>
          <ul>{unblocks.map(line)}</ul>
        </section>
      )}
      <p className="brief__foot">
        {fromSave
          ? 'Ages come from your last save import. Upload a newer save to refresh them.'
          : 'No save imported yet: countdowns appear once you upload one.'}
      </p>
    </aside>
  );
}

/** "3 bed · 2 bath · 40×30", what a lot is. */
function lotFacts(l: GameLot): string {
  return [l.kind === 'empty' ? lotKindLabel(l) : lotRoomsLabel(l), lotSizeLabel(l)].filter(Boolean).join(' · ');
}

/**
 * Their home and whether it fits them: the lot's bedrooms against who lives
 * there and who is planned, and the game's limit of eight. When it doesn't
 * fit, the free lots in their world that would, to move the household to.
 */
function HomeSection({
  room,
  world,
  onMoveToLot,
}: {
  room: HomeRoom;
  world: string;
  onMoveToLot?: (lot: GameLot) => void;
}) {
  const { lot } = room;
  const people = room.sims + room.planned;
  const who = [
    room.sims ? `${room.sims} ${room.sims === 1 ? 'sim' : 'sims'}` : '',
    room.planned ? `${room.planned} planned` : '',
    room.pets ? `${room.pets} ${room.pets === 1 ? 'pet' : 'pets'}` : '',
  ].filter(Boolean);
  return (
    <section className="brief__home" aria-label="Their home">
      <p className="brief__homelot">
        <span aria-hidden="true">🏠</span> <b>{lot.name}</b> <span className="brief__homefacts">{lotFacts(lot)}</span>
      </p>
      <p
        className="brief__homewho"
        title="Roughly one bedroom for each couple and one for everyone else, babies too."
      >
        {who.join(', ')}
        {lot.kind === 'house' && people > 0 && <>: about {room.rooms === 1 ? '1 bedroom' : `${room.rooms} bedrooms`} needed</>}
      </p>
      {room.overCap && (
        <p className="brief__homewarn">
          {people + room.pets} in one household: the game allows {HOUSEHOLD_MAX}. Someone has to move out before
          everyone planned is born.
        </p>
      )}
      {room.short && (
        <p className="brief__homewarn">
          The house has {lot.beds === 1 ? '1 bedroom' : `${lot.beds} bedrooms`}: build on, or move to a lot with more.
        </p>
      )}
      {lot.kind === 'empty' && (
        <p className="brief__homewarn">An empty lot: build them a home with about {room.rooms} bedrooms.</p>
      )}
      {room.fits.length > 0 && (
        <>
          <p className="brief__homefit">Free in {world}, with room for them:</p>
          <ul className="brief__homelots">
            {room.fits.map((l) => (
              <li key={l.name}>
                <span>
                  <b>{l.name}</b>, {l.nb} <span className="brief__homefacts">{lotFacts(l)}</span>
                </span>
                {onMoveToLot && (
                  <button type="button" onClick={() => onMoveToLot(l)}>
                    Move here
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}


/**
 * A couple's or a baby's matchmaking clock under its plan line: when the
 * one who could carry turns Elder, and whether the one still too young
 * grows up first. Amber when the window is closing.
 */
function WindowLine({
  w,
  babies,
  nameOf,
  hhOf,
  game,
}: {
  w: PlanWindow;
  babies: boolean;
  nameOf: (id: string) => string;
  hhOf: (gid: string) => string;
  game?: SaveGameInfo | null;
}) {
  const t = windowText(w, nameOf, hhOf, game, babies);
  if (!t) return null;
  return (
    <span className={`brief__window brief__window--${t.tone}`}>
      <span aria-hidden="true">⏳ </span>
      {t.text}
    </span>
  );
}
