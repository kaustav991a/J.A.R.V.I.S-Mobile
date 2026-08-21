# Full anticipation — what it needs, and what `jarvis-brain` owes

Written 2026-08-21, **awaiting approval. Nothing in `jarvis-brain` has been touched.**

## What exists as of today

`lib/anticipate.ts`, shipped and live on the phone. One trigger: today's screen time
against your own baseline, with both figures named. Decided in code, never by a model.
At most one remark a day, never the same subject twice running, quiet before 8 AM and
after 9 PM, silent unless there are three days of baseline.

**It notices when you open the app.** It does not find you.

A second trigger — a countdown to your leaving time — was built and withdrawn the same
afternoon on the report *"why this?"*. The report was right: the time is one you typed
into the Places screen, so counting down to it recites your own setting, and the
situation line directly above already prints it. That lesson is the design constraint
for everything below.

## The rule this whole document exists to enforce

**A remark must tell you something you do not already have.** Three tests it has to
pass, and the withdrawn trigger failed all three:

1. **Not a setting you configured.** Your alarm, your leaving time, your day mask.
2. **Not already on the screen.** The situation line prints the time, the place, the
   desk state and the next briefing.
3. **Falsifiable.** A figure you could disagree with, not an adjective. `4h against a
   usual 1h 40m` qualifies; "you are on your phone a lot" does not.

## Why the phone cannot finish this alone

Measured on the device, 2026-08-21 (`ROADMAP.md` §7):

```
Unsatisfied constraints: CONNECTIVITY WITHIN_QUOTA
UID: 10495; Network: 138 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)
UidStats{uid=10495 #run=0 #readyWithConn=0 #netAvail=0}
```

Nothing this app schedules runs unattended. Not sometimes-late — **never**. So any
remark that has to reach you while the phone is in a pocket has to come from the
gateway as a push. That is the whole reason `jarvis-brain` is involved at all.

## Part one — the phone's half, buildable without the gateway

### 1. A location timeline

**The single highest-value observation available, and it needs no new permission** —
location sharing already grants what it wants. Arrival and departure at named places,
into the journal beside the usage rows.

It unlocks the one remark I would actually defend:

> You are still at Office, and you have usually left by now.

That passes all three tests above: it is not a setting you typed, it is not on the
screen, and "usually" is a figure derived from your own history rather than an
adjective.

*Touches:* `lib/place.ts`, a new journal table beside `usage`, `lib/anticipate.ts`.

### 2. What the journal already holds and nothing reads

`usageForAsk` returns `top` — the apps you spend the most time in — and nothing uses
it. Two honest triggers sit in it:

- an app you open most days that you have not opened today, late in the day;
- a day whose *shape* is unusual rather than its total — an hour in one app that
  normally gets ten minutes.

Both are falsifiable, both derive from your own history, and neither is on any screen.

## Part two — what `jarvis-brain` owes

### 3. Deliver a remark the phone cannot deliver itself

The gateway already has everything needed: `_push_all`, a schedule it holds
(`/app-commute`), and `_nudge_tick` running every 15 minutes. What it does **not** have
is the phone's observations — the journal is on the device and stays there.

So the phone uploads *derived facts only*, never rows:

```json
POST /app-anticipate
{
  "tz": "Asia/Calcutta",
  "usual_minutes": 100,
  "baseline_days": 9,
  "left_office_by": "18:40",
  "quiet_from": 8, "quiet_until": 21
}
```

Numbers and times. No app names, no coordinates, no notification text — the same rule
the journal already follows (`shareFacts` sends a rollup, not rows) and the same rule
§4 of the roadmap makes non-negotiable.

The gateway then fires at most one push a day when a clock-based condition holds, with
its own `_spoken` marker so the two channels do not both speak.

**And it must not re-derive the judgement.** The phone decides what is worth saying;
the gateway is a courier with a clock. A gateway that re-decides is a second opinion
nobody asked for, and `_nudge_tick` is the cautionary tale — it decided on a substring
match and announced a Saturday shift that did not exist.

### 4. Fix `_nudge_subject` first, or delete it

`cloud_gateway.py:2474` decides whether to speak with `named_day = weekday in low` — a
bare substring test against stored facts. That is how the 21st opened with a remark
about a shift that was not happening. Until it is fixed, adding a second unprompted
channel is adding a second thing that can be wrong.

**Fix:** require recurrence wording (`every friday`, `fridays`, `on friday`), and
refuse a fact naming a weekday other than today. Or retire it and let the phone's own
anticipation be the only unprompted voice, which is my preference — one channel, one
budget, one place the judgement lives.

### 5. The token split comes before either

`/app-anticipate` and any outbox route hand over a description of your day. Today one
`APP_TOKEN` gates the socket, push registration, `/app-commute` and `/app-state`
alike. `ROADMAP.md` §4.1.1. Not negotiable before more of your day travels.

## What learned anticipation still needs, after all of the above

Two to four weeks of baseline before "unusual" means anything, and the senses in §3.2
to notice with. **No amount of code shortens the first.** Everything above is
hand-written rules over measured figures, which is honest and useful and is not the
same thing as a machine that learns your habits.

## Order

1. `_nudge_subject` fixed or retired — it is already wrong and already speaking.
2. The `APP_TOKEN` split — before any route carrying your day.
3. The location timeline, phone-side — the one observation worth having.
4. `POST /app-anticipate` and the gateway's courier tick.
5. The journal's `top` triggers, phone-side, once there is somewhere to send them.
