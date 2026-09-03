# Archive import — design

**2026-09-03.** Follows the spike in `2026-09-03-archive-import-spike.md`, which
answered *build it*: the on-device export holds **4,000 visits with places across 529
distinct days**, 8 Mar 2025 to today, in a 47.2 MB `Timeline.json`.

## What it is for

Every habit figure this app quotes rests on weeks. `usuallyHereBy` has four app-opens
behind it and says *"usually you are there by 11:51 AM"* about a man at his desk by
ten; the export says **09:49 across 344 days**. One import makes the figures true on
the day it lands rather than in a fortnight.

The strongest argument for trusting it is agreement, not volume: the export's Sealdah
arrival matches the geofence crossing recorded on 09-03 **to the minute**, from two
sources that have never met.

## The three problems, and the decisions

### 1. The file is 47 MB and the phone must not parse it

`JSON.parse` on 47 MB takes a laptop a few seconds and would take the phone down.

**Decided: stream it in Kotlin.** `android.util.JsonReader` is a pull parser built for
exactly this, runs in constant memory, and means **the 47 MB never crosses into
JavaScript at all**. The module returns only what a visit is worth keeping: four
numbers each, about 4,000 of them.

Rejected: a hand-rolled scanner in JS over chunked reads. It is possible without a
build, and it is a brace-matching parser written under time pressure against a format
Google changes — which is how you get a silent wrong answer, the failure this project
has shipped five times already.

The module is `modules/timeline-import`, sibling to `call-log`, and it needs a build.
No new permission: the file arrives as a `content://` URI the user picked, so
`READ_EXTERNAL_STORAGE` is not required.

### 2. The sighting store cannot hold seventeen months

`SEEN_TTL_MS` is **84 days**, `SEEN_KEEP` is **1,200 rows**, and the whole thing is one
JSON blob in AsyncStorage read and rewritten on every write. Importing 4,000 visits —
each of which is an arrival *and* a departure, so about 8,000 rows — into that is not a
tuning problem. It is the wrong container.

**Decided: move sightings to SQLite**, the way the chat archive went, in the same work.

```
sighting(at INTEGER PRIMARY KEY, place TEXT NOT NULL, via TEXT)
```

- `loadSeen()` keeps its signature and returns the recent window, so nothing above it
  changes on day one
- `seenBetween(from, to)` is added for the habit functions that want a year
- the 84-day TTL becomes a query bound rather than a deletion, so history stops being
  quietly destroyed by a constant nobody remembers
- AsyncStorage is read once at migration and then left alone

**This is the largest part of the work and it is not optional.** Without it the import
either truncates to 1,200 rows or dies on the next write.

### 3. Imported history must never pose as measured history

529 days of imported visits silently outvoting four days of geofence crossings is this
project's oldest mistake wearing its newest coat — the same shape as *3:40 PM*, which
was a correct median over data that measured something else.

**Decided: `via: 'import'`**, alongside `enter` and `exit`.

- **Counts towards** `usuallyHereBy`, `arrivalHour`, `leftBy`, `nextSeenElsewhere` —
  Google's visit detection is at least as good as a geofence crossing, and the spike
  showed the two agreeing to the minute
- **Never counts as `measured`** in the sentence a row prints. The WATCHING row says
  *"Measured at Office: the phone crossed the boundary with the app closed"* for a
  crossing, and must say *"from your Timeline export, 344 days"* for an import
- **Removable in one gesture.** `forgetImported()` deletes every row with
  `via = 'import'`, so a bad import is one tap to undo rather than a reinstall

## What it does, end to end

1. **Pick the file.** `expo-document-picker`, one file, `application/json`.
2. **Stream and count.** Kotlin walks `semanticSegments`, keeps `visit` segments with a
   `placeLocation`, and returns `{ lat, lon, start, end }` for each.
3. **Match, in JavaScript, with the code that already exists.** A visit becomes a
   sighting when `distanceKm(visit, place) <= AT_PLACE_KM` — the same rule `nameFor`
   uses, so an import can only ever land in a circle he has already named. Everything
   else is discarded, including the clusters he has never named.
