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

**44 of 85 rows are proved on the phone** (52%). 61 have code (72%). 29 cannot be finished in this repo: 21 on the brain, 2 on the desk, 6 on the phone.

### Transport, pairing, security

*4 proved of 8.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| LAN probe → cloud fallback → WebSocket, reconnect | proved |  | One reducer serves every tab. |
| One socket per launch; chat survives force-stop | proved |  |  |
| Pairing token in SecureStore, with rotation | proved |  | New accepted, old refused 403. |
| Biometric lock, re-locking on background | proved |  | `strong` only — Android rejects `BIOMETRIC_WEAK \| DEVICE_CREDENTIAL` outright, and with a passcode fallback enabled no sheet appears and the promise never settles. |
| Desk-key handshake (sealed turns) | untested | Desk | `has_desk_key: false`. 18 turns dropped and rising, so the encrypted path has never once worked end to end. Sealed-and-dropped is the correct failure and it is still a failure. |
| `BRIDGE_SECRET` rotation | — | Desk | The old value went through Render's access log before redaction landed and still opens `/desk-link`. A fake desk was connected with it repeatedly during testing. The only item whose cost grows while deferred. |
| Capability-split tokens | — | Brain | One string gates the socket, push, the commute route and app state alike. A token that can register a push and a token that can read your day must not be the same secret. |
| Token expiry | — | Brain | Nothing expires. |

### Talking to him

*10 proved of 20.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Text chat, both directions | proved |  |  |
| Replies arrive word by word | proved |  |  |
| Markdown rendered, not shown as asterisks | proved |  |  |
| The chat log in the right order, once each | broken | App | **The note below was stale, and re-reading it was the whole of the fix.** It said the surviving pair must carry different timestamps and that identity on an exact millisecond could not unify them — **which `96de0e1` had already acted on**, replacing the key with a 5-second window measured from a real 100-entry log (duplicates 422–459 ms apart, nearest genuine repeat 32.9 s). The duplicate half has been fixed and shipped since then.

**What was left was the ordering half, and it is one line.** `ChatScreen:118` did `[...hud.chat].reverse()` — the log rendered in ARRIVAL order, never sorted by `at`. A turn swept out of the tray carries the notification's own time, so an entry from last night entered this morning was appended last and read as the newest. That is the second reported symptom exactly: yesterday's `15:xx` below today's `12:xx`.

