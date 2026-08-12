# JARVIS Mobile HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `jarvis-mobile` Expo app — a single-canvas J.A.R.V.I.S. HUD phone client that auto-switches between the desk LAN backend and the cloud gateway, renders the desk HUD's visual language, and gives the `agent_parked` governance flow its first client.

**Architecture:** Pure logic lives in plain TypeScript modules (`frames`, `hudReducer`, `probe`, `LinkMachine`, `api`) with every side-effecting dependency injected — so all transport and state behaviour is unit-testable with no device, no backend, and no Python. React components are presentational, driven by props from one reducer in `HudScreen`. A Node mock backend (`mock/server.js`) emits the real WS frames and REST shapes, and is used by both manual development and the integration test.

**Tech Stack:** Expo SDK 57.0.11 · React Native 0.86.2 · React 19.2.3 · TypeScript 6.0.3 · react-native-reanimated 4 (+ react-native-worklets) · react-native-svg · expo-blur · expo-linear-gradient · expo-secure-store · expo-network · @expo-google-fonts/orbitron · jest-expo + @testing-library/react-native · `ws` (mock server, dev only)

## Global Constraints

- **Expo docs are versioned and must be read before writing code that touches an Expo API:** `https://docs.expo.dev/versions/v57.0.0/`. This is a repo instruction in `jarvis-mobile/AGENTS.md`. Do not write Expo API code from memory.
- **Install every native dependency with `npx expo install <pkg>`**, never `npm install` — Expo pins the SDK-57-compatible version.
- **Color tokens are copied verbatim from the desk HUD** and must not be approximated: `cyan #00ffcc`, `cyan-dim rgba(0,255,204,0.1)`, `bg #050505`, `panel rgba(6,10,14,0.82)`, `red #ff3366`, `green #22ff88`, `gold #ffd700`, `dim rgba(255,255,255,0.55)`.
- **Shared motion curve:** `HUD_BEZIER = [0.16, 1, 0.3, 1]` — the same curve as the desk HUD's GSAP config.
- **Display font Orbitron; data font platform monospace.**
- **`gesture_state` and `ui_state` WS frames are ignored** — desk-only concerns.
- **No expo-router, no tab bar, no navigation chrome.** One scrolling HUD canvas.
- **Never `Date.now()` inside a reducer or state machine.** Time is always an injected parameter, so tests are deterministic.
- **No live camera in v1.** `/api/camera/stream` stays loopback-only.
- **Bearer token is read from and written to `expo-secure-store`, never `AsyncStorage`.**
- **Cloud mode must be visibly distinct in the UI.** A cloud session has no PC-control powers; the transport pill is what makes that legible.
- **Backend Python changes (spec §6) are NOT in this plan.** They are owed on the desk machine and cannot be verified here.
- **Commit after every task.** Repo `jarvis-mobile/` is a fresh git repo with zero commits.

## Deviations from the spec (deliberate, recorded)

| Spec says | This plan does | Why |
|---|---|---|
| "one reducer in `app/index.tsx`" | reducer in `src/state/hudReducer.ts`, mounted by `src/screens/HudScreen.tsx`, root is `App.tsx` | `app/` implies expo-router, which the spec's own "no navigation chrome" rule makes pointless. A standalone reducer module is directly unit-testable. |
| `useLink()` holds the state machine | machine is a plain class `LinkMachine` in `src/link/machine.ts`; `useLink()` is a thin React subscriber | the transport fallback machine is the most important thing to test; testing it through a hook adds a renderer for no benefit. Public `useLink()` API is unchanged. |
| `expo-blur` panel backing | blur on iOS only; Android and web get a solid `panel` fill | SDK 57 Android `BlurView` requires wrapping blurred content in a `BlurTargetView` and threading a ref — complexity with no visual payoff on a near-opaque dark panel. |
| animated SVG props for the reticle sweep | rotation animated on the wrapping `View` transform; SVG arcs are static | `useAnimatedProps` on `react-native-svg` is the least reliable reanimated surface. Same visual, far fewer failure modes. |

## File Structure

```
jarvis-mobile/
  App.tsx                          root: font loading, splash gate, <HudScreen/>
  app.json                         dark UI, #050505 backgrounds
  jest-setup.js                    worklets mock + reanimated setUpTests
  mock/server.js                   Node REST + WS mock backend (exports startMockServer)
  src/
    theme/tokens.ts                COLOR, FONT, SPACE, HUD_BEZIER, SCRIM
    ws/frames.ts                   JarvisFrame discriminated union + parseFrame
    state/hudReducer.ts            HudState, hudReducer, initialHudState
    link/config.ts                 Endpoints type, URL builders, token storage
    link/probe.ts                  probeLan, probeCloud, chooseMode
    link/machine.ts                LinkMachine (transport state machine)
    link/useLink.ts                useLink() React wrapper
    api/client.ts                  createApi() — the REST surface in spec §3.3
    components/Panel.tsx           bracketed frame primitive
    components/Scanline.tsx        sweep overlay
    components/TransportPill.tsx   LAN ● / CLOUD ● / DARK ○
    components/Reticle.tsx         rotating concentric rings
    components/StatusOrb.tsx       status-reactive orb
    components/VitalsPanel.tsx     telemetry readout
    components/TracePanel.tsx      agent_step stream
    components/GovernancePanel.tsx parked actions → allow/deny
    components/CommandBar.tsx      text input → /api/backdoor
    screens/HudScreen.tsx          assembles everything, owns the reducer
  __tests__/integration.test.ts    app machine + reducer against mock/server.js
```

Tests are colocated: `src/<area>/__tests__/<name>.test.ts(x)`. The one cross-cutting test lives in `__tests__/`.

---

### Task 1: Toolchain, dependencies, design tokens

**Files:**
- Create: `jarvis-mobile/src/theme/tokens.ts`
- Create: `jarvis-mobile/src/theme/__tests__/tokens.test.ts`
- Modify: `jarvis-mobile/package.json` (scripts + jest block)
- Modify: `jarvis-mobile/tsconfig.json` (add jest types)

**Interfaces:**
- Consumes: nothing.
- Produces: `COLOR`, `FONT`, `SPACE`, `HUD_BEZIER`, `SCRIM` from `src/theme/tokens.ts`. `npm test` runs jest with the `jest-expo` preset.

- [ ] **Step 1: Commit the untouched Expo scaffold first**

The repo has zero commits and a staged scaffold. Baseline it so every later diff is readable.

```bash
cd jarvis-mobile
git add -A
git commit -m "chore: expo sdk 57 typescript scaffold"
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npx expo install react-native-reanimated react-native-worklets react-native-svg expo-blur expo-linear-gradient expo-secure-store expo-network expo-font expo-splash-screen @expo-google-fonts/orbitron
```

- [ ] **Step 3: Install dev dependencies**

`ws` powers the mock server; it is dev-only because the app never imports it.

```bash
npx expo install jest-expo jest @types/jest @testing-library/react-native ws -- --dev
```

- [ ] **Step 4: Wire jest into package.json**

Add the `test` script and the `jest` block. `transformIgnorePatterns` is the Expo-documented value plus `react-native-svg` and `react-native-worklets`.

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "mock": "node mock/server.js",
    "test": "jest",
    "test:watch": "jest --watchAll",
    "typecheck": "tsc --noEmit"
  },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-worklets)"
    ]
  }
}
```

- [ ] **Step 5: Add jest types to tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  }
}
```

Keep any keys the scaffold already had; only add `types` and confirm `strict` is on.

- [ ] **Step 6: Write the failing token test**

These assertions exist to catch drift from the desk HUD. If someone "tidies" a hex value, this test fails.

```ts
// src/theme/__tests__/tokens.test.ts
import { COLOR, HUD_BEZIER, SPACE, FONT } from '../tokens';

describe('design tokens', () => {
  it('matches the desk HUD palette verbatim', () => {
    expect(COLOR.cyan).toBe('#00ffcc');
    expect(COLOR.cyanDim).toBe('rgba(0,255,204,0.1)');
    expect(COLOR.bg).toBe('#050505');
    expect(COLOR.panel).toBe('rgba(6,10,14,0.82)');
    expect(COLOR.red).toBe('#ff3366');
    expect(COLOR.green).toBe('#22ff88');
    expect(COLOR.gold).toBe('#ffd700');
    expect(COLOR.dim).toBe('rgba(255,255,255,0.55)');
  });

  it('shares the desk HUD easing curve', () => {
    expect(HUD_BEZIER).toEqual([0.16, 1, 0.3, 1]);
  });

  it('exposes a spacing scale and an Orbitron display font', () => {
    expect(SPACE.md).toBe(12);
    expect(FONT.display).toContain('Orbitron');
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npm test -- src/theme`
Expected: FAIL — `Cannot find module '../tokens'`.

- [ ] **Step 8: Write tokens.ts**

```ts
// src/theme/tokens.ts
import { Platform } from 'react-native';

/** Lifted verbatim from jarvis-frontend/src/App.scss and _loginTokens.scss. */
export const COLOR = {
  cyan: '#00ffcc',
  cyanDim: 'rgba(0,255,204,0.1)',
  bg: '#050505',
  panel: 'rgba(6,10,14,0.82)',
  red: '#ff3366',
  green: '#22ff88',
  gold: '#ffd700',
  dim: 'rgba(255,255,255,0.55)',
} as const;

export const FONT = {
  display: 'Orbitron_700Bold',
  displayRegular: 'Orbitron_400Regular',
  data: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** HUD_EASE — the same cubic-bezier the desk HUD feeds GSAP. */
export const HUD_BEZIER = [0.16, 1, 0.3, 1] as const;

/** radial scrim behind the whole canvas */
export const SCRIM = ['rgba(2,10,12,0.6)', 'rgba(1,4,6,0.94)'] as const;
```

- [ ] **Step 9: Run the test again**

Run: `npm test -- src/theme`
Expected: PASS, 3 tests.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/theme
git commit -m "feat: jest toolchain and desk-matched design tokens"
```

---

### Task 2: WS frame contract

**Files:**
- Create: `jarvis-mobile/src/ws/frames.ts`
- Create: `jarvis-mobile/src/ws/__tests__/frames.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - types `TelemetryData`, `WeatherData`, `StatusFrame`, `TelemetryFrame`, `WeatherFrame`, `AgentStepFrame`, `ParkedFrame`, `ConfirmFrame`, `JarvisFrame`
  - `parseFrame(raw: string | unknown): JarvisFrame | null`

Every frame is normalised to a `kind` field so downstream `switch` statements are exhaustive. Wire shapes are matched tolerantly — the backend is on a machine this session cannot reach, so unknown extra keys must never throw and missing optional keys must never crash.

- [ ] **Step 1: Write the failing test**

```ts
// src/ws/__tests__/frames.test.ts
import { parseFrame } from '../frames';

const j = (o: unknown) => JSON.stringify(o);

describe('parseFrame', () => {
  it('parses a status frame', () => {
    expect(parseFrame(j({ status: 'online', message: 'Systems nominal', user: 'sir' }))).toEqual({
      kind: 'status',
      status: 'online',
      message: 'Systems nominal',
      user: 'sir',
    });
  });

  it('defaults a status frame with no message or user', () => {
    expect(parseFrame(j({ status: 'thinking' }))).toEqual({
      kind: 'status',
      status: 'thinking',
      message: '',
      user: null,
    });
  });

  it('parses sync/telemetry into a telemetry frame', () => {
    const f = parseFrame(j({ status: 'sync', type: 'telemetry', data: { cpu: 34, mem: 61 } }));
    expect(f).toEqual({ kind: 'telemetry', data: { cpu: 34, mem: 61 } });
  });

  it('parses sync/weather into a weather frame', () => {
    const f = parseFrame(j({ status: 'sync', type: 'weather', data: { temp: 31, desc: 'haze' } }));
    expect(f).toEqual({ kind: 'weather', data: { temp: 31, desc: 'haze' } });
  });

  it('parses an agent_step frame', () => {
    const f = parseFrame(j({ type: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 2 }));
    expect(f).toEqual({ kind: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 2 });
  });

  it('parses an agent_parked frame', () => {
    const f = parseFrame(j({ type: 'agent_parked', id: 'a1', goal: 'tidy downloads', action: 'delete 3 files', detail: 'x.tmp, y.tmp, z.tmp', risk: 'high' }));
    expect(f).toEqual({
      kind: 'agent_parked',
      id: 'a1',
      goal: 'tidy downloads',
      action: 'delete 3 files',
      detail: 'x.tmp, y.tmp, z.tmp',
      risk: 'high',
    });
  });

  it('accepts action_id or request_id as the parked identifier', () => {
    expect(parseFrame(j({ type: 'agent_parked', action_id: 'a2', action: 'run script' }))).toMatchObject({ kind: 'agent_parked', id: 'a2' });
    expect(parseFrame(j({ type: 'agent_parked', request_id: 'a3', action: 'run script' }))).toMatchObject({ kind: 'agent_parked', id: 'a3' });
  });

  it('parses an agent_confirm frame with a resolution', () => {
    const f = parseFrame(j({ type: 'agent_confirm', id: 'a1', resolved: true, approved: false }));
    expect(f).toEqual({ kind: 'agent_confirm', id: 'a1', resolved: true, approved: false, action: '' });
  });

  it('ignores desk-only frames', () => {
    expect(parseFrame(j({ type: 'gesture_state', hand: 'open' }))).toBeNull();
    expect(parseFrame(j({ type: 'ui_state', panel: 'vitals' }))).toBeNull();
  });

  it('ignores unknown frames and malformed json instead of throwing', () => {
    expect(parseFrame(j({ type: 'something_new' }))).toBeNull();
    expect(parseFrame('not json at all')).toBeNull();
    expect(parseFrame(j([1, 2, 3]))).toBeNull();
    expect(parseFrame(undefined)).toBeNull();
  });

  it('tolerates unknown extra keys on a known frame', () => {
    const f = parseFrame(j({ status: 'online', message: 'hi', future_field: 42 }));
    expect(f).toMatchObject({ kind: 'status', status: 'online' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ws`
Expected: FAIL — `Cannot find module '../frames'`.

- [ ] **Step 3: Write frames.ts**

