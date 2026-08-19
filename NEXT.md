# What to build next

> Written 2026-08-19. Ordered by what is worth doing, not by size.
> `RESUME.md` is the state of the world; this is the queue.

**Read first:** anything JavaScript-only ships over the air now —
`eas update --branch production --environment production --platform android`.
Anything touching native (a permission, a module, a dependency) needs a build
and an install, and the fingerprint runtime version enforces that automatically.

---

## Asked for, and specified enough to start

### 1. Bouncing dots in the tab bar — **OTA**

The Chat tab already shows a single pulsing dot while `hud.status === 'thinking'`
(`GlassTabBar.tsx`, the `pulse` shared value). Wanted: **three dots that bounce**,
matching the in-chat typing indicator.

Constraint from `AGENTS.md`: **no default parameters inside a worklet** — the
closure is built from identifiers in the body, so a default compiles, passes
jest, and throws once per frame on the UI thread.

### 2. Tapping a reply notification opens Chat — **OTA**

`onPushReply` already reads the payload; nothing navigates. Needs a navigation
ref (`createNavigationContainerRef`) exposed from `RootNavigator`, because the
provider that receives the notification sits above the navigator.

Careful: a tap while the app is cold must land on Chat *after* the navigator has
mounted, not before.

### 3. Read / unread in the notification sheet — **OTA, needs one decision**

`alertsUnread` and `markAlertsRead` already exist in `JarvisProvider`. **Which
sheet is meant** — the in-app Activity sheet (the bell), or Android's shade? If
the former, this is presentation only.

### 4. WhatsApp-style sent / delivered / read — **NOT OTA**

The phone knows **sent**. Only the gateway can say **delivered** and **read**, and
it currently says neither, so this needs a protocol addition on both sides:

- an id on each outgoing ask, echoed back
- a frame from the gateway when the answer is written to a socket (delivered)
- and one when the app reports the chat on screen (read)

`ChatEntry` then grows a state, and the chat renders ticks. Do this as its own
piece — it is the largest thing on this list.

---

## The journal, which is already collecting

### 5. Piece 1b — the other three sources

- **Location timeline** — arrival and departure at named places. The prerequisite
  for anything that reacts to *where he is*.
- **Call log** (`READ_CALL_LOG`) — needed for "you reached the office and have not
  called your mother". Play-restricted; irrelevant while sideloading.
- **Archive import** — Google Takeout, Meta DYI. Years of history in one file.

### 6. Piece 3 — the weekly portrait

Batch analysis over the journal. Needs no new permission. **Wait for data**: the
facts pipe starts speaking after 7 completed days, and this wants more.

### 7. Piece 4 — anticipation

The one actually asked for at the start. Needs 5 and 6 beneath it, and a baseline
of two to four weeks before "unusual" means anything.

**Shortcut worth taking first:** a *declared* rule — "tell me if I have not called
her by 7" — works the evening it is built and needs no baseline. Same trigger
machinery as the learned version.

---

## Tomorrow, first thing: did the briefing fire on its own?

**2026-08-19, 18:40** — the evening briefing arrived, but probably only after the
app was opened. That is the expected symptom of a throttled job: Android defers
it, and opening the app promotes the standby bucket enough for the pending work
to run. So the feature works; the timing was Android's decision.

The fix for the cause shipped the same evening — the briefing now runs BEFORE the
journal in that task, so it stops blowing the time budget — but the quota was
already spent for that window.

**The test is a weekday evening, phone untouched, app not opened.** If the
notification arrives near 19:00 by itself, this is closed. If it does not:

```
adb shell dumpsys jobscheduler | grep -A 4 jarvis
```

`timeout-reg` and `timeout-total` are the numbers that matter — they were at 13
against limits of 3 and 10. If they are climbing again, something in the task is
still overrunning.

The **preview button on the Places screen** runs the real briefing and posts the
real notification immediately, bypassing the scheduler. It is the way to separate
"the feature is broken" from "Android did not run it".

---

## Owed, small, and not features

- **`run_harnesses.py` with the venv on the desk.** Expect **81**. Several
  gateway commits have never been run against it. If `/app-link` starts refusing
  connections, revert `7cf6bc1` first and ask questions after.
- **Watch the job quota.** `adb shell dumpsys jobscheduler | grep -A4 jarvis` —
  `timeout-reg` and `timeout-total` had reached 13 against limits of 3 and 10,
  which throttles the briefing task entirely. The ordering fix (briefing before
  journal) should hold it down; confirm it does.
- **Name the Office in Settings → Places**, or the evening briefing has no
  coordinates to work from. A headless task cannot take a GPS fix.
- **The journal's denial path has never been run.** Settings → Journal → Usage
  access → turn it off → return. It must say *"I cannot see your usage"* and
  never *"Nothing recorded"*.
- **Voice output** (`expo-speech`) — deferred, native, one build. The rule worth
  keeping: **he speaks when you spoke, and stays quiet when you typed.**

---

## Traps that have already cost time

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
  gateway now asks the phone for its channel names rather than assuming them;
  keep it that way.
