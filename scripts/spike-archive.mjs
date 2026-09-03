/**
 * Archive import — the probe, and nothing more.
 *
 * Throwaway by design: it answers "is this worth building" in numbers, on a laptop,
 * against the real export. It writes nothing, uploads nothing, and touches no part of
 * the app. See docs/superpowers/specs/2026-09-03-archive-import-spike.md.
 *
 *   node scripts/spike-archive.mjs <path-to-Timeline.json>
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/spike-archive.mjs <path-to-Timeline.json>');
  process.exit(1);
}

const size = fs.statSync(file).size;
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const segments = raw.semanticSegments ?? [];

/** what kinds of thing are in here, since the shape decides the whole project */
const kinds = new Map();
for (const s of segments) {
  for (const key of Object.keys(s)) {
    if (key === 'startTime' || key === 'endTime') continue;
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }
}

const point = (text) => {
  const m = /(-?[\d.]+)°?,\s*(-?[\d.]+)°?/.exec(text ?? '');
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
};

/** visits carry a place; a route is somebody moving and is not a sighting */
const visits = [];
for (const s of segments) {
  const v = s.visit;
  if (!v) continue;
  const p =
    point(v.topCandidate?.placeLocation?.latLng) ??
    point(v.topCandidate?.placeLocation) ??
    null;
  if (!p) continue;
  visits.push({
    at: new Date(s.startTime).getTime(),
    until: new Date(s.endTime).getTime(),
    lat: p.lat,
    lon: p.lon,
    probability: Number(v.probability ?? 0),
  });
}

const days = new Set(visits.map((v) => new Date(v.at).toDateString()));
const earliest = visits.length ? new Date(Math.min(...visits.map((v) => v.at))) : null;
const latest = visits.length ? new Date(Math.max(...visits.map((v) => v.at))) : null;

/** where he actually goes, clustered to about a hundred metres */
const cluster = new Map();
for (const v of visits) {
  const key = `${v.lat.toFixed(3)},${v.lon.toFixed(3)}`;
  const held = cluster.get(key) ?? { key, visits: 0, lat: v.lat, lon: v.lon, days: new Set() };
  held.visits += 1;
  held.days.add(new Date(v.at).toDateString());
  cluster.set(key, held);
}
const top = [...cluster.values()].sort((a, b) => b.visits - a.visits).slice(0, 12);

const hhmm = (ms) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

console.log(`file            ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`segments        ${segments.length}`);
console.log(`kinds           ${[...kinds].map(([k, n]) => `${k}:${n}`).join('  ')}`);
console.log(`visits w/ place ${visits.length}`);
console.log(`distinct days   ${days.size}`);
console.log(`range           ${earliest?.toDateString()}  →  ${latest?.toDateString()}`);
console.log('');
console.log('most visited, clustered to ~100 m:');
for (const c of top) {
  const sample = visits.filter((v) => `${v.lat.toFixed(3)},${v.lon.toFixed(3)}` === c.key);
  const arrive = sample.map((v) => new Date(v.at).getHours() * 60 + new Date(v.at).getMinutes());
  arrive.sort((a, b) => a - b);
  const mid = arrive[Math.floor(arrive.length / 2)];
  console.log(
    `  ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}  ${String(c.visits).padStart(4)} visits  ` +
      `${String(c.days.size).padStart(3)} days  typical arrival ${String(Math.floor(mid / 60)).padStart(2, '0')}:${String(mid % 60).padStart(2, '0')}`
  );
}
