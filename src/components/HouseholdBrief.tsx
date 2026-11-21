import type { HomeRoom } from '../lib/homeRoom.ts';
import { CloseButton, IconButton } from './CloseButton.tsx';
import { HOUSEHOLD_MAX } from '../lib/homeRoom.ts';
import { lotKey, lotKindLabel, lotRoomsLabel, lotSizeLabel, type GameLot, type LotCatalog } from '../lib/places.ts';
import { homesSold, money, moveMoney, togetherText, type BoxFunds } from '../lib/funds.ts';
import { fold, theHousehold } from '../lib/utils.ts';
import { useRef, useState } from 'react';
import { useLightDismiss } from '../hooks/useLightDismiss.ts';
import { usePanelSheet } from '../hooks/usePanelSheet.ts';
import { useSheet } from '../hooks/useSheet.ts';
import { SheetGrabber } from './SheetGrabber.tsx';
import { livingPlace } from '../lib/connectionLog.ts';
import { waitText, type ElderTime, type PlanItem, type PlanState } from '../lib/householdPlan.ts';
import { daysText, oldAgeSoonText } from '../lib/lifeClock.ts';
import { windowText, type PlanWindow } from '../lib/matchClock.ts';
import type { Group, SaveGameInfo, SimNode, World } from '../types/whiteboard.ts';
import { WorldMoveForm } from './WorldMoveForm.tsx';
import { BookOpenText, ImageSquare } from '../icons.ts';
import { NEEDS_HOME_LABEL } from '../lib/constants.ts';
import { needsHome } from '../lib/whereTheyLive.ts';

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
  /**
   * The household's money from the last save, when it has some: the funds,
   * when the save had them, lot prices typed from the game and setting one.
   */
  money?: {
    funds: BoxFunds;
    when: string;
    prices: Readonly<Record<string, number>>;
    onPrice: (lot: GameLot, price: number | undefined) => void;
  };
  /** Any household's money: a whole household moving in brings its funds along. */
  fundsOf?: (gid: string) => BoxFunds | undefined;
  /** Set when the household can move to another world: the board's worlds and households. */
  move?: {
    worlds: World[];
    groups: Group[];
    nodes: SimNode[];
    lotCatalog: LotCatalog;
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
  money: cash,
  fundsOf,
  move,
}: Props) {
  const sheet = usePanelSheet();
  const ref = useRef<HTMLElement>(null);
  const drawer = useSheet(ref, { enabled: sheet, head: '.brief__head', keep: '.menu' });
  // Its own lot menu ("Move to a lot") is part of it.
  useLightDismiss(ref, onClose, { keep: '.menu' });
  const [moveOpen, setMoveOpen] = useState(false);
  const place = [lot, livingPlace(group.nb, group.world)].filter(Boolean).join(', ');
  /** The board's box for sims with no home yet: titled for what it waits on, in the ⚠ chips' amber. */
  const homeless = needsHome(group.gid);
  const whose = homeless ? 'the sims who need a home' : `the ${group.hh} household`;
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
        {i.joins && togetherText(fundsOf?.(i.joins.to)) && (
          <span className="brief__money">{togetherText(fundsOf?.(i.joins.to))}</span>
        )}
        {i.yourNote && <span className="brief__yours">{i.yourNote}</span>}
      </button>
    </li>
  );

  return (
    <aside
      ref={ref}
      className={sheet ? 'brief brief--sheet' : 'brief'}
      role="dialog"
      aria-label={homeless ? 'The plan for the sims who need a home' : `The ${group.hh} household’s plan`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SheetGrabber sheet={drawer} what="the plan" />
      <header className="brief__head">
        <span className="brief__dot" style={{ background: homeless ? 'var(--warn-strong)' : group.color }} aria-hidden />
        <div className="brief__title">
          <b className={homeless ? 'brief__warn' : undefined}>{homeless ? NEEDS_HOME_LABEL : group.hh}</b>
          {place && <span>{place}</span>}
        </div>
        {onStory && (
          <IconButton
            label={`The story of ${whose}`}
            title="Story: what happened to this household in your saves"
            onClick={onStory}
          >
            <BookOpenText aria-hidden="true" />
          </IconButton>
        )}
        {onPoster && (
          <IconButton
            label={`Make a poster of ${whose}`}
            title="Poster: a picture of this household to keep or share"
            onClick={onPoster}
          >
            <ImageSquare aria-hidden="true" />
          </IconButton>
        )}
        <CloseButton label="Close the household plan" onClick={onClose} />
      </header>
      {room && <HomeSection room={room} world={group.world} onMoveToLot={onMoveToLot} cash={cash} hh={group.hh} />}
      {!room && cash && <FundsLine funds={cash.funds} when={cash.when} />}
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
                lotCatalog={move.lotCatalog}
                onMove={move.onMove}
              />
            </div>
          )}
        </>
      )}
      {notInGame && (
        <p className="brief__away">
          <b>Not in your game yet.</b> Move {listNames(notInGame.map(nameOf))} in, then upload your save: until then there’s no
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
          ? 'Ages come from the last save you uploaded. Upload a newer save to refresh them.'
          : 'No save uploaded yet: countdowns appear once you upload one.'}
      </p>
    </aside>
  );
}