**Fixed at the source rather than at the reader**, because there were two readers and both assumed the array was already ordered — `ChatScreen` reverses without sorting, and `HomeScreen:231` takes `chat[chat.length - 1]` as the last thing said, while `activity.ts` sorts the same data before showing it. A log that disagrees with itself depending on who reads it is the bug one layer up. `place()` walks back from the end and stops, so an in-order log costs nothing and ties keep arrival order — an answer stamped in the same millisecond as its question still follows it. 4 tests, 2 of which failed first. **Unproved on the phone**, and this row stays `broken` until it is seen: the last fix here was called done from a screenshot and was not. |
| The voice rule applied to what the model writes | broken | Brain | **Found on the phone 2026-08-24.** `sir` is punctuation — lowercase, spent once. The situation line obeys it; every model reply capitalises it: *Standing by, Sir.*, *I can’t see your screen from here in the cloud, Sir.*, *I can’t authorise task approvals from the cloud, Sir.* Systematic rather than a one-off, and the same gap the nudge path has. The rule lives in `commute.ts` and `_briefing_text`; the persona prompt never got it. |
| No unprompted weekday assertion | broken | Brain | **Seen again on the phone 2026-08-24, a Monday.** *I can’t authorise task approvals from the cloud, Sir. Are you working this Saturday, by the way?* — a weekend question appended to an unrelated refusal. Same class as the false Saturday shift: a stored Mon–Fri pattern being asserted as a fact about today. The fix is committed in the brain as `c86d176` and undeployed, which is exactly what this looks like. |
| Reasoning monologues can never reach the screen | proved |  | `_strip_reasoning()`. **Device pass 2026-08-24:** two full screens of real model replies read off the phone, including multi-sentence answers and one that reasoned about a screenshot — no monologue, no stray tags, nothing leaked. Previously proved in the harness only. |
| The opening line is the real situation | proved |  | On-device, no model, no await. **Read again 2026-08-24:** *12:24 PM, sir. You are at Office and Office briefing at 7:00 PM.* Note the lowercase `sir` — this line obeys the voice rule, which is what makes the replies below it violating the same rule so visible. |
| “What can you do”, answered without a round trip | proved |  | On-device, so it answers with everything even offline. |
| A Capabilities screen listing the same thing | proved |  | One list, two surfaces. Read back over adb. |
| A status panel naming every seam | partial | Phone | Eight rows, four states, assembled on the device so it is readable with nothing connected at all — which is exactly when it will be looked at. **Read on the phone again 2026-08-24, on the new bundle:** all eight rows render, the caption counts `1 OFF` for the sleeping desk alone, and the briefing row reads `AT THE GATEWAY` while the link is cloud. Named gap: the third briefing state added that day, `CANNOT TELL`, cannot be reached on a cloud-linked phone — the stamp is fresh, so it would take two days of workspace-only sessions or a debug build to see it. **Reviewed 2026-08-27 and the gap is not work — it is a state that cannot be induced.** `CANNOT TELL` needs `cloudArmedState` to read `stale`, which needs the upload stamp older than `CLOUD_TTL_HOURS` (48) or dated in the future. Neither is reachable on demand: the stamp refreshes on every cloud connect, and the only lever that would fake it is moving the phone's clock — **which must not be done**, because `timeline` is three days into a four-day count and the journal is time-keyed, so a clock move would cost more than this row is worth. It is covered by test (`statusPanel.test.tsx:73`), and the eight rows and four states have been read on the device twice. **This is the same shape as `fallback-armed` and should be left `partial` for the same reason** rather than being quietly promoted or treated as an open task: the honest `partial`s here are ones nobody can close, not ones nobody has done. |
| Whether the gateway holds a push address | proved |  | Nothing exposed this before, and it is the most diagnostic fact in the app. |
| Photo preview and caption before sending | proved |  |  |
| A photo answering with its own lookup marker | proved |  | Shared by the text and vision paths. |
| A thumbnail in the chat instead of the word “Photo” | — | App | A reply about a photo cannot be judged without the photo. |
| Photo-in-flight indicator; a failed send stays recoverable | — | App | The longest wait in the app, and the least visible. |
| Sent / delivered / read ticks | — | Brain | Only the gateway can say delivered and read, and it says neither. Needs a per-message id on both sides. The largest fully-specified thing left. |
| Reply to a message | — | Brain | Wants the same per-message id as the ticks, so it follows them rather than inventing a second identity for a message. |
| Microphone in | partial | Brain | **Run at last on 2026-08-27, and the transport passed on the first try.** `brains.usage.audio` went `{gemini_ok: 0, fell_back: 0}` to `{gemini_ok: 1, fell_back: 0, last_error: null}` — the clip reached the gateway, Gemini accepted it, and nothing fell back to Groq. **The mime fear this row was written around was already answered in code:** `_AUDIO_MIME` maps `m4a` to `audio/aac`, which is exactly what Google documents, so there was never anything to fix. Note the counter is incremented on a call that did not throw, so it proves the format was accepted and not that words came back — the chat is what settles that.

**The named gap is the transcript.** *"hi jarvis"* came back as **"ki service"**, and the reply — correct Benglish for the question it thought it had been asked, about what the cloud can do without the desk — was right for a transcript that was wrong. The cause is visible in `_GEMINI_TRANSCRIBE_PROMPT`, which primes hard for romanised Bengali (*"the speaker mixes Bengali and English… anything that sounds like Hindi is Bengali"*). That prompt exists to fix the opposite failure and it works; on a two-word English greeting it overcorrects, and `ki` is a real Bengali word. **One sample, and a poor one** — two words, one of them a proper noun the prompt never names. Cheapest thing to try is telling the prompt the assistant is called J.A.R.V.I.S., which is a gateway change and so blocked with the rest.

