# TESTING — the feature list, and how to check each one

Written 2026-08-21. **This file answers one question: what do I tap, and what should
happen.** It never says whether something is built — that is `ROADMAP.md` §0b, and
two files answering the same question differently is how this project has lost days
before.

## Before you test anything

**A JS-only change is not on your phone until it is published.** Everything in this
repo except native config ships with:

```bash
eas update --branch production --environment production --platform android
```

Then force-stop the app and reopen it. If a check below fails in a way that looks
like the feature does not exist at all, confirm the update landed before reporting
it — `eas channel:list` must not be empty, or the app asks for an update and gets
nothing, silently.

**Unlock the phone by hand.** `adb` can wake the display and cannot unlock it, so
anything launched behind the keyguard never reaches the foreground.

**How to read a result.** Every row has a *fail* column, and it is the important
one. "Nothing happened" is almost never a useful report here, because this app has
twice spent days on a correct silence read as a broken feature. Say which of the two
you saw.

---

## 1. The leaving briefing

The morning and evening departure briefings, pushed by the gateway.

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 1.1 | A briefing arrives unprompted | Name Home on Places, set a time, leave the phone alone until it | One notification, `Before you leave Home, sir` or `Nothing in your way from Home, sir` | Nothing by 20 minutes past the time |
| 1.2 | **It arrives once, not twice** | Same, and **do not swipe it** | Exactly one notification | Two identical ones. Then read the tags — see below |
| 1.3 | A quiet day still says so | A day with no rain, no heat, no wind | `Nothing in your way…`, carrying the temperature, rain chance and wind | Silence. A silent quiet day is indistinguishable from a broken feature, which is why it was overruled |
| 1.4 | A failed lookup stays silent | Hard to force; note it if you see it | No notification, and tomorrow's still arrives | A notification claiming all-clear. That is the one dishonest message this feature can send |
| 1.5 | PREVIEW proves delivery end to end | Places → PREVIEW on a departure | The notification appears immediately | A message naming the reason instead — that is the honest path, not a failure |
| 1.6 | Both doors are named | Two departures on, both due in a day | Each notification names its own place | Two notifications you cannot tell apart |

**If 1.2 fails, this is the check that settles it.** With both still in the shade:

```bash
adb shell "dumpsys notification --noredact" > shade.txt
grep -a -B 30 "Before you leave" shade.txt | grep -a "tag="
```

The gateway's push carries `tag=FCM-Notification:*`. A notification the phone posted
itself does not. Two records, one of each, means both senders fired.

---

## 2. He speaks first

At most one unprompted remark a day, and it is not a briefing.

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 2.1 | A remark arrives at most once a day | Nothing. Between 9 AM and 9 PM | One notification titled `J.A.R.V.I.S.`, one or two sentences | Two in a day, or two days running on the same subject |
| 2.2 | **It is true** | Read it against what you actually told him | Something that is genuinely true today | An assertion about another day, or an invented detail. Copy the exact text — the wording is the evidence |
| 2.3 | Silence needs no excuse | Most days | Nothing at all | A "nothing to report" message. That is the message you learn to swipe |

---

## 3. The Activity panel

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 3.1 | Briefings appear in the panel | Get a briefing, open Activity | The briefing is in the timeline, at the time it arrived | Missing, or filed under the time you opened the app |
| 3.2 | Nothing is truncated | Tap any row | A box with the whole message, scrollable if long | Text still cut off at three lines |
| 3.3 | The box reaches the conversation | Tap a chat row, then OPEN IN CHAT | The Chat tab, with that turn in it | Nothing, or the wrong tab |
| 3.4 | A step the agent took has no chat to open | Tap a `git-commit` row | The box, with no OPEN IN CHAT | An OPEN IN CHAT that goes nowhere |
| 3.5 | Unread is visible | Get something new, open Activity | A dot beside the unread rows | No dot, or a dot on everything |
| 3.6 | Reading one leaves the rest alone | Open one unread row, close it | That row loses its dot, the others keep theirs | All dots clear at once |
| 3.7 | **Read survives a restart** | Read one, force-stop the app, reopen | It is still read | Everything unread again, and the bell back at the whole history |
| 3.8 | MARK ALL READ still works | With several unread, tap it | Bell to zero, dots gone | Approvals in "Needs you" also cleared — those need a decision, not a read |
| 3.9 | Days are separated | Have entries from two days | A rule naming `Today`, `Yesterday`, a weekday, or a date | Every row carrying its own date |
| 3.10 | Long timelines page | More than 12 entries | `SEE 18 MORE` at the end, revealing the next page | The list silently stopping |
| 3.11 | The count means something | Send a message yourself | The header count does **not** go up | It counts what you just typed |
| 3.12 | Empty entries are shown, not counted | An agent step with no detail | The row is there, the count ignores it | A count promising something the panel cannot show |

