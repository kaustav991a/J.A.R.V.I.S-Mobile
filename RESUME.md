# Resume point — jarvis-mobile

Branch: `feat/mobile-hud`. Written 2026-08-10, extended 2026-08-11, 2026-08-12 and
2026-08-13.

---

## START HERE on a fresh machine — 2026-08-14, evening

Two repos, both pushed. Clone them **side by side**, because the docs cross-refer:

```bash
git clone -b feat/mobile-hud     https://github.com/kaustav991a/J.A.R.V.I.S-Mobile.git jarvis-mobile
git clone -b feat/cloud-gateway  https://github.com/kaustav991a/J.A.R.V.I.S.git        jarvis-brain
cd jarvis-mobile && npm install
```

The gateway is **already deployed and live** on Render from `feat/cloud-gateway`, so
nothing needs running locally for the phone to work — only `npx expo start -c` if you
want to change the app.

### What is live right now

| Thing | State |
| --- | --- |
| Cloud brain | deployed, `/health` reports everything below |
| Persistent memory | Supabase (ap-south-1), `memory.ready: true` |
| Facts about him | 12 stored, `facts_known: 12`, survive restarts |
| Text brain | Groq `llama-3.3-70b-versatile` |
| Vision + voice | Gemini `gemini-3.5-flash` |
| Phone build on device | **debug** APK again as of 2026-08-18 — needs Metro and `adb reverse tcp:8081 tcp:8081`. The 08-17 standalone release build was replaced to get Fast Refresh back |

Check state with one call, which is the fastest way to know where you are:

```bash
curl -s https://jarvis-cloud-gateway.onrender.com/health | python -m json.tool
```

Read `brains.usage` for whether Gemini is answering or falling back to Groq, and
`memory` for whether anything is being remembered.

### Env that must exist on Render (values are in the dashboard, not here)

`APP_TOKEN`, `BRIDGE_SECRET`, `GROQ_API_KEYS`, `GEMINI_API_KEYS`, `DATABASE_URL`,
`TAVILY_API_KEY`, `PUBLIC_URL`, `LLM_PROVIDER_VISION=gemini`,
`LLM_PROVIDER_AUDIO=gemini`.

### The three things to do first

1. **Rotate `APP_TOKEN` and `BRIDGE_SECRET`.** Both passed through a chat transcript
   or Render's access log today. Rotating `APP_TOKEN` means re-pairing the phone
   (Connection → PAIRING TOKEN); the facts and history are in Supabase and survive it.
2. **Test the microphone.** `brains.usage.audio` is still `0`. It is the original
   complaint and holds the last unverified guess: the phone records m4a and Google
   documents `audio/aac` but not `audio/mp4`. A `fell_back` with
   `last_error_was_quota: false` means the mime type is wrong — a one-line fix.
3. **Bring the desk up once.** `has_desk_key: false`, and 39 cloud turns were already
   sealed and dropped for want of its public key. The sync machinery is complete on
   both sides; it needs one handshake.

### For a build you can carry

Today's APK is `assembleDebug`, which does **not** embed the JS bundle — it loads
from Metro over the network and will not run away from this machine. For a standalone
one: `cd android && ./gradlew assembleRelease` (release signs with the debug keystore,
so it builds locally), or `eas build -p android --profile preview`.

**After any `prebuild --clean`, restore `android/local.properties` and the 6144m
jvmargs in `android/gradle.properties`.** Prebuild resets jvmargs to 2048m and that
is documented here because it has cost time twice.

---

## ▶ RESUME POINT — 2026-08-19, end of day

**614 tests, 49 suites, `tsc --noEmit` clean. Both repos clean and pushed.**
Read `NEXT.md` for the queue; this is the state of the world.

| | |
| --- | --- |
| On the phone | release APK, **arm64-only, 48 MB**, fingerprint `ff3e7ae8` |
| Updates | **OTA is live** — JS ships without USB |
| jarvis-mobile | `feat/mobile-hud`, pushed |
| jarvis-brain | `feat/cloud-gateway`, pushed, deployed |

### What is proved on the device, not just green in jest

- **The chat round-trips.** `reply with the single word ACORN` → `ACORN, Sir.`
- **The link establishes in ~6s** and holds. It took three fixes to get there.
- **The journal holds 17,500 events and 360 day-totals**, with real app names.
- **The evening briefing fired** — though probably only once the app was opened,
  which is the throttled-job symptom. See `NEXT.md`, first item.
- **Push notifications arrive.** They had been addressed to `general`, a channel
  the app deleted eight renames ago, and Android was discarding every one.

### Bug C, finally closed, and it took four separate fixes

The pocketed reply survived three correct socket fixes because the last mile was
elsewhere. In order: the phone was not closing its socket on background; the
gateway was not noticing when it did; the app never consumed a pushed reply; and
**the push itself was addressed to a channel that did not exist**. Each fix was
necessary. Only the fourth made it work.

The gateway now asks the phone for its channel names rather than assuming them.
**Keep it that way** — the assumption is what rotted.

### The link took three fixes, and two were self-inflicted

Racing probes leaked sockets → a generation counter. The counter let the watchdog
cancel the probe it was waiting for → the watchdog leaves probes alone. That
guard read `status === 'probing'`, a label a superseded probe leaves behind, so
the machine could sit labelled probing with nothing running and never recover →
it guards on a real in-flight flag. All three found by the device, none by 614
tests.

### The shape that came up FIVE times today

An outcome that looks like progress: the mute briefing, the empty Vitals panel,
the silent Sync button, a refused handshake reporting "Connecting…", and a
silently applied OTA. **Every state must name itself.** Where that rule is now
enforced: `syncLine`, `describeUpdate`, `say()` in the journal digest, the
`denied` reading, and the sendCommand failure line.

### Built today, beyond the fixes

- **The phone journal**, pieces 1 and 2: a local SQLite record of how the phone
  is used, usage riding every question, and a facts pipe that **starts telling
  the gateway about him after 7 completed days** — automatically, no work needed.
- **The JARVIS voice** across every notification, with its rules written down.
- **An Updates screen and banner**, a version line in About and Settings.
- **OTA end to end**: fingerprint, EAS env vars, and a channel linked to a branch.

### First three things tomorrow

1. **Did the briefing fire unprompted?** Weekday evening, phone untouched.
   `NEXT.md` has the check and the preview-button shortcut.
2. **Set Home in Settings → Places** and switch the morning departure on. A
   headless task cannot take a GPS fix; a named place already has coordinates.
3. **`run_harnesses.py` with the venv on the desk.** Expect **81**. Several
   gateway commits have never been run against it.

---

## ▶ 2026-08-19, third session: the chat is VERIFIED, and the link took three fixes

**591 tests, `tsc --noEmit` clean.** Running on the phone: release build
`8cf9e12`, **arm64-only, 48 MB**, installed over the top with data intact.

### The chat works, proved end to end

```
You    · 16:38   reply with the single word ACORN
Jarvis · 16:39   ACORN, Sir.
```

Link establishes in **6 seconds** and holds. `apps_linked: 1` steady.

### The link needed three fixes, and the first two were mine

Each was correct and incomplete, and the device found every one:

1. Racing probes leaked sockets → **generation counter**.
2. The counter let the 5s watchdog **cancel the probe it was waiting for**, so on
   a cold host `connect()` was never reached → **the watchdog leaves probes
   alone**.
3. That guard read `status === 'probing'`, a label a superseded probe leaves
   behind. The machine could sit labelled 'probing' with nothing in flight and
   the watchdog would decline to rescue it **forever** → **it guards on a real
   in-flight flag**.

Also: a refused handshake (**gateway 403s a bad token** — confirmed from the
laptop) fires `onerror` and often no `onclose` on Android, and `onerror` only
recorded `lastError`. So a refusal displayed as "Connecting…". It reports
`closed` now, which is also what the watchdog looks for.

### The one open question: replies are slow

The ACORN round trip took about a minute. **Ruled out by measurement:**

| Suspect | Verdict |
| --- | --- |
| cold gateway | no — `/health` in 0.31s, UptimeRobot warm |
| model fallback | no — `gemini_ok: 5, fell_back: 0` |
| quota | no — `last_error_was_quota: false` |

So it is delivery, not thinking. **Prime suspect: the REST fallback.**
`sendCommand` uses `api.backdoor()` whenever `link.send()` returns false, and the
answer then has to find a socket that may be re-dialling. Worth tracing next.

### Build economics, fixed

`reactNativeArchitectures=arm64-v8a` via `plugins/withArm64Only.js` — a plugin,
because `prebuild` regenerates `gradle.properties` and the setting would silently
revert. **Clean build 7 min / 107 MB → incremental 46 s / 48 MB.**

### OTA is configured but not yet used

`expo-updates` installed, `updates.url` for project `f047fd2e-…`, and
**`runtimeVersion: fingerprint`** — chosen over `appVersion` because this app has
a local native module and fingerprint is what stops a JS update landing on a
build whose native side does not match.

**Owed: `eas login` once**, then `eas update --branch production` ships JS with no
USB. Native changes still need a build.

`expo-updates` is mocked in `jest-setup.js`: installing it made the App smoke test
take **92 seconds** to mount and fail its 5s timeout: Expo checks for an update at
startup and, with no server reachable under jest, waits.

### Traps

- **`prebuild --clean` wipes `android/`**, taking any built APK with it. Finished
  APKs get parked in `builds/` (gitignored) for that reason.
- **UI automation cannot survive the app lock** — backgrounding re-locks, and the
  biometric prompt needs a finger. Tab and SEND bounds also shift between dumps,
  so taps land on the wrong control; `uiautomator` reporting
  `could not get idle state` means the bounds just read are stale.

---

## ▶ 2026-08-19, second session: connecting forever, and OTA

**572 tests, `tsc --noEmit` clean.** Release APK is what runs on the phone now —
installed over the debug build, same debug keystore, so SecureStore and the
journal survived intact.

### Two connection bugs, and I caused one of them

1. **The watchdog was cancelling the probe it was waiting for.** `lastFrameAt` is
   null until something connects, so `quietFor` is Infinity and `tick()` fires on
   every pass. That was always true and always harmless — a redundant probe
   simply raced the first to `connect()`. The generation counter added the same
   morning made the redundant probe **cancel** the first instead, so with
   `chooseMode` slower than one 5s tick on a cold host, `connect()` was never
   reached at all. Both changes are individually right; `tick()` now leaves an
   in-flight probe alone. **A probe owns the next connection, and interrupting
   one is not a retry, it is a restart.**
2. **A refused handshake reported "connecting".** The gateway answers **403** to
   a wrong or missing pairing token — verified from the laptop, where an
   unauthenticated dial to `/app-link` returns exactly that. On Android that
   fires `onerror` and does **not** reliably fire `onclose`, and `onerror` only
   recorded `lastError`. So the machine sat on `connecting` and the screen
   promised it was still trying while the far end had already said no. An error
   before the socket ever opened is a refusal now: status goes to `closed`,
   which is also what the watchdog looks for.

**That is the fourth outcome-that-looks-like-progress this project has paid for**
— the mute briefing, the empty Vitals panel, the silent Sync button, and now a
refusal dressed as a connection attempt.

### The token is the open question

`/health` is healthy and `app_link: true`. The gateway 403s an unauthenticated
dial, which is correct. So the phone's stored token is the suspect: take
`APP_TOKEN` from Render's Environment tab and paste it into **Connection →
Pairing token → Save & reconnect**. If that is not it, the new build now SAYS
refused rather than hiding it.

**`http://127.0.0.1:8787` is the stored desk address** — localhost on the phone,
so the LAN probe can never succeed. Harmless (it fails fast and falls through to
cloud) but meaningless. Point it at the real desk IP or clear it.

### OTA is configured, and needs one login

`expo-updates` installed; `app.json` carries the `updates.url` for project
`f047fd2e-…` and **`runtimeVersion: { policy: "fingerprint" }`**. Fingerprint
rather than `appVersion` on purpose: this app carries a local native module, and
fingerprint is what guarantees a JS update can never land on a build whose native
side does not match it.

After this build is installed: `eas login` once, then `eas update --branch
production` ships JS without USB. **Native changes still need a real build** —
the usage-stats module, permissions, any new native dependency.

### Traps from this session

- **`expo prebuild --clean` wipes `android/`**, build outputs included. The APK
  you were about to install disappears with it.
- **The app lock re-locks on every background**, so UI automation that
  backgrounds the app cannot get back in — the biometric prompt needs a finger.
  It also means `apps_linked` drops while the prompt is up, which is correct and
  looks alarming.

---

## ▶ 2026-08-19, late: the journal is VERIFIED ON THE DEVICE

**536 tests, 45 suites, `tsc --noEmit` clean — and, unlike everything above this
line, the journal has actually run on the phone.** Measured, not inferred:

```
digest: 5h 32m on the phone, sir, across 38 pickups.
        Gmail 2h 12m, eFootball™ 1h 25m, Facebook 26m.
sync:   {"state":"ok","events":17530,"daily":360}
```

A cold sync from an empty database writes **17,530 events and 360 day-totals in
one pass**, and the database is about 1.8 MB.

### What the device found that 536 green tests never could

Four defects, all in the same afternoon, none reachable from jest.

1. **A commit per row.** Every `runAsync` is a bridge round-trip AND its own
   implicit transaction, so each row cost an fsync. The first sync was 5,250 rows
   in and still climbing after minutes. Now chunked — 200 rows per statement,
   inside one transaction.
