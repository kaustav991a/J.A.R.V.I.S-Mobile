# JARVIS Mobile HUD — Design

**Date:** 2026-08-10
**Status:** Approved
**Implements:** `JARVIS_MASTER_ROADMAP.md` §TIER D #15 — "Mobile app (Track C)"
**Deviation from roadmap:** roadmap recommends Flutter; this uses **Expo / React Native**. Reason recorded in §9.

---

## 1. Purpose

A phone client for J.A.R.V.I.S. that reaches the desk when home and the cloud gateway when away, renders the desk HUD's visual language faithfully, and — critically — gives the `agent_parked` flow a client it has never had. When JARVIS needs approval for a risky action and nobody is at the desk, the backend already parks that action *for the phone*. Nothing consumes it today.

## 2. Scope

### This session (UI build, office laptop, no Python available)
- `jarvis-mobile/` — Expo + TypeScript app
- `jarvis-mobile/mock/server.js` — Node mock backend emitting the real WS frames and REST shapes
- Full HUD visual system, transport state machine, chat, governance panel

### Deferred to the desk machine
- Backend Python patches (§6) — cannot be written *and verified* here; Python is absent on this laptop
- Push notifications and background geofence — require an EAS dev build
- Live-gate of LAN↔cloud handover on real hardware

### Explicitly out of scope for v1
- Live agent-cam. `/api/camera/stream` is loopback-only by deliberate design and is the highest-risk surface to open. Deferred, not forgotten.
- `gesture_state` and `ui_state` WS frames — desk-only concerns, ignored by the app.

## 3. Architecture

Three processes, unchanged from the existing system, plus one client:

```
  phone (this app)
      │
      ├── LAN  ──► desk FastAPI  ws://<desk>:8000/ws  +  http://<desk>:8000/api/*
      │
      └── cloud ──► Render gateway  wss://<cloud>/app-link
                        │
                        └── /desk-link (existing bridge) ──► desk
```

### 3.1 Transport — auto-switch

One state machine in `src/link/`. Modes: `lan`, `cloud`, `offline`.

```
probe LAN:  GET http://<desk>:8000/api/health/summary   timeout 1500ms
  200   → lan
  else  → probe cloud: GET https://<cloud>/health
            200  → cloud
            else → offline
```

Re-probe triggers: app foreground, network change (`expo-network`), WS close, 30s without a frame.

Exposed as `useLink()` → `{ mode, status, send, lastError }`. A transport pill in the header renders `LAN ●` / `CLOUD ●` / `DARK ○`. The user must always know which door they came in — a cloud session has no PC-control powers and the UI must not imply otherwise.

Offline mode renders the last known frame at reduced opacity with an explicit `LINK LOST` banner. It never shows stale data as if it were live.

### 3.2 WS frame contract

Mirrors what `jarvis-backend/main.py` actually sends today, verified against `jarvis-frontend/src/App.jsx`'s handlers.

| Frame | Shape | App use |
|---|---|---|
| status | `{status, message, user?, ...}` | status ring, chat log, security barrier |
| sync/telemetry | `{status:'sync', type:'telemetry', data}` | VitalsPanel |
| sync/weather | `{status:'sync', type:'weather', data}` | header strip |
| agent_step | `{type:'agent_step', goal, event, ...}` | TracePanel |
| agent_parked | `{type:'agent_parked', ...}` | GovernancePanel — the headline feature |
| agent_confirm | `{type:'agent_confirm', resolved?, ...}` | GovernancePanel approve/deny |
| gesture_state | — | **ignored** (desk-only) |
| ui_state | — | **ignored** (desk-only) |

Typed in `src/ws/frames.ts` as a discriminated union. TypeScript is chosen specifically because the backend lives on a machine this session cannot reach — compile-time shape checking is the only defence against frame drift.

### 3.3 REST surface consumed

| Method | Path | Use |
|---|---|---|
| GET | `/api/health/summary` | LAN probe |
| GET | `/api/telemetry` | cold-start vitals |
| POST | `/api/backdoor` | text command → JARVIS |
| GET | `/api/agent/pending` | cold-start governance state |
| POST | `/api/agent/confirm` | approve / deny |
| GET | `/api/tasks` | task queue |
| GET | `/api/presence/state` | presence readout |

