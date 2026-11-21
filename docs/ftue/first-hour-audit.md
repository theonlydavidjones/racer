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
