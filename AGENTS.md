# jarvis-mobile — read this first

The phone half of a personal assistant. Expo / React Native, TypeScript, five
tabs, one WebSocket to a desk machine with a cloud fallback.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code. Do not answer Expo questions from memory — this SDK moved, and
guessing here has cost real time.

## Where to look, in order

| Read | For |
| --- | --- |
| `README.md` | Setting up a machine. Prerequisites, exact SDK/NDK versions, dev builds, adb debugging, and the traps |
| `docs/status/ledger.json` | **The single source of truth for every status claim.** Every feature row, the ten completion criteria, and a typed `blockedBy` on each — `brain` / `desk` / `device` / `app-build` / `app`. Small, so read this rather than the prose. Nothing else in this repo may carry a status claim |
| `ROADMAP.md` | **The plan, and the reasoning behind it.** §10 is the order to do things in. §0b and §0c are **generated** from the ledger above and must not be hand-edited — run `node scripts/build-status.mjs` |
| `RESUME.md` | **How something was proved, and what it cost to find out.** Append-only archaeology — the measurements, the wrong hypotheses, the sessions they cost. Not the status, not the queue |
| `TESTING.md` | **What to tap and what should happen**, feature by feature. For a human with the phone in hand. Never says whether something is built |
| `docs/desk-watch.md` | What the desk owes for the intruder watch. Phone side done, desk side unbuilt |
| `docs/cloud-app-link.md` | What the Render gateway owes for cloud failover |
| `docs/superpowers/specs/` | The original design |
| `docs/superpowers/plans/` | The original 15-task plan, **partly superseded** — read "Deviations" in `RESUME.md` first. `2026-08-24-app-completion.md` is the current app-only queue |
| `docs/completion-tracker.html` | A browser view for a human. **Opens on the eight goals** — every row and open task filed under one, in four states (completed / in progress / not started / queued) with what each goal unlocks. The six technical areas are still below it. **Generated**, like §0b: open it, never edit it. A row with no `goal` fails the build rather than vanishing from the page |
| `docs/brain-dependencies.md` | Everything blocked on `jarvis-brain`, which is **closed as of 2026-08-26** — the rows, the queue items, and what is dangerous about reopening it. **Generated**, like §0b: read it, never edit it |
| `src/ws/frames.ts` | The wire contract. The best single file for understanding the data |

## Before you claim anything works

```bash
npm test          # 991 tests, and this number goes stale — trust the run, not the comment
npm run typecheck # tsc --noEmit
node scripts/build-status.mjs --check  # §0b, the tracker and brain-dependencies still match the ledger
```

All three must pass. Several real bugs here were caught by a test rather than by
the phone, and several more were only caught *on* the phone — so for anything
native, say what you actually verified and how.

**When you change what is built, change `docs/status/ledger.json` and run
`node scripts/build-status.mjs`.** Editing §0b, the tracker or `docs/brain-dependencies.md`
directly is lost work — the next generate reverts it without saying so. `status:check` is there so a stale table is
a failure rather than a discovery.

## Non-obvious rules this codebase has learned

Each is documented at the site that depends on it. Collected here because the cost
of rediscovering them is high.

- **A promise that settles into provider state goes through `live()`.** An effect
  resolving after its tree is gone sets state on a dead tree; under test it does so
  outside `act`, and enough of those corrupt the act environment until every later
  `render` in the file returns an **empty tree** — no throw, no warning, queries that
  find nothing. It reads as a component that failed to mount and it cost six tests.
  `state/live.ts` is a per-run scope: `const l = live()` in the effect body,
  `.then(l.only(handler))`, `return l.end`. It is a factory and not a hook on purpose —
  a provider-lifetime guard cannot cancel a **dependency change**, which the alert
  registration at `[alert?.id, alert]` needs. `effectCancellation.test.tsx` scans the
  provider and fails on a bare settle, which is how one came to exist unnoticed among
  eight guarded ones.
- **Expo Go cannot run this app.** It lacks the native modules and gives no
  diagnosis when it fails. Use a development build for everything.
- **Adding an npm package** means restarting Metro with `npx expo start -c`. A
  reload does not clear the module map, and the failure looks exactly like a
  missing package that is sitting right there on disk.
- **Changing `app.json` or a plugin** means a new dev build — or
  `expo prebuild --clean` if `android/` exists locally. Native config that looks
  applied but is not is this project's most expensive recurring bug.
