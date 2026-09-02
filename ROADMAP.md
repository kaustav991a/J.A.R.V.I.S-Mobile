# jarvis-mobile — the arc, the queue, and the superpowers

Rewritten 2026-08-21. **This file merges the old `ROADMAP.md` (the long arc) and
`NEXT.md` (the queue), which had begun to disagree.** Neither is kept: two files
answering "is this built?" differently is how the two most expensive bugs in this
project survived — a stale claim recorded as settled (`RESUME.md`, 08-17) and a
queue that had stopped matching the code (`NEXT.md`, 08-20).

### Single source of truth — the division of labour

Five files, and each answers exactly one question. **Nothing else in this repo may
carry a plan, a queue, or a status claim.** If you find one, it is stale by
definition — fold it in here and delete it, which is what happened to `NEXT.md`.
The fifth is the newest and the one most likely to be misread: it is **generated**,
so it is a view of the ledger rather than a second copy of it. Editing it by hand is
the `NEXT.md` mistake again, and `--check` will say so.

| File | The one question it answers | Shape |
| --- | --- | --- |
| **`ROADMAP.md`** (this) | **What is built, what is not, and what to do next** | rewritten in place; always current |
| `RESUME.md` | **How something was proved, and what it cost to find out** | append-only record; never a plan |
| `AGENTS.md` | **How to work in this codebase** | rules and traps; never a status |
| `TESTING.md` | **What a human taps, and what should happen** | per-feature checks; never a status |
| `docs/brain-dependencies.md` | **What is owed by `jarvis-brain`, and why it is parked** | **generated** from the ledger; never edited, never a status |

So: a status claim anywhere outside §0b is a bug. A queue anywhere outside §10 is a
bug. `RESUME.md` keeps the archaeology — the measurements, the wrong hypotheses and
the sessions they cost — because deleting that is how a project relearns the same
lesson; but it stops being consulted for *what is true now*.

Read `AGENTS.md` first if you have not. Its rules are not repeated here; the ones
that bear on unbuilt work are cross-referenced where they bite.

---

## 0. Where the app actually stands — 2026-08-21

21 screens, **883 tests**, `tsc --noEmit` clean. (`AGENTS.md` said 461 and the old
roadmap said 426. Both were stale. This number will be too — run `npm test`.)

Live gateway, read this morning:

```json
"desk_linked": false, "apps_linked": 1, "push_targets": 1,
"commute": {"tz": "Asia/Calcutta", "departures": 2, "days_on": 5},
"memory": {"configured": true, "ready": true, "facts_known": 14},
"fact_outbox": {"has_desk_key": false, "dropped_no_key": 18}
```

### Landed 2026-08-21

| | State |
| --- | --- |
| Departure briefings reach the Activity panel at all | done — they were filtered out by `kind !== 'reply'` |
| Timeline built once, shared by panel and bell | done — `state/activity.ts` |
| Full message on tap, in-tree overlay | done |
| Read/unread per entry, surviving restart | done — `state/readStore.ts` |
| Days segregated as the chat does | done — `lib/day.ts`, shared |
| Paged list with a counted SEE MORE | done — replaces a silent `slice(0, 40)` |
| Header counts Jarvis-with-text only | done — `countable()` |
| Local briefing task gated behind `cloudArmed` | **built and covered, not yet seen on a phone** — §2.1 |
| A test harness that runs the commute task body | done — 10 cases; it had never been run by any test |
| He can say what he can do, asked or browsed | done — `lib/capabilities.ts`, chat intercept, Capabilities screen |
| `TESTING.md` — what to tap and what should happen | done — 8 sections, every check with a failure column |
| The Home status panel — what is connected, what is not | done — `lib/status.ts`, `components/StatusPanel.tsx`, 29 tests |
| OTA channel confirmed live | done — channel `production`, branch pointed at it, last publish 23h ago |
| Motion defaulted from the OS, overridable | done — `theme/appearance.tsx`, 4 tests |
| The dead theme picker removed | done — Dark and System behaved identically |
| Contrast audit, kept as a test | done — `theme/__tests__/contrast.test.ts`, alpha composited |
| Both new panels read as one stop each | done — screen-reader labels, 3 tests |
| The provider stamp test that was owed | done — `state/__tests__/commuteStamp.test.tsx` |
| Appearance persisted across launches | **not done, and the ledger claimed otherwise** — see the correction below |
| The act fault in `jarvisProvider.test.tsx` | **partly** — five violations to four, teardowns flush; a late render still blanks |
| `ROADMAP.md` + `NEXT.md` merged to one source of truth | done — `NEXT.md` deleted |
| The nudge's weekday substring bug | **not fixed** — `cloud_gateway.py`, and `jarvis-brain` is closed to me. §2.2 |
| Anything from today shipped to the phone | done — APK built, installed 16:42, and three OTA publishes since |
| Opening an app on the phone by name | done and **proved** — `open swiggy` brought Swiggy to the front 16:56 |
| Message states in the chat: `SENDING` / `NOT SENT` + `SEND AGAIN` / `NO ANSWER` | done, unseen |
| Anticipation v1 — he notices when you open the app | done — one trigger, screen time against your own baseline |
| The leaving-time countdown | **withdrawn the same day** — it recited a setting you typed, and the situation line already printed it |
| Long-press your own message: copy, remove | **proved** on the device 18:14 — two messages removed. His cannot be removed |
| Photos settle instead of saying `SENDING` forever | done — the states were wired into `sendCommand` only |
| The chat log is flushed when the app leaves the foreground | done — two turns were lost to a force-stop on a 400ms debounce |
| The briefing fires BEFORE the time, never after | phone done; **gateway owed** — addendum in the mailbox spec |
| Full anticipation | spec written — `docs/superpowers/specs/2026-08-21-anticipation-design.md` |
| Anticipation trigger 3: pickups against your usual | done — `rollup` had computed `avgPickups` all along and `usageForAsk` was dropping it. A fidgety day is invisible in a total of minutes |
| Anticipation triggers 4-6 | queued: an app you usually open and have not; NOT being somewhere you usually are; and something having broken (usage access revoked, schedule lost) |
| A WATCHING panel on Home | **proved** on the device 18:27 — and it showed `Today: SPOKEN`, so anticipation had already spoken |
| The remark the timeline unlocks | done — *"Still at Office, sir. You are usually gone by 6:40 PM."* Ranked above the screen-time remark, being about right now |
| **A local release build silently breaks OTA** | found and worked around — `expo_runtime_version` stayed `file:fingerprint`; see `AGENTS.md` |
| Microphone verified | **not done** — needs hands on the phone, not adb |

### Confirmed by adb, 2026-08-21 12:5x

Read off the phone rather than reasoned about. All four are on the **installed
build, 1.0.0, last updated 2026-08-19 17:47** — see the caveat below.

| Fact | Evidence |
| --- | --- |
| Both channels the gateway is told about exist | `mId='general-v8' mDeleted=false`, `mId='desk-watch-v2' mDeleted=false` |
| The desk alert can interrupt | `desk-watch-v2` at `mImportance=5`; `general-v8` at 3 |
| Old channel versions are cleaned up, not accumulated | `general-v2` … `general-v7` all `mDeleted=true` |
| Usage access is granted and being used | `appops get … GET_USAGE_STATS` → `allow; time=+1m51s ago` |

The first three close the trap that has cost this project the most sessions —
**Android discards a notification sent to a channel that does not exist, silently.**
It is not live right now, and that is now a measurement rather than an assumption.

**The caveat, and it governs everything below.** The installed APK is from 08-19 and
**no `eas update` has been published today**, so none of 2026-08-21's work is on the
phone: not the Activity panel, not the capability answer, not the status panel, not
the briefing gate. Every one of those reads `untested` in §0b for that reason and no
other. One publish changes all of them at once.

### Two bugs the phone found within minutes of publishing — both fixed and shipped

Neither was reachable by any test in this repo, and that is the point worth keeping:
**jest does not lay anything out.** Both were found by taking a screenshot.

1. **The detail box collapsed to one clipped line.** `box` carried
   `maxHeight: '80%'` while its parent `boxWrap` had auto height, so the percentage
   had nothing to resolve against. The box that exists to show a whole message was
   showing less of it than the row it was opened from. Fixed by dropping the wrapper
   so the absolutely-positioned shade — which has a definite height — is the
   measuring parent, plus `flexShrink: 1` on the scroll view so the actions cannot be
   pushed off the bottom.

2. **Your own messages arrived marked unread.** The header count already excluded
   them via `countable`; the dot was driven by the read set alone. Two definitions of
   one word on one screen. Both now read the same rule, and three tests pin it.

**The lesson for the ledger:** `untested` on a UI row means untested, and a green
`npm test` says nothing about layout. Anything visual moves to `proved` only after a
screenshot, not after a publish.

### Waiting on adb — check one by one when it is back

In this order. Everything except the first two is blocked behind one `eas update`,
and the channel is confirmed live so that publish will land.

| # | Check | How |
| --- | --- | --- |
| 1 | The journal names its own denial | Unlock, open Settings → Journal, then `appops set … GET_USAGE_STATS deny` → read the copy → `allow`. Must say *"I cannot see your usage"*, never *"Nothing recorded"* |
| 2 | The briefing arrives twice, tagged | At a departure window, leave both unswiped: `dumpsys notification --noredact`, grep `tag=`. The push carries `FCM-Notification:*`, a local post does not |
| 3 | *(after publishing)* The gate holds | Next window shows exactly one notification |
| 4 | *(after publishing)* Briefings in the Activity panel, at their own arrival time | Open Activity after a briefing |
| 5 | *(after publishing)* The status panel reads correctly with the desk off | Compare its rows against `/health` |
| 6 | *(after publishing)* "What can you do" answers instantly with wifi off | Aeroplane mode, then ask |
| 7 | *(after publishing)* Read/unread survives a force-stop | Read one entry, force-stop, reopen |
| 8 | The microphone | Hold, speak, release, then read `brains.usage.audio`. Needs hands, not adb |

### Proved on hardware, and two of them only today

- **The pushed briefing arrives unprompted.** 8 AM, phone asleep, app closed. This
  was the item the old `NEXT.md` marked *"delivery unproved until tonight"* — it is
  proved. It is also the item that revealed the duplicate in §2.
- **He speaks first.** `_nudge_tick` fired for the first time, unprompted, and was
  read on the lock screen. Marked *"not yet observed"* until 2026-08-21.
- Transport: LAN probe → cloud fallback → WebSocket with reconnect, one reducer
  shared by every tab. Pairing with token rotation (new accepted, old 403).
- Desk-watch alert reaching a closed app; tapping it opening the alert screen.
- Chat surviving a force-stop. One socket per launch. Biometric lock, haptics,
  named places, camera and photos.
- **Correction, 2026-08-21:** this list said "persisted appearance" for days and it
  is not true — there is no store, no key, and `theme/appearance.tsx` says so in its
  own header ("deliberately in-memory for now"). Accent, glow and the motion switch
  reset on every launch. Carried in from the 08-17 roadmap and repeated here without
  checking, which is the exact failure this file exists to stop.
- Read/unread, day rules, full-message box and paging in the Activity panel
  (2026-08-21 — see §2.1, it exists because the briefings were invisible there).

### Built and still never once exercised by a human

- **The microphone.** `brains.usage.audio` is `0`. The oldest unverified thing here.
- **The desk-key handshake.** `has_desk_key: false`, and `dropped_no_key` is 18 and
  only ever rises. Every sealed cloud turn is discarded rather than queued.

### Known-lossy right now

- Those 18 dropped turns.
- **Correction, 2026-08-21 (second one today).** This list said gateway rolling memory
  "lives in process RAM under a shared `chat_id 0`, wiped on every restart". Read the
  file: there is a `chat_turns` table in Postgres with `chat_id, role, content` and an
  index, loaded and appended by `_db_load_blocking` / `_db_append_blocking`. The claim
  was carried forward from the 08-17 roadmap and repeated for days without checking —
  the same failure as the "persisted appearance" line above. What IS true: shared
  memory is gated on `APP_MEMORY_SHARED` and `TELEGRAM_USER_ID`, and neither can be
  read from this machine, so whether the deployed gateway has it on is unverified.
- `fix/durable-state` is **two commits ahead of `feat/cloud-gateway` and not
  deployed**. `/health` carries no `memory.state_durable`, which is how you can
  tell from outside. It was held back deliberately: deploying wipes Render's disk,
  and the first briefing was 25 minutes away.

---

## 0b. The ledger — everything, and whether it is done

The one place that answers "is this built?". It was costing a codebase read each
time, and two files used to answer it differently.

**This section is generated.** Its rows live in `docs/status/ledger.json`, which is
the single source of truth for every status claim in this repo — edit there and run
`npm run status`, or the next generate silently reverts you. The same file produces
`docs/completion-tracker.html`, so the browser view and this table cannot disagree.

<!-- BEGIN GENERATED: ledger -->

*Generated from `docs/status/ledger.json` by `node scripts/build-status.mjs`. Do not edit by hand.*

**Status means exactly this:** `proved` — a human has seen it work on the
phone; `untested` — the code and its tests are in, no human has ever exercised
it; `partial` — works, with a named gap; `broken` — works badly, defect logged
in §2; `—` — not built.

**Blocked-on** is the column that stops a brain dependency hiding in prose.
`Brain` · `Desk` · `Phone` · `App · build` · `App` — a blank means nothing is owed.

**55 of 89 rows are proved on the phone** (62%). 73 have code (82%). 23 cannot be finished in this repo: 19 on the brain, 2 on the desk, 2 on the phone.

### Transport, pairing, security

