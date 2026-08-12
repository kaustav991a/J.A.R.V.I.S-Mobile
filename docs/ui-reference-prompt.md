# Image-generator prompt for JARVIS mobile screens

Paste into an image model to produce reference mockups, then hand the images
back. Generate in batches of three or four screens — asking for all eleven in
one image loses the detail that makes a reference useful.

Keep the DESIGN SYSTEM block verbatim in every batch; it is what keeps a second
image consistent with the first. It mirrors `src/theme/tokens.ts`, so if the
palette changes in code, change it here too.

---

Design a mobile app UI mockup sheet for "JARVIS", a personal AI assistant that
controls a desktop machine. Render as clean flat UI screens (no photographic
phone frames, no browser chrome, no address bar, no hands, no reflections).
Each screen 1080x2340 (19.5:9), rendered side by side with a small gap.

DESIGN SYSTEM — follow exactly:

- Background: deep navy gradient, #0a1b3d at top, #051129 middle, #01060f bottom.
  A soft electric-blue radial glow sits behind the main element of each screen.
- Accent: electric blue #3ea6ff. Bright highlight #9bdcff. Never cyan, never teal.
- Signal colors, used only for meaning: green #3ce6a5 connected/success,
  red #ff4d6a disconnected/failure, gold #ffbf47 pending/waiting, violet #a06bff
  script counts, white text #eaf4ff, dim text rgba(198,222,255,0.55).
- Cards: fill rgba(10,24,48,0.72), 1px border rgba(120,180,255,0.14), 16px radius.
  No drop shadows, no glassmorphism blur except where stated.
- Type: Orbitron (geometric, wide-tracked, uppercase) for headings, wordmarks and
  labels; a monospace face for all data, values and terminal output; a plain sans
  for the greeting line only.
- Signature motif: a neon arc-reactor ring — a bright blue tube of light with a
  white-hot centre line, a thin companion ring inside, and a dark well at its core.
  It is the only decorative element in the app; everything else is quiet.
- Chrome: status bar visible at the very top with the app background running
  behind it (no black bar). A floating tab bar sits 30px clear of the bottom
  edge, inset 16px each side, 26px radius, frosted dark glass with a hairline
  top edge; 5 tabs — Home, Scripts, Commands, Reports, Settings — the active one
  in electric blue with a small bar under its icon, the rest dim grey-blue.

SCREENS — draw these, labelled underneath:

1. HOME — top row: hamburger left, bell with a blue dot right. Then a large
   greeting: "Good evening," in white sans, "SIR" beneath in electric blue
   Orbitron, and a dim line "How can I assist you today?". At the right of the
   greeting, a small 84px arc-reactor ring with a glowing "J" in its core.
   Below: a pill command field, sparkle glyph left, placeholder "Type a
   command…", mic glyph right. Then "QUICK ACTIONS" — a 2x2 grid of cards, each
   with a tinted rounded-square icon tile, a title and a one-line caption:
   Run Script (blue), Commands (violet), Connect (green), Reports (gold).
   Then "STATUS" — one card, three columns divided by hairlines: "Disconnected"
   in red over "Server Status"; "IDLE" in blue over "Current Mode"; "5 Scripts"
   in violet over "Active".
2. SCRIPTS — list of script cards: icon tile, name, "Last run: 2h ago", a small
   outcome dot, and a circular blue play button at the right edge.
3. SCRIPT DETAILS — hero card: large icon tile, script name, last-run line, a
   pill badge "Success" in green. Then "DESCRIPTION" body text, then "ACTIONS"
   with a filled blue "RUN SCRIPT" button and an outlined "EDIT SCRIPT" button.
4. COMMANDS — command field at top, then "RECENT COMMANDS" with a "Clear" link,
   then rows of past commands each with a chevron. Include a row of suggestion
   chips under the field.
5. COMMAND RESULT — the command echoed in a small card, then a terminal-style
   card: monospace green text on near-black, showing a system status readout.
6. REPORTS — "SYSTEM" panel with labelled segmented LED bar meters for CPU,
   memory and disk; an "AGENT" panel with monospace trace lines; then
   "SCRIPT OUTCOMES" rows each ending in a small SUCCESS / FAILED pill.
7. CONNECTION — hero: concentric rings around a link glyph, the outer ring
   dashed. Below: "Disconnected" with a red dot, a one-line explanation, a
   filled blue "CONNECT" button, and the server address in dim monospace.
8. SETTINGS — one grouped card of rows, each with an accent icon, a title, a
   dim subtitle and a chevron: General, Connection, Appearance, Notifications,
   Security, About.
9. APPEARANCE — "THEME" radio rows (Dark selected), "ACCENT COLOR" as five
   circular swatches with the blue one ticked, "GLOW INTENSITY" slider,
   "ANIMATION" toggle row.
10. ABOUT — centred arc-reactor ring, "JARVIS" wordmark, "Version 1.0.0", a
    two-line description, then rows for Website, Privacy Policy, License.
11. EMPTY STATES — Commands and Scripts with nothing in them: a dark unlit ring,
    one line of white text saying what belongs here, one dim line saying how to
    start.

Mood: an instrument panel, not a consumer app. Dark, precise, generous spacing,
one bright accent, nothing decorative except the reactor.
