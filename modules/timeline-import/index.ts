import { requireNativeModule } from 'expo';

import type { Visit } from '../../src/lib/archive';

/**
 * The streaming parser, resolved on first use and never at import.
 *
 * The JavaScript travels over the air and the native half only arrives with an APK, so
 * between publishing and installing there is an app whose bundle names a module it does
 * not have. At import scope that throws while the screen is loading and takes the whole
 * app down over one feature. It is looked up on first use instead, and a failure is an
 * answer rather than an exception.
 */
type Native = {
  parse: (uri: string) => Promise<{ segments: number; visits: Visit[] }>;
};

let native: Native | null = null;
let looked = false;
let lastError: string | null = null;

const module_ = (): Native | null => {
  if (!looked) {
    looked = true;
    try {
      native = requireNativeModule<Native>('TimelineImport');
    } catch {
      native = null;
    }
  }
  return native;
};

/** whether this build carries the native half at all */
export function available(): boolean {
  return module_() !== null;
}

/**
 * Why the last read came back empty, when it did.
 *
 * A caught exception that returns an empty list is a silent wrong answer, which is the
 * shape of nearly every bug this project has shipped. The call log read
 * *Readable · 0 calls · 0 people* on a phone holding 22,165 rows for exactly this
 * reason, so the reason is kept rather than swallowed.
 */
export function parseError(): string | null {
  return lastError;
}

/**
 * Read an export.
 *
 * `segments` comes back beside the visits because **an empty list and a parser that
 * threw look identical otherwise** — 11,570 segments with no visits is Google changing
 * the format, and 0 segments is a file that could not be read at all.
 */
export async function parse(uri: string): Promise<{ segments: number; visits: Visit[] }> {
  const m = module_();
  if (!m) {
    lastError = 'The native parser is not in this build.';
    return { segments: 0, visits: [] };
  }
  try {
    lastError = null;
    return await m.parse(uri);
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return { segments: 0, visits: [] };
  }
}
