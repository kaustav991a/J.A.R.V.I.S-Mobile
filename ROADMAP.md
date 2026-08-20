# jarvis-mobile — upgrades and roadmap

Rewritten 2026-08-17. Companion to `RESUME.md`, which records what has been built
and why. This file records what has **not**, in the order it is worth doing.

**This supersedes the 2026-08-11 roadmap, which is not kept.** That version's
inventory had gone actively wrong — it claimed pairing was "never wired", Scripts
and Reports were fixture-only, and phases one through three unstarted. All of that
shipped between 08-11 and 08-14. A doc that records a stale claim as settled has
already cost this project two sessions once (the mute-channel phantom, `RESUME.md`
08-17), so the old text is gone rather than archived.

Every item names the files it touches. Anything needing a surface the desk or the
gateway does not expose is collected in §5, so that work can be scoped in one pass
rather than discovered item by item.

---

## 0. Where the app actually stands

17 screens, 426 tests, `tsc --noEmit` clean. A standalone release APK is installed
on the device as of 2026-08-17 14:46 and runs — JS bundled, no Metro.

**Real, end to end, and proved on hardware**
- Transport: LAN probe → cloud fallback → WebSocket with reconnect (`src/link/`),
  one reducer (`src/state/hudReducer.ts`) shared by every tab.
- Pairing with a token, stored in SecureStore. Rotation verified: the new token is
  accepted, the old refused 403.
- Push to a sleeping phone, which buzzed. Desk-watch alert reaching a closed app,
  and tapping it opening the alert screen.
- Chat surviving a force-stop. One socket per launch.
- Persisted appearance, biometric lock (`LockScreen`, `src/security/`), haptics,
  location and named places, the Memory screen, camera and photos.

**Built but never once exercised by a human** — the whole of §1.
- The microphone. `brains.usage.audio` is `0`.
- The morning briefing. `jarvis_commute_sent` has never been written.
- The desk-key handshake. `has_desk_key: false`.

**Known-lossy right now**
- Every sealed cloud turn is discarded for want of the desk's public key — 39 at
  last count, and the counter only goes up.
- Gateway rolling memory lives in process RAM under a shared `chat_id 0`. Every
  Render restart wipes it and every device shares the slot.

**Cost of a one-line JS fix today:** an 11-minute Gradle release build plus an
install, because there is no OTA channel. That number is why §3 exists.

---

## 1. Phase zero — prove what is already built

**No new features until this section is empty.** Three features have sat "built,
untested" for four days or more, and one of them is dropping data while it waits.
Ordered by cost of delay, not by effort.

1. **The desk-key handshake.** `has_desk_key: false`, and sealed turns are being
   dropped, not queued. The machinery is complete on both sides; it needs the desk
   brought up once so the keys can meet. Do this first because it is the only item
   here whose cost grows while it is deferred.
   *Touches:* nothing in this repo — `jarvis-brain` and the desk.
2. **Rotate `BRIDGE_SECRET`.** The old value passed through Render's access log
   before redaction landed, and it still opens `/desk-link` — a fake desk was
   connected with it repeatedly during testing. Both ends change together (Render
   env and `jarvis-backend/.env`), so it needs the desk on: **do it in the same
   sitting as item 1** rather than waiting for the desk twice.
3. **Speak into the microphone.** The oldest unverified thing in the project.
   Chat → hold the mic → speak → release, then read `brains.usage.audio`. The
   gesture, timer, meter and cancel/lock slides are all covered by tests; whether a
   clip transcribes is unknown. If the result is `fell_back` with
   `last_error_was_quota: false`, the mime type is wrong — the phone records m4a and
   Google documents `audio/aac`, not `audio/mp4`. That is a one-line fix, and it is
   the original complaint that started this feature.
4. **Fire a real briefing.** Settings → Places → set Home while standing in it, set
   a leaving time, then PREVIEW — do not wait for tomorrow to find out.
   **Read the 08-17 finding before trusting the result:** PREVIEW is the only path
   that can run `installHandler`, because it can only be pressed with the app open.
   It makes noise now solely because `preview: true` opts in. A real 20:00 briefing
   never touches that handler, so PREVIEW proves the content and the schedule,
   never the alerting. Home still reads `Not set`, and the briefing falls back to a
   live fix that a headless task cannot get — the gateway holding the schedule is
   the real fix, and it is in §5.
   *Touches:* `src/lib/notify.ts`, `syncCommuteTask`, `src/screens/PlacesScreen.tsx`.
5. **Re-test the located answers.** Both have been unverified since the fix landed
   on 08-13. Ask "is it raining here?" with sharing on — it should quote measured
   figures, and "could not fetch" means the phone's own lookup failed, so check
   sharing is on first, since without it no `where` is sent at all. Then "how far to
   the office" with Office named; it resolves against the label with no geocoder
   call, while unnamed destinations still go through Nominatim.