2. **A prepared statement inside `withTransactionAsync` hung the app outright.**
   No error, no log past `permission: granted`, database left at 63 bytes.
   Multi-row `VALUES` avoids prepared statements entirely and is fewer
   round-trips than one anyway.
3. **Concurrent syncs.** Three triggers by design — screen, manual button,
   background task — and nothing serialised them. Two transactions on one
   database gave `cannot start a transaction within a transaction`. Syncs now
   queue process-wide, and `openJournal` caches one connection per file.
4. **Package visibility.** Android 11 made it opt-in, so `getApplicationInfo`
   throws for third-party packages: 86 asked about, **36 named**. The digest read
   `Gm 2h 12m, Pesam 1h 25m, Katana 26m` — Gmail, eFootball, Facebook. Fixed with
   a `<queries>` MAIN/LAUNCHER block via `plugins/withPackageQueries.js`, not
   `QUERY_ALL_PACKAGES`. **The figures were never affected** — `UsageStatsManager`
   is a system service and visibility filtering does not touch it.

### And one claim of mine that was simply wrong

I said a first launch arrives with **months** of history. It arrives with about
**ten days**. Android keeps four SEPARATE aggregates — daily 7 days, weekly 4
weeks, monthly 6 months, yearly 2 years — and only the daily one is per-day.
Measured on this phone: **10 days of daily buckets, exactly 7 days of events.**

That sharpens what this piece is for rather than shrinking it. **The journal's
job is keeping what Android throws away after a week.** Depth is earned by
running it. It also makes the background leg load-bearing rather than an
optimisation: miss more than a week and those days are gone for good.

### Traps for whoever works on this next

- **Do not delete the database out from under a running app.** It leaves a hot
  `jarvis-journal.db-journal` and every open after that fails with
  `database is locked`. Force-stop first, then delete BOTH files. One "bug" this
  afternoon was entirely this.
- **`console.log` goes to Metro, not `logcat`**, on bridgeless RN. Reading
  logcat for JS output wastes ten minutes.
- **Metro dies during `expo run:android`** and sometimes leaves a hung node
  process holding 8081 that answers nothing. Kill it by PID and restart.
- **`adb shell input tap` is refused on this phone** — MIUI wants "USB debugging
  (Security settings)" enabled separately. UI automation is not available; the
  screen has to be driven by hand.
- **Git Bash rewrites `/sdcard/...`** into `/Files/Git/sdcard/...`. Use the
  PowerShell tool for `adb shell` paths.

### Still unverified — ONE ROW, and it is the important one

**The denial path has never been run on the device.** Revoke usage access, return
to the Journal screen, refresh: it must say *"I cannot see your usage"* and never
*"Nothing recorded"*. Deferred 2026-08-19 because the grant was hard to find in
MIUI's Settings — so the screen now carries a **Usage access** row even while
access is granted, which is the only state in which finding it matters. Tap that,
switch it off, come back.

Everything else on this screen has been seen working on the phone: the digest,
the counts, Sync now, and the line that says what the last sync did.

---

## ▶ 2026-08-19, evening: the phone journal — piece 1 is built

**527 tests, 45 suites, `tsc --noEmit` clean.** New subsystem, and the first of
four pieces towards J.A.R.V.I.S. knowing him from having watched rather than
from having been told.

Read `docs/superpowers/specs/2026-08-19-phone-journal-design.md` first, then
`docs/superpowers/plans/2026-08-19-phone-journal.md`.

### What exists now

| Layer | File | What |
| --- | --- | --- |
| native | `modules/usage-stats/` | a local Expo module, Android only, ~120 lines of Kotlin |
| store | `src/lib/journal/store.ts` | `expo-sqlite`. Every SQL statement in the app is in this one file |
| words | `src/lib/journal/digest.ts` | pure functions; a day in J.A.R.V.I.S.'s voice |
| source | `src/lib/journal/source.ts` | the `UsageSource` interface, and the fake everything above is tested against |
| sync | `src/lib/journal/sync.ts` | watermarks, overlap, four outcomes |
| screen | `src/screens/JournalScreen.tsx` | Settings → Journal |

### The decisions worth not relitigating

- **Phone-only storage.** Raw rows never leave the device. What travels later is
  a summary, which is the shape the ask envelope already uses for location.
- **Our own native module**, not `@brighthustle/react-native-usage-stats-manager`
  — last published two years ago, and a stale old-arch bridge against Expo 57 is
  precisely the trap `AGENTS.md` names as this project's costliest recurring bug.
- **Nothing is collected.** Android records usage whether an app asks or not;
  every call here reads what the system already wrote. That is why the journal
  costs no battery, and it is why the collector can be lazy — every query is
  retroactive inside its window, so a missed run costs nothing.
- **Two tables, two fidelities.** Events are precise and Android keeps ~7 days;
  daily buckets are coarse and it keeps up to 2 years. **A first launch is not a
  blank slate** — it is months of history arriving at once.
- **No launch count.** `UsageStats.mLaunchCount` is hidden API with no public
  getter. Pickups come from `KEYGUARD_HIDDEN` instead — an app arriving in front
  while the phone is already in your hand is not a pickup.

### Two traps this cost, both worth more than the fix

1. **SQLite treats two NULLs as DISTINCT inside a primary key.** While `app` was
   nullable, every unlock re-inserted itself on each overlapping sync — one copy
   per run, forever, with the pickup count climbing by however often the app was
   opened. The store's own test missed it (two different timestamps); the sync
   tests caught it. `app` is `NOT NULL DEFAULT ''` now, translated at the store
   boundary so nothing above has to know.
2. **jest-expo automocks expo-sqlite's native side**, so `NativeDatabase` is not
   a constructor and every query throws. Mocking the *store* would have thrown
   away the only thing worth testing. **Node 24 ships `node:sqlite`**, so
   `jest-setup.js` maps expo's async surface onto it — real SQL, no new
   dependency. Reuse that adapter rather than reinventing it.

### The device checklist is the other half

None of the above is proved by a green suite. The Kotlin, the AppOps permission
check and the Settings grant have no jest coverage and are not claimed to. The
checklist at the bottom of the plan is what covers them.

### What is NOT built, and the order it comes in

| # | Piece | Gives |
| --- | --- | --- |
| 1b | notifications, location timeline, archive import | the other three sources |
| 2 | recall layer | answers about the past, colours every reply, and the send-and-confirm queue to the gateway |
| 3 | pattern layer | the weekly portrait |
| 4 | anticipation | speaks first — and needs 2–4 weeks of collection before "unusual" means anything |

**Sharing with the desk is piece 2, and the pipe already exists**: `POST /app-fact`
on the gateway, `api.remember()` in the app, facts into Postgres and into every
system prompt. What it still needs is an unacknowledged-and-resend queue owned by
the phone, because the gateway's outbox lives in process RAM and a Render restart
has already destroyed the desk key and 26 sealed turns.

---

## ▶ 2026-08-19, fourth pass: the app lock, and one flag doing two jobs

**487 tests, 40 suites, `tsc --noEmit` clean.** Third audit slice —
`security/AuthProvider.tsx` and `lib/biometrics.ts`, 525 lines. **`biometrics.ts`
came out clean**: the always-`strong` rule, the synchronous-throw guard, the
`Array.isArray` defence and the 90s race are all correct as written.

Everything found was the same mechanism: `authing` was one boolean, and three
different things raise it.

1. **A hold nobody released disabled the app lock permanently.** `holdGate(true)`
   with no matching `false` — one missing `try/finally` away at every call site —
   left the flag up for the life of the process. Every departure after that
   returned early and `setLocked(true)` was never reached again, with nothing on
   screen saying the lock was off. There is a **`HOLD_CEILING_MS` (5 min)** now,
   and `try/finally` at both `ChatScreen` call sites.
2. **Overlapping holds released each other.** The camera's settle timer cleared
   the flag while the microphone permission dialog was still up — so the answer to
   "may I record" was a fingerprint prompt over the top of it, which is the loop
   `holdGate` exists to prevent. `holds` is a counter now, and the settle only
   fires when the last holder lets go.
3. **A toggle that could not be moved.** With no biometric and no passcode,
   `setAppLock(false)` asked for a prompt nothing could answer. The gate is
   already inert in that state, so it just switches off.

### A test trap worth knowing, cost about half an hour

**`act(() => ...)` synchronously does not flush in RNTL 14.** A `holdGate` called
inside a bare `act()` appeared to run — the code executed, the logs proved it —
and the state assertion afterwards still read the old value. Every one of these
must be `await act(async () => { ... })`. The failure looks exactly like a broken
implementation, and the implementation was fine.

---

## ▶ 2026-08-19, third pass: the reducer, the frames and the notifications

**485 tests, 40 suites, `tsc --noEmit` clean.** Second audit slice — `ws/frames.ts`,
`state/hudReducer.ts`, `lib/notify.ts`, about 1,030 lines. Four found, four fixed.

| # | Where | What it was |
| --- | --- | --- |
| 1 | `hudReducer.ts` `upsertParked` | an approval card lost the description of what it was approving |
| 2 | `JarvisProvider.tsx` + `WatchAlertScreen.tsx` | the desk-watch alert was silent while the app was open |
| 3 | `hudReducer.ts` `intruder_resolved` | a stale resolution announced itself over a live alert |
| 4 | `hudReducer.ts` `hydrate` | two turns sharing a millisecond, one dropped on relaunch |

### 1. Park-then-ask blanked the card

`agent_confirm` carries only an action — no goal, no detail, no risk — and the
branch built a whole `ParkedAction` with those three as empty strings, which
`upsertParked` then spread over the existing entry. A parked action that arrived
with a full description was wiped at the moment the user was asked to approve it.
The patch is `Partial` now, and only what a frame actually said is merged.

### 2. The one alert that must be heard was the one that opted out

`installHandler` answers `shouldPlaySound: false` for anything not carrying
`preview` or `alertWhenOpen`, and **on Android that flag is the vibration switch
too**. The desk-watch notification set neither, so with the app foregrounded it
landed in complete silence; `WatchAlertScreen` fired haptics only inside
`answer()`, never on appearance. Screen fully covered, nothing to tell you to look.

Both halves fixed: `alertWhenOpen: true` in the watch payload, and one
`haptic.bad()` keyed on the alert id when the screen mounts.

### 3. The log contradicted the screen

`intruder` was guarded against a resolution for another id; the chat line and the
trace entry were not. A late resolution wrote "Desk locked" while the live alert
was still counting. A stale resolution is now a no-op in full.

### 4. `hydrate` keyed on (from, at)

Two different turns from the same side in one millisecond collided and the
restored one was dropped. The key carries the text now.

### `frames.ts` came out clean

Every field is coerced, unknown types return null, and the three id spellings and
the `cpu_percent` naming trap are already handled. One thing to know rather than
fix: telemetry and weather parse **only** under `status: 'sync'` — a bare
`type: 'telemetry'` is dropped without a word.

### What has NOT been audited

`security/AuthProvider.tsx` and `lib/biometrics.ts` (525 lines, the app lock),
`api/client.ts`, `lib/place.ts`, `lib/vision.ts`, `lib/voice.ts`, and roughly 3,500
lines of screens and components. **Two audit slices have found eight bugs; assume
the rest holds more.**

---

## ▶ START HERE — 2026-08-19, later: four bugs found by audit, all four fixed

**478 tests, 40 suites, `tsc --noEmit` clean.** Two commits: `83914b9` (the JARVIS
voice) and the audit fixes above it. Nothing pushed yet at time of writing.

Two of these were the same failure wearing different clothes — a socket the gateway
still counts while nobody is holding it — which is exactly what `deliver()` on the
brain side now trusts before it decides a push is unnecessary. **The two repos are
still coupled; do not revert one alone.**

| # | Where | What it was |
| --- | --- | --- |
| 1 | `src/link/useLink.ts:405` | `background` only suspended when it arrived *straight* from `active` |
| 2 | `src/link/machine.ts` `reprobe()` | two probes in flight left the first socket open forever |
| 3 | `src/state/JarvisProvider.tsx` `sendCommand` | a message both paths refused vanished with no word |
| 4 | `src/link/machine.ts` `onclose` | the error explaining a close was discarded |

### 1. Android does not always go `active -> background`

A power-button press goes `active -> inactive -> background`. The handler asked for
the pair, so `lastAppState` was `'inactive'` when `background` landed, `leaving` was
false, and **`suspend()` never ran** — socket open, phone still counted, no push.
The 2026-08-18 pocketed-reply fix was bypassable from the day it shipped.

Now `lastAppState !== 'background'`: the state arrived at decides, not the step
before it. `inactive` still never suspends, which is what the blip guard is for.

### 2. Racing probes leaked a live socket each time

`reprobe()` tears down, then awaits `chooseMode()`. A second one entering during
that await tore down nothing — `socket` was already null — so both reached
`connect()` and the first was overwritten rather than closed. **This is a plausible
source of the historical `apps_linked: 4` for one phone.**

Fixed with a generation counter, bumped by `reprobe()`, `stop()` and `suspend()`.
The suspend bump matters on its own: the latch blocks `tick()`, but a probe already
awaiting is past every guard and would land afterwards, opening a socket for a
backgrounded app.

### 3. A message could vanish silently — the complaint, located

Socket shut *and* gateway unreachable meant `sendCommand` rejected into
`.catch(() => {})` at all four call sites, with the local echo already in the log.
The chat showed the question exactly as it looks while J.A.R.V.I.S. is thinking.
Now the failure is spoken, flat and without wit, same rule as `unavailable`.

### 4. The close had no reason attached

