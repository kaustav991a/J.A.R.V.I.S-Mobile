/**
 * Noticing something before being asked.
 *
 * Asked for repeatedly on 2026-08-21, and built from what the phone already holds:
 * the journal's `today` against `usual`, the commute schedule, and the place he is
 * standing in. No new permission, no weeks of waiting for a baseline that does not
 * exist yet, and no model.
 *
 * **The judgement of WHETHER to speak is made here, in code.** That sentence is
 * lifted verbatim from the gateway's own nudge, where it was not true: the decision
 * there was a substring match on a weekday name, and on the morning of the 21st it
 * announced a Saturday shift that did not exist. Nothing in this file asks a model
 * anything — a model is capable of wording a remark and incapable of deciding whether
 * one is warranted, because asked for something interesting it will always find
 * something.
 *
 * **What this is not, yet.** It notices when the app is opened, not while the phone
 * sits in a pocket — measured on this device, nothing this app schedules runs
 * unattended (`ROADMAP.md` §7: `#netAvail=0`, `#readyWithConn=0`, RARE bucket). So
 * this is anticipation you meet rather than anticipation that finds you. The gateway
 * push or a foreground service is what turns it into the second, and neither is
 * reachable from here today.
 */
import { DRIFT_MIN } from './commute';
import { spokeRecently } from './spokenStore';
import type { Spoken } from './spokenStore';

export type Observations = {
  now: Date;
  /** minutes of screen time today, the usual for this many days, from the journal */
  usage: { today: number; usual: number; days: number } | null;
  /**
   * Pickups today against an ordinary day.
   *
   * A separate observation from minutes, and not a redundant one: a heavy day and a
   * *fidgety* day are different things, and the second is invisible in a total. The
   * journal has computed `avgPickups` all along and `usageForAsk` was dropping it.
   */
  pickups: { today: number; usual: number; days: number } | null;
  /**
   * The next departure still ahead today.
   *
   * **Read and deliberately unused.** A countdown to it was the first trigger built
   * and it was withdrawn the same afternoon, on the report that it said nothing: the
   * time is one *you* typed into the Places screen, so counting down to it recites
   * your own setting rather than noticing anything, and the situation line directly
   * above already prints it. The briefing owns that moment properly, with measured
   * rain and temperature you do not otherwise have.
   *
   * Kept in the shape so the observation is available the day something makes it
   * worth a remark — being still at Office when you have usually left by now would
   * qualify, and that needs the location timeline in `ROADMAP.md` §3.2.
   */
  departure: { label: string; hour: number; minute: number } | null;
  /** where he is, when sharing is on and a fix is recent */
  place: string | null;
  /**
   * Whether he is at that place well past the hour he is usually gone from it.
   *
   * From `lib/timeline.ts`, which measures *last seen* rather than *left* — the app
   * has to be opened for a sighting to happen. The margin and the median are what
   * keep that honest; the remark quoting `goneBy` is what makes a wrong estimate
   * arguable instead of authoritative.
   */
  stillHereLate: boolean;
  /** the minute of the day he is usually gone by, for the figure in the remark */
  goneBy: number | null;
  /**
   * The app that is furthest past its OWN usual today, from `appDeltas`.
   *
   * A day's total names nothing that could be different tomorrow; the app that moved
   * does. Ranked above the total for exactly that reason, and the total stays as the
   * fallback for a heavy day spread across everything.
   */
  topApp: { app: string; today: number; usual: number; days: number } | null;
  /** somewhere well before the hour he is usually there, from `hereEarly` */
  early: { place: string; usualBy: number; at: number } | null;
  /** not somewhere he is usually at by now on this weekday, from `absentFrom` */
  absent: { place: string; usualBy: number; days: number } | null;
  /**
   * A departure he typed against the hour he is measurably gone by.
   *
   * The one observation here that ends in something to do. `goneBy` is a median of
   * LAST SIGHTINGS, so the remark says "seen" rather than "left" — the app has to be
   * open for a sighting, and claiming to know when he walked out would be inventing
   * the one figure this file exists to refuse.
   */
  schedule: { place: string; setAt: number; goneBy: number; days: number } | null;
  /** what has been said unprompted, and on which day — one day per subject */
  spokenBefore: Spoken | null;
};

export type Remark = {
  /** the subject, so the same one is never used twice running */
  about: string;
  line: string;
};

/** nothing is remarked on before this hour or after it, whatever it thinks it sees */
export const QUIET_FROM_H = 8;
export const QUIET_UNTIL_H = 21;

/**
 * How many days of history before "unusual" means anything.
 *
 * Two days is not a baseline, it is a pair of numbers. The journal reports how many
 * it has, so this is answerable rather than assumed.
 */
const ENOUGH_DAYS = 3;

/** how far past the usual before today is worth naming */
const OVER = 1.5;

/** a minimum, so a heavy morning against a very light usual is not a finding */
const OVER_FLOOR_MIN = 60;

/** the same idea for pickups: twice a very quiet day is still a quiet day */
const PICKUPS_FLOOR = 40;

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** `2h 40m`, and `40m` when there is no hour — a figure someone can argue with */
const spell = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};

