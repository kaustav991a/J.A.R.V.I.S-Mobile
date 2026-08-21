# Mailbox delivery — what `jarvis-brain` needs to change

Written 2026-08-21, **awaiting approval. Nothing in `jarvis-brain` has been touched.**

## The report

> "sometimes i sent a message then close the app.. i didnt get reply back"

and, on how it should behave instead:

> "like gemini chatgpt app .. their messages never dropped.. if connection cut for
> any reason .. the answer is arrive as soon as link restored"

That is the right standard, and this app does not meet it.

## Why it drops today

The gateway writes an answer to whatever socket it believes is open. `machine.ts:107`
records what that costs, measured from this end:

> a suspended Android app's socket still accepts a write into an OS buffer, so the
> gateway's `send_json` succeeds, `emit()` reports the frame as delivered, and
> `deliver()` therefore never falls back to push.

The phone now closes its socket deliberately on background to force the push path.
**That fix has a hole: swiping the app away from recents is a kill, not a background.**
Android does not reliably deliver `background` first, so `suspend()` never runs, the
socket dies at TCP level, and the gateway writes into a half-open connection that
accepts the bytes. The answer is lost at the source, and nothing anywhere records that
it existed.

A second, smaller loss: when the push *does* go out and the notification is cleared
without being tapped, `pendingReplies()` has nothing left to reconcile from —
`getPresentedNotificationsAsync` only reports what is still in the tray.

Both have the same root: **delivery is attempted once, and success is inferred from a
write returning rather than from the client saying it arrived.**

## The change, in one sentence

Stop treating a socket write as delivery. Write every answer into a mailbox, keyed by
the turn it answers, and let the phone collect what it has not yet acknowledged.

Nothing is re-generated and nothing is remembered by a model. This is a queue, not a
recollection — which matters, because the alternative I first proposed (asking the
model what it had said) invents answers, and this app produced one invented answer
already today.

## Five pieces

### 1. A turn id on every ask — **phone side, already built**

`sendCommand` stamps each turn and the reducer tracks its state:
`sending → awaiting → answered`, or `failed` when nothing carried it. The stamp is the
turn's identity. **The gateway must echo it back on the answering frame**, unchanged.

Nothing else on the phone works until that echo exists.

### 2. The mailbox

One row per answer: `turn_id`, `chat_id`, `body`, `created_at`, `delivered_at`,
`acked_at`.

It has to survive a deploy, which means Postgres and not a dict or a file — Render
wipes the disk on every deploy, and that has silently disarmed a feature twice
already. `gateway_state` and `_restore_state()` are the existing precedent to follow.

An answer is written here **before** any attempt to deliver it. Not after, and not
instead-of-on-failure: the write is what makes the answer exist independently of
whether anyone was listening.

### 3. Delivery attempts, and an ack that means something

- Try the socket. **Do not treat the write returning as delivery.**
- The phone replies with an ack frame carrying the `turn_id`. Only that sets
  `acked_at`.
- No ack inside a short window → push, exactly as `_push_all` does now.
- The row stays until acked, whichever path worked.

The push and the socket stop being alternatives. They become two attempts at
delivering the same stored thing, and neither is trusted on its own.

### 4. A route to collect what was missed

`GET /app-outbox` — every unacked answer for this device, newest last.
`POST /app-outbox/ack` — a list of `turn_id`s the phone has taken in.

The phone calls the first on every reconnect and after every return to the foreground.
This is the piece that makes "the answer arrives as soon as the link is restored" true
rather than aspirational, and it is what covers the swipe-kill case that no amount of
push can reach.

Both go behind the existing app auth. **Note for §4 of the roadmap:** these belong to
the read-your-day half of the token, not the register-a-push half, so they are one
more reason the `APP_TOKEN` split should land before this rather than after.

### 5. Retention

Drop a row once acked, and drop an unacked one after a few days. An answer to a
question from last Tuesday arriving now is noise, not delivery.

## What I still need to read before writing any of it

I have read the route list, `_push_all`, `_commute_tick`, `_nudge_tick` and the
`gateway_state` work. I have **not** read the socket path — `deliver()` and `emit()`
are names taken from the phone's own comments, not from the file. So the first thing I
would do is read that path and confirm the change fits it, rather than assume the
shape from this side.

## What it is worth

It closes the oldest complaint about this app, and it is the same `turn_id` that two
other queued items need: sent/delivered/read ticks (`ROADMAP.md` §5.1.1) and
reply-to-a-message (§5.1.2). One piece of groundwork, three features.

## What it does not need

No new dependency, no new brain call, no model involvement, and no native change on
the phone — so the phone half ships over the air.

---

# Addendum — the briefing must arrive BEFORE the time, not after

Asked for 2026-08-21, and it is a second, smaller `jarvis-brain` change. Listed here
rather than in its own file because it is one window in one function.

> "if time is 8am i should get notification by 7:30 - 8:00AM .. if leaving office 7PM
> then i should get notification by 6:30-7:00 pm"

## What the gateway does now

`_due_departure` in `cloud_gateway.py`:

```python
if not (target <= minutes_now <= target + COMMUTE_FIRE_WINDOW_MIN):
    continue
```

with `COMMUTE_FIRE_WINDOW_MIN = 20`. Its own comment states the intent: *"Fires at
the time or shortly after, never before… a warning about the walk out is worth less
the earlier it arrives."*

## Why that is backwards

A briefing exists to change what you pick up on the way out. Arriving **as** you
reach the door — or twenty minutes after you have left — is too late to act on: the
umbrella decision happens before the shoes are on. The earlier warning is worth
*more*, not less, right up until it is so early the forecast has moved.

## The change

```python
# before the time, never after
if not (target - COMMUTE_LEAD_MIN <= minutes_now <= target):
    continue
```

with `COMMUTE_LEAD_MIN = 30`, replacing `COMMUTE_FIRE_WINDOW_MIN`. So 8:00 AM means
somewhere in 7:30–8:00 and a 7 PM departure means 6:30–7:00.

One knock-on worth checking while there: `_briefing_text` reads the forecast for the
departure hour and the two after it. That stays right — the advice is still about the
journey, not about the moment the notification lands — but the window label prints
whole hours (`hourLabel` ignores minutes), so a 6:30 departure already reads
`6 PM–9 PM`. Unchanged by this, and still owed.

## Already done on the phone

`DUE_WINDOW_MIN` in `lib/commute.ts` now fires `target - 30 … target` rather than
±30, so the fallback and the gateway will agree once the above lands. Shipped
2026-08-21.