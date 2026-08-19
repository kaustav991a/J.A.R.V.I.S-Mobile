import { describeUpdate, shortId, versionLine } from '../updates';
import type { UpdateState } from '../updates';

const state = (over: Partial<UpdateState> = {}): UpdateState => ({
  enabled: true,
  checking: false,
  downloading: false,
  available: false,
  pending: false,
  checked: false,
  problem: null,
  ...over,
});

describe('what the app says about its own version', () => {
  it('offers a check before anything has been asked', () => {
    const r = describeUpdate(state());
    expect(r.headline).toBe('Not checked yet');
    expect(r.action).toBe('check');
  });

  it('says plainly when there is nothing to install', () => {
    // the reported ask: "otherwise we show no update to install"
    const r = describeUpdate(state({ checked: true }));
    expect(r.headline).toBe('Up to date');
    expect(r.action).toBe('check');
  });

  it('offers the download when one exists', () => {
    const r = describeUpdate(state({ checked: true, available: true }));
    expect(r.headline).toBe('Update available');
    expect(r.action).toBe('download');
  });

  /**
   * The other half of the report: an update can arrive on its own, and nothing
   * on screen said so or offered to apply it.
   */
  it('says an update is waiting and offers the restart that applies it', () => {
    const r = describeUpdate(state({ checked: true, pending: true }));
    expect(r.headline).toBe('Update ready');
    expect(r.detail).toContain('Restarting');
    expect(r.action).toBe('restart');
  });

  it('prefers the downloaded one over the merely available one', () => {
    // both flags can be true at once; restarting is the only thing left to do
    expect(describeUpdate(state({ available: true, pending: true })).action).toBe('restart');
  });

  it('names a failure rather than saying it could not check', () => {
    const r = describeUpdate(state({ problem: 'Network request failed' }));
    expect(r.detail).toContain('Network request failed');
    expect(r.action).toBe('check');
  });

  it('offers no button while it is busy, so nothing can be double-fired', () => {
    expect(describeUpdate(state({ checking: true })).action).toBe('none');
    expect(describeUpdate(state({ downloading: true })).action).toBe('none');
  });

  it('explains a development build rather than pretending it can update', () => {
    const r = describeUpdate(state({ enabled: false }));
    expect(r.headline).toContain('off in this build');
    expect(r.action).toBe('none');
  });
});

describe('showing a version to a person', () => {
  it('shortens a hash to something comparable at a glance', () => {
    expect(shortId('ff3e7ae81ec0bea03fee3822ee023f2ed83f962d')).toBe('ff3e7ae8…');
  });

  it('leaves something already short alone', () => {
    expect(shortId('1.0.0')).toBe('1.0.0');
  });

  it('says nothing rather than null', () => {
    expect(shortId(null)).toBe('—');
    expect(shortId(undefined)).toBe('—');
  });
});

describe('telling one build from another at a glance', () => {
  it('dates the running bundle, because that is what changes when a push lands', () => {
    // the update id is a UUID and the runtime version a 40-char hash; neither
    // answers "did my push arrive" without cross-referencing something
    const line = versionLine('1.0.0', new Date(2026, 7, 19, 18, 42));
    expect(line).toBe('v1.0.0 · updated 19 Aug 18:42');
  });

  it('pads the clock so two builds sort by eye', () => {
    expect(versionLine('1.0.0', new Date(2026, 7, 5, 9, 7))).toContain('5 Aug 09:07');
  });

  it('calls the shipped bundle built in rather than inventing a date for it', () => {
    expect(versionLine('1.0.0', null)).toBe('v1.0.0 · built in');
  });

  it('says so when even the app version is missing', () => {
    expect(versionLine(null, null)).toBe('v? · built in');
  });
});
