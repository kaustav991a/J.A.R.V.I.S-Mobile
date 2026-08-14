# What the chat log actually shows — 2026-08-14

Read off the phone (`24053PY09I`, HyperOS) by walking the inverted chat list with
`uiautomator dump` and pulling each bubble's accessibility label. The build on the
device is the 08-13 APK; it is not debuggable, so `run-as` cannot reach
`jarvis_chat_log` directly and this is the way in.

The screen header says **100 turns**; **57 distinct ones** were recovered, because
the walk deduplicates by text and the log repeats a lot of `hi`, `thanks` and
scripted status lines. Nothing in the missing remainder changes what is below —
every pattern here appears several times over.

What follows is ordered by how much damage each does.

---

## 1. Location and weather are stated in almost every answer

Six clear instances, none of them asked for:

| He said | He was told |
| --- | --- |
| `hi` | "Hello, Sir, you're currently at Bidhannagar, West Bengal, with overcast conditions and a temperature of 27.7°C." |
| `hey jarvis` | "You're in Presidency Division, Sir, still overcast with a 100% chance of rain and a feels-like temperature of 33.4°C." |
| `Hello, Aajit.` | "You're not Aajit, Sir, you're at Kankurgachi, and it's still overcast with a 100% chance of rain." |
| `Aadisho.` | "You're still in Presidency Division, Sir, and it's still overcast with a feels-like temperature of 33.4°C." |
| `Thank you. How are you?` | "I'm functioning normally, Sir. You're currently in Bidhannagar, with overcast conditions and a temperature of 27.7°C." |
| `thanks` | "You're at the Office, which is also known as Fortmindz, Sidco Global Tower, Sir, and it's currently overcast with a feels-like temperature of 37.7°C." |

**This is not the model being odd. It is a system prompt.** Six for six on
greetings and pleasantries is instruction-following, not drift. The phone is right
to send `where` — the gateway is wrong to spend it on "thanks".

The fix is prompt-side and it is one rule: *the location and weather block is
context, available if the question needs it, and is never itself the answer.*
Nothing on the phone changes this.

## 2. The same reading, reported as two contradictory ones

```
You:    Are you sure?
Jarvis: The weather conditions I have are from a bit earlier, Sir - overcast,
        27.6°C, 91% humidity, and a 100% chance of rain, but I can try to get
        an update if you'd like.
```

The turn before said "feels-like temperature of 33.4°C". Both numbers came from
**one** payload — 27.6 is `temperature_2m`, 33.4 is `apparent_temperature` — and
were served back as a correction to each other. "From a bit earlier" is invented:
the figures were seconds old.

Fixed on the phone (`weatherFor`):

- every figure now names itself in full — `air temperature 27.6°C`,
  `feels like 33.4°C` — because a label that sits beside a number gets dropped
- `rain chance today 98%` became `chance of rain at some point later today 98%`;
  the old wording was repeatedly reported as a 98% chance of rain *now*
- the payload carries `measured at <local time>`, so the age of a reading is a
  fact rather than something to guess at

## 3. One desk, four names

Bidhannagar → Kankurgachi → **Presidency Division** (twice) → "the Office, also
known as Fortmindz, Sidco Global Tower". Same man, same chair, four turns.

Android's reverse geocoder fills its fields inconsistently between calls, and
`currentFix` ranked `subregion` above `city` — so an administrative division
covering millions of people was offered as an address. Two fixes, both phone-side:

- the preference is now `district → city → subregion`
- `where.label` carries the place he named by standing in it, resolved on the
  phone (`nameFor`, 250 m). A label he set does not drift.

## 4. Search returns something, and it is presented as an answer

```
You:    ask madam what she'll eat
Jarvis: I'll try to find out, Sir - Madam's latest meal plan announcement was on
        August 10, featuring the Sick Tray Program, but I couldn't find any
        specific information on what she'll eat today.
```

"The Sick Tray Program" is a hospital catering result. It has nothing to do with
anyone in this house, and it was delivered in the register of a fact about her.

Unprompted, with no question in front of it:

> "The nearest pharmacy is Apollo Pharmacy Durgapur Bidhannagar, Sir, located at
> 65/1, A1/7, S.S. Banerjee Sarani, Sec-2A, Kolkata, and can be contacted at
> 7596079969."

Durgapur and Kolkata are 160 km apart; that address is two results welded
together. **This is the Tavily suspicion, confirmed as a symptom.** Whether the
API is failing or the results are simply being trusted wholesale cannot be told
from the phone. Either way the rule is the same: a search that does not clearly
answer the question must come back as *I could not find that*, and a result must
never be restated as first-hand knowledge.

## 5. It had the answer in context and did not look

This is the worst one, because it is not a knowledge gap.

```
You:    what will be the ideal weight of any india who is 9 months old
Jarvis: For a 9-month-old boy in India, the ideal weight range is 7.2 to 10.9 kg, Sir.
Jarvis: The average weight for a 9-month-old boy in India is around 8-9 kg, Sir,
        but I'll check for more specific data.
You:    okay check once
Jarvis: According to the WHO growth charts, the average weight for a 9-month-old
        boy is around 8.3 kg, Sir.
```

He meant his **Indie** — an Indian pariah dog. Three different figures were given
for a human infant across three turns, the last one dressed in a citation.

Then, a few turns later:

```
You:    Do you know I have a pet?
Jarvis: You mentioned an Indi, an Indian dog, earlier, Sir.
```

**The dog was in the context the whole time.** It could recall it on request and
still did not consult it when answering the question it was needed for. So this is
not "the model didn't know" — it is the model preferring a fluent answer to a
correct one, and a prompt that never told it to stop and ask.

`india` / `Indie` is a genuinely ambiguous string. One clarifying question costs a
turn. Guessing cost five turns, three contradictory numbers, and a WHO citation
for the wrong species.

## 6. Demo frames were writing into the conversation

The last line in the log is **"Working through the backup queue."** That string is
`demoFeed.ts` — the stand-in desk's scripted `thinking` message, sitting in the
log as something J.A.R.V.I.S. said. Several unattributed turns above it have the
same origin.

Demo mode defaulted to on. It now defaults to off (`JarvisProvider`), and stays
available from Settings for showing the app to someone. Invented telemetry beside
real answers is indistinguishable from the assistant making things up.

---

## What is left, and where it lives

Everything in §1, §4 and §5 is the gateway's system prompt and its search
handling — `jarvis-backend`, not this repo. §2, §3 and §6 are fixed here.

Worth saying plainly: the prompt is the highest-leverage file in this system. The
phone can keep making the context more honest, and it has, but nothing here can
stop a prompt that has been told to announce the weather.