*4 proved of 8.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| LAN probe → cloud fallback → WebSocket, reconnect | proved |  | One reducer serves every tab. |
| One socket per launch; chat survives force-stop | proved |  |  |
| Pairing token in SecureStore, with rotation | proved |  | New accepted, old refused 403. |
| Biometric lock, re-locking on background | proved |  | `strong` only — Android rejects `BIOMETRIC_WEAK \| DEVICE_CREDENTIAL` outright, and with a passcode fallback enabled no sheet appears and the promise never settles. |
| Desk-key handshake (sealed turns) | partial | Desk | **Cause found, fixed and PROVED ACROSS A REAL DEPLOY on 2026-08-29 — the sealed path itself is still owed.** `has_desk_key: false` was read off the LIVE gateway with the desk off, which is the ordinary state of this system: the PC being off is exactly why a fact is queued. The key lived in memory and in a file on Render's disk, so every deploy and every spin-down returned the gateway to the one state where `queue_fact` cannot seal and DROPS the turn. Eighteen went that way in a week. The desk's public half and the sealed queue now mirror into the same Postgres `gateway_state` table the schedule uses — injected as a hook, so `fact_outbox` keeps its stdlib-only import discipline, and what crosses is ciphertext and one public key. **Measured live:** on `445c3a9` the desk bridge was attached for twelve seconds and the cloud went `has_desk_key: false` → `true`; on the NEXT deploy (`fded484`, a new container, desk not connected) it read `true` again, out of Postgres. 44 checks in `test_fact_transport.py`. **Named gap:** no fact has yet travelled the whole path — queued while the desk was off, then drained into desk memory on connect. That needs one cloud-answered turn with the PC off, and then the desk on. |
| `BRIDGE_SECRET` rotation | partial | Desk | **The blocker was ordering, and it is gone as of 2026-08-29; the rotation itself is still owed.** The gateway and the desk read this secret from two different places, so whichever moved first locked the other out — and the desk may be off when the change is made, which is why a known-leaked value stayed live for weeks. The gateway accepts `BRIDGE_SECRET_OLD` alongside `BRIDGE_SECRET` for one window now, logs loudly on every connect that still uses the old one, and reports `bridge_rotation: {old_accepted, connects_on_old}` on `/health` — so the old value can be deleted on evidence rather than on a guess. **His four steps are written out in `jarvis-backend/CLOUD_GATEWAY.md`:** set both and deploy, move the desk's `.env` when that machine is next on, watch the count reach zero, delete the old one. No window where either end cannot reach the other. |
| Capability-split tokens | untested | Brain | **WRITTEN 2026-08-29 on the home machine, both halves, and NOT LIVE.** The gateway derives a short-lived token per capability from `APP_TOKEN` (`POST /app-tokens`, master-only): `link`, `push`, `state`, `memory`, `say`. A token is `j1.<cap>.<exp>.<mac>` with the mac keyed by the master itself, so verification is stateless, **rotating the master revokes every derived token at once**, and a leaked `push` token buys the push route and nothing else — it cannot even mint itself a new one. This app exchanges once and stores the set beside the master (`src/link/capabilityTokens.ts`), attaches the right one per route, and re-mints three days before they lapse. **The master still opens every route on purpose**: this install presents it, and an auth change that locked him out of his own assistant would be worse than the leak it prevents — `/health` counts every master use per route so the migration is a number. 68 checks in `test_app_tokens.py`, 20 + 3 + 7 jest here. **Owed: a deploy and an OTA publish, then `master_calls` going quiet.** |
| Token expiry | untested | Brain | **Written 2026-08-29 with [token-split], and the same deploy is owed.** Every derived token carries an expiry (`APP_TOKEN_TTL_DAYS`, default 30, declared in `render.yaml`). An expired one is refused with `401 {"error": "token_expired"}` rather than a bare 401, because the difference decides what the phone does: this app mints again and retries **once**, and a second expiry after a fresh mint is a clock problem rather than something to loop on. A caller may ask for a shorter TTL and never a longer one. The master itself does not expire and is not meant to — it is the pairing secret in SecureStore, and rotating it is what revokes. |

### Talking to him

*15 proved of 21.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Text chat, both directions | proved |  |  |
| Replies arrive word by word | proved |  |  |
| Markdown rendered, not shown as asterisks | proved |  |  |
| The chat log in the right order, once each | proved |  | **Proved on `84f40716`, 2026-08-27, on update `01a0429e`** — read top to bottom by scrolling the whole ~100-entry log, not from one screenshot, which is how this row was wrongly called done before. **Every timestamp ascends**, across four days and three day rules (`Friday`, `Tuesday`, `Yesterday`, `Today`), including the exact case reported broken: yesterday's 19:00 briefing sitting above today's 07:00.

It took two fixes today and the first was incomplete. `place()` orders what arrives; **`inOrder()` had to be added for what was already on disk**, because a relaunch restores the file as written and `place()` can never reach it — a fix that only guarded new entries would have left the phone looking identical and read as a third failure. That is `hydrate`'s own sentence about duplicates, applied to order.

**The one same-text pair in the log is not a duplicate:** two identical turns 60 seconds apart, and the operator confirms he sent it twice by hand after the first appeared to get no reply. Sixty seconds is far outside the 5-second window and the code is right to treat it as a second send. **What made him resend is a separate defect, recorded under `chat-stuck-sending`.** |
| A turn interrupted mid-send stops claiming to be sending | proved |  | **Found and closed on `84f40716`, 2026-08-27.** A `thanks Jarvis` from Monday 20:02 had been reading `SENDING` for three days: `sending` is the gap between `local_command` and `turn_sent`/`turn_failed`, both of which belong to a running process, so killing the app in between leaves the turn written to disk mid-flight with nothing to move it. Its owner read that as never sent and re-sent it by hand — **the only duplicate in that log is this bug's footprint.**

**Detected on restore, not by age.** A restored turn still saying `sending` has lost the process that owned the send, which is a fact; a threshold would be a guess about how long a send may take and would eventually accuse a slow one in the current session. Only the restored half is touched.

**A new state rather than reusing `failed`, and that distinction is the point.** `failed` renders `NOT SENT` and carries this app's one unambiguous retry, justified by nothing having carried the message. An interrupted turn may already have gone — the window spans `link.send()` — so `NOT SENT` would be a guess and a safe-looking `SEND AGAIN` on *run script X* could run it twice. `awaiting` asserts *carried*, equally unknown. `INTERRUPTED` says what happened and claims nothing about the outcome: tone `bad`, no retry, words left there to be copied.

**Seen on the phone at `01a042b3`:** the Monday turn now reads `You · 20:02 INTERRUPTED` in red. It repaired itself on load, since `hydrate` does the marking — no migration, and nothing else on the device had to change. 7 tests, 5 of which failed first. |
| The voice rule applied to what the model writes | broken | Brain | **Found on the phone 2026-08-24.** `sir` is punctuation — lowercase, spent once. The situation line obeys it; every model reply capitalises it: *Standing by, Sir.*, *I can’t see your screen from here in the cloud, Sir.*, *I can’t authorise task approvals from the cloud, Sir.* Systematic rather than a one-off, and the same gap the nudge path has. The rule lives in `commute.ts` and `_briefing_text`; the persona prompt never got it. **Seen again 2026-09-01 on the current bundle**, in a reply about a photo: *"…is a rather grim sight, Sir."* Capitalised, mid-sentence. So the gateway fix is still not deployed, and this row has fresh evidence rather than only the August sighting. Seen a second time the same afternoon, in the reply to the retried photo: *"…scribbled notes, Sir."* Twice in one hour on the current bundle. |
| No unprompted weekday assertion | broken | Brain | **Seen again on the phone 2026-08-24, a Monday.** *I can’t authorise task approvals from the cloud, Sir. Are you working this Saturday, by the way?* — a weekend question appended to an unrelated refusal. Same class as the false Saturday shift: a stored Mon–Fri pattern being asserted as a fact about today. The fix is committed in the brain as `c86d176` and undeployed, which is exactly what this looks like. |
| Reasoning monologues can never reach the screen | proved |  | `_strip_reasoning()`. **Device pass 2026-08-24:** two full screens of real model replies read off the phone, including multi-sentence answers and one that reasoned about a screenshot — no monologue, no stray tags, nothing leaked. Previously proved in the harness only. |
| The opening line is the real situation | proved |  | On-device, no model, no await. **Read again 2026-08-24:** *12:24 PM, sir. You are at Office and Office briefing at 7:00 PM.* Note the lowercase `sir` — this line obeys the voice rule, which is what makes the replies below it violating the same rule so visible. |
| “What can you do”, answered without a round trip | proved |  | On-device, so it answers with everything even offline. |
| A Capabilities screen listing the same thing | proved |  | One list, two surfaces. Read back over adb. |
| A status panel naming every seam | proved |  | Eight rows, four states, assembled on the device so it is readable with nothing connected at all — which is exactly when it will be looked at. **Read on the phone again 2026-08-24, on the new bundle:** all eight rows render, the caption counts `1 OFF` for the sleeping desk alone, and the briefing row reads `AT THE GATEWAY` while the link is cloud. Named gap: the third briefing state added that day, `CANNOT TELL`, cannot be reached on a cloud-linked phone — the stamp is fresh, so it would take two days of workspace-only sessions or a debug build to see it. **Reviewed 2026-08-27 and the gap is not work — it is a state that cannot be induced.** `CANNOT TELL` needs `cloudArmedState` to read `stale`, which needs the upload stamp older than `CLOUD_TTL_HOURS` (48) or dated in the future. Neither is reachable on demand: the stamp refreshes on every cloud connect, and the only lever that would fake it is moving the phone's clock — **which must not be done**, because `timeline` is three days into a four-day count and the journal is time-keyed, so a clock move would cost more than this row is worth. It is covered by test (`statusPanel.test.tsx:73`), and the eight rows and four states have been read on the device twice. **This is the same shape as `fallback-armed` and should be left `partial` for the same reason** rather than being quietly promoted or treated as an open task: the honest `partial`s here are ones nobody can close, not ones nobody has done. **PROVED 2026-09-01: the fourth state has now been seen.** The row argued that `CANNOT TELL` could not be induced, and it was right about the clock and wrong about the ceiling — the stamp itself can be written back past its window, which touches neither the clock, the schedule, nor the gateway's copy. `ageCloudStamp` does that from Places, and the panel then read **`CANNOT TELL`** with a grey dot and *"Not uploaded in two days. The gateway may still hold it; the phone will brief as well."* **The caption still read `1 OFF`** — the sleeping desk alone — which is the design holding: unknown is not off, and that distinction was the whole argument for four states rather than two. Driven from the laptop, because the control is a `Pressable`. Second row today where "cannot be induced" turned out to mean "nobody built the lever yet". |
| Whether the gateway holds a push address | proved |  | Nothing exposed this before, and it is the most diagnostic fact in the app. |
| Photo preview and caption before sending | proved |  |  |
| A photo answering with its own lookup marker | proved |  | Shared by the text and vision paths. |
| A thumbnail in the chat instead of the word “Photo” | proved |  | **Already built, and the row was wrong.** `sendPhoto` carries the shrunk copy `uri` on the turn and `SentPhoto` renders it above the caption, with an `onError` fallback for a cache Android has cleared. Found on 2026-08-31 by reading the code the row said did not exist. Never deliberately looked at on the phone, so `untested` rather than `proved`. **PROVED on the phone 2026-09-01, 14:46.** A photo sent from the composer renders in the bubble at its full width with the marker beneath it, under a `Today` rule. The camera control is a `Touchable`, so `adb shell input` cannot reach it and the send needed a finger — the third time that has decided how a check gets done. |
| Photo-in-flight indicator; a failed send stays recoverable | proved |  | **Recovery built 2026-08-31; the in-flight half was already there.** A photo turn has carried `SENDING` / `NOT SENT` since the marks shipped, because `sendPhoto` settles its own turn. What was missing was the recovery the row names: the send handed base64 to the socket and kept only a `uri` in the log, so a failed photo had a picture on screen and no bytes to re-send. `reshoot` rebuilds them through the same shrink the first send used — a retry that skipped it would put a full-size frame on a socket sized for 200 KB — and the caption comes back off the turn through `captionOf`, one place owning the marker so a retry cannot send the word "Photo" as though it had been typed. **A picture the cache has lost says so** rather than retrying forever: `resendPhoto` answers false and the chat says the photo is no longer on the phone. 11 tests. Unproved on the device. **The in-flight half is PROVED on the phone 2026-09-01:** the turn settled rather than sitting at `SENDING`, and the answer came back inside a minute — *"An empty cup at nearly three in the afternoon is a rather grim sight, Sir."* — so the vision path is end to end as well. **The named gap is the recovery**, which is the half built on 08-31 and still never exercised: it wants a send that fails with the network off, and then `RETRY`. Both the camera and the retry control are `Touchable`, so that check cannot be driven from the laptop. **The recovery is PROVED on the phone, 2026-09-01, 14:59.** Airplane mode on, a photo sent, and the turn marked `NOT SENT` with `SEND AGAIN` beside it and the picture still rendered — a failure that stays recoverable rather than a bubble that sits at `SENDING`. Network back, `SEND AGAIN` tapped: the failed turn was withdrawn and re-sent, and **the reply is about the photograph** — *"A capped pen and some scribbled notes, Sir…"* — so `reshoot` rebuilt the bytes from the cached uri and they reached the vision model. Before 08-31 that was impossible: the base64 went to the socket and only a local uri stayed in the log, so a retry could only have sent the caption as text. **Both controls are `Touchable`, so the whole check needed a finger** — adb could read it and could not drive it. |
| Sent / delivered / read ticks | — | Brain | Only the gateway can say delivered and read, and it says neither. Needs a per-message id on both sides. The largest fully-specified thing left. |
| Reply to a message | — | Brain | Wants the same per-message id as the ticks, so it follows them rather than inventing a second identity for a message. |
| Microphone in | partial | Brain | **Run at last on 2026-08-27, and the transport passed on the first try.** `brains.usage.audio` went `{gemini_ok: 0, fell_back: 0}` to `{gemini_ok: 1, fell_back: 0, last_error: null}` — the clip reached the gateway, Gemini accepted it, and nothing fell back to Groq. **The mime fear this row was written around was already answered in code:** `_AUDIO_MIME` maps `m4a` to `audio/aac`, which is exactly what Google documents, so there was never anything to fix. Note the counter is incremented on a call that did not throw, so it proves the format was accepted and not that words came back — the chat is what settles that.