4. **Show him first.** A preview screen: the file, the date range, and a line per named
   place — *"Office · 699 visits · 344 days"*. Nothing has been written at this point.
5. **Import on his word.** Each kept visit writes two rows: `via: 'import'` at
   `startTime` and at `endTime`. Deduped on `(place, at)` within five minutes so a
   second import is free rather than doubling.
6. **Say what happened, and offer the undo.** A row on Places: *"4,000 visits imported
   from your Timeline, 8 Mar 2025 to 3 Sep 2026"*, with FORGET beside it.

## Naming what he has not named — decided 2026-09-03

Asked directly: *if anything unnamed, can we name it by Google Maps places?*

**Every visit carries a `placeId` and a `semanticType`.** 238 distinct places across the
export, and the types are worth more than they look:

| semanticType | visits |
| --- | --- |
| UNKNOWN | 2,906 |
| **INFERRED_HOME** | 743 |
| **INFERRED_WORK** | 344 |
| ALIASED_LOCATION | 6 |
| SEARCHED_ADDRESS | 1 |

So three tiers, and only one of them costs anything.

**1. Home and work are free.** Google has already decided which cluster is which, and
that arrives in the file. No network, no key, no lookup.

**2. `placeId` is a better key than coordinates.** It is stable across visits, so once a
named place is linked to one, matching stops depending on a 120 m radius and starts
being exact. Worth storing on `KnownPlace` as an optional field.

**3. Names for the other 236 would need the Places Details API** — a key, 238 network
lookups, and **sending his place ids to Google**. Rejected. Every feature in this app
has held one line: the file never leaves the phone, the call log never leaves the
phone, the journal never leaves the phone. Buying prettier labels with that line is a
bad trade, and it would be the first time this app sent personal data somewhere to make
a screen look better.

**Decided: he proposes, you name.** After matching, the importer shows the unnamed
clusters ranked by visits, each with its hint and its typical hour, and he types a name
or ignores it:

```
  UNNAMED PLACES HE HAS SEEN
  ○ Looks like your home · 743 visits · 516 days · usually 20:55   [ name ]
  ○ 261 visits · 211 days · usually 19:20                          [ name ]
  ○ 66 visits · 55 days · usually 13:27                            [ name ]
```

This keeps the rule the app already lives by — **a place is named by a person, not
guessed** — while removing the part that was genuinely limiting: until now the only way
to name somewhere was to be standing in it with the app open. Now he can name a place
he has visited two hundred times and never had the app open at.

Naming one re-runs the match, so its history joins the store immediately.

## What it deliberately does not do

- **The file is not kept.** It is read once, matched, and never copied into the app.
  The same rule as the call log: the phone already holds it, and a second copy is a
  second thing to secure.
- **Nothing is uploaded.** Imported sightings are local, exactly like measured ones.
- **No new places are invented.** A cluster with 300 visits that he has never named
  stays unnamed until he names it — see the naming section above. The importer proposes
  and never decides.
- **No activities, no routes.** 4,406 activity segments and 3,163 paths are ignored;
  they describe movement between places rather than being at one, and nothing in the
  app asks that question yet.

## Testing

- `timelineVisits` parsing: the real export's shapes, a truncated file, an unknown
  shape, an empty one — all against fixtures cut from the actual 47 MB file
- matching: inside the radius, outside it, exactly on it, a visit spanning midnight
- `via: 'import'` counts towards habit figures and never reports as `measured`
- dedupe: importing the same file twice adds nothing the second time
- `forgetImported` removes imports and leaves crossings and app-opens untouched
- the SQLite migration: an AsyncStorage store moves across intact, and a second launch
  does not re-migrate

The Kotlin parser is exercised on the device, as `call-log` was: a diagnostic row
saying **how many segments it walked and how many visits it kept**, because *the import
found nothing* and *the parser threw* must never look the same. That row exists before
the feature ships, not after an afternoon of guessing.

## Cost

One native module, one build, one runtime move. The SQLite migration is the bulk of
the work and pays for itself the moment any figure wants more than 84 days.