`onclose` nulled `this.socket`, so the `onerror` that follows failed `isCurrent()`
and `lastError` kept whatever it had. The Connection screen showed a dead link and
no cause. The reference is kept now; `teardown()` is what clears it.

### Still owed, unchanged by any of this

- **Bug C retest on the phone.** Fixes 1 and 2 make the gateway's view honest; only
  a real pocketed turn proves the pair works end to end.
- **`run_harnesses.py` against `15b8f72`** — no Python on this machine. Expect 81.
- **`GROQ_VISION_MODEL`** is set on Render but absent from `render.yaml`, so a
  Blueprint re-sync drops it. Only a real photo turn proves it took.

---

## ▶ START HERE — 2026-08-19: the wording is proven in the bundle, C is not yet retested

The four files from the 18th are **committed** now. What moved today:

| Thing | State |
| --- | --- |
| Butler wording in the served bundle | **verified** — all ten strings, one hit each |
| `464 tests`, `tsc --noEmit` | **green**, re-run on this machine |
| `GROQ_VISION_MODEL` on Render | **set by hand**, service back up |
| Bug C retest (pocketed reply) | **still not done** — needs the phone |
| `run_harnesses.py` against `15b8f72` | **still never run** — no Python on this machine |

### The bundle grep that said 0 was the grep, not Metro

`grep -c "is clear, sir"` on the served bundle returned **0** on the 18th and it was
never explained. It is explained now: a full fetch is **10.4 MB**, and every one of
the ten new butler strings is in it exactly once. Whatever the earlier command
measured, it was not a whole bundle — the download was truncated when `/tmp`
disappeared under it. **Use the scratchpad, and check the file size before believing
a zero.**

```bash
curl -s "http://localhost:8081/index.bundle?platform=android&dev=true" -o b.js
ls -l b.js        # ~10.4 MB. A short file makes every grep below meaningless.
grep -c "is clear, sir" b.js
```

### Still owed, and it needs the phone

**Retest C now that the gateway fix is deployed.** Every earlier failure of C predates
the 6:39 PM deploy on the 18th, so none of them tested the actual fix. Send a message
from Chat, leave the app entirely within a second or two, wait ~20s. `apps_linked`
must read 0 while away (that part is already measured).

### Owed on the desk, not reachable from here

**`run_harnesses.py` has never run against `15b8f72`.** `test_web_freshness.py`
(11 checks) is written and registered but **never executed** — this machine has no
Python at all. Expect 81 harnesses, not 80, and run it with the venv.

### `GROQ_VISION_MODEL` is set, and nothing proves it from outside

Set on Render by hand on 2026-08-19, service confirmed up. **`/health` does not print
the Groq vision model id** — `brains.vision` names the *provider*, not the model — so
the only proof is a real photo turn. Until someone sends one, bug 5 is *probably*
closed, not *known* closed.

It is dashboard-only: **`render.yaml` still has no `GROQ_VISION_MODEL` key**, so a
Blueprint re-sync will drop it silently. That is a jarvis-brain change, and it is owed.

### The redeploy cost what it always costs

`/health` straight after: `facts_known: 0`, `has_desk_key: false`,
`fact_outbox.depth: 0`, `desk_linked: false`. Expected — gateway memory lives in
process RAM — but it means **the desk has to re-pair** before sealed turns flow again.

### A standalone APK exists and is NOT installed

`android/app/build/outputs/apk/release/app-release.apk` — **44.9 MB**, arm64-only,
built in 2m 2s from the code above. Deliberately not installed: the phone still
carries the debug build, so Fast Refresh still works and the two checks above are
cheap. Installing it ends that and costs ~2 minutes of Gradle per JS change after.

### "Phone says connecting" was not a bug

The screen was off. Screen off → app backgrounded → `LinkMachine.suspend` closes the
socket on purpose → `apps_linked: 0`, and the wake re-probes. Measured the same
minute: Render `/health` answers in **0.34–0.41s** and the LAN probe fails fast, so
a re-dial is about a second. The 30–60s reconnects seen earlier were Render
cold-starting right after a deploy, not a standing cost of the suspend change.

Worth keeping in mind anyway: **every screen-off now costs a re-probe on wake.** If
that ever reads as slow on a cold free-tier host, the targeted fix is to remember
the last good mode and dial it directly on resume rather than paying `chooseMode`
again — cloud is network-independent, so skipping the probe is safe for that case
and not for `lan`.

### Memory was misread once today — do not repeat it

`/health` showing `memory: {configured: true, ready: false, broken: false}` and
`facts_known: 0` is **not** a fault. `_memory_ready()` is lazy: `_db_ready` starts
false and flips on first use, and a genuine failure latches `_db_broken` to true.
`broken: false` means untouched since the restart, nothing more.

---

## Resume point — 2026-08-18: four reported bugs, and one of them was not a bug

**461 tests, `tsc --noEmit` clean.** Nothing native changed — all of this ships in a
JS reload. A debug APK replaced the 08-17 standalone release so Fast Refresh works
again; that build needs Metro plus `adb reverse tcp:8081 tcp:8081`.

### The app storage is readable now, and it settles arguments

The build is `DEBUGGABLE`, so AsyncStorage can be read directly instead of guessed
at:

```bash
adb exec-out run-as com.mypersonalintelligence.jarvis cat databases/RKStorage > rk.db
grep -a -oE 'jarvis_commute\{.{0,400}' rk.db
```

`adb exec-out`, not `adb shell` — the shell translates line endings and corrupts the
SQLite file. `sqlite3` is not executable as the app user, so grep the raw pages.

What it said on 08-18: Office named at 22.5770/88.4344, Home **not** named, both
departures on (8 AM / 7 PM), weekdays, sharing on, and **no `jarvis_commute_sent`
key at all** — the briefing has still never fired once. That key is written even on
a quiet day, so its absence is now a usable signal for whether Android ran the task.

### The 7 PM briefing was silent because there was nothing to say

Checked against Open-Meteo for the Office coordinates, 19:00–21:00: 27.7°C, 13%
rain chance, 0.00 mm, codes 2–3, wind 8.8 km/h. Not one threshold crossed
(`RAIN_CHANCE 50`, `RAIN_MM 0.4`, `HOT_C 35`, `COLD_C 12`, `WINDY_KMH 40`). So
`clear`, and silence is correct.

**This is the ambiguity that made the feature look broken for four days**, and it is
why the outcome type changed below. PREVIEW is still the only way to prove the chain,
because it posts either way.

### `commuteBriefing` returns three answers, not two

`Briefing | null` collapsed "nothing worth saying" and "could not find out", and the
task read both as the former — then wrote the once-a-day marker. On this phone the
failure is the normal case: `dumpsys jobscheduler` reports this uid as
`Network: 106 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)`, and
`am get-standby-bucket` returns **40 (RARE)** with the app absent from
`dumpsys deviceidle whitelist`. So a headless run has no network, failed, marked the
day briefed, and went quiet until tomorrow — where it did the same again. Every
failure mode reported success.

Now `{state:'briefing'|'clear'|'unavailable'}`. Only `clear` consumes the day;
`unavailable` returns `BackgroundTaskResult.Failed` and leaves it open. PREVIEW
reports the third outcome in words rather than posting "nothing to report".

Places gained a **Battery restrictions → SETTINGS** row for the part code cannot fix:
RARE plus no battery exemption is the real reason this never arrives on the dot.

### Reply notifications: two bugs in one condition

It read `if (first || chatFocused.current || simulated) return;` and was wrong both
ways.

- **It buzzed for a reply you were looking at.** Leaving the Chat tab mid-answer made
  `chatFocused` false, so an answer landing while the app was open on Home raised a
  notification. Reported as "going to the pages except chat page a notification
  arrives — that isn't normal".
- **It stayed silent for a reply you could not see.** Navigation blur does **not**
  fire when the app is backgrounded, so `chatFocused` stays `true` for the Chat tab.
  Ask from Chat, pocket the phone, and the guard written to suppress noise suppressed
  the only notification that mattered.

Focus was never the question. `shouldNotifyReply({appActive, simulated})` asks whether
the app is on screen at all; `chatFocused` now only drives `unread`.

Also fixed: the baseline took its mark from the first *J.A.R.V.I.S.* turn, so a
restored log ending on a **user** turn left it unset and the next real reply was
swallowed as "first pass" — one lost notification per launch, always the one that
mattered.

### The socket is closed on the way out, and that took two attempts

Backgrounding used to do nothing, leaving the socket to rot. That is invisible here
and expensive on the gateway: a suspended app's socket still swallows a write, so
`emit()` reported the reply delivered and the push never fired.

**The first fix made it worse.** `suspend()` tore the socket down but `tick()` only
bailed on `stopped`, so the watchdog read `closed` as dead and re-dialled in the
moment before Android froze the JS thread — backgrounding took the gateway from
`apps_linked: 2` to **3**. There is now a `suspended` flag that `tick()` respects,
cleared by `reprobe()` and by **any** `active` event — not only an observed
`background → active` pair, because a latch left set means a dead link until restart.

Measured after: `apps_linked` goes 1 → 0 when the phone leaves.

**This is half a fix.** The other half is `deliver()` in `jarvis-brain`
(`cloud_gateway.py`), which now consults `_app_clients` instead of trusting the
write — committed there the same day, and **it needs a Render deploy**. The two
repos have to move together; reverting either alone puts the bug back.

### Badges, where there were none

`GlassTabBar` had no access to app state at all. The Chat tab now carries an unread
count (capped `9+`) and a pulsing dot while `status === 'thinking'`; thinking wins,
since two marks on one 20px glyph is two things fighting for a corner. Both sit
inside the 44px detent because it clips.

The bell carried a dot driven by `parked.length` alone, so an unseen timeline looked
like an empty one. It now shows `alertsUnread + parked.length`, and the Activity
sheet gained **MARK ALL READ** — offered only when something is unread, and it
clears the unread half only, because an approval is answered rather than read.
`alertsUnread` counts replies and agent steps, **not** your own sent messages: you
have seen what you typed.

### Traps this cost

- **Fast Refresh cannot reach a backgrounded app.** Its HMR socket dies with the
  background, so an edit silently never arrives and you test stale JS. Two "still
  broken" readings were pre-fix code. Force-stop is the only reliable reload for any
  background test.
- **`adb shell input` is blocked on HyperOS** — `SecurityException: INJECT_EVENTS`,
  even with "USB debugging (Security settings)" on, at least over wireless. Background
  the app with `adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME`
  instead; that needs no injection.
- **Wireless adb's port rotates on every toggle and mDNS caches the old one.**
  `adb connect` then fails with "actively refused". `adb kill-server` sometimes
  refreshes it; otherwise read the port off the phone's screen.
- **A jest `jest.mock` factory may only reach an out-of-scope name prefixed `mock`.**
  `jarvisOverrides` threw; `mockJarvis` works.

## Resume point — 2026-08-17: the briefing was never mute, the preview was

**Pushed.** 426 tests, `tsc --noEmit` clean. Nothing native changed, so the
notification work ships in a JS reload — no rebuild, no `prebuild`. The diff is
`src/lib/notify.ts` and its test, plus `ROADMAP.md` (rewritten, see below).

Everything below was proved on the phone over wireless adb
(`adb connect <phone>:<port>`, then `adb reverse tcp:8081 tcp:8081` so the debug
build reaches Metro), reading `adb shell dumpsys notification` rather than
trusting the shade.

### The mute channel was a phantom, and this file was wrong about it twice

Two sessions were spent rebuilding the `general` channel to explain a silent
briefing, and 08-14 below records that theory as settled. It is not correct.
Keep it for the trail, but the diagnosis is this one.

A posted preview reads `flags=AUTO_CANCEL|SILENT vibrate=null sound=null`, which
08-14 read as proof the channel was mute. The channel was fine: `general-v2` was
carrying `mSound=content://settings/system/notification_sound` the whole time.
The `SILENT` comes from `installHandler`, and specifically from this, which had
looked obviously right since the day it was written:

```ts
shouldPlaySound: false,   // "a second sound on top reads as a double alert"
```

**`shouldPlaySound` is also the vibration switch.** There is no separate vibrate
field in the behaviour record — `ExpoNotificationBuilder.kt` reads this one for
both, then calls `builder.setSilent(true)` when neither is wanted, which is the
`SILENT` in the dump:

```kotlin
val behaviorAllowsVibration = notificationBehavior?.shouldPlaySound ?: true
if (!shouldPlaySound && !shouldVibrate) builder.setSilent(true)
```

That handler only runs when a notification lands while the app is **open** — and
**PREVIEW can only ever be pressed with the app open**. So every test of this
feature has been run through the one code path built to silence it, and the
silence was read as a broken channel. A real briefing arriving with the app shut
never touches the handler, which is consistent with the thing already proved on
08-13: a push to a sleeping phone buzzed.

So the default stays quiet — the app is already answering on screen with its own
toast and haptic — and anything *about* being noticed opts in. `postNow` data
carrying `preview: true` or `alertWhenOpen: true` is now heard. Three tests pin it.

### Two Android traps this cost, both worth more than the fix

**A hot reload can spend a channel id.** Android freezes importance, vibration
and sound at creation, so retuning the buzz means a new id each time. `general-v4`
was lost to Fast Refresh: the id was changed one save before the vibration under
it, the running app reloaded in between, and `prepare()` created the channel
carrying the *old* pattern — frozen there, unreachable by the finished edit.
**Force-stop the app before renaming a channel**, so the id and its settings
arrive in the same launch.

