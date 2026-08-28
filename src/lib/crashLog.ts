import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the app remembers about the time it died.
 *
 * A crash here restarts in silence: the boundary shows a render error and forgets
 * it on the next launch, an error thrown outside render leaves nothing at all, and
 * the only diagnosis is `adb logcat` on the one machine that built the APK. That is
 * fine while the phone is cabled up and useless every other hour of the day.
 *
 * Two rules shape everything below.
 *
 * **This code runs while the app is dying.** It gets one chance, so every path
 * swallows its own errors and no path may throw — a crash reporter that crashes
 * turns a diagnosable fault into a mystery, and the report is worth strictly less
 * than the fatal path it would have interrupted. That is also why the global
 * handler always calls the one it replaced: the app must still die the way it would
 * have, at the same moment, with the same red box in development.
 *
 * **The record is derived.** An error message quotes its own input — a parse
 * failure on a gateway frame carries that frame, token and chat text included — and
 * this store exists to be read aloud off a screen and pasted into a chat window.
 * `redact()` is the whole of that defence and every rule in it has a test, because
 * a redaction that is nearly right leaks exactly once and then it is out.
 *
 * The native half stays owed. A JS error is catchable, persistable and shippable
 * over the air; a native crash takes the process with no JS involved, needs a
 * service and a build, and is not quietly folded in here (ROADMAP §6, queue 23).
 */

export type CrashKind = 'render' | 'js';

export type CrashBuild = {
  version: string;
  /** the OTA update the crash happened on — a crash on an old bundle is a different crash */
  updateId: string;
  platform: string;
};

export type CrashRecord = {
  at: number;
  kind: CrashKind;
  fatal: boolean;
  name: string;
  message: string;
  frames: string[];
  screen?: string;
  build: CrashBuild;
};

export const CRASH_KEY = 'jarvis_crashes';
const SEEN_KEY = 'jarvis_crashes_seen';

/** enough to see a pattern, few enough that nothing has to be pruned by hand */
export const MAX_CRASHES = 5;
const MAX_FRAMES = 8;
const MAX_MESSAGE = 300;
/** a quoted run this long is data the error was handed, not language it wrote */
const MAX_QUOTED = 60;

const GONE = '‹redacted›';

/** a run long enough to be a secret, with the digits that tell it from a symbol name */
const OPAQUE = /[A-Za-z0-9_+/=-]{16,}/g;

export function redact(text: string): string {
  let out = String(text ?? '');
  // the token this app carries travels in a query string, and the path is the
  // half worth keeping
  out = out.replace(/\?[^\s"')\]]+/g, '?' + GONE);
  out = out.replace(/\bBearer\s+\S+/gi, 'Bearer ' + GONE);
  out = out.replace(/"[^"]{60,}"/g, '"' + GONE + '"');
  out = out.replace(/'[^']{60,}'/g, "'" + GONE + "'");
  // `createNativeStackNavigator` is long and must survive; `0a1b2c3d4e5f6a7b8c9d`
  // is long and must not. Digits are what separates a symbol from a secret
  out = out.replace(OPAQUE, (run) => ((run.match(/\d/g) ?? []).length >= 2 ? GONE : run));
  return out.length > MAX_MESSAGE ? out.slice(0, MAX_MESSAGE) + '…' : out;
}

function framesOf(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  return stack
    .split('\n')
    // the header line only repeats the message, and the message is its own field
    .filter((line) => /^\s*at\s/.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => redact(line.trim()));
}

export function makeCrash(input: {
  error: unknown;
  kind: CrashKind;
  fatal: boolean;
  at: number;
  build: CrashBuild;
  screen?: string;
  /** React hands the component stack separately; it is not on the error */
  componentStack?: string;
}): CrashRecord {
  const { error } = input;
  const isError = error instanceof Error;
  const frames = isError ? framesOf(error.stack) : [];
  const component = input.componentStack
    ? input.componentStack
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_FRAMES)
        .map((line) => redact(line))
    : [];
  return {
    at: input.at,
    kind: input.kind,
    fatal: input.fatal,
    name: (isError && error.name) || 'Error',
    message: redact(isError ? error.message || String(error) : String(error)),
    frames: frames.length ? frames : component,
    ...(input.screen ? { screen: input.screen } : {}),
    build: input.build,
  };
}

function isRecord(value: unknown): value is CrashRecord {
  if (value === null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.at === 'number' &&
    typeof o.message === 'string' &&
    typeof o.name === 'string' &&
    Array.isArray(o.frames) &&
    typeof o.build === 'object' &&
    o.build !== null
  );
}

export async function loadCrashes(): Promise<CrashRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // one malformed entry must not take the readable ones with it, and a half
    // record on screen is worse than one fewer
    return parsed.filter(isRecord).slice(0, MAX_CRASHES);
  } catch {
    return [];
  }
}

