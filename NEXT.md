now should # What to build next

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

### 4a. Markdown arrives as literal asterisks — **OTA**

Seen on the device 2026-08-20, in a reply from 08:29 that had been sitting in the
chat unremarked:

    • **10 mins**: Warm-up (dynamic stretches, jumping jacks)
    • **35 mins**: Full-body strength (bodyweight squats, dumbbell press)

The model writes markdown and the bubble is a plain `<Text>` —
`ChatScreen.tsx:588`, `{entry.text}` straight through. So every list, every bold
figure and every bit of code the brain emits arrives with its punctuation showing.

**Render it; do not strip it.** Two options and the choice is not close. Telling
the persona "no markdown" fights a habit the model will keep reaching for, and it
throws away the structure that makes a workout list or a set of steps readable —
the asterisks are ugly, but the thing they mark up is genuinely a list. Rendering
keeps the meaning and fixes the appearance.

**A deliberately small subset**, because a full markdown engine in a chat bubble
is a dependency and a new class of layout bug:

- `**bold**` and `*italic*`
- `` `code` `` inline, monospace, and fenced blocks — the brain quotes commands
- `- ` and `* ` and `1. ` bullets, one level, no nesting
- nothing else. No tables, no links, no headings, no images. If one turns up
  looking bad, add it then.

Where it goes: one `<RichText>` in `src/components/ui/` that parses to
`<Text>` spans, replacing line 588. Nothing else in the app needs it, and keeping
it out of `Atoms.tsx` keeps a chat concern from becoming a global one.

**Worth getting right, because a naive parser gets these wrong:**

- **Do not break the accessibility label.** `ChatScreen.tsx:577` reads
  `entry.text` for the screen reader. It should keep reading the *plain* text, not
  the marked-up source and not the parsed tree.
- **Selection must survive.** The bubble is selectable today; a tree of nested
  `<Text>` keeps that only if the parent stays one `<Text>`, not a `<View>` of
  `<Text>`s.
- **Unmatched punctuation is not markup.** "5*3" and "he said *what*" and a lone
  trailing asterisk all have to come out as themselves. A greedy regex turns
  arithmetic into italics.
- **A fenced block must scroll horizontally**, not wrap a command across four
  lines and not push the bubble past the screen.
- **The typing indicator and `TypeLine` feed the same string.** Whatever parses
  has to tolerate a half-arrived token without throwing on every frame.

Cheap, visible, and it makes every list the brain has ever sent readable
retroactively — the chat re-renders from stored text.

---

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

## ANSWERED 2026-08-20: the briefing cannot fire on its own — moved to a push

> **Status:** diagnosed, and both halves built the same day. The phone sends the
> schedule; the gateway sends the briefing. **Not run, not deployed** — no Python
> on the laptop. The test that closes it is one evening with the phone untouched.
> Everything below is the measurement that got us here. Keep it: it is the reason
> the design changed.

The question this section used to ask is answered. It was the wrong question, and
the hypothesis under it — a throttled job overrunning its time budget — is
**wrong**. The 08-19 reordering fix worked; the quota was never what was left.

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
constraint Android will not satisfy for a RARE-bucket app in the background. It
is not deferred; it is stopped.

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

**This is the whole symptom.** "The briefing arrives once the app is opened" is
not Android being late. It is the app being the only thing that can unblock it.

### So the local briefing is the wrong shape, and push is the right one

Three things the briefing needs, and Android denies all three to a backgrounded
app in this bucket: a timely wake, a network read, and the process alive to post.
A high-priority FCM push is exempt from exactly those restrictions, and the
gateway's push path is already proved on this phone — `priority: "high"` with a
per-phone `channelId`, `cloud_gateway.py:1663`.

**Move the briefing to the gateway.** It needs:

1. An endpoint the phone posts its `CommuteSettings` to, with each departure's
   coordinates already resolved and its timezone — the gateway currently knows
   nothing about commutes, places or weather.
2. A scheduler beside the existing startup tasks (`cloud_gateway.py:3158`).
3. The Open-Meteo read moved server-side, then `_push_all(kind="general",
   data={"kind": "commute", ...})`.
4. `APP_PUSH_MIN_GAP_SECS` accounted for — the quiet gap in `_push_all` will
   swallow a briefing that lands behind an unrelated push. It needs `force` or a
   bucket of its own.

Keep the local task as a fallback and keep `previewBriefing` exactly as it is.

**Worth trying first, because it is free:** this is a Xiaomi/MIUI device
(`com.miui.analytics` in the same dump). MIUI adds Autostart and its own per-app
battery policy on top of AOSP. Autostart on, battery set to *No restrictions*,
then leave it overnight. It may lift the bucket off RARE. It will not make the
timing dependable, so it is a measurement, not the fix.

Either way the rule this cost us stands: **every state must name itself.** The
briefing that never ran and the briefing that ran and found nothing to say were
indistinguishable from outside, and that is what let a wrong hypothesis stand for
a day.

---

## Owed, small, and not features

- **`run_harnesses.py` with the venv on the desk.** Expect **81**. Several
  gateway commits have never been run against it. If `/app-link` starts refusing
  connections, revert `7cf6bc1` first and ask questions after.
- **Job quota: confirmed clean, stop watching it.** Measured 2026-08-20 —
  `countInWindow=0` on both `timeout-reg` and `timeout-total`. The ordering fix
  (briefing before journal) held. What blocks the briefing is the network
  constraint, not the quota; see the measured section above.
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