**An unshipped id still has to be cleaned once.** `LEGACY_GENERAL_CHANNELS` was
trimmed to only the ids that reached a pushed build, on the reasoning that a
tuning id nobody else has does not matter. Within the same session the next change
stranded `general-v7` on this phone, `mDeleted=false`, visible in Settings as a
dead row. It is back on the list. Deleting is not what keeps a channel gone —
Android tombstones the id either way — so a *cleared* id can safely leave the list,
but a live one cannot.

### Where the buzz landed

`general-v8`, `vibrationPattern: [0, 400, 100, 250]` — a long pulse falling to a
shorter one. Tuned by ear on the device, and every earlier guess was wrong:

| Pattern | Verdict |
| --- | --- |
| `[0, 220]` | "just small time buzzed" — a twitch you are not sure you felt |
| `[0, 250, 250, 250]` | Android's default, the one WhatsApp gets. A beat slow |
| `[0, 200, 100, 200]` | quick double-tap, still too light |
| `[0, 500, 200, 500]` | heavy enough, but it is the watch alert minus one pulse |
| `[0, 400, 100, 250]` | **kept.** Uneven, so it reads as one gesture, not a repeat |

**A channel cannot ask for a higher amplitude.** Duration is the whole of how
strong a buzz feels, which is why 220ms was imperceptible next to every other app.
The watch keeps its three even 500s and must stay the heaviest thing the phone
does — if the two are ever confused in use, shorten this one rather than
lengthening that one.

### Confirmed on the device while here

**Home is still `Not set`** on the Places screen, which is exactly what 08-14
suspected: the morning briefing falls back to a live fix a headless task cannot
get, and `jarvis_commute_sent` has still never been written. The gateway holding
the schedule remains the real fix.

The app itself is healthy — CLOUD linked, ONLINE, location resolving to
Bidhannagar, 1803 modules bundling clean.

### Left where it was found

- **The desk-watch alert is still silent in the foreground.** Same handler, and it
  does not opt in. Defensible, since the app renders the alert screen itself — but
  it is now a decision rather than an accident. `alertWhenOpen: true` flips it.
- **Nobody has still spoken into the microphone.** `brains.usage.audio` is `0`.
  Unchanged from 08-13 and 08-14; it is now the oldest unverified thing here.
- `AGENTS.md` says 287 tests. It is 426.

### A standalone APK now exists, and it is 100.7 MB

`cd android && ./gradlew.bat app:assembleRelease` — 11 minutes, exit 0, installed
over the 08-14 sideload with `adb install -r` and no uninstall, because the debug
keystore signs both. `assets/index.android.bundle` is embedded at 3.5 MB, so this
one runs with Metro off and away from this machine. PID confirmed alive, no
tombstone. Wireless adb found the phone through `adb mdns services` rather than a
remembered address — the pairing survived, and the port randomises on every
toggle of Wireless debugging, so discovery is the reliable route.

**It is 100.7 MB, not the 38.6 MB recorded on 08-12.** Nothing regressed: this was
a universal APK over all four ABIs in `reactNativeArchitectures` with
`minifyEnabled false`, and the phone is arm64, so three of the four native lib
sets are dead weight. `-PreactNativeArchitectures=arm64-v8a` brings it back to
~35 MB. The 08-12 figure was almost certainly an arm64-only build and did not say
so, which is why this note does.

**The desk stayed cloud-only.** `EXPO_PUBLIC_JARVIS_DESK` is still commented out
in `.env.local`, and it bakes at bundle time, so this APK resolves the desk to
`127.0.0.1` and can only reach the gateway. Deliberate — a baked LAN IP works on
one network and lies on every other.

### `ROADMAP.md` was rewritten, and the old one deleted

The 08-11 roadmap had gone actively wrong: it listed pairing as "never wired" and
Scripts and Reports as fixture-only, all of which shipped by 08-14. It is replaced
rather than archived, on the same reasoning this file learned the hard way with the
mute channel — a stale claim recorded as settled costs more than a lost trail.

The new ordering puts **the desk-key handshake first**, ahead of the microphone,
because it is the only open item whose cost grows while it waits: sealed turns are
dropped, not queued. `BRIDGE_SECRET` rotation is bundled into the same sitting,
since both need the desk on and waiting for the desk twice is how that rotation
keeps slipping. Nothing new gets built until the three untested features are
proved.

---

## Resume point — 2026-08-14: the question now says when and where

**Not pushed. Not yet on a phone.** 410 tests, `tsc --noEmit` clean. Nothing
native changed, so this ships in a JS reload — no rebuild, no `prebuild`.

**On upgrade** the stored setting becomes the departure from Home, keeping its
switch state and its 8:00 — which will now be labelled *8:00 AM*, and that label is
the bug this session found. The Office departure arrives off, defaulted to 7 PM.
Open Places, switch Office on, and press PREVIEW on each: the notification title
names the door it is about.

He reported no briefing at 20:00 with the time and the places both set, and
J.A.R.V.I.S. still answering some questions from the model's weights. Three
things were built; the first two are the hallucination half, the third is one of
four candidate causes for the silent 20:00.

### 1. The question carries a clock (`src/lib/ask.ts`, new)

Nothing in the envelope said *when* it was asked, so "today", "tomorrow" and
"tonight" were answered against a date the model invented from its training data.
`localClock()` sends local wall time with its offset — `2026-08-14T20:04:13+05:30`
— plus the IANA zone and the weekday.

Local reading, not `toISOString()`. A `Z` timestamp makes the model do the
timezone arithmetic before it can tell whether it is morning, and that is the step
it gets wrong. `Intl` is guarded: it is a Hermes build option, not a guarantee,
and a missing zone must cost the zone name only — `offset` comes from `Date` and
is always there.

### 2. The envelope is unconditional (`JarvisProvider.sendCommand`)

It used to be built only inside `if (shareLocation)`, so a question asked with
sharing off fell through to `link.send(trimmed)` — bare text. That dropped the
clock and the named places along with the coordinate: **three things withheld to
withhold one.** Now `{type:'ask', text, when, known}` always goes, and `where` is
the only optional part. Its absence is the honest answer to "where was this asked
from"; an empty `where` would be a different claim.

**`known` is deliberately sent twice.** Top-level is canonical; `where.known` is
mirrored for the gateway deployed on 08-13, which reads that path. Delete the
mirror once the gateway reads the top level — the comment at `ask.ts` says so, and
a test pins it so the removal is a decision rather than an accident.

### 3. The briefing re-registers at launch (`syncCommuteTask`)

`App.tsx` imported `setCommuteTask` and **never called it**, so the switch on the
Places screen was the only thing that ever registered the task. A registration
lives in Android's WorkManager database, not in this app's storage — so the
`prebuild --clean` reinstall on 08-13 wiped it while the setting survived in
AsyncStorage. The switch read ON with nothing behind it, and no code disagreed.
`syncCommuteTask()` now reads the setting at every launch and registers *or*
unregisters, so the two cannot drift apart in either direction.

### Why 20:00 was silent — found, and it was none of the mechanisms

PREVIEW produced a briefing whose window label read **`(8:00–11:00)`**. That label
is built from `s.hour`, so the setting was **hour 8 — eight in the morning**, on a
briefing he had set believing it was eight at night. It was never going to fire at
20:00. Nothing was broken; the screen let a wrong number look right.

Everything printed the time in 24-hour digits — the stepper, the row, the
notification body — so all three agreed with the mistake, and the feature was
called *Morning briefing*, which agreed with it too. **Every clock this feature
prints now carries a meridiem** (`clockLabel`, `hourLabel` in `commute.ts`), and
the window names both ends even when they share one: `8 AM–11 AM`, not `08:00`.

The other three candidates were real mechanisms and are still worth knowing, but
none of them was the cause. Two are now dealt with anyway — see the departures
work below, which removes the background-location dependency entirely.

### Departures are a list, and they name a place

He leaves home at 8 AM and the office at 7 PM. One time could not say that.

- `Departure { placeId, label, on, hour, minute }`, and `CommuteSettings` is
  `{ departures[], days[7] }`. `briefingDue` became `dueDeparture`, returning
  *which* door is due.
- **`days` is seven booleans indexed the way `getDay()` counts**, replacing
  `weekdaysOnly`. The weekend is off, and a worked Saturday can be switched on
  without dragging Sunday with it — which was the actual requirement.
- **The dedup key is per departure.** A single day-stamp would have let the 8 AM
  briefing mark the day done and silence the 7 PM one. That failure would have
  looked exactly like the evening briefing being broken, and only ever after the
  morning had worked.
- **The forecast is for the place being left, not for where the phone is.** A
  named place already has coordinates on disk, so the common path needs no
  location read at all — which is what kills the `ACCESS_BACKGROUND_LOCATION`
  problem rather than working around it. It is also just correct: at 7 PM the
  forecast that matters is the office's.
- `loadCommute` migrates the old single-time shape onto the home departure, and
  the old bare-string sent-log parses as "not yet briefed" — worst case one extra
  briefing on upgrade day.
- Places screen: a card per departure with its own switch, steppers and PREVIEW,
  and a row of day chips.

### Chat felt slow because the phone was busy, not the brain

`currentFix()` — a GPS read plus a reverse geocode — ran **before every message
left the phone**, and the wait reads as the cloud brain thinking. Weather was
already cached for 10 minutes; the fix was not cached at all. `currentFix` now
takes `maxAgeMs`, defaulting to 0 so every existing caller still gets a fresh
reading (naming the place you are standing in must not be answered from where you
were). Chat passes `FIX_TTL_MS`, 3 minutes.

That is the phone's share of the latency only. The rest is Render's free tier
spinning down after 15 minutes idle, which costs ~50s on the next request, then
model inference. Neither is visible from this repo.

### The chat reads like a chat now

- **Demo mode is off by default** (`JarvisProvider`, was `useState(true)`). It
  existed so a build with no desk on the network did not open on an empty HUD
  reporting failure. That reasoning expired the day there was a cloud brain:
  invented telemetry and `Acknowledged: …` replies sitting beside real ones are
  indistinguishable from the assistant making things up, which is the complaint
  this app is trying to answer. Still switchable from Settings for demos.
- **A rule between the days**, labelled Today / Yesterday / the weekday inside a
  week / a date beyond it (`dayHeading`, exported and tested). Every line used to
  carry its own date once the log outlived the app, which put `12 Aug, 14:32` on
  twenty consecutive lines from one afternoon; the lines are back to a bare time.
  In an inverted list the heading goes on the *oldest* turn of each day.
- **The dots start when you send**, not when the far end admits it is working.
  With Render cold-starting there was nothing on screen for the better part of a
  minute, which reads as a message that never left. They stop when the answer
  lands, or after two minutes with *No reply — the brain may be asleep*: dots that
  never stop are a worse lie than no dots.

### "Thanks" was answered with his location — and it is not the phone

Every question carries `where` when sharing is on, and the gateway is putting it
in the prompt on every turn, so a model with a location in front of it finds a way
to use it. The phone is right to send it; the gateway is wrong to spend it on
"thanks". Fixing it means the prompt treating location as ambient — available if
asked for, never the subject — which is the same tool-use discipline as below.

Worth noting it is **not** demo mode: `demoReply` answers anything it does not
recognise with `Acknowledged: …`, so this reply came from the real brain.

### The chat log was read off the phone — `docs/chat-audit-2026-08-14.md`

The 08-13 APK is not debuggable, so `run-as` cannot reach `jarvis_chat_log`.
Walking the inverted list with `uiautomator dump` and reading each bubble's
accessibility label works, is exact, and costs a fraction of screenshots. The
script is worth rebuilding if this is ever needed again.

The findings are in that doc. The short version: location and weather are stated
in six out of six greetings, `air temperature` and `feels like` were served back
as two contradictory readings of the same payload, one desk was named four
different ways in four turns, a hospital catering result was reported as his
wife's meal plan, and a question about his dog was answered with WHO infant growth
charts **while the dog sat in the context**, recallable on request one turn later.

Three of those are fixed here (§2, §3, §6). The rest is the gateway's prompt.

### The prompt, fixed — in a clone at `../jarvis-brain`

`kaustav991a/J.A.R.V.I.S`, branch `feat/cloud-gateway`, cloned beside this repo.
**Edited, not pushed, not deployed, and not run** — there is no Python on this
machine, so `python -m py_compile jarvis-backend/cloud_gateway.py` is owed before
anything else. The `.env` on the desk is still the source of truth for secrets.

The cause was three lines of plumbing, not the model:

1. **`_where_context` returned its fact block glued to the front of his message**
   (`"[" + facts + "]\n\n" + text`). A user turn that opens with a wall of facts
   reads as the operator having asked about them. It now returns the block alone
   and `think()` takes it as a `context=` system turn.
2. **That block was written into rolling memory**, because `think()` stores what it
   is given and it was given the glued string. By the tenth turn the conversation
   was mostly stale copies of his coordinates — which is where "still overcast" and
   "still in Presidency Division" came from. History now stores what he said.
3. **The web lookup ran on the glued string too.** `_LOOKUP_HINTS` matches
   "weather", "where", "today" — all of which the fact block contains — so *every
   located turn fired a Tavily/DDG search* on a query made mostly of coordinates.
   That is almost certainly the unprompted pharmacy, complete with a Durgapur
   address for a Kolkata question. It now searches what he actually asked.

Plus, in `_PERSONA`: rule 3 (`PREEMPT: volunteer the next useful fact without being
asked`) is what licensed the recital, and is now bounded — a greeting or a
thank-you gets a human reply and nothing else. Three failure modes that had no rule
at all now do: don't stretch a near-miss web result into an answer, ask once when a
word is ambiguous instead of guessing confidently, and don't treat air temperature
and feels-like as competing readings. `_decode_where` reads the phone's new
`label`, and `_where_context` prefers it over the geocode.

