# jarvis-mobile — upgrades and roadmap

Written 2026-08-11. Companion to `RESUME.md`, which records what has been built
and why. This file records what has **not**, in the order it is worth doing.

Every item names the files it touches. Anything marked **blocked** needs a
surface the desk backend does not expose yet — those are listed together in
§4 so the backend work can be scoped in one pass rather than discovered
item by item.

---

## Building an installable APK

The UI is complete enough to hand to a phone. `eas.json` carries a `preview`
profile that produces a plain APK over internal distribution.

```bash
eas login                                  # interactive — your Expo account
eas build -p android --profile preview     # ~10-20 min on the free queue
```

The build finishes with a download URL and a QR code. On the phone: open the
link, allow installs from that browser, install. No Play Store, no signing set
up by hand — EAS generates and keeps the keystore.

A local `npx expo run:android --variant release` is the alternative, but this
machine has neither a JDK nor an Android SDK, so that path starts with an
Android Studio install and several GB of downloads. Cloud is faster here.

**Demo mode carries the build.** With no desk on the network the app would open
on an empty HUD reporting failure, which tests nothing. `src/state/demoFeed.ts`
is a stand-in desk: telemetry that moves, a status word that changes, agent
trace lines, one approval request, and a reply to every command. It emits real
frames through the real reducer, so no screen has a second code path. A real
desk always wins; the switch is in the Home menu. Turn it off before judging
whether the transport works.

---

## 0. Where the app actually stands

Honest inventory, because the roadmap only makes sense against it.

**Real, end to end**
- Transport: LAN probe → cloud fallback → WebSocket, with reconnect
  (`src/link/`). Frames drive one reducer (`src/state/hudReducer.ts`) shared by
  every tab through `JarvisProvider`.
- REST client for `/api/health-summary`, `/telemetry`, `/backdoor`, `/pending`,
  `/confirm`, `/tasks`, `/presence` (`src/api/client.ts`).
- Sending a command, and approving or denying a parked agent action.
- A Node mock of the desk backend (`mock/server.js`) with its own tests.

**Real UI over fixture data**
- Scripts, Script Details, the Reports "script outcomes" list and the sample
  command output all read `src/data/fixtures.ts`. Nothing about them is live.

**Present but inert**
- The mic on `CommandBar` calls `onVoice`, which every screen leaves empty.
- Settings rows marked SOON: General, Notifications, Security.
- Editing a script.

**Not persisted at all**
- Appearance (accent, glow, animations) — `src/theme/appearance.tsx` is memory
  only, so every cold start resets the user's choices.
- The desk address. `EXPO_PUBLIC_JARVIS_DESK` is read once at bundle time
  (`src/link/config.ts`); a user cannot enter their own.
- Command history — `recent` lives in `JarvisProvider` state.

**Never wired**
- The pairing token. `saveToken`/`loadToken` exist and `useLink` reads one, but
  nothing in the UI ever writes one, and `createApi` is called with
  `token: null`, so REST calls go out unauthenticated.

---

## 1. Phase one — finish what is already half-built

No backend work. Highest ratio of value to risk.

1. **Persist appearance and endpoint.** One storage module owning
   `expo-secure-store` for secrets and `AsyncStorage` for preferences, consumed
   by `AppearanceProvider` and a new endpoint setting. Fixes the two most
   visible "the app forgot" moments.
   *Touches:* `src/theme/appearance.tsx`, new `src/state/storage.ts`.
2. **A real Connection settings screen.** Enter the desk's LAN address, see it
   validated by an actual probe, save it. Today the address is a build-time
   constant and the Connection screen can only report failure.
   *Touches:* `src/screens/ConnectionScreen.tsx`, `src/link/config.ts`.
3. **Pair with a token.** Enter or scan the desk's pairing token, store it in
   SecureStore, pass it to `createApi` as well as the socket. Until this lands,
   any REST call the desk protects will 401.
   *Touches:* `src/state/JarvisProvider.tsx`, `src/link/useLink.ts`, Settings.
4. **Screen tests.** Nothing under `src/screens/` is covered except Home,
   Launch, Settings and Commands. Same pattern as
   `src/screens/__tests__/settingsAndCommands.test.tsx`.
5. **Plan task 15**: `__tests__/integration.test.ts` and a `README.md`. Use
   `mock/nodeFetch.js`'s `nodeFetch` as `fetchImpl` — jest-expo's global fetch
   returns `status: undefined`.

## 2. Phase two — make the live data live

Each of these swaps a fixture for a real call that already exists.

1. **Scripts from `/api/tasks`.** The endpoint is in the REST client and unused.
   Keep the fixtures as the offline fallback so the list is never empty in a
   demo, but label the difference honestly.
   *Touches:* `src/screens/ScriptsScreen.tsx`, `src/data/fixtures.ts`.
2. **Reports from telemetry.** `VitalsPanel` already renders live telemetry when
   frames arrive; the script-outcome list underneath it is still fixture data.
3. **Command result from the reply frame.** `CommandsScreen.latestReply()` falls
   back to `SAMPLE_RESULT` when disconnected — make the fallback visibly a
   sample rather than something that reads as a real machine's output.
