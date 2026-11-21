# Marina audit (v216, on v215 5de4d67c)

This audit covers the six harbors that have slips: West Harbor, Gashouse Cove, South Beach, the Olympian YC (Corinthian), Horseshoe Bay and the Brickyard RC (Richmond YC). In each one she had a home slip, and the audit ran a cruise from it:
- in her slip;
- pushed off;
- brought back in along her harbor's own way in (`harborRoute`), reading the dock hint and the destination's tag at 45, 30 and 18 m off;
- G pressed, and in to her berth.

The page run is `scripts/check/marina-audit.cjs`, with a dev server and `?inproc`. The berthing was also run headless, as `docking.test.ts` does: straight in from 9 m out at 0.4 m/s, sails down, lines ready, at 2, 8 and 14 kt westerly.

One pass, kept light because usage is light until Tue 24 Nov.

## What's right
- **Push off:** each harbor starts made fast in her slip, and Push off answers in each. South Beach, Horseshoe Bay and Richmond have a hand swing her stern; the others walk her out on a slip line.
- **The way in:** the hint ("G · lines ready") and the tag ("Home") are right at 45, 30 and 18 m off in all six. The Lines-ready row shows, and G readies her lines for her own slip.
  - Stills: `audit/<harbor>-3-coming-in.jpg`.
  - Seen from behind her, the hint is placed by the boat, so it's hidden when the camera looks away from her. That's as designed.
- **Berthing:** headless, she berths and reads "In her berth" in under 70 s, at 2 and 8 kt, in five of the six. The sixth is Richmond's southwest-facing slips (item 1).
- **Errors:** no page errors in any harbor.
- **US spelling:** what the player reads is clean (`scripts/check/spelling.cjs`). Its only hits are a Sausalito marina's real name, spelled the British way, in two docs/marinas notes, so they stay.

## Items

| # | What | Still | Where | Size |
|---|------|-------|-------|------|
| 1 | **Richmond YC: her lines made fast, but never "In her berth", in slips facing about 209°.** Seen at D6, D44 and C34, with the westerly about 70° on the bow. The lines are all warped to their lengths (bow 2.1, stern 1.8, spring 3.1 m), but she lies 0.85–0.97 m and 9–13° off the berth. `inBerth` asks 0.6 m and 6° once warped, so she sits at "Made fast" for good. She's never `docked`, so her logbook, laid-up state and "In her berth" never come. The slips facing about 29° are fine at 8 and 14 kt; D6 fails at 8 kt, the others only at 14. Either the lines' goals should hold her in the slip against a beam wind (in real life the crew would take up the windward spring), or the tolerance should follow the lines. This needs the physics reviewer. | `audit/richmond-yc-4-lines-ready.jpg` (she's coming in under "Closer"; the page ran slow, see the note below) | `src/sim/world.ts:2203` (the made-fast check), `:2210` (`inBerth`), `goalLen` `:2222` | M |
| 2 | **Berkeley's only berth, the Berkeley YC guest dock alongside, has a moored boat in it.** So Berkeley never has a free berth, and G there says "No free berth here". `mooredIn` fills every slip at the default 78%, guest docks included. | (none: Berkeley has no slip to be home to) | `src/geo/marina.ts:295` | S |
| 3 | **"Heading home: her slip, Slip 405, West Harbor."** The toast says slip twice. It should read "Heading home to Slip 405, West Harbor" (or "to B22, Olympian YC"). | (toast) | `src/sim/world.ts:2729` | S |
| 4 | **The trim coach with her sails struck, coming in: "Sails going up (or down): the coach waits until they're set."** They are set: down. The line shows whenever either sail isn't fully up, moving or not. It should say so only while a sail is moving. | `audit/richmond-yc-4-lines-ready.jpg` (bottom left) | `src/boat/coach.ts:701` | S |
| 5 | **Six East Bay harbors had no slips** (Oaktown YC now has 26, see below; the other five wait on the harbors' own plans, no fingers inferred): Live Oak YC (Encinal), Oaktown YC, Harbor Town (Marina Village), Fortmann, Grand Marina and Alameda Marina. None can be a home or take her lines; they're water and docks only (`marina.ts:47` says their slips aren't published where we could reach). This needs the slip data, as Richmond's came from its harbor plan. | (none) | `src/geo/marina.ts:53-58` | M |
| 6 | **UK spellings in code comments:** `src/geo/marina.ts` (15), `src/geo/shore.ts` (12) and `src/render/marina.ts` (10), the British spellings of meter, center and harbor. None is player-facing. `colour` is also a field name (`MooredBoat.colour`), so it stays. Comments only; leave them until the files are next touched. | (none) | as listed | S (not fixed) |

## Notes
- **The page ran slow.** In headless Chromium (software GL) the sim ran about a tenth of real time: "+0:04" after about 45 s. So the page run's berthing timed out mid-way in every harbor. The berthing results above are from the headless runs, which step the sim directly.
- **Docks against the chart:** no slip or dock looked out of place in the stills (`audit/<harbor>-1-slip.jpg`). Corinthian's slip B22 lies in a wind shadow (the TWS reads 0, "LEE −80%"). That's real for a slip under the Tiburon shore, not an error.
- **The tie-up check** (`scripts/check/tie-up-home.cjs`, Gashouse Cove 572) covers the same steps in one harbor. This audit runs them in each.

## Oaktown YC (Oakland YC), slips added (item 5, the first of six)
- **Where they come from:** regenerated from OSM (`scripts/make-marinas.mjs oakland-yc`, fetched 21 Nov 2026), with `noSlips` off. Its basin, walkways and 20 fingers are unchanged from the 12 Nov fetch.
- **26 slips,** along the mapped fingers only, none inferred, numbered by the sim (the club's own numbers aren't published where we could reach). That's against the club's roughly 200 slips (Latitude 38, from a search snippet, https://www.latitude38.com/?p=115975).
- **Four piers left out:** four mapped piers run 32–33 m out from the walkways, which is a side-tie's or a short dock's length, not a slip finger's. Slips along them would be 32 m long, and push off failed at all four (B4, C3, E3, F3 in the first run). `slipFingerMax: 20` leaves those piers without slips. The 20 m (about 65 ft) is an ESTIMATE.
- **Push off:** every berth passes (`pushoff-all.test.ts`), and the sweep passes with no touches.
- **Berthing** at all five free bow-in slips (B3, B4, C4, E2, E4), at 2, 8 and 14 kt westerly: in her berth every time, in 36–57 s.
- **The page run** (`marina-audit.cjs oakland-yc:B3`):
  - pushed off;
  - the hint "G · lines ready" and the tag "Home" at 45, 30 and 18 m;
  - G readies her lines for B3;
  - "Heading home to B3, Oaktown YC";
  - no page errors.
  - Stills: `audit/oakland-yc-1-slip.jpg` and `audit/oakland-yc-3-coming-in.jpg`.