**The named gap is the transcript.** *"hi jarvis"* came back as **"ki service"**, and the reply — correct Benglish for the question it thought it had been asked, about what the cloud can do without the desk — was right for a transcript that was wrong. The cause is visible in `_GEMINI_TRANSCRIBE_PROMPT`, which primes hard for romanised Bengali (*"the speaker mixes Bengali and English… anything that sounds like Hindi is Bengali"*). That prompt exists to fix the opposite failure and it works; on a two-word English greeting it overcorrects, and `ki` is a real Bengali word. **One sample, and a poor one** — two words, one of them a proper noun the prompt never names. Cheapest thing to try is telling the prompt the assistant is called J.A.R.V.I.S., which is a gateway change and so blocked with the rest.

**2026-08-27, second clip: voice is cleared of the wrong answer it appeared to give.** A spoken *"how far is home from here"* was answered with an invented distance, which looked like the transcript being mangled again. **Typing the identical question reproduced it exactly** — so the fault is `_FAR_RE`, recorded under `weather-distance`, and had nothing to do with the microphone. `gemini_ok` reached 2 with `fell_back` still 0. **A separate defect did show up on that clip, and it is now diagnosed:** the transcript never rendered as a user turn, where the first clip's did. **The socket died while Gemini was transcribing, and only the answer has a lifeboat.** `emit()` returns False when the socket is gone; `deliver()` checks that and pushes the answer instead (`cloud_gateway.py:3977`), while the transcript at `:4095` throws the result away and has no push path at all. Confirmed on the device: `numPostedByApp` went 2 to 3, so the reply arrived by push — which is why the chat shows an answer with no question above it. The window is the app being backgrounded mid-turn, where `LinkMachine.suspend` closes the socket deliberately; the first clip survived it by being short. **The codebase already learned this and half-applied it** — `emit`'s own docstring says False was once indistinguishable from success, *"which is how a finished answer came to vanish silently"*. The transcript was never given the same protection. Fixing it wants the push payload to carry the transcript so the app can write the user turn: prepending it to the answer is not open, since the code is explicit that a transcript sent as a status message is a lie about who spoke. |
| Voice out | — | App | The largest single gap in the chat, and app-only — `expo-speech`. **Voice IN is no longer the unknown half, as of 2026-08-27:** the microphone path works end to end and only the transcript is unreliable. This row is unchanged — nothing speaks yet. |

### Notifications and being spoken to

*15 proved of 16.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Whether the background task is running, not merely registered | proved |  | **Seen on `84f40716`, 2026-08-26, on update `01a03dfe`.** The row read *“Last ran 4 minutes ago. Nothing was due. 1 run recorded.”* against a run the log timestamps at 17:51:39 — so the stamp the task writes is the stamp the screen reads. `getStatusAsync()` answers a different question and reported `Available` throughout the week this feature had not run. `healthFrom` turns registration, availability, the stamp and the last arming attempt into one of six readings; `unarmed` further splits by that attempt — never asked, refused with a reason, or armed and since dropped. 32 tests. |
| Push to a sleeping phone | proved |  | It buzzed. Reaches a dead app and is exempt from the background-execution block. |
| Both notification channels exist on the device | proved |  | Confirmed by adb, neither deleted. |
| The desk alert outranks an everyday one | proved |  | Importance 5 against 3. |
| Renamed channels are deleted rather than left behind | proved |  | Six old channels all confirmed deleted. This app has renamed its everyday channel eight times, and every rename silently broke replies until the gateway was told. |
| A notification tap opens Chat | proved |  |  |
| A desk-watch alert reaching a closed app | proved |  | Tapping it opens the alert screen. |
| A pushed departure briefing, unprompted | proved |  | It arrives. It also arrived twice — the gate is built but no departure window has run since. |
| The phone fallback is actually armed, and says so when it is not | proved |  | **Found unarmed on 2026-08-26, fixed, and the armed half proved on the device the same day.** `setCommuteTask` reads the registration back after asking, because `registerTaskAsync` resolving proves only that it did not throw; the result carries the platform’s words, every attempt is recorded for a screen to read after a relaunch, and `App.tsx` logs a failure rather than discarding it. **Proved:** WorkManager holds job `#u0a495/288`, the task executes and writes its stamp, and Places reports it truthfully. **The named gap is the other half — “says so when it is not”.** The phone re-arms itself at launch and on every visit to Places, so the unarmed state cannot be induced on demand; it is covered by tests and by the reading that named it, not by a sighting. **2026-08-27 did not move this and is worth recording as such.** The 07:00 window was the first real one with the phone armed underneath a live gateway, and the phone correctly stayed silent — so the fallback still has not been seen to POST anything. Standing down is the gate’s proof, not this row’s. **2026-08-31: the missing half is now checkable in one tap.** The reason it stayed `partial` was never doubt about the code — it was that the app re-arms at launch and on every visit to Places, so the unarmed state healed faster than anyone could look at it. Places now offers `TEST` beside the row, which unregisters the task and re-reads the health so the sentence can be read for real; the stored schedule is untouched, and leaving Places and returning re-arms it by the same path that fixed the real occurrence on 2026-08-26. **This row is now one device check away from proved, and that check is thirty seconds.** **PROVED on the device 2026-08-31, 18:47, both halves and the repair.** Driven from the laptop over wireless debugging. Armed beforehand: `JOB #u0a495/629` held by WorkManager. `TEST` pressed by `adb shell input tap` — which is the reason it is a `Pressable` and not a `Touchable`, since the latter refuses synthetic taps. The row then read *"Switched on, and Android holds no registration for it. The fallback is not armed. It was armed 1 minute ago and Android has since dropped it."* and `dumpsys jobscheduler` agreed — **no JOB entry for u0a495 at all**, so the screen and the platform were checked against each other rather than the screen being taken at its word. `TEST` also correctly disappeared once there was nothing left to disarm. Leaving Places and returning brought back `JOB #u0a495/630` — a new id, so the repair is a real re-registration and not a stale read. The one thing this row could never show has now been seen. |
| Briefing content, thresholds, quiet-day announcement | proved |  | Thresholds on real figures, never the model. Quiet day announced with its figures rather than silently, after silence was read as breakage for four days. **The wording rotates as of 2026-08-26** — a persisted cursor per slot in `briefingVoice.ts` spends a pool of 6–7 remarks before any line returns, and the titles rotate with it. The figures deliberately do NOT vary: a measurement rephrased for novelty is one you can no longer compare with yesterday. Every variant keeps the actionable word, so Android truncating the shade cannot eat the instruction. 30 tests, and the rules are asserted over the whole table rather than over one rendering. **Only the phone-sent briefing is affected;** when the gateway is armed it writes its own text. |
| Rotating wording in the gateway-sent briefing | proved |  | The phone rotates its own wording; the gateway does not. When `cloudArmed` is true the phone stays silent by design and the gateway posts `_briefing_text`, which is a fixed template — so on a cloud-linked phone the repetition the rotation was built to fix is still what arrives. Same shape as `briefingVoice.ts`: a pool per slot and a cursor that survives a deploy, which is why it wants `fix/durable-state` merged first rather than a second store that a redeploy wipes. **Seen rather than reasoned about, 2026-08-27.** The Office briefing at 17:59 on the 26th and the Home briefing at 07:00 on the 27th carry the identical remark — *"An umbrella, unless you’ve grown fond of arriving wet."* — and differ only in their figures, 51% against 65% with a storm line added. Two mornings, one sentence. It also cost a diagnosis: the changed figures read as rotated wording from the phone, and the gateway was briefly suspected of having gone silent. **2026-08-31: the rotation is written and deployed.** `02604c6` on `feat/cloud-gateway` ports this repo's `briefingVoice.ts` line for line rather than inventing a second voice, and `fix/durable-state` is merged, so the cursor survives a redeploy — which was the reason it had to wait. **Owed: two gateway briefings on different days, compared.** The pair that proved the defect were word-for-word identical, so word-for-word difference is the check. **PROVED 2026-09-01, on the same slot two days running, which is the comparison that settles it.** Home 07:00 on 08-31: *"Before you leave Home, sir — A 60% chance of rain on your way out, around 0.5 mm. An umbrella, unless you have grown fond of arriving wet. (7 AM–10 AM)"*. Home 07:01 on 09-01: *"Home, and one thing to take with you, sir — A 94% chance of rain on your way out, around 1.2 mm. An umbrella would be the sensible half of this conversation. (7 AM–10 AM)"*. **Title and remark both moved; the figures moved independently of them; and `umbrella` — the actionable word — survived in both**, which is the rule that mattered because Android truncates the body in the shade. The evening slot the same day was different again (*"A word before you leave Office, sir… An umbrella. It is by the door, where it has been all week."*). **Two slots on one day would NOT have proved this** — separate per-slot templates would look identical to rotation — which is why the same-slot pair is the evidence and was waited for. Read off screenshots the notifications had already been swiped from, plus the chat log, which keeps its own copy. |
| He speaks first, once a day | untested | Brain | Fired for the first time and was wrong: a bare substring match let a Mon–Fri pattern assert a Saturday shift, and the prompt then asserted it as true today. Fixed in the brain as c86d176, not deployed. The same body also capitalised `Sir`, which the voice rule forbids. **2026-08-31: the fix is deployed.** `c86d176` is contained in `origin/feat/cloud-gateway`, which is the branch Render watches — verified from this repo with `git branch -r --contains`, which is as much as this laptop can check. So the substring bug and the capitalised `Sir` are both live. **What is owed is a morning:** he speaks once a day at most, so this is proved by looking rather than by triggering. |
| Briefings visible in the Activity panel | proved |  | They had been filtered out entirely. |
| Read / unread per entry, surviving a restart | proved |  | **Proved, and then found half-wired on 2026-08-27.** Marks are per entry and survive a restart. What they did NOT survive was reading the chat: there are two unread systems — `readAt`, the timestamp behind Home’s *"N new replies"*, and `readIds`, the persisted set behind the bell — and only the Activity panel ever wrote to the second. So reading the conversation cleared its own marker and left the bell counting the very turns it had shown. Fixed at `28d682d`, published as `01a0422d`, **and confirmed gone on the phone the same afternoon.** The same fix closes the case one step earlier: a reply landing while the chat is open is marked read as it arrives, where before the tab bar counted an answer being read on screen. |
| The local task gated so it cannot double-post | proved |  | **Proved on `84f40716`, 2026-08-26 at 18:31:15.** A run forced inside the phone own departure window (18:30–19:00 for a 19:00 departure) while Home read `AT THE GATEWAY`: it exited in 260ms without fetching a forecast and posted nothing. The shade held exactly one briefing all evening — the gateway push at 17:59:18 — where 2026-08-21 saw both senders fire and the same briefing arrive twice. Forced rather than waited for, which settles the gate decision and not the scheduling; scheduling is proved separately by the unattended run at 18:07. **Held in a REAL window on 2026-08-27.** The 07:00 Home departure, with the phone rebooted the night before and the app never opened: exactly one notification arrived, and it was the gateway's. That is the same decision the 18:31 run settled by force, taken this time by a headless run nobody was watching. |
| Full message on tap, day rules, paged list | proved |  | **Proved on `84f40716`, 2026-08-27**, on a timeline finally long enough to exercise every part of the row at once. The full message on tap: the 07:00 briefing whole, in a box that no longer collapses to a line — the defect this row was left `partial` for. The `Yesterday` rule separating two days, which had never been seen. And the paging: `SEE n MORE` revealed twelve at a time (`PAGE = 12`, `ActivityScreen.tsx:27`), the count fell by twelve a tap, the last page held four, and the button then removed itself rather than sitting there offering nothing. `TESTING.md` 3.2, 3.9 and 3.10. |

### Memory and the journal

*5 proved of 13.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Facts stored and recalled | partial | Brain | 14 facts known. Volunteered exactly once, wrongly. **Read on the device 2026-08-27, all 17, and the store is in better shape than that sentence suggests** — parents, brother, employer and its address, both dogs with sex and dates, the PIN code, the marriage year. A photo of a dog he had never sent before was answered *"That's Puku, Sir. He passed away on the fifth of August last year"*, which matches the stored `died on 5 August 2025` exactly, and the disambiguation is real work rather than luck: **two dogs are stored**, and *"who he **was**"* (past tense) plus *male* selects Puku over Kitty, who is female and alive.

**One row on that screen is a bug, and it caused today's worst answer.** `Kaustav is **currently** in Ichapur, West Bengal, India` — a time-sensitive claim in a permanent store. When `_FAR_RE` extracted `dest="here"` and injected no route fact, the model reached for that, and with `Kaustav lives in Ichapur` beside it produced *"since you're currently in Ichapur, sir, you've already arrived at home"* while the phone's own header read `Office`. **So that answer was not invented from weights — it was a stale fact filling a hole the regex left**, which is worse, because it will happen again wherever a live lookup fails quietly. Every other fact on the screen is durable; this one is a snapshot wearing a fact's clothes, and the `where` block already carries live location on every single turn, so it is redundant as well as harmful.

