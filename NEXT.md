# What to build next

> Written 2026-08-19, rewritten 2026-08-20 evening when four of its items had
> shipped and the queue had stopped matching the code. `RESUME.md` is the state
> of the world; this is the queue.

**Read first:** anything JavaScript-only ships over the air —
`eas update --branch production --environment production --platform android`.
Anything touching native (a permission, a module, a dependency) needs a build and
an install, and the fingerprint runtime version enforces that automatically.

---

## Done since this file was written

Kept as a list rather than deleted, because "is this built?" was costing a
codebase read each time.

| | Where | Proved |
| --- | --- | --- |
| Three bouncing dots in the tab bar | `navigation/GlassTabBar.tsx:501` | on device |
| Notification tap opens Chat | `navigationRef`, `JarvisProvider.tsx:867` | on device |
| Read / unread in the Activity sheet | `markAlertsRead`, `HomeScreen.tsx:94` | on device |
| Markdown rendered, not shown as asterisks | `lib/rich.ts`, `<RichText>` | on device |
| Photo preview + caption before sending | Chat screen | on device |
| Replies arrive word by word | `TypeLine` | on device |
| `<think>` monologues can never reach the screen | `_strip_reasoning()` in `_complete()` | harness, standalone |
| The briefing moved off the phone to a gateway push | `cloud_gateway.py` + `/app-commute` | **delivery unproved until tonight** |
| One assistant across desk, phone and Telegram | `_memory_key` | on device |
| He speaks first, at most once a day | `_nudge_tick` | not yet observed |
| A photo replying with its own `[[LOOKUP:]]` marker | `_resolve_markers`, shared by `think()` and `see()` | on device |
| Deploy-durable gateway state | `gateway_state` table, `_restore_state()` | **branch, not merged** |

---

## The two things owed before anything new

### `run_harnesses.py` on the desk

Never run. Expect **81 + 4 `/app-commute` + 8 reasoning-leak + 17 vision-marker
+ 17 durable-state**. Four days of gateway work has never been executed by a
Python interpreter that had the real imports — the laptop has no Python, and the
standalone checks cover logic, not imports. A `_load_commute()_load_commute()`
SyntaxError already slipped through once and was caught by reading.

### Merge `fix/durable-state`

Committed and pushed, deliberately NOT deployed: pushing it would have wiped the
state it exists to protect, 25 minutes before the first briefing was due. Merge
into `feat/cloud-gateway` after tonight's window, or after the harnesses pass.

---

## Next to build, in this order

### 1. Declared rules — **spec written, awaiting approval**

`docs/superpowers/specs/2026-08-20-declared-rules-design.md`. Things asked for
out loud and then evaluated in code, never re-judged by a model each tick.

Two shapes, and they do not share an evaluator:

- **absence** — "tell me if I haven't called mom by 7." A clock question, so the
  gateway owns it. The phone cannot be trusted to wake; see the measurement
  below.
- **presence** — "when I open Swiggy, tell me what I can eat." A phone question,
  carried by the background task that already runs. 0–15 minutes and sometimes
  missed, accepted for v1.

He **asks rather than asserts** — "did you get a chance to call your mother?" —
because the phone's information can be stale and a question is true either way. A
redundant question costs a shrug; a confident false accusation is what teaches
someone to mute an assistant.

`call:*` is the one subject v1 cannot observe: `READ_CALL_LOG` is a native module
and a build. Specified in the schema so nothing changes when it lands.

**Blocked on:** nothing but review. Ships over the air, no native code.

### 2. Sent / delivered / read ticks — **NOT OTA**

The phone knows **sent**. Only the gateway can say **delivered** and **read**, and
it says neither. Needs a protocol addition on both sides: an id on each outgoing
ask echoed back, a frame when the answer is written to a socket, another when the
app reports the chat on screen. `ChatEntry` grows a state; the chat renders ticks.

Pure polish — it adds no capability. Listed second because it is the largest
remaining thing that is fully specified.

### 3. The journal's other three sources

- **Location timeline** — arrival and departure at named places. The prerequisite
  for anything that reacts to *where he is*, and for the learned version of §1.