**2026-08-27, second clip: voice is cleared of the wrong answer it appeared to give.** A spoken *"how far is home from here"* was answered with an invented distance, which looked like the transcript being mangled again. **Typing the identical question reproduced it exactly** — so the fault is `_FAR_RE`, recorded under `weather-distance`, and had nothing to do with the microphone. `gemini_ok` reached 2 with `fell_back` still 0. **A separate defect did show up on that clip, and it is now diagnosed:** the transcript never rendered as a user turn, where the first clip's did. **The socket died while Gemini was transcribing, and only the answer has a lifeboat.** `emit()` returns False when the socket is gone; `deliver()` checks that and pushes the answer instead (`cloud_gateway.py:3977`), while the transcript at `:4095` throws the result away and has no push path at all. Confirmed on the device: `numPostedByApp` went 2 to 3, so the reply arrived by push — which is why the chat shows an answer with no question above it. The window is the app being backgrounded mid-turn, where `LinkMachine.suspend` closes the socket deliberately; the first clip survived it by being short. **The codebase already learned this and half-applied it** — `emit`'s own docstring says False was once indistinguishable from success, *"which is how a finished answer came to vanish silently"*. The transcript was never given the same protection. Fixing it wants the push payload to carry the transcript so the app can write the user turn: prepending it to the answer is not open, since the code is explicit that a transcript sent as a status message is a lie about who spoke. |
| Voice out | — | App | The largest single gap in the chat, and app-only — `expo-speech`. **Voice IN is no longer the unknown half, as of 2026-08-27:** the microphone path works end to end and only the transcript is unreliable. This row is unchanged — nothing speaks yet. |

### Notifications and being spoken to

*13 proved of 16.*

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
| The phone fallback is actually armed, and says so when it is not | partial | Phone | **Found unarmed on 2026-08-26, fixed, and the armed half proved on the device the same day.** `setCommuteTask` reads the registration back after asking, because `registerTaskAsync` resolving proves only that it did not throw; the result carries the platform’s words, every attempt is recorded for a screen to read after a relaunch, and `App.tsx` logs a failure rather than discarding it. **Proved:** WorkManager holds job `#u0a495/288`, the task executes and writes its stamp, and Places reports it truthfully. **The named gap is the other half — “says so when it is not”.** The phone re-arms itself at launch and on every visit to Places, so the unarmed state cannot be induced on demand; it is covered by tests and by the reading that named it, not by a sighting. **2026-08-27 did not move this and is worth recording as such.** The 07:00 window was the first real one with the phone armed underneath a live gateway, and the phone correctly stayed silent — so the fallback still has not been seen to POST anything. Standing down is the gate’s proof, not this row’s. |
| Briefing content, thresholds, quiet-day announcement | proved |  | Thresholds on real figures, never the model. Quiet day announced with its figures rather than silently, after silence was read as breakage for four days. **The wording rotates as of 2026-08-26** — a persisted cursor per slot in `briefingVoice.ts` spends a pool of 6–7 remarks before any line returns, and the titles rotate with it. The figures deliberately do NOT vary: a measurement rephrased for novelty is one you can no longer compare with yesterday. Every variant keeps the actionable word, so Android truncating the shade cannot eat the instruction. 30 tests, and the rules are asserted over the whole table rather than over one rendering. **Only the phone-sent briefing is affected;** when the gateway is armed it writes its own text. |
| Rotating wording in the gateway-sent briefing | — | Brain | The phone rotates its own wording; the gateway does not. When `cloudArmed` is true the phone stays silent by design and the gateway posts `_briefing_text`, which is a fixed template — so on a cloud-linked phone the repetition the rotation was built to fix is still what arrives. Same shape as `briefingVoice.ts`: a pool per slot and a cursor that survives a deploy, which is why it wants `fix/durable-state` merged first rather than a second store that a redeploy wipes. **Seen rather than reasoned about, 2026-08-27.** The Office briefing at 17:59 on the 26th and the Home briefing at 07:00 on the 27th carry the identical remark — *"An umbrella, unless you’ve grown fond of arriving wet."* — and differ only in their figures, 51% against 65% with a storm line added. Two mornings, one sentence. It also cost a diagnosis: the changed figures read as rotated wording from the phone, and the gateway was briefly suspected of having gone silent. |
| He speaks first, once a day | broken | Brain | Fired for the first time and was wrong: a bare substring match let a Mon–Fri pattern assert a Saturday shift, and the prompt then asserted it as true today. Fixed in the brain as c86d176, not deployed. The same body also capitalised `Sir`, which the voice rule forbids. |
| Briefings visible in the Activity panel | proved |  | They had been filtered out entirely. |
| Read / unread per entry, surviving a restart | proved |  | **Proved, and then found half-wired on 2026-08-27.** Marks are per entry and survive a restart. What they did NOT survive was reading the chat: there are two unread systems — `readAt`, the timestamp behind Home’s *"N new replies"*, and `readIds`, the persisted set behind the bell — and only the Activity panel ever wrote to the second. So reading the conversation cleared its own marker and left the bell counting the very turns it had shown. Fixed at `28d682d`, published as `01a0422d`, **and confirmed gone on the phone the same afternoon.** The same fix closes the case one step earlier: a reply landing while the chat is open is marked read as it arrives, where before the tab bar counted an answer being read on screen. |
| The local task gated so it cannot double-post | proved |  | **Proved on `84f40716`, 2026-08-26 at 18:31:15.** A run forced inside the phone own departure window (18:30–19:00 for a 19:00 departure) while Home read `AT THE GATEWAY`: it exited in 260ms without fetching a forecast and posted nothing. The shade held exactly one briefing all evening — the gateway push at 17:59:18 — where 2026-08-21 saw both senders fire and the same briefing arrive twice. Forced rather than waited for, which settles the gate decision and not the scheduling; scheduling is proved separately by the unattended run at 18:07. **Held in a REAL window on 2026-08-27.** The 07:00 Home departure, with the phone rebooted the night before and the app never opened: exactly one notification arrived, and it was the gateway's. That is the same decision the 18:31 run settled by force, taken this time by a headless run nobody was watching. |
| Full message on tap, day rules, paged list | proved |  | **Proved on `84f40716`, 2026-08-27**, on a timeline finally long enough to exercise every part of the row at once. The full message on tap: the 07:00 briefing whole, in a box that no longer collapses to a line — the defect this row was left `partial` for. The `Yesterday` rule separating two days, which had never been seen. And the paging: `SEE n MORE` revealed twelve at a time (`PAGE = 12`, `ActivityScreen.tsx:27`), the count fell by twelve a tap, the last page held four, and the button then removed itself rather than sitting there offering nothing. `TESTING.md` 3.2, 3.9 and 3.10. |