Also visible: `Kaustav asked about Marco Polo`, which is not a fact about him at all. Extraction is storing conversation trivia beside load-bearing records. |
| Anything he learns from what you actually say | — | App | **The largest gap in the memory story, and it was not in this ledger until 2026-08-24.** `shareFacts` derives from the journal rollup and named places only — four keys, all about the handset: `phone:screen-time`, `phone:pickups`, `phone:top-apps`, plus the places. **Nothing reads the conversation.** How he works, who matters to him, what he cares about: durable only if typed by hand into the Memory screen. So a chat scrolls past `CHAT_CAP` (100 entries, roughly a day at real pace) and nothing was taken from it. The raw turns survive brain-side in `chat_turns`, so this is not data loss — it is that no turn is ever promoted to a fact. |
| A chat log that is not a one-day window | partial | App | `CHAT_CAP = 100` in `hudReducer.ts`, original and deliberate — a phone should not carry an unbounded log. Measured 2026-08-24: the whole persisted log spanned **Fri 20:03 to Sat 15:28**, so at real conversation pace 100 entries is about one day. Worth naming because the cap is silent: nothing tells you a turn is about to leave, and nothing is harvested before it does — see [facts-from-talking]. The brain keeps the turns; only the phone forgets. |
| One assistant across desk, phone and chat | partial | Brain | App and chat share one history. A desk answering with its own brain bypasses it, so those turns never join the shared history. |
| Rolling memory durable across restarts | partial | Brain | In Postgres, not RAM — the RAM claim was stale. Whether the shared-memory flag is actually on in Render's environment is unverified. |
| Deploy-durable gateway state | untested | Brain | Committed on `fix/durable-state`, two commits ahead of the gateway branch, undeployed. Until it merges, every deploy silently disarms the briefing. |
| Chat history sent with the ask | — | Brain | The envelope carries one turn. |
| Journal: usage source, rollup, fact sharing | proved |  | Derived facts only, never rows — the pattern every later sense copies. |
| The journal’s denial path | proved |  | Reads “I cannot see your usage, sir — the permission is off.” Collected history stays visible under HELD ON THIS DEVICE, which is the honest distinction. |
| Any background work running unattended | proved |  | **Proved on `84f40716`, 2026-08-26 at 18:07.** The task ran with the app backgrounded and the phone disconnected from adb — nobody started it, and the count on Places moved from 1 to 2 with the stamp reading `Nothing was due`. Getting there needed the throttling lifted first: standby bucket **40 (RARE)** to **5 (EXEMPTED)** and the app added to the device-idle whitelist, after which `WITHIN_QUOTA` went from unsatisfied to satisfied and only the 15-minute timer remained. That is what the Battery restrictions row asks a person to do in Settings. Before that, measured the same day: roughly one job window a day and `Network: blocked=REASON_APP_STANDBY`. |
| The commute task body exercised by a test | proved |  | 10 tests, with the task callback captured at import and invoked against the real module. The gate cases were confirmed by removing the gate. |
| Location timeline | proved |  | Sightings at named places, median last-seen per day, its own 28-day store. Silent for its first four days, by design. **Device pass 2026-08-24:** it is accumulating — the panel reads *Learning your hours at Office* and its countdown had moved from `4 MORE DAYS` to `3 MORE DAYS` since 08-21, which only happens if sightings are being recorded at a named place. Named gap: nothing it has learned has been *used* for anything yet, so its output is still unseen. **The named gap is addressed in code, 2026-08-27.** The app was spending four days learning an hour and then telling nobody: the figure surfaced in exactly one place, the anticipation remark, which fires ONLY when you are 45 minutes past it. So on every ordinary day it had learned something and kept it — failing the anticipation doctrine's own third test, *a figure you could disagree with rather than an adjective*. The WATCHING row now says the hour itself (`6:40 PM`) with a note naming the place and the days behind it, instead of `Office, ready`. `null` stays a real answer: enough days with no median still reads `ready` and invents no time. **Unproved until the fourth day lands** — the row reads `1 MORE DAY` tonight, so opening the app at Office tomorrow is what makes it speak. 4 tests. **PROVED 2026-09-01: the fourth day landed and the row speaks.** The WATCHING panel reads *"When you are usually gone — 3:40 PM"* with *"Learned from your last 6 days at Office"* beneath it, where it read `1 MORE DAY` on 08-27. So the median exists, it is surfaced where it can be disagreed with rather than only inside a remark that fires 45 minutes late, and the day count is named. The figure carries the app-open bias this store has always had — it is the median of last SIGHTINGS, not of leavings — which is why the panel quotes the days behind it.

**2026-09-02: the WATCHING row stopped claiming it cannot see him leave.** *"It cannot see you leave — only where you turn up next"* was true for as long as a sighting needed the app open, and stopped being true at 19:08 on 09-01. The panel kept saying it anyway, over a 9:04 PM figure that is where he TURNS UP, an hour and a half after he left. It now prefers a measured departure and names what watched it: *"Measured at Office: the phone crossed the boundary with the app closed."*

**It also counts up rather than denying the evidence it holds.** `leftBy` wants four distinct days before it will call a time usual, and on 09-02 it had one — so the row fell back to the bound and said *nothing has watched you leave yet* while Monday's exit sat in the store. Two different claims, and only the second was true: `exitDaysAt` now feeds *"it has watched you leave once, and wants 4 before calling that your usual time"*.

And the note printed literal `**asterisks**` — the panel renders plain text, so markdown emphasis arrives on screen as the characters themselves. |
| Call log, archive import | — | App · build | Native build, and fatal for a store listing. |

### Knowing and acting

*9 proved of 17.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Named places, location sharing, located answers | partial |  | **Proved on `84f40716`, 2026-08-27, from the Office**, which is the first time this row has been exercised since the fix that touched it. Three things at once. Location sharing on and the header naming `Office` — the label set by standing there, not a geocoder’s guess. *"how far to home"* answered **39.3 km by road, about 38 minutes** — so `home` resolved to the place he named, and the route was measured FROM where he was standing rather than from a district. *"is it raining here"* answered *"currently clear at the office, sir, with no rain falling"* plus a **95%** chance later — figures, and the place named. Asked from the Office deliberately: *"how far to the office"* would have answered zero and proved nothing. `TESTING.md` 7.1 and 7.2. **Found wrong on the phone, 2026-09-01, and fixed the same day.** Home and a named area about 150 m apart: walking to the area never changed what the app said. Two causes, and the radius was the smaller one. The fix was taken at `Accuracy.Balanced` — roughly a hundred metres, derived from wifi and cell rather than GPS — which was right while it only answered "what is the weather here" and wrong once the same reading decided WHICH NAMED PLACE he was in: wifi positioning anchors to routers it knows, so from down the road it kept returning his own living room. Now `Accuracy.High`, the match radius is 120 m rather than 250, and **the fix carries its own error so a place must win by more than it** — with two places 150 m apart and a reading good to 200 m, naming either is a coin toss reported as a fact. It answers null instead. **`partial` until the walk is done at home**: the office was never ambiguous — its nearest named neighbour is 700 m away — so only home can prove the repair.

**2026-09-02: the naming radius has a second witness now, and it agrees.** Four geofence departures in one morning named four different places along one commute — Home, Barrackpore Railway Station, Sealdah Rail Station, Sector V Metro Station — in order, at commute times, none confused with another. That is the 120 m radius and the accuracy-aware match working across the places that are far apart.

**Still `partial`, and now for exactly one reason.** Home and Laxminath Nagar are about 150 m apart with overlapping circles, and Ichhapur Railway Station sits close to both. He reported no notification leaving either — which turned out to be the sweep rule eating a real departure rather than the radius failing, and is fixed. The outstanding question is unchanged and still needs the walk: **when two circles overlap, does the app name the right one?** The enter and exit pairs are a better instrument for it than a screenshot of a header, because they carry times. |
| Arrivals and departures seen with the app closed | proved |  | **Built and installed 2026-09-01, on the build that carries `ACCESS_BACKGROUND_LOCATION`.** Every timing this app has ever reported came from a sighting written when somebody happened to open it, and 2026-09-01 spent the day paying for that: an office he leaves at seven reported as gone by 3:40 PM, an arrival called early for a man who had slept there, and a repair (8:04 PM) that could only ever be an upper bound. One root, three wrong figures, each caught by the person they were about.  Android reports a geofence crossing with the app closed, two to five minutes late rather than hours, which is the only way a departure is ever measured rather than inferred. `noteSeen` now records `via: enter \| exit`, and `leftBy` prefers a real exit and says `measured: false` when it is falling back to the old guess.  Asked for directly: *"the app should learn it itself, Google Maps Timeline has all the data"*. It does, and there is no route to it — Timeline moved on-device, no API exposes it, and a Takeout export is stale the moment it is made. Maps knows because it holds background location. This is the same permission doing the same job, for one app's own named places.  **Registered on the phone, 2026-09-01 18:14, on the APK built and installed the same hour.** Permission granted, WATCH pressed from the laptop, and the row went from *"the permission is there and nothing is registered"* to **"Android is watching 10 places and will report you arriving or leaving within a few minutes, with the app closed"**. Ten places, well inside the platform limit of a hundred.

`dumpsys location` reports *Geofence Manager: service: unregistered* and that is NOT a contradiction: expo-location registers through Play Services, not the framework manager, so the framework dump is the wrong place to look. Do not read it as a failure.

**It survives the process dying, which is the half that could be proved from a laptop.** `am force-stop` then a cold launch, 18:21: the row still read *"Android is watching 10 places"* with STOP beside it. Android holds the registration itself, so nothing has to re-arm it at launch the way the briefing task does — which also means `stopWatchingPlaces` is the only way back, and why the STOP control exists at all.

**Still `untested` until an exit is seen.** The remaining claim is that a crossing is reported with the app closed, and no laptop can manufacture one. The control is on Places (WATCH), the radius is 120 m, and the first real proof is a departure whose recorded time matches the clock — which cannot be made to happen from a laptop, only by leaving.

**The platform fired ten false departures the first evening, and that is now the interesting part of this row.** At 18:31, from the office, the phone posted *"Left Office"*, *"Left Home"*, *"Left Musalman Para"* and seven more, all in the same minute, and wrote a sighting for each. Play Services re-evaluates every region when the app process restarts and reports an exit for **each region the phone is outside of** — so standing at the office produces a departure from every other place he owns. Every event is real. Not one is a departure. Caught by him within a minute: *"but i'm in office now, then why home?"*

Three rules came out of it, each with the failure it answers:

1. **A person leaves one place at a time.** Two places reporting a departure inside ninety seconds is the platform, so the burst is dropped — and because the first exit of a burst cannot be told apart from a real one when it arrives, the repair reaches backwards and removes what was already written.
2. **Wait before speaking.** Retracting was tried first, and it left *"Left Home — 6:40 PM"* standing in the shade about a house he was nowhere near: the dismissal is best-effort, the notification shade is not. The word now waits ten seconds and goes out only if the sighting survived. The sighting itself is never delayed.
3. **You can only leave where you were.** A lone false exit has no burst to give it away, so it is judged by what came immediately before it: a departure from somewhere the app was not just seeing you is geometry, not a person. An exit with nothing before it still stands, because silence is not evidence.

`pruneSweepExits` applies all of it at every launch, to the records already written and to anything a process that dies mid-sweep leaves behind.

**PROVED on 2026-09-01 at 19:09 and again through the morning of 09-02.** *"Left Office — 7:08 PM. Noted, sir."*, with the app closed and the phone in a pocket, against a man who says he leaves at seven or ten past. **The same event this app reported as 3:40 PM eight days ago, and as 8:04 PM after the first repair.**

The morning after was the better proof, because it is a whole journey rather than one crossing: **Home 8:06, Barrackpore Railway Station 8:41, Sealdah Rail Station 9:31, Sector V Metro Station 10:03.** Four places, in order, at times that match a commute — no sweep, nothing at once, nothing from a place he was not at.

One detail worth keeping: the last two arrived on the phone together at 10:32, minutes after the events. Android batched the delivery. **The bodies still read 9:31 and 10:03**, because the time comes from the event rather than from the posting, and that is the difference between a figure and a guess about a figure.

**The anti-sweep rules ate two real departures, and that is worth writing down.** Reported 2026-09-02: no notification leaving Laxminath Nagar or Ichhapur Railway Station. Both overlap Home, so one walk out of the door crosses two boundaries inside a minute — **which is the same shape as the platform sweep**, and the rules built the evening before threw the second one away.

Distance is what tells them apart, and nothing else does. A person can leave two circles 150 m apart on one walk and cannot leave two places 40 km apart in the same breath, so a burst is only the platform when the places are further than half a kilometre from each other. The launch repair takes the same test, and so does *you can only leave where you were* — leaving home is also leaving the neighbourhood that overlaps it, and the sighting before it is that neighbour.

**Unknown labels count as near rather than far**, because the cost runs one way: treating a real departure as a sweep deletes a sighting that cannot be recovered, while keeping a false one costs a figure that later data outvotes. |
| He tells you when you left | proved |  | **Asked for on 2026-09-01, in this shape: exits only, with a cooldown.** Ten named places reporting both crossings is a phone that buzzes all day about things you already know; the departure is the one carrying a figure the app could never measure before.

*"Left Office — 7:05 PM. Noted, sir."*, on the general channel, two to five minutes after the boundary is crossed and ten seconds after that. Forty-five minutes of quiet per place afterwards, per place rather than per phone, because leaving home and reaching the office are fifteen minutes apart on one morning.

**TEST on the Places row posts the same notification** without writing a sighting or spending the cooldown — proved on the device at 18:31, which is how the sweep was discovered in the first place. This app has shipped notifications before that turned out silent, on the wrong channel, or cut off in the shade, so a preview is not a luxury.

**PROVED, 2026-09-01 19:09: *"Left Office — 7:08 PM. Noted, sir."***, screenshotted from the lock screen. One notification, on the right channel, legible in the shade, the minute correct — and eight minutes under it, the 7:00 PM departure briefing about a 63% chance of rain. Two different things reaching the same pocket about the same journey.

