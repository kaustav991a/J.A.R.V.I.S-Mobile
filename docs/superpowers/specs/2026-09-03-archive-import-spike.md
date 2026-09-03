# Archive import — spike plan

**2026-09-03. A spike, not a spec: the output is an answer, and any code written is
throwaway.**

## Why this exists

Every figure this app holds is young. The journal starts the day it was installed, the
sightings start twelve weeks ago, and the geofence crossings started on Monday. So
*"usually you leave at seven"* rests on two days, and will rest on four by Friday.

An archive is the only route to a memory older than the app itself. One file could turn
a fortnight of habit into a year of it — **or it could turn out to be unavailable,
unparseable, or worthless.** That is what this spike is for.

`archive-import` was split out of `call-log` on 09-03 because it had been sitting
behind a native build it does not need: no permission, no module, no APK.

## The four questions, in the order that can kill the work

**1. Does the export still exist, and in what shape?**

Google moved Timeline on-device during 2024–25. Takeout may now return **nothing** for
Location History, in which case the only source is the phone's own
*Settings → Location → Timeline → Export Timeline data*, which writes a JSON file to
local storage.

If neither produces a file with timestamped places, the row closes as *cannot be built*
and nothing else here matters.

**2. What is actually in it?**

Historically three shapes, and Google has shipped all of them:

- `Records.json` — raw location points, hundreds of thousands of them, no place names
- `Semantic Location History/YYYY/YYYY_MONTH.json` — visits with place names and
  timestamps, which is the useful one
- the on-device export — a newer shape, arrays of `visit` and `activity` segments

The answer decides whether this is *matching* work or *inferring* work. Visits with
timestamps are a small job. Raw points mean clustering, which is a different project.

**3. Is it worth it — how much would he actually gain?**

Count, from the real file: how many visits fall within `AT_PLACE_KM` of a place he has
named, how many distinct days those cover, and what the earliest one is.

**The number that decides the work:** distinct days that would join the sighting store.
Under thirty, this is not worth building — four days of real crossings arrive by Friday
for nothing.

**4. Can a phone read it at all?**

Years of history run to hundreds of megabytes. React Native cannot `JSON.parse` that
without dying, so an import would have to stream or be pre-filtered. Worth knowing the
file size before designing anything.

## The probe

**On the laptop, not in the app.** A Node script over the real export, answering
question 3 in numbers. No app code, no UI, nothing shipped.

```
node scripts/spike-archive.mjs <path-to-export>
  → file shape recognised: semantic | records | on-device | unknown
  → visits found, and how many name a place
  → visits within 120 m of a named place, by place
  → distinct days added, and the earliest date
  → file size, and the largest single JSON file inside
```

Named places come from the phone (`adb`-pulled or typed in by hand for the probe) —
the script never uploads anything and never writes to the app's store.

**Time box: one evening.** If the shape is not recognised in that time, the answer is
*not now* and the spike has still done its job.

## What each outcome means

| Finding | Decision |
| --- | --- |
| Visits with timestamps, 30+ days matching named places | **Build it.** Spec next, then a streaming importer with a review step |
| Visits, but under 30 days matched | **Drop it.** Real crossings arrive faster than this pays back |
| Raw points only | **Park it.** Clustering is its own project and wants its own decision |
| No export available at all | **Close the row** as cannot be built, and say why |

## Rules the build would inherit, decided now rather than later

- **The file never leaves the phone**, exactly like the call log. What enters the store
  is derived visits, and the archive itself is not kept.
- **Imported sightings must be distinguishable from measured ones.** `via` already
  separates a geofence crossing from an app-open; an import needs its own marker so a
  figure can always say where it came from. A year of imported history quietly
  outvoting four days of measured crossings would be this project's oldest mistake in a
  new coat.
- **Nothing is imported without being shown first.** Same shape as the memory
  candidates and the tidy pass: he sees what would be added, and says yes.

## Meta DYI

Out of scope for this spike. It carries messages and calls rather than places, so it
answers a different question and should get its own probe once the location one is
settled.

## The answer, 2026-09-03

**BUILD IT.** The probe ran against the real export and every question came back well
past its floor.

The export exists and is the **on-device shape**: `semanticSegments`, each one a
`visit`, an `activity` or a `timelinePath`. Taken from
*Settings → Location → Location Services → Timeline → Export Timeline data*, which
wrote `Timeline.json` to Downloads — **47.2 MB**.

| | |
| --- | --- |
| segments | 11,570 — 4,000 visits, 4,406 activities, 3,163 paths |
| visits carrying a place | **4,000** |
| distinct days | **529** |
| range | 8 Mar 2025 → 3 Sep 2026 |

The floor was thirty days. It cleared it by a factor of seventeen.

### It is his life, and it corroborates what the app measured this week

Clustered to about a hundred metres, the top of the list is unmistakable:

| Cluster | Visits | Days | Typical arrival |
| --- | --- | --- | --- |
| 22.81515, 88.37191 — Home | 751 | 516 | 20:55 |
| 22.57705, 88.43435 — Office | 699 | 344 | **09:49** |
| 22.56779, 88.37102 — Sealdah | 381 | 259 | 09:23 |
| 22.76020, 88.37090 — Barrackpore | 321 | 301 | 08:19 |

**Office arrival at 09:49 across 344 days**, against the app's current *"usually you
are there by 11:51 AM"* — a median of four app-opens by a man at his desk since ten.
And Sealdah at 09:23 matches the geofence crossing recorded on 09-03 to the minute,
which is the strongest evidence available that the two sources agree.

### What the spec has to solve

1. **47 MB cannot be `JSON.parse`d on a phone.** It parses on a laptop in seconds and
   would take the app down. The importer streams, or filters before parsing, or does
   the work in Kotlin — that is the first design decision and the only hard one.
2. **Matching.** A visit is coordinates; a sighting is a named place. The join is
   `distanceKm <= AT_PLACE_KM`, the same rule `nameFor` already uses, so an imported
   visit is only kept when it lands inside a circle he has named.
3. **Marking.** `via` separates a crossing from an app-open. Imports need their own
   value, because 529 days of imported history silently outvoting four days of
   measured crossings is this project's oldest mistake in its newest coat.
4. **Consent.** He sees the count, the range and the places before anything is written,
   and says yes. Same shape as the memory candidates.

### What it would be worth

Every habit figure the app quotes today rests on two to twelve weeks. This is
**seventeen months**, and it makes `usuallyHereBy`, `leftBy`, `nextSeenElsewhere` and
`anticipate-habit` true on the day it lands rather than in a fortnight.
