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
| `RESUME.md` | **Where the work stands and what is owed next.** Start at "Start here"; "Still owed" is the prioritised list |
| `ROADMAP.md` | The longer arc |
| `docs/desk-watch.md` | What the desk owes for the intruder watch. Phone side done, desk side unbuilt |
| `docs/cloud-app-link.md` | What the Render gateway owes for cloud failover |
| `docs/superpowers/specs/` | The original design |
| `docs/superpowers/plans/` | The original 15-task plan, **partly superseded** — read "Deviations" in `RESUME.md` first |
| `src/ws/frames.ts` | The wire contract. The best single file for understanding the data |

## Before you claim anything works

```bash
npm test          # 461 tests
npm run typecheck # tsc --noEmit
```

Both must pass. Several real bugs here were caught by a test rather than by the
phone, and several more were only caught *on* the phone — so for anything native,
say what you actually verified and how.

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

## House style

Comments explain *why*, especially where the obvious approach was tried and
failed — that is what most of the comments in this codebase are. Match the
surrounding density rather than adding or stripping commentary. Tests are named as
sentences describing the behaviour, and the interesting ones carry a comment
saying which bug they exist to prevent.