**None of this is verified.** It is a prompt change; it needs the phone, the
questions from the audit doc, and a look at what comes back.

### Camera and photos — built, needs a native rebuild

The gateway half was nearly free: `see()` already existed for Telegram photos and
already shares `think()`'s memory. All that was missing was the frame, which
`docs/cloud-app-link.md` now specifies.

- `src/lib/vision.ts` — `takeShot('camera' | 'library')`. `expo-image-picker`
  rather than `expo-camera`: the system camera is better than one drawn here, it
  brings review-and-retake for free, and the same module opens the gallery.
- **The shrink is the load-bearing part.** 1280px long edge, quality 0.65, under
  200 KB. A 12MP capture is ~5.5 MB as base64 in a single WebSocket text frame,
  which does not arrive. Uses the contextual `ImageManipulator.manipulate()` —
  `manipulateAsync` is deprecated in SDK 57, and the docs were read rather than
  recalled.
- Camera button replaces the leading glyph in `CommandBar` rather than adding a
  fourth control to the row. `holdGate` wraps the capture for the same reason the
  microphone needed it: a full-screen system activity reads to the app-lock as the
  phone leaving your hand.
- `sendPhoto` writes a local turn, unlike `sendVoice` — a clip echoes back as a
  transcript frame, a photo has no such echo, so without one the chat looks like
  the send failed.
- Fixed in passing: `sendVoice` and `sendPhoto` were missing from the context
  memo's dependency list, so a screen could hold a sender pointing at a replaced
  socket.

**New native deps mean `expo prebuild --clean` and a new dev build — and that
means restoring `local.properties` and the 6144m jvmargs.** `app.json` gained the
`expo-image-picker` plugin with the camera and photos permission strings.

### Later on 2026-08-14 — the gateway caught up, and is deployed

The gateway repo is cloned at `../jarvis-brain` (branch `feat/cloud-gateway`).
Four commits, all pushed and **live on Render** — which is the real syntax check:
the module imported and booted in production.

**The recital is fixed and verified on the device.** `hi` at 13:24 got "Hello,
Sir." The same message at 13:01, minutes before the deploy, got "You're still at
the Office in Bidhannagar, Sir, where it's overcast and 31.3°C." The two sit next
to each other in the log.

**The dangling promise had a cause nobody would guess.** "I'll look up the breed
standards for you" happened because `_LOOKUP_HINTS` holds `"what is"` and he typed
`"what's"` — a substring test does not know they are the same word, so no search
ran and the model had nothing to answer from. Contractions are expanded before the
match now, but a substring list will never cover English let alone Benglish, so the
model can ask for itself: it ends a reply with `[[LOOKUP: query]]`, the search runs,
and it is asked again with the results. One extra round trip, one grounded reply,
no promise. Once only, and the marker is stripped whether or not it was acted on.

**It can speak first.** `_deliver_unprompted()` is the single path for anything
unprompted: it writes into the same rolling history (a line the model cannot
remember saying makes the next turn incoherent), frames it to attached phones, and
pushes only when none are attached — mirroring `_announce_desk` so one event is
never felt twice. `POST /app-say` exposes it behind `APP_TOKEN`, because it writes
into his conversation as though the assistant had spoken. **No phone changes were
needed**: `hudReducer` already logs a `speaking` frame as a J.A.R.V.I.S. turn.

**Memory survives a restart** — when `DATABASE_URL` is set, which it is not yet.
Turns go to Postgres and are read back on first mention of a chat. Unset, nothing
runs and the behaviour is exactly what it was. A connection per call, because
free-tier Postgres reaps idle ones. Recall happens once per process and only into an
empty cache, or it would replay turns the process just had. `CLOUD_MAX_TURNS` is
tunable — 12 was chosen when memory died with the process, and the in-process cap is
a token budget rather than a storage one.

**A second brain, per capability.** `LLM_PROVIDER_TEXT` / `_VISION` / `_AUDIO`,
Groq the default everywhere, every Gemini failure falling back to Groq loudly.
Currently `audio: gemini` on `gemini-3.5-flash` — the key is set and
`gemini_ready: true`. Whisper cannot be *told* that a clip is code-switched Bengali
and English; guessing wrong is the reported transcription bug, and Gemini can be
told. `/health` reports `brains.usage` per capability, with
`last_error_was_quota` separating "the free tier is spent" from "the call was
wrong" — the two look identical from outside and want opposite responses.

### The photo bug, and a diagnostics failure of mine

"Sending photo won't work, says no link." Both of my photo failure toasts said
"No link", so the report could not say which fired — that cost a diagnosis, and
they are named distinctly now.

The likely cause is architectural rather than a typo: the camera is a full-screen
system activity, so the app is backgrounded while it is up and Android may take the
WebSocket with it. A send issued the instant the user returns lands in the gap
between `close` and the re-probe finishing. `sendWhenOpen` now waits up to 20s for
the socket, read through a ref so a re-dial does not leave a closure sending into
the old machine. The pre-flight `if (!connected)` check is also gone: it refused
before the camera had even opened, which is the wrong call twice over — the link is
usually about to come back, and the camera itself is what takes it away.

**Unverified.** The phone dropped off adb before this could be tested.

### Also fixed: the day rule was on the wrong side

`Today` rendered *below* the day it introduced. An inverted `FlatList` flips each
cell as well as their order, so a cell's children are laid out top-to-bottom and
then turned over — the heading had to become the **last** child to appear on top.
Caught from a screenshot, not a test.

### Evening of 2026-08-14 — the Memory screen, and why the briefing looked broken

**Home is the middle tab now.** Scripts, Chat, **Home**, Reports, Settings —
`initialRouteName="Home"` is required now that it is not the first child, or the app
opens on Scripts, which is a fixture file. A test pins the order, because a
deliberate arrangement is exactly what a refactor silently undoes.

**`MemoryScreen`** (Settings → Memory) reads, adds to and removes what the cloud
brain holds as true. It exists because seeding those facts took a `curl` and a
token: **a memory you cannot inspect is a memory you cannot trust**, and that store
now holds an address, a family and a marriage plan. The gateway already served
add/forget/list; this is a screen over an API.

`api` is on the context now rather than rebuilt per screen, and `ApiConfig` gained
`cloudUrl`. That fixed a live bug on the way past: `registerPush` was posted to
`baseUrl`, which becomes the *desk* the moment a desk attaches — and the desk serves
no `/app-push/register`, so the phone quietly stopped renewing its push address
whenever the desk was on.

**Facts are written naming him, not "he".** With Mousumi, Kinshuk, Tapas and two
dogs in the store, "he" stops being unambiguous the moment two of them sit together.
First or second person is worse still: "I live in…" inside a system prompt reads as
being about the assistant.

### The briefing was never broken — three separate things looked like one bug

Diagnosed by pulling `RKStorage` off the phone, which the debug build allows.
Settings were correct all along: Home 8:00 AM on, Office 7:00 PM on, Mon–Fri.

1. **The `general` channel was silent.** Proved on device — a posted briefing read
   `channel=general flags=AUTO_CANCEL|SILENT vibrate=null sound=null`. A bare
   `importance: DEFAULT` does not make a channel audible; the pattern and sound have
   to be named, which is the treatment the watch channel already had and is why that
   one buzzed. Now `general-v2`, because **Android freezes importance, vibration and
   light at creation** — the same lesson `desk-watch-v2` taught, relearned.

   > **Wrong — see 2026-08-17 above.** The `SILENT` in that dump is the foreground
   > handler's `shouldPlaySound: false`, which is the vibration switch too. The
   > channel was carrying the default sound throughout, and rebuilding it changed
   > nothing. The freezing-at-creation half is right and still matters.
2. **The Office preview was right to say nothing.** It toasts "Nothing worth warning
   about in that window" and posts no notification when no threshold is crossed.
   Silence is the designed answer; it is indistinguishable from failure.
3. **`postNow` is immediate, and was never the problem.** The one notification on
   the device was posted at 18:39:40, seconds after the tap. The "7–8 minutes" was
   noticing a silent notification, not waiting for it.

**`jarvis_commute_sent` has never existed on this phone.** That key is written on
every completed run including silent ones, so its absence proves the background task
has never once finished. Two reasons, both real: `home` is not a named place, so the
morning briefing falls back to a live fix a headless task cannot get; and this is a
HyperOS phone, whose battery manager is the likeliest reason WorkManager has never
fired at all. **The real fix is the gateway holding the schedule and pushing at
19:00** — proven infrastructure now, and no longer at Android's discretion.

### Not done, and next

- **Send the chat history.** The log is local-only (`chatStore.ts`) and the
  envelope carries one turn. The gateway keeps rolling memory under `chat_id 0`,
  in process RAM — Render restarts wipe it, and every device shares that slot.
- **Tool-use over prose on the gateway.** Force a function call for weather,
  distance, time and telemetry; no tool answer means "I don't know". This is the
  actual cure. Items 1 and 2 above are the enabling conditions for it.
- **Provenance in the chat UI** — measured / from the desk / from memory. Makes
  guessing visible instead of anecdotal.
- **Tavily is suspected of not working and cannot be checked from here.** It lives
  in `jarvis-backend`, not in this repo. If search is silently failing, every
  question needing a lookup falls back to the model's weights, which would look
  exactly like the hallucination being reported. Check it before building anything
  else on the gateway: a failed search must surface as "I could not look that up",
  never as a fluent answer.
- **Render's free tier spins down after 15 minutes.** The first message after a
  quiet spell pays ~50s of cold start. A keep-warm ping, or a paid instance, is
  the only fix; nothing on the phone can help.
- `AGENTS.md` still says 287 tests. It was stale before this session too.

---

## Resume point — end of 2026-08-13, 19:00

**Everything is pushed.** Mobile `feat/mobile-hud` at `666a4b1`; gateway
`feat/cloud-gateway` at `9c37b4d`, deployed. 368 tests, `tsc --noEmit` clean.

APK installed on the phone at **18:57:18** (full rebuild after `prebuild --clean`).
Process starts, no crash, no tombstone. `RECORD_AUDIO` and `ACCESS_FINE_LOCATION`
granted; `ACCESS_BACKGROUND_LOCATION` is not even declared.

### Verified on the device today

Pairing with the rotated token; CLOUD → FULL POWER when a desk attaches; local
notification with the app open; **push to a sleeping phone, which buzzed**;
**desk-watch alert reaching a closed app, and tapping it opening the alert screen**;
chat surviving a force-stop; one socket per launch.

### NOT verified — do these first

1. **Nobody has spoken into the microphone.** The gesture, the timer, the meter and
   the cancel/lock slides are all exercised; whether a clip actually transcribes is
   unknown. Chat → hold the mic → speak → release.
2. **The morning briefing has never fired.** Settings → Places → set Home while
   standing in it, set a leaving time, then **PREVIEW THE BRIEFING** — do not wait
   for tomorrow to find out.
3. **The located weather answer has not been re-tested since the fix.** Ask "is it
   raining here?" with sharing on. It should quote measured figures. If it says it
   could not fetch, the phone's own lookup failed — check that sharing is on, since
   without it no `where` is sent at all.
4. **"How far to the office"** needs Office named first. It resolves against the
   label with no geocoder call; unnamed destinations still go through Nominatim.

The last attempt at (1)–(3) was blocked because the phone was behind its lock screen:
`adb` can wake the display but not unlock it, so the app launched behind the keyguard
and never reached the foreground. `apps_linked: 0` in that state means nothing.

### Still owed, and not mine to do

**Rotate `BRIDGE_SECRET`.** The old value appeared in Render's access log before the
redaction landed, and it still opens `/desk-link` — a fake desk was connected with it
repeatedly today while testing. Both ends change together: Render env and
`jarvis-backend/.env` on the desk, so it needs the desk on.

**Traffic needs a paid key.** Routing is OSRM's public server, which knows the road
graph and not the road, so durations are free-flowing and the context says so.
`_route_blocking` / `_route_to_blocking` are the only functions that change when
there is a Mapbox or TomTom key.

---

## Start here (2026-08-13)

**The phone talks to the cloud brain, and both notification paths are proven on
real hardware.** The gateway half is deployed; the phone half is committed on
`feat/mobile-hud` but **not pushed**. 362 tests, `tsc --noEmit` clean.

### It is paired, and the token was rotated

`APP_TOKEN` is now its own value on Render rather than falling back to
`BRIDGE_SECRET`, and the phone holds it. Verified: the new token is accepted, the
old one is refused 403.

**`BRIDGE_SECRET` still wants rotating.** The old shared value appeared in Render's
access log (see below) and it still opens `/desk-link`. Both ends change together —
Render env and `jarvis-backend/.env` on the desk — so it needs the desk on.

### What the gateway grew (deployed, `feat/cloud-gateway`)

- `WS /app-link` announces the desk arriving: `{"type":"desk","linked":true}`
- `POST /app-push/register` — the phone's push address, gated by the same token
- Push through Expo's relay, so a sleeping phone is reachable at all
- Desk-watch alerts relayed to phones, and pushed when none is attached
- **The pairing token was being written to the access log.** uvicorn logs the whole
  request line and the token travels as a query parameter, because React Native
  cannot set headers on a WebSocket handshake. `_RedactQuerySecrets` filters it now;
  confirmed live as `?token=<redacted>`.

### The bug worth knowing about

