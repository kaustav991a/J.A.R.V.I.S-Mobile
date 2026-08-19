# The phone journal — design

> Written 2026-08-19. **Piece 1 of four**, and the only one specified here.
> The others are named at the bottom so the boundaries stay honest.

## What this is for

J.A.R.V.I.S. should know Kaustav the way the films imply: from having watched,
not from having been told. The phone is the right observer — it is the device
that is actually used every day, and the desk is not.

This piece builds **the collector and the store**. It makes nothing smarter on
its own. Everything above it — recall, patterns, anticipation — reads from the
store this defines, so the store's shape is the most consequential decision in
the whole system.

## Decisions already taken

| Decision | Choice | Why |
| --- | --- | --- |
| Sources, eventually | usage, notifications, location, archives | all four wanted |
| **This slice** | **usage stats only, end to end** | the native build and the Settings grant are the real unknowns; prove them once, on the source with no third-party privacy problem |
| Storage | **phone only; summaries travel** | raw events never leave the device. Same shape the ask envelope already uses |
| Desk | untouched | the gateway is fair game, the desk is not |

## Architecture

Three layers. The boundaries are the point.

```
modules/usage-stats/          Kotlin + typed TS surface. Knows nothing about JARVIS.
        ↓  UsageSource interface
src/lib/journal/              expo-sqlite. Owns schema, retention, every query.
        ↓  typed reads
src/screens/JournalScreen     The readout. What was collected, from when, today's digest.
```

**The phone is the system of record.** The gateway is a courier and a prompt
surface, never the truth.

### Why our own native module, not the community package

`@brighthustle/react-native-usage-stats-manager` exists and was **last published
two years ago** (v0.1.5). A stale old-architecture bridge module against Expo 57
is exactly the failure `AGENTS.md` names as this project's most expensive
recurring bug: native config that looks applied and is not.

The surface needed is three calls. Writing ~100 lines of Kotlin against the
Expo Modules API is the same work as debugging someone else's dead dependency,
and it stays ours.

```ts
export interface UsageSource {
  hasPermission(): Promise<boolean>;
  openSettings(): Promise<void>;           // ACTION_USAGE_ACCESS_SETTINGS
  queryDaily(from: number, to: number): Promise<DailyRow[]>;
  queryEvents(from: number, to: number): Promise<UsageEvent[]>;
}
```

An interface, not a direct import, so everything above it is testable in jest
against a fake. The Kotlin half is verified on the device, and this document
says so rather than pretending a green suite covered it.

## Data model

**Two tables, because Android gives two fidelities and they must not be
confused with each other.**

Android's retention, verified 2026-08-19: **daily 7 days, weekly 4 weeks,
monthly 6 months, yearly 2 years.**

```sql
-- precise sessions. Android keeps ~7 days; we keep them forever once collected.
CREATE TABLE events (
  at     INTEGER NOT NULL,      -- epoch ms
  kind   TEXT    NOT NULL,      -- foreground | background | screen_on | screen_off | unlock
  app    TEXT,                  -- package name; null for screen/unlock events
  PRIMARY KEY (at, kind, app)   -- re-collecting the same window is a no-op
);
CREATE INDEX events_at ON events (at);

-- coarse per-day totals. Android keeps up to 2 years, so day one is not day zero.
CREATE TABLE daily (
  day TEXT    NOT NULL,         -- YYYY-MM-DD, local
  app TEXT    NOT NULL,
  ms  INTEGER NOT NULL,         -- totalTimeInForeground
  PRIMARY KEY (day, app)        -- upserted; the newest read wins
);
```

**No launch count on `daily`, deliberately.** `UsageStats.mLaunchCount` is hidden
API — there is no public getter, and reaching for it through reflection is
exactly the kind of thing that works on one phone and returns zero on the next.
A per-app launch count can be derived from `ACTIVITY_RESUMED` rows in `events`
when one is wanted, which means it is only available for the window Android
still holds events for. Honest and narrow beats broad and wrong.

**This slice counts pickups, not launches.** A pickup is a `KEYGUARD_HIDDEN`
event — the phone actually coming into your hand. An app arriving in the
foreground while you are already looking at the screen is not a pickup, and
counting those inflates the figure severalfold in the direction that sounds
impressive. Per-app launch counts wait for the recall layer, which is the first
piece with a reason to ask for them.

```sql

-- how far each source has been pulled, so a sync asks only for what is new
CREATE TABLE sync (source TEXT PRIMARY KEY, through INTEGER NOT NULL);
```

**Volume is not a concern.** An event row is tens of bytes and a heavy day is a
few hundred events; a year is well under 10 MB. Retention is capped at **two
years** so it is bounded rather than because it is tight.

## When it runs

**No background service, no new scheduler, no foreground notification.** Three
triggers, all free:

1. the app coming to the foreground
2. the `expo-background-task` that already runs the commute briefing
3. a manual **Sync now** on the Journal screen

This is safe because of a property worth stating plainly: **the collector can
afford to be lazy, because Android is the buffer.** Every query is retroactive
within its retention window, so a missed run costs nothing. Only an app left
unopened for more than seven days loses per-day event detail — and the daily
aggregate for those days still survives for months.

## Error handling

The governing rule comes from a bug this project has already paid for twice: a
silent result was read as "nothing happened" when it meant "nothing was
measured". The briefing cost an evening; the Vitals panel sat empty against a
healthy machine.

So the source reports **three distinguishable outcomes, never one**:

| Outcome | Meaning | What the digest says |
| --- | --- | --- |
| `granted` + rows | measured | the figures |
| `granted` + no rows | genuinely nothing | "nothing recorded for that day" |
| `denied` | permission absent or revoked | **"I cannot see your usage"** — never "you used nothing" |
| `error` | the call failed | says so, names what failed |

Permission can be revoked at any time from Settings, silently, and the next
sync then returns empty. Reading that as abstinence would be the same bug in a
new place.

A SQLite failure marks the store broken, the screen says so, and the app does
not crash on it — matching how `_memory_ready()` latches on the gateway.

## Testing

| Layer | How |
| --- | --- |
| Digest / summarising | pure functions over rows. Free, and the highest-value tests here |
| Store | in-memory SQLite behind a driver interface, so schema, upsert idempotency, watermarks and retention are all provable |
| `UsageSource` | a fake implementation; every consumer tested against it, including `denied` and `empty` as distinct cases |
| Kotlin module | **on the device, by checklist.** Not covered by jest, and not claimed to be |

The four outcomes above each get a test. So does re-running a sync over a window
already collected — it must change nothing.

## What this slice deliberately does not do

- **notifications, location timeline, archive import** — piece 1 widens to these
  once the spine is proven on the device
- **sharing to the gateway** — `/app-fact` exists and works, but the outbox lives
  in process RAM and a Render restart has already destroyed the desk key and 26
  sealed turns. Sharing therefore needs an unacknowledged-and-resend queue owned
  by the phone, and that belongs with the recall layer
- **any inference at all** — no "you seem stressed". The store and a factual
  digest, nothing more

## The pieces above this one

| # | Piece | Gives |
| --- | --- | --- |
| 2 | recall layer | answers about the past; colours every reply; the send-and-confirm queue to the gateway |
| 3 | pattern layer | the periodic portrait |
| 4 | anticipation | speaks first. Needs a baseline, which needs 2–4 weeks of collection |

**Piece 4 is the one that was actually asked for, and it is worthless without
the three beneath it.** An assistant that volunteers opinions about your habits
on a thin baseline is not perceptive, it is wrong out loud.