export async function recordCrash(record: CrashRecord): Promise<void> {
  try {
    const kept = [record, ...(await loadCrashes())].slice(0, MAX_CRASHES);
    await AsyncStorage.setItem(CRASH_KEY, JSON.stringify(kept));
  } catch {
    // already mid-crash: a failed write is a lost report, and a throw here is a
    // second fault on top of the one being reported
  }
}

export async function clearCrashes(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_KEY);
  } catch {
    // nothing to be done about it, and nothing worth dying over
  }
}

export async function markSeen(at: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // a lost marker only re-announces a crash that has been read
  }
}

export async function seenAt(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && at > 0 ? at : 0;
  } catch {
    return 0;
  }
}

/** what the settings row badges: crashes that arrived since the screen was last read */
export function unseenCount(records: CrashRecord[], since: number): number {
  return records.filter((r) => r.at > since).length;
}

/**
 * The whole store as one block of text, for the clipboard.
 *
 * The alternative is reading a stack trace down a phone line, which is how a
 * transcription error becomes a wrong diagnosis. ISO timestamps rather than
 * "2 hours ago": the screen is for a person, this is for whoever is fixing it, and
 * by then the relative time means nothing.
 */
export function crashReport(records: CrashRecord[]): string {
  if (!records.length) return 'J.A.R.V.I.S. — No crashes recorded.';
  const blocks = records.map((r, i) => {
    const when = new Date(r.at).toISOString();
    return [
      `[${i + 1} of ${records.length}] ${when} · ${r.kind}${r.fatal ? ' · fatal' : ''}`,
      `${r.name}: ${r.message}`,
      `v${r.build.version} · ${r.build.updateId} · ${r.build.platform}${r.screen ? ` · ${r.screen}` : ''}`,
      ...r.frames,
    ].join('\n');
  });
  return ['J.A.R.V.I.S. — crash report', ...blocks].join('\n\n');
}

type Handler = (error: unknown, fatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler: () => Handler | undefined;
  setGlobalHandler: (handler: Handler) => void;
};

const MARK = '__jarvisCrashHandler';

/**
 * Catch the errors no boundary sees.
 *
 * `ErrorBoundary` covers render; everything else — a socket callback, a task, a
 * rejected await that nothing caught — reaches React Native's global handler and
 * today ends the process with no record. This wraps that handler rather than
 * replacing it: the record is written, then the previous handler runs unchanged, so
 * the app still dies exactly as it would have. Swallowing the fatal to keep a log
 * would be trading a diagnosable death for a zombie.
 *
 * Idempotent — a second install is a no-op, so a fast refresh cannot stack handlers.
 */
export function installCrashHandler(deps: {
  build: () => CrashBuild;
  errorUtils?: ErrorUtilsLike;
  now?: () => number;
}): void {
  const errorUtils =
    deps.errorUtils ?? (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  const now = deps.now ?? Date.now;

  let previous: Handler | undefined;
  try {
    previous = errorUtils.getGlobalHandler();
  } catch {
    previous = undefined;
  }
  if (previous && (previous as unknown as Record<string, unknown>)[MARK] === true) return;

  const handler: Handler = (error, fatal) => {
    try {
      void recordCrash(
        makeCrash({ error, kind: 'js', fatal: fatal !== false, at: now(), build: deps.build() })
      );
    } catch {
      // the report is optional; the line below is not
    }
    previous?.(error, fatal);
  };
  (handler as unknown as Record<string, unknown>)[MARK] = true;
  errorUtils.setGlobalHandler(handler);
}
