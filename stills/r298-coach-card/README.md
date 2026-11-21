# r298: the bottom-left Coach card, options (no code shipped)

(r298, ROADMAP 8s19. An earlier commit here said r297 in error; r297 is crew mistakes under load.)

The owner: "why does it say Coach at the top and Trim Coach at the bottom?" Their brief:
- drop the TRIM COACH button, and make the whole card the way in;
- style its title like Messages;
- in racing, the most pertinent trim line and the most pertinent racing line.

The owner, while these were drawn:
- in race mode the card is **Strategist**; cruising, **Trim Coach**;
- race messages name a boat by country and sail number (USA 110), except the default boats (Red, Blue, Varnish …), which keep their names.

All stills are 1920×1080 over the real page (mock.cjs); `sheet.jpg` shows the bottom-left of each side by side.

| Still | What |
|---|---|
| `0-today-race.jpg`, `0-today-cruise.jpg` | today |
| `A-race.jpg` | **A: one card, two lines.** The situation merges in as the racing line. |
| `A-race-quiet.jpg` | A with no rules situation: the racing line falls to the next most pertinent (the start). |
| `B-race.jpg` | **B: alert above, Strategist below.** The situation stays its own red card, only while there is one; the card's racing line is tactics. |
| `X-expanded.jpg` | the expanded view (either option): a click on the card grows it up in place |
| `C-cruise.jpg` | cruising: **Trim Coach**, its two most pertinent trim lines |

## The three questions

**1. Does the situation pod stay separate?** Recommendation: **A, merge it.** One card, one place to look. The rule chip (red `R10`) keeps the urgency without a second card. B keeps a red alert that comes and goes, at the cost of two cards stacked.

**2. How is "most pertinent" ranked?** There are two lanes, one line each; a lane with nothing to say shows the other lane's second line.
- **Racing lane:**
  1. a rules situation with contact possible (keep clear, room, hold your course);
  2. over early, or a penalty owed;
  3. the start's timing in the last minute (burn, go);
  4. a laylines or shift call (strategist);
  5. the next mark.
- **Trim lane:** the trim fault costing the most speed (the coach's own severity, boat/coach.ts), then heel and helm, then fine trim.

Each line holds a few seconds before a lower one replaces it; a higher one cuts in at once.

**3. The expanded view.** It grows up in place from the card:
- **Racing:** both racing lines.
- **Sails:** pills for main, jib, heel, helm and crew; "crew amidships" moves here.
- **Lines:** each line's one-liner, from Trim Notes.

A second click collapses it. There's no new button; ▸ / ▾ in the title is the only cue.