4. **Command history that survives a restart**, written by the same storage
   module from phase one.

## 3. Phase three — the things that make it feel like a product

1. **Voice.** `expo-speech-recognition` or a desk-side STT round trip: hold the
   mic, stream or post the clip, drop the transcript into the command bar for
   confirmation before sending. The user asked for the icon first, deliberately;
   this is the follow-through. Needs a microphone permission string in
   `app.json` and a clear recording indicator.
2. **Push notifications** for finished jobs and for parked actions awaiting
   approval — the one case where the phone genuinely needs to interrupt.
   Needs `expo-notifications`, a token registered with the desk, and a real
   quiet-hours setting rather than the inert Notifications row.
3. ~~**Haptics**~~ — done. `src/lib/haptics.ts` holds the whole vocabulary:
   a tap for a control firing, success and warning for outcomes. Wired to
   `Button`, `RunButton`, the toast (so an outcome can never feel one way here
   and another there) and each detent of the tab dial. Still to do: a setting
   to turn it off, alongside the animations toggle.
4. **Widget / quick actions** — a home-screen shortcut straight to the command
   bar. iOS App Intents and Android app shortcuts; both need a dev build.
5. **Script editing.** Blocked on §4.

## 4. Blocked on the desk backend

Collected so the backend work can be scoped once:

- **Script CRUD.** `/api/tasks` lists; there is no create, update, delete, or
  run-by-id. Script Details' EDIT button is disabled for exactly this reason.
- **Run history.** Outcomes and durations per run, so Reports stops inventing
  "Last run: 2h ago" from a fixture.
- **A push token registry** and a server-side sender.
- **App auth**: issue and revoke pairing tokens, and reject unauthenticated
  calls. Design §6 owes this and it is unverified from here.
- **Cloud gateway `/app-link`.** The app side of automatic failover is done and
  wired: `chooseMode` probes the desk, then the cloud, then goes dark, and
  re-probes on a 5s tick, on foreground, and on any network change.
  `EXPO_PUBLIC_JARVIS_CLOUD` now points at
  `https://jarvis-cloud-gateway.onrender.com`, whose `/health` answers 200.

  What the gateway still owes, checked 2026-08-11 against its own
  `/openapi.json` — it serves exactly `/health`, `/`, and one webhook path:

  1. **`WS /app-link`**, accepting `?token=…`, speaking the frames in
     `src/ws/frames.ts` and taking a bare command string (no JSON envelope —
     `LinkMachine.send` writes the text straight to the socket).
  2. **`{"app_link": true}` in the `/health` body.** The app refuses to choose
     a gateway that does not declare this, because a 200 alone would flip it to
     CLOUD and leave it on a dead socket — worse than staying dark. Add the
     flag only once the socket actually exists.
  3. Optionally `/api/backdoor` and `/api/confirm`, which would let commands
     work over REST while the socket is down.

  The free tier also sleeps; the cloud probe timeout was raised 4s → 8s, but a
  cold start still takes tens of seconds, so the first probe after idle will
  miss and the next tick will catch it.
- **Presence**, so the app can say the desk is awake but idle, rather than
  inferring it from socket state.

## 5. Quality and platform

- **Accessibility pass.** Touch targets are floored at 44–64px and roles are
  set, but nothing has been checked with a screen reader, and the dim palette
  (`COLOR.dim` on `COLOR.panel`) needs a contrast audit.
- **Reduced motion.** The Appearance toggle already gates every animation; wire
  it to the OS setting (`AccessibilityInfo.isReduceMotionEnabled`) as the
  default rather than requiring the user to find it.
- **Light theme.** "System" on the Appearance screen behaves identically to
  Dark. Either build the light palette or remove the option — a setting that
  does nothing is worse than an absent one.
- **Tablet and landscape.** `orientation` is locked to portrait and the layout
  assumes a phone; the reactor and the 2×2 quick-action grid both need a
  breakpoint before iPad is claimed.
- **Error surfaces.** `lastError` is shown only on the Connection screen. A
  failed command currently reports success-shaped toast copy.
- ~~**EAS build**~~ — done. `eas.json` `preview` profile builds a signed APK;
  first one shipped 2026-08-11 from `da7bf8a`. Still to do: **OTA updates**
  (`expo-updates`, so a UI change reaches the phone without a rebuild) and a
  `development` client build, which voice, notifications and widgets all need.
- **Crash and error reporting** before any external tester sees it.

## 6. Deliberately not doing

- **A light theme for the HUD's own sake.** The instrument look is the product;
  a light variant is only worth building if a real user asks.
- **Offline command queue.** The toast says "queued" today, which is a lie of
  convenience — either build a real queue with retry and expiry, or change the
  copy to say the command was dropped. Prefer changing the copy first.
- **Animation for its own sake.** The bounce was removed on purpose. New motion
  needs a reason beyond decoration.

---

## Suggested order

Phase one is four to six sessions and needs nobody else. Phase two is a session
once the desk answers. Phase three is gated on a dev build, so start the EAS
setup in §5 while phase one is in flight — it is the long pole for voice,
notifications and widgets alike.
