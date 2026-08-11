import type { JarvisFrame } from '../ws/frames';

/**
 * A stand-in desk, for showing the app on a phone with no machine to talk to.
 *
 * It is deliberately a pure function of a tick number: no timers, no random
 * numbers, so the same tick always produces the same frame and a test can
 * assert on it. The provider owns the clock.
 *
 * Everything it emits is a real `JarvisFrame` going through the real reducer —
 * demo mode adds no second code path for the screens to read.
 */

const STATUS_CYCLE = ['online', 'listening', 'thinking', 'speaking', 'online'] as const;

const TRACE: ReadonlyArray<{ goal: string; event: string; detail: string }> = [
  { goal: 'Keep the desk tidy', event: 'agent.fs', detail: 'watching 4 paths' },
  { goal: 'Keep the desk tidy', event: 'agent.exec', detail: 'job #218 done' },
  { goal: 'Nightly backup', event: 'agent.net', detail: 'socket idle' },
  { goal: 'Nightly backup', event: 'agent.core', detail: 'heartbeat ok' },
];

/** a slow wave, so the meters move like a machine rather than like noise */
const wave = (tick: number, base: number, span: number, phase: number): number =>
  Math.round(base + span * (0.5 + 0.5 * Math.sin((tick + phase) / 7)));

export function demoFrames(tick: number): JarvisFrame[] {
  const frames: JarvisFrame[] = [
    {
      kind: 'telemetry',
      data: {
        cpu: wave(tick, 18, 26, 0),
        mem: wave(tick, 41, 18, 3),
        disk: 62,
        temp: wave(tick, 44, 9, 5),
        net_up: wave(tick, 1, 3, 1),
        net_down: wave(tick, 4, 9, 2),
      },
    },
  ];

  // the status word changes every fourth tick, not every one — a HUD that
  // never rests reads as broken
  if (tick % 4 === 0) {
    const status = STATUS_CYCLE[(tick / 4) % STATUS_CYCLE.length];
    frames.push({
      kind: 'status',
      status,
      message: status === 'thinking' ? 'Working through the backup queue.' : '',
      user: 'sir',
    });
  }

  if (tick % 3 === 1) {
    const step = TRACE[Math.floor(tick / 3) % TRACE.length];
    frames.push({ kind: 'agent_step', goal: step.goal, event: step.event, detail: step.detail, step: tick });
  }

  // one approval request, once, far enough in to be noticed rather than missed
  if (tick === 6) {
    frames.push({
      kind: 'agent_parked',
      id: 'demo-1',
      goal: 'Free disk space',
      action: 'Delete 2.1 GB of build folders',
      detail: 'C:\\Users\\dev\\projects\\**\\build',
      risk: 'medium',
    });
  }

  return frames;
}

/** what the stand-in desk answers when a command is sent to it */
export function demoReply(command: string): JarvisFrame {
  const text = command.trim().toLowerCase();
  const message =
    text === 'system status'
      ? 'CPU 23%, memory 8.4 of 32 GB, disk 412 of 1000 GB. All systems nominal.'
      : text.startsWith('run script')
        ? `Started ${command.slice('run script'.length).trim()} on the desk.`
        : text === 'take screenshot'
          ? 'Screenshot captured and saved to the desk.'
          : text === 'list files'
            ? 'projects, downloads, notes.md, backup.log'
            : `Acknowledged: ${command}`;

  return { kind: 'status', status: 'speaking', message, user: 'sir' };
}
