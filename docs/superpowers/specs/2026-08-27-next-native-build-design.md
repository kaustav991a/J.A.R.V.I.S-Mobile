# The next native build — four things that cannot ship over the air

Written 2026-08-27, **awaiting approval. Nothing has been built.**

## Why this document is about a build rather than about alarms

*"Can the app set alarms?"* was asked on 2026-08-27, after an exchange at 04:17 in which
J.A.R.V.I.S. answered *"I can't set alarms from here, Sir; please set the 10AM alarm on your
device."* That answer is true and the feature is small — perhaps forty lines.

**It cannot be published.** `runtimeVersion` is `{ policy: "fingerprint" }`, and
`android.permissions` in `app.json` is a fingerprint input. Adding one permission moves the
runtime, and a publish to a runtime no device has uploads happily, prints `Published!` and
arrives nowhere — which cost this project a day on 2026-08-24 over two npm scripts.

So the unit of work is not *alarms*. It is **the next APK**, and three other things have been
waiting for one. Spending a build on a single feature and then discovering the next one a
week later is the failure this document exists to prevent.

## The four

### 1. Setting an alarm — `com.android.alarm.permission.SET_ALARM`

`AlarmClock.ACTION_SET_ALARM` with `EXTRA_HOUR`, `EXTRA_MINUTES` and `EXTRA_MESSAGE`. The
clock app rings it; this app never holds a timer, never wakes itself, and owns no state. That
is the whole appeal — **the reliability is Android's**, and a JARVIS alarm that failed
because a background task was throttled would be worse than no alarm at all.

**Recognised on the phone, never by the model.** This is the `asOpenAppCommand` rule and it
is not negotiable: a model cannot set an alarm, so a model asked to set one can only *say* it
did. `asSetAlarmCommand(text)` parses the instruction in `lib/`, pure and tested, and the
native call happens in the app. `openApp.ts` carries the reasoning in full.

**Narrow, and ambiguity declines.** The existing doctrine — *ties always lose* — applies
harder here, because a wrong app launch takes over the screen while a wrong alarm ruins a
morning.

| Instruction | Result |
| --- | --- |
| `set an alarm for 10am` | 10:00 |
| `set an alarm for 6:30` | ambiguous — **declines and asks**, since 6:30 is twice a day |
| `wake me early` | declines. Not a time |
| `remind me to call mum at 4` | declines. A reminder is not an alarm, and pretending otherwise teaches the wrong mental model |

**`EXTRA_SKIP_UI` stays false.** The clock app opens with the alarm filled in and a human
confirms it. Skipping that would mean this app silently arming something that makes noise at
6 AM, on a parse it did in one regex. The confirmation is the feature, not friction.

**Open question for approval:** whether an unconfirmed alarm should be logged as a turn. It
follows `open spotify`, which answers *"Spotify, sir."* — but *"Alarm set"* would be a lie
when the clock UI is still open and unconfirmed. Suggested wording: *"The clock has it, sir —
confirm it and it is set."*

### 2. Battery on the persona envelope — `expo-battery`

§3.2.1's remaining half. `buildAsk` already carries the clock, the named places and a `where`
block, and the deployed gateway reads all of it. Battery and link state are what is missing,
and battery is the one needing a dependency.

**Small, and it earns its place**: *"you are at 8% and forty minutes from home"* is a
different sentence from *"you are forty minutes from home"*, and only one of them is worth
being told.

### 3. Sightings without opening the app — `ACCESS_BACKGROUND_LOCATION`

**The `timeline` row's real weakness, and it is structural rather than a bug.** `timeline.ts`
says it out loud: *"what this measures is LAST SEEN, not left"* — sightings happen when the
app is opened, so if you never open it on the way out, the last sighting predates your
leaving and *"usually gone by"* runs early.

`expo-location`'s manifest declares fine and coarse only. Background location is the fix and
it is also the most invasive thing on this list: a permission that reads as tracking, and
Android's own two-step grant. **This one should be argued for separately rather than waved
through with the other three** — it is the only item here that changes what the app knows
about you when it is closed.

### 4. A real release keystore — queue 18

Release is signed with Expo's generated debug keystore, which is why a local APK and an
EAS-signed one cannot replace each other. **It is free to fix during a build that is
happening anyway**, and the blocker on a second device forever if it is not.

## What the build itself has to get right

**Read the fingerprint before and after, and against the phone.** `AGENTS.md` carries the
whole trap; the short version is that a moved runtime is invisible from the publishing side.

```bash
npx expo-updates fingerprint:generate --platform android
```

**The new APK must be installed before anything else ships over the air.** Once the runtime
moves, every existing JS-only fix stops reaching the old build — so the sequence is: build,
install, verify the fingerprint matches, and only then resume publishing.

**`android/` is gitignored and generated.** A local `expo prebuild` writes the literal
placeholder `file:fingerprint` into `strings.xml`, which is its own way of silently breaking
OTA. EAS is the safe path.

## What this document does not propose

**Not `QUERY_ALL_PACKAGES`.** `withPackageQueries.js` already declares a MAIN/LAUNCHER
`<queries>` block, which is exactly the set of apps a person can launch. The broad permission
is restricted, would need justifying to Google, and buys nothing here.

**Not `SCHEDULE_EXACT_ALARM`.** That is for an app holding its own alarms, which is precisely
what item 1 avoids.

**Not the notification listener.** It is gated on the token split (§4.1.1) and is gateway
work first — see `docs/brain-dependencies.md`.