```ts
// src/ws/frames.ts

export type TelemetryData = {
  cpu?: number;
  mem?: number;
  disk?: number;
  gpu?: number | null;
  temp?: number | null;
  battery?: number | null;
  net_up?: number;
  net_down?: number;
};

export type WeatherData = {
  temp?: number;
  desc?: string;
  city?: string;
  icon?: string;
};

export type StatusFrame = { kind: 'status'; status: string; message: string; user: string | null };
export type TelemetryFrame = { kind: 'telemetry'; data: TelemetryData };
export type WeatherFrame = { kind: 'weather'; data: WeatherData };
export type AgentStepFrame = {
  kind: 'agent_step';
  goal: string;
  event: string;
  detail: string;
  step: number | null;
};
export type ParkedFrame = {
  kind: 'agent_parked';
  id: string;
  goal: string;
  action: string;
  detail: string;
  risk: string;
};
export type ConfirmFrame = {
  kind: 'agent_confirm';
  id: string;
  action: string;
  resolved: boolean;
  approved: boolean;
};

export type JarvisFrame =
  | StatusFrame
  | TelemetryFrame
  | WeatherFrame
  | AgentStepFrame
  | ParkedFrame
  | ConfirmFrame;

type Obj = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

/** parked/confirm identifiers have three known spellings across the backend. */
const identity = (o: Obj): string => str(o.id) || str(o.action_id) || str(o.request_id);

/**
 * Normalise one wire frame. Returns null for frames the phone deliberately
 * ignores (gesture_state, ui_state), for unknown frame types, and for
 * anything unparseable — a bad frame must never take the socket down.
 */
export function parseFrame(raw: string | unknown): JarvisFrame | null {
  let o: Obj;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      o = obj(parsed);
    } catch {
      return null;
    }
  } else {
    o = obj(raw);
  }
  if (Object.keys(o).length === 0) return null;

  const type = str(o.type);

  if (type === 'gesture_state' || type === 'ui_state') return null;

  if (o.status === 'sync') {
    if (type === 'telemetry') return { kind: 'telemetry', data: obj(o.data) as TelemetryData };
    if (type === 'weather') return { kind: 'weather', data: obj(o.data) as WeatherData };
    return null;
  }

  switch (type) {
    case 'agent_step':
      return {
        kind: 'agent_step',
        goal: str(o.goal),
        event: str(o.event),
        detail: str(o.detail),
        step: num(o.step),
      };
    case 'agent_parked':
      return {
        kind: 'agent_parked',
        id: identity(o),
        goal: str(o.goal),
        action: str(o.action),
        detail: str(o.detail),
        risk: str(o.risk),
      };
    case 'agent_confirm':
      return {
        kind: 'agent_confirm',
        id: identity(o),
        action: str(o.action),
        resolved: bool(o.resolved),
        approved: bool(o.approved),
      };
  }

  if (typeof o.status === 'string') {
    return { kind: 'status', status: o.status, message: str(o.message), user: str(o.user) || null };
  }

  return null;
}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/ws`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ws
git commit -m "feat: typed jarvis ws frame contract with tolerant parsing"
```

---

### Task 3: HUD state reducer

**Files:**
- Create: `jarvis-mobile/src/state/hudReducer.ts`
- Create: `jarvis-mobile/src/state/__tests__/hudReducer.test.ts`

**Interfaces:**
- Consumes: `JarvisFrame`, `TelemetryData`, `WeatherData` from `src/ws/frames`.
- Produces:
  - types `TraceEntry`, `ChatEntry`, `ParkedAction`, `HudState`, `HudAction`
  - `initialHudState: HudState`
  - `hudReducer(state: HudState, action: HudAction): HudState`

Every action that needs a timestamp carries `at: number`. The reducer never reads the clock.

- [ ] **Step 1: Write the failing test**

```ts
// src/state/__tests__/hudReducer.test.ts
import { hudReducer, initialHudState, HudState } from '../hudReducer';
import { JarvisFrame } from '../../ws/frames';

const feed = (frames: JarvisFrame[], start: HudState = initialHudState): HudState =>
  frames.reduce((s, frame, i) => hudReducer(s, { type: 'frame', frame, at: 1000 + i }), start);

