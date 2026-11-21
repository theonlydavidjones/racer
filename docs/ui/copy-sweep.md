# Copy sweep (21 Nov 2026)

The owner's rule: "these blocks of tiny copy are useless. nobody will ever read this." At most one short line where the
player needs it to act; methods and caveats behind one hover or a "Why?", or cut.

How: `docs/ui/copy-sweep/sweep.cjs` visits each page and menu at 1280×720 and lists every block of copy (the text a visible
element holds itself) over 90 characters and every hover over 110 (`docs/ui/copy-sweep/sweep.json`; stills beside it). It
reaches: the start page, Race (choose, practice setup), Cruise setup, Drills, Past races, Season, the Yacht Club (Boats,
Members, Season), Settings (Training aids, Keys), Tools, the pause screen, Lessons. Not reached by the capture: the boat
editor (the first run did not open it), and the results (the AI's skipper did not finish in time). Those, and every state
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