- **Call log** (`READ_CALL_LOG`) — the literal rule asked for. Native, one build,
  and it bars the app from Play permanently. Fine while sideloading.
- **Archive import** — Google Takeout, Meta DYI. Years of history in one file.

### 4. The weekly portrait

Batch analysis over the journal. No new permission. **Wait for data** — the facts
pipe starts speaking after 7 completed days and this wants more.

### 5. Anticipation

The thing actually asked for at the start. Needs §3 and §4 beneath it, and two to
four weeks of baseline before "unusual" means anything. §1's declared rules are
the same trigger machinery with the rule written by hand instead of learned, which
is why they come first.

---

## Omnipresence — its own track, deliberately not scheduled

Asked for on 2026-08-20: whether he can be always-present on the device. He can,
substantially, and sideloading removes the only real gate.

| Mechanism | What it gives | Battery | Cost |
| --- | --- | --- | --- |
| `NotificationListenerService` | every notification from every app, live | ~free, event-driven | Play-fatal, one build |
| `BOOT_COMPLETED` receiver | survives reboot | free | none |
| SMS receiver (`RECEIVE_SMS`) | wakes the app **from dead** | ~free | Play-fatal |
| Foreground service | process always alive | real, measurable | permanent notification |
| `ACCESS_BACKGROUND_LOCATION` | continuous place awareness | significant | needs the service |
| `AccessibilityService` | every window, every string on screen | low | maximum invasiveness |

**Best value is not the obvious one.** `NotificationListenerService` is
event-driven, costs nearly no battery, and delivers more context than polling ever
will — the message, the offer, the debit, the missed call. Ahead of the foreground
service, and well ahead of accessibility.

**This is a data-handling problem before it is an Android problem.** A
notification listener sees OTPs, balances and private messages; an accessibility
service can read a banking app's screen. Before any of it exists:

- **raw never leaves the phone** — not notification text, not screen content, not
  SMS bodies, not call rows. Only derived facts: booleans, counts, aliases;
- **never logged**, not even truncated. A log line is a permanent copy in someone
  else's system;
- **one credential is too few.** `APP_TOKEN` currently gates the socket, push
  registration, `/app-commute` and `/app-state` alike. A token that can register a
  push and a token that can read your day should not be the same string. Split it
  **before** the listeners, not after;
- **OTP and financial content: dropped at the point of capture.**

The Android work is a weekend. The part where a compromised token does not expose
someone's entire life is the actual work. Needs its own spec.

---

## Smaller, owed, and not features

- **The journal's denial path has never been run.** Settings → Journal → Usage
  access → off → return. It must say *"I cannot see your usage"* and never
  *"Nothing recorded"*.
- **Voice output** (`expo-speech`) — native, one build. The rule worth keeping:
  **he speaks when you spoke, and stays quiet when you typed.**
- **`LLM_PROVIDER_VISION=gemini` is dashboard-only**, undeclared in
  `render.yaml` — the trap that file's own comments warn about. Either declare it
  or set vision to `groq`.
- **`surface="desk"` is unreachable.** A linked desk answers with its own brain, so
  `think()` is never called there. Harmless, and not doing work.
- **The window label prints whole hours**, so a 6:30 PM departure reads
  `(6 PM–9 PM)`. Inherited from `hourLabel(d.hour)`, which ignores minutes. Left
  matched on both sides rather than fixed on one.

---

## ANSWERED 2026-08-20: the briefing cannot fire on its own — moved to a push

> **Status:** diagnosed, built, deployed, and **delivery still unproved** — the
> first push-scheduled briefing is due tonight, 7:00–7:20 PM. Everything below is
> the measurement that got us here. Keep it: it is the reason the design changed,
> and it is what tells the presence half of §1 what it can expect.

The hypothesis this section used to carry — a throttled job overrunning its time
budget — is **wrong**. The 08-19 reordering fix worked; the quota was never what
was left.

Read from the device, uid `10495`, before the app was opened:

```
timeout-reg:   countLimit=3,  countInWindow=0
timeout-total: countLimit=10, countInWindow=0
UID: 10495; Network: 108 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)
UidStats{uid=10495 #run=0 #netAvail=0 #reg=0}
standby bucket: 40   (RARE)
```