describe('hudReducer', () => {
  it('starts dark and empty', () => {
    expect(initialHudState.status).toBe('boot');
    expect(initialHudState.parked).toEqual([]);
    expect(initialHudState.lastFrameAt).toBeNull();
  });

  it('applies a status frame and logs the message to chat', () => {
    const s = feed([{ kind: 'status', status: 'online', message: 'Systems nominal', user: 'sir' }]);
    expect(s.status).toBe('online');
    expect(s.message).toBe('Systems nominal');
    expect(s.user).toBe('sir');
    expect(s.chat).toEqual([{ from: 'jarvis', text: 'Systems nominal', at: 1000 }]);
    expect(s.lastFrameAt).toBe(1000);
  });

  it('does not log an empty status message to chat', () => {
    const s = feed([{ kind: 'status', status: 'listening', message: '', user: null }]);
    expect(s.chat).toEqual([]);
    expect(s.status).toBe('listening');
  });

  it('merges telemetry rather than replacing it', () => {
    const s = feed([
      { kind: 'telemetry', data: { cpu: 34, mem: 61 } },
      { kind: 'telemetry', data: { cpu: 40 } },
    ]);
    expect(s.telemetry).toEqual({ cpu: 40, mem: 61 });
  });

  it('replaces weather wholesale', () => {
    const s = feed([
      { kind: 'weather', data: { temp: 31, desc: 'haze' } },
      { kind: 'weather', data: { temp: 29 } },
    ]);
    expect(s.weather).toEqual({ temp: 29 });
  });

  it('appends agent steps to the trace, newest last, capped at 50', () => {
    const many: JarvisFrame[] = Array.from({ length: 60 }, (_, i) => ({
      kind: 'agent_step',
      goal: 'tidy',
      event: `step-${i}`,
      detail: '',
      step: i,
    }));
    const s = feed(many);
    expect(s.trace).toHaveLength(50);
    expect(s.trace[0].event).toBe('step-10');
    expect(s.trace[49].event).toBe('step-59');
  });

  it('queues a parked action', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: 'x,y,z', risk: 'high' },
    ]);
    expect(s.parked).toEqual([
      { id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: 'x,y,z', risk: 'high', at: 1000, resolving: false },
    ]);
  });

  it('upserts a re-sent parked action instead of duplicating it', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: '', risk: 'high' },
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 4 files', detail: '', risk: 'high' },
    ]);
    expect(s.parked).toHaveLength(1);
    expect(s.parked[0].action).toBe('delete 4 files');
  });

  it('removes a parked action when a resolved confirm arrives', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: '', risk: 'high' },
      { kind: 'agent_confirm', id: 'a1', action: '', resolved: true, approved: true },
    ]);
    expect(s.parked).toEqual([]);
  });

  it('treats an unresolved confirm as a pending approval request', () => {
    const s = feed([{ kind: 'agent_confirm', id: 'b9', action: 'reboot pc', resolved: false, approved: false }]);
    expect(s.parked).toEqual([
      { id: 'b9', goal: '', action: 'reboot pc', detail: '', risk: '', at: 1000, resolving: false },
    ]);
  });

  it('ignores a confirm for an id it never parked', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: '', action: 'x', detail: '', risk: '' },
      { kind: 'agent_confirm', id: 'zz', action: '', resolved: true, approved: true },
    ]);
    expect(s.parked.map((p) => p.id)).toEqual(['a1']);
  });

  it('marks a parked action as resolving optimistically', () => {
    const parked = feed([{ kind: 'agent_parked', id: 'a1', goal: '', action: 'x', detail: '', risk: '' }]);
    const s = hudReducer(parked, { type: 'resolving', id: 'a1' });
    expect(s.parked[0].resolving).toBe(true);
  });

  it('drops a locally resolved action when the server never echoes', () => {
    const parked = feed([{ kind: 'agent_parked', id: 'a1', goal: '', action: 'x', detail: '', risk: '' }]);
    const s = hudReducer(parked, { type: 'resolved_local', id: 'a1' });
    expect(s.parked).toEqual([]);
  });

  it('logs a locally sent command to chat, capped at 100', () => {
    let s = initialHudState;
    for (let i = 0; i < 120; i++) {
      s = hudReducer(s, { type: 'local_command', text: `cmd-${i}`, at: 2000 + i });
    }
    expect(s.chat).toHaveLength(100);
    expect(s.chat[0]).toEqual({ from: 'user', text: 'cmd-20', at: 2020 });
    expect(s.chat[99].text).toBe('cmd-119');
  });

  it('resets to the initial state', () => {
    const s = feed([{ kind: 'status', status: 'online', message: 'hi', user: 'sir' }]);
    expect(hudReducer(s, { type: 'reset' })).toEqual(initialHudState);
  });

  it('never mutates the state it was given', () => {
    const before = feed([{ kind: 'agent_step', goal: 'g', event: 'e', detail: '', step: 1 }]);
    const snapshot = JSON.stringify(before);
    hudReducer(before, { type: 'frame', frame: { kind: 'agent_step', goal: 'g', event: 'e2', detail: '', step: 2 }, at: 5000 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/state`
Expected: FAIL — `Cannot find module '../hudReducer'`.

- [ ] **Step 3: Write hudReducer.ts**

```ts
// src/state/hudReducer.ts
import { JarvisFrame, TelemetryData, WeatherData } from '../ws/frames';

const TRACE_CAP = 50;
const CHAT_CAP = 100;

export type TraceEntry = { goal: string; event: string; detail: string; step: number | null; at: number };
export type ChatEntry = { from: 'jarvis' | 'user'; text: string; at: number };
export type ParkedAction = {
  id: string;
  goal: string;
  action: string;
  detail: string;
  risk: string;
  at: number;
  /** true between tapping ALLOW/DENY and the server confirming */
  resolving: boolean;
};

export type HudState = {
  status: string;
  message: string;
  user: string | null;
  telemetry: TelemetryData | null;
  weather: WeatherData | null;
  trace: TraceEntry[];
  chat: ChatEntry[];
  parked: ParkedAction[];
  lastFrameAt: number | null;
};

export type HudAction =
  | { type: 'frame'; frame: JarvisFrame; at: number }
  | { type: 'local_command'; text: string; at: number }
  | { type: 'resolving'; id: string }
  | { type: 'resolved_local'; id: string }
  | { type: 'reset' };

export const initialHudState: HudState = {
  status: 'boot',
  message: '',
  user: null,
  telemetry: null,
  weather: null,
  trace: [],
  chat: [],
  parked: [],
  lastFrameAt: null,
};

const cap = <T,>(list: T[], max: number): T[] => (list.length > max ? list.slice(list.length - max) : list);

const upsertParked = (parked: ParkedAction[], next: ParkedAction): ParkedAction[] => {
  const i = parked.findIndex((p) => p.id === next.id);
  if (i === -1) return [...parked, next];
  const copy = parked.slice();
  copy[i] = { ...copy[i], ...next, resolving: copy[i].resolving };
  return copy;
};

function applyFrame(state: HudState, frame: JarvisFrame, at: number): HudState {
  switch (frame.kind) {
    case 'status':
      return {
        ...state,
        status: frame.status,
        message: frame.message,
        user: frame.user ?? state.user,
        chat: frame.message
          ? cap([...state.chat, { from: 'jarvis' as const, text: frame.message, at }], CHAT_CAP)
          : state.chat,
      };
    case 'telemetry':
      return { ...state, telemetry: { ...(state.telemetry ?? {}), ...frame.data } };
    case 'weather':
      return { ...state, weather: frame.data };
    case 'agent_step':
      return {
        ...state,
        trace: cap(
          [...state.trace, { goal: frame.goal, event: frame.event, detail: frame.detail, step: frame.step, at }],
          TRACE_CAP
        ),
      };
    case 'agent_parked':
      return {
        ...state,
        parked: upsertParked(state.parked, {
          id: frame.id,
          goal: frame.goal,
          action: frame.action,
          detail: frame.detail,
          risk: frame.risk,
          at,
          resolving: false,
        }),
      };
    case 'agent_confirm':
      if (frame.resolved) {
        return { ...state, parked: state.parked.filter((p) => p.id !== frame.id) };
      }
      return {
        ...state,
        parked: upsertParked(state.parked, {
          id: frame.id,
          goal: '',
          action: frame.action,
          detail: '',
          risk: '',
          at,
          resolving: false,
        }),
      };
  }
}

export function hudReducer(state: HudState, action: HudAction): HudState {
  switch (action.type) {
    case 'frame':
      return { ...applyFrame(state, action.frame, action.at), lastFrameAt: action.at };
    case 'local_command':
      return {
        ...state,
        chat: cap([...state.chat, { from: 'user' as const, text: action.text, at: action.at }], CHAT_CAP),
      };
    case 'resolving':
      return {
        ...state,
        parked: state.parked.map((p) => (p.id === action.id ? { ...p, resolving: true } : p)),
      };
    case 'resolved_local':
      return { ...state, parked: state.parked.filter((p) => p.id !== action.id) };
    case 'reset':
      return initialHudState;
  }
}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/state`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/state
git commit -m "feat: hud state reducer for status, telemetry, trace and governance"
```

---

### Task 4: LAN/cloud probe

**Files:**
- Create: `jarvis-mobile/src/link/config.ts`
- Create: `jarvis-mobile/src/link/probe.ts`
- Create: `jarvis-mobile/src/link/__tests__/probe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/link/config.ts`: type `LinkMode = 'lan' | 'cloud' | 'offline'`; type `Endpoints = { deskBase: string; cloudBase: string | null }`; `lanWsUrl(endpoints, token)`, `cloudWsUrl(endpoints, token)`, `DEFAULT_ENDPOINTS`, `TOKEN_KEY`, `loadToken()`, `saveToken(token)`
  - `src/link/probe.ts`: type `ProbeDeps = { fetchImpl: typeof fetch; lanTimeoutMs?: number; cloudTimeoutMs?: number }`; `probeLan(endpoints, deps)`, `probeCloud(endpoints, deps)`, `chooseMode(endpoints, deps): Promise<LinkMode>`

`DEFAULT_ENDPOINTS` reads `process.env.EXPO_PUBLIC_JARVIS_DESK` / `EXPO_PUBLIC_JARVIS_CLOUD` so the desk IP is configurable without a code edit — spec §10 leaves the real values open.

- [ ] **Step 1: Write the failing config test**

```ts
// src/link/__tests__/probe.test.ts
import { lanWsUrl, cloudWsUrl, Endpoints } from '../config';
import { probeLan, probeCloud, chooseMode } from '../probe';

const endpoints: Endpoints = { deskBase: 'http://192.168.1.9:8000', cloudBase: 'https://jarvis.example.com' };

const okFetch = (): typeof fetch =>
  jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

const failFetch = (): typeof fetch =>
  jest.fn(async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;

/** resolves only after the abort signal fires, i.e. behaves like a dead host */
const hangingFetch = (): typeof fetch =>
  jest.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })
  ) as unknown as typeof fetch;

describe('ws url building', () => {
  it('builds a ws:// desk url with the token as a query param', () => {
    expect(lanWsUrl(endpoints, 'sekrit')).toBe('ws://192.168.1.9:8000/ws?token=sekrit');
  });

  it('omits the token param when there is no token', () => {
    expect(lanWsUrl(endpoints, null)).toBe('ws://192.168.1.9:8000/ws');
  });

  it('builds a wss:// cloud app-link url', () => {
    expect(cloudWsUrl(endpoints, 'sekrit')).toBe('wss://jarvis.example.com/app-link?token=sekrit');
  });

  it('returns null for a cloud url with no cloud configured', () => {
    expect(cloudWsUrl({ deskBase: endpoints.deskBase, cloudBase: null }, 'sekrit')).toBeNull();
  });
});

describe('probeLan', () => {
  it('hits /api/health/summary and returns true on 200', async () => {
    const fetchImpl = okFetch();
    await expect(probeLan(endpoints, { fetchImpl })).resolves.toBe(true);
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe('http://192.168.1.9:8000/api/health/summary');
  });

  it('returns false when the desk refuses the connection', async () => {
    await expect(probeLan(endpoints, { fetchImpl: failFetch() })).resolves.toBe(false);
  });

  it('returns false when the desk does not answer inside the timeout', async () => {
    await expect(probeLan(endpoints, { fetchImpl: hangingFetch(), lanTimeoutMs: 20 })).resolves.toBe(false);
  });
});

describe('probeCloud', () => {
  it('hits /health and returns true on 200', async () => {
    const fetchImpl = okFetch();
    await expect(probeCloud(endpoints, { fetchImpl })).resolves.toBe(true);
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe('https://jarvis.example.com/health');
  });

  it('returns false with no cloud configured, without calling fetch', async () => {
    const fetchImpl = okFetch();
    await expect(probeCloud({ deskBase: endpoints.deskBase, cloudBase: null }, { fetchImpl })).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('chooseMode', () => {
  it('prefers lan when the desk answers', async () => {
    await expect(chooseMode(endpoints, { fetchImpl: okFetch() })).resolves.toBe('lan');
  });

  it('falls back to cloud when only the cloud answers', async () => {
    const fetchImpl = jest.fn(async (url: unknown) => {
      if (String(url).includes('192.168')) throw new Error('ECONNREFUSED');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await expect(chooseMode(endpoints, { fetchImpl })).resolves.toBe('cloud');
  });

  it('goes offline when neither answers', async () => {
    await expect(chooseMode(endpoints, { fetchImpl: failFetch() })).resolves.toBe('offline');
  });

  it('treats a non-200 response as unreachable', async () => {
    const fetchImpl = jest.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    await expect(chooseMode(endpoints, { fetchImpl })).resolves.toBe('offline');
  });

  it('never probes the cloud when lan wins', async () => {
    const fetchImpl = okFetch();
    await chooseMode(endpoints, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/link`
Expected: FAIL — `Cannot find module '../config'`.

- [ ] **Step 3: Write config.ts**

```ts
// src/link/config.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type LinkMode = 'lan' | 'cloud' | 'offline';

export type Endpoints = {
  /** e.g. http://192.168.1.9:8000 — no trailing slash */
  deskBase: string;
  /** e.g. https://jarvis.onrender.com — null when no cloud gateway is configured */
  cloudBase: string | null;
};

export const DEFAULT_ENDPOINTS: Endpoints = {
  deskBase: process.env.EXPO_PUBLIC_JARVIS_DESK ?? 'http://127.0.0.1:8787',
  cloudBase: process.env.EXPO_PUBLIC_JARVIS_CLOUD ?? null,
};

const withToken = (url: string, token: string | null): string =>
  token ? `${url}?token=${encodeURIComponent(token)}` : url;

const toWs = (httpBase: string): string => httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

export const lanWsUrl = (e: Endpoints, token: string | null): string => withToken(`${toWs(e.deskBase)}/ws`, token);

export const cloudWsUrl = (e: Endpoints, token: string | null): string | null =>
  e.cloudBase ? withToken(`${toWs(e.cloudBase)}/app-link`, token) : null;

export const TOKEN_KEY = 'jarvis_app_token';

/** SecureStore is unavailable on web; the app degrades to no token there. */
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
```

- [ ] **Step 4: Write probe.ts**

```ts
// src/link/probe.ts
import { Endpoints, LinkMode } from './config';

export type ProbeDeps = {
  fetchImpl: typeof fetch;
  /** spec §3.1: the desk probe times out at 1500ms */
  lanTimeoutMs?: number;
  cloudTimeoutMs?: number;
};

async function reachable(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const probeLan = (e: Endpoints, deps: ProbeDeps): Promise<boolean> =>
  reachable(`${e.deskBase}/api/health/summary`, deps.fetchImpl, deps.lanTimeoutMs ?? 1500);

export const probeCloud = async (e: Endpoints, deps: ProbeDeps): Promise<boolean> =>
  e.cloudBase ? reachable(`${e.cloudBase}/health`, deps.fetchImpl, deps.cloudTimeoutMs ?? 4000) : false;

/** LAN first, cloud second, dark last. Never probes the cloud if the desk answers. */
export async function chooseMode(e: Endpoints, deps: ProbeDeps): Promise<LinkMode> {
  if (await probeLan(e, deps)) return 'lan';
  if (await probeCloud(e, deps)) return 'cloud';
  return 'offline';
}
```

- [ ] **Step 5: Run the test again**

Run: `npm test -- src/link`
Expected: PASS, 13 tests.

If `Response` is undefined in the jest environment, add `whatwg-fetch` — but Node 18+ under `jest-expo` provides it; try the run before changing anything.

- [ ] **Step 6: Commit**

```bash
git add src/link
git commit -m "feat: lan/cloud transport probe and endpoint config"
```

---

### Task 5: LinkMachine — the transport state machine

**Files:**
- Create: `jarvis-mobile/src/link/machine.ts`
- Create: `jarvis-mobile/src/link/__tests__/machine.test.ts`

**Interfaces:**
- Consumes: `Endpoints`, `LinkMode`, `lanWsUrl`, `cloudWsUrl` from `./config`; `chooseMode` from `./probe`; `parseFrame`, `JarvisFrame` from `../ws/frames`.
- Produces:
  - type `LinkStatus = 'idle' | 'probing' | 'connecting' | 'open' | 'closed'`
  - type `LinkSnapshot = { mode: LinkMode; status: LinkStatus; lastError: string | null }`
  - type `MinimalSocket = { send(data: string): void; close(): void; onopen: ((e?: unknown) => void) | null; onclose: ((e?: unknown) => void) | null; onerror: ((e?: unknown) => void) | null; onmessage: ((e: { data: unknown }) => void) | null }`
  - type `MachineDeps = { endpoints: Endpoints; token: string | null; fetchImpl: typeof fetch; wsFactory: (url: string) => MinimalSocket; now: () => number; onFrame: (f: JarvisFrame, at: number) => void; reconnectMs?: number; watchdogMs?: number }`
  - class `LinkMachine` with `start()`, `stop()`, `reprobe()`, `send(text: string): boolean`, `subscribe(cb: (s: LinkSnapshot) => void): () => void`, `get snapshot(): LinkSnapshot`, `tick()`

`tick()` is the injected-clock watchdog: the hook calls it on an interval, tests call it directly. That keeps the 30s-without-a-frame rule testable without fake timers fighting promises.

- [ ] **Step 1: Write the failing test**

```ts
// src/link/__tests__/machine.test.ts
import { LinkMachine, MinimalSocket, LinkSnapshot } from '../machine';
import { Endpoints } from '../config';
import { JarvisFrame } from '../../ws/frames';

const endpoints: Endpoints = { deskBase: 'http://desk:8000', cloudBase: 'https://cloud.test' };

class FakeSocket implements MinimalSocket {
  static opened: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: ((e?: unknown) => void) | null = null;
  onclose: ((e?: unknown) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.opened.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  /** test helpers */
  open() {
    this.onopen?.();
  }
  emit(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const lanUp = (): typeof fetch => jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
const allDown = (): typeof fetch =>
  jest.fn(async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
const cloudOnly = (): typeof fetch =>
  jest.fn(async (url: unknown) => {
    if (String(url).includes('desk')) throw new Error('ECONNREFUSED');
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

type Harness = {
  machine: LinkMachine;
  frames: Array<{ frame: JarvisFrame; at: number }>;
  snapshots: LinkSnapshot[];
  clock: { t: number };
};

const build = (fetchImpl: typeof fetch): Harness => {
  const frames: Array<{ frame: JarvisFrame; at: number }> = [];
  const snapshots: LinkSnapshot[] = [];
  const clock = { t: 0 };
  const machine = new LinkMachine({
    endpoints,
    token: 'sekrit',
    fetchImpl,
    wsFactory: (url) => new FakeSocket(url),
    now: () => clock.t,
    onFrame: (frame, at) => frames.push({ frame, at }),
    reconnectMs: 100,
    watchdogMs: 30000,
  });
  machine.subscribe((s) => snapshots.push(s));
  return { machine, frames, snapshots, clock };
};

beforeEach(() => {
  FakeSocket.opened = [];
});

describe('LinkMachine', () => {
  it('probes, picks lan, and connects to the desk ws with the token', async () => {
    const h = build(lanUp());
    await h.machine.start();
    expect(h.machine.snapshot.mode).toBe('lan');
    expect(FakeSocket.opened[0].url).toBe('ws://desk:8000/ws?token=sekrit');
    expect(h.machine.snapshot.status).toBe('connecting');
    FakeSocket.opened[0].open();
    expect(h.machine.snapshot.status).toBe('open');
  });

  it('connects to the cloud app-link when the desk is unreachable', async () => {
    const h = build(cloudOnly());
    await h.machine.start();
    expect(h.machine.snapshot.mode).toBe('cloud');
    expect(FakeSocket.opened[0].url).toBe('wss://cloud.test/app-link?token=sekrit');
  });

  it('goes offline and opens no socket when nothing answers', async () => {
    const h = build(allDown());
    await h.machine.start();
    expect(h.machine.snapshot.mode).toBe('offline');
    expect(h.machine.snapshot.status).toBe('closed');
    expect(FakeSocket.opened).toHaveLength(0);
  });

  it('forwards parsed frames with the injected clock time', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.clock.t = 4242;
    FakeSocket.opened[0].emit({ status: 'online', message: 'Systems nominal' });
    expect(h.frames).toEqual([
      { frame: { kind: 'status', status: 'online', message: 'Systems nominal', user: null }, at: 4242 },
    ]);
  });

  it('drops ignored and malformed frames without forwarding them', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    FakeSocket.opened[0].emit({ type: 'gesture_state', hand: 'open' });
    FakeSocket.opened[0].onmessage?.({ data: 'garbage' });
    expect(h.frames).toEqual([]);
  });

  it('sends text over an open socket and reports success', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    expect(h.machine.send('lights on')).toBe(true);
    expect(FakeSocket.opened[0].sent).toEqual(['lights on']);
  });

  it('refuses to send when the socket is not open', async () => {
    const h = build(allDown());
    await h.machine.start();
    expect(h.machine.send('lights on')).toBe(false);
  });

  it('re-probes and reconnects after the socket closes', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    FakeSocket.opened[0].onclose?.();
    expect(h.machine.snapshot.status).toBe('closed');
    await h.machine.reprobe();
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it('records an error message when the socket errors', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].onerror?.({ message: 'handshake 403' });
    expect(h.machine.snapshot.lastError).toContain('403');
  });

  it('tick() re-probes once the watchdog window passes with no frame', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.clock.t = 1000;
    FakeSocket.opened[0].emit({ status: 'online', message: '' });

    h.clock.t = 20000;
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(1);

    h.clock.t = 40000;
    await h.machine.tick();
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it('stop() closes the socket and stops notifying', async () => {
    const h = build(lanUp());
    await h.machine.start();
    FakeSocket.opened[0].open();
    h.machine.stop();
    expect(FakeSocket.opened[0].closed).toBe(true);
    expect(h.machine.snapshot.status).toBe('closed');
  });

  it('unsubscribe stops delivering snapshots', async () => {
    const h = build(lanUp());
    const seen: LinkSnapshot[] = [];
    const off = h.machine.subscribe((s) => seen.push(s));
    off();
    await h.machine.start();
    expect(seen).toHaveLength(0);
  });

  it('ignores frames from a socket that has been superseded', async () => {
    const h = build(lanUp());
    await h.machine.start();
    const stale = FakeSocket.opened[0];
    stale.open();
    await h.machine.reprobe();
    stale.emit({ status: 'online', message: 'from the past' });
    expect(h.frames).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/link/__tests__/machine.test.ts`
Expected: FAIL — `Cannot find module '../machine'`.

- [ ] **Step 3: Write machine.ts**

```ts
// src/link/machine.ts
import { Endpoints, LinkMode, cloudWsUrl, lanWsUrl } from './config';
import { chooseMode } from './probe';
import { JarvisFrame, parseFrame } from '../ws/frames';

export type LinkStatus = 'idle' | 'probing' | 'connecting' | 'open' | 'closed';

export type LinkSnapshot = { mode: LinkMode; status: LinkStatus; lastError: string | null };

/** the slice of WebSocket this app uses — lets tests inject a fake, and lets
 *  the integration test inject the node `ws` client. */
export type MinimalSocket = {
  send(data: string): void;
  close(): void;
  onopen: ((e?: unknown) => void) | null;
  onclose: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
};

export type MachineDeps = {
  endpoints: Endpoints;
  token: string | null;
  fetchImpl: typeof fetch;
  wsFactory: (url: string) => MinimalSocket;
  now: () => number;
  onFrame: (frame: JarvisFrame, at: number) => void;
  reconnectMs?: number;
  /** spec §3.1: re-probe after 30s without a frame */
  watchdogMs?: number;
};

const errText = (e: unknown): string => {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'socket error';
};

export class LinkMachine {
  private snap: LinkSnapshot = { mode: 'offline', status: 'idle', lastError: null };
  private listeners = new Set<(s: LinkSnapshot) => void>();
  private socket: MinimalSocket | null = null;
  private lastFrameAt: number | null = null;
  private stopped = false;

  constructor(private deps: MachineDeps) {}

  get snapshot(): LinkSnapshot {
    return this.snap;
  }

  subscribe(cb: (s: LinkSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private set(patch: Partial<LinkSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const cb of this.listeners) cb(this.snap);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.reprobe();
  }

  stop(): void {
    this.stopped = true;
    this.teardown();
    this.set({ status: 'closed' });
  }

  private teardown(): void {
    const s = this.socket;
    this.socket = null;
    if (!s) return;
    s.onopen = null;
    s.onclose = null;
    s.onerror = null;
    s.onmessage = null;
    try {
      s.close();
    } catch {
      /* a socket that refuses to close is already gone */
    }
  }

  async reprobe(): Promise<void> {
    if (this.stopped) return;
    this.teardown();
    this.set({ status: 'probing' });

    const mode = await chooseMode(this.deps.endpoints, { fetchImpl: this.deps.fetchImpl });
    if (this.stopped) return;

    if (mode === 'offline') {
      this.set({ mode, status: 'closed' });
      return;
    }

    const url =
      mode === 'lan'
        ? lanWsUrl(this.deps.endpoints, this.deps.token)
        : cloudWsUrl(this.deps.endpoints, this.deps.token);

    if (!url) {
      this.set({ mode: 'offline', status: 'closed', lastError: 'no cloud gateway configured' });
      return;
    }

    this.set({ mode, status: 'connecting', lastError: null });
    this.connect(url);
  }

  private connect(url: string): void {
    const socket = this.deps.wsFactory(url);
    this.socket = socket;
    this.lastFrameAt = this.deps.now();

    const isCurrent = () => this.socket === socket;

    socket.onopen = () => {
      if (!isCurrent()) return;
      this.set({ status: 'open', lastError: null });
    };
    socket.onclose = () => {
      if (!isCurrent()) return;
      this.socket = null;
      this.set({ status: 'closed' });
    };
    socket.onerror = (e) => {
      if (!isCurrent()) return;
      this.set({ lastError: errText(e) });
    };
    socket.onmessage = (e) => {
      if (!isCurrent()) return;
      const at = this.deps.now();
      this.lastFrameAt = at;
      const frame = parseFrame(typeof e.data === 'string' ? e.data : String(e.data));
      if (frame) this.deps.onFrame(frame, at);
    };
  }

  send(text: string): boolean {
    if (!this.socket || this.snap.status !== 'open') return false;
    try {
      this.socket.send(text);
      return true;
    } catch (e) {
      this.set({ lastError: errText(e) });
      return false;
    }
  }

  /** Called on an interval by useLink, and directly by tests. Re-probes when
   *  the link is dead or has gone quiet for longer than the watchdog window. */
  async tick(): Promise<void> {
    if (this.stopped) return;
    const watchdogMs = this.deps.watchdogMs ?? 30000;
    const quietFor = this.lastFrameAt === null ? Infinity : this.deps.now() - this.lastFrameAt;
    const dead = this.snap.status === 'closed';
    if (dead || quietFor > watchdogMs) await this.reprobe();
  }
}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/link/__tests__/machine.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/link
git commit -m "feat: LinkMachine transport state machine with probe, reconnect and watchdog"
```

---

### Task 6: useLink hook

**Files:**
- Create: `jarvis-mobile/src/link/useLink.ts`
- Create: `jarvis-mobile/src/link/__tests__/useLink.test.tsx`

**Interfaces:**
- Consumes: `LinkMachine`, `LinkSnapshot`, `MachineDeps`, `MinimalSocket` from `./machine`; `Endpoints`, `DEFAULT_ENDPOINTS`, `loadToken` from `./config`.
- Produces: `useLink(opts: UseLinkOptions): UseLinkResult` where
  - `UseLinkOptions = { endpoints?: Endpoints; onFrame: (f: JarvisFrame, at: number) => void; machineFactory?: (deps: MachineDeps) => LinkMachine; tickMs?: number }`
  - `UseLinkResult = { mode: LinkMode; status: LinkStatus; lastError: string | null; send: (text: string) => boolean; reprobe: () => void }`

The hook owns only React concerns: creating the machine once, subscribing, the tick interval, and re-probing on app foreground and on network change. `machineFactory` exists so the test can inject a fake machine and assert wiring without a socket.

- [ ] **Step 1: Write the failing test**

```tsx
// src/link/__tests__/useLink.test.tsx
import { renderHook, act } from '@testing-library/react-native';
import { useLink } from '../useLink';
import { LinkMachine, LinkSnapshot, MachineDeps } from '../machine';

class FakeMachine {
  static last: FakeMachine | null = null;
  started = 0;
  stopped = 0;
  reprobes = 0;
  ticks = 0;
  sent: string[] = [];
  snapshot: LinkSnapshot = { mode: 'offline', status: 'idle', lastError: null };
  private listeners = new Set<(s: LinkSnapshot) => void>();

  constructor(public deps: MachineDeps) {
    FakeMachine.last = this;
  }
  async start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  async reprobe() {
    this.reprobes++;
  }
  async tick() {
    this.ticks++;
  }
  send(text: string) {
    this.sent.push(text);
    return true;
  }
  subscribe(cb: (s: LinkSnapshot) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  push(s: LinkSnapshot) {
    this.snapshot = s;
    for (const cb of this.listeners) cb(s);
  }
}

const factory = (deps: MachineDeps) => new FakeMachine(deps) as unknown as LinkMachine;

describe('useLink', () => {
  beforeEach(() => {
    FakeMachine.last = null;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts the machine on mount and exposes its snapshot', async () => {
    const { result } = renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    expect(FakeMachine.last?.started).toBe(1);
    expect(result.current.mode).toBe('offline');
    expect(result.current.status).toBe('idle');
  });

  it('re-renders when the machine publishes a new snapshot', async () => {
    const { result } = renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    await act(async () => {
      FakeMachine.last!.push({ mode: 'lan', status: 'open', lastError: null });
    });
    expect(result.current.mode).toBe('lan');
    expect(result.current.status).toBe('open');
  });

  it('forwards send() to the machine', () => {
    const { result } = renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    act(() => {
      result.current.send('lights on');
    });
    expect(FakeMachine.last!.sent).toEqual(['lights on']);
  });

  it('ticks the machine on the interval', async () => {
    renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory, tickMs: 1000 }));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(FakeMachine.last!.ticks).toBeGreaterThanOrEqual(3);
  });

  it('stops the machine on unmount', () => {
    const { unmount } = renderHook(() => useLink({ onFrame: jest.fn(), machineFactory: factory }));
    unmount();
    expect(FakeMachine.last!.stopped).toBe(1);
  });

  it('passes onFrame straight through to the machine deps', async () => {
    const onFrame = jest.fn();
    renderHook(() => useLink({ onFrame, machineFactory: factory }));
    const at = 99;
    FakeMachine.last!.deps.onFrame({ kind: 'status', status: 'online', message: 'x', user: null }, at);
    expect(onFrame).toHaveBeenCalledWith({ kind: 'status', status: 'online', message: 'x', user: null }, at);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/link/__tests__/useLink.test.tsx`
Expected: FAIL — `Cannot find module '../useLink'`.

- [ ] **Step 3: Write useLink.ts**

Read `https://docs.expo.dev/versions/v57.0.0/sdk/network/` before writing the network listener; `addNetworkStateListener` returns a subscription with `.remove()`.

```ts
// src/link/useLink.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { DEFAULT_ENDPOINTS, Endpoints, LinkMode, loadToken } from './config';
import { LinkMachine, LinkSnapshot, LinkStatus, MachineDeps } from './machine';
import { JarvisFrame } from '../ws/frames';

export type UseLinkOptions = {
  endpoints?: Endpoints;
  onFrame: (frame: JarvisFrame, at: number) => void;
  /** test seam — inject a fake machine */
  machineFactory?: (deps: MachineDeps) => LinkMachine;
  tickMs?: number;
};

export type UseLinkResult = {
  mode: LinkMode;
  status: LinkStatus;
  lastError: string | null;
  send: (text: string) => boolean;
  reprobe: () => void;
};

export function useLink(opts: UseLinkOptions): UseLinkResult {
  const { endpoints = DEFAULT_ENDPOINTS, onFrame, machineFactory, tickMs = 5000 } = opts;

  // keep the latest onFrame without rebuilding the machine on every render
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const machine = useMemo(() => {
    const deps: MachineDeps = {
      endpoints,
      token: null,
      fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
      wsFactory: (url) => new WebSocket(url) as unknown as MachineDeps['wsFactory'] extends never ? never : any,
      now: () => Date.now(),
      onFrame: (frame, at) => onFrameRef.current(frame, at),
    };
    return machineFactory ? machineFactory(deps) : new LinkMachine(deps);
  }, [endpoints, machineFactory]);

  const [snap, setSnap] = useState<LinkSnapshot>(machine.snapshot);

  useEffect(() => {
    const off = machine.subscribe(setSnap);
    void machine.start();
    return () => {
      off();
      machine.stop();
    };
  }, [machine]);

  // the desk token lives in SecureStore and is loaded after first paint
  useEffect(() => {
    let cancelled = false;
    void loadToken().then((token) => {
      if (cancelled || !token) return;
      (machine as unknown as { deps: MachineDeps }).deps.token = token;
      void machine.reprobe();
    });
    return () => {
      cancelled = true;
    };
  }, [machine]);

  useEffect(() => {
    const id = setInterval(() => {
      void machine.tick();
    }, tickMs);
    return () => clearInterval(id);
  }, [machine, tickMs]);

  // spec §3.1 re-probe triggers: foreground and network change
  useEffect(() => {
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void machine.reprobe();
    });
    const netSub = Network.addNetworkStateListener(() => {
      void machine.reprobe();
    });
    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [machine]);

  const send = useCallback((text: string) => machine.send(text), [machine]);
  const reprobe = useCallback(() => {
    void machine.reprobe();
  }, [machine]);

  return { mode: snap.mode, status: snap.status, lastError: snap.lastError, send, reprobe };
}
```

Note on the `wsFactory` line: write it plainly as `wsFactory: (url: string) => new WebSocket(url) as unknown as MinimalSocket` and import `MinimalSocket` from `./machine`. If `tsc --noEmit` complains about the cast, widen `MinimalSocket`'s handler types rather than reaching for `any`.

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/link/__tests__/useLink.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. Fix the `wsFactory` cast if it complains.

- [ ] **Step 6: Commit**

```bash
git add src/link
git commit -m "feat: useLink hook with foreground and network reprobe triggers"
```

---

### Task 7: REST client

**Files:**
- Create: `jarvis-mobile/src/api/client.ts`
- Create: `jarvis-mobile/src/api/__tests__/client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except types.
- Produces:
  - class `ApiError extends Error` with `status: number`
  - `createApi(cfg: { baseUrl: string; token: string | null; fetchImpl?: typeof fetch }): Api`
  - `Api = { healthSummary(); telemetry(); backdoor(text: string); pending(); confirm(id: string, approved: boolean); tasks(); presence() }` — all returning `Promise<unknown>`-shaped JSON except `confirm`, which returns `Promise<void>`

Covers exactly the surface in spec §3.3 and nothing more.

- [ ] **Step 1: Write the failing test**

```ts
// src/api/__tests__/client.test.ts
import { createApi, ApiError } from '../client';

type Call = { url: string; init: RequestInit | undefined };

const recorder = (status = 200, body: unknown = { ok: true }) => {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

describe('createApi', () => {
  it('sends a bearer token on every request when one is configured', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', token: 'sekrit', fetchImpl });
    await api.telemetry();
    expect(calls[0].url).toBe('http://desk:8000/api/telemetry');
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer sekrit');
  });

  it('omits the Authorization header when there is no token', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://desk:8000', token: null, fetchImpl });
    await api.healthSummary();
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps each method to the documented path', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.healthSummary();
    await api.telemetry();
    await api.pending();
    await api.tasks();
    await api.presence();
    expect(calls.map((c) => c.url)).toEqual([
      'http://d/api/health/summary',
      'http://d/api/telemetry',
      'http://d/api/agent/pending',
      'http://d/api/tasks',
      'http://d/api/presence/state',
    ]);
  });

  it('posts a backdoor command as json', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.backdoor('lights on');
    expect(calls[0].url).toBe('http://d/api/backdoor');
    expect(calls[0].init!.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ command: 'lights on' });
  });

  it('posts an approval decision', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.confirm('a1', true);
    expect(calls[0].url).toBe('http://d/api/agent/confirm');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ id: 'a1', approved: true });
  });

  it('posts a denial decision', async () => {
    const { calls, fetchImpl } = recorder();
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await api.confirm('a1', false);
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ id: 'a1', approved: false });
  });

  it('throws ApiError carrying the status code on a failure response', async () => {
    const { fetchImpl } = recorder(403, { detail: 'bad token' });
    const api = createApi({ baseUrl: 'http://d', token: 'wrong', fetchImpl });
    await expect(api.telemetry()).rejects.toBeInstanceOf(ApiError);
    await expect(api.telemetry()).rejects.toMatchObject({ status: 403 });
  });

  it('wraps a network failure as ApiError with status 0', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const api = createApi({ baseUrl: 'http://d', token: null, fetchImpl });
    await expect(api.telemetry()).rejects.toMatchObject({ status: 0 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/api`
Expected: FAIL — `Cannot find module '../client'`.

- [ ] **Step 3: Write client.ts**

```ts
// src/api/client.ts

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiConfig = { baseUrl: string; token: string | null; fetchImpl?: typeof fetch };

export type Api = {
  healthSummary(): Promise<unknown>;
  telemetry(): Promise<unknown>;
  backdoor(text: string): Promise<unknown>;
  pending(): Promise<unknown>;
  confirm(id: string, approved: boolean): Promise<void>;
  tasks(): Promise<unknown>;
  presence(): Promise<unknown>;
};

export function createApi(cfg: ApiConfig): Api {
  const doFetch = cfg.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (cfg.token) h.Authorization = `Bearer ${cfg.token}`;
    return h;
  };

  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
    } catch (e) {
      throw new ApiError(e instanceof Error ? e.message : 'network error', 0);
    }
    if (!res.ok) throw new ApiError(`${path} failed with ${res.status}`, res.status);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  };

  const post = (path: string, body: unknown): Promise<unknown> =>
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return {
    healthSummary: () => request('/api/health/summary'),
    telemetry: () => request('/api/telemetry'),
    backdoor: (text) => post('/api/backdoor', { command: text }),
    pending: () => request('/api/agent/pending'),
    confirm: async (id, approved) => {
      await post('/api/agent/confirm', { id, approved });
    },
    tasks: () => request('/api/tasks'),
    presence: () => request('/api/presence/state'),
  };
}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/api`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api
git commit -m "feat: rest client for the jarvis api surface with bearer auth"
```