---

## 4. The conversation

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 4.1 | He opens with the state of things | Open Chat | One true sentence: time, desk, place, next briefing | A blank field, or a stale claim |
| 4.2 | Replies arrive word by word | Ask anything | Text revealing at a readable pace | The whole answer appearing at once |
| 4.3 | Markdown is rendered | Ask for a list | Bullets and bold | Asterisks on screen |
| 4.4 | No thinking out loud | Ask something hard | The answer only | `<think>` or a monologue reaching the screen |
| 4.5 | A dead link says so | Turn off wifi, send | A reply naming the failure, flatly | The question sitting there with a typing indicator that never stops |
| 4.6 | A pocketed answer still lands | Ask, background the app, come back | The answer is in the chat, not only in the shade | The chat holding your question and no answer |
| 4.7 | Tapping a reply opens the chat | Tap a `J.A.R.V.I.S.` notification | Chat, at that reply | Whatever tab was last open |
| 4.8 | A photo can carry a question | Camera, then type a caption, then SEND | The photo and your caption both go | Sending immediately, with no chance to look at it |
| 4.9 | **Voice in** | Chat → hold the mic → speak → release | A transcript appears as your turn | Nothing. Then check `brains.usage.audio` on `/health` — `0` means no clip ever reached the model |

---

## 4b. Asking what he can do

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 4b.1 | He answers it himself | Chat → `what can you do` | A list starting `At present, sir`, arriving instantly | A pause, then a model's version of the answer |
| 4b.2 | It works with nothing connected | Turn off wifi, ask again | The same list, just as fast | A failure message. The list is on the device and must never need the network |
| 4b.3 | It names the gaps | Same | A `Not yet:` line at the end | Only capabilities, which sends you hunting for something unbuilt |
| 4b.4 | It does not swallow real questions | Ask `what can you see` with a photo, and `lock the desk` | Both go to the desk as normal | Either answered with the capability list |
| 4b.5 | The same list is browsable | Settings → What he can do | The same entries, grouped into what he does and not yet | A different list. Two lists that disagree is the bug this shape exists to prevent |

---

## 4c. The status panel on Home

Under the quick actions. It exists so a report can name the thing that is off.

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 4c.1 | It is there | Open Home, scroll past the four tiles | A STATUS panel, eight rows, a dot and a word on each | Missing |
| 4c.2 | Every row says its state in words | Look at any row | `ATTACHED`, `CLOUD`, `NO TOKEN`, `OFF BY CHOICE` and so on | A dot with no word. The dot is the glance; the word is the signal |
| 4c.3 | What is wrong is at the top | Turn something off — wifi, or location sharing | That row moves to the top | It stays in place and has to be hunted for |
| 4c.4 | It counts only real faults | With push `NOT ASKED` and nothing else wrong | `ALL PRESENT` | A count that includes what has not been asked yet |
| 4c.5 | A setting is not called a fault | Turn location sharing off | `OFF BY CHOICE` | `OFF`, or red-as-broken for something you chose |
| 4c.6 | It works with nothing connected | Aeroplane mode, open Home | The panel reads, with `CANNOT ASK` against the desk | An empty panel, or a spinner |
| 4c.7 | Only faults pulse | Watch it with everything on | Steady dots | Everything blinking, which is noise |
| 4c.8 | It respects the animation setting | Appearance → animation off | Dots drawn, not pulsing, colours and words unchanged | Still pulsing |

**This is the panel to screenshot when reporting anything.** A row reading
`NO TOKEN` or `ON THIS PHONE` usually is the bug.

---

## 4d. He notices something before being asked