`countInWindow=0` on both quotas closes the throttle theory. `#netAvail=0` opens
the real one: **network has never once been available to this task.**

`expo-background-task` hardcodes the constraint that makes that fatal —
`BackgroundTaskScheduler.kt:108`:

```kotlin
.setRequiredNetworkType(NetworkType.CONNECTED)
```

Not configurable, and applied to every run. So the work sits `ENQUEUED` on a
constraint Android will not satisfy for a RARE-bucket app in the background. It is
not deferred; it is stopped.

### Caught in the act

Logcat, launching the app cold at 10:20:45:

```
10:20:45.316  BackgroundTaskWork: doWork: Running worker
10:20:45.339  runTasks: com.mypersonalintelligence.jarvis
10:20:47.409  Finished task 'jarvis-commute-briefing'
10:20:47.411  Enqueuing worker ... '15' minutes delay
```

The blocked job ran **200 ms after launch** — the moment the process came up and
the network restriction lifted — then queued the next one for a window it will be
blocked in again. The standby bucket read `40` before that launch and `10` after.

**This is the whole symptom.** "The briefing arrives once the app is opened" is not
Android being late. It is the app being the only thing that can unblock it.

### Why this measurement inverts for presence triggers

The briefing failed because it had to run while the phone sat idle in a pocket:
RARE bucket, network denied. A **presence** trigger — §1's Swiggy case — happens
while the phone is in a hand: screen on, network up, and the bucket observed at
`10` rather than `40` immediately after a launch. Those are precisely the
conditions under which that blocked job unblocks.

Plausible, not dependable: WorkManager's periodic floor is 15 minutes, so a
four-minute browse can fall between runs. That is the trade §1 accepts for v1, and
the foreground service is the known upgrade if real use says it is not enough.

**Worth trying, because it is free:** this is a Xiaomi/MIUI device
(`com.miui.analytics` in the same dump). MIUI adds Autostart and its own per-app
battery policy on top of AOSP. Autostart on, battery *No restrictions*, then leave
it overnight. It may lift the bucket off RARE. It will not make the timing
dependable, so it is a measurement, not the fix.

Either way the rule this cost us stands: **every state must name itself.** The
briefing that never ran and the briefing that ran and found nothing to say were
indistinguishable from outside, and that is what let a wrong hypothesis stand for
a day. The same failure shape produced the deploy that silently disarmed the
briefing twice on 2026-08-20 — which is why `/health` now carries
`memory.state_durable`.

---

## Traps that have already cost time

- **Render's disk is wiped on every DEPLOY, not every restart.** Which is why file
  persistence read as working for a week. Anything the gateway must not lose goes
  in Postgres — see `gateway_state`.
- **A recovery gated on a WebSocket is not a recovery.** The phone re-uploads its
  schedule on `link.status === 'open'`, but a photo answers over plain HTTP — so
  the app can look connected while the gateway can reach nobody by push.
- **`.gitignore` is a fingerprint input.** Editing it changes the runtime version
  and orphans every installed build — updates publish fine and can never arrive.
  Rebuild after touching it.
- **EAS environments are separate from `.env.local`.** A variable added to one
  needs adding to the other, or the published bundle is missing it.
- **A channel must exist and be linked to its branch** or the app asks and gets
  nothing, silently. `eas channel:list` should not be empty.
- **`expo prebuild --clean` wipes `android/`**, including any APK waiting to be
  installed. Finished APKs are parked in `builds/`.
- **`console.log` goes to Metro, not logcat**, on bridgeless React Native.
- **The app lock re-locks on every background**, so UI automation cannot get back
  in — the biometric prompt needs a finger.
- **Android drops a notification sent to a channel that does not exist.** The
  gateway asks the phone for its channel names rather than assuming them; keep it
  that way.
- **A shared persona teaches markers to every leg that uses it.** `see()` used the
  persona that documents `[[LOOKUP:]]` without the code that acts on it, and
  printed the marker. A new call to a model that uses `_PERSONA` needs
  `_resolve_markers` too.
- **No Python on the laptop.** Every gateway change made there is unrun. The
  standalone-copy checks cover logic, never imports.
