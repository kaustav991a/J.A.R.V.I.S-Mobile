# Declared rules — design

> Written 2026-08-20, the evening the gateway first spoke unprompted. This spec
> covers **declared** rules: things the operator asks to be told, in his own
> words, which are then evaluated in code rather than re-judged by a model. The
> learned version — "you always call when you reach the office, and you have not
> today" — is the same engine with the rule written by a baseline instead of by
> him, and is deliberately out of scope here.

## Why this, and why now

Everything the assistant says is either an answer or one of two unprompted
things: the commute briefing, which runs on a timetable, and the daily remark,
which fires when a stored fact happens to name today. Both were built on
2026-08-20. Neither can be *asked for*.

The request was two examples, and they turn out to be different shapes:

1. "Every day I call my mother and my girlfriend when I reach the office. If I
   have not one day, tell me." — something that should have happened, and has
   not. Call it **absence**.
2. "When I open Swiggy or Zomato, tell me what I can eat given what I like." —
   something that just happened, and is worth speaking into. Call it
   **presence**.

They share a rule store, a declaration path, a wording discipline and a security
shape. They do not share an evaluator, because absence is a question about a
clock and presence is a question about a phone.

## The constraint that decides the architecture

`expo-background-task` hardcodes `setRequiredNetworkType(NetworkType.CONNECTED)`
(`BackgroundTaskScheduler.kt:108`) and this uid gets no network in the
background — measured on 2026-08-20 as `#netAvail=0`, standby bucket `40`
(RARE). That is why the briefing moved to a gateway push, and it is why **no
absence rule may be evaluated on the phone**: a rule due at 19:00 would fire
whenever the app was next opened, which is the bug this project already paid for
once.

Presence inverts the same measurement, and this is the design's one piece of
good luck. A presence trigger happens *while the phone is in use* — screen on,
network up, and the bucket observed at `10` rather than `40` immediately after a
launch. Those are precisely the conditions under which the blocked job
unblocks. So the existing background task, useless for a briefing, is a
plausible carrier for presence.

Plausible, not dependable. WorkManager's periodic floor is 15 minutes, so
latency is 0–15 minutes and a four-minute browse can fall between runs. v1
accepts that. A foreground service (~60s, reliable, permanent notification,
MIUI Autostart tuning) is the known upgrade and is **not** built here; the point
of shipping the free path first is to learn from real use whether a permanent
notification is a price worth paying.

## Where each half lives

| | Absence | Presence |
| --- | --- | --- |
| Evaluated by | gateway, `_rules_loop()` | phone, inside the existing background task |
| Knows the time | yes, `_OPERATOR_TZ` | yes |
| Knows the event | only what the phone last uploaded | directly, via `usage-stats` |
| Delivers via | `_push_all(..., force=True)` | local notification |
| Wording from | `think()` in-process | `think()` over HTTP, falling back to silence |

The rule store's authority is the **gateway**, because declaration happens in
chat and chat is a gateway surface. The phone pulls the subset it can evaluate.

## The rule

```json
{
  "id": "r_1",
  "said": "tell me if I haven't called mom by 7",
  "kind": "absence",
  "subject": "call:mom",
  "by": { "hour": 19, "minute": 0 },
  "days": [false, true, true, true, true, true, false],
  "created": "2026-08-20",
  "enabled": true
}
```

```json
{
  "id": "r_2",
  "said": "when I open a food app tell me what I can eat",
  "kind": "presence",
  "subject": "app:food",
  "days": [true, true, true, true, true, true, true],
  "created": "2026-08-20",
  "enabled": true
}
```

`days` is seven booleans, Sunday-first, the same shape `_clean_commute` already
validates and `_js_weekday` already indexes. Reusing it means one weekday
convention in the codebase rather than two, which is worth more than the
handful of lines it saves.

`by` is present on `absence` and absent on `presence`. A `presence` rule with a
`by`, or an `absence` rule without one, is refused at parse time rather than
stored and misread later.

### Subjects

A closed vocabulary. A rule referring to a subject the gateway does not know is
refused at declaration, with the refusal spoken back — never stored broken.

| Subject | Observed by | Available |
| --- | --- | --- |
| `at_place:<id>` / `left_place:<id>` | phone's `nameFor(fix, places)` | v1 |
| `app:<pkg>` or `app:food` (a named group) | `usage-stats` `queryEvents` | v1 |
| `unlock_after:<hour>` | journal `unlock` events | v1 |
| `call:<alias>` | `READ_CALL_LOG` | **later — needs a native module and a build** |