/** "3 bed · 2 bath · 40×30", what a lot is. */
function lotFacts(l: GameLot): string {
  return [
    l.venue === 'rental' || l.venue === 'tiny' || l.kind === 'empty' ? lotKindLabel(l) : null,
    lotRoomsLabel(l),
    lotSizeLabel(l),
  ].filter(Boolean).join(' · ');
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
  cash,
  hh,
}: {
  room: HomeRoom;
  world: string;
  onMoveToLot?: (lot: GameLot) => void;
  cash?: Props['money'];
  hh: string;
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
      {cash && <FundsLine funds={cash.funds} when={cash.when} />}
      {cash && movingTo(cash.funds, lot) && <MovePrice lot={lot} hh={hh} cash={cash} />}
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

/**
 * The lot they're planned onto is none their households live on in the
 * game: a move to make, with a price the save doesn't keep.
 */
function movingTo(funds: BoxFunds, lot: GameLot): boolean {
  return !funds.shares.some((f) => f.lot && fold(f.lot) === fold(lot.name));
}

/** "§45,500 in funds", from the save; several households' money together, said in full. */
function FundsLine({ funds, when }: { funds: BoxFunds; when: string }) {
  const together = togetherText(funds);
  return (
    <p className="brief__funds" title={when ? `From your save, ${when}` : 'From your save'}>
      <b>{together || `${money(funds.amount)} in funds`}</b>
      {!together && <span>from your save</span>}
    </p>
  );
}

/**
 * A planned move's price, typed as the game shows it, and what it leaves:
 * short by how much (a when: ready once they have it), or what's left. It
 * warns and never blocks. The home a move sells adds its value in the game,
 * which the save doesn't keep either: said, not counted.
 */
function MovePrice({ lot, hh, cash }: { lot: GameLot; hh: string; cash: NonNullable<Props['money']> }) {
  const key = lotKey(lot);
  const saved = cash.prices[key];
  const [draft, setDraft] = useState(saved === undefined ? '' : String(saved));
  const [was, setWas] = useState(saved);
  if (was !== saved) {
    // Undo or another household changed it: show what's kept.
    setWas(saved);
    setDraft(saved === undefined ? '' : String(saved));
  }
  const commit = () => {
    const digits = draft.replace(/[^0-9]/g, '');
    const price = digits ? Number(digits) : undefined;
    setDraft(price === undefined ? '' : String(price));
    if (price !== saved) cash.onPrice(lot, price);
  };
  const sold = homesSold(cash.funds, lot.name);
  const sale = sold.length === 1 ? sold[0]! : sold.length ? 'their homes' : '';
  const who = theHousehold(hh);
  const id = `briefPrice-${key}`;
  const verdict = (() => {
    if (saved === undefined) {
      return {
        tone: 'say',
        text: `They have ${money(cash.funds.amount)}. Your save doesn’t keep lot prices: the game shows this one when they move in.`,
      };
    }
    const m = moveMoney(cash.funds, saved);
    if (m.short !== undefined) {
      return {
        tone: 'short',
        text: `⚠ ${money(m.short)} short. Ready when ${who} has ${money(saved)}.${sale ? ` Selling ${sale} adds ${sold.length === 1 ? 'its' : 'their'} value too: the game pays it when they move.` : ''}`,
      };
    }
    return { tone: 'left', text: `${money(m.left!)} left after the move${sale ? `, before selling ${sale}` : ''}.` };
  })();
  return (
    <div className="brief__price">
      <label htmlFor={id}>
        <span>Price in the game</span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="§ as the game shows it"
          value={draft ? money(Number(draft.replace(/[^0-9]/g, '') || 0)) : ''}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commit();
            }
          }}
        />
      </label>
      <p className={`brief__verdict brief__verdict--${verdict.tone}`} role="status">
        {verdict.text}
      </p>
    </div>
  );
}