**The lock-screen trap that blocked the last attempt at 3–5:** `adb` can wake the
display but cannot unlock it, so the app launches behind the keyguard and never
reaches the foreground. `apps_linked: 0` in that state means nothing. Unlock the
phone by hand before testing any of this.

---

## 2. Phase one — stop losing what it learns

Both items are named in `RESUME.md` as the enabling conditions for forced tool-use,
so §4 is gated on this section.

1. **Gateway memory out of process RAM.** Rolling memory under `chat_id 0` in RAM
   means a Render restart wipes it and every device shares one slot. Supabase is
   already carrying the 12 stored facts and survives restarts; this belongs there.
   *Touches:* `jarvis-brain`, not this repo.
2. **Send the chat history.** The log is local-only (`src/state/chatStore.ts`) and
   the envelope carries exactly one turn, so the brain is reasoning from a memory
   the phone could have given it.
   *Touches:* `src/state/chatStore.ts`, `JarvisProvider.sendCommand`.

---

## 3. Phase two — stop debugging blind

1. **Crash and error reporting.** Owed before any external tester sees this, and
   more urgently than that: a native crash here is silent — no red box, nothing an
   `ErrorBoundary` sees — so today the only diagnosis is `adb logcat` on the one
   machine that built the APK.
2. **OTA updates (`expo-updates`).** A JS-only fix currently costs an 11-minute
   release build plus an install. Most fixes in this project are JS-only.
   *Touches:* `app.json`, `eas.json`.
3. **A real release keystore.** Release is signed with Expo's generated debug
   keystore, which is why the local APK and an EAS-signed one cannot be installed
   over each other. Fine while it is one phone; not fine at the first second
   device. See `android/app/build.gradle:112`.
4. **Render keep-warm, or accept the wait.** The free tier spins down after 15
   minutes and the first message pays ~50s of cold start. Nothing on the phone can
   fix this; a ping or a paid instance is the whole of the choice. The cloud probe
   timeout was already raised 4s → 8s, so the first probe after idle will miss and
   the next tick catches it — that is by design, not a bug to chase.

---

## 4. Phase three — make the answers trustworthy

Gated on §2. Ordered so that nothing is built on a silent failure.

1. **Verify Tavily first.** It is suspected of not working and cannot be checked
   from this repo — it lives in `jarvis-backend`. If search is silently failing,
   every question needing a lookup falls back to the model's weights, which looks
   exactly like the hallucination being reported. A failed search must surface as
   "I could not look that up", never as a fluent answer. Check this before building
   anything else on the gateway.
2. **Force tool-use over prose.** Weather, distance, time and telemetry become
   function calls; no tool answer means "I don't know". `RESUME.md` calls this the
   actual cure for hallucination.
3. **Provenance in the chat UI** — measured / from the desk / from memory. Makes
   guessing visible instead of anecdotal.
   *Touches:* `src/screens/ChatScreen.tsx`, `src/ws/frames.ts`.

---

## 4b. WhatsApp-like chat changes

The chat is the surface he actually uses, and it is the one place where the app
still feels like a terminal rather than a messenger. Nothing here is blocked on
the gateway; all of it is presentation the phone already has the data for.

1. **Compose a photo before sending it — preview plus a caption box.** *(asked
   for 2026-08-20)* Today the camera button sends immediately: press, and the
   photo is gone with no caption and no chance to look at it. The gateway already
   handles a caption — `see()` takes one and falls back to *"The operator sent
   this photo without a caption — react to it helpfully"* when it is empty, which
   is a worse prompt than anything he would have typed. So the missing half is
   entirely on this side.

   **This overrules a decision already written down.** `ChatScreen.tsx:237` says
   *"There is no separate caption step. A photo is usually the question"* — and
   `sendPhoto(result.shot, '')` on line 262 is that reasoning in code. It was
   right about the common case and wrong about the cost of the uncommon one:
   there is currently no way to ask *anything specific* about a picture, and no
   way to notice you photographed the wrong thing. Keep the fast path — SEND
   straight away with an empty box should still work — and add the step around
   it rather than in front of it.

   Wanted: after the shutter, the picture fills the compose area as a preview with
   the text box under it, a way to back out, and send only on SEND. The caption
   travels as the question rather than being invented.

   Worth getting right while building it, because the current path hides them:
   - **A photo in flight must say so.** A large base64 upload over a slow link is
     the longest wait in this app and currently the least visible one.
   - **A photo that failed to send must stay recoverable**, with the caption still
     attached — losing a typed caption to a dropped socket would be worse than
     the immediate send it replaced.
   - **The chat should show the thumbnail he sent**, not the word "Photo". The
     history already stores a text stand-in (`[sent a photo] <caption>`) for the
     model's benefit; what the operator sees should be the picture.

   *Touches:* `src/screens/ChatScreen.tsx`, the compose bar, and whatever holds
   the pending attachment. No native change, so it ships over the air.

