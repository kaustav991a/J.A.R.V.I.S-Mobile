# Resume point — jarvis-mobile

Branch: `feat/mobile-hud`. Written 2026-08-10, extended 2026-08-11.

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

The app was being built from `../docs/superpowers/plans/2026-08-10-jarvis-mobile-hud.md`
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
