# Copy sweep (21 Nov 2026)

The owner's rule: "these blocks of tiny copy are useless. nobody will ever read this." At most one short line where the
player needs it to act; methods and caveats behind one hover or a "Why?", or cut.

How: `docs/ui/copy-sweep/sweep.cjs` visits each page and menu at 1280×720 and lists every block of copy (the text a visible
element holds itself) over 90 characters and every hover over 110 (`docs/ui/copy-sweep/sweep.json`; stills beside it). It
reaches: the start page, Race (choose, practice setup), Cruise setup, Drills, Past races, Season, the Yacht Club (Boats,
Members, Season), Settings (Training aids, Keys), Tools, the pause screen, Lessons. Not reached by the capture: the boat
editor (the first run did not open it). The results were reached on the second run (`after/results.png`, `after/sweep.json`). Those, and every state
the page only builds in play (toasts, the coach, the incident replay), were found by reading the source for strings over
115 characters (`src/app/results.ts`, `src/app/setup.ts`, `src/ui/*`, `src/app.ts`). Closed "More about…" disclosures are
not counted: they are the rule's own "behind one link".

Owner's own words, left alone: the S/P labels, the working titles, the Racing Rules text in the Flag index.

| # | Where | Still | What (chars) | File:line | Do |
|---|-------|-------|--------------|-----------|----|
| A | Race, "Past races" card | race-choose | "A real San Francisco Folkboat race on its day, or one of yours again: the same course, fleet, day and start" (107) | `index.html:183` | cut to one short line |
| B | Pause or race: "Retire and head home?" | (the dialog, not reached in the capture) | 176 chars of RRS A5.1 / 23.1 citation | `index.html:518` | one line, the rules behind "Why?" (as the motor dialog, w029) |
| C | Yacht Club, Season: the footer | yacht-club-season | "Low point · level ratings (the real fleet's equal PHRF time on time) · one throwout only once all five races are sailed" (119) | `src/ui/season.ts:53` | cut |
| D | Past races: the caveats under a row | past-races | "course from a sailor in the race (a last-minute change)", "the published distance disagrees with the course sheet" (two lines per row), and hovers of 182–356 chars | `src/app.ts:1793` | shorten the words; hovers through shortTip |
| E | Keys: four labels run long | settings-keys | Autopilot (91), push off / dock (164), wind indicator (93), weather helm (112) | `src/ui/keys.ts` | short label, the detail a hover (as w033) |
| F | Drills: the flag buttons' hovers | drills | P, I, Z, U and Black flag meanings (114–160) | `src/app/setup.ts:502` (PREP_MEANING) | one line through shortTip |
| G | Lashing the tiller: the toast | (a toast) | 174 and 243 chars: "…To heave to, back the jib first and let her slow to a knot or two, then lash." | `src/app.ts:433-435` | one line |
| H | The Yacht Club's Season head reads "DYC ·" with the dot hanging before the season picker | yacht-club-season | a stray separator | `src/ui/season.ts:49` | drop the dot |

Found, and left for others or for the owner:

- **The Flag index** (`src/ui/flagIndex.ts:22-84`, 149–191 chars an entry): the Racing Rules' own signal text; a reference page, not a block on a screen of play. Left.
- **How it's measured** (the tactics view, `src/ui/tacticsView.ts:63`, 1,678): a long paragraph behind its disclosure; w036, FTUE's.
- **The setup's "More about the day"** (`src/app/setup.ts:206-209`, up to 441): a paragraph behind one link (so within the rule); a split into short lines would be a copy job for the owner to ask for.
- **The incident replay's explanation** ("No penalty: … a boat not racing isn't penalized for breaking them (Part 2 preamble)", `src/app.ts:371-372`, 190–230): teaching text on the page that exists to teach the rule. Left; the owner's call.
- **Results sentences** (`src/app/results.ts:130, 204, 366`): data written as a sentence ("you'd have placed 3rd of 5: 1:12 ahead of…"); not copy blocks. Left.
- **Start-of-race log text** (`src/app/setup.ts:532-554`, up to 575): goes to the messages log, not a screen of its own.
- **Closed disclosures**: the drills' "How it's scored" (now a disclosure, audit 10), the tactics view's measure note, the setup's note.

## After the cuts (docs/ui/copy-sweep/after/)

A to H are cut (one commit each, tests/copySweep.test.ts); the capture again lists no block over 90 characters on any page
it reaches but the results, and these hovers: the Keys rows for push off and weather helm (the detail, by design), the
Season footer's source note (115). I (added on the second run): the results page's debrief takes carried hovers of 161–332
characters; now one line (`src/app/results.ts:155`).