`call:mom` is the operator's own example and it is the one subject v1 cannot
observe. It is specified here so the schema does not change when the module
lands: the rule parses, stores, and refuses to fire with
`rule r_1 inert: call log not available`. Named rather than silently dropped.

`app:food` is a group, not a package, because "a food app" is what was asked for
and because the package names must be confirmed on the device — via
`labels()` or a journal read — rather than trusted from memory. Groups live in
one table on the gateway and travel to the phone with the rule.

## Declaring, in chat

A model parses the sentence **once**, at declaration. After that, evaluation is
pure code, forever. This is the same line the unprompted-remark design draws at
`cloud_gateway.py:2344`, and for the same reason: a model asked every fifteen
minutes whether a condition holds will eventually say yes for the wrong reason.
The model decides *wording*; code decides *whether*.

A cheap code gate runs first, so ordinary messages pay nothing:

- the message matches one of "tell me if", "let me know if", "remind me",
  "every time I", "when I", and
- it contains either a time (`by 7`, `at 19:00`, `after 9pm`) or a subject
  keyword.

Only then is the model asked to emit a single line — `RULE {json}` — or the
literal `NOTARULE` if the sentence was not one. The gateway parses that line,
validates it against the schema and the subject vocabulary, stores it, and
replies in his own voice with what he wrote down. A parse failure is spoken, not
swallowed: he says he did not understand and nothing is stored.

Settings gets a **list with delete**, not a form. Declaration is conversational;
the screen exists so a rule can be seen and killed, which is the part a
conversation is bad at.

## Evaluating absence

`POST /app-state`, bearer `APP_TOKEN`, gated exactly as `/app-commute` is —
`hmac.compare_digest`, 503 when the token is unset, 401 logged with the peer
address.

```json
{
  "as_of": 1755690000,
  "place": "office",
  "did": { "call:mom": false, "app:in.swiggy.android": true }
}
```

Uploaded on every foreground and on every cloud connect, following
`syncCommute`. Replacement, not merge.

Per tick, per enabled rule, in this order — each step a reason to stay silent:

1. today is set in `days`, else skip
2. `by <= now <= by + RULE_FIRE_WINDOW_MIN` (20), never early
3. `_ruled[id] != today`
4. `RULE_MAX_PER_DAY` (3) not yet spent across all rules
5. `NUDGE_FROM_H <= hour < NUDGE_UNTIL_H`
6. `now - state.as_of <= RULE_STATE_MAX_AGE` (default 3h), else
   `rule r_1 skipped: state 5h old`
7. `state.did[subject]` is falsy — a satisfied subject is silence, and the
   marker is still written so it does not reconsider all evening
8. word it, honour `SKIP`, push with `force=True`

Step 6 is the one that keeps this feature honest. The gateway can only reason
about what the phone last told it, and a phone that has not spoken for five
hours has not proved that nothing happened — it has proved nothing at all. A
stale state produces **silence**, never a guess.

## Evaluating presence

Inside the background task, after the journal sync that already runs there:

1. read the enabled `presence` rules from the AsyncStorage cache written by the
   last `GET /app-rules` — the task cannot assume a network, so a rule set it has
   never seen means it does nothing rather than blocking on a fetch
2. `queryEvents` for `foreground` events since the last presence check
3. match against the rule's subject or group
4. once per rule per day, quiet hours honoured
5. ask the gateway for wording; on any network failure, **stay silent** and do
   not mark the day spent
6. raise a local notification

Step 5's fallback is the whole difference between this and a canned message. A
suggestion assembled on the phone without the facts block would not know what he
eats, and a wrong suggestion is worse than none.

Note what the food case does *not* need: the preferences already travel in the
system prompt on every `think()` turn. The content half of "tell me what I can
eat" is solved the moment the dietary facts are stored. Only the timing is new.

## Wording

**He asks; he does not assert.** "Did you get a chance to call your mother?" —
not "you have not called your mother today." The phone's information can be
stale, and a question is true either way. A redundant question costs a shrug; a
confident false accusation is what teaches someone to mute an assistant, and a
muted assistant cannot say the one thing that mattered.

