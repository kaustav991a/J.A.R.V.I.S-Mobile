# JARVIS Mobile

The phone half of a personal assistant. It talks to a desk machine over a
WebSocket, falls back to a cloud gateway, and goes honestly dark when neither
answers.

This README is a **setup guide for a fresh machine** — what to install, in what
order, and which traps cost real time. `RESUME.md` is the running log of where
the work stands; read this first, then that.

---

## 1. What you must install

Four things, and only the middle two are fiddly.

### Node

Built and tested on **Node 24.18** with **npm 11.16**. Anything from Node 20 up
should work; Expo SDK 57 requires 20+. There is no `engines` field pinning it.

```bash
node -v    # v24.18.0
npm -v     # 11.16.0
```

### JDK 17 — required, and the version matters

React Native 0.86 builds with **AGP 8.12**, which needs **JDK 17**. Not 21, not
11.

Microsoft's OpenJDK build is what this project was built against:

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot\
```

Check it:

```bash
java -version    # openjdk version "17.0.20"
```

If `java` is missing, install "Microsoft Build of OpenJDK 17" and set `JAVA_HOME`
to its folder.

### Android SDK — **without Android Studio**

Android Studio is *not required*. It is only a GUI over the SDK. You need the
command-line pieces, and you can install them yourself.

The versions below are not guesses — they are read from
`node_modules/react-native/gradle/libs.versions.toml`, which is what the build
actually asks for. If you upgrade React Native, re-read that file rather than
trusting this list.

| Piece | Version |
| --- | --- |
| compileSdk / targetSdk | **36** |
| build-tools | **36.0.0** |
| NDK | **27.1.12297006** |
| CMake | **3.22.1** |
| minSdk | 24 |

The NDK and CMake are **not optional**: `react-native-reanimated` and
`react-native-worklets` compile C++.

Steps:

1. Download Google's **"Command line tools only"** zip from the Android Studio
   downloads page (scroll past the IDE).
2. Unzip it so the tools end up at
   `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\` — i.e. that folder should
   contain `bin`, `lib`, `NOTICE.txt`, `source.properties`. **The `latest`
   folder name matters**; `sdkmanager` refuses to run from a bare `cmdline-tools`.
3. Install the packages (about 6–8 GB, mostly NDK):

```bash
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat" --licenses
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat" \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "cmake;3.22.1"
```

4. Set the environment variables permanently (PowerShell, user scope — no admin
   needed):

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdk, "User")
# then add these to your user Path:
#   %LOCALAPPDATA%\Android\Sdk\platform-tools
#   %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin
```

Open a **new** terminal afterwards, then check:

```bash
adb version     # Android Debug Bridge version 1.0.41
```

### An Expo account

The project is `@kaustav790/jarvis-mobile`, EAS project id in `app.json` under
`extra.eas.projectId`. `npx eas-cli login` when you need a cloud build.

---

## 2. Get the code running

```bash
git clone https://github.com/kaustav991a/J.A.R.V.I.S-Mobile.git
cd J.A.R.V.I.S-Mobile
npm install
npm test          # 287 tests
npm run typecheck # tsc --noEmit
```

If both pass, the JavaScript side is healthy on this machine. That is worth
confirming *before* fighting with any native tooling.

### Your local config file

`.env.local` is gitignored (`.env*.local`), so a fresh clone has none. Create it:

```
# The desk. Must be the machine's LAN IP — the phone cannot reach 127.0.0.1.
# Port 8000 is the real desk backend; use 8787 to point at `npm run mock`.
EXPO_PUBLIC_JARVIS_DESK=http://192.168.1.5:8000

# The cloud brain, used only when the desk does not answer.
EXPO_PUBLIC_JARVIS_CLOUD=https://jarvis-cloud-gateway.onrender.com
```

Find your LAN IP with `ipconfig` (the IPv4 address of your Wi-Fi adapter). **It
changes** when you move networks or your router reassigns — a stale value here is
the most common reason the app reports Disconnected.

