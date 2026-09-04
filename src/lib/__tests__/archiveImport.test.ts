import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../../modules/timeline-import', () => ({
  parse: jest.fn(),
  parseError: jest.fn(() => null),
  available: () => true,
}));

import { parse, parseError } from '../../../modules/timeline-import';
import { importVisits, importedHeld, previewFile } from '../archiveImport';
import { openSeenStore } from '../seenStore';
import { loadSeen, useSeenStore } from '../timeline';
import type { Visit } from '../archive';

/**
 * The import, end to end, with the parser mocked.
 *
 * The native half only exists in an installed APK, so this is the one place a mock is
 * the right answer rather than a way of avoiding the truth. What is being tested here
 * is the order things happen in — above all that **a preview writes nothing**.
 */

const OFFICE = { id: 'office', label: 'Office', lat: 22.57705, lon: 88.43435, area: '' };
const at = (iso: string) => new Date(iso).getTime();

const visit = (date: string, from = '09:49', to = '19:05'): Visit => ({
  lat: OFFICE.lat,
  lon: OFFICE.lon,
  start: at(`${date}T${from}:00+05:30`),
  end: at(`${date}T${to}:00+05:30`),
});

const said = (segments: number, visits: Visit[]) =>
  (parse as jest.Mock).mockResolvedValue({ segments, visits });

beforeEach(async () => {
  jest.clearAllMocks();
  (parseError as jest.Mock).mockReturnValue(null);
  await AsyncStorage.clear();
  await AsyncStorage.setItem('jarvis_known_places', JSON.stringify([OFFICE]));
  useSeenStore(await openSeenStore(':memory:'));
});

afterEach(() => useSeenStore(null));

it('says what a file would add and writes none of it', async () => {
  // a preview that writes is not a preview. Nothing is his until he says so
  said(11570, [visit('2026-03-02'), visit('2026-03-03')]);
  const p = await previewFile('content://x');
  expect(p.segments).toBe(11570);
  expect(p.places).toEqual([{ place: 'Office', visits: 2, days: 2, hour: 9 * 60 + 49 }]);
  expect(await loadSeen()).toEqual([]);
});

it('tells a file that held nothing from a parser that gave up', async () => {
  // 11,570 segments and no visits is Google changing the format; 0 segments is a file
  // this code could not read. They looked identical for as long as it took to ship one
  said(0, []);
  (parseError as jest.Mock).mockReturnValue('Expected BEGIN_OBJECT but was STRING');
  const p = await previewFile('content://x');
  expect(p.segments).toBe(0);
  expect(p.error).toBe('Expected BEGIN_OBJECT but was STRING');
});

it('writes an arrival and a departure for every matched visit', async () => {
  expect(await importVisits([visit('2026-03-02'), visit('2026-03-03')])).toBe(4);
  expect((await loadSeen()).map((r) => r.via)).toEqual([
    'import-enter',
    'import-exit',
    'import-enter',
    'import-exit',
  ]);
});

it('costs nothing the second time the same file is imported', async () => {
  const visits = [visit('2026-03-02')];
  expect(await importVisits(visits)).toBe(2);
  expect(await importVisits(visits)).toBe(0);
  expect(await loadSeen()).toHaveLength(2);
});

it('says how much is imported and over what range', async () => {
  expect(await importedHeld()).toEqual({ rows: 0, from: null, to: null });
  await importVisits([visit('2026-03-02'), visit('2026-03-04')]);
  const held = await importedHeld();
  expect(held.rows).toBe(4);
  expect(held.from).toBe(at('2026-03-02T09:49:00+05:30'));
  expect(held.to).toBe(at('2026-03-04T19:05:00+05:30'));
});
