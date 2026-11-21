# A new player's first hour: rough edges (v215, 5de4d67c)

Walked on 21 Nov 2026 in the dev page, with storage cleared. The route: the start page, a cruise, Learn to sail
(lesson 1), the start drill, Practice and a race, the Season, Past races, the Yacht Club (boats, members, season, her
page, the editor) and Settings. Headless Chromium at 1440×900; the stills are in docs/ftue/first-hour/. The page threw
no errors along the way.

Sizes: S is under 1 h, M is 1–3 h. Lines are v215's. **No fixes made.**

| # | Where | What | Still | File:line | Size |
|---|---|---|---|---|---|
| 1 | Lesson 1, The boat | **A dead end.** The lesson hides the HUD, so its Exit button goes too. Only Esc leaves, and nothing on screen says so: the player sees only the "Find the hull · 1 of 43" chip. | 09-lesson1 | src/app.ts:1342 (Esc closes it); src/app/boatLesson.ts:55 | S |
| 2 | Lesson 1, left by the start page | **Its chip stays on.** Leave lesson 1 by any way but Esc and "Find the hull · 1 of 43" stays over the start page and Settings: openHomeNow doesn't close lesson 1. | 30-settings | src/app.ts:1742 (openHomeNow: no `boatLesson.close()`) | S |
| 3 | Lesson 1 | 43 parts, one at a time, is long for a first lesson. Worth asking the owner whether there should be a shorter first pass. | 09-lesson1 | src/app/boatLesson.ts:55 | M (design) |
| 4 | First sail (cruise) | **No help for a brand-new player:** nothing says how to steer or trim. The plan's orientation ("click the water to take the tiller", then tack, trim and the chart, five prompts) isn't built yet. | 04-first-sail | docs/FTUE-PLAN.md §2 (step 5) | M |
| 5 | Cruise setup | **A control that doesn't answer.** "Start from her slip" is disabled for a new player with no slip, but it looks the same as the enabled buttons; the reason is only in a hover tip. The hint beside it still says "Click the water, a place or her slip". | 03-cruise-setup | src/ui/setupChart.ts:65–69 | S |
| 6 | Cruise setup | "To: nowhere in particular" reads oddly as a destination. "Anywhere" or "—" would do. | 03-cruise-setup | src/ui/placeNames.ts:17 | S |
| 7 | Lessons | "0 of 12" sits under the grid with no word saying what it counts (passed). Lessons 2 and 12 are grayed for a player with no slip, with the reason only on hover. Lesson 9 is grayed as "Coming", the same way. | 08-lessons | src/ui/lessons.ts:24–28 | S |
| 8 | Start drill and race | **The coach's first words to a new player are about rig tune:** "Her rig was set for more wind than this: it costs her about 1.6% of her speed upwind. Backstay off, and sail a little lower." That's two sentences, cut off in the card. It shows on the first drill, on KESTREL as she comes. | 13-start-drill-later | src/boat/coach.ts:681 | S (words); M if the default tune is wrong for the day |
| 9 | Race page | The Past races card's line is long: "A real San Francisco Folkboat race on its day, or one of yours again: the same course, fleet, day and start". The rule is one short line. | 15-race-page | index.html:183 | S |
| 10 | Behind every menu | **The race's displays show behind the Race, Practice and Yacht Club pages:** "Start in 5:00", the start line and the coach, with the clock stopped. Only the start page hides them. | 15-race-page, 27-club-season | src/styles/04-screens.css (`body.atHome` hides them on the start page only); src/app.ts showPlace | M |
| 11 | Yacht Club, Season tab | A block of copy at the foot: "Low point · level ratings (the real fleet's equal PHRF time on time) · one throwout only once all five races are sailed". The head line says "0 of 1 sailed · 4 more races to come, as published · no throwout". "DYC ·" sits alone above the season menu. | 27-club-season | src/ui/season.ts:51, 53 | S |
| 12 | Yacht Club, Members | A member's line is long: "Forward hand on KESTREL USA 000 (the jib and the pole) · 5'8", 159 lb". | 26-club-members | src/ui/members.ts:63 | S |
| 13 | Season page | Race 1 (Sat Nov 7) shows as "Next" on 21 Nov, a fortnight after it was sailed. It's right that you can sail a past race, but "Next" reads oddly. | 23-season | src/ui/seasonView.ts (nextRace) | S |
| 14 | Settings | The title says "Settings" twice: the eyebrow over the heading, and the heading. | 30-settings | index.html:423 | S |