Unset, it defaults to `http://127.0.0.1:8787`, which only the emulator or a
browser can reach. A physical phone cannot, so it will report Disconnected and
run on demo mode — which is correct behaviour, not a fault.

There is no in-app field for this yet; that is owed work (`RESUME.md`).

---

## 3. You cannot use Expo Go

**Expo Go will not run this app.** It lacks the native modules, and worse, it
gives no diagnosis when it fails. You need a **development build** — a custom APK
containing this project's native dependencies, which then loads your JavaScript
from Metro.

Native dependencies currently in play: `expo-blur`, `expo-local-authentication`,
`expo-notifications`, `expo-secure-store`, `expo-haptics`, `expo-clipboard`,
`react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`,
`react-native-svg`, `react-native-screens`.

There are two ways to get one.

### Option A — EAS (cloud). No SDK setup needed.

```bash
npx eas-cli build -p android --profile development
```

~15 minutes, uses your EAS quota, gives you a QR code and an install link.
Install the APK on the phone once; after that JavaScript changes just reload.

Useful to know: EAS uploads your **working directory**, not `git HEAD`. Uncommitted
changes *are* included, and the `Commit` field shown on the build page is only
provenance. Do not read it as what was built.

### Option B — local build. Free, fast after the first one.

```bash
npx expo run:android
```

First run is slow (Gradle downloads); later native rebuilds are ~3–6 minutes,
offline, no quota.

**`eas build --local` does not work on Windows.** It is a bash pipeline and needs
macOS/Linux or WSL2. On Windows, `expo run:android` is the local route.

**The trap with `expo run:android`:** it runs `expo prebuild`, which generates an
`android/` folder (gitignored, so your repo stays clean). This project's native
configuration is entirely plugin-driven — splash screen, local authentication,
notifications, all declared in `app.json`. Once `android/` exists it does **not**
pick up `app.json` changes automatically:

```bash
npx expo prebuild --clean    # after ANY app.json or plugin change
```

Skip that and your change silently does not apply. That failure mode — native
config that looks applied but isn't — is the single most expensive class of bug in
this project's history.

---

## 4. Day-to-day development

Two terminals:

```bash
npm run mock          # terminal 1 — stand-in desk at http://127.0.0.1:8787
npx expo start --dev-client   # terminal 2
```

Then open the JARVIS dev build on the phone and tap the dev server (same Wi-Fi),
or enter `http://<your-lan-ip>:8081` by hand.

In the Metro terminal: `r` reloads, `j` opens the debugger.

You do **not** need a desk to develop. Demo mode is on by default and stands in
for both the machine and the link — moving telemetry, an approval request, a reply
to every command, and a simulated handshake. The Connection screen wears a
SIMULATED badge so it is never lying to you about what it is.

### When to reload, and when to rebuild

| You changed | What to do |
| --- | --- |
| Any `.ts` / `.tsx` | Save. Fast refresh handles it |
| Something confusing after several edits | `r` in Metro |
| **Added or removed an npm package** | Restart with **`npx expo start -c`** |
| `app.json`, or a config plugin | New dev build (or `expo prebuild --clean` locally) |
| **Added a native module** | New dev build. No exceptions |

`-c` after a dependency change is not optional. Metro caches its module map at
startup, and a plain reload does not clear it — you get a 500 that reads exactly
like a missing package while the package is sitting on disk.

### Before you commit

```bash
npm test
npm run typecheck
```

287 tests, and they are load-bearing — several real bugs in this project were
caught by a test rather than by the phone.

---

## 5. Debugging on the phone with adb

This is the difference between a fifteen-minute fix and a lost day. Plug the
phone in over USB, enable **Developer options → USB debugging**, and accept the
RSA prompt on the phone.

```bash
adb devices -l            # confirm it is attached
```

**Screenshot:**

```bash
adb shell screencap -p /sdcard/shot.png
adb pull /sdcard/shot.png .
```

**A silent native crash** — the app vanishes with no red box, because a segfault
on the RenderThread is not something JavaScript can catch:

