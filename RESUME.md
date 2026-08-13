# Resume point — jarvis-mobile

Branch: `feat/mobile-hud`. Written 2026-08-10, extended 2026-08-11, 2026-08-12 and
2026-08-13.

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