**Every notification this app has ever posted went to Expo's fallback channel** —
"Miscellaneous", `SILENT`, no vibration. `channelId` was being spread into
`content`, which has no such field; it belongs on the *trigger*. That includes the
desk-watch intruder alert, configured `AndroidImportance.MAX` precisely so it can
interrupt, arriving mute the whole time. `tsc` cannot catch it: the spread that
added the field turns off excess-property checking.

The watch channel is now `desk-watch-v2` — Android freezes a channel's importance,
vibration and light at creation, so an emergency vibration and a red light meant a
new id, not an edit. `bypassDnd` cannot be used: it needs Notification Policy
Access, and without it Android rejects the whole channel, leaving it absent.

### Verified on the device, not just in tests

- CLOUD → **FULL POWER** when the desk attaches, with the Connect tile at full
  green wash (a fifth of it on plain cloud)
- Local notification with the app open, on `channel=general`
- **Push to a sleeping phone**, which buzzed
- **Desk-watch alert to a closed app**, and tapping it opened the alert screen
- Chat survives a force-stop: sent a turn, killed the app, the reply was still there
- One socket per launch (`apps_linked: 1`), where it used to be two

### Things learned the hard way today

- `am force-stop` puts an app in Android's **stopped state**, where FCM is not
  delivered at all. Backgrounding is not force-stopping; two of my push tests were
  invalid for this reason.
- Two notifications a second apart get folded into one Android auto-group, and the
  second can vanish — the shade held an orphan `desk-watch` group summary with no
  child. `sticky` on the local alert prevents it.
- Expo's push API takes only `channelId`, `icon` and `tag` on Android. **No colour,
  no sticky.** A pushed alert cannot be made red or unswipeable without a data-only
  push plus a background task (`expo-task-manager`), which risks *no* notification
  at all if the task does not run.
- A phone cannot hold a WebSocket while dozing. `apps_linked: 0` with the screen off
  is correct behaviour, and is the whole reason push exists.

### Later the same day: voice, location, places, briefing

**Voice works.** Hold the mic in Chat, release to send. WhatsApp-shaped: slide up
past 64px to go hands-free, slide left past 96px to bin it, live timer, and a level
meter driven by real dBFS metering — a meter that does not move means the mic is not
hearing you, which is worth seeing before sending silence to a transcriber. The mic
follows the finger and clamps at the thresholds, so the travel is the progress
indicator.

Three faults found by using it, all mine: the recorder UI was an early `return`
that **unmounted the mic**, taking the touch with it (release and both slides went
dead, the bin still worked because it belonged to the replacement); `onPressOut`
fires when the finger leaves the button, so the slides needed `pressRetentionOffset`;
and holding the mic raised a **fingerprint prompt** — the app-lock gate treats any
departure as the phone leaving your hand, and a system permission dialog *is* that.
`AuthProvider.holdGate` now covers it, the same mechanism its own sheet uses.

**Location, one-shot and foreground only.** Off until switched on in Settings →
Privacy. No `ACCESS_BACKGROUND_LOCATION` — verified in the *merged* manifest, not
just the config. Home shows the area at the top, refreshed when that tab is focused.

**Weather was the interesting bug.** He asked if it was raining and was told it was
not, while it was raining. That is the model answering from its weights. Fixed by
sending measured figures and telling it not to answer from memory — and then fixed
*again*, because the gateway's own lookup was answered `429 Too Many Requests`:
Open-Meteo rate-limits per IP and Render's outbound address is shared. **The phone
fetches it now**, from its own address, and the gateway prefers what it is handed.
My pre-push check had stubbed the HTTP call, so the one line that failed in
production was the one line never executed anywhere. Worth remembering.

**Named places** (`src/lib/knownPlaces.ts`, `PlacesScreen`). Home and Office as
fixed slots plus custom labels, set by standing somewhere — no address typing. They
travel with each question so "how far to the office" resolves against a label
before any geocoder is asked, and "am I at the office" works from 250m. Stored on
the phone only.

**Morning briefing** (`src/lib/commute.ts`, `commuteTask.ts`). A leaving time,
weekdays by default, checked within half an hour of it. Forecast covers the
departure hour and the two after — not the daily maximum. Advice from thresholds on
real numbers, never the model: umbrella at ≥50% or ≥0.4mm, water at ≥35°C, jacket at
≤12°C, wind at ≥40km/h, thunderstorms their own line. **Silence when there is
nothing to say.** One per day. A PREVIEW button fires one now, because a briefing
you cannot trigger is one you cannot trust.

`expo-background-task` decides its own timing — 15 minutes is a floor, not a
schedule, so the task re-checks the clock rather than trusting when it was woken.

**Chat persists** now (last 100 turns, AsyncStorage), older turns carry a date, the
Home command bar is gone in favour of a Chat card with an unread count, a reply
raises a notification unless you are looking at the chat, and `online`/`offline`
statuses no longer write chat lines — that greeting was filling the log.

New deps this session: `@react-native-async-storage/async-storage`, `expo-audio`,
`expo-location`, `expo-background-task`, `expo-task-manager`. Three of them added
config plugins, so `android/` was regenerated twice — **restore `local.properties`
and the 6144m jvmargs each time**.

### Still owed

1. **`BRIDGE_SECRET` rotation** — needs the desk on.
2. **Voice is built but nobody has spoken into it.** `expo-audio` is wired to the
   chat mic, hold-to-record, base64 envelope to the gateway, which already
   transcribes. `android/` was regenerated for `RECORD_AUDIO`; **if you
   `prebuild --clean` again, restore `local.properties` and the 6144m jvmargs.**
3. **Scoped Android blur is written and switched off.** `BlurBehind` in `Glass.tsx`
   puts the target around the content with the surface as a sibling — the shape the
   old tombstone says would work. `TRY_SCOPED_ANDROID_BLUR = false`. Turning it on
   needs a device and `adb logcat` watching for `F DEBUG` in `libhwui.so`, because
   the failure mode is a segfault that kills the process silently.
4. **The desk side of the watch** — still entirely unbuilt, still the only
   simulated part. `docs/desk-watch.md` specifies it.
5. **A pushed watch alert cannot raise the alert screen from cold if it has no
   payload** — it does carry one now, but nothing fetches a *live* alert on connect,
   so an alert that arrived while the app was dead and was never tapped is lost.
6. Camera: photo-to-J.A.R.V.I.S. would need `expo-camera` plus a gateway route.
   The vision path exists for Telegram photos; `/app-link` has no photo frame.

### One thing not diagnosed

A single run at 12:38 posted no notification despite the FULL POWER flip rendering
correctly. Every run since worked. Written down rather than quietly forgotten.

---

## Start here (2026-08-12)

**287 tests pass, `tsc --noEmit` clean, and it is all committed** on
`feat/mobile-hud` — nine commits, ending with the README and this doc set. Read
`README.md` first if this machine is new; it is a setup guide.

### A dev build with the new native modules exists

`a78df2e7` (development profile, 2026-08-12 13:07). It is the first build to
carry `expo-local-authentication` and `expo-notifications`:

```
https://expo.dev/accounts/kaustav790/projects/jarvis-mobile/builds/a78df2e7-beb8-4dcc-96d2-e02097964291
```

EAS archives the **working directory**, not `git HEAD` — it uploaded 1.7 MB of
project files and recomputed the fingerprint, so the uncommitted `app.json`
plugin block went in. The `Commit` field on the build page names HEAD for
provenance only; do not read it as what was built.

Android permissions now resolved into the manifest, verified with
`npx expo config --type introspect`: `POST_NOTIFICATIONS`, `USE_BIOMETRIC`,
`USE_FINGERPRINT`.

### This machine can now build Android locally, no Android Studio

Installed to `C:\Users\Fortmindz\AppData\Local\Android\Sdk` (2.8 GB), versions
taken from `node_modules/react-native/gradle/libs.versions.toml` rather than
guessed: `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`,
`cmake;3.22.1`, `platform-tools`. JDK 17 was already present. `ANDROID_HOME`,
`ANDROID_SDK_ROOT` and PATH are persisted at user scope.

Two things worth knowing before using it:

- **`eas build --local` does not run on Windows.** It is a bash pipeline; it
  needs macOS/Linux or WSL2. On Windows the local route is `npx expo run:android`.
- `expo run:android` runs `expo prebuild`, which writes `android/` (already
  gitignored, so the repo stays clean). But this project's native config is
  entirely plugin-driven — splash, local-auth, notifications — so **after any
  `app.json` or plugin edit you must `expo prebuild --clean`** or the change
  silently will not apply. That is the same class of silent native mismatch that
  cost a day on the blur crash.

### The reanimated trap that cost a device crash loop

A worklet's closure is built from the identifiers in its **body**. A default
parameter is not scanned:

```ts
// compiles, passes jest (JS thread, real closure), throws on the UI thread
// once per frame: "Property 'MAGNET' doesn't exist"
export function magnetize(raw: number, strength = MAGNET) { 'worklet'; … }
```

Default worklet parameters in the body, always. No other worklet in the
codebase does this — it was checked.

### The Android blur crash, finally diagnosed

Not a version problem, not RenderScript, not the blur method. Captured from a dev
build over adb (Xiaomi chenfeng, Android 16, arm64):

```
F libc: Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR) in tid (RenderThread)
Cause: stack pointer is close to top of stack; likely stack overflow.
512 total frames
#00..#511  /system/lib64/libhwui.so
           android::uirenderer::computeTransformImpl(DirtyStack const*, Matrix4*)
```

512 identical frames — HWUI's transform walk recursing until the RenderThread's
stack is gone. **`BlurTargetView` wraps the whole app while the `BlurView` that
samples it sits inside that subtree**, so the render-node graph has a cycle and
walking the parent chain never terminates. `dimezisBlurViewSdk31Plus` was tried
and changed nothing.

Proven both ways in one sitting: flag on → process dies ~1s after first paint;
flag off → alive. `TRY_ANDROID_BLUR` in `src/components/ui/Glass.tsx`, with the
full tombstone in the comment.

**The shape that would work:** the `BlurView` must not be a descendant of the
`BlurTargetView` — target around the content only, blurring surface a sibling
outside it. Awkward for the tab bar, since React Navigation renders a custom
`tabBar` inside the same navigator as the scenes. Straightforward for a surface
already a sibling of its content: the chat composer over its list, or Activity.

Method: `adb logcat -c`, `am start -W`, poll `pidof`, then read the `F DEBUG`
tombstone frames. A release APK still gives no diagnosis — a dev build plus adb
is the whole difference.

### What landed this session

**Tab bar — fluid and magnetic, the iOS Camera dial properly.** The dial math is
now pure exported functions with 31 tests (`src/navigation/__tests__/tabDial.test.ts`).

- `centreAt` replaced centring on `Math.round(pos)`, which tripped the strip
  ~60px sideways in one frame every time the dial crossed a boundary.
- `magnetize` bends the drag toward the nearest detent — smootherstep blended
  with identity, so the rate stays between 0.45× and 1.48× and the dial never
  stalls under a moving finger. A dead stop reads as broken, not magnetic.
- `projectDetent` replaced `clamp(-velocityX/1800, -1, 1)`, which capped a throw
  at one detent so momentum died the instant the finger lifted.
- `SNAP` went from damping 22/stiffness 78/mass 1.1 to 17/190/0.85 — the mass
  read as syrup on device.
- The tick moved off the drag onto the dial via `useAnimatedReaction`, so the
  coast after release ticks too.
- Knobs, all at the top of `GlassTabBar.tsx`: `MAGNET` 0.68, `DRAG` 1.45,
  `COAST_S` 0.22.

A test caught a real bug here: past the last tab, `widthAt` narrows the
over-dragged edge tab and walks its own centre backwards, so the rubber band ran
the wrong way. `centreAt` freezes the layout at the edge and shows overscroll as
plain travel.

**Biometric auth.** `expo-local-authentication`, class-3 enforced for decisions,
device PIN left as fallback.

- `src/lib/biometrics.ts` — probe, sensor naming, error mapping. Survives the
  native module being wholly absent: on an older dev build every function is
  `undefined`, so a bare call throws *synchronously* and a per-call `.catch`
  never fires. That is what `ask()` in there is for.
- `src/security/AuthProvider.tsx` — app lock and approval confirmation. It never
  prompts by itself; the lock screen does, so a system sheet cannot land over a
  half-drawn app.
- `src/screens/LockScreen.tsx`, `src/screens/SecurityScreen.tsx` (Settings →
  Security, no longer a SOON row).
- Turning a gate **off** also demands a finger. Enabling one proves the sensor
  works first. A phone with nothing enrolled never raises a gate it cannot open.

Three bugs found on device, all fixed and all now pinned by tests. They are worth
reading before touching this area, because each one presents as "the lock screen
is stuck":

1. **Android refuses `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`.** It is rejected
   outright, not degraded. With the device passcode kept as a fallback, asking for
   `'weak'` meant no sheet appeared and the promise never settled — a spinner
   nobody could get past. `authenticateAsync` now always asks for `'strong'`.
2. **Minimising while the sheet is up leaves `authenticateAsync` unresolved.**
   `Button` treats `busy` as inert, so the unlock button became a spinner blocking
   its own press. `cancel()` settles a stale sheet before opening a new one, and
   there is a 90s ceiling on the native call as a backstop.
3. **A locked screen never unmounts**, so the one-shot mount prompt never fired
   again — returning to a locked app showed a lock screen that would not ask for
   anything. It now re-asks on every return to foreground, on `'active'` only:
   cancelling as the app *leaves* would abort the sheet just opened. A 1.2s
   recency guard separates a genuine return from the `'active'` that trails a cold
   start.