At most one remark a day, on the Chat screen under the opening line. **Most days it
says nothing, and that is correct** — a machine that always has something to say is
one you mute.

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 4d.1 | It notices a heavy day | Open Chat on a day well past your usual screen time | A blue line naming both figures — `4h on the phone today against a usual 1h 40m, sir.` | A vague remark with no numbers, which cannot be disagreed with |
| 4d.2 | It notices a departure nearly here | Open Chat within 45 minutes of a leaving time | `You leave Office in 15 minutes, sir.` | Nothing, or a departure already behind you |
| 4d.3 | The deadline wins | Both true at once | The departure, not the screen time | Screen time while a departure is 10 minutes away |
| 4d.4 | **Once a day, and no more** | Open Chat repeatedly | The line appears once and does not come back | It reappears on every visit |
| 4d.5 | Never the same subject twice running | Two heavy days in a row | Silence on the second | The same observation again — that is a nag |
| 4d.6 | Quiet hours hold | Open Chat before 8 AM or after 9 PM | Nothing, whatever it thinks it sees | A remark at 11 PM |
| 4d.7 | It waits for a baseline | A fresh install, few days of journal | Nothing about usage | "Unusual" against two days of history |

**What it does not do yet:** find you. It notices when you open the app, not while
the phone is in your pocket — nothing this app schedules runs unattended on this
device, measured. That is `ROADMAP.md` §7, and the gateway push is the fix.

---

## 5. Security and the lock

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 5.1 | The app locks | Background it, come back | The biometric sheet | Straight back in |
| 5.2 | It re-locks every time | Background twice | The sheet both times | Only the first time |
| 5.3 | A rotated token works | Rotate on Connection, reconnect | Connected | 403, or a silent failure that looks like a dead desk |
| 5.4 | An unusable address is refused | Type nonsense on Connection | Refused, with a reason | Stored, then behaving like a dead desk |

---

## 6. The desk watch

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 6.1 | The alert reaches a closed app | With the desk running, trigger it | A notification that survives the app being shut | Nothing |
| 6.2 | Tapping it opens the alert | Tap the notification | The alert screen, with the countdown | Any other screen |
| 6.3 | The countdown is a readout | Watch it run out without answering | The desk locks itself | The phone deciding — it must never own that clock |

---

## 7. Places, the journal, and memory

| # | Feature | Do this | Pass | Fail |
| --- | --- | --- | --- | --- |
| 7.1 | A named place is used, not a geocoder | Name Office, ask "how far to the office" | An answer with a measured distance | A guess, or a lookup failure |
| 7.2 | Located answers quote figures | Sharing on, ask "is it raining here" | Measured numbers | Prose with no figures — that is the model's weights answering |
| 7.3 | **The journal names its own denial** | Settings → Journal, revoke usage access, return | *"I cannot see your usage"* | *"Nothing recorded"* — a denial dressed as an empty day |
| 7.4 | He is one assistant | Tell the desk something, then ask the phone | The phone knows | Three copies wearing the same name |

Revoking usage access without touching the phone:

```bash
adb shell appops set com.mypersonalintelligence.jarvis GET_USAGE_STATS deny
# ... check the screen, then put it back
adb shell appops set com.mypersonalintelligence.jarvis GET_USAGE_STATS allow
```

---

## 8. Not shipped yet — do not test these

Listed so a missing feature is not reported as a bug. They move up into the tables
above as they land, and `ROADMAP.md` §0b is where their status lives.

| Feature | Section |
| --- | --- |
| Liquid glass behind the Android tab bar | §5.2, last item |
| The photo in the chat bubble, instead of the word "Photo" | §5.1 |
| A photo in flight saying so, and a failed send staying recoverable | §5.1 |
| Sent / delivered / read ticks | §5.1.1 |
| Reply-to-a-message | §5.1.2 |
| Voice out — he speaks | §3.6 |
| He knows where and when he is, in his own answers | §3.2.1 |
| Declared rules — "tell me if I haven't called mom by 7" | §3.4 |
| Notifications from other apps as context | §3.1 |
| Script create / edit / delete / run | §3.5 |
| Run history in Reports | §3.5 |
| A crash telling anyone it happened | §6 |

---

## Reporting something

Three things make a report actionable here, and the third is the one usually
missing:

1. **What you did**, to the tap.
2. **What you saw** — the exact text where there is text. The Saturday remark was
   diagnosed from its wording alone.
3. **Which silence it was.** "Nothing happened" splits into *the feature did not
   run* and *it ran and had nothing to say*, and those have different causes. If the
   shade is involved, `adb shell "dumpsys notification --noredact"` settles it.