/** `6:40 PM` from a minute of the day — the meridiem always, as everywhere here */
const clock = (minutes: number): string => {
  const h24 = Math.floor(minutes / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(minutes % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

export function anticipate(o: Observations): Remark | null {
  const hour = o.now.getHours();
  // the quiet hours are not negotiable, whatever it thinks it has noticed
  if (hour < QUIET_FROM_H || hour >= QUIET_UNTIL_H) return null;

  // once a day at most. A machine that speaks unprompted is one bad week from being
  // muted, and a muted assistant cannot say the one thing that mattered
  if (o.spokenBefore?.day === dayKey(o.now)) return null;

  /**
   * Ranked, and the order is the argument: what can be acted on now, then what is
   * about today, then what is about a habit. Only one is ever spent, so the ranking
   * decides which observation is worth a day's budget — a list sorted by how
   * interesting each looked in isolation would spend the day on the app total and
   * never mention that you are missing from the office.
   */
  const candidates = [
    placeRemark(o),
    absentRemark(o),
    earlyRemark(o),
    scheduleRemark(o),
    appRemark(o),
    usageRemark(o),
    pickupsRemark(o),
  ];

  // a subject that spoke goes quiet for a few days, and the NEXT one down speaks
  // instead of the day being spent in silence — which is what the single-subject
  // marker used to do
  return candidates.find((c) => c && !spokeRecently(o.spokenBefore, c.about, o.now)) ?? null;
}

/**
 * Still somewhere he is usually gone from, with the hour quoted.
 *
 * Ranked above the screen-time remark because it is about right now — it can be
 * acted on, where a day's total can only be noted.
 *
 * Refuses to speak without `goneBy`. `stillHereLate` cannot be true without a
 * baseline, so this is belt and braces — but a remark that cannot name its own
 * basis is the exact thing this file exists to refuse.
 */
function placeRemark(o: Observations): Remark | null {
  if (!o.place || !o.stillHereLate || o.goneBy === null) return null;
  return {
    about: 'place',
    line: `Still at ${o.place}, sir. You are usually gone by ${clock(o.goneBy)}.`,
  };
}

/**
 * Missing from somewhere he is usually at by now.
 *
 * Second only to being somewhere late, and above being early, because it is the one
 * of the three that might be worth doing something about. The weekday matching that
 * makes it safe lives in `absentFrom` — a Mon–Fri pattern asserted onto a Sunday is
 * the mistake the gateway's own nudge made on 2026-08-21, and it announced a shift
 * that did not exist.
 */
function absentRemark(o: Observations): Remark | null {
  if (!o.absent) return null;
  return {
    about: 'absent',
    line: `Not at ${o.absent.place}, sir. You are usually there by ${clock(o.absent.usualBy)}.`,
  };
}

/**
 * Somewhere well before the hour he is usually there.
 *
 * Early only, never late: the same margin that makes "an hour early" an observation
 * makes "an hour late" an accusation, and a first sighting is as likely to mean the
 * app was not opened as that he was not there.
 */
function earlyRemark(o: Observations): Remark | null {
  if (!o.early) return null;
  return {
    about: 'arrival',
    line: `At ${o.early.place} early, sir — usually you are there by ${clock(o.early.usualBy)}.`,
  };
}

/** and how many measured days must be behind that figure */
const ENOUGH_DRIFT_DAYS = 4;

/**
 * A departure time he typed that no longer matches what he does.
 *
 * The only remark here that ends in something to do, which is why it outranks every
 * observation about a day. It says **seen** rather than **left**, and names the day
 * count: `goneBy` is a median of last sightings, and a sighting needs the app to be
 * open — so the figure is honest about being an estimate, and the schedule it is
 * arguing with is one he can change in Places.
 */
function scheduleRemark(o: Observations): Remark | null {
  const s = o.schedule;
  if (!s || s.days < ENOUGH_DRIFT_DAYS) return null;
  if (s.setAt - s.goneBy < DRIFT_MIN) return null;
  return {
    about: 'schedule',
    line:
      `Your ${s.place} departure is set for ${clock(s.setAt)}, sir, ` +
      `and you were last seen there by ${clock(s.goneBy)} on ${s.days} days.`,
  };
}

/**
 * The app that moved, rather than the day that did.
 *
 * Above the day total, which is the same fact with the useful half removed: "4h on
 * the phone" names nothing that could be different tomorrow, and "2h 40m in
 * Instagram against a usual 50m" names exactly one thing. The floor and the ratio
 * live in `appDeltas`, with the journal, since they are about the measurement rather
 * than about whether to speak.
 */
function appRemark(o: Observations): Remark | null {
  const a = o.topApp;
  if (!a || a.days < ENOUGH_DAYS) return null;
  return {
    about: 'app',
    line: `${spell(a.today)} in ${a.app} today against a usual ${spell(a.usual)}, sir.`,
  };
}

/**
 * A day of unusually many pickups, which a total of minutes hides.
 *
 * Ranked below the screen-time remark rather than above it: forty extra minutes is
 * a bigger fact about a day than forty extra glances, and only one remark is spent.
 * Both quote their figures, for the same reason — an adjective about somebody's
 * habits with no measurement behind it cannot be disagreed with.
 */
function pickupsRemark(o: Observations): Remark | null {
  const p = o.pickups;
  if (!p || p.days < ENOUGH_DAYS) return null;
  // a floor as well as a ratio: twice a very quiet day is still a quiet day
  if (p.today < PICKUPS_FLOOR || p.today < p.usual * OVER) return null;
  return {
    about: 'pickups',
    line: `${p.today} pickups today against a usual ${p.usual}, sir.`,
  };
}

/**
 * A day well past his own usual, named with the figure that makes it arguable.
 *
 * The figure comes first and the remark second — the rule the briefing follows, and
 * for the same reason: "you are on your phone a lot" cannot be disagreed with, and a
 * measurement can. It is also the difference between a useful observation and a
 * machine editorialising about someone's habits.
 */
function usageRemark(o: Observations): Remark | null {
  const u = o.usage;
  if (!u || u.days < ENOUGH_DAYS) return null;
  if (u.today < OVER_FLOOR_MIN || u.today < u.usual * OVER) return null;
  return {
    about: 'usage',
    line: `${spell(u.today)} on the phone today against a usual ${spell(u.usual)}, sir.`,
  };
}
