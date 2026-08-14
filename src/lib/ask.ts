/**
 * What travels with a question.
 *
 * A model with no clock answers "today" from its weights, and its weights are
 * months old — so "is the office open tomorrow" and "what did I do this morning"
 * were being answered against an invented date. The same goes for named places:
 * only this phone knows what "the office" means, and the answer is wrong rather
 * than absent when that meaning is missing.
 *
 * The envelope is therefore unconditional. It used to be built only when location
 * sharing was on, and a question asked with sharing off fell back to bare text
 * (`link.send(trimmed)`), losing the clock and the named places along with the
 * coordinate — three things dropped to withhold one.
 */

export type KnownForAsk = { label: string; lat: number; lon: number };

export type AskWhere = {
  lat: number;
  lon: number;
  place: string;
  /**
   * The named place this coordinate is standing in — `Office`, `Home` — or null.
   *
   * Resolved on the phone rather than left to the far end. One desk was reported
   * across four consecutive turns as Bidhannagar, then Kankurgachi, then twice as
   * Presidency Division: the reverse geocoder answers differently between calls,
   * and every one of those answers was stated as fact. A label the user set by
   * standing there does not drift.
   */
  label: string | null;
  /** measured conditions, fetched by the phone; null when the lookup failed */
  weather: string | null;
  trail: { place: string; when: string }[];
};

export type Clock = {
  /** local wall time with its offset, e.g. `2026-08-14T20:04:13+05:30` */
  iso: string;
  /** IANA zone when the runtime knows one, else null */
  tz: string | null;
  weekday: string;
  /** minutes east of UTC, so a reader with no zone table can still place it */
  offset: number;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number): string => String(Math.abs(Math.trunc(n))).padStart(2, '0');

/**
 * The zone name, or null.
 *
 * Guarded because `Intl` is a Hermes build option rather than a guarantee, and a
 * missing zone must cost the zone name only — `offset` below is computed from
 * `Date` and is always present, which is enough to place the question in time.
 */
function zoneName(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz ? tz : null;
  } catch {
    return null;
  }
}

/**
 * Local wall time, not UTC.
 *
 * `toISOString()` would send `2026-08-14T14:34:13Z` and leave the model to do the
 * timezone arithmetic before it can say whether it is morning — an extra step it
 * gets wrong. Sending the offset alongside the local reading removes the step and
 * still says, unambiguously, which instant this is.
 */
export function localClock(now: Date = new Date()): Clock {
  // getTimezoneOffset is minutes *behind* UTC, which is the opposite sign to the
  // one an ISO offset carries
  const offset = -now.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const iso =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
  return { iso, tz: zoneName(), weekday: WEEKDAYS[now.getDay()], offset };
}

/**
 * Build the wire envelope for a question.
 *
 * `where` is the only optional part: it is absent when location sharing is off or
 * when the fix failed, and its absence is the honest answer to "where was this
 * asked from". Everything else is always known.
 */
export function buildAsk(parts: {
  text: string;
  known: KnownForAsk[];
  where?: AskWhere | null;
  now?: Date;
}): string {
  const { text, known, where } = parts;
  return JSON.stringify({
    type: 'ask',
    text,
    when: localClock(parts.now),
    known,
    ...(where
      ? {
          where: {
            ...where,
            // Mirrored inside `where` for the gateway deployed on 2026-08-13,
            // which reads `where.known` and would otherwise stop resolving "how
            // far to the office" the moment this moved. Drop this line once the
            // gateway reads the top-level `known`.
            known,
          },
        }
      : {}),
  });
}