Left on the results page, the Debrief session's: the debrief's per-leg verdict sentences ("You 16:40, Green 10:15. You sailed
242 m further (about 410 s lost) and were faster over the ground (about 24 s). Green's line…", 92–233 characters each, nine
legs), the start summary (198) and the rig and pace notes (107–121). They are the race's own numbers written as sentences
(`src/sim/startDebrief.ts`, `src/ui/tacticsView.ts`), not canned copy; shortening them is a design call for the debrief.

## Every hover `shortTip` cuts (the check, 21 Nov)

`shortTip` (src/ui/hoverText.ts) cuts a hover over 110 characters at the last sentence, clause or word. The 32 cuts a
run of the page makes (one per hover, the same hover often seen twice), before → after, and whether the cut loses something
the player needs:

| Hover (source) | After the cut | Loses a figure, rule or "not"? | Done |
|---|---|---|---|
| Line transit (hud.ts, the next-race card; ×15) | was cut before "X is N° left of it" | **the figure** | hand-written: `Line transit: X in line with the shore of Belvedere and Tiburon · 3° left of it` (tests/hoverText.test.ts) |
| Sight the line (a toast; log row) | "…X lines up with the shore of Belvedere and Tiburon" | no (the next sentence repeats the transit) | cut is fine |
| 5-minute sequence / Cruising line (setup cell) | "Current: Ebb 1.3 kt, building · turns to flood ~16:35. Sea: glassy · 0.4 ft swell, 11 s" | no: the figures stay, the rest is the cell's own row | cut is fine |
| Preparatory signal (log row) | "P up, one sound. 4 minutes. P: the usual start" | no | cut is fine |
| P / I / Z / U / Black (flag buttons) | each ends before its consequence ("…you must sail…", "…you get…") | **yes: the penalty, "must", the rule number** | hand-written (`PREP_TIP`, tests/hoverText.test.ts) |
| Cruise boat approaching (log row; src/sim/world.ts, not ours) | "…The racing rules don't apply between you and her; the collision…" | **half a clause; the "keep clear" instruction** | see below |
| Swell cell (setup) | "1 ft of swell here, 4 ft, 13 s outside the Gate (the buoy reads 5 ft with the ocean's own wind waves, which…" | the buoy figure stays; the half-sentence is cut mid-aside | see below |
| Past-race caveats (course from a sailor; distance disagrees; course uncertain) | each cut mid-aside | the "as the sheet draws it" qualifier | see below |
| Coach tips (smooth tacks; tune the rig; headed; shadow; downwind angle) | cut at a clause, still a full instruction | no | cut is fine |

The ones that lose something are changed by hand where the text is ours (src/ui, src/app); the cruise boat's sentence comes
from src/sim/world.ts and is the Coordinator's to shorten at the source (proposed: "Bay cruise boat approaching at 11 kt.
Racing rules don't apply to her; keep clear, and expect a wake.").

## The boat editor (21 Nov)

`docs/ui/copy-sweep/boat-editor.cjs` opens the editor and then each section in turn (Registration, Hull, Deck and cabin, Rig,
Sails, Lines, Home berth, Speed; v215's editor uses accordion headers, not "Change" buttons). Every page and every section:
0 blocks of copy over 90 characters, 0 hovers over 110, no page errors. Nothing to cut. Stills and the scan are in
`docs/ui/copy-sweep/editor/`.

## Proposed one-line rewrites (for the Coordinator to rule on)

Swell cell (`src/app/setup.ts:290`), now cut mid-aside at "…(the buoy reads 5 ft with the ocean's own wind waves, which…":
- Proposed: `Swell 1 ft here · 4 ft, 13 s outside the Gate · buoy 5 ft with wind waves`

Past-race caveats (`src/app.ts` ~1793), each cut mid-aside:
- Course uncertain: `Course 3 as the sheet draws it: a perfect boat in the Fort Point wind (9 kt) finishes in …` (keep the wind and the time; the "perfect boat" explanation goes behind the existing hover/Why)
- Distance: `Results say 6.1 nm; the sheet, drawn here, says 3.7 nm`
- Course from a sailor: `Course from the owner, who sailed it: "a last-minute change"`

The cruise boat sentence (`src/sim/world.ts:2018`): the Coordinator proposed "Bay cruise boat approaching at 11 kt. She isn't racing: the Collision Regulations apply. Expect a wake." (a boat racing meeting a vessel not racing follows the Collision Regulations, RRS Part 2 preamble; "keep clear" is an RRS term). Not applied from this session: src/sim is outside the UI brief.
