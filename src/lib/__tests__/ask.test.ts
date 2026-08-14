import { buildAsk, localClock } from '../ask';
import type { AskWhere } from '../ask';

/**
 * The clock and the envelope that carries it.
 *
 * These exist because J.A.R.V.I.S. was answering "today" and "the office" from the
 * model's weights: the question went to the gateway as bare text whenever location
 * sharing was off, so nothing in the message said when or where it was asked.
 */

/**
 * A Friday evening, 20:04:13, reading the same on any machine jest runs on.
 *
 * Built from local components rather than a `Z` string so the local getters are
 * machine-independent, with only the offset faked — the two have to be set
 * together or the Date describes a time that does not exist.
 */
const evening = (offsetMinutes: number): Date => {
  const d = new Date(2026, 7, 14, 20, 4, 13);
  jest.spyOn(d, 'getTimezoneOffset').mockReturnValue(-offsetMinutes);
  return d;
};

describe('localClock', () => {
  it('reports local wall time with its offset, not UTC', () => {
    // 20:04 in Kolkata is 14:34Z — sending the Z reading would leave the model to
    // work out that it is evening, which is the step it gets wrong
    const clock = localClock(evening(330));
    expect(clock.iso).toBe('2026-08-14T20:04:13+05:30');
    expect(clock.offset).toBe(330);
  });

  it('names the weekday, so "is the office open tomorrow" has a Friday to count from', () => {
    expect(localClock(evening(330)).weekday).toBe('Friday');
  });

  it('writes a half-hour offset as :30 rather than :50', () => {
    // 330 minutes is 5.5 hours; formatting it as a decimal would produce +05:50
    expect(localClock(evening(330)).iso.slice(-6)).toBe('+05:30');
  });

  it('writes a negative offset with a minus and no negative digits', () => {
    expect(localClock(evening(-270)).iso.slice(-6)).toBe('-04:30');
  });

  it('writes UTC as +00:00', () => {
    expect(localClock(evening(0)).iso).toBe('2026-08-14T20:04:13+00:00');
  });
});

describe('buildAsk', () => {
  const known = [{ label: 'Office', lat: 22.57, lon: 88.43 }];
  const where: AskWhere = {
    lat: 22.5,
    lon: 88.3,
    place: 'Salt Lake, West Bengal',
    label: 'Office',
    weather: '31°C, light rain',
    trail: [{ place: 'Home', when: 'this morning' }],
  };

  it('carries the clock and the named places with no location at all', () => {
    // the bug: sharing off used to send bare text, dropping the clock and the
    // places as well as the coordinate — three things withheld to withhold one
    const sent = JSON.parse(buildAsk({ text: 'how far to the office', known, where: null }));
    expect(sent.type).toBe('ask');
    expect(sent.text).toBe('how far to the office');
    expect(sent.known).toEqual(known);
    expect(typeof sent.when.iso).toBe('string');
    expect(sent.where).toBeUndefined();
  });

  it('omits `where` rather than sending an empty one when there is no fix', () => {
    // an empty `where` reads as "asked from nowhere", which is a different claim
    // from "did not say"
    expect('where' in JSON.parse(buildAsk({ text: 'hi', known, where: null }))).toBe(false);
  });

  it('sends the measured conditions and the trail when there is a fix', () => {
    const sent = JSON.parse(buildAsk({ text: 'is it raining here', known, where }));
    expect(sent.where.weather).toBe('31°C, light rain');
    expect(sent.where.place).toBe('Salt Lake, West Bengal');
    expect(sent.where.trail).toEqual([{ place: 'Home', when: 'this morning' }]);
  });

  it('carries the named place, which does not drift the way a geocode does', () => {
    // one desk came back as Bidhannagar, then Kankurgachi, then twice as
    // Presidency Division, each stated as fact
    expect(JSON.parse(buildAsk({ text: 'where am I', known, where })).where.label).toBe('Office');
  });

  it('still mirrors the places inside `where`, for the gateway already deployed', () => {
    // the live gateway reads `where.known`; moving it to the top level without
    // this line stops "how far to the office" resolving until the gateway ships
    const sent = JSON.parse(buildAsk({ text: 'how far to the office', known, where }));
    expect(sent.where.known).toEqual(known);
    expect(sent.known).toEqual(known);
  });

  it('sends an empty list rather than omitting places that have not been named', () => {
    expect(JSON.parse(buildAsk({ text: 'hi', known: [], where: null })).known).toEqual([]);
  });
});