**Checked and fine:**
- No UK spelling in what the player read on this route.
- No page errors.
- The loading start page, Practice's rows, the course list, the flags, the sequence picker, the club header, Registration and the editor's sections all answered.
- The "More about the day" note is long, but it sits behind its link, as the rule allows.

**Not reached in this walk:**
- the start drill's debrief (the drill was still before its gun when the walk moved on);
- a race's finish and its results.

These need a longer run, or the clock sped up further.

## Part 2: the start drill's debrief, a first race to the finish, a ghost, a season race (v215, 5de4d67c)

Walked on 21 Nov 2026 with storage cleared:
- the start drill through to its debrief (the race in the page's thread, the clock stepped on);
- `scripts/check/ghost.cjs`: a race sailed to the finish, saved, and sailed again with its ghost;
- `scripts/check/season.cjs`: the season's first race sailed, saved and in the standings.

Both flows work end to end, with no page errors. The season script's one failure is the script itself (item 21).

| # | Where | What | Still | File:line | Size |
|---|---|---|---|---|---|
| 15 | Start drill's debrief | The panel's top ("Start practice", the eyebrow) sits under the heading tape, which is drawn over it. | 31-drill-debrief | index.html:399 (#drill); src/styles/18-layout-d.css:10 (#compassBar, z-index 4) | S |
| 16 | Start drill's debrief, the tide line | "turns to flood ~16:35": in that lettering the tilde reads as a minus, "-16:35". | 31-drill-debrief | src/sim/world.ts:3239 | S |
| 17 | Start drill's debrief | "No call · X favored 38°": a new player won't know that X is an end of the line, or what the 38° is. | 31-drill-debrief | src/app/drills.ts:150 | S |
| 18 | Race results | "Fouls you committed: 0. Fouls against you: 0." sits above protests that find you broke rule 12 and rule 16.1 (turns taken). The count is of fouls left unpenalized, but it reads as a contradiction. | 32-race-results | src/app/results.ts:370 | M (what to count is a rules call) |
| 19 | A ghost race | The strategist's rule note says "You're windward of USA 000", which is your own number: the ghost (or your old run) seems to be counted as a boat in the rules' notes. To confirm. | 34-ghost-race | src/rules/explain.ts:165; the ghost in replay/ghost.ts | M |
| 20 | Past races | Each real race's row carries its caveats in full ("the published distance disagrees with the course sheet", "course from a sailor in the race (a last-minute change)"), up to three lines a row. One short line each, the caveats on hover. | 33-past-races | src/app.ts:1792 | S |
| 21 | scripts/check/season.cjs | Its results check still looks for the real series name ("Seaweed Soup"), so it fails on the parody name the page now shows ("Kelp Chowder: 1st · 1 nett …"). A stale check, not a page fault. | — | scripts/check/season.cjs:53 | S |
| 22 | Past races | The real races are "Kelp Chowder Regatta 2026–27 · race 1", while the season calls the same series "Kelp Chowder 2026–27". One name would do. | 33-past-races | club/raceNames.ts, club/data/real-race-names.json | S (the owner's names: ask first) |

**Fine:**
- The ghost is drawn and moves with the clock, and its menu reads "Ghost: your best (3rd, 88:24)".
- The where-next card shows "Ghost: level with you".
- The season race is kept and the standings are right: USA 000 1st, the club's boats by sail number, as the owner's rule asks.

**Already fixed, in v216:**
- the debrief's 1/2/3 min buttons (now the − n + picker);
- the "DYC ·" above the season menu and the long season footer (#11);
- the heading tape over the menus (#10).