The gate closes when the app **leaves** the foreground, `'inactive'` included, so
it is already up in the app-switcher snapshot. This replaced a 20s grace measured
on return, which left the app open to anyone picking the phone up inside twenty
seconds. Our own sheet also sends the app away on some devices, so authentication
raises a flag the gate honours — without it, that is a prompt loop.

**Desk watch — phone side complete, desk side specified and unbuilt.** Full
contract in `docs/desk-watch.md`.

- `intruder` / `intruder_resolved` frames. The desk sends `expires_in` seconds,
  never a timestamp, so the two clocks meet in exactly one place.
- **The desk owns the countdown and locks on silence.** The phone's countdown is
  a readout. A flat battery must not mean an open machine.
- `WatchAlertScreen` sits above everything including the gate. "It was me" is
  gated behind a strong biometric; "lock it now" is not — locking is what silence
  does anyway, so a gate there would cost seconds and protect nothing.
- Testable with no desk: send `test watch` in Chat with demo mode on.

**Launch screen — ignition, and the sequenced arrival** (items 1, 2 and 4 of the
four agreed on 2026-08-11).

- `ArcReactor` takes `ignite` (opt-in, so Home and About are untouched). The tube
  draws itself round from twelve o'clock via animated `strokeDashoffset` — the
  one place in that component that animates an SVG attribute, because a circle
  being drawn has no View equivalent. Rotation still lives on Views.
- The reactor no longer fades or scales in at all. A ring that fades up is a
  picture appearing; one that draws itself is a machine starting.
- Arrival order: ring at 0, wash at 120ms, rail at 560ms, tagline at 680ms.
- The two static halo rings became one dashed tick track.

### The app icon is JARVIS now, not Expo's

`app.json` was pointing at the right paths the whole time — the *files* were the
`create-expo-app` scaffold artwork, untouched since 2026-08-10. Redrawn to match
`ArcReactor`: neon tube (three faint wide strokes under one hot stroke), the
white-hot core line, the sweeping outer arc, a `J`, on `#020814`.

Regenerated by a throwaway System.Drawing script, not committed — the same
approach as `splash-reactor.png`. To change the art, redraw or replace the files.

- `icon.png` — 1024, full bleed, navy background
- `android-icon-foreground.png` — 1024, transparent. Content spans ~492px so it
  sits inside Android's 676px safe zone (the inner 66% the mask always shows);
  only the soft bloom fades past it. **A foreground drawn full-bleed gets its
  edges cropped by the launcher mask.**
- `android-icon-background.png` — flat `#020814`, so no mask shape ever reveals a seam
- `android-icon-monochrome.png` — white silhouette for Android 13+ themed icons
- `favicon.png` — 196, downscaled from the full icon

**Two files inside `android/` are gitignored and must be re-applied after every
`expo prebuild --clean`:** `local.properties` (`sdk.dir=...`, else "SDK location not
found") and `gradle.properties` `org.gradle.jvmargs` — Expo generates 2048m and a
release build dies with OutOfMemoryError in R8; 6144m works. Worth moving both
into `expo-build-properties` so they survive.

A standalone release APK builds with `cd android && ./gradlew app:assembleRelease`
— 38.6 MB versus 87.5 MB debug, JS bundled, no Metro. It is signed with the debug
keystore (Expo generates it that way), so it cannot be installed over an
EAS-signed build without uninstalling first.

**Icons are native.** A reload does nothing; this needs a rebuild, and locally
`expo prebuild --clean` first since `android/` already exists.

### Two device-found fixes, and one silent no-op still outstanding

**The CONNECT button only ever worked once.** The demo handshake effect had deps
`[demo, connected]`; `connect()` set `demoPhase` back to `probing`, but neither
dep changed, so no new timer was scheduled and the screen sat on "Connecting"
forever. A `probeNonce` in the deps drives the re-run now, with a 1.6s pause —
`DEMO_HANDSHAKE_MS` — because an instant "Connected" reads as a lie.

**The reactor's states looked alike.** `statusColor` gave each one a colour, but
every state shared one tempo, so colour alone read as a palette change rather
than a machine doing something. `tempoFor` in `ArcReactor.tsx` now sets sweep,
counter, breath and the sweeping arc's *length* per state: `boot` 15s (barely
drifting) → `online` 9s → `listening` 5.6s → `thinking` 2s → `alert` 1.3s. The
aliases group exactly as `statusColor` groups them, pinned by tests, so pace and
colour can never disagree.

**Still outstanding — `userInterfaceStyle` has never worked.** `app.json` sets
`"userInterfaceStyle": "dark"`, but `expo-system-ui` is not installed, so the
setting is **silently ignored on every build, EAS included**. Fix is
`npx expo install expo-system-ui` plus a rebuild. Exactly the class of silent
native no-op that has cost this project time before.

`npm run android` / `ios` now point at `expo run:android` / `run:ios` — rewritten
by `expo run:android` itself when it generated `android/`, not by hand.

### Still owed — do these in this order

The pattern so far has been to build the phone side and leave a wire hanging for
whatever connects later. This is the list of hanging wires, ordered by what
unblocks the most.

1. **The pairing token, and a desk-endpoint field. Plumbing done and tested; only
   the UI is left.**

   Built: `normaliseBase()` (accepts `192.168.1.5:8000`, assumes `http://`,
   strips trailing slashes — which would otherwise concatenate into `//ws` and a
   desk that never answers, rejects impossible ports),
   `loadEndpoints`/`saveDeskBase`/`clearToken` in `src/link/config.ts`, a `token`
   option on `useLink` that re-dials on change without a remount, and
   `pairing`/`pair({base, token})` on `JarvisProvider`. The context exposes
   *whether* a token is held, never its value.

   Two silent breakages fixed in passing: REST still pointed at the build's
   default desk after re-pairing, and the API client carried no token — so the
   very routes the desk gates would have gone out unauthenticated.

   **Left to do:** two fields and a Save button on `ConnectionScreen`, calling
   `pair()`. Manual entry, not QR — QR needs `expo-camera` and therefore another
   dev build; it can layer on later.

   Until that lands the desk address is still `.env.local` only, and changing it
   needs a Metro restart, not a reload.

   Why this one leads: `saveToken`/`loadToken` existed but **no screen ever wrote
   one**, so `?token=` was always absent. Both `docs/desk-watch.md` and
   `docs/cloud-app-link.md` say plainly: do not expose their routes without it.
   `/api/watch/answer` decides whether a machine stays unlocked, and `/app-link`
   reaches a brain that can answer as you. So until a token can be set, **the desk
   watch cannot leave demo mode.** The endpoint is the same job: the desk address
   lives only in `.env.local`, editable by hand and needing a Metro restart, and
   it is stale whenever the LAN changes. Both belong on the Connection screen,
   persisted with SecureStore the way `AuthProvider` already does it.
2. **Local notifications.** No Firebase needed and they work today. This closes
   the real gap in the desk watch: an alert that only travels down the WebSocket
   arrives when the app is in the foreground, which is not where the phone is when
   it matters. `expo-notifications` is installed and `POST_NOTIFICATIONS` is in
   the manifest, but nothing requests the runtime permission, creates a channel,
   or posts anything. Prove the surface locally before adding remote push.
3. **Persist appearance settings.** `AppearanceProvider` is in-memory, so accent,
   glow and animations reset on every launch. Small, and the SecureStore pattern
   is already in the codebase.
4. **Remote push.** Needs a Firebase project and `google-services.json` from the
   user, then another dev build. Only worth doing after (2) proves the surface.
5. **A `preview` APK.** Still none since the blur fixes; the last published
   (`0b0c84e`) still crashes. Worth building now the app is healthy.
6. **Real blur where it can work.** The shape is known (see above): the
   `BlurView` must not be a descendant of the `BlurTargetView`. The tab bar cannot
   satisfy that easily, but the chat composer over its list, and the Activity
   sheet over Home, are already sibling-of-content.
7. **The desk side.** Fully specified in `docs/desk-watch.md`, nothing built.
   Python on the Windows machine, not this repo. This is where the product stops
   being a convincing demo.
8. Everything in "Next steps" further down, unchanged — smoke tests for the
   remaining screens, the integration test, wiring Scripts off fixtures, and voice.

---

## Start here (2026-08-11, end of day)

**The app runs.** Everything below §"Session 6" is history; this is the state.

### The one bug that cost the day, and its answer

Android **cannot** use `BlurTargetView`. Mounting it kills the process
natively — no JS error, no red screen, nothing an `ErrorBoundary` can catch, so
it presents as "the app just exits while loading". It took two crashing APKs and
a broken Expo Go before a dev build proved it in three reloads:

| what was mounted | result |
|---|---|
| `BlurTargetView` at the root | dies on launch |
| removed | runs clean |
| `BlurView` with no target | runs, blurs nothing |

So on Android it is a crash or a no-op, nothing in between. `Glass`
(`src/components/ui/Glass.tsx`) now gives Android a heavy tint that reads as
smoked glass, and keeps real blur on iOS. **Do not reintroduce
`BlurTargetView`** without testing on a dev build first.

The lesson worth keeping: *an APK gives no diagnosis*. A release build has no
red box, so a native crash is silent. Use the dev build for anything native.

### How to work on this now

```bash
npx expo start --dev-client     # phone: JARVIS dev build, tap the server
npm test                        # 172 tests
npm run typecheck
```

The dev build APK (`f2dadbf`) is installed on the user's phone. JS changes
reload in seconds; only a **new native dependency** needs a rebuild:

```bash
eas build -p android --profile development   # rebuild the dev client
eas build -p android --profile preview       # standalone APK to share
```

Expo Go is dead to this project — it lacks the native modules and gave no
diagnosis. `@react-native-community/slider` was removed for the same reason
(replaced by `src/components/ui/Slider.tsx`, drawn from views over a pan
gesture).

**Owed:** a standalone `preview` APK has not been built since the fixes. The
last one published (`0b0c84e`) still crashes. Build one first thing.

### Agreed next, not started

Making the launch screen cinematic, in the user's priority order:

1. **Ignition, not fade** — the reactor ring draws itself round via
   stroke-dashoffset, so it powers on instead of appearing.
2. **Sequence the arrival** — ring, then wash, then wordmark, then the rail;
   about half a second of choreography using the elements already there.
3. Hand off to Home's small reactor rather than cutting (shared-element).
4. Replace the two static halo rings with one slow tick track.

Then `ROADMAP.md` §1: persistence, the Connection endpoint field, pairing token.

---

## Where the work stands

The app was being built from `docs/superpowers/plans/2026-08-10-jarvis-mobile-hud.md`
(15 tasks, single HUD canvas). Mid-plan the user supplied reference images in
`C:\Users\Fortmindz\Downloads\Jarvis UI\` and redirected the design **twice**.
The plan is now partly superseded — read "Deviations" below before following it.

### Done and committed

| Plan task | State |
|---|---|
| 1 tokens + jest | done, but the palette was **replaced** (see Deviations) |
| 2 WS frame contract | done |
| 3 HUD reducer | done |
| 4 LAN/cloud probe | done |
| 5 LinkMachine | done |
| 6 useLink | done |
| 7 REST client | done |
| 8 Node mock backend | done — `mock/server.js`, 9 tests |
| 9–13 HUD components | done, then re-skinned |
| 14 HudScreen + app shell | **superseded** — replaced by a 4-tab app, see below |
| 15 integration test + README | **not started** |

### Uncommitted / in flight when work stopped

The 4-tab app shell was just finished and typechecks clean, but has **no tests
of its own yet**. Everything below is new since the last commit:

- `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts` — 4 tabs
  (Status / Scripts / Commands / Settings), each a native stack.
- `src/screens/` — `StatusScreen`, `ConnectionScreen`, `ScriptsScreen`,
  `ScriptDetailsScreen`, `CommandsScreen`, `CommandResultScreen`,
  `SettingsScreen`, `AppearanceScreen`, `AboutScreen`.
- `src/components/ui/` — `Card` (+`InfoRow`), `Button`, `ListCard` (+`RunButton`),
  `SettingsRow`, `Atoms` (`Screen`, `SectionLabel`, `Badge`, `MonoCard`, `EmptyState`).
- `src/state/JarvisProvider.tsx` — owns the one reducer + one `useLink` for all tabs.
- `src/theme/appearance.tsx` — accent / glow / animations / theme, consumed live.
- `src/data/fixtures.ts` — scripts, recent commands, sample result.
- `App.tsx` — GestureHandlerRootView → SafeAreaProvider → AppearanceProvider →
  JarvisProvider → RootNavigator.

## Session 2 (same day, after the tab shell landed)

Two runtime problems the user hit, both now fixed and committed:

1. **Dev server returned 500** — `Unable to resolve module @expo/vector-icons`.
   Not a code fault: Metro had been started *before* the navigation, icon and
   slider packages were installed, and it caches its module map at startup. The
   packages were on disk the whole time. Verified by running a throwaway Metro
   with `-c` on port 8082: `index.bundle` returned 200 for both android and ios.
   **Any time a package is added, restart with `npx expo start -c`. A reload
   (`r`) does not clear that cache.**
2. **Splash screen disappeared.** `app.json` had never configured
   `expo-splash-screen`, so it fell back to the scaffold's `splash-icon.png` —
   pale grey placeholder rings, which went invisible once the app background
   became `#020814`. Fixed by adding explicit plugin config pointing at a new
   on-brand image.

Also in that pass, at the user's request ("that orb looked too good" — meaning
the orb in the three reference images):