---

### Task 8: Node mock backend

**Files:**
- Create: `jarvis-mobile/mock/server.js`
- Create: `jarvis-mobile/mock/__tests__/server.test.js`

**Interfaces:**
- Consumes: nothing from the app (the mock must stay app-independent so it can be diffed against `main.py` later).
- Produces: `startMockServer(opts?: { port?: number; tickMs?: number; timeline?: boolean }) => Promise<{ port, httpBase, wsUrl, broadcast(frame), close() }>`. Running `node mock/server.js` starts it on port 8787 with the scripted timeline enabled.

Frame shapes here are the ones the app parses in Task 2. If the real backend disagrees, `frames.ts` and this file both change together.

- [ ] **Step 1: Write the failing test**

```js
// mock/__tests__/server.test.js
const WebSocket = require('ws');
const { startMockServer } = require('../server');

let server;

beforeEach(async () => {
  server = await startMockServer({ port: 0, timeline: false });
});

afterEach(async () => {
  await server.close();
});

const get = async (path) => {
  const res = await fetch(`${server.httpBase}${path}`);
  return { status: res.status, body: await res.json() };
};

describe('mock server rest surface', () => {
  it('answers the lan probe', async () => {
    const { status, body } = await get('/api/health/summary');
    expect(status).toBe(200);
    expect(body).toHaveProperty('status');
  });

  it('serves cold-start telemetry', async () => {
    const { body } = await get('/api/telemetry');
    expect(typeof body.cpu).toBe('number');
    expect(typeof body.mem).toBe('number');
  });

  it('serves pending governance actions, tasks and presence', async () => {
    expect((await get('/api/agent/pending')).status).toBe(200);
    expect((await get('/api/tasks')).status).toBe(200);
    expect((await get('/api/presence/state')).status).toBe(200);
  });

  it('404s an unknown path', async () => {
    const res = await fetch(`${server.httpBase}/api/nope`);
    expect(res.status).toBe(404);
  });
});

describe('mock server websocket', () => {
  const collect = (ws, n) =>
    new Promise((resolve) => {
      const got = [];
      ws.on('message', (raw) => {
        got.push(JSON.parse(String(raw)));
        if (got.length >= n) resolve(got);
      });
    });

  it('greets a new socket with a status frame', async () => {
    const ws = new WebSocket(server.wsUrl);
    const [first] = await collect(ws, 1);
    expect(first).toMatchObject({ status: expect.any(String) });
    ws.close();
  });

  it('broadcasts an arbitrary frame to connected clients', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((r) => ws.on('open', r));
    const pending = collect(ws, 2);
    server.broadcast({ status: 'sync', type: 'telemetry', data: { cpu: 7, mem: 8 } });
    const frames = await pending;
    expect(frames[1]).toEqual({ status: 'sync', type: 'telemetry', data: { cpu: 7, mem: 8 } });
    ws.close();
  });

  it('POST /api/backdoor echoes the command back over the socket', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((r) => ws.on('open', r));
    const pending = collect(ws, 2);
    await fetch(`${server.httpBase}/api/backdoor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'lights on' }),
    });
    const frames = await pending;
    expect(JSON.stringify(frames)).toContain('lights on');
    ws.close();
  });

  it('POST /api/agent/confirm broadcasts a resolved agent_confirm', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((r) => ws.on('open', r));
    server.broadcast({ type: 'agent_parked', id: 'p1', goal: 'tidy', action: 'delete 3 files', risk: 'high' });
    const pending = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const f = JSON.parse(String(raw));
        if (f.type === 'agent_confirm') resolve(f);
      });
    });
    await fetch(`${server.httpBase}/api/agent/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'p1', approved: false }),
    });
    const frame = await pending;
    expect(frame).toMatchObject({ type: 'agent_confirm', id: 'p1', resolved: true, approved: false });
    ws.close();
  });

  it('drops a confirmed action from /api/agent/pending', async () => {
    server.broadcast({ type: 'agent_parked', id: 'p2', goal: 'tidy', action: 'rm -rf', risk: 'high' });
    await fetch(`${server.httpBase}/api/agent/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'p2', approved: true }),
    });
    const { body } = await get('/api/agent/pending');
    expect(JSON.stringify(body)).not.toContain('p2');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- mock`
Expected: FAIL — `Cannot find module '../server'`.

- [ ] **Step 3: Write mock/server.js**

```js
// mock/server.js
// Node stand-in for jarvis-backend. Frame shapes mirror what main.py sends;
// if they drift, the app is testing a fiction — update both together.
const http = require('http');
const { WebSocketServer } = require('ws');

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const jitter = (base, spread) => Math.max(0, Math.min(100, Math.round(base + (Math.random() - 0.5) * spread)));

