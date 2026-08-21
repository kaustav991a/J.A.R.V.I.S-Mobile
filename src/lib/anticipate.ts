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
export type Observations = {
  now: Date;
  /** minutes of screen time today, the usual for this many days, from the journal */
  usage: { today: number; usual: number; days: number } | null;
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
  /** what was said unprompted last time, and on which day */
  spokenBefore: { day: string; about: string } | null;
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

  const candidate = placeRemark(o) ?? usageRemark(o);
  if (!candidate) return null;

  // never the same subject twice running — one a day is not enough on its own, and
  // the same observation on consecutive days is how a remark becomes a nag
  if (o.spokenBefore?.about === candidate.about) return null;

  return candidate;
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