Four more the next morning, one per leg of the commute: Home 8:06, Barrackpore 8:41, Sealdah 9:31, Sector V 10:03. The cooldown was never the constraint it was built for — a real commute is nowhere near forty-five minutes of the same place — but the sweep rules earned their place the evening before, and none of these four was a false one. |
| Weather and distance from measured figures | proved |  | The search provider is unverified, and a silent search failure looks exactly like hallucination. Routing is a public server that knows the road graph and not the road, so durations are free-flowing and the context says so. **2026-08-27, from the Office:** both lookups answered with real figures — 39.3 km / 38 minutes by road, and a 95% precipitation chance against a clear sky now. So routing and forecast are reaching a server and returning measurements, which is the half that could be checked from the phone. `/health` reports `search: tavily`. **The named gap is unchanged:** that a TAVILY search answers is still unverified, and a silent search failure still looks exactly like a confident answer — the two lookups above are the route and forecast paths, not the search path. **BROKEN, found 2026-08-27, and it is one regex.** `_FAR_RE` (`cloud_gateway.py:2757`) accepts `to\|from\|until` before the destination, so *"how far is home **from here**"* extracts `dest="here"`. Nothing matches a known place called "here", geocoding it returns junk, and **no route fact reaches the model** — which then answers from its weights and stored facts. Seen twice within fifteen minutes: *"you're currently in Ichapur, sir, you've already arrived at home"*, then *"approximately 23 kilometers from the office to Ichapur — a local train from Bidhannagar Road should get you there in about 30 minutes"*, both invented, both confident. The same question phrased *"how far **to** home"* answered 39.3 km correctly at 12:41, which is why this survived: **the feature works on the phrasing the test script uses and fails on the phrasing a person uses.** This is the exact shape this row was already warning about for search — a silent lookup failure is indistinguishable from a confident answer. Gateway-side, so it waits with the rest. **The distance half is FIXED and proved from the phone, 2026-09-01, 15:37.** Asked from the Office in the phrasing that broke it — *"how far is home from here"* — and answered *"Home is 40.2 km by road from here, Sir. It'll take about 37 minutes to drive, assuming the traffic behaves."* Measured, and it agrees with the 39.3 km that the *"how far to home"* phrasing returned on 08-27, so the two phrasings finally give the same answer instead of one inventing a local train. The gateway fix is `efd1af1`, written on the home machine from this repo's handoff page. **`partial`, not `proved`, and the remaining gap is the one this row named first:** that a TAVILY *search* answers is still unverified, and a silent search failure still looks exactly like a confident answer. Routing and forecast are proved; search is not. Also seen: `Sir` capitalised again, the third time today. **The figure was then checked against an outside route, and it holds to 100 metres.** Both endpoints honest this time: the office end is the phone's own last fix read from `dumpsys location` (`22.576904, 88.434474`, ±20 m) and the home end is the plus code `R98C+6C7` decoded to `22.81556, 88.37106`. OSRM answers **40.3 km / 38 min**; the app said **40.2 km / 37 min**. Straight line is 27.3 km, so the road figure carries a 1.47× factor — a real route rather than a fudge. An earlier check that read 35.0 km was guessing town centres from area names, and the 5 km gap was the guess, not the app. **The routing half is now confirmed three ways**: against itself across two days and two phrasings, and against an outside route. What keeps this row `partial` is unchanged and is not distance — a TAVILY *search* answering has still never been verified, and a silent search failure still looks exactly like a confident answer. **Also read off the fix, and worth keeping:** `alt=-19.0` with `mslAlt=38.0` on the same reading — the ellipsoid figure and the mean-sea-level one, 57 m apart. The phone carries the sea-level altitude, and it is the honest one to show if the floor question comes back. **The search half is PROVED, 2026-09-01, 16:04 — the last gap on this row.** Asked for a figure that only a live lookup can hold: *"what is the usd to inr rate right now"*, answered *"currently 95.44 Rupees, Sir… averaging around 95.46 over the last thirty days."* Checked against two outside sources within the minute: 95.20 from `open.er-api.com` and 94.91 from Google's own overview. **The test works because a weights-only answer would have been years stale** — the training-era rate is in the mid-eighties — so a confident invention and a real lookup are distinguishable here, which is precisely what this row said they were not in general. The thirty-day average is the second tell: that is read off a page, not recalled. Routing, forecast and search are all now proved from the phone. |
| The situation sent to the persona | — | Brain | Place, battery, link — one field. The highest character-per-line change available anywhere in the plan. |
| Opening an app on the phone by name | proved |  | Confirmed twice over: by `topResumedActivity` and by the target app’s own launch event. Needed a native build. |
| Governance: parked actions, approve and deny | proved |  | Desk actions only. |
| Desk-watch countdown, silence locks | proved |  | The desk owns the clock; the phone’s countdown is a readout, never a decision timer. Do not move it. |
| Scripts: list | proved |  |  |
| Scripts: create, update, delete, run by id | — | Brain | Which is why editing is disabled. |
| Run history | — | Brain | Reports currently invents “Last run: 2h ago” from a fixture. |
| Presence — awake but idle | — | Brain | Inferred from socket state today. |
| Declared rules (“tell me if I haven’t…”) | — | Brain | Spec written and awaiting review. Its presence half rests on a measurement that no longer holds. |
| Anticipation v1 — noticed when you open the app | proved |  | Decided in code from the journal against its own baseline and the next departure. At most one a day, never the same subject twice running, silent by default. **Device pass 2026-08-24:** the WATCHING panel read `2 OF 3 READY`, and its counters had advanced since 08-21 — `4 MORE DAYS` to `3 MORE DAYS`, and Today from `SPOKEN` to `LISTENING`. The day gate and the baseline counters are therefore working across days, not merely rendering. It was confirmed speaking on 08-21; whether a given remark is *worth* making is a separate question from whether the machinery runs. **Widened on 2026-08-28, and the budget was widened first.** Three triggers became seven — the app that moved past its own usual (`appDeltas`), being somewhere well before the hour you are usually there, being absent from somewhere you usually are by now, and a typed departure that no longer matches the hour you are measurably gone by. The enabler was `spokenStore` keeping **a day per subject** rather than one subject: with one slot and one remembered subject, every added trigger made the app *less* likely to say the useful thing, because a dull observation spent the day exactly as fast as a sharp one. Daily cap unchanged, quiet hours unchanged, every remark still quotes its own figure and refuses to speak below its day floor. **Absence is matched to the same weekday**, which is the gateway nudge bug written down as a rule. **Unproved on the device:** the new triggers have never fired on the phone, and the arrival one cannot fire before 08:00 at all, since the quiet hours start there. **The widened set was seen on the phone on 2026-09-01, 08:11**, the morning after it shipped: *"At Home early, sir — usually you are there by 10:49 AM."* That is the new `arrival` trigger (`hereEarly`), quoting the median it measured, `sir` spent once and lowercase, inside the quiet hours. **And it was WRONG, reported the same morning, which is the finding rather than the sighting.** He had been at Home all night and was leaving for the Office; nothing arrived, and 10:49 AM is not when he reaches Home. **Two defects, and the second one poisons the figure.** `hereEarly` never asks whether an arrival happened — it compares the clock against a median and speaks. And that median is not an arrival time at all: `noteSeen` writes a sighting whenever the app resolves a named place, so the first sighting of a day is the first time the app was OPENED there, which for the place you wake up in is unrelated to arriving. **The fix is that an arrival requires having been somewhere else** — at fire time, and in the baseline, which must count only days that began with a real arrival. `absentFrom` shares the flaw and the fix. **Rebuilt around routine and deviation, 2026-09-01, and unproved on the device.** The question is no longer "did you reach a place early" but "what is different about today", which is what the sighting log can actually answer. `usualPlaceAt` learns where he is on this weekday at this hour, from days rather than sightings so a morning of refreshing the app cannot outvote four Tuesdays. `leftEarly` is the sharp one and the shape he described — *the app knows I am at home till about 8:10 Mon–Fri* — and it fires only once he is demonstrably somewhere else, so it reports an observed departure rather than guessing at a quiet morning. `elsewhereNow` names where he usually is instead of observing where he is not. **`hereEarly` survives as the weak signal it always was**: it now requires a stay that began today and began somewhere else, and it times the ARRIVAL rather than the moment somebody looked at the phone. `usuallyHereBy` counts arrivals only — the old median was of first-app-opens, which is what produced 10:49 AM as a claim about somebody's own home. **The reported failure is pinned by a test**: at Home all night, leaving for the office, must stay silent. 66 tests across `timeline` and `routine`. **Weekends learn now, 2026-09-01.** History runs twelve weeks rather than four — four weeks is at most four Saturdays and the rules wanted four, so a weekend routine needed a flawless month and never formed — and where the exact weekday is still thin the routine falls back to the kind of day, weekend or weekday, never across the two. Only the most recent matching days are read, so a job left in July cannot argue with September.

**2026-09-02: found out why this row could never be proved, and it was not the triggers.** The phone read `Today: SPOKEN` — *"one remark a day, nothing more until tomorrow"* — over a chat log whose last entry was from the previous afternoon. **The remark was React state.** Drawn once at the top of the chat, written nowhere, gone the moment the tab changed. Ten days of a feature working perfectly and leaving no evidence: the machinery fired, the day was spent, and there was nothing left to look at.

It now lands in the log as his turn, deduplicated in the reducer because the focus effect runs on every return to the tab and the day marker is written after the remark. **That is what makes this row testable at all:** press CLEAR on the WATCHING panel, open Chat, and whatever he noticed is still there tomorrow.

Still `untested`, and now for the ordinary reason — nobody has watched one appear yet. The instrument exists.

**PROVED on the phone, 2026-09-02 at 12:58.** CLEAR pressed on the WATCHING panel from the laptop — the row went `2 OF 3 READY` / `Today: SPOKEN` to **`3 OF 3 READY` / `Today: LISTENING`**, and the control vanished, since there is nothing to clear once the day is handed back. Chat opened, and under a **Today** divider:

> **At Office early, sir — usually you are there by 11:51 AM.**  
> Jarvis · 12:58

`earlyRemark`, quoting its own figure, unprompted, **and still in the log afterwards** — which is the half that has never worked before.

**The figure is honest and its baseline is not yet.** *"Usually there by 11:51 AM"* is built from app-open arrivals, and he had been at the office since 10:03. Arrival times drift late for exactly the reason departure times drifted early: somebody has to pick the phone up. The geofence `enter` events fix it as they accumulate, and nothing needs writing for that.

**One thing was drawn twice.** The remark rendered as a blue header line AND as the logged turn, colliding with the newest bubble. The header copy is gone; the comment that argued for it — *a turn would claim he said it in conversation* — was reversed on the record, because volunteering something unasked is the whole feature. |
| Anticipation that finds you in your pocket | — | Brain | Needs the gateway push or a foreground service — the phone measurably cannot do it alone. |
| Anticipation from learned habit rather than a written rule | — |  | **Blocked by time, not by work, and the spec says so outright:** *"Two to four weeks of baseline before 'unusual' means anything, and the senses in §3.2 to notice with. No amount of code shortens the first."* (`docs/superpowers/specs/2026-08-21-anticipation-design.md`.)

**Two things worth separating, checked 2026-08-27.** First, *more triggers* is not this row. `anticipate-v1` has three — place, screen time, pickups — and a fourth is buildable today, since `rollup.ts` already computes `usual.top` per-app baselines beside `today.top`. That would be a fourth **hand-written rule over measured figures**, which the spec explicitly calls *not the same thing as a machine that learns your habits*. Building it strengthens `anticipate-v1` and leaves this row exactly where it is.

Second, and not previously recorded: **the baseline this row waits on is currently biased.** Sightings happen only when the app is opened (`timeline.ts` says so), so weeks of it would be weeks of a sample taken whenever he happened to look at his phone. So this is downstream of `ACCESS_BACKGROUND_LOCATION` in queue 23 as well as of the calendar — waiting three more weeks on the present sampling would not produce the baseline this row means. **2026-08-28:** the seven triggers now shipping are all rule-shaped and none of them shortens this. What did change is that four of them are measured against a baseline the phone builds itself, so the biased-baseline problem below is now load-bearing for more than one row: every sighting still needs the app to be open, which is queue 23 and background location.

**2026-09-01 changed what this is waiting for.** It was waiting for background sightings, which did not exist; those now exist and are measured rather than inferred. What it waits for now is **volume**: a median over twelve weeks of app-open sightings does not move because one honest day arrived, and the app should not be taught to prefer new data simply because it is new. Give it days.

The thing to watch for, and the reason this row is not just time passing: the figures will be **wrong in a specific direction** while the two kinds of sighting are mixed — app-open times drift late for departures and early for arrivals, and a median across both lands between two truths and matches neither. If it still reads wrong once the geofence data outnumbers the rest, the answer is to weight or drop the old sightings, not to wait longer.

**2026-09-02: the countdown is now visible on the phone rather than implied.** One measured departure (Monday, 7:08 PM). `leftBy` wants four distinct days, so this row turns over around Friday with no code — and the WATCHING row says so out loud while it waits, which is the difference between a feature that is counting and one that looks broken. |
| The circles, drawn to scale, on Home | proved |  | **Built and seen on the phone, 2026-09-01.** Asked for as a way to see the match radius and the overlap rather than be told about it: the named places to scale, the 120 m circles, the reading as a dot with its accuracy as a dashed ring, a scale bar, and a caption that says outright when two circles touch. `react-native-svg`, which was already a dependency, so it ships over the air — every real map on Android is a native module. **Only what is within 800 m is drawn**, and the rest is counted in the caption: fitting all ten named places put 150 m in a pixel and the circles rendered at under one, which is how it first appeared on the phone. **Road tiles and a 3D tilt were built here and removed on request the same day** — both worked; the tiles cost a watermark once CARTO wanted a key, and the tilt turned the circles into ellipses, which ruins the comparison the panel exists for. Confirmed on the device at the Office: two circles 700 m apart, not touching, with 8 places counted out.

**The dot moves now, 2026-09-02.** *"im not getting realtime GPS dot as seen on map"* — the panel took one cached fix when Home came into focus, which is right for *where am I* and wrong for watching yourself walk. `watchFix` follows the position every five metres while the tab is focused, stops when it is not, and never runs with location sharing off: a watch that outlives its screen is a background tracker nobody asked for.

It does not reverse-geocode. Naming a place is a network round trip and this fires every few metres, so the name stays on the slower cached path.

One thing that reads as a bug and is not: **the dashed accuracy ring breathes.** It is the fix's own error, redrawn live, and indoors it swings between roughly 10 and 60 m. Reported as *"gps circle going big and small"*. That ring is also what stops the app naming a place when it is wide enough to touch two of them. |

### Platform

