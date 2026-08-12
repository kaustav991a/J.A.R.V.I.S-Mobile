# Desk watch — what the desk owes the phone

Written 2026-08-12. The phone side is built and tested; nothing here exists on
the desk yet.

The feature: when someone is at the desk, the desk grabs a webcam frame and asks
the phone "was this you?". No answer in 30 seconds and the desk locks its own
Windows session, which then needs the Windows credential you already have.

## The one thing to get right

**The desk owns the countdown, and silence locks.**

The phone's countdown is a readout, not a decision timer. If the phone is
asleep, out of signal, flat, or uninstalled, the desk must still lock. Put the
timer anywhere else and a dead battery becomes an open machine.

That is also why the frame carries `expires_in` (seconds remaining) rather than
a deadline timestamp: the two machines never have to agree on the clock. The
phone turns it into a local deadline the moment it lands
(`src/state/hudReducer.ts`, `case 'intruder'`).

## What "someone is at the desk" means here

Capture on **session unlock or wake**, and on a **refused Windows Hello**. No
face recognition — deliberately. Matching faces means an ML stack on the desk,
an enrolment step, and tuning, and its failure mode is the wrong one: a false
negative means an intruder walks.

Be clear-eyed about what capture-on-unlock catches. Anyone who unlocked the
session already had your credential, so almost every alert will be *you*. That
is the design, not a flaw — the tripwire is for the case where the credential
has leaked, and the cost of a false positive is one biometric tap. It is why the
phone asks "was this you?" rather than announcing an intruder.

Windows will likely have the camera claimed by Hello at the moment of unlock.
Expect the first `VideoCapture` to fail and retry once, briefly, rather than
treating a failed grab as a reason to stay quiet — the alert must be raised with
`image: null` if it comes to that. The phone renders that case
(`watch-no-mugshot`).

## Frames the desk sends

Both go down the existing socket and are parsed by `src/ws/frames.ts`. Field
names are wire-exact; unknown extra keys are ignored, missing ones are dropped.

```jsonc
// someone is at the desk
{
  "type": "intruder",
  "id": "w-2026-08-12T13-04-11",   // also accepted: action_id, request_id
  "expires_in": 30,                 // SECONDS REMAINING, not a timestamp
  "image": "/api/watch/shot/w-2026-08-12T13-04-11.jpg",  // or null
  "user": "KAUSTAV",                // the active Windows account
  "trigger": "unlock"               // unlock | wake | hello_failed
}

// the window closed — send this however it closed
{
  "type": "intruder_resolved",
  "id": "w-2026-08-12T13-04-11",
  "outcome": "approved"             // approved = it was you. anything else = locked
}
```

Two refusals on the phone side, both deliberate:

- No `id`, or `expires_in` missing/zero/negative/non-numeric → **the frame is
  dropped**. An alert with no id cannot be answered, and a live countdown drawn
  from a dead window is a lie about the desk.
- Any `outcome` that is not exactly `"approved"` reads as `locked`. A garbled
  outcome must never render as "it was you".

Send `intruder_resolved` on **every** path out: the phone answered, the desk
timed out, the desk was told from Telegram, the user came back and cancelled it.
Otherwise a stale alert sits on the phone claiming to be live.

## Routes the desk owes

### 1. `POST /api/watch/answer`

```jsonc
{ "id": "w-2026-08-12T13-04-11", "approved": true }
```

`approved: true` cancels the lock. `false` locks immediately, without waiting out
the remainder. Either way, reply `2xx` and then emit `intruder_resolved`.

Answering an id that is unknown or already closed must be a no-op, not an error
that reads as success — and must never cancel a *different* live alert.

**This route decides whether a machine stays open. It must be authenticated.**
It is deliberately not `/api/agent/confirm`: nothing holding an agent action id
should be able to reach it. The pairing token in `ROADMAP.md` §1 is still owed —
until it lands, bind this route to localhost or gate it some other way. Do not
ship it open on the LAN.

### 2. `GET` the image path

Serve exactly the path sent in `image`. The phone resolves a bare path against
whichever base the link is on (`deskAsset` in `src/state/JarvisProvider.tsx`), so
an absolute URL is honoured too if the capture lives elsewhere.

Same authentication as above. A mugshot endpoint that answers anyone on the
network is a camera anyone on the network can read.

### 3. The lock itself

```
rundll32.exe user32.dll,LockWorkStation
```

Nothing custom is needed: this locks the session, and unlocking it then requires
the Windows PIN/Hello already configured. Do not build a second PIN.

## Retention

Agreed: **desk-only, deleted on resolve.** The image stays on the desk disk, the
phone fetches it over the link for display and caches nothing, and the desk
deletes the file once the alert is approved or the window expires. Nothing
accumulates, and intruder photos never sit in phone storage.

## Push

An alert that only travels down the WebSocket reaches the app when it is in the
foreground. To wake a locked phone the desk must also send an Expo push. That
needs, on the phone side, a Firebase project and `google-services.json` — not yet
present, so the app has `expo-notifications` installed and permitted
(`POST_NOTIFICATIONS`) but no token registration wired. Until that lands, the
socket path is the only delivery and the desk still locks on silence, so the
feature stays fail-secure — you just find out afterwards.

## What the phone already does

Built and tested:

- `src/ws/frames.ts` — both frames, with the refusals above (22 tests)
- `src/state/hudReducer.ts` — one live alert, `expires_in` → deadline, sightings
  logged to the Activity timeline, local expiry (26 tests)
- `src/screens/WatchAlertScreen.tsx` — mugshot, live countdown, two answers, over
  every other surface including the lock gate (13 tests)
- `src/security/AuthProvider.tsx` — "it was me" is gated behind a class-3
  biometric; "lock it now" is not, since locking is the safe direction and is
  what silence does anyway

Testable with no desk at all: send the command `test watch` in the Chat tab while
demo mode is on and the stand-in desk raises a real alert through the real
reducer (`DEMO_WATCH_COMMAND` in `src/state/demoFeed.ts`).
