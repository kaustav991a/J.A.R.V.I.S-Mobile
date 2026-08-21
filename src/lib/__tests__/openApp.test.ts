import { asOpenAppCommand, matchApp } from '../openApp';
import type { InstalledApp } from '../openApp';

/**
 * "Open Swiggy" — the first thing this app can do *to* the phone rather than about
 * it. Asked for 2026-08-21.
 *
 * The recognition is deliberately narrow and the match is deliberately strict,
 * because the failure modes are asymmetric: refusing to open something is a shrug
 * and the model still answers, while opening the wrong app is the assistant taking
 * over your screen for no reason.
 */
const installed: InstalledApp[] = [
  { label: 'Swiggy', pkg: 'in.swiggy.android' },
  { label: 'WhatsApp', pkg: 'com.whatsapp' },
  { label: 'Google Maps', pkg: 'com.google.android.apps.maps' },
  { label: 'Settings', pkg: 'com.android.settings' },
  { label: 'Gmail', pkg: 'com.google.android.gm' },
];

describe('recognising the instruction', () => {
  it('takes the plain forms', () => {
    for (const [said, want] of [
      ['open swiggy', 'swiggy'],
      ['Open Swiggy', 'Swiggy'],
      ['launch whatsapp', 'whatsapp'],
      ['start google maps', 'google maps'],
      ['open the gmail app', 'gmail'],
      ['open swiggy please', 'swiggy'],
    ] as const) {
      expect(asOpenAppCommand(said)).toBe(want);
    }
  });

  it('leaves a question about an app alone', () => {
    // asking about a thing is not asking for it to be opened
    for (const said of ['what is swiggy', 'is whatsapp installed', 'how do I open swiggy']) {
      expect(asOpenAppCommand(said)).toBeNull();
    }
  });

  it('leaves anything that is not about opening alone', () => {
    for (const said of ['lock the desk', 'is it raining here', 'open the door']) {
      // "open the door" reaches here as a name, and is refused by the MATCH instead —
      // nothing installed is called "door", so the model answers it
      expect(matchApp(asOpenAppCommand(said) ?? '', installed)).toBeNull();
    }
  });
});

describe('matching a name to something installed', () => {
  it('takes an exact name, whatever the case', () => {
    expect(matchApp('swiggy', installed)?.pkg).toBe('in.swiggy.android');
    expect(matchApp('SWIGGY', installed)?.pkg).toBe('in.swiggy.android');
  });

  it('takes the start of a longer name', () => {
    expect(matchApp('google', installed)?.pkg).toBe('com.google.android.apps.maps');
  });

  it('takes a word from inside a name', () => {
    expect(matchApp('maps', installed)?.pkg).toBe('com.google.android.apps.maps');
  });

  it('refuses a name that fits two apps equally', () => {
    // opening the wrong app is worse than opening none: nothing here can know
    // whether "google" meant Maps or Gmail, so it declines and lets him ask
    const two: InstalledApp[] = [
      { label: 'Google Maps', pkg: 'com.google.android.apps.maps' },
      { label: 'Google Photos', pkg: 'com.google.android.apps.photos' },
    ];
    expect(matchApp('google', two)).toBeNull();
  });

  it('refuses a name that fits nothing', () => {
    expect(matchApp('door', installed)).toBeNull();
    expect(matchApp('', installed)).toBeNull();
  });

  it('prefers the exact name over a longer one containing it', () => {
    const both: InstalledApp[] = [
      { label: 'Maps', pkg: 'com.maps' },
      { label: 'Google Maps', pkg: 'com.google.android.apps.maps' },
    ];
    expect(matchApp('maps', both)?.pkg).toBe('com.maps');
  });
});
