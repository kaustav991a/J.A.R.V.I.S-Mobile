import { dayKey, fakeSource } from '../source';

describe('the fake source, which every test above this one uses', () => {
  it('reports the grant it was given', async () => {
    expect(await fakeSource({ grant: 'denied' }).permission()).toBe('denied');
  });

  it('is granted and empty by default, which are different things', async () => {
    const s = fakeSource();
    expect(await s.permission()).toBe('granted');
    expect(await s.queryDaily(0, Date.now())).toEqual([]);
  });

  it('serves only the rows inside the window it was asked for', async () => {
    // a sync asks from its watermark onwards, and a fake that ignored the window
    // would make every watermark test above pass for the wrong reason
    const s = fakeSource({
      events: [
        { at: 100, kind: 'unlock', app: null },
        { at: 900, kind: 'unlock', app: null },
      ],
    });
    expect(await s.queryEvents(500, 1000)).toHaveLength(1);
  });

  it('throws when told to, so the error path is reachable from a test', async () => {
    await expect(fakeSource({ throws: 'no native module' }).queryDaily(0, 1)).rejects.toThrow(
      'no native module'
    );
  });
});

describe('which day a moment belongs to', () => {
  it('answers in local time, not UTC', () => {
    // UTC would put a Kolkata evening on the following day for four and a half
    // hours out of every twenty-four, and every "what did I do yesterday" after
    // that is answered off by one
    const evening = new Date(2026, 7, 19, 23, 30).getTime();
    expect(dayKey(evening)).toBe('2026-08-19');
  });

  it('pads the month and the day', () => {
    expect(dayKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05');
  });
});