```bash
adb logcat -c                                              # clear first
adb shell am start -W -n com.mypersonalintelligence.jarvis/.MainActivity
adb shell pidof com.mypersonalintelligence.jarvis          # poll this
adb logcat -d > crash.log
```

Polling `pidof` matters: it separates "never started" from "started, then died",
which are different bugs. Then search `crash.log` for `F DEBUG` — the tombstone
frames name the exact library and function. That is how the Android blur crash
was finally diagnosed after previously costing a day.

A **release APK gives you none of this**. Use a dev build for anything native.

If you are on Git Bash, note that it rewrites `/sdcard/...` into a Windows path.
Use PowerShell for adb commands, or prefix with `MSYS_NO_PATHCONV=1`.

---

## 6. Traps that have already cost time

Each of these is documented in the code where it matters. Collected here so you
meet them before they bite.

- **`BlurTargetView` on Android kills the process.** Not a version or method
  problem: the target wraps the whole app while the `BlurView` sampling it sits
  inside that subtree, so HWUI's transform walk recurses 512 frames and the
  RenderThread segfaults. `TRY_ANDROID_BLUR` in `src/components/ui/Glass.tsx` is
  false and should stay false until the `BlurView` is moved outside the target.
- **Reanimated worklets do not capture default parameters.** A worklet's closure
  is built from identifiers in its **body**. `function f(x, y = SOME_CONST)`
  compiles, passes jest — which runs on the JS thread where the real closure still
  exists — then throws `Property 'SOME_CONST' doesn't exist` on the UI thread,
  once per frame. Read constants inside the body.
- **Android rejects weak biometrics combined with a device-credential
  fallback.** `BIOMETRIC_WEAK | DEVICE_CREDENTIAL` is refused outright rather than
  degraded: no prompt appears and the promise never settles. Always request
  `strong` when the passcode fallback is enabled.
- **`shadowColor` / `shadowRadius` are iOS-only.** Anything that must glow on
  Android has to use SVG opacity and stroke width, or `textShadowRadius`. Do not
  substitute `elevation` — it draws a grey material shadow and reorders siblings.
- **`softwareKeyboardLayoutMode` is `resize`,** and an edge-to-edge Android window
  is not resized for you. Screens that must clear the keyboard measure it.

---

## 7. Layout

```
App.tsx                     shell: providers, then three overlays
src/navigation/             5 tabs, each a native stack; GlassTabBar is the dial
src/screens/                one file per screen
src/components/             ArcReactor, CommandBar, and ui/ primitives
src/state/                  hudReducer + JarvisProvider (one socket, one reducer)
src/security/               AuthProvider — the app's own gate
src/lib/                    biometrics, haptics
src/link/                   transport choice, LinkMachine, useLink
src/ws/frames.ts            the wire contract. Start here to understand the data
src/api/client.ts           REST, for what the socket cannot do
src/theme/                  tokens, appearance, greeting, status colours
mock/server.js              stand-in desk: `npm run mock`
```

`src/ws/frames.ts` is the best single file to read first — every piece of data the
app displays arrives through it.

## 8. What is not built

See `RESUME.md` for the current list. The short version: no pairing token is ever
written (so authenticated endpoints cannot safely be exposed), the desk endpoint
has no in-app field, push notifications are installed but unregistered, voice is
an icon only, Scripts are fixture-backed, and the desk-side of the desk-watch
feature does not exist.

Everything needed to understand the remaining work is in the repo:

| File | What it holds |
| --- | --- |
| `RESUME.md` | Running log. Where the work stands, and what is owed next |
| `ROADMAP.md` | The longer arc |
| `docs/desk-watch.md` | What the desk owes for the intruder watch — frames, routes, the lock call, retention |
| `docs/cloud-app-link.md` | What the Render gateway owes for cloud failover |
| `docs/ui-reference-prompt.md` | The image-generator prompt for new reference mockups |
| `docs/superpowers/specs/` | The original design |
| `docs/superpowers/plans/` | The original 15-task plan. Partly superseded — read the Deviations section of `RESUME.md` before following it |