### Memory and the journal

*4 proved of 13.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Facts stored and recalled | partial | Brain | 14 facts known. Volunteered exactly once, wrongly. |
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
| Location timeline | partial | Phone | Sightings at named places, median last-seen per day, its own 28-day store. Silent for its first four days, by design. **Device pass 2026-08-24:** it is accumulating — the panel reads *Learning your hours at Office* and its countdown had moved from `4 MORE DAYS` to `3 MORE DAYS` since 08-21, which only happens if sightings are being recorded at a named place. Named gap: nothing it has learned has been *used* for anything yet, so its output is still unseen. |
| Call log, archive import | — | App · build | Native build, and fatal for a store listing. |

### Knowing and acting

*6 proved of 14.*

| | Status | Blocked on | Note |
| --- | --- | --- | --- |
| Named places, location sharing, located answers | proved |  | **Proved on `84f40716`, 2026-08-27, from the Office**, which is the first time this row has been exercised since the fix that touched it. Three things at once. Location sharing on and the header naming `Office` — the label set by standing there, not a geocoder’s guess. *"how far to home"* answered **39.3 km by road, about 38 minutes** — so `home` resolved to the place he named, and the route was measured FROM where he was standing rather than from a district. *"is it raining here"* answered *"currently clear at the office, sir, with no rain falling"* plus a **95%** chance later — figures, and the place named. Asked from the Office deliberately: *"how far to the office"* would have answered zero and proved nothing. `TESTING.md` 7.1 and 7.2. |
| Weather and distance from measured figures | broken | Brain | The search provider is unverified, and a silent search failure looks exactly like hallucination. Routing is a public server that knows the road graph and not the road, so durations are free-flowing and the context says so. **2026-08-27, from the Office:** both lookups answered with real figures — 39.3 km / 38 minutes by road, and a 95% precipitation chance against a clear sky now. So routing and forecast are reaching a server and returning measurements, which is the half that could be checked from the phone. `/health` reports `search: tavily`. **The named gap is unchanged:** that a TAVILY search answers is still unverified, and a silent search failure still looks exactly like a confident answer — the two lookups above are the route and forecast paths, not the search path. **BROKEN, found 2026-08-27, and it is one regex.** `_FAR_RE` (`cloud_gateway.py:2757`) accepts `to\|from\|until` before the destination, so *"how far is home **from here**"* extracts `dest="here"`. Nothing matches a known place called "here", geocoding it returns junk, and **no route fact reaches the model** — which then answers from its weights and stored facts. Seen twice within fifteen minutes: *"you're currently in Ichapur, sir, you've already arrived at home"*, then *"approximately 23 kilometers from the office to Ichapur — a local train from Bidhannagar Road should get you there in about 30 minutes"*, both invented, both confident. The same question phrased *"how far **to** home"* answered 39.3 km correctly at 12:41, which is why this survived: **the feature works on the phrasing the test script uses and fails on the phrasing a person uses.** This is the exact shape this row was already warning about for search — a silent lookup failure is indistinguishable from a confident answer. Gateway-side, so it waits with the rest. |
| The situation sent to the persona | — | Brain | Place, battery, link — one field. The highest character-per-line change available anywhere in the plan. |
| Opening an app on the phone by name | proved |  | Confirmed twice over: by `topResumedActivity` and by the target app’s own launch event. Needed a native build. |
| Governance: parked actions, approve and deny | proved |  | Desk actions only. |
| Desk-watch countdown, silence locks | proved |  | The desk owns the clock; the phone’s countdown is a readout, never a decision timer. Do not move it. |
| Scripts: list | proved |  |  |
| Scripts: create, update, delete, run by id | — | Brain | Which is why editing is disabled. |
| Run history | — | Brain | Reports currently invents “Last run: 2h ago” from a fixture. |
| Presence — awake but idle | — | Brain | Inferred from socket state today. |
| Declared rules (“tell me if I haven’t…”) | — | Brain | Spec written and awaiting review. Its presence half rests on a measurement that no longer holds. |
| Anticipation v1 — noticed when you open the app | proved |  | Decided in code from the journal against its own baseline and the next departure. At most one a day, never the same subject twice running, silent by default. **Device pass 2026-08-24:** the WATCHING panel read `2 OF 3 READY`, and its counters had advanced since 08-21 — `4 MORE DAYS` to `3 MORE DAYS`, and Today from `SPOKEN` to `LISTENING`. The day gate and the baseline counters are therefore working across days, not merely rendering. It was confirmed speaking on 08-21; whether a given remark is *worth* making is a separate question from whether the machinery runs. |
| Anticipation that finds you in your pocket | — | Brain | Needs the gateway push or a foreground service — the phone measurably cannot do it alone. |
| Anticipation from learned habit rather than a written rule | — | Phone | Needs the senses and weeks of baseline. Not shortenable by code. |

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
| Appearance surviving a launch | — | App | In-memory only. Accent, glow and motion all reset. The ledger claimed this for days. |
| Crash and error reporting | — | App | A native crash is silent — no red box, nothing an error boundary sees — so `adb logcat` on the one machine that built the APK is the only diagnosis. The JS half is shippable over the air; the native half needs a service and a build. |
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

