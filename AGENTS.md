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
| `docs/status/ledger.json` | **The single source of truth for every status claim.** 77 feature rows, the ten completion criteria, and a typed `blockedBy` on each — `brain` / `desk` / `device` / `app-build` / `app`. Small, so read this rather than the prose. Nothing else in this repo may carry a status claim |
| `ROADMAP.md` | **The plan, and the reasoning behind it.** §10 is the order to do things in. §0b and §0c are **generated** from the ledger above and must not be hand-edited — run `npm run status` |
| `RESUME.md` | **How something was proved, and what it cost to find out.** Append-only archaeology — the measurements, the wrong hypotheses, the sessions they cost. Not the status, not the queue |
| `TESTING.md` | **What to tap and what should happen**, feature by feature. For a human with the phone in hand. Never says whether something is built |
| `docs/desk-watch.md` | What the desk owes for the intruder watch. Phone side done, desk side unbuilt |
| `docs/cloud-app-link.md` | What the Render gateway owes for cloud failover |
| `docs/superpowers/specs/` | The original design |
| `docs/superpowers/plans/` | The original 15-task plan, **partly superseded** — read "Deviations" in `RESUME.md` first. `2026-08-24-app-completion.md` is the current app-only queue |
| `docs/completion-tracker.html` | A browser view for a human — percentages, dependency badges, filters by state and by blocker. **Generated**, like §0b: open it, never edit it |
| `src/ws/frames.ts` | The wire contract. The best single file for understanding the data |

## Before you claim anything works

```bash
npm test          # 883 tests, and this number goes stale — trust the run, not the comment
npm run typecheck # tsc --noEmit
npm run status:check  # generated §0b and the tracker still match the ledger
```

All three must pass. Several real bugs here were caught by a test rather than by
the phone, and several more were only caught *on* the phone — so for anything
native, say what you actually verified and how.

**When you change what is built, change `docs/status/ledger.json` and run
`npm run status`.** Editing §0b or the tracker directly is lost work — the next
generate reverts it without saying so. `status:check` is there so a stale table is
a failure rather than a discovery.

## Non-obvious rules this codebase has learned

Each is documented at the site that depends on it. Collected here because the cost
of rediscovering them is high.

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
- **The tab bar cannot be driven by `adb shell input`.** Every tab node reports
  `clickable=false` — `GlassTabBar` handles touch through gesture-handler, not Android
  click semantics — so neither `input tap` nor a held `input swipe` at the right
  coordinates switches tabs. A `Pressable`/`SettingsRow` accepts `input tap` normally,
  so in-screen automation works and **tab switching needs a human finger.** Plan device
  checks to start on the tab you need, or ask for the one tap.
- **RNTL 14 renders asynchronously.** `render()` returns a promise — every suite
  here awaits it — and a state change caused by `fireEvent.press` needs awaiting
  too. A synchronous `getByTestId` straight after a press finds nothing and looks
  like a handler that never fired.

## House style

Comments explain *why*, especially where the obvious approach was tried and
failed — that is what most of the comments in this codebase are. Match the
surrounding density rather than adding or stripping commentary. Tests are named as
sentences describing the behaviour, and the interesting ones carry a comment
saying which bug they exist to prevent.