async function startMockServer(opts = {}) {
  const { port = 8787, tickMs = 2000, timeline = true } = opts;

  const state = {
    telemetry: { cpu: 34, mem: 61, disk: 48, gpu: 12, temp: 52, battery: 88, net_up: 120, net_down: 940 },
    parked: [],
    tasks: [{ id: 't1', title: 'Draft the release note', state: 'queued' }],
    presence: { present: true, source: 'app_geofence', since: 'boot' },
  };

  const sockets = new Set();

  const broadcast = (frame) => {
    if (frame.type === 'agent_parked') {
      const id = frame.id || frame.action_id || frame.request_id;
      if (id && !state.parked.some((p) => p.id === id)) state.parked.push({ ...frame, id });
    }
    const raw = JSON.stringify(frame);
    for (const ws of sockets) {
      if (ws.readyState === 1) ws.send(raw);
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health/summary') {
      return json(res, 200, { status: 'ok', uptime_s: 1234, modules: { agent: 'ok', voice: 'ok' } });
    }
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && path === '/api/telemetry') {
      return json(res, 200, state.telemetry);
    }
    if (req.method === 'GET' && path === '/api/agent/pending') {
      return json(res, 200, { pending: state.parked });
    }
    if (req.method === 'GET' && path === '/api/tasks') {
      return json(res, 200, { tasks: state.tasks });
    }
    if (req.method === 'GET' && path === '/api/presence/state') {
      return json(res, 200, state.presence);
    }
    if (req.method === 'POST' && path === '/api/backdoor') {
      const body = await readBody(req);
      const command = String(body.command ?? '');
      broadcast({ status: 'thinking', message: '' });
      setTimeout(() => broadcast({ status: 'speaking', message: `Acknowledged: ${command}`, user: 'sir' }), 200);
      return json(res, 200, { ok: true, command });
    }
    if (req.method === 'POST' && path === '/api/agent/confirm') {
      const body = await readBody(req);
      const id = String(body.id ?? '');
      const approved = body.approved === true;
      state.parked = state.parked.filter((p) => p.id !== id);
      broadcast({ type: 'agent_confirm', id, resolved: true, approved });
      broadcast({
        status: 'speaking',
        message: approved ? 'Action approved. Proceeding.' : 'Action denied. Standing down.',
      });
      return json(res, 200, { ok: true, id, approved });
    }
    return json(res, 404, { detail: 'not found' });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.send(JSON.stringify({ status: 'online', message: 'Good evening. All systems nominal.', user: 'sir' }));
    ws.send(JSON.stringify({ status: 'sync', type: 'telemetry', data: state.telemetry }));
    ws.send(JSON.stringify({ status: 'sync', type: 'weather', data: { temp: 31, desc: 'haze', city: 'Kolkata' } }));
    for (const p of state.parked) ws.send(JSON.stringify({ ...p, type: 'agent_parked' }));
    ws.on('message', (raw) => {
      const text = String(raw);
      broadcast({ status: 'thinking', message: '' });
      setTimeout(() => broadcast({ status: 'speaking', message: `Acknowledged: ${text}`, user: 'sir' }), 200);
    });
    ws.on('close', () => sockets.delete(ws));
  });

  const timers = [];
  if (timeline) {
    timers.push(
      setInterval(() => {
        state.telemetry = {
          ...state.telemetry,
          cpu: jitter(state.telemetry.cpu, 18),
          mem: jitter(state.telemetry.mem, 8),
        };
        broadcast({ status: 'sync', type: 'telemetry', data: state.telemetry });
      }, tickMs)
    );
    timers.push(
      setTimeout(() => {
        broadcast({ type: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 1 });
        broadcast({ type: 'agent_step', goal: 'tidy downloads', event: 'plan', detail: '3 stale installers', step: 2 });
      }, tickMs * 3)
    );
    timers.push(
      setTimeout(() => {
        broadcast({
          type: 'agent_parked',
          id: 'demo-1',
          goal: 'tidy downloads',
          action: 'delete 3 files',
          detail: 'setup_old.exe, node_v12.msi, tmp.iso',
          risk: 'high',
        });
        broadcast({ status: 'alert', message: 'Approval required, sir.' });
      }, tickMs * 6)
    );
    for (const t of timers) if (typeof t.unref === 'function') t.unref();
  }

  await new Promise((resolve) => server.listen(port, resolve));
  const actualPort = server.address().port;

  return {
    port: actualPort,
    httpBase: `http://127.0.0.1:${actualPort}`,
    wsUrl: `ws://127.0.0.1:${actualPort}/ws`,
    broadcast,
    close: () =>
      new Promise((resolve) => {
        for (const t of timers) {
          clearInterval(t);
          clearTimeout(t);
        }
        for (const ws of sockets) ws.terminate();
        wss.close(() => server.close(resolve));
      }),
  };
}

module.exports = { startMockServer };

if (require.main === module) {
  startMockServer().then((s) => {
    console.log(`mock jarvis backend on ${s.httpBase}  (ws ${s.wsUrl})`);
  });
}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- mock`
Expected: PASS, 9 tests.

- [ ] **Step 5: Start it by hand once and confirm the banner**

Run: `npm run mock`
Expected: `mock jarvis backend on http://127.0.0.1:8787  (ws ws://127.0.0.1:8787/ws)`. Stop it with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add mock package.json
git commit -m "feat: node mock backend serving jarvis rest and ws frames"
```

---

### Task 9: Panel, Scanline and TransportPill

**Files:**
- Create: `jarvis-mobile/jest-setup.js`
- Create: `jarvis-mobile/src/components/Panel.tsx`
- Create: `jarvis-mobile/src/components/Scanline.tsx`
- Create: `jarvis-mobile/src/components/TransportPill.tsx`
- Create: `jarvis-mobile/src/components/__tests__/primitives.test.tsx`
- Modify: `jarvis-mobile/package.json` (jest `setupFilesAfterEnv`)

**Interfaces:**
- Consumes: `COLOR`, `FONT`, `SPACE`, `HUD_BEZIER` from `../theme/tokens`; `LinkMode`, `LinkStatus` from `../link/machine`.
- Produces:
  - `Panel({ title, accent?, children, testID? })` — `accent` defaults to `COLOR.cyan`
  - `Scanline({ height })`
  - `TransportPill({ mode, status })`

- [ ] **Step 1: Wire reanimated into jest**

Reanimated 4 needs the worklets mock installed before `setUpTests()` runs. Create `jest-setup.js`:

```js
// jest-setup.js
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
```

Add to the `jest` block in `package.json`:

```json
"setupFilesAfterEnv": ["<rootDir>/jest-setup.js"]
```

If `react-native-worklets/src/mock` cannot be resolved, try `react-native-worklets/lib/module/mock` — both paths ship depending on build. Confirm which exists with `ls node_modules/react-native-worklets` before guessing twice.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/__tests__/primitives.test.tsx
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Panel } from '../Panel';
import { TransportPill } from '../TransportPill';
import { Scanline } from '../Scanline';
import { COLOR } from '../../theme/tokens';

describe('Panel', () => {
  it('renders its title uppercased and its children', () => {
    const { getByText } = render(
      <Panel title="vitals">
        <Text>CPU 34%</Text>
      </Panel>
    );
    expect(getByText('VITALS')).toBeTruthy();
    expect(getByText('CPU 34%')).toBeTruthy();
  });

  it('uses the cyan accent by default and honours an override', () => {
    const a = render(<Panel title="a" testID="p" />);
    expect(a.getByTestId('p-title').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.cyan })])
    );
    const b = render(<Panel title="b" testID="q" accent={COLOR.gold} />);
    expect(b.getByTestId('q-title').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.gold })])
    );
  });
});

describe('TransportPill', () => {
  it('reads LAN when the desk link is open', () => {
    const { getByText } = render(<TransportPill mode="lan" status="open" />);
    expect(getByText(/LAN/)).toBeTruthy();
  });

  it('reads CLOUD in cloud mode', () => {
    const { getByText } = render(<TransportPill mode="cloud" status="open" />);
    expect(getByText(/CLOUD/)).toBeTruthy();
  });

  it('reads DARK when offline', () => {
    const { getByText } = render(<TransportPill mode="offline" status="closed" />);
    expect(getByText(/DARK/)).toBeTruthy();
  });

  it('shows a hollow dot until the socket is open', () => {
    const closed = render(<TransportPill mode="lan" status="connecting" />);
    expect(closed.getByText(/○/)).toBeTruthy();
    const open = render(<TransportPill mode="lan" status="open" />);
    expect(open.getByText(/●/)).toBeTruthy();
  });

  it('colours cloud mode gold so a cloud session is never mistaken for lan', () => {
    const { getByTestId } = render(<TransportPill mode="cloud" status="open" />);
    expect(getByTestId('transport-pill-label').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.gold })])
    );
  });
});

describe('Scanline', () => {
  it('renders without crashing', () => {
    expect(render(<Scanline height={600} />).toJSON()).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- src/components`
Expected: FAIL — `Cannot find module '../Panel'`.

- [ ] **Step 4: Write Panel.tsx**

Read `https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/` first. Blur is iOS-only here by deliberate choice (see Deviations).

```tsx
// src/components/Panel.tsx
import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLOR, FONT, SPACE } from '../theme/tokens';

export type PanelProps = PropsWithChildren<{
  title: string;
  accent?: string;
  testID?: string;
}>;

export function Panel({ title, accent = COLOR.cyan, testID, children }: PanelProps) {
  const Backing = Platform.OS === 'ios' ? BlurView : View;
  const backingProps = Platform.OS === 'ios' ? { intensity: 18, tint: 'dark' as const } : {};

  return (
    <View testID={testID} style={[styles.frame, { borderColor: accent }]}>
      <Backing {...backingProps} style={styles.backing}>
        <View style={styles.header}>
          <Text testID={testID ? `${testID}-title` : undefined} style={[styles.title, { color: accent }]}>
            {title.toUpperCase()}
          </Text>
          <View style={[styles.rule, { backgroundColor: accent }]} />
        </View>
        <View style={styles.body}>{children}</View>
      </Backing>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
    marginBottom: SPACE.md,
    overflow: 'hidden',
  },
  backing: { backgroundColor: COLOR.panel, paddingBottom: SPACE.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.sm, paddingTop: SPACE.sm },
  title: { fontFamily: FONT.display, fontSize: 10, letterSpacing: 2 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, marginLeft: SPACE.sm, opacity: 0.5 },
  body: { paddingHorizontal: SPACE.sm, paddingTop: SPACE.sm },
});
```

- [ ] **Step 5: Write TransportPill.tsx**