2. **Sent / delivered / read ticks.** Already specified in `NEXT.md` §4 and the
   largest thing on this list — it needs an id on each outgoing ask and two new
   frames from the gateway. Listed here too because it is the other half of what
   makes a chat feel like a chat.

3. **Reply-to-a-message.** Quote the turn being answered. Cheap on screen,
   and it needs the same per-message id that the ticks do — so do it after §2
   rather than inventing a second identity for a message.

---

## 5. Blocked on the desk or the gateway

Collected so the backend work can be scoped once.

- **The briefing schedule.** The gateway holding it is the real fix for §1.4; a
  headless task on the phone cannot get the live fix it currently falls back to.
- **Script CRUD.** `/api/tasks` lists; there is no create, update, delete or
  run-by-id. Script Details' EDIT button is disabled for exactly this reason.
- **Run history.** Outcomes and durations per run, so Reports stops inventing
  "Last run: 2h ago" from a fixture.
- **Presence**, so the app can say the desk is awake but idle rather than inferring
  it from socket state.
- **A paid routing key.** Routing is OSRM's public server, which knows the road
  graph and not the road, so durations are free-flowing and the context says so.
  `_route_blocking` / `_route_to_blocking` are the only functions that change when
  a Mapbox or TomTom key exists.
- **Desk-watch, desk side.** The phone half is done; `docs/desk-watch.md` holds what
  is owed. The desk owns the countdown and silence locks — the phone's countdown is
  a readout, never a decision timer.

---

## 6. Phase four — platform debt

None of this blocks daily use. All of it is cheap and gets more expensive to
discover later.

- **Light theme: decide or remove.** "System" on the Appearance screen behaves
  identically to Dark. A setting that does nothing is worse than an absent one.
- **Accessibility pass.** Touch targets are floored at 44–64px and roles are set,
  but nothing has been checked with a screen reader, and `COLOR.dim` on
  `COLOR.panel` needs a contrast audit.
- **Reduced motion from the OS.** The Appearance toggle already gates every
  animation; default it to `AccessibilityInfo.isReduceMotionEnabled` rather than
  making the user find it.
- **Default the local build to arm64.** The universal APK is 100.7 MB across four
  ABIs with `minifyEnabled false`; arm64-only is ~35 MB and the phone is arm64.
  `-PreactNativeArchitectures=arm64-v8a`. Consider moving this and the 6144m
  jvmargs into `expo-build-properties` so both survive `prebuild --clean` — that
  reset has cost time twice.
- **Tablet and landscape.** `orientation` is locked to portrait and the layout
  assumes a phone; the reactor and the 2×2 quick-action grid both need a breakpoint
  before iPad is claimed.
- **Error surfaces.** `lastError` shows only on the Connection screen, and a failed
  command still reports success-shaped toast copy.
- **`AGENTS.md` says 287 tests.** It is 426, and it was stale before 08-14 too.
- **Widgets / quick actions.** A home-screen shortcut straight to the command bar —
  iOS App Intents and Android app shortcuts.

---

## 7. Deliberately not doing

- **A light theme for the HUD's own sake.** The instrument look is the product; a
  light variant is only worth building if a real user asks. §6 is about removing the
  dead option, not building the theme.
- **Offline command queue.** The toast says "queued" today, which is a lie of
  convenience — either build a real queue with retry and expiry, or change the copy
  to say the command was dropped. Change the copy first.
- **Animation for its own sake.** The bounce was removed on purpose. New motion
  needs a reason beyond decoration.
- **Rebuilding a notification channel to explain a silence.** Two sessions went to
  this and the channel was never the problem. Read the dump
  (`adb shell dumpsys notification`) and check which code path the test actually
  ran through before touching a channel id. Related: force-stop the app before
  renaming a channel, or Fast Refresh can spend the id on the old settings.

---

## Suggested order

§1 is one sitting with the desk on for items 1–2, then one sitting with the phone
in hand and unlocked for 3–5. Nothing else should start until it is empty — three
of these have been "nearly verified" for four days, and the project's two most
expensive bugs were both a stale assumption treated as proved.

§2 and §3 are independent of each other and neither needs the desk, so either can
fill a session where the desk is unavailable. §3.2 (OTA) pays for itself fastest,
since it removes an 11-minute cycle from every JS fix after it.

§4 waits on §2 by design. §6 is filler for short sessions.
