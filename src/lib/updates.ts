/**
 * What the app can say about its own version, and what it should offer to do.
 *
 * Pure: no `expo-updates` import, no async, no clock. The screen supplies the
 * state and this decides the words and the button — which is the half worth
 * testing, and the half that has to stay honest.
 *
 * The honesty rule is the same one the briefing and the journal digest follow,
 * and this project has now paid for it four times: **an outcome that looks like
 * progress is worse than a plain no.** "Checking…" that never resolves, or a
 * silent button, reads as broken. Every state below says which state it is.
 */

export type UpdateState = {
  /** false in a development build, or when the config is incomplete */
  enabled: boolean;
  checking: boolean;
  downloading: boolean;
  /** a newer update exists on the server */
  available: boolean;
  /** one has been downloaded and is waiting for a restart */
  pending: boolean;
  /** whether a check has completed at least once since launch */
  checked: boolean;
  problem: string | null;
};

export type UpdateAction = 'none' | 'check' | 'download' | 'restart';

export type UpdateReading = {
  headline: string;
  detail: string;
  /** what the single button should do, and 'none' hides it */
  action: UpdateAction;
  actionLabel: string;
};

export function describeUpdate(s: UpdateState): UpdateReading {
  if (!s.enabled) {
    return {
      headline: 'Updates are off in this build',
      detail:
        'A development build runs the code on your machine, so there is nothing to fetch. Release builds check on their own.',
      action: 'none',
      actionLabel: '',
    };
  }

  if (s.problem) {
    // named, not swallowed. "Could not check" with no reason is the shape of
    // failure this app keeps being accused of
    return {
      headline: 'Could not check',
      detail: s.problem,
      action: 'check',
      actionLabel: 'TRY AGAIN',
    };
  }

  if (s.downloading) {
    return { headline: 'Downloading…', detail: 'Fetching the new version.', action: 'none', actionLabel: '' };
  }

  if (s.checking) {
    return { headline: 'Checking…', detail: 'Asking whether anything newer exists.', action: 'none', actionLabel: '' };
  }

  /**
   * Downloaded and waiting beats available-but-not-fetched, deliberately.
   *
   * `checkAutomatically` means one can arrive on its own, and the reported
   * complaint was exactly this: an update downloaded in the background with
   * nothing on screen to say so, and no way to apply it. Restarting is the only
   * thing left to do, so it is the only thing offered.
   */
  if (s.pending) {
    return {
      headline: 'Update ready',
      detail: 'Downloaded and waiting. Restarting applies it.',
      action: 'restart',
      actionLabel: 'RESTART NOW',
    };
  }

  if (s.available) {
    return {
      headline: 'Update available',
      detail: 'A newer version is on the server.',
      action: 'download',
      actionLabel: 'DOWNLOAD',
    };
  }

  if (s.checked) {
    return {
      headline: 'Up to date',
      detail: 'Nothing newer to install, sir.',
      action: 'check',
      actionLabel: 'CHECK AGAIN',
    };
  }

  return {
    headline: 'Not checked yet',
    detail: 'This build checks on its own at launch. Ask now if you would rather not wait.',
    action: 'check',
    actionLabel: 'CHECK FOR UPDATES',
  };
}

/**
 * A runtime version or update id, shortened for a settings row.
 *
 * These are 40-character hashes and a UUID. Shown whole they are noise; shown as
 * the first eight they are enough to tell two builds apart, which is the only
 * question anyone asks of them.
 */
export function shortId(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length <= 12 ? value : `${value.slice(0, 8)}…`;
}

/**
 * One line that answers "which one am I running".
 *
 * The update id is a UUID and the runtime version a 40-character hash: precise,
 * and useless at a glance. **When the running bundle was published** is the
 * field that actually answers the question, because it is the thing that changes
 * the moment a push lands.
 *
 * `Built in` for the bundle that shipped inside the APK — it has no publish date
 * of its own, and dating it by the install would be inventing one.
 */
export function versionLine(appVersion: string | null | undefined, publishedAt: Date | null | undefined): string {
  const v = appVersion ? `v${appVersion}` : 'v?';
  if (!publishedAt) return `${v} · built in`;
  const d = publishedAt;
  const p = (n: number) => String(n).padStart(2, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${v} · updated ${d.getDate()} ${MONTHS[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