## 4. Visual system

Tokens lifted verbatim from `jarvis-frontend/src/App.scss` and `_loginTokens.scss`. Not approximated — the phone and the desk must read as one instrument.

```
cyan        #00ffcc     primary, everything alive
cyan-dim    rgba(0,255,204,0.1)
bg          #050505
panel       rgba(6,10,14,0.82)
red         #ff3366     alert / lockdown
green       #22ff88     confirm
gold        #ffd700     agent + governance tier
dim         rgba(255,255,255,0.55)
display     Orbitron
data        ui-monospace / Cascadia Mono
ease        cubic-bezier(0.16, 1, 0.3, 1)   ← HUD_EASE, shared with desk
scrim       radial-gradient(circle at center, rgba(2,10,12,.6), rgba(1,4,6,.94))
```

### 4.1 Shell — single HUD canvas

One dense scrolling surface. No tab bar, no navigation chrome. It should read as an instrument, not an app.

```
╭──────────────────────────╮
│  ◦ J.A.R.V.I.S    LAN ●  │  transport pill
│     ╭────────╮           │
│     │  ●●●   │  ONLINE   │  reticle + status orb
│     ╰────────╯           │
│ ┌─ VITALS ────────────┐  │
│ │ CPU 34%  MEM 61%    │  │
│ └─────────────────────┘  │
│ ┌─ PARKED ────────── ⚠┐  │  gold — governance
│ │ delete 3 files      │  │
│ │ [ DENY ] [ ALLOW ]  │  │
│ └─────────────────────┘  │
│ ┌─ TRACE ─────────────┐  │
│ │ > thinking…         │  │
│ └─────────────────────┘  │
│ ▸ speak or type…         │
╰──────────────────────────╯
```

### 4.2 Components

| Component | Responsibility | Depends on |
|---|---|---|
| `Reticle` | animated concentric ring, rotation + sweep | svg, reanimated |
| `StatusOrb` | state-reactive orb; cyan → gold → red by status | svg, reanimated |
| `Panel` | the bracketed `┌─ TITLE ─┐` frame primitive | expo-blur |
| `VitalsPanel` | telemetry readout | `Panel`, telemetry frames |
| `GovernancePanel` | parked/confirm actions → allow/deny | `Panel`, agent frames, REST |
| `TracePanel` | agent_step stream, monospace, typewriter | `Panel` |
| `CommandBar` | text input → `/api/backdoor` | REST |
| `Scanline` | sweep overlay, mirrors `ScanlineTransition.jsx` | reanimated |
| `TransportPill` | link mode indicator | `useLink` |

Each is independently renderable against fixture props — no component reaches into transport state directly except `TransportPill`. State flows down from one reducer in `app/index.tsx`.

Motion: `react-native-reanimated` + `react-native-svg`. `HUD_EASE = Easing.bezier(0.16, 1, 0.3, 1)` — the same curve as the desk HUD's GSAP config. `expo-blur` panel backing, `expo-linear-gradient` scrim. Orbitron via `@expo-google-fonts/orbitron`.

**Known ceiling:** the heaviest effects (true glow, shader scanlines, audio-reactive particles) want `@shopify/react-native-skia`, which is unavailable in Expo Go. v1 targets what SVG + Reanimated render well. Skia is a post-dev-build upgrade with no architectural change required.

## 5. Mock backend

`jarvis-mobile/mock/server.js` — Node, no Python. Serves the REST surface in §3.3 and drives a scripted WS timeline: boot → online → telemetry ticks → an agent trace → a parked action awaiting approval.

It exists so the app is fully developable and testable without the real backend, and it stays useful afterwards as a fixture source for tests. Its frame shapes are copied from `main.py`, not invented — if they drift, the app is testing a fiction.

## 6. Backend changes required (deferred — desk machine)

Recorded here so the work is not lost. None of this is written or verified this session.