*7 proved of 14.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| 19 screens, full suite and clean typecheck | proved |  | The number written in a doc goes stale — trust the run, not the comment. |
| Standalone release APK, no bundler attached | proved |  |  |
| Haptics, and an animation switch that works | proved |  |  |
| OTA updates | proved |  | **Verified 2026-08-24.** Channel Active, branch linked, runtime matching the installed APK, latest group is HEAD. A **local** build still receives nothing unless the fingerprint is baked by hand — `prebuild` writes the literal placeholder and nothing logs a word about it. |
| Contrast checked against WCAG AA | proved |  | 4.78 over the floor and 4.68 over the navy crown, against a bar of 4.5. |
| A theme choice that did nothing — removed | proved |  | Dark and System were identical. A setting that does nothing is worse than an absent one. |
| arm64-only build | proved |  | A config plugin, registered — so `prebuild` cannot silently revert it, which is this project’s most expensive recurring bug class. Roughly 35 MB against 100.7 MB across four ABIs. **The old ledger listed this as owed; it is done.** |
| Motion defaulted from the OS | untested | Phone | Implemented at `src/theme/appearance.tsx:89` and spied on in a test; a deliberate toggle outranks it permanently. **The old ledger called this untested for want of code; it has code and a test, and owes only a device pass.** |
| Light theme | broken | App | Broken by design — “System” behaves identically to Dark. Decide or remove. |
| Appearance surviving a launch | untested | App | **Built 2026-08-31 and never launched on the phone.** `src/theme/appearanceStore.ts` keeps accent, glow and motion in AsyncStorage; the provider reads them once through `live()` and only writes after that read, so an empty disk cannot overwrite the real look during the first render. **Motion is tri-state on disk and that is the whole subtlety:** `null` means the switch was never touched and the OS keeps deciding, so a stored look cannot silently override reduced motion for somebody who asked their phone for less of it. 12 tests. The row claimed this for days while it was in-memory, which is why the claim now names the file. **The bundle carrying this landed on the phone at 18:42 on 2026-08-31** (update `01a057f3`, runtime `31c64113`), so this is now testable rather than theoretical — Settings → Updates reads the publish time, and Diagnostics is visible in the Settings list. |
| Crash and error reporting | untested | App | **The JavaScript half is built, 2026-08-28, and has never run on the phone.** `src/lib/crashLog.ts` keeps a derived record — name, message, redacted frames, and which build it happened on — five deep in AsyncStorage. `ErrorBoundary` writes the render crash it already displayed, and `installCrashHandler` wraps the global handler for everything outside render, calling the one it replaced so the app still dies exactly as it would have. Settings → Diagnostics reads them back, copies a report, and carries a count of what has not been looked at. **Redaction has a test per rule**, because an error message quotes its own input: a parse failure on a gateway frame would otherwise carry that frame — token and chat text included — into the one store whose purpose is to be pasted into a chat window. **Unproved on the device, and shippable over the air** — the runtime is still `31c64113`, checked after the change. **The native half is unchanged and still owed:** a native crash takes the process with no JS involved, so nothing here sees it; that is a service and a build, and belongs to queue 23. |
| A real release keystore | — | App · build | Signed with Expo’s generated debug keystore, which is why a local APK and an EAS-signed one cannot replace each other. |
| Screen-reader pass | — | Phone | Targets are floored at 44–64px and roles are set; nothing has been checked with TalkBack. |
| Tablet and landscape | — | App | Locked to portrait. The reactor and the 2×2 grid need a breakpoint before a tablet is claimed. |

<!-- END GENERATED: ledger -->

---

## 0c. What would make it a complete app

<!-- BEGIN GENERATED: criteria -->

*Generated from `docs/status/ledger.json` by `node scripts/build-status.mjs`. Do not edit by hand.*

Not a wish list — the shortest set of things whose absence makes the app
*incomplete* rather than merely unfinished.

**Nothing may be `untested`.** A feature nobody has ever used is a claim, not a
capability.

**0 of 10 are met.** 6 are partly met. **5 need `jarvis-brain`**, so the app repo alone tops out at 50% of this list.

| | Criterion | Status | Blocked on | Why it is not met |
| --- | --- | --- | --- | --- |
| 1 | **Every state names itself** | partial | Brain | Already the rule, and the two live defects are both what happens when it slips. A silent failure in a security path is a security failure. One defect is fixed in the app; the other is fixed in the brain and undeployed. |
| 2 | **No feature arrives twice or lies once** | partial | Brain | The anti-duplicate gate is built and its decision carries tests; no departure window has run yet. The false Saturday remark is fixed in the brain as c86d176 and not deployed. |
| 3 | **He can be reached without the app being opened** | partial | Phone | Push is proved — it buzzed. `BOOT_COMPLETED` turned out to be granted already, measured on the installed APK rather than on the app half of the manifest, so reboot survival is a check rather than a build. The phone fallback was found unarmed on 2026-08-26 and now reads its registration back, records why it failed and repairs itself from Places. What is left in this repo is the notification listener, which is gated by criterion 7; everything else on this criterion is a phone in hand. |
| 4 | **He speaks and he listens** | — | Phone | The microphone has never been exercised — the oldest unverified thing here. Voice out is not built at all, and until both land this is a beautifully themed text box. |
| 5 | **He knows where and when he is** | partial | Brain | One field on the persona envelope, and it is a gateway change — the roadmap calls it the most character per line of code in the whole document. **That sentence was written when the phone had nothing worth putting in the field.** It does now.

**Six of the nine rows under this goal are proved, and the two that closed on 2026-09-01 are the ones that change what he can know.** Until then every sense of time this app had came from sightings written when somebody happened to open it, so *where and when* meant *where you were when you last looked at your phone*. It now means the boundary of a named place being crossed with the app closed: **Left Office 7:08 PM** against a man who leaves at seven, and a whole commute the next morning — Home 8:06, Barrackpore 8:41, Sealdah 9:31, Sector V 10:03.

**What is left is three things, and only one of them is the brain.**

1. `places` is `partial` on one specific question — two named places 150 m apart whose circles overlap. Everything else about naming is proved.
2. `anticipate-v1` is written and shipped and nobody has watched a remark appear.
3. `anticipate-habit` is not blocked any more, it is **waiting for arithmetic**: twelve weeks of app-open sightings still outvote one day of measured ones, and no code changes that. Days, not work.

`situation-block` is the gateway half and is untouched. The difference is that it is no longer the only thing standing between here and this criterion — it is now the last mile of a road that has been built. |
| 6 | **Memory survives a deploy** | — | Brain | Rolling memory is in Postgres rather than RAM, but deploy-durable state is committed and undeployed. Render's disk goes on every deploy, and that has silently disarmed the briefing twice. |
| 7 | **A compromised token does not expose a life** | — | Brain | One string still gates the socket, push, the commute route and app state alike, and nothing expires. A gate on the senses, not a follow-up: once data has been collected badly, no later fix un-collects it. |
| 8 | **A crash is visible** | partial | App | Shipping a fix within the hour is solved — the OTA channel is verified as of today. Seeing the crash at all is not: a crash is silent, and adb logcat on the one machine that built the APK is the only diagnosis. |
| 9 | **A second device is possible** | — | App · build | Signed with Expo's debug keystore, which is why a local APK and an EAS-signed one cannot replace each other. Fine for one phone, not for the second. |
| 10 | **It is usable by someone who cannot see it well** | partial | Phone | Contrast is measured and passing at 4.78 and 4.68 against a 4.5 bar; reduced motion already defaults from the OS. Nothing has been checked with a screen reader. |

<!-- END GENERATED: criteria -->

Ten items, and the count of what stands in front of each is above rather than
estimated. Six are hours, three are a build, one is a spec of its own.

---

## 1. Owed before anything new

Unchanged from `NEXT.md`, because neither has been done.

1. **`run_harnesses.py` on the desk.** Never run. Expect **81 + 4 `/app-commute`
   + 8 reasoning-leak + 17 vision-marker + 17 durable-state**. Five days of gateway
   work has never been executed by a Python interpreter with the real imports —
   this laptop has no Python (`python` opens the Microsoft Store), and the
   standalone checks cover logic, not imports. A `_load_commute()_load_commute()`
   SyntaxError already slipped through once and was caught by reading.
2. **Merge `fix/durable-state`** into `feat/cloud-gateway`, then deploy. Until then
   every deploy silently disarms the briefing, which has already happened twice.
3. **The desk-key handshake, and rotate `BRIDGE_SECRET` in the same sitting.** The
   handshake is the only item whose cost grows while deferred. The old secret went
   through Render's access log before redaction landed and still opens `/desk-link`;
   a fake desk was connected with it repeatedly during testing. Both need the desk
   on, so do them together rather than waiting for the desk twice.
4. **Speak into the microphone.** Chat → hold → speak → release, then read
   `brains.usage.audio`. If it reads `fell_back` with `last_error_was_quota: false`,
   the mime type is wrong: the phone records m4a and Google documents `audio/aac`,
   not `audio/mp4`. One line, and it is the complaint that started the feature.

**The trap that blocked the last attempt:** `adb` can wake the display but cannot
unlock it, so the app launches behind the keyguard and never foregrounds.
`apps_linked: 0` in that state means nothing. Unlock the phone by hand first.

---

## 2. Open, diagnosed, not yet fixed — 2026-08-21

### 2.1 The briefing arrives twice

Two senders build the same string and neither knows about the other:

| | Posts | Marker | Window |
| --- | --- | --- | --- |
| Phone | `commuteTask.ts:161` `postNow` | `jarvis_commute_sent` (AsyncStorage) | ±30 min (`DUE_WINDOW_MIN`) |
| Gateway | `cloud_gateway.py:2386` `_push_all(force=True)` | `_briefed` (json + Postgres) | target → +20 (`COMMUTE_FIRE_WINDOW_MIN`) |

`cloud_gateway.py:2352` emits `f"Before you leave {label}, sir"` — byte-identical
to `commute.ts:390`, deliberately, so the shade cannot tell them apart.
`push_targets: 1`, so it is not a double registration.

Why it appeared on 08-21 and never before: **Home was named the night before.**
Before that both senders refused it — `coordsFor` found no `KnownPlace` and
returned `Failed`; `commutePayload` dropped the row (`if (!at) continue`). Naming it
armed both at once, and `/health` went from `departures: 1` to `2`.

The old roadmap's §5 said *"keep the local task as a fallback"*. It was never gated,
so it was a second sender rather than a fallback.

**Built and shipped 2026-08-21, seen on the phone.** `cloudArmed` / `markCloudArmed` in
`lib/commute.ts`: a successful `syncCommute` stamps the clock, and the task declines
to post while that stamp is under `CLOUD_TTL_HOURS` (48). Gateway armed → phone
silent; gateway stale, unreachable or never uploaded → phone posts, because a
duplicate is an annoyance and a silent morning is the feature not existing.
`previewBriefing` untouched. Checked before the forecast, so a run that cannot post
does not spend a headless task's network budget.

*Covered since 08-21:* the task body now runs in tests — `defineTask`'s callback is
captured at import and invoked, with the real `commute.ts` and only `fetch` stood in
for. Ten cases, including the gate standing the task down, the gate being checked
*before* the forecast, the stale-stamp handover, and the `unavailable` path not
consuming the day. The two gate cases were confirmed to fail with the gate removed.

*Still owed:* the provider calling `markCloudArmed` on a successful upload. Two
attempts failed for reasons that look like state left by earlier tests in
`jarvisProvider.test.tsx` that never unmount — noted at the foot of that file.

**A limitation the panel made visible within minutes of shipping.** `markCloudArmed`
is written only on a successful `syncCommute`, and that runs on a **cloud** connect
only — `api.syncCommute` is a gateway route and the effect returns early on LAN. So a
run of LAN-only sessions ages the stamp past `CLOUD_TTL_HOURS` and the phone takes the
briefing back, even though the gateway may still hold the schedule perfectly well. The
stamp is honest about what the *phone* knows, not about what the gateway holds. Worth
either stamping on any successful upload regardless of transport, or naming that row
`unknown` rather than `off` once the stamp is merely stale.

*Confirmation still owed on the phone:* leave both unswiped at a window and read the
tags — the pushed one carries `tag=FCM-Notification:*`, a local post does not.

### 2.2 He asserted a Saturday shift on a Friday

`_nudge_subject` (`cloud_gateway.py:2474`) decides whether to speak with

```python
named_day = weekday in low
```

a bare substring test for today's weekday name anywhere in a stored fact. A fact
mentioning Friday only as a boundary — a Mon–Fri work pattern — matched, and the
prompt then asserts it: *"Something you were told about him is true TODAY."* The
model obeyed and invented tomorrow's shift to make a remark out of it. On the
device:

> **J.A.R.V.I.S.** — It's Friday, Sir, so hopefully you won't have to head in for
> a Saturday shift tomorrow.

The comment above that function claims *"the judgement of WHETHER to speak is made
here, in code"*. A substring is not that judgement. **Fix:** require recurrence
wording (`every friday`, `fridays`, `on friday`), and refuse a fact that names a
weekday other than today unless today's is the one being asserted. `dated` has the
same class of false positive.

Also: that body says `Sir`, capitalised. The voice rule — `sir` is punctuation,
lowercase, spent once — is enforced in `commute.ts` and `_briefing_text` and was
never applied to the nudge path.

---

## 3. The superpowers — what it takes to be J.A.R.V.I.S.

*Asked for 2026-08-21: what superpowers the app should have, security-wise and
autonomy-wise, so that it is the thing from the film rather than a themed chat app.*

The film's JARVIS is not a better chatbot. Strip the cinema and he has **six**
properties, and they are separable — which matters, because this app already has
two of them and can be built toward the rest one at a time.

| | Property | Where this app is |
| --- | --- | --- |
| 1 | **Always there.** No launching, no waiting, no blank field | Partly. He greets with the real situation; he still has to be opened |
| 2 | **Knows the situation** without being asked | Thin. Time, place, link state. Nothing about the day |
| 3 | **Remembers**, as one presence across every surface | Built, barely surfaced. 14 facts, `_memory_key` shared |
| 4 | **Volunteers** — and is quiet when there is nothing | Just started. One nudge a day, and its first one was wrong |
| 5 | **Acts** on the world, with judgement about what needs asking | Real but narrow. Desk control, scripts, governance |
| 6 | **Speaks and listens** | Neither. The mic is untested; there is no voice at all |

The rest of this section is those six, in the order that makes each one cheaper
than it would have been alone.

### 3.1 Presence — being there without being opened

The measurement that governs all of this is in §7: **this app cannot run work in
the background on this phone.** `expo-background-task` hardcodes
`setRequiredNetworkType(NetworkType.CONNECTED)` and the uid reads
`blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY` with `#netAvail=0` in a RARE
bucket. Not deferred — stopped. Everything below is chosen around that fact.

| Mechanism | What it gives | Battery | Real cost |
| --- | --- | --- | --- |
| High-priority push | reaches a dead app, exempt from the above | free | needs the gateway to know *when* |
| `NotificationListenerService` | every notification from every app, live | ~free, event-driven | Play-fatal, one build |
| `BOOT_COMPLETED` | survives reboot | free | none |
| SMS receiver | wakes the app **from dead** | ~free | Play-fatal |
| Foreground service | process always alive | real, measurable | permanent notification |
| `ACCESS_BACKGROUND_LOCATION` | continuous place awareness | significant | needs the service |
| `AccessibilityService` | every window, every string on screen | low | maximum invasiveness |

