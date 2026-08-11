import { greetingFor, msToNextMinute } from '../greeting';

const at = (h: number, m = 0, s = 0) => new Date(2026, 7, 10, h, m, s);

describe('greetingFor', () => {
  it('greets the morning from 05:00 to 11:59', () => {
    expect(greetingFor(at(5))).toBe('Good morning,');
    expect(greetingFor(at(11, 59))).toBe('Good morning,');
  });

  it('greets the afternoon from 12:00 to 16:59', () => {
    expect(greetingFor(at(12))).toBe('Good afternoon,');
    expect(greetingFor(at(16, 59))).toBe('Good afternoon,');
  });

  it('greets the evening from 17:00 to 20:59', () => {
    expect(greetingFor(at(17))).toBe('Good evening,');
    expect(greetingFor(at(20, 59))).toBe('Good evening,');
  });

  it('greets the night across midnight', () => {
    expect(greetingFor(at(21))).toBe('Good night,');
    expect(greetingFor(at(0))).toBe('Good night,');
    expect(greetingFor(at(4, 59))).toBe('Good night,');
  });
});

describe('msToNextMinute', () => {
  it('counts down to the top of the next minute', () => {
    expect(msToNextMinute(at(9, 30, 20))).toBe(40_000);
    expect(msToNextMinute(at(9, 30, 0))).toBe(60_000);
  });
});