| # | File | Change | Why |
|---|---|---|---|
| 1 | `main.py` | `JARVIS_BIND_HOST` env, default `127.0.0.1` | phone cannot reach loopback |
| 2 | **new** `modules/app_auth.py` | bearer-token gate on `/api/*` + WS `?token=`; loopback exempt | see §7 |
| 3 | **new** `modules/push_notify.py` | Expo Push API leg | FCM without a Firebase service account |
| 4 | `modules/owner_notify.py` | add push as a new leg | alerts reach the phone directly |
| 5 | **new** `POST /api/push/register` | app registers its Expo push token | — |
| 6 | **new** `POST /api/presence` + `presence_probe.note_app_presence()` | geofence becomes the top rung | supersedes the Track B ARP probe |
| 7 | `cloud_gateway.py` | **new** `/app-link` WS, `APP_SECRET`, relays over existing `/desk-link` | app works when away |
| 8 | `cloud_gateway.py` | cloud-side push when desk unreachable | alerts survive PC-off |

Each gets a plain-Python harness in the repo's existing style (`test_app_auth.py`, `test_push_notify.py`, `test_presence_ingest.py`), registered in `run_harnesses.py`.

## 7. Security

Binding the desk backend to `0.0.0.0` places `/api/backdoor` — arbitrary PC command execution — on the local network. This is the single most dangerous change in the whole design and it must not ship casually.

Required, all of them:

- **Bearer token on every `/api/*` request and on the WS handshake.** 32 bytes of randomness in `JARVIS_APP_TOKEN`, gitignored, transferred to the phone once by QR displayed on the desk HUD.
- **Loopback exempt.** Requests from `127.0.0.1` bypass the gate, so the existing desk HUD and Electron shell keep working with no changes.
- **`0.0.0.0` binding stays opt-in** via env. The default remains `127.0.0.1`, so pulling this branch never exposes anything by accident.
- **`JARVIS_ALLOW_BACKDOOR` stays as-is.** App auth is a second layer, never a replacement for the existing `backdoor_gate` logic.
- **Camera stream stays loopback-only** in v1.
- **Cloud sessions are visibly distinct.** The cloud gateway holds no PC-control powers by design; the transport pill makes that state legible rather than letting the user assume full control.

The token is stored on the phone in `expo-secure-store`, not `AsyncStorage`.

## 8. Testing

Following the repo's existing convention — pure logic harnessed, hardware live-gated.

- **App unit tests** (jest + `@testing-library/react-native`): transport fallback state machine, WS frame reducer, governance resolve logic. Not animations.
- **Mock-driven integration**: app against `mock/server.js`, asserting each frame type produces the right panel state.
- **Live gate, owed on the desk machine**: LAN↔cloud handover, push delivery, geofence transitions, real `agent_parked` round-trip.

Claims of "passing" apply only to what actually ran. Backend items in §6 are unverified by construction this session.

## 9. Decisions and their reasons

| Decision | Reason |
|---|---|
| Expo over Flutter (roadmap said Flutter) | Flutter needs ~8–10 GB of SDK downloads before the first pixel, on an office network. Expo renders on the phone in ~10 min and defers the Android SDK entirely to EAS cloud builds. Flutter remains the stronger renderer; the cost landed in the wrong place for this session. |
| TypeScript | The backend is on an unreachable machine. Compile-time frame typing is the only available defence against shape drift. |
| Single HUD canvas, no tab bar | Tab chrome fights the instrument aesthetic. Chosen deliberately over tabs and over a notch+sheets shell. |
| Node mock rather than running the real backend | No Python on this laptop; the real backend also needs ~500 MB of models, ffmpeg, and Tesseract. |
| Standalone `jarvis-mobile/` folder | Copies into the repo root as one directory, beside `jarvis-backend/` and `jarvis-frontend/`. Exclude `node_modules/` when copying. |
| Camera deferred | Highest-risk surface, and not among the v1 picks. |

## 10. Open items for the desk machine

- Desk LAN IP / hostname for the transport config
- Render cloud gateway URL
- Whether `feat/cloud-gateway` or a new branch receives this work
- EAS account for the dev build (push + geofence)