- **Reanimated worklets do not capture default parameters.** The closure is built
  from identifiers in the **body**. A default like `strength = MAGNET` compiles,
  passes jest (JS thread, real closure), then throws on the UI thread once per
  frame.
- **Do not mount `BlurTargetView`.** It segfaults the RenderThread — HWUI recurses
  512 frames because the target wraps the app while the `BlurView` sampling it is
  inside that subtree. Full tombstone in `src/components/ui/Glass.tsx`.
- **`shadowColor` / `shadowRadius` are iOS-only.** Anything that must glow on
  Android needs SVG opacity and stroke width, or `textShadowRadius`. `elevation`
  is not a substitute — it draws a grey shadow and reorders siblings.
- **Android rejects `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`** outright. With a
  passcode fallback enabled, always request `strong`, or no sheet appears and the
  promise never settles.
- **A native crash is silent.** No red box, nothing an `ErrorBoundary` sees. Use
  `adb logcat` and read the `F DEBUG` tombstone frames; the loop is in `README.md`.
- **The desk owns the desk-watch countdown, and silence locks.** The phone's
  countdown is a readout, never a decision timer. Do not move that clock.
- **`Modal` is not exported under this jest setup.**
  `require('react-native').Modal` is `undefined` on RN 0.86 here, so a test renders
  the screen with the modal's contents silently absent — no throw, no warning, and
  it reads exactly like a component that failed to open. Overlays that need testing
  are in-tree absolute views; see `DetailBox` in `src/screens/ActivityScreen.tsx`.
  An absolute child of `Screen` scrolls away with the content, so such an overlay
  goes beside `Screen`, not inside it.
- **Home's Chat card is the way into Chat without a finger.** The tab bar cannot be
  driven by `adb` (see the trap below), but the Chat card on Home is an ordinary
  `Pressable` and `adb shell input tap` opens it. Scroll Home to the top first, then tap
  around `(612, 781)` on a 1236×2750 screen. There is no `linking` config on the
  navigator, so **deep links will not route to a screen** — do not reach for
  `am start -d exp+jarvis-mobile://…`, it goes nowhere.
- **`uiautomator dump` never succeeds on this app.** It returns
  `ERROR: could not get idle state` because the reactor animates continuously, so the
  accessibility tree never settles — and it leaves a **stale SystemUI tree** behind,
  which reads like a successful dump of the wrong screen. Use `adb shell screencap -p`
  and read the image instead.
- **Run `adb` from PowerShell, not Git Bash, for anything with a device path.** Git Bash
  rewrites `/sdcard/x.png` into `C:/Program Files/Git/sdcard/x.png` before `adb` sees it,
  and `adb pull` then fails with *failed to stat remote object* naming a Windows path.
  It looks like a device fault and is not.
- **`NoUpdatesAvailable` does not mean the update failed to arrive.** It means *nothing
  newer than what I already hold*, which is the same string whether the app is up to date
  or invisible to the server. To tell them apart, ask the server exactly what the app asks:

  ```bash
  curl -s -H "expo-platform: android" \
       -H "expo-runtime-version: <the phone's hash>" \
       -H "expo-channel-name: production" \
       -H "expo-protocol-version: 1" -H "expo-api-version: 1" \
       -H "expo-expect-signature: false" \
       https://u.expo.dev/f047fd2e-e0fd-4d50-a70c-564bfb1d6da6
  ```

  A manifest back means the update is servable for that runtime, so `Unavailable` is
  "already applied". Read the phone's own hash with
  `aapt2 dump resources <apk> | grep -A 1 expo_runtime_version` after pulling the APK
  with `adb pull $(adb shell pm path <pkg> | cut -d: -f2)`.
- **Adding an npm script silently breaks OTA.** `packageJson:scripts` is a
  **fingerprint input**, so `runtimeVersion: { policy: "fingerprint" }` moves the
  moment you add one. Two convenience scripts took the runtime from `31c64113` to
  `3f9be979` on 2026-08-24, and the publish that followed went to a runtime **no
  device has** — it uploaded, printed `Published!`, and arrived nowhere. `eas update`
  cannot warn about this: from its side a new runtime is a normal thing to publish to.

  So **read the runtime in the publish output against the phone's** every time, and
  before touching `package.json` at all:

  ```bash
  npx expo-updates fingerprint:generate --platform android   # must not move
  ```

  Anything that must ship over the air goes in `scripts/` and is invoked directly
  (`node scripts/build-status.mjs`), not through `npm run`. If a script is genuinely
  worth the fingerprint change, it needs a new build in the same sitting.