```tsx
// src/components/TransportPill.tsx
import { StyleSheet, Text, View } from 'react-native';
import { COLOR, FONT, SPACE } from '../theme/tokens';
import type { LinkMode, LinkStatus } from '../link/machine';

const LABEL: Record<LinkMode, string> = { lan: 'LAN', cloud: 'CLOUD', offline: 'DARK' };

/** cloud is gold, not cyan: a cloud session holds no PC-control powers and the
 *  user must never read it as a full desk link. */
const TINT: Record<LinkMode, string> = { lan: COLOR.cyan, cloud: COLOR.gold, offline: COLOR.dim };

export function TransportPill({ mode, status }: { mode: LinkMode; status: LinkStatus }) {
  const color = TINT[mode];
  const dot = status === 'open' ? '●' : '○';
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text testID="transport-pill-label" style={[styles.label, { color }]}>
        {`${LABEL[mode]} ${dot}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    backgroundColor: COLOR.cyanDim,
  },
  label: { fontFamily: FONT.data, fontSize: 10, letterSpacing: 1.5 },
});
```

- [ ] **Step 6: Write Scanline.tsx**

```tsx
// src/components/Scanline.tsx
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { HUD_BEZIER } from '../theme/tokens';

/** mirrors the desk HUD's ScanlineTransition.jsx sweep */
export function Scanline({ height }: { height: number }) {
  const y = useSharedValue(-40);

  useEffect(() => {
    y.value = withRepeat(
      withTiming(height, { duration: 5200, easing: Easing.bezier(...HUD_BEZIER) }),
      -1,
      false
    );
  }, [height, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <LinearGradient
        colors={['rgba(0,255,204,0)', 'rgba(0,255,204,0.10)', 'rgba(0,255,204,0)']}
        style={styles.bar}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, height: 40 },
  bar: { flex: 1 },
});
```

`Easing.bezier(...HUD_BEZIER)` needs `HUD_BEZIER` spread as four args; if `tsc` rejects the spread of a readonly tuple, call it as `Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3])`.

- [ ] **Step 7: Run the test again**

Run: `npm test -- src/components`
Expected: PASS, 8 tests.

- [ ] **Step 8: Full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add jest-setup.js package.json src/components
git commit -m "feat: panel, scanline and transport pill hud primitives"
```

---

### Task 10: Reticle and StatusOrb

**Files:**
- Create: `jarvis-mobile/src/components/Reticle.tsx`
- Create: `jarvis-mobile/src/components/StatusOrb.tsx`
- Create: `jarvis-mobile/src/components/__tests__/reticle.test.tsx`

**Interfaces:**
- Consumes: `COLOR`, `FONT`, `HUD_BEZIER` from `../theme/tokens`.
- Produces:
  - `Reticle({ size, status })`
  - `StatusOrb({ status, size? })`
  - `statusColor(status: string): string` exported from `StatusOrb.tsx` — reused by `HudScreen` and `GovernancePanel`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/reticle.test.tsx
import { render } from '@testing-library/react-native';
import { Reticle } from '../Reticle';
import { StatusOrb, statusColor } from '../StatusOrb';
import { COLOR } from '../../theme/tokens';

describe('statusColor', () => {
  it('is cyan for healthy states', () => {
    expect(statusColor('online')).toBe(COLOR.cyan);
    expect(statusColor('listening')).toBe(COLOR.cyan);
  });

  it('is gold while the agent is working or awaiting approval', () => {
    expect(statusColor('thinking')).toBe(COLOR.gold);
    expect(statusColor('agent')).toBe(COLOR.gold);
  });

  it('is red for alert and lockdown', () => {
    expect(statusColor('alert')).toBe(COLOR.red);
    expect(statusColor('lockdown')).toBe(COLOR.red);
  });

  it('is green while speaking', () => {
    expect(statusColor('speaking')).toBe(COLOR.green);
  });

  it('falls back to dim for anything unrecognised', () => {
    expect(statusColor('boot')).toBe(COLOR.dim);
    expect(statusColor('who knows')).toBe(COLOR.dim);
  });
});

describe('Reticle', () => {
  it('renders at the requested size', () => {
    const { getByTestId } = render(<Reticle size={180} status="online" />);
    expect(getByTestId('reticle')).toBeTruthy();
  });
});

describe('StatusOrb', () => {
  it('renders and labels the current status', () => {
    const { getByText } = render(<StatusOrb status="online" />);
    expect(getByText('ONLINE')).toBeTruthy();
  });

  it('labels an alert state', () => {
    const { getByText } = render(<StatusOrb status="alert" />);
    expect(getByText('ALERT')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/__tests__/reticle.test.tsx`
Expected: FAIL — `Cannot find module '../Reticle'`.

- [ ] **Step 3: Write StatusOrb.tsx**

```tsx
// src/components/StatusOrb.tsx
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLOR, FONT, HUD_BEZIER, SPACE } from '../theme/tokens';

const CYAN = ['online', 'listening', 'idle', 'ready'];
const GOLD = ['thinking', 'agent', 'agent_step', 'parked', 'working'];
const RED = ['alert', 'lockdown', 'error', 'security'];
const GREEN = ['speaking', 'done', 'confirmed'];

export function statusColor(status: string): string {
  if (CYAN.includes(status)) return COLOR.cyan;
  if (GOLD.includes(status)) return COLOR.gold;
  if (RED.includes(status)) return COLOR.red;
  if (GREEN.includes(status)) return COLOR.green;
  return COLOR.dim;
}

export function StatusOrb({ status, size = 96 }: { status: string; size?: number }) {
  const color = statusColor(status);
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.bezier(HUD_BEZIER[0], HUD_BEZIER[1], HUD_BEZIER[2], HUD_BEZIER[3]) }),
      -1,
      true
    );
  }, [pulse, status]);

  const glow = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.9 + pulse.value * 0.12 }] }));

  const r = size / 2;
  return (
    <View style={styles.wrap} testID="status-orb">
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, glow]}>
        <Svg width={size} height={size}>
          <Circle cx={r} cy={r} r={r * 0.62} fill={color} opacity={0.18} />
          <Circle cx={r} cy={r} r={r * 0.34} fill={color} opacity={0.55} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r * 0.2} fill={color} />
      </Svg>
      <Text style={[styles.label, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: FONT.display, fontSize: 11, letterSpacing: 3, marginTop: SPACE.sm },
});
```

- [ ] **Step 4: Write Reticle.tsx**

Rotation lives on the wrapping `View`; the SVG arcs are static. See Deviations.

```tsx
// src/components/Reticle.tsx
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { statusColor } from './StatusOrb';

export function Reticle({ size, status }: { size: number; status: string }) {
  const spin = useSharedValue(0);
  const counter = useSharedValue(0);
  const color = statusColor(status);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    counter.value = withRepeat(withTiming(-360, { duration: 22000, easing: Easing.linear }), -1, false);
  }, [spin, counter]);

  const outer = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const inner = useAnimatedStyle(() => ({ transform: [{ rotate: `${counter.value}deg` }] }));

  const c = size / 2;
  const dash = (r: number, on: number, off: number) => ({
    cx: c,
    cy: c,
    r,
    stroke: color,
    strokeWidth: 1,
    fill: 'none',
    strokeDasharray: `${on} ${off}`,
  });

  return (
    <View testID="reticle" style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, outer]}>
        <Svg width={size} height={size}>
          <Circle {...dash(c * 0.94, 24, 10)} opacity={0.7} />
          <G opacity={0.45}>
            <Line x1={c} y1={2} x2={c} y2={12} stroke={color} strokeWidth={1} />
            <Line x1={c} y1={size - 12} x2={c} y2={size - 2} stroke={color} strokeWidth={1} />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, inner]}>
        <Svg width={size} height={size}>
          <Circle {...dash(c * 0.74, 6, 14)} opacity={0.5} />
          <Circle cx={c} cy={c} r={c * 0.56} stroke={color} strokeWidth={0.5} fill="none" opacity={0.25} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 5: Run the test again**

Run: `npm test -- src/components/__tests__/reticle.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "feat: animated reticle and status-reactive orb"
```

---

### Task 11: VitalsPanel and TracePanel

**Files:**
- Create: `jarvis-mobile/src/components/VitalsPanel.tsx`
- Create: `jarvis-mobile/src/components/TracePanel.tsx`
- Create: `jarvis-mobile/src/components/__tests__/panels.test.tsx`

**Interfaces:**
- Consumes: `Panel`; `TelemetryData` from `../ws/frames`; `TraceEntry` from `../state/hudReducer`.
- Produces: `VitalsPanel({ telemetry })`, `TracePanel({ trace })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/panels.test.tsx
import { render } from '@testing-library/react-native';
import { VitalsPanel } from '../VitalsPanel';
import { TracePanel } from '../TracePanel';
import type { TraceEntry } from '../../state/hudReducer';

describe('VitalsPanel', () => {
  it('renders cpu and memory readouts', () => {
    const { getByText } = render(<VitalsPanel telemetry={{ cpu: 34, mem: 61 }} />);
    expect(getByText('CPU')).toBeTruthy();
    expect(getByText('34%')).toBeTruthy();
    expect(getByText('MEM')).toBeTruthy();
    expect(getByText('61%')).toBeTruthy();
  });

  it('shows a dash for metrics the backend did not send', () => {
    const { getByTestId } = render(<VitalsPanel telemetry={{ cpu: 34 }} />);
    expect(getByTestId('vital-mem').props.children).toBe('—');
  });

  it('renders a waiting state before any telemetry arrives', () => {
    const { getByText } = render(<VitalsPanel telemetry={null} />);
    expect(getByText(/AWAITING/i)).toBeTruthy();
  });
});

describe('TracePanel', () => {
  const entry = (event: string, at: number): TraceEntry => ({ goal: 'tidy downloads', event, detail: 'listing', step: 1, at });

  it('renders trace events newest last', () => {
    const { getByText } = render(<TracePanel trace={[entry('thinking', 1), entry('plan', 2)]} />);
    expect(getByText(/thinking/)).toBeTruthy();
    expect(getByText(/plan/)).toBeTruthy();
  });

  it('shows the goal once at the top', () => {
    const { getAllByText } = render(<TracePanel trace={[entry('thinking', 1), entry('plan', 2)]} />);
    expect(getAllByText(/tidy downloads/)).toHaveLength(1);
  });

  it('renders an idle line when the agent has done nothing', () => {
    const { getByText } = render(<TracePanel trace={[]} />);
    expect(getByText(/IDLE/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/__tests__/panels.test.tsx`
Expected: FAIL — `Cannot find module '../VitalsPanel'`.

- [ ] **Step 3: Write VitalsPanel.tsx**

```tsx
// src/components/VitalsPanel.tsx
import { StyleSheet, Text, View } from 'react-native';
import { Panel } from './Panel';
import { COLOR, FONT, SPACE } from '../theme/tokens';
import type { TelemetryData } from '../ws/frames';

const pct = (v: number | null | undefined): string => (typeof v === 'number' ? `${Math.round(v)}%` : '—');

function Vital({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text testID={testID} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

export function VitalsPanel({ telemetry }: { telemetry: TelemetryData | null }) {
  return (
    <Panel title="vitals" testID="vitals">
      {telemetry === null ? (
        <Text style={styles.waiting}>AWAITING TELEMETRY</Text>
      ) : (
        <View style={styles.grid}>
          <Vital label="CPU" value={pct(telemetry.cpu)} testID="vital-cpu" />
          <Vital label="MEM" value={pct(telemetry.mem)} testID="vital-mem" />
          <Vital label="DISK" value={pct(telemetry.disk)} testID="vital-disk" />
          <Vital label="GPU" value={pct(telemetry.gpu)} testID="vital-gpu" />
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', flexDirection: 'row', justifyContent: 'space-between', paddingRight: SPACE.md, paddingBottom: SPACE.xs },
  label: { fontFamily: FONT.data, fontSize: 11, color: COLOR.dim, letterSpacing: 1 },
  value: { fontFamily: FONT.data, fontSize: 11, color: COLOR.cyan },
  waiting: { fontFamily: FONT.data, fontSize: 11, color: COLOR.dim, letterSpacing: 1 },
});
```

- [ ] **Step 4: Write TracePanel.tsx**

```tsx
// src/components/TracePanel.tsx
import { StyleSheet, Text, View } from 'react-native';
import { Panel } from './Panel';
import { COLOR, FONT } from '../theme/tokens';
import type { TraceEntry } from '../state/hudReducer';

export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const goal = trace.length ? trace[trace.length - 1].goal : '';
  return (
    <Panel title="trace" accent={COLOR.gold} testID="trace">
      {trace.length === 0 ? (
        <Text style={styles.dim}>AGENT IDLE</Text>
      ) : (
        <View>
          {goal ? <Text style={styles.goal}>{`▸ ${goal}`}</Text> : null}
          {trace.slice(-8).map((t, i) => (
            <Text key={`${t.at}-${i}`} style={styles.line} numberOfLines={2}>
              {`> ${t.event}${t.detail ? ` — ${t.detail}` : ''}`}
            </Text>
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  goal: { fontFamily: FONT.data, fontSize: 11, color: COLOR.gold, marginBottom: 4 },
  line: { fontFamily: FONT.data, fontSize: 11, color: COLOR.dim, lineHeight: 16 },
  dim: { fontFamily: FONT.data, fontSize: 11, color: COLOR.dim, letterSpacing: 1 },
});
```

- [ ] **Step 5: Run the test again**

Run: `npm test -- src/components/__tests__/panels.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "feat: vitals and agent trace panels"
```

---

### Task 12: GovernancePanel — the headline feature

**Files:**
- Create: `jarvis-mobile/src/components/GovernancePanel.tsx`
- Create: `jarvis-mobile/src/components/__tests__/governance.test.tsx`

**Interfaces:**
- Consumes: `Panel`; `ParkedAction` from `../state/hudReducer`; `COLOR` tokens.
- Produces: `GovernancePanel({ parked, onDecide, disabled? })` where `onDecide: (id: string, approved: boolean) => void`.

The panel is pure presentation plus callbacks — the REST call and the optimistic `resolving` dispatch live in `HudScreen`, so this component stays testable without a network.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/governance.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { GovernancePanel } from '../GovernancePanel';
import type { ParkedAction } from '../../state/hudReducer';

const parked = (over: Partial<ParkedAction> = {}): ParkedAction => ({
  id: 'a1',
  goal: 'tidy downloads',
  action: 'delete 3 files',
  detail: 'setup_old.exe, node_v12.msi, tmp.iso',
  risk: 'high',
  at: 1000,
  resolving: false,
  ...over,
});