**The best value is not the obvious one.** `NotificationListenerService` is
event-driven, costs nearly no battery, and delivers more context than any amount of
polling: the message, the offer, the debit, the missed call. It is ahead of the
foreground service and well ahead of accessibility. Sideloading removes the only
real gate, and this app is already sideloaded.

Sequence: push (done) → `BOOT_COMPLETED` (free, do it with the next build) →
notification listener (the step change) → foreground service only if real use
proves the listener is not enough → accessibility, probably never.

### 3.2 Senses — knowing the situation

Ordered by what each unlocks, not by effort.

1. **Send what the phone already knows.** **Rewritten 2026-08-27, because most of what
   this item asked for has quietly shipped.** `buildAsk` already carries the local clock
   with its offset and weekday, the named places, and a `where` block — coordinates, the
   resolved place, the label set by standing there, measured weather, and a trail of
   recent steps. The deployed gateway reads all of it and puts *"He is currently at
   Office"* and the trail into the prompt. Proved from the Office on 2026-08-27:
   *"how far to home"* answered 39.3 km and 38 minutes, measured from where he stood.
   **What is still missing is battery and link state**, and both are smaller than this
   item used to claim. **What is worse than missing is the `usage` block:** screen time,
   pickups, top apps and their baselines ride on *every* question and **nothing reads
   them** — not the gateway, not the desk. Those figures do reach the persona, but by the
   other road, as facts written through `/app-fact`. So the work here is: decide whether
   the gateway should read `usage` or the phone should stop sending it, and add battery
   and link. Battery needs `expo-battery`, which is a native dependency and therefore a
   new build rather than an over-the-air fix.
2. **Location timeline** — arrival and departure at named places, into the journal.
   The prerequisite for anything that reacts to *where he is*.
3. **Notification stream** — see 3.1. Turns "what is happening today" from a guess
   into a fact, and it is the sense the film's JARVIS most obviously has.
4. **Call log** (`READ_CALL_LOG`) — the literal rule that was asked for. Native, one
   build, and it bars the app from Play permanently. Fine while sideloading.
5. **Archive import** — Google Takeout, Meta DYI. Years of history in one file.
6. **Screen content** (`AccessibilityService`) — listed for completeness and
   deliberately last. It reads banking screens. The data-handling cost is not worth
   what it adds over 3.

### 3.3 Memory — one presence, not three copies

`_memory_key` already makes desk, phone and Telegram one conversation. What is
missing is that memory being **durable** and **spoken**:

- Rolling memory out of process RAM (§1.2 covers the mechanism; Supabase already
  carries the facts and survives restarts).
- **Send the chat history.** The log is local-only (`chatStore.ts`) and the envelope
  carries exactly one turn, so the brain reasons from a memory the phone could have
  handed it.
- **He remembers out loud, occasionally.** `facts_known: 14`, volunteered once —
  wrongly (§2.2). Storage that never surfaces is indistinguishable from no memory;
  storage that surfaces carelessly is worse than both. The judgement stays in code.

### 3.4 Volunteering — the autonomy ladder

Autonomy is not a switch, and the film's JARVIS sits on different rungs for
different things: he *reports* a suit diagnostic, he *asks* before a protocol, he
*acts* alone on a countdown. The same ladder, and this codebase already has
machinery for four of the five rungs:

| Rung | He… | Machinery | Where it stands |
| --- | --- | --- | --- |
| 0 | answers when asked | `sendCommand` | done |
| 1 | reports what changed | briefing, `_nudge_tick` | done, and §2.2 is what rung 1 gets wrong |
| 2 | **asks** rather than asserts | declared rules | spec written, `docs/superpowers/specs/2026-08-20-declared-rules-design.md` |
| 3 | acts, then reports, reversibly | `governance.json`, `hud.parked` | built for desk actions only |
| 4 | acts on a deadline, silence consents | desk-watch countdown | built, and the only rung 4 thing here |

**Rung 2 is the next one to build, and the spec is written.** Two shapes that do
not share an evaluator: *absence* ("tell me if I haven't called mom by 7") is a
clock question and the gateway owns it, because the phone cannot be trusted to
wake; *presence* ("when I open Swiggy, tell me what I can eat") is a phone question
carried by the background task.

**The presence half is on weaker ground than the spec assumes, measured
2026-08-21 12:21.** Its argument was that a blocked job unblocks while the phone is
in a hand — bucket at `10`, network up. Two hours after the app was opened and used,
the bucket reads `40` again and `WITHIN_QUOTA` has joined `CONNECTIVITY` as an
unsatisfied constraint. §7 has the dump. So "0–15 minutes and sometimes missed" is
optimistic; the honest version is **sometimes, and never on a schedule you can
promise a user.**

That does not sink rung 2, it moves the line: state a presence rule as best-effort
in the UI, or carry it on the foreground service rather than the periodic job.
Deciding which belongs in the spec review, not here — but the spec should not be
approved on the old measurement.

He **asks rather than asserts**, and §2.2 is the proof of why: the phone's
information can be stale, a question is true either way, a redundant question costs
a shrug, and a confident false accusation is what teaches someone to mute an
assistant. *"Did you get a chance to call your mother?"* — never *"you did not
call."*

Rung 3 is where the interesting work is after that: today governance covers desk
actions and nothing the phone does on its own. Anything the phone learns to act on
needs the same parked-approval path, not a new one.

**Anticipation** — the thing actually asked for at the start — is rung 3 with the
rule learned instead of written. It needs 3.2's senses beneath it and two to four
weeks of baseline before "unusual" means anything. Declared rules first, because
they are the same trigger machinery with the rule written by hand.

### 3.5 Acting — and the weekly portrait

- **Script CRUD.** `/api/tasks` lists; there is no create, update, delete or
  run-by-id, which is why Script Details' EDIT is disabled.
- **Run history** — outcomes and durations, so Reports stops inventing "Last run:
  2h ago" from a fixture.
- **The weekly portrait.** Batch analysis over the journal, no new permission.
  **Wait for data** — the facts pipe starts speaking after 7 completed days and
  this wants more.

### 3.6 Voice — and why it stays last

**He does not speak, and it is the largest single gap in the app.** Deferred by
choice on 2026-08-20 ("talking we do at last"), and the ordering holds:
`expo-speech` needs a native build, and 3.1–3.4 all make the voice better when it
arrives rather than being made redundant by it. A voice reading a blank greeting is
still a blank greeting.

The rule is settled and should not be relitigated: **he speaks when you spoke, and
stays quiet when you typed.**

---

## 4. Security — the part that is actually the work

The Android side of §3 is a weekend. **The part where a compromised token does not
expose someone's entire life is the work**, and it has to land *before* the senses,
not after. A notification listener sees OTPs, balances and private messages; an
accessibility service can read a banking app's screen. Once that data has been
collected badly, no later fix un-collects it.

### 4.1 Do these before any new sense ships

1. **Split `APP_TOKEN`.** One string currently gates the socket, push registration,
   `/app-commute` and `/app-state` alike. A token that can register a push and a
   token that can read your day must not be the same secret. Split by capability,
   and give the read-your-day half a shorter life.
2. **Raw never leaves the phone.** Not notification text, not screen content, not
   SMS bodies, not call rows. Only derived facts: booleans, counts, aliases. The
   journal already works this way (`shareFacts` sends a rollup, not rows) — that is
   the pattern to copy rather than reinvent.
3. **Never logged, not even truncated.** A log line is a permanent copy in someone
   else's system. Render's access log already cost this project a secret rotation.
4. **OTP and financial content dropped at the point of capture**, not filtered
   later. A filter downstream of storage is a filter that has already failed once.
5. **Finish the desk-key handshake.** 18 sealed turns dropped so far. Sealed-and-
   dropped is the correct failure and it is still a failure: it means the encrypted
   path has never once worked end to end, so nothing is known about it.

### 4.2 The threat model this app actually has

Written down because it is small, and the small ones are the ones that get skipped:

- **A stolen phone.** Answered: biometric lock, re-locking on every background,
  `strong` biometrics only (`BIOMETRIC_WEAK | DEVICE_CREDENTIAL` is rejected
  outright by Android — always request `strong` or no sheet appears and the promise
  never settles).
- **A stolen token.** Partly answered: rotation works and is verified. Not
  answered: one token does everything (4.1.1), and nothing expires.
- **A fake desk.** Currently open to anyone holding `BRIDGE_SECRET`, and that value
  has been through a log. §1.3.
- **The gateway being read.** Facts live on Render and Supabase. Derived-only (4.1.2)
  is what limits the blast radius, so it is a security control and not a design
  preference.
- **Someone at the desk while you are not.** Answered, and it is the one rung-4
  autonomy in the app: the desk owns the countdown and **silence locks**. The
  phone's countdown is a readout, never a decision timer. Do not move that clock.

### 4.3 Rules that are already load-bearing

- **Every state must name itself.** It came up five times on 2026-08-19 and it is a
  security property as much as a UX one: the briefing that never ran and the
  briefing that ran and found nothing to say were indistinguishable from outside,
  which let a wrong hypothesis stand for a day. A silent failure in a security path
  is a security failure.
- **A recovery gated on a WebSocket is not a recovery.** The phone re-uploads its
  schedule on `link.status === 'open'`, but a photo answers over plain HTTP — so the
  app can look connected while the gateway can reach nobody by push.
- **`unavailable` stays silent.** Announcing "all clear" when a lookup failed is the
  one genuinely dishonest message this app could send.

---

## 5. Making it feel like him — chat and costume

Both ship over the air. Neither adds capability, and that is why they are here
rather than in §3.

### 5.1 The chat, as a chat

1. **Sent / delivered / read ticks.** The phone knows *sent*. Only the gateway can
   say *delivered* and *read*, and it says neither: an id on each outgoing ask
   echoed back, a frame when the answer is written to a socket, another when the app
   reports the chat on screen. `ChatEntry` grows a state. **Not OTA** — protocol
   both sides. The largest fully-specified thing left.
2. **Reply-to-a-message.** Quote the turn being answered. Cheap on screen, and it
   needs the same per-message id the ticks do — so do it after 1 rather than
   inventing a second identity for a message.
3. **A photo in flight must say so**, and a photo that failed must stay recoverable
   with its caption attached. The preview and caption shipped; these two did not.

4. **A status box on Home, beside Reports.** — **BUILT 2026-08-21.** `lib/status.ts`
   holds the pure logic (20 tests), `components/StatusPanel.tsx` renders it (6), and
   Home gathers the facts. Eight rows: the desk, the link, the pairing token, whether
   he can reach you by push, where the briefing schedule lives, location sharing,
   usage access, the app lock.

   Four states rather than two — `on`, `off`, `waiting`, `unknown` — and the last one
   is the point: push registration refused and push registration never attempted are
   different facts, and one red dot for both sends someone hunting a fault that does
   not exist. What is wrong sorts to the top; the caption counts only what is
   genuinely off.

   Two things it cost to learn, both now written at the site: a synchronous
   `setState` inside `useFocusEffect` loops forever under this repo's screen-test
   mock, which calls the callback during render; and these source files are **CRLF**,
   so a patch matching on `
` fails silently.

   *Was:* one row per thing
   the app depends on — the desk, the cloud gateway, push registration, the commute
   schedule the gateway holds, location sharing, usage access, the app lock — each
   with a pulsing dot: green when it is there, red when it is not.

   **Why it is worth more than it looks.** Today "what is actually connected" is
   spread across the Connection screen, the transport pill, `/health` and nothing at
   all, and the answer a user can give a developer is "it did not work". This turns
   that into a screenshot naming the thing that is off. It is the same instinct as
   the rule this codebase keeps relearning — every state names itself — applied to
   the seams rather than to a feature.

   Getting it right while building it:
   - **A dot must never be the only signal.** Red/green is the one distinction a
     colour-blind reader cannot make, so the row needs a word — `OFF`, `WAITING`,
     `ON` — and the dot is the glance. `CapabilitiesScreen` uses a filled/hollow
     glyph for the same reason; reuse that rather than inventing a second language.
   - **Unknown is not the same as off.** Push registration with no answer yet, and
     push registration refused, are different facts. A third state, or a plain
     "not asked yet", rather than a red dot that means either.
   - **A pulsing dot on every row is a frame budget**, on a screen that already
     holds the reactor and the vitals panel. One worklet driving all of them, and it
     must respect the Appearance animation toggle.
   - **It must be readable with nothing connected at all**, which is exactly when it
     will be looked at. So it is assembled on the device like `lib/situation.ts`,
     never fetched.

   *Touches:* `src/screens/HomeScreen.tsx`, a new panel component, and whatever the
   provider already exposes — most of these facts are on the context today. Ships
   over the air.

### 5.2 The Iron Man styling pass

*Asked for 2026-08-20. Scope is styling. The logo does not change and no copy
changes.* If a change alters what a screen *says*, it belongs in §3 or §5.1.

The pieces are here and under-used: `ArcReactor.tsx`, `Glass.tsx`, `glowText` /
`glowBox`, the reanimated pulse in `GlassTabBar.tsx`, `TypeLine.tsx`,
`LoadingBar.tsx`, `Meter.tsx`, `StatusStrip.tsx`. Mostly this is applying them
consistently and adding motion where a state currently changes instantly and
silently.

Where the effects earn their place: a reactor spin-up on cold start and
`ReactorHandoff` on every link transition, not just the one it has; corner brackets
and hairline reticles on `Panel` and `Card`, with edge glow tracking `hud.status` so
the frame *is* the status indicator; `TypeLine` on arriving replies and briefings
only; a live amplitude waveform on `VoiceBar`; sweeping needles with trailing decay
on `Meter` and `VitalsPanel`; a ring pulse from the contact point on `Touchable`,
paired with the haptic that already fires. Sound, if at all, behind a setting
defaulting off — easy to love in a demo and hate on the fourth day.

**Constraints, every one of which has already cost time:**

- **Do not mount `BlurTargetView`** — it segfaults the RenderThread. Full tombstone
  in `Glass.tsx`. Whatever the design wants, it cannot want that.