- **A local release build silently breaks OTA.** `runtimeVersion` is
  `{ policy: "fingerprint" }`, and `expo prebuild` writes the literal placeholder
  `file:fingerprint` into `android/app/src/main/res/values/strings.xml`. **EAS builds
  substitute the real hash; a local `./gradlew assembleRelease` does not** — the task
  `:app:createReleaseUpdatesResources` runs and leaves it alone, and no generated
  resource overrides it. The APK then asks the update server for updates matching
  `file:fingerprint`, gets none, and runs its embedded bundle forever. Nothing logs a
  word about it. Check it after any local build:

  ```bash
  aapt2 dump resources <apk> | grep -A 1 expo_runtime_version   # must be a hash
  ```

  Either build through EAS for anything that must receive updates, or bake the hash by
  hand (`npx expo-updates fingerprint:generate --platform android`) before building —
  remembering that `android/` is gitignored and generated, so a later `prebuild` puts
  the placeholder back without saying so.
- **`Touchable` cannot be driven by `adb shell input`; `SettingsRow` can.** Measured on
  2026-08-26 across three methods — `input tap`, a held `input swipe`, and an explicit
  `input motionevent DOWN/UP` — against RESET and PREVIEW on Places. None fired: the row
  text never changed and no notification was posted. `Touchable` is
  `Animated.createAnimatedComponent(Pressable)`, and synthetic events do not reach it. A
  plain `Pressable`/`SettingsRow` takes `input tap` normally, which is how Settings →
  Places opens. So **anything rendered as a `Touchable` — RESET, PREVIEW, SETTINGS,
  UPDATE, the X on a named place — needs a human finger.** Plan a device check so the
  taps you cannot make are the ones you ask for.
- **Home's Chat card is the reliable way into the conversation from a laptop.** A plain
  `input tap` on it opened Chat on 2026-08-27, on a session where the tab bar refused a
  tap and two held swipes at the same point. The tab bar is a dial and its hit areas move
  with it; the card does not move. **Reach for the card, not the tab.**
- **The tab bar takes a held `input swipe`, not a tap.** `AGENTS.md` said neither worked;
  a 140ms `input swipe x y x y 140` on the Settings tab switched tabs on 2026-08-26, where
  a plain `input tap` at the same point did nothing. `GlassTabBar` handles touch through
  gesture-handler, which wants a press duration rather than an instantaneous down-up.
- **RNTL 14 renders asynchronously.** `render()` returns a promise — every suite
  here awaits it — and a state change caused by `fireEvent.press` needs awaiting
  too. A synchronous `getByTestId` straight after a press finds nothing and looks
  like a handler that never fired.
- **`eas update` needs `--platform android` or it fails on web.** The export defaults to
  `--platform=all`, and the web bundle cannot resolve
  `expo-sqlite/web/wa-sqlite/wa-sqlite.wasm` — the file is not in `node_modules`. The import
  chain is `App.tsx → src/lib/commuteTask.ts → journal/store.ts → expo-sqlite`, so anything
  that reaches the journal drags it in. It fails **after** a full minute of bundling with
  `Web Bundling failed`, `✖ Export failed`, and nothing about Android, which reads like a
  broken publish rather than a platform this app does not ship.
- **Never `mockRestore()` a spy on AsyncStorage.** `jest-setup.js` installs the
  library's own jest mock, so `setItem`/`getItem` are *already* `jest.fn`s —
  `jest.spyOn(AsyncStorage, 'setItem').mockRestore()` hands back a mock with **no
  implementation**, and from then on every write in that file is silently dropped and
  every read returns a stale value. It cost four tests in `taskHealth.test.ts`, where
  it reads exactly like a storage helper that does not work. Use
  `(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(...)` to make one call
  fail and leave the implementation alone.

## House style

Comments explain *why*, especially where the obvious approach was tried and
failed — that is what most of the comments in this codebase are. Match the
surrounding density rather than adding or stripping commentary. Tests are named as
sentences describing the behaviour, and the interesting ones carry a comment
saying which bug they exist to prevent.
