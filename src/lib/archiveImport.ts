import { parse, parseError } from '../../modules/timeline-import';
import { importSummary, matchVisits, unnamedClusters, visitRange, withoutNear } from './archive';
import type { Cluster, Visit } from './archive';
import { loadKnown } from './knownPlaces';
import { isImported, loadSeen, putSeen } from './timeline';

/**
 * The import, end to end, and the only file that touches both the parser and the store.
 *
 * Thin on purpose: every decision it makes lives in `archive.ts`, which is pure and
 * tested exhaustively. What is left here is the order things happen in.
 */

export type Preview = {
  segments: number;
  visits: number;
  range: { from: number; to: number } | null;
  places: ReturnType<typeof importSummary>;
  clusters: Cluster[];
  error: string | null;
};

/**
 * Read a file and say what importing it would do. **Writes nothing.**
 *
 * `segments` is carried even though no sentence needs the number on its own, because
 * 11,570 segments with 0 visits is Google changing the format and 0 segments is a file
 * this code could not read — and *the import found nothing* has to be able to say which.
 */
export async function previewFile(uri: string): Promise<Preview> {
  const [{ segments, visits }, places] = await Promise.all([parse(uri), loadKnown()]);
  return {
    segments,
    visits: visits.length,
    range: visitRange(visits),
    places: importSummary(visits, places),
    clusters: unnamedClusters(visits, places),
    error: parseError(),
  };
}

/**
 * Write the matched visits, skipping anything the store already describes.
 *
 * One transaction, not eight thousand statements — see `putMany`. The rows the store
 * already holds are read once and compared here rather than per row, because the
 * comparison is against a window in memory and the alternative is a query per visit.
 */
export async function importVisits(visits: Visit[]): Promise<number> {
  const [places, held] = await Promise.all([loadKnown(), loadSeen()]);
  return await putSeen(withoutNear(matchVisits(visits, places), held));
}

/**
 * What is imported right now, for the row that says so and the FORGET beside it.
 *
 * This exists before the import screen does, for the same reason `storeHeld` did: a
 * feature that can produce nothing needs something that says which nothing it is.
 */
export async function importedHeld(): Promise<{
  rows: number;
  from: number | null;
  to: number | null;
}> {
  const rows = (await loadSeen()).filter(isImported);
  if (!rows.length) return { rows: 0, from: null, to: null };
  return { rows: rows.length, from: rows[0].at, to: rows[rows.length - 1].at };
}
