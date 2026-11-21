# Debrief audit: the debrief, the results, the race replay, the Strategist card

Coordinator 2, 21 Nov 2026. Read on 5de4d67c, after a Practice race at 12 kt and one at 22 kt (Seaweed Soup 2 course, westerly, starting on the water). Boat 0 was sailed by the AI skipper, as `scripts/check/race-replay.cjs` does, then handed back to the page.

Stills are in `stills/`. The capture script is on the session branch's scratch (aud/run.cjs) and isn't committed.

| # | What | Where | Size | Still |
|---|---|---|---|---|
| S1 | The replay names the club's boats "US 87 Red"; the results, the same boats "Red USA 87". Different country code, and not the owner's "USA 110". | src/app/results.ts:88 (`b.no`, which the results table rewrites at :369 and this doesn't) | S | 12-replay, 12-results |
| S2 | The start's debrief says the favored end twice: "…The X end was favored by 19°; you started away from it. Favored end: the X". | src/app/results.ts:155 (appends `favLine` after a detail that already names the end) | S | 12-results-debrief |
| S3 | The grown Strategist card still cuts the situation line ("Green is clear astern and must keep…") where there's room for all of it. | src/styles/08-chase.css:169 (the line kept to one line, open or not) | S | 12-card-open |
| S4 | The card's rig line runs to two lines and a figure: "Her rig was set for less wind than this: it costs her about 1.1%…". | src/boat/coach.ts:681 | S | 12-card (**fixed**, 1303bfac, with the sweep in 3d4dee82) |
| M1 | "Fouls you committed: 0. Fouls against you: 0." over two protests that read "Broke: You · Turns: Taken". The count leaves out fouls the turns paid for. The debrief then says "1 penalty: 3 min 3 s doing turns" for those two incidents. A racer reads three different numbers for one thing. | src/app/results.ts:370; src/sim/world.ts:1607, 1827 (the counting) | M | 12-results |
| M2 | The protests fill most of the results: four blocks of nine lines each (hailed / flag / in time, then Contact · Broke · Turns · Exonerated tiles, then the decision). Proposed: one row each (who · rule · decision), the rest behind a click. | src/app/results.ts:298 (resProtests) | M | 12-results |
| M3 | The grown card's line notes say "In heavy air, the backstay stays off for full sails and power", and "the traveler in the middle". She was off the wind (the vang note says so), where that's right. But "In heavy air" without the point of sail reads as wrong upwind trim. Proposed: name the point of sail. | src/boat/coach.ts:422 (the crew's notes, `${In}`) | M | 22-card-open |
| M4 | The debrief's Rig tune and Dirty air both read "3 min 48 s" in the same race. That may be a coincidence; to verify that each counts its own time. Separately, "where it was right only part of the time" (medium tune in about 13 kt, inside its own 9–14 kt range) doesn't say what was wrong: the puffs above 14 kt. | src/sim/debrief.ts:292, 311 | M | 12-results-debrief |
| M5 | Missing for a racer: the results table has each boat's elapsed time, but not the gap to the winner or to you; the replay has it, the results don't. | src/app/results.ts:369 | M | 12-results |
| M6 | At 22 kt the race never finished. Boat 0, on the AI skipper, sat on leg 2 for more than 90 simulated minutes, so there are no 22 kt results here. That's an AI/sim matter, not these screens. For the Skipper Model and AI sessions. | (the AI skipper, src/ai) | M | 22-replay (leg 2 open) |

No overlaps were found:
- The grown card sits in the bottom-left above Crew · Auto, clear of the sail band and Messages.
- The replay and results panels cover the HUD by design.

Not checked this pass:
- The ghost review. It needs a saved race sailed again with its ghost (`scripts/check/ghost.cjs`, about 10 min).
- The 22 kt results (M6).