**0 of 10 are met.** 5 are partly met. **5 need `jarvis-brain`**, so the app repo alone tops out at 50% of this list.

| | Criterion | Status | Blocked on | Why it is not met |
| --- | --- | --- | --- | --- |
| 1 | **Every state names itself** | partial | Brain | Already the rule, and the two live defects are both what happens when it slips. A silent failure in a security path is a security failure. One defect is fixed in the app; the other is fixed in the brain and undeployed. |
| 2 | **No feature arrives twice or lies once** | partial | Brain | The anti-duplicate gate is built and its decision carries tests; no departure window has run yet. The false Saturday remark is fixed in the brain as c86d176 and not deployed. |
| 3 | **He can be reached without the app being opened** | partial | Phone | Push is proved — it buzzed. `BOOT_COMPLETED` turned out to be granted already, measured on the installed APK rather than on the app half of the manifest, so reboot survival is a check rather than a build. The phone fallback was found unarmed on 2026-08-26 and now reads its registration back, records why it failed and repairs itself from Places. What is left in this repo is the notification listener, which is gated by criterion 7; everything else on this criterion is a phone in hand. |
| 4 | **He speaks and he listens** | — | Phone | The microphone has never been exercised — the oldest unverified thing here. Voice out is not built at all, and until both land this is a beautifully themed text box. |
| 5 | **He knows where and when he is** | — | Brain | One field on the persona envelope, and it is a gateway change. The roadmap calls it the most character per line of code in the whole document. |
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