The instruction to the model mirrors `_nudge_subject`'s: one sentence, his
voice, no greeting, no list, no offer of help, and the literal `SKIP` if it does
not warrant saying out loud. The model's veto is honoured and the marker is
still written.

## Discipline

- one fire per rule per day
- `RULE_MAX_PER_DAY = 3` across all rules, so a careless set cannot become a nag
- quiet hours from the existing `NUDGE_FROM_H` / `NUDGE_UNTIL_H`
- silence is the default and needs no excuse; there is no "nothing to report"
- every skip prints its reason, because the briefing that never ran and the
  briefing that ran and found nothing to say were indistinguishable from
  outside, and that let a wrong hypothesis stand for a day

## Security

The call log never leaves the phone. What uploads is a boolean against an alias
the operator chose. No numbers, no per-call timestamps, no durations, no contact
names beyond the alias.

Aliases join coordinates on the **never printed** list — the Render dashboard is
readable by anyone who can reach it, and `_commute` already logs times without
places for exactly this reason (`cloud_gateway.py:3641`). Rule logs name the
rule id and the subject *type*, not the alias: `rule r_1 fired (call:*)`.

The phone remains the authority on state. Rules are stored gateway-side because
declaration is conversational, but a rule deleted on the phone travels as an
absence and goes quiet, never merged back to life.

`/app-state` and `/app-rules` share `APP_TOKEN` with the socket, the push
registration and `/app-commute`. It is a weaker secret than the brain's, and it
now gates something that says out loud what he did or did not do today — which
is a reason to keep the token rotation story in mind, not a reason to invent a
second credential here.

## Files

Gateway (`jarvis-brain/jarvis-backend/`):

- `cloud_gateway.py` — rule store and persistence beside `_commute` / `_nudge`,
  `_clean_rule()`, the chat-declaration gate and parse, `_rules_tick()` /
  `_rules_loop()`, `POST /app-state`, and `/app-rules` — `GET` lists, and
  `POST {"forget": "r_1"}` deletes, following `/app-fact`'s existing
  read-and-mutate-on-one-route shape rather than introducing a `DELETE` verb the
  rest of this API does not use
- `test_rules.py` — new harness

Phone (`jarvis-mobile/src/`):

- `lib/dayState.ts` — build the `/app-state` upload from the journal and places
- `lib/rules.ts` — presence matching against `queryEvents`, and the rule cache
- `api/client.ts` — `syncState()`, `rules()`
- `state/JarvisProvider.tsx` — send state on foreground and on cloud connect
- `lib/commuteTask.ts` — the presence check, after the journal sync
- `screens/SettingsScreen.tsx` — the rule list, with delete

No native module. No build. Ships over the air.

## Testing

`test_rules.py`, run by `run_harnesses.py`:

- parse: accepted sentence, `NOTARULE`, malformed JSON, unknown subject,
  `presence` carrying a `by`, `absence` missing one, `days` of wrong length
- fire window at both edges, and never early
- once per rule per day; `RULE_MAX_PER_DAY` exhausted
- stale state is silence; satisfied subject is silence; both write the marker
- `SKIP` honoured, marker written
- quiet hours at both boundaries
- a `by` window that wraps midnight
- day mask excludes today
- `call:*` inert while the call log is unavailable
- `/app-state` and `/app-rules`: 401 without the token, 400 on an unreadable
  body, replacement not merge

Jest:

- `dayState` builder: missing place, absent alias, clock skew, empty journal
- `rules` presence matcher: group membership, an event before the last check,
  two events for one rule in a day
- `client.syncState` shape, and send-on-connect in the provider

## Deliberately not in v1

- **`READ_CALL_LOG`.** The operator's literal example. One native module, one
  build, and it bars the app from Play permanently — fine while sideloading, but
  it is the riskiest dependency on the list and it should land on an engine that
  has already proved itself.
- **A foreground service.** The reliable presence carrier, ~60s instead of
  0–15 minutes. Also fixes arrival detection and would make call-log rules
  dependable. Highest-leverage native work available; deferred until real use
  says the free path is not enough.
- **Learned rules.** NEXT.md §7. Same engine, baseline-written rules, needs two
  to four weeks of journal before "unusual" means anything.
- **Rule editing.** Delete and re-declare. Editing a parsed rule in a form
  means building the form this design deliberately avoided.