- **`ArcReactor` rebuilt as a neon tube.** It was a single 2.5px stroke and read
  as a drawn circle, not as light. It is now three wide near-transparent strokes
  stacked under one hot stroke, plus a white-hot centre line, a thin companion
  ring, and a dark radial "well" inside the ring for depth. React Native has no
  SVG blur filter, so the halo has to be faked by that stack — do not "simplify"
  it back to one stroke.
- Gradient ids are now per-instance via `useId()`. Two reactors render at once
  (Status and About); with a shared id the second one steals the first's fill.
- **`assets/splash-reactor.png`** — 1024px, drawn to match the same reference.
  Generated by a throwaway System.Drawing script, not committed; if the art
  needs changing, redraw it or replace the file. Transparent background so it
  glows on the navy.

## Session 3 — full-bleed chrome, launch screen, Home tab

Driven by three reference images in `C:\Users\Fortmindz\Downloads\Jarvis UI\`
(`ChatGPT Image …`, `more screens.png`, `Home and splash screen.png`).

1. **The black band at the top is gone.** Every stack header is
   `headerTransparent`, and the tab navigator's `sceneStyle` and theme `card`
   are transparent. The opaque `COLOR.bg` header was painting a flat near-black
   strip over the status bar while the screen gradient started below it. Screens
   now run edge to edge and `Screen` pads its own content past the header
   (`Math.max(headerHeight ?? 0, insets.top)` — a `headerShown: false` screen
   still receives the context, reporting 0, which is what put Home's menu and
   bell under the status bar).
2. **`LaunchScreen`** — the reactor over a radial wash and two faint halo rings,
   with the reference's `YOUR INTELLIGENT ASSISTANT / FOR AUTOMATION AND
   PRODUCTIVITY` tagline. It is an overlay in `App.tsx`, not a route, so the
   socket is already probing behind it. Self-dismisses after 2.4s; a tap skips.
3. **`HomeScreen`** — "Hello, SIR", the command bar, four quick actions and a
   three-column status card. The greeting's addressee is `ADDRESS` in that file.
4. **Five tabs, matching the reference**: Home / Scripts / Commands / Reports /
   Settings. `StatusScreen` and `ConnectionScreen` moved into the Home stack;
   `ReportsScreen` is new (vitals, trace, script outcomes, last message).
5. **The tab bar floats and is frosted.** `position: absolute`, inset 16 and
   `CHROME.tabBarGap` (30) clear of the bottom, `tabBarBackground` = a
   `BlurView` over a tint. Android blur needs a `BlurTargetView` ref, so
   `RootNavigator` wraps the whole app in one. `TabIcon` animates selection.
6. **Tab jumps go through `getParent(TABS_ID)`.** Left to bubble, a
   `navigate('Scripts')` from a Home-stack screen could be answered by the Home
   stack itself — the screen changes but the tab bar stays lit on Home.
   `src/navigation/__tests__/rootNavigator.test.tsx` pins all four shortcuts.
7. `expo-asset` was added: `@expo/vector-icons` → `expo-font` requires it, and
   without it every jest suite importing an icon failed to resolve.
   `@react-navigation/elements` is now a direct dependency too.
8. **`StatusScreen` is deleted.** Every route into it landed the user on a
   screen that looked like the Home they had just left, with the tab bar still
   lit on Home. Its parts already live elsewhere: vitals and trace on Reports,
   the connect button and transport detail on Connection, and the parked-action
   `GovernancePanel` moved onto Home, where it only appears when something is
   actually waiting. The Home status card's three columns are now separate
   targets — Connection, Connection, Scripts tab — and the bell opens Reports.
9. **The greeting follows the device clock** (`src/theme/greeting.ts`: morning
   05–12, afternoon 12–17, evening 17–21, night otherwise), re-read on the
   minute while Home is mounted. `ADDRESS` in `HomeScreen` is the addressee.
10. **`TypeLine`** types the prompt out on a plain interval — the thing being
    animated is the string, not a style — and prints it whole when the
    Appearance screen's animations toggle is off.
11. `ArcReactor` takes a `monogram`: at 84px the wordmark cannot be read, and
    the ring alone reads as a black hole, so Home's small reactor carries a lit
    core and a `J`.

Verified: `npx tsc --noEmit` clean, 156 jest tests pass, and a throwaway Metro
on 8091 served `index.bundle?platform=android` with a 200.

## Session 4 — UI polish pass

No backend work. `docs/ui-reference-prompt.md` holds the image-generator prompt
that produces new reference mockups; keep its DESIGN SYSTEM block in sync with
`src/theme/tokens.ts`.

- **One press language.** `src/components/ui/Touchable.tsx` replaced five
  different `pressed && { opacity }` values. A held scale plus a dip reads on a
  fast tap where an opacity frame does not. Honours the animations toggle,
  which is also the reduced-motion switch.
- **`RADIUS` and `MOTION` tokens.** Radii were 12/14/16 by hand; motion had no
  vocabulary at all.
- **Keyboard.** `Screen` now wraps content in `KeyboardAvoidingView` and sets
  `keyboardShouldPersistTaps="handled"`. Without that last one a tap landing
  while the keyboard is open is spent dismissing it, and the button under the
  finger never fires — the single worst bug in the old build.
- **Pull to refresh** on Home and Reports, wired to `connect` (re-probe).
- **`Toast`** (`src/components/ui/Toast.tsx`, provider in `App.tsx`). Running a
  script or sending a command puts its result on the desk, not on screen, so
  those buttons used to do nothing observable. Now they confirm, and say when
  there is no link.
- **Screen entrance**: one fade-and-rise on the content, not a stagger.
- **Empty states are invitations**: unlit ring, what belongs here, how to start.
- **Settings is split** into rows that lead somewhere and rows marked SOON,
  which are genuinely disabled rather than dead taps. Connection now jumps to
  the Home stack's Connection screen instead of sitting inert.
- **Commands** offers four suggestion chips in the phrasing the desk expects.
- **Reports** uses `Badge` for outcomes; **Scripts** carries an outcome dot.
- `Button` gained `busy` (spinner, press blocked), used by Connection.

## Session 5 — the Claude Design reference, and the chrome it changed

The user generated a mockup sheet in Claude Design (12 frames, plus isolated
`JarvisTabBar` / `JarvisStatusBar` pages). It is only reachable while signed in;
`WebFetch` gets a 403, so it was read through the browser tools. What it changed:

- **Navigator headers are gone entirely** (`SCREEN_OPTIONS = { headerShown: false }`).
  Each screen renders `ScreenTitle` — a 22px display-face lockup with an optional
  caption ("5 SAVED") and a back chevron that appears when the stack can pop. A
  14px centred header above a screen with its own heading was two heads.
- **`GlassTabBar`** replaced the stock bar and `TabIcon`. The tab bar is now a
  custom `tabBar`, in the iOS idiom the user asked for (dribbble 19674219): a
  frosted pill floating 30px clear of the bottom, inactive tabs icon-only, the
  selected tab grown into an accent capsule carrying its label. Every item
  shrinks and the row clips to the pill radius — a fixed-width item is what let
  the grown capsule ride outside the container.
- **Launch screen has a progress rail** (`LoadingBar`): a filling bar with a
  brighter head and a sweeping sheen, under a label that names what is actually
  being waited on, not invented steps.
- **`CommandResultScreen` rebuilt** around a terminal card — traffic lights,
  `jarvis@desktop`, the echoed prompt — with COPY (`expo-clipboard`) and RUN
  AGAIN.
- Scripts rows take a per-script tile hue and put the outcome dot at the right
  edge; About carries the same `J` reactor as Home, one size up.

Held deliberately, at the user's instruction: **Home's reactor stays 84px** with
the `J` monogram — the sheet's 190px version was rejected.

**The bounce is gone.** Screen content no longer animates in, and the tab
selection is a timing curve: springy entrances read as lag, not polish.

## Session 6 — shipping to a phone, and the blur hunt

- **App id set**: `com.mypersonalintelligence.jarvis`, display name JARVIS.
  `eas.json` carries `preview` (standalone APK) and `development` (dev client).
  EAS project `@kaustav790/jarvis-mobile`.
- **Chat panel** replaced the Commands tab (`ChatScreen`): inverted bubble list
  pinned to a glass composer, typing dots, tap a reply to read it as terminal
  output. Voice needs no surface of its own — a transcript is another user turn.
- **Demo mode** (`src/state/demoFeed.ts`) stands in for the desk *and* the link:
  telemetry that moves, an approval request, a reply to every command, and a
  simulated handshake so screens do not read Disconnected while data flows. The
  Connection screen wears a SIMULATED badge; `simulated` is on the context.
- **Activity screen** behind the bell (approvals, then one timeline of commands,
  replies and agent steps). **QuickMenu** behind the hamburger — deliberately
  not a second Settings tab, only what is worth changing while looking at the
  HUD. Connection is registered in **both** the Home and Settings stacks, so
  neither route jumps tabs.
- **Tab bar**: the iOS Camera dial. Width follows dial position (`widthAt`), so
  growing and sliding are one motion; a 160ms press arms it; rubber band, spring
  settle, a tick per detent. Taps use `Gesture.Race`, not `Exclusive` — the
  latter made every tap wait out the hold before firing.
- **Haptics** (`src/lib/haptics.ts`): tap, good, bad. Wired to buttons, the run
  button, the toast (so an outcome cannot feel one way here and another there)
  and each detent.
- **`__tests__/app.test.tsx`** mounts the whole app as the device does. It
  needed the gesture-handler jest shim and the safe-area mock, and it found a
  real defect: `netSub.remove()` assumed a subscription `expo-network` does not
  always return.
- Git history was rewritten twice: author `Kaustav Sengupta`, email
  `kaustav.wlh@gmail.com` (the one GitHub links to `kaustav991a`). Backup branch
  `backup/pre-author-rewrite` still exists locally and can be deleted.
- `docs/cloud-app-link.md` specifies what the Render gateway owes for cloud
  failover: a `WS /app-link` speaking `src/ws/frames.ts` and taking bare text,
  plus `{"app_link": true}` in `/health`. The app already probes desk → cloud →
  dark and refuses a gateway that does not declare that flag.

## Next steps, in order

1. **Smoke tests for the nine screens and the ui kit.** Nothing under
   `src/screens/` or `src/components/ui/` is covered. Screens that call
   `useJarvis()` need a `<JarvisProvider>` wrapper, and `useLink` inside it hits
   the network — either inject a fake machine via `machineFactory` or mock the
   module. Screens using safe-area insets need `<SafeAreaProvider initialMetrics>`.
2. **Plan Task 15** — `__tests__/integration.test.ts` and `README.md`. Note the
   test as written in the plan uses global `fetch`; under jest that is Expo's
   stubbed winter fetch, so pass `mock/nodeFetch.js`'s `nodeFetch` as `fetchImpl`.
3. **Wire the screens that are still fixture-backed**: Scripts and Script Details
   read `src/data/fixtures.ts`. `/api/tasks` exists in the REST client; a script
   *run/edit* surface does not exist on the desk backend at all.
4. **Persist appearance settings.** `AppearanceProvider` is in-memory only.
5. **Voice.** `CommandBar` renders a mic and calls `onVoice`, which every screen
   currently leaves empty. No capture, no permission, no STT. The user asked for
   the icon only, deliberately.

## Deviations from the plan (all deliberate, all user-directed)

1. **Palette replaced.** The plan pinned the desk HUD's cyan-on-black
   (`#00ffcc` / `#050505`) and forbade approximation. The user rejected the look.
   It is now electric blue on navy — `COLOR.blue #3ea6ff` on `COLOR.bg #020814`.
   `src/theme/__tests__/tokens.test.ts` pins the new values and asserts no cyan
   survives.
2. **No single canvas.** The plan says "no expo-router, no tab bar, no navigation
   chrome. One scrolling HUD canvas." The user chose the full tabbed app from the
   second reference image. React Navigation 7 (not expo-router) is used.
3. **Task 14's HudScreen does not exist.** Its reducer-owning job moved to
   `src/state/JarvisProvider.tsx` so four tabs share one socket.
4. **Deleted:** `Reticle`, `StatusOrb`, `Scanline`, `Sheet`, `PreviewScreen`, and
   their tests. `ArcReactor` replaces the first two; the user rejected the sheet.
   `statusColor` now lives in `src/theme/status.ts` and takes an accent argument.
5. **Mock tests use a node:http fetch shim** (`mock/nodeFetch.js`) because
   jest-expo's global `fetch` is a stubbed native module that returns
   `status: undefined`. One plan expectation was corrected: the WS connect
   greeting arrives before the client's `open` handler attaches.

## Running it

```bash
npm install
npm run mock         # terminal 1 — http://127.0.0.1:8787
npx expo start -c    # terminal 2 — scan with Expo Go
npm test             # jest
npm run typecheck    # tsc --noEmit
```

Use `-c` after any dependency change or app.json edit. Without it Metro serves a
stale module map and fails the bundle with a 500 that looks like a missing
package (see Session 2 above).

The phone cannot reach `127.0.0.1` on the dev machine. To actually connect, set
`EXPO_PUBLIC_JARVIS_DESK` to the machine's LAN IP in `.env.local` and run the
mock there. Until then the app honestly reports **Disconnected**, which is what
the Connection screen is for.

## Known gaps

- Backend work in design §6 (bind host, app auth, push, presence, cloud
  `/app-link`) is owed on the desk machine and is unverified from here.
- General / Connection / Notifications / Security rows on Settings are inert.
- "System" theme on the Appearance screen behaves identically to Dark.
- Script edit is a button with a note saying no endpoint exists.
