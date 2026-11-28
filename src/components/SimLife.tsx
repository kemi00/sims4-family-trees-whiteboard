import { useState } from 'react';
import { whenAt } from '../lib/firstChapter.ts';
import { aboutView, gameIconUrl, type AboutJob, type GameNames } from '../lib/simAbout.ts';
import type { SaveGameInfo, SimNode } from '../types/whiteboard.ts';

/** Stages with work or school: a toddler's day is neither. */
const SCHOOL_AGE = new Set(['Child', 'Teen']);
const WORKING_AGE = new Set(['Young Adult', 'Adult', 'Elder']);

/** A job's place on the right: "Level 3 of 10", or school's "Grade C"; none for university. */
function jobLevel(j: AboutJob): string {
  if (j.grade) return `Grade ${j.grade}`;
  return j.top ? `Level ${j.level} of ${j.top}` : '';
}

/**
 * The game's icon for a trait, skill, career or aspiration: a picture
 * beside its name, so screen readers skip it. Fetched when the Life tab
 * first shows (lazy, so a hidden tab fetches nothing); if it can't load,
 * the name stands alone.
 */
function GameIcon({ id, size, className }: { id: string; size: number; className: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      className={className}
      src={gameIconUrl(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

/** Why there is nothing to show, for a sim the save hasn't described. */
function noAboutNote(n: SimNode, saveGame: SaveGameInfo | null, boardHasAbout: boolean): string {
  if (n.treeId) return 'Only in the game’s family tree: your save keeps no work, traits or skills for them.';
  if (!saveGame) return 'Upload your save to see their work, aspiration, traits and skills.';
  if (!n.saveSimId) return 'Added on the board: their work, traits and skills show once a save has them.';
  // The board's last upload read these for others: the save has none for this sim.
  if (boardHasAbout) return 'Your save has no work, traits or skills for them.';
  return 'Upload your save again to see their work, aspiration, traits and skills.';
}

type Props = {
  n: SimNode;
  /** The game's names; null while they load. */
  names: GameNames | null;
  /** The names couldn't be fetched. */
  failed: boolean;
  saveGame: SaveGameInfo | null;
  planned: boolean;
  /** Some sim on the board has these from a save: the last upload read them. */
  boardHasAbout: boolean;
  /** Deceased: their life as it was when they died, greyed out. */
  gone?: boolean;
};

/**
 * The Life tab: what the sim does and is, from the save, named as the game
 * names it. Work and school with level or grade, the aspiration,
 * personality traits apart from earned ones, and skills, highest first.
 */
export function SimLife({ n, names, failed, saveGame, planned, boardHasAbout, gone = false }: Props) {
  if (planned) return <p className="edempty">Planned: their life starts in your game.</p>;
  if (!n.about) return <p className="edempty">{noAboutNote(n, saveGame, boardHasAbout)}</p>;
  if (!names) {
    return failed ? (
      <p className="edempty">The game’s names for these didn’t load. Reload the page to try again.</p>
    ) : null;
  }
  const v = aboutView(n.about, names, n.gender);
  const showWork = v.jobs.length > 0 || SCHOOL_AGE.has(n.age) || WORKING_AGE.has(n.age);
  const empty = !v.jobs.length && !v.aspiration && !v.personality.length && !v.earned.length && !v.death && !v.skills.length;
  const when = saveGame ? whenAt(saveGame, saveGame.clock) : '';
  // One column of icons for the skills: a skill without one keeps its place, so the names line up.
  const skillIcons = v.skills.some((s) => s.icon);

  return (
    <div className={gone ? 'edabout edabout--gone' : 'edabout'}>
      {gone && <p className="edgone">As they were when they died.</p>}
      {empty && <p className="edempty">Your save has nothing on their work, traits or skills yet.</p>}
      {!empty && showWork && (
        <section aria-labelledby="edWorkHead">
          <div className="edlabel">
            <span className="edlabel__text" id="edWorkHead">
              Work and school
            </span>
          </div>
          {v.jobs.length ? (
            <ul className="edjobs">
              {v.jobs.map((j) => {
                const level = jobLevel(j);
                // School's title only repeats its grade.
                const title = !j.grade && j.title && j.title !== j.name ? j.title : '';
                return (
                  <li key={`${j.name}|${j.branch ?? ''}`} className={j.icon ? 'edjob edjob--icon' : 'edjob'}>
                    {j.icon && <GameIcon id={j.icon} size={20} className={title ? 'edjob__icon edjob__icon--two' : 'edjob__icon'} />}
                    <span className="edjob__name">{j.branch ? `${j.name} › ${j.branch}` : j.name}</span>
                    {level && <span className="edjob__level">{level}</span>}
                    {title && <span className="edjob__title">{title}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="edjob edjob--none">{SCHOOL_AGE.has(n.age) ? 'No school or job' : 'No job'}</p>
          )}
        </section>
      )}
      {v.aspiration && (
        <section aria-labelledby="edAspHead">
          <div className="edlabel">
            <span className="edlabel__text" id="edAspHead">
              Aspiration
            </span>
          </div>
          <p className="edasp">
            {v.aspirationIcon && <GameIcon id={v.aspirationIcon} size={20} className="edasp__icon" />}
            <span className="edasp__name">{v.aspiration}</span>
          </p>
        </section>
      )}
      {(v.personality.length > 0 || v.earned.length > 0 || v.death) && (
        <section aria-labelledby="edTraitsHead">
          <div className="edlabel">
            <span className="edlabel__text" id="edTraitsHead">
              Traits
            </span>
          </div>
          <dl className="edtraits">
            {v.personality.length > 0 && (
              <div className="edtraits__row">
                <dt>Personality</dt>
                <dd>
                  <ul className="edchips">
                    {v.personality.map((t) => (
                      <li key={t.name} className={t.icon ? 'edchip edchip--icon' : 'edchip'}>
                        {t.icon && <GameIcon id={t.icon} size={16} className="edchip__icon" />}
                        <span>{t.name}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {v.earned.length > 0 && (
              <div className="edtraits__row">
                <dt>Earned</dt>
                <dd>
                  <ul className="edchips">
                    {v.earned.map((t) => (
                      <li key={t.name} className={t.icon ? 'edchip edchip--earned edchip--icon' : 'edchip edchip--earned'}>
                        {t.icon && <GameIcon id={t.icon} size={16} className="edchip__icon" />}
                        <span>{t.name}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {v.death && (
              <div className="edtraits__row">
                <dt>Death</dt>
                <dd>
                  <ul className="edchips">
                    <li className={v.death.icon ? 'edchip edchip--death edchip--icon' : 'edchip edchip--death'}>
                      {v.death.icon && <GameIcon id={v.death.icon} size={16} className="edchip__icon" />}
                      <span>{v.death.name}</span>
                    </li>
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
      {v.skills.length > 0 && (
        <section aria-labelledby="edSkillsHead">
          <div className="edlabel">
            <span className="edlabel__text" id="edSkillsHead">
              Skills
            </span>
          </div>
          <ul className="edskills">
            {v.skills.map((s, i) => (
              <li key={`${s.name}|${i}`} className="edskill">
                {s.icon ? (
                  <GameIcon id={s.icon} size={16} className="edskill__icon" />
                ) : (
                  skillIcons && <span className="edskill__icon" aria-hidden="true" />
                )}
                <span className="edskill__name">{s.name}</span>
                {s.level !== null && s.max !== null && (
                  <>
                    <span className="edskill__pips" aria-hidden="true">
                      {Array.from({ length: s.max }, (_, k) => (
                        <i key={k} className={k < s.level! ? 'on' : undefined} />
                      ))}
                    </span>
                    <span className="edskill__level" aria-hidden="true">
                      {s.level}
                    </span>
                    <span className="sr-only">{`Level ${s.level} of ${s.max}`}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!empty && (
        <p className="edaboutfoot">
          {when
            ? `From your save (${when}). Upload a newer save to refresh them.`
            : 'From your save. Upload a newer save to refresh them.'}
        </p>
      )}
    </div>
  );
}