- **`shadowColor` / `shadowRadius` are iOS-only.** Android glow needs SVG opacity
  and stroke width, or `textShadowRadius`. `elevation` draws a grey shadow and
  reorders siblings. This is why the Appearance glow slider felt inert.
- **No default parameters inside a worklet.** The closure is built from identifiers
  in the body, so a default compiles, passes jest, and throws once per frame on the
  UI thread.
- **Effects must not become the only signal** — §4.3, first bullet.
- **Budget the frame.** A scanline, a grid, a glow and a sweep on one screen is a
  dropped-frame budget on a phone also holding a socket and a journal. Measure on
  the device.
- **Respect the Appearance controls and reduced motion.**

How to do it without a month of drift: Home first, because it has the reactor, the
status strip and the vitals panel. Land it, look at it on the phone for a day, then
propagate through a shared `hud` styling layer rather than per-screen decoration.

#### Liquid glass on the Android tab bar — the last thing on this list

*Asked 2026-08-21.* Real backdrop blur behind the rounded tab bar, rather than the
heavy tint standing in for it.

**The arrangement is the whole thing, and it is already written.** `BlurBehind`
in `Glass.tsx` takes `content` and `surface` as separate slots: the target wraps
only the content, and the blurring surface is its **sibling**. A tab bar is that
shape for free — react-navigation renders `tabBar` outside the screen content —
and `GlassTabBar.tsx:329` already mounts the `Glass` that would sample it. The
missing half is wrapping the screen area in the target and flipping
`TRY_SCOPED_ANDROID_BLUR`.

**Do not reintroduce the whole-app `BlurTargetView`.** That is the shape that
segfaults the RenderThread: the target contains a view whose content is the
target, and HWUI's transform walk never terminates. Tombstone in `Glass.tsx`.

*Cost:* no new package — `expo-blur ~57.0.2` is already a dependency — so it
ships over the air. *But it cannot be verified by a test run:* the failure mode is
a segfault with no JS error, so flipping that const needs a phone and
`adb logcat` watching for `F DEBUG` frames in `libhwui.so`. Budget the frame too;
a blur behind a bar that also pulses is measured on the device, not assumed.

Ordered last deliberately, and asked to be
(2026-08-21). It is the one item here whose downside is the process dying rather
than a screen looking wrong, it changes nothing about what the app can do, and every
other item in §5.2 is reversible by reading a diff. It goes after the styling pass
has landed and been lived with.

---

## 6. Platform debt and blocked work

### Blocked on the desk or the gateway

Collected so the backend can be scoped in one pass. Script CRUD and run history are
in §3.5; the rest:

> **`jarvis-brain` is closed as of 2026-08-26** — deliberately not being touched. The 19
> ledger rows and 5 queue items blocked there, and the two device-visible defects that are
> already fixed-but-unshipped, are collected in `docs/brain-dependencies.md`, generated
> from the ledger by `node scripts/build-status.mjs`. Do not re-diagnose them from the app
> side, and do not edit that file — edit the ledger.

- **Presence**, so the app can say the desk is awake but idle rather than inferring
  it from socket state.
- **A paid routing key.** Routing is OSRM's public server, which knows the road
  graph and not the road, so durations are free-flowing and the context says so.
  `_route_blocking` / `_route_to_blocking` are the only functions that change.
- **Desk-watch, desk side.** Phone half done; `docs/desk-watch.md` holds what is
  owed.
- **`LLM_PROVIDER_VISION=gemini` is dashboard-only**, undeclared in `render.yaml` —
  the trap that file's own comments warn about. Declare it or set vision to `groq`.

### Cheap now, expensive to discover later

- **Crash and error reporting.** Owed before any external tester, and more urgently
  than that: a native crash here is silent, so the only diagnosis is `adb logcat` on
  the one machine that built the APK.
- **Confirm the OTA channel — VERIFIED 2026-08-24.** `eas channel:list` answers
  `production`, ID `01a01a04-f0d6-7718-90dc-dbae6930b0db`, Active, with one branch
  (`production`, android) pointed at it. Runtime
  `31c64113d7d13a400eb1c56ef81c4d0d4be3fa17` — byte-identical to the fingerprint the
  installed APK carries, so a JS-only publish does reach the phone and the fingerprint
  trap is not currently armed. Latest group `f196158c-c588-4dac-9c05-4468e0b7428d`,
  which is `b33b110`, so nothing local is waiting to ship. JS-only work ships with
  `eas update --branch production --environment production --platform android`. The
  fear was an empty channel — the app asks and gets nothing, silently. It is not
  empty.
- **A real release keystore.** Release is signed with Expo's generated debug
  keystore, which is why a local APK and an EAS-signed one cannot replace each
  other. Fine for one phone, not for the second. `android/app/build.gradle:112`.
- **Render keep-warm, or accept the wait.** Free tier spins down after 15 minutes
  and the first message pays ~50s. The cloud probe timeout is already 8s, so the
  first probe after idle misses and the next tick catches it — by design.
- **The journal's denial path has never been run.** Settings → Journal → usage
  access off → return. It must say *"I cannot see your usage"*, never *"Nothing
  recorded"*.
- **Light theme: decide or remove.** "System" behaves identically to Dark. A setting
  that does nothing is worse than an absent one.
- **Accessibility pass.** Targets are floored at 44–64px and roles are set, but
  nothing has been checked with a screen reader, and `COLOR.dim` on `COLOR.panel`
  needs a contrast audit. Default reduced motion from
  `AccessibilityInfo.isReduceMotionEnabled` rather than making the user find it.
- **Default the local build to arm64.** The universal APK is 100.7 MB across four
  ABIs with `minifyEnabled false`; arm64-only is ~35 MB and the phone is arm64.
  Consider moving this and the 6144m jvmargs into `expo-build-properties` so both
  survive `prebuild --clean` — that reset has cost time twice.
- **Tablet and landscape.** Locked to portrait; the reactor and the 2×2 grid need a
  breakpoint before iPad is claimed.
- **The window label prints whole hours**, so a 6:30 PM departure reads
  `(6 PM–9 PM)`. `hourLabel(d.hour)` ignores minutes. Matched on both sides rather
  than fixed on one.
- **`surface="desk"` is unreachable.** A linked desk answers with its own brain, so
  `think()` is never called there. Harmless.

---

## 7. The measurement everything is built around

Kept in full. It is the reason the briefing moved to a push, and it is what tells
§3.4's presence rules what they can expect.

The hypothesis this once carried — a throttled job overrunning its budget — is
**wrong**. The 08-19 reordering fix worked; the quota was never what was left.

Read from the device, uid `10495`, before the app was opened:

```
timeout-reg:   countLimit=3,  countInWindow=0
timeout-total: countLimit=10, countInWindow=0
UID: 10495; Network: 108 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)
UidStats{uid=10495 #run=0 #netAvail=0 #reg=0}
standby bucket: 40   (RARE)
```

`countInWindow=0` closes the throttle theory. `#netAvail=0` opens the real one:
**network has never once been available to this task.** `expo-background-task`
hardcodes the constraint that makes that fatal —
`BackgroundTaskScheduler.kt:108`:

```kotlin
.setRequiredNetworkType(NetworkType.CONNECTED)
```

Not configurable, applied to every run. The work sits `ENQUEUED` on a constraint
Android will not satisfy for a RARE-bucket app in the background.

Caught in the act, launching cold at 10:20:45:

```
10:20:45.316  BackgroundTaskWork: doWork: Running worker
10:20:45.339  runTasks: com.mypersonalintelligence.jarvis
10:20:47.409  Finished task 'jarvis-commute-briefing'
10:20:47.411  Enqueuing worker ... '15' minutes delay
```

It ran **200 ms after launch** — the moment the network restriction lifted — then
queued the next one for a window it will be blocked in again. The bucket read `40`
before that launch and `10` after.

**Why this inverts for presence triggers.** The briefing failed because it had to
run while the phone sat idle in a pocket. A presence trigger happens while the
phone is in a hand: screen on, network up, bucket at `10`. Those are exactly the
conditions under which that blocked job unblocks. Plausible, not dependable —
WorkManager's floor is 15 minutes, so a four-minute browse can fall between runs.
That is the trade §3.4 accepts for v1.

### Read again 2026-08-21, 12:21 — and it has got worse

Two hours after the app was opened and used:

```
Required constraints:    CONNECTIVITY FLEXIBILITY
Satisfied constraints:   FLEXIBILITY DEVICE_NOT_DOZING BACKGROUND_NOT_RESTRICTED SSRU
Unsatisfied constraints: CONNECTIVITY WITHIN_QUOTA
UID: 10495; Network: 138 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)
UidStats{uid=10495 #run=0 #readyWithConn=0 #netAvail=0 #reg=1}
am get-standby-bucket → 40   (RARE)
```

Three things this adds to the 08-20 reading:

1. **`#readyWithConn=0`.** Not "rarely ready with a connection" — never, not once.
2. **`WITHIN_QUOTA` is now unsatisfied too.** The 08-20 reading closed the throttle
   theory on `countInWindow=0`, and that is still the right conclusion about
   *timeouts* — they read `countInWindow=1` against limits of 3 and 10. This is the
   RARE bucket's own job quota, a second independent block on top of connectivity.
3. **The bucket returned to 40** despite the app being opened and used this morning.
   The 08-20 note recorded it dropping to `10` right after a launch; it does not
   stay there.

There is also **one timeout recorded in the last 24 hours** (`timeout-reg`
`countInWindow=1`), so something did run long enough to be killed at the 10-minute
limit. Not chased — noted, because `#run=0` in the same dump says the opposite about
the current window and only one of those can be describing the task.

**The conclusion is unchanged and now overdetermined: nothing this app schedules
will run unattended on this phone.** Push is not one option among several, it is the
only one.

**Worth trying, because it is free:** this is a Xiaomi/MIUI device. Autostart on,
battery *No restrictions*, then leave it overnight. It may lift the bucket off
RARE. It will not make the timing dependable, so it is a measurement, not the fix.

---

## 8. Traps that have already cost time

- **Render's disk is wiped on every DEPLOY, not every restart.** Which is why file
  persistence read as working for a week. Anything the gateway must not lose goes in
  Postgres — see `gateway_state`.
- **`.gitignore` is a fingerprint input.** Editing it changes the runtime version
  and orphans every installed build — updates publish fine and can never arrive.
  Rebuild after touching it.
- **EAS environments are separate from `.env.local`.** A variable added to one needs
  adding to the other, or the published bundle is missing it.
- **A channel must exist and be linked to its branch**, or the app asks and gets
  nothing, silently. `eas channel:list` should not be empty.
- **`expo prebuild --clean` wipes `android/`**, including any APK waiting to be
  installed. Finished APKs are parked in `builds/`.
- **`console.log` goes to Metro, not logcat**, on bridgeless React Native.
- **The app lock re-locks on every background**, so UI automation cannot get back in
  — the biometric prompt needs a finger.
- **Android drops a notification sent to a channel that does not exist.** The
  gateway asks the phone for its channel names rather than assuming them.
- **Do not rebuild a notification channel to explain a silence.** Two sessions went
  to this and the channel was never the problem. Read
  `adb shell dumpsys notification --noredact` and check which code path actually
  ran. Force-stop before renaming a channel, or Fast Refresh spends the id on the
  old settings.
- **A shared persona teaches markers to every leg that uses it.** `see()` used the
  persona documenting `[[LOOKUP:]]` without the code that acts on it, and printed
  the marker. A new call to a model using `_PERSONA` needs `_resolve_markers` too.
- **`RN 0.86`'s `Modal` is not exported under this jest setup.**
  `require('react-native').Modal` is `undefined`, so a test renders the screen with
  the modal's contents silently absent — it reads exactly like a component that
  failed to open. The Activity detail box is an in-tree overlay for this reason.
- **RNTL 14 renders asynchronously.** `render()` returns a promise and a state
  change from `fireEvent.press` needs awaiting — a synchronous `getByTestId` after a
  press finds nothing and looks like a handler that never fired.
- **No Python on the laptop.** Every gateway change made here is unrun.

---

## 9. Deliberately not doing

- **A light theme for the HUD's own sake.** The instrument look is the product. §6
  is about removing the dead option, not building the theme.
- **Offline command queue.** The toast says "queued", which is a lie of convenience.
  Either build a real queue with retry and expiry, or change the copy to say the
  command was dropped. Change the copy first.
- **Animation for its own sake.** The bounce was removed on purpose. New motion
  needs a reason beyond decoration.
- **`AccessibilityService`.** In §3.2 for completeness and not on the plan. It reads
  banking screens for less than the notification listener gives.

---

## 10. Order

**§1 empties first.** Two sittings: one with the desk on (harnesses, durable-state
merge, desk key, `BRIDGE_SECRET`), one with the phone in hand and unlocked (the
microphone). Nothing in §3 should start until it is empty — three items sat "nearly
verified" for four days, and this project's two most expensive bugs were both a
stale assumption treated as proved.

**§2 next**, both of them. They are live defects in the two features that were
proved this morning, and a feature that just started working badly is the one people
stop trusting fastest.

**Then §3, in this order, and the order matters:**

1. **§3.2.1 — send what the phone already knows.** Most character per line of code
   in the whole document. Needs the gateway.
2. **§4.1.1 — split the token.** Before any new sense, not after.
3. **§3.4 rung 2 — declared rules.** Spec written, awaiting review, ships over the
   air.
4. **§3.1 — `BOOT_COMPLETED`, then the notification listener.** The step change in
   presence, and the point at which §4 stops being advice and becomes the gate.
5. **§3.3 — durable memory and chat history**, which the rules above will want.
6. **§3.6 — voice.** Last, and better for having waited.

**§5 fills any session with no desk and no phone in hand** — both halves ship over
the air. Do §5.1.1 (the ticks) before §5.2, and land §5.2 on one screen and live
with it for a day before propagating; it is the item most likely to sprawl.

**§6 is filler for short sessions.** The OTA channel check that used to gate every
JS-only fix after it was run on 2026-08-24 and passed — the channel is Active, the
branch is linked, and the runtime matches the installed APK. Nothing in §5 or §6 is
waiting on it any more.

**The Android glass blur is last, after everything above.** Asked for on 2026-08-21
and deliberately parked at the end: it adds no capability, and its failure mode is a
segfault that takes the process rather than a screen that looks wrong.