describe('GovernancePanel', () => {
  it('renders nothing when there is nothing parked', () => {
    expect(render(<GovernancePanel parked={[]} onDecide={jest.fn()} />).toJSON()).toBeNull();
  });

  it('shows the action, its goal and its detail', () => {
    const { getByText } = render(<GovernancePanel parked={[parked()]} onDecide={jest.fn()} />);
    expect(getByText('delete 3 files')).toBeTruthy();
    expect(getByText(/tidy downloads/)).toBeTruthy();
    expect(getByText(/setup_old.exe/)).toBeTruthy();
  });

  it('calls onDecide with approved=true when ALLOW is pressed', () => {
    const onDecide = jest.fn();
    const { getByTestId } = render(<GovernancePanel parked={[parked()]} onDecide={onDecide} />);
    fireEvent.press(getByTestId('allow-a1'));
    expect(onDecide).toHaveBeenCalledWith('a1', true);
  });

  it('calls onDecide with approved=false when DENY is pressed', () => {
    const onDecide = jest.fn();
    const { getByTestId } = render(<GovernancePanel parked={[parked()]} onDecide={onDecide} />);
    fireEvent.press(getByTestId('deny-a1'));
    expect(onDecide).toHaveBeenCalledWith('a1', false);
  });

  it('renders one card per parked action', () => {
    const { getByTestId } = render(<GovernancePanel parked={[parked(), parked({ id: 'a2', action: 'reboot pc' })]} onDecide={jest.fn()} />);
    expect(getByTestId('parked-a1')).toBeTruthy();
    expect(getByTestId('parked-a2')).toBeTruthy();
  });

  it('does not fire onDecide twice while an action is resolving', () => {
    const onDecide = jest.fn();
    const { getByTestId } = render(<GovernancePanel parked={[parked({ resolving: true })]} onDecide={onDecide} />);
    fireEvent.press(getByTestId('allow-a1'));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('does not fire onDecide when the whole panel is disabled', () => {
    const onDecide = jest.fn();
    const { getByTestId } = render(<GovernancePanel parked={[parked()]} onDecide={onDecide} disabled />);
    fireEvent.press(getByTestId('deny-a1'));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('labels a resolving action as sending', () => {
    const { getByText } = render(<GovernancePanel parked={[parked({ resolving: true })]} onDecide={jest.fn()} />);
    expect(getByText(/SENDING/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/__tests__/governance.test.tsx`
Expected: FAIL — `Cannot find module '../GovernancePanel'`.

- [ ] **Step 3: Write GovernancePanel.tsx**

```tsx
// src/components/GovernancePanel.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Panel } from './Panel';
import { COLOR, FONT, SPACE } from '../theme/tokens';
import type { ParkedAction } from '../state/hudReducer';

export type GovernancePanelProps = {
  parked: ParkedAction[];
  onDecide: (id: string, approved: boolean) => void;
  disabled?: boolean;
};

export function GovernancePanel({ parked, onDecide, disabled = false }: GovernancePanelProps) {
  if (parked.length === 0) return null;

  return (
    <Panel title="parked ⚠" accent={COLOR.gold} testID="governance">
      {parked.map((p) => {
        const locked = disabled || p.resolving;
        return (
          <View key={p.id} testID={`parked-${p.id}`} style={styles.card}>
            <Text style={styles.action}>{p.action}</Text>
            {p.goal ? <Text style={styles.meta}>{`goal: ${p.goal}`}</Text> : null}
            {p.detail ? (
              <Text style={styles.meta} numberOfLines={3}>
                {p.detail}
              </Text>
            ) : null}
            {p.risk ? <Text style={styles.risk}>{`RISK ${p.risk.toUpperCase()}`}</Text> : null}
            <View style={styles.row}>
              <Pressable
                testID={`deny-${p.id}`}
                disabled={locked}
                onPress={() => onDecide(p.id, false)}
                style={[styles.btn, { borderColor: COLOR.red }, locked && styles.locked]}
              >
                <Text style={[styles.btnText, { color: COLOR.red }]}>DENY</Text>
              </Pressable>
              <Pressable
                testID={`allow-${p.id}`}
                disabled={locked}
                onPress={() => onDecide(p.id, true)}
                style={[styles.btn, { borderColor: COLOR.green }, locked && styles.locked]}
              >
                <Text style={[styles.btnText, { color: COLOR.green }]}>ALLOW</Text>
              </Pressable>
            </View>
            {p.resolving ? <Text style={styles.sending}>SENDING…</Text> : null}
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { paddingBottom: SPACE.sm },
  action: { fontFamily: FONT.display, fontSize: 13, color: COLOR.gold, marginBottom: 2 },
  meta: { fontFamily: FONT.data, fontSize: 11, color: COLOR.dim, lineHeight: 15 },
  risk: { fontFamily: FONT.data, fontSize: 10, color: COLOR.red, letterSpacing: 1.5, marginTop: 4 },
  row: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
  },
  locked: { opacity: 0.35 },
  btnText: { fontFamily: FONT.display, fontSize: 11, letterSpacing: 2 },
  sending: { fontFamily: FONT.data, fontSize: 10, color: COLOR.dim, marginTop: 4, letterSpacing: 1 },
});
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/components/__tests__/governance.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: governance panel for parked agent actions"
```

---

### Task 13: CommandBar

**Files:**
- Create: `jarvis-mobile/src/components/CommandBar.tsx`
- Create: `jarvis-mobile/src/components/__tests__/commandBar.test.tsx`

**Interfaces:**
- Consumes: `COLOR`, `FONT`, `SPACE`.
- Produces: `CommandBar({ onSubmit, disabled?, placeholder? })` where `onSubmit: (text: string) => void`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/commandBar.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { CommandBar } from '../CommandBar';

describe('CommandBar', () => {
  it('submits trimmed text and clears the field', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<CommandBar onSubmit={onSubmit} />);
    const input = getByTestId('command-input');
    fireEvent.changeText(input, '  lights on  ');
    fireEvent(input, 'submitEditing');
    expect(onSubmit).toHaveBeenCalledWith('lights on');
    expect(input.props.value).toBe('');
  });

  it('submits when the send button is pressed', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<CommandBar onSubmit={onSubmit} />);
    fireEvent.changeText(getByTestId('command-input'), 'status report');
    fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).toHaveBeenCalledWith('status report');
  });

  it('ignores an empty or whitespace-only submit', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<CommandBar onSubmit={onSubmit} />);
    fireEvent(getByTestId('command-input'), 'submitEditing');
    fireEvent.changeText(getByTestId('command-input'), '    ');
    fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit while disabled', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<CommandBar onSubmit={onSubmit} disabled />);
    fireEvent.changeText(getByTestId('command-input'), 'lights on');
    fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the given placeholder', () => {
    const { getByPlaceholderText } = render(<CommandBar onSubmit={jest.fn()} placeholder="link lost" />);
    expect(getByPlaceholderText('link lost')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/components/__tests__/commandBar.test.tsx`
Expected: FAIL — `Cannot find module '../CommandBar'`.

- [ ] **Step 3: Write CommandBar.tsx**

```tsx
// src/components/CommandBar.tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLOR, FONT, SPACE } from '../theme/tokens';

export type CommandBarProps = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function CommandBar({ onSubmit, disabled = false, placeholder = 'speak or type…' }: CommandBarProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (disabled || !trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <View style={[styles.bar, disabled && styles.disabled]}>
      <Text style={styles.caret}>▸</Text>
      <TextInput
        testID="command-input"
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={COLOR.dim}
        editable={!disabled}
        returnKeyType="send"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable testID="command-send" onPress={submit} disabled={disabled} hitSlop={8}>
        <Text style={styles.send}>SEND</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.cyan,
    backgroundColor: COLOR.panel,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  disabled: { opacity: 0.4 },
  caret: { color: COLOR.cyan, fontFamily: FONT.data, fontSize: 12 },
  input: { flex: 1, color: COLOR.cyan, fontFamily: FONT.data, fontSize: 13, paddingVertical: SPACE.xs },
  send: { color: COLOR.cyan, fontFamily: FONT.display, fontSize: 10, letterSpacing: 2 },
});
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/components/__tests__/commandBar.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: command bar for text commands"
```

---

### Task 14: HudScreen and app shell

**Files:**
- Create: `jarvis-mobile/src/screens/HudScreen.tsx`
- Create: `jarvis-mobile/src/screens/__tests__/HudScreen.test.tsx`
- Modify: `jarvis-mobile/App.tsx`
- Modify: `jarvis-mobile/app.json`

**Interfaces:**
- Consumes: everything built so far — `useLink`, `hudReducer`, `createApi`, all components, `DEFAULT_ENDPOINTS`, `loadToken`.
- Produces: `HudScreen({ deps? })` where `deps` is a test seam:
  `HudScreenDeps = { useLinkImpl?: typeof useLink; apiFactory?: (mode: LinkMode) => Api; now?: () => number }`

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/__tests__/HudScreen.test.tsx
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { HudScreen } from '../HudScreen';
import type { JarvisFrame } from '../../ws/frames';
import type { Api } from '../../api/client';
import type { UseLinkOptions, UseLinkResult } from '../../link/useLink';

type Emit = (frame: JarvisFrame) => void;

const harness = (over: Partial<UseLinkResult> = {}) => {
  let emit: Emit = () => {};
  const send = jest.fn(() => true);
  const useLinkImpl = (opts: UseLinkOptions): UseLinkResult => {
    emit = (frame) => opts.onFrame(frame, 1000);
    return { mode: 'lan', status: 'open', lastError: null, send, reprobe: jest.fn(), ...over };
  };
  const api: Api = {
    healthSummary: jest.fn(async () => ({})),
    telemetry: jest.fn(async () => ({})),
    backdoor: jest.fn(async () => ({})),
    pending: jest.fn(async () => ({ pending: [] })),
    confirm: jest.fn(async () => undefined),
    tasks: jest.fn(async () => ({})),
    presence: jest.fn(async () => ({})),
  };
  const utils = render(<HudScreen deps={{ useLinkImpl, apiFactory: () => api, now: () => 1000 }} />);
  return { ...utils, emit: (f: JarvisFrame) => act(() => emit(f)), api, send };
};

describe('HudScreen', () => {
  it('shows the transport pill for the current link mode', () => {
    const { getByText } = harness();
    expect(getByText(/LAN/)).toBeTruthy();
  });

  it('renders the status from a status frame', () => {
    const h = harness();
    h.emit({ kind: 'status', status: 'online', message: 'Systems nominal', user: 'sir' });
    expect(h.getByText('ONLINE')).toBeTruthy();
    expect(h.getByText('Systems nominal')).toBeTruthy();
  });

  it('renders telemetry into the vitals panel', () => {
    const h = harness();
    h.emit({ kind: 'telemetry', data: { cpu: 34, mem: 61 } });
    expect(h.getByText('34%')).toBeTruthy();
  });

  it('renders an agent trace', () => {
    const h = harness();
    h.emit({ kind: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: '', step: 1 });
    expect(h.getByText(/thinking/)).toBeTruthy();
  });

  it('surfaces a parked action and posts the approval', async () => {
    const h = harness();
    h.emit({ kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: '', risk: 'high' });
    expect(h.getByText('delete 3 files')).toBeTruthy();
    fireEvent.press(h.getByTestId('allow-a1'));
    await waitFor(() => expect(h.api.confirm).toHaveBeenCalledWith('a1', true));
  });

  it('posts a denial', async () => {
    const h = harness();
    h.emit({ kind: 'agent_parked', id: 'a1', goal: '', action: 'reboot pc', detail: '', risk: '' });
    fireEvent.press(h.getByTestId('deny-a1'));
    await waitFor(() => expect(h.api.confirm).toHaveBeenCalledWith('a1', false));
  });

  it('clears the parked card once the server resolves it', async () => {
    const h = harness();
    h.emit({ kind: 'agent_parked', id: 'a1', goal: '', action: 'reboot pc', detail: '', risk: '' });
    h.emit({ kind: 'agent_confirm', id: 'a1', action: '', resolved: true, approved: true });
    await waitFor(() => expect(h.queryByText('reboot pc')).toBeNull());
  });

  it('sends a typed command through the rest client and logs it', async () => {
    const h = harness();
    fireEvent.changeText(h.getByTestId('command-input'), 'lights on');
    fireEvent.press(h.getByTestId('command-send'));
    await waitFor(() => expect(h.api.backdoor).toHaveBeenCalledWith('lights on'));
    expect(h.getByText('lights on')).toBeTruthy();
  });

  it('shows a LINK LOST banner and disables the command bar when offline', () => {
    const h = harness({ mode: 'offline', status: 'closed' });
    expect(h.getByText(/LINK LOST/)).toBeTruthy();
    fireEvent.changeText(h.getByTestId('command-input'), 'lights on');
    fireEvent.press(h.getByTestId('command-send'));
    expect(h.api.backdoor).not.toHaveBeenCalled();
  });

  it('warns that a cloud session has no pc control', () => {
    const h = harness({ mode: 'cloud', status: 'open' });
    expect(h.getByText(/NO PC CONTROL/i)).toBeTruthy();
  });

  it('fetches cold-start telemetry and pending actions on mount', async () => {
    const h = harness();
    await waitFor(() => {
      expect(h.api.telemetry).toHaveBeenCalled();
      expect(h.api.pending).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/screens`
Expected: FAIL — `Cannot find module '../HudScreen'`.

- [ ] **Step 3: Write HudScreen.tsx**

```tsx
// src/screens/HudScreen.tsx
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLOR, FONT, SCRIM, SPACE } from '../theme/tokens';
import { hudReducer, initialHudState } from '../state/hudReducer';
import { parseFrame, JarvisFrame } from '../ws/frames';
import { useLink, UseLinkOptions, UseLinkResult } from '../link/useLink';
import { DEFAULT_ENDPOINTS, LinkMode, loadToken } from '../link/config';
import { Api, createApi } from '../api/client';
import { Reticle } from '../components/Reticle';
import { StatusOrb } from '../components/StatusOrb';
import { Scanline } from '../components/Scanline';
import { TransportPill } from '../components/TransportPill';
import { VitalsPanel } from '../components/VitalsPanel';
import { TracePanel } from '../components/TracePanel';
import { GovernancePanel } from '../components/GovernancePanel';
import { CommandBar } from '../components/CommandBar';

export type HudScreenDeps = {
  useLinkImpl?: (opts: UseLinkOptions) => UseLinkResult;
  apiFactory?: (mode: LinkMode) => Api;
  now?: () => number;
};

export function HudScreen({ deps = {} }: { deps?: HudScreenDeps }) {
  const { useLinkImpl = useLink, apiFactory, now = () => Date.now() } = deps;
  const [state, dispatch] = useReducer(hudReducer, initialHudState);
  const [token, setToken] = useState<string | null>(null);
  const { height } = useWindowDimensions();

  useEffect(() => {
    void loadToken().then(setToken);
  }, []);

  const onFrame = useCallback(
    (frame: JarvisFrame, at: number) => {
      dispatch({ type: 'frame', frame, at });
    },
    [dispatch]
  );

  const link = useLinkImpl({ onFrame });
  const online = link.status === 'open';

  const api = useMemo(() => {
    if (apiFactory) return apiFactory(link.mode);
    const baseUrl =
      link.mode === 'cloud' && DEFAULT_ENDPOINTS.cloudBase ? DEFAULT_ENDPOINTS.cloudBase : DEFAULT_ENDPOINTS.deskBase;
    return createApi({ baseUrl, token });
  }, [apiFactory, link.mode, token]);

  // cold start: the socket only carries frames from now on, so seed from REST
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || link.mode === 'offline') return;
    seeded.current = true;
    void (async () => {
      try {
        const telemetry = await api.telemetry();
        const frame = parseFrame({ status: 'sync', type: 'telemetry', data: telemetry });
        if (frame) dispatch({ type: 'frame', frame, at: now() });
      } catch {
        /* the socket will fill this in when it opens */
      }
      try {
        const body = (await api.pending()) as { pending?: unknown[] } | null;
        for (const raw of body?.pending ?? []) {
          const frame = parseFrame({ ...(raw as object), type: 'agent_parked' });
          if (frame) dispatch({ type: 'frame', frame, at: now() });
        }
      } catch {
        /* nothing parked, or the gate rejected us */
      }
    })();
  }, [api, link.mode, now]);

  const decide = useCallback(
    (id: string, approved: boolean) => {
      dispatch({ type: 'resolving', id });
      void api
        .confirm(id, approved)
        .then(() => dispatch({ type: 'resolved_local', id }))
        .catch(() => dispatch({ type: 'resolving', id }));
    },
    [api]
  );

  const sendCommand = useCallback(
    (text: string) => {
      dispatch({ type: 'local_command', text, at: now() });
      void api.backdoor(text).catch(() => {
        /* the status frame never arrives; the chat log keeps the attempt visible */
      });
    },
    [api, now]
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[SCRIM[0], SCRIM[1]]} style={StyleSheet.absoluteFill} />
      <Scanline height={height} />

      <View style={styles.header}>
        <Text style={styles.brand}>◦ J.A.R.V.I.S</Text>
        <TransportPill mode={link.mode} status={link.status} />
      </View>

      {link.mode === 'offline' ? <Text style={styles.lost}>LINK LOST — LAST KNOWN STATE</Text> : null}
      {link.mode === 'cloud' ? <Text style={styles.cloud}>CLOUD SESSION — NO PC CONTROL</Text> : null}
      {state.weather ? (
        <Text style={styles.weather}>
          {`${state.weather.city ?? ''} ${state.weather.temp ?? ''}° ${state.weather.desc ?? ''}`.trim()}
        </Text>
      ) : null}

      <ScrollView
        style={[styles.scroll, link.mode === 'offline' && styles.stale]}
        contentContainerStyle={styles.scrollBody}
      >
        <View style={styles.reticleWrap}>
          <Reticle size={200} status={state.status} />
          <View style={styles.orbWrap}>
            <StatusOrb status={state.status} />
          </View>
        </View>

        {state.message ? <Text style={styles.message}>{state.message}</Text> : null}

        <VitalsPanel telemetry={state.telemetry} />
        <GovernancePanel parked={state.parked} onDecide={decide} disabled={!online} />
        <TracePanel trace={state.trace} />

        {state.chat.slice(-6).map((c, i) => (
          <Text key={`${c.at}-${i}`} style={c.from === 'user' ? styles.chatUser : styles.chatJarvis}>
            {c.text}
          </Text>
        ))}
      </ScrollView>

      <CommandBar
        onSubmit={sendCommand}
        disabled={link.mode === 'offline'}
        placeholder={link.mode === 'offline' ? 'link lost' : 'speak or type…'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.xl + SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  brand: { fontFamily: FONT.display, fontSize: 13, letterSpacing: 3, color: COLOR.cyan },
  lost: {
    fontFamily: FONT.data,
    fontSize: 10,
    letterSpacing: 2,
    color: COLOR.red,
    textAlign: 'center',
    paddingBottom: SPACE.xs,
  },
  cloud: {
    fontFamily: FONT.data,
    fontSize: 10,
    letterSpacing: 2,
    color: COLOR.gold,
    textAlign: 'center',
    paddingBottom: SPACE.xs,
  },
  weather: { fontFamily: FONT.data, fontSize: 10, color: COLOR.dim, textAlign: 'center', paddingBottom: SPACE.xs },
  scroll: { flex: 1 },
  stale: { opacity: 0.45 },
  scrollBody: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.xl },
  reticleWrap: { alignItems: 'center', justifyContent: 'center', height: 220, marginBottom: SPACE.md },
  orbWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  message: {
    fontFamily: FONT.data,
    fontSize: 12,
    color: COLOR.cyan,
    textAlign: 'center',
    marginBottom: SPACE.md,
  },
  chatUser: { fontFamily: FONT.data, fontSize: 11, color: COLOR.dim, textAlign: 'right', marginBottom: 2 },
  chatJarvis: { fontFamily: FONT.data, fontSize: 11, color: COLOR.cyan, marginBottom: 2 },
});
```

- [ ] **Step 4: Run the screen test**

Run: `npm test -- src/screens`
Expected: PASS, 11 tests.

- [ ] **Step 5: Rewrite App.tsx to load Orbitron and mount the HUD**

Read `https://docs.expo.dev/develop/user-interface/fonts/` before writing this.

```tsx
// App.tsx
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Orbitron_400Regular, Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { HudScreen } from './src/screens/HudScreen';
import { COLOR } from './src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [loaded, error] = useFonts({ Orbitron_400Regular, Orbitron_700Bold });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <HudScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
```

- [ ] **Step 6: Make app.json dark**

Set the HUD background everywhere the OS paints for us:

```json
{
  "expo": {
    "name": "jarvis-mobile",
    "slug": "jarvis-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "backgroundColor": "#050505",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#050505"
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#050505",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

- [ ] **Step 7: Full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add App.tsx app.json src/screens
git commit -m "feat: hud screen assembly, orbitron font loading and dark app shell"
```

---

### Task 15: Mock-driven integration test and run docs

**Files:**
- Create: `jarvis-mobile/__tests__/integration.test.ts`
- Create: `jarvis-mobile/README.md`
- Modify: `jarvis-mobile/.gitignore` (ignore `.env.local`)

**Interfaces:**
- Consumes: `startMockServer` from `mock/server.js`; `LinkMachine`; `hudReducer`; `createApi`.
- Produces: proof that the real machine, the real parser and the real reducer agree with the mock backend's wire shapes.

This is the test that would catch frame drift — it drives `LinkMachine` over a genuine WebSocket against a genuine HTTP server, using the node `ws` client as the injected `wsFactory`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration.test.ts
import WebSocket from 'ws';
import { LinkMachine, MinimalSocket } from '../src/link/machine';
import { hudReducer, initialHudState, HudState } from '../src/state/hudReducer';
import { createApi } from '../src/api/client';
import { Endpoints } from '../src/link/config';

const { startMockServer } = require('../mock/server.js') as {
  startMockServer: (o?: { port?: number; tickMs?: number; timeline?: boolean }) => Promise<{
    port: number;
    httpBase: string;
    wsUrl: string;
    broadcast: (frame: unknown) => void;
    close: () => Promise<void>;
  }>;
};

const wsFactory = (url: string): MinimalSocket => {
  const socket = new WebSocket(url);
  const shim: MinimalSocket = {
    send: (data) => socket.send(data),
    close: () => socket.close(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  socket.on('open', () => shim.onopen?.());
  socket.on('close', () => shim.onclose?.());
  socket.on('error', (e) => shim.onerror?.(e));
  socket.on('message', (raw) => shim.onmessage?.({ data: String(raw) }));
  return shim;
};

jest.setTimeout(15000);

describe('app against the mock backend', () => {
  let server: Awaited<ReturnType<typeof startMockServer>>;
  let machine: LinkMachine;
  let state: HudState;

  const until = (predicate: () => boolean, label: string) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (predicate()) {
          clearInterval(poll);
          resolve();
        } else if (Date.now() - started > 8000) {
          clearInterval(poll);
          reject(new Error(`timed out waiting for ${label}`));
        }
      }, 25);
    });

  beforeEach(async () => {
    server = await startMockServer({ port: 0, timeline: false });
    state = initialHudState;
    const endpoints: Endpoints = { deskBase: server.httpBase, cloudBase: null };
    machine = new LinkMachine({
      endpoints,
      token: null,
      fetchImpl: (...a: Parameters<typeof fetch>) => fetch(...a),
      wsFactory,
      now: () => Date.now(),
      onFrame: (frame, at) => {
        state = hudReducer(state, { type: 'frame', frame, at });
      },
    });
    await machine.start();
    await until(() => machine.snapshot.status === 'open', 'socket open');
  });

  afterEach(async () => {
    machine.stop();
    await server.close();
  });

  it('reaches the mock over lan', () => {
    expect(machine.snapshot.mode).toBe('lan');
  });

  it('renders the greeting, telemetry and weather from the connect burst', async () => {
    await until(() => state.status === 'online' && state.telemetry !== null && state.weather !== null, 'connect burst');
    expect(state.message).toContain('nominal');
    expect(typeof state.telemetry!.cpu).toBe('number');
    expect(state.weather!.city).toBe('Kolkata');
  });

  it('turns a broadcast agent_step into a trace entry', async () => {
    server.broadcast({ type: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing', step: 1 });
    await until(() => state.trace.length === 1, 'trace entry');
    expect(state.trace[0].event).toBe('thinking');
  });

  it('parks an action and clears it through the real confirm endpoint', async () => {
    server.broadcast({
      type: 'agent_parked',
      id: 'demo-1',
      goal: 'tidy downloads',
      action: 'delete 3 files',
      detail: 'a, b, c',
      risk: 'high',
    });
    await until(() => state.parked.length === 1, 'parked action');
    expect(state.parked[0].action).toBe('delete 3 files');

    const api = createApi({ baseUrl: server.httpBase, token: null });
    await api.confirm('demo-1', false);

    await until(() => state.parked.length === 0, 'parked action cleared');
  });

  it('round-trips a backdoor command into the chat log', async () => {
    const api = createApi({ baseUrl: server.httpBase, token: null });
    await api.backdoor('lights on');
    await until(() => state.chat.some((c) => c.text.includes('lights on')), 'command echo');
  });

  it('goes offline when the backend dies and recovers on reprobe', async () => {
    await server.close();
    await machine.tick();
    await until(() => machine.snapshot.mode === 'offline', 'offline');

    server = await startMockServer({ port: server.port, timeline: false });
    await machine.reprobe();
    await until(() => machine.snapshot.status === 'open', 'reconnected');
    expect(machine.snapshot.mode).toBe('lan');
  });
});
```

- [ ] **Step 2: Run it and watch it fail or pass honestly**

Run: `npm test -- __tests__/integration.test.ts`
Expected: PASS, 6 tests. If the last test cannot rebind the same port on Windows, change it to start the replacement server on `port: 0` and construct a second machine — do not weaken the assertion that offline is reached.

- [ ] **Step 3: Write README.md**

```markdown
# jarvis-mobile

Phone client for J.A.R.V.I.S. — one HUD canvas, LAN-or-cloud transport, and the
first client for the backend's `agent_parked` approval flow.

Design: `../docs/superpowers/specs/2026-08-10-jarvis-mobile-hud-design.md`
Plan:   `../docs/superpowers/plans/2026-08-10-jarvis-mobile-hud.md`

## Run it against the mock backend

```bash
npm install
npm run mock      # terminal 1 — http://127.0.0.1:8787
npm start         # terminal 2 — scan the QR with Expo Go
```

The mock serves the REST surface and a scripted WS timeline: boot, telemetry
ticks, an agent trace, then a parked action awaiting approval.

## Point it at the real desk backend

Create `.env.local`:

```
EXPO_PUBLIC_JARVIS_DESK=http://192.168.1.9:8000
EXPO_PUBLIC_JARVIS_CLOUD=https://your-gateway.onrender.com
```

The desk backend must be started with `JARVIS_BIND_HOST=0.0.0.0` and an app
token — both are backend changes still owed on the desk machine (design §6).
Until then the phone can only reach the mock.

## Tests

```bash
npm test          # unit + mock-driven integration
npm run typecheck
```

## What is NOT done here

Design §6 backend patches (bind host, app auth, push, presence ingest, cloud
`/app-link`), push notifications, background geofence, and any live-hardware
gate. Those are owed on the desk machine and are unverified by construction.
```

- [ ] **Step 4: Ignore the local env file**

Append to `.gitignore`:

```
.env.local
```

- [ ] **Step 5: Run everything one last time**

Run: `npm test && npm run typecheck`
Expected: every suite green. Record the actual test count in the commit body — claims of passing apply only to what ran.

- [ ] **Step 6: Commit**

```bash
git add __tests__ README.md .gitignore
git commit -m "test: mock-driven integration coverage and run docs"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 `jarvis-mobile/` Expo + TS app | 1, 14 |
| §2 `mock/server.js` | 8 |
| §3.1 transport auto-switch, probe timeouts, re-probe triggers | 4, 5, 6 |
| §3.1 `useLink()` shape, transport pill, offline reduced-opacity + `LINK LOST` | 6, 9, 14 |
| §3.2 WS frame contract as a discriminated union; gesture/ui ignored | 2 |
| §3.3 full REST surface | 7 |
| §4 tokens verbatim, HUD_EASE | 1 |
| §4.1 single HUD canvas, no tab bar | 14 |
| §4.2 all nine components | 9, 10, 11, 12, 13 |
| §4.2 components renderable against fixture props | 9–13 (every component test passes plain props) |
| §5 mock emits real shapes, reusable as a fixture source | 8, 15 |
| §6 backend changes | **deliberately not implemented** — recorded in the README as owed |
| §7 token in SecureStore, bearer on REST and WS handshake, cloud visibly distinct | 4 (`loadToken`/`saveToken`, `?token=`), 7 (bearer header), 9 + 14 (cloud gold + NO PC CONTROL banner) |
| §8 unit tests for fallback machine, frame reducer, governance resolve; mock-driven integration; animations untested | 3, 5, 12, 15 |
| §9 Expo, TypeScript, single canvas, node mock, standalone folder | all |
| §10 open items | README + `EXPO_PUBLIC_*` env vars so the desk IP needs no code edit |

Two spec items are knowingly unimplemented and stated as such: the §6 backend patches, and QR-based token transfer (§7) — the token can be written via `saveToken()` but there is no QR scanner in v1, because the desk side that would display the QR does not exist yet. Both are named in the README.

**Placeholder scan:** every code step carries real code; no "TBD", no "add error handling", no "similar to Task N".

**Type consistency:** `LinkMode` is defined once in `src/link/config.ts` and re-exported through use; `LinkStatus`/`LinkSnapshot`/`MinimalSocket`/`MachineDeps` come from `src/link/machine.ts` and are imported by name in Tasks 6, 9, 15. `ParkedAction.resolving` is introduced in Task 3 and consumed in Tasks 12 and 14. `Api` is defined in Task 7 and mocked field-for-field in Task 14's harness. `parseFrame` accepts `string | unknown` from Task 2 onward, which is what Task 14's REST-seeding path relies on.
