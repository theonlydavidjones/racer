# Deep Physics: handoff (updated 14 Nov 2026, midday; Fable session)

Supersedes the copy on branch `rudder` (kept there for its "things not to relearn", which still hold).

## Branches

| Branch | State | What's left |
|---|---|---|
| `turning` (PR #289) | The force-based turn, with `shore-relief` and the class rudder inside it. Main v188 and Rules' `rules-turning` merged. Five helm tests marked `it.fails` until the owner's weather-helm answer. Perf inside the gate by perf-pair on two hosts (1.0075, 1.0028). Grounding: after 15 s aground she may be worked free (RRS 42.3(h)). | Lands with Skipper Model's #276 (the fleet fouled twice as often on main's AI with this turn: fouls-per-start test). Merge main again before it's batched. |
| `fouls-per-start` (02f5d8d9) | The test that caught it: 16 umpired starts; main 23 fouls, turning on main's AI 42, #276 25; bound 28. Excluded from test:fast. | Rides in with #289/#276 (in #276's base). |
| `harbor-mouth` (PR #308, against Bay East's #300) | The Gashouse Cove entrance: the shed eddies, the gyre and the pile lee (src/environment/harborMouth.ts), reviewed three times. Paired perf 0.988. | In the Coordinator's batch. |
| `astern-drag` (PR #317, against `turning`) | Sternway on twice her hull's resistance (an estimate) in place of the unsourced ASTERN_DRAG. Reviewed; fixes in. | HELD: shoved astern at SHOVE she now runs 37 m and hits the far side from nearly every such berth hands-off; Marinas to size the shove by asternCoast or test it steered. Then: asternDrag at her mass with crew (held out: it tips abandon-home). Retarget to main after #289. |
| `tack-by-boom` (PR #318, against `turning`) | Her tack by the RRS definitions: by the lee her mainsail's side, changing when the boom has crossed. Reviewed; fixes in. | Waits on Skipper Model's fix for the abandon-home encounter (AI hunting about dead downwind in 26 kt). Retarget to main after #289. |
| `drive-blend` (c7a7c874, PARKED) | The beat angle's jumps in chop: the residuary table made a monotone cubic, the drive curve blended across knots and angle bins. | After #289/#276/#317/#318: rebase; five test:fast failures to settle with their owners (tack table at 20 kt, mine; crew.test hike and crewfig; protests; passageNow ending on land, a real bug from the drive blend). Consider zeroing the residuary's linear toe under Fn 0.1 here. |
| `car-lead` | On main through Boat Detail's #291; sim-fleet runs 18 seeds, bound unchanged. | Nothing. |
| `red-loop`, `rudder` | Done with. | Delete. |
| `mainsheet-point` (PR #165) | Unchanged: waits on Crew Figures' crew-still. | |

## Turning: flagged, not settled

- The sails' turning moment (weather helm), the stall angle and post-stall force of a keel-hung blade, the sculling stroke (60°, 1 Hz, 2:1) and a hand's 180°/s, the crew's windage term and lever (the bare-poles lie hangs on it), the keys' half-pace return.
- heaveTo's b.helm is the raw tiller, unslewed. rudderForce books the blade's lift and drag in the boat's axes without turning them through the inflow angle (a few newtons at rudderFlow 0.4).
- The coach's heave-to sequence test sits on a knife edge (the main's luff reads 0.17 against 0.15 on main): it passed at rudderFlow 0.40 and failed at 0.38 and 0.42.

## Queue

- When the owner answers the weather-helm ask: calibrate the sails' yaw moment, unmark the five `it.fails`, re-measure the tack tables, send "OWNER ASK DONE:".
- Audit #23's remainder (see `rudder`'s copy), including calAt's clamp (the sail model's raw drive falls short of the polar's need in two cells in five).

## Owner asks out (through the Coordinator)

1. Josephine's weather helm close-hauled in 15–20 kt.
2. Her own timed 720.
3. How hard and fast they scull her.
4. How far she glides from a slow-walk shove in calm water; her speed under one paddle.
5. Whether the main should hold 15–20° by the lee before it comes across (now 4°). Not to be built until answered.
6. How she lies left alone with her sails down, and how long her bow takes to fall off.

## Things learned this session

- The approx yardstick's penalty check was noise-limited (±7 on a margin of 10 over 16 races); Rules replaced it with a paired per-seed test over 48 races.
- The owner's "drifts to windward under bare poles" was the tidal stream inside Gashouse Cove on main (0.30–0.35 kt), fixed by bay-east-15's basin calm; Bay East has the repro as a test.
- Run perf.test only on a quiet machine; anything beside it taints it. A lone-boat benchmark (cpuUsage over 36,000 steps) resolves 5% where the fleet test can't resolve 3%.
- Scratch tests go in tests/zz-*.test.ts (ignored locally via .git/info/exclude) and write to a file: console output is swallowed.
- Single perf runs on the shared host swing ±10%: only scripts/check/perf-pair.mjs (paired, alternating) settles a perf question.
- abandon-home's close-quarters count flips on any few-percent physics change (a different case each time): the AI there sits at the bound. Skipper Model has it; don't restate the test.
- After every merge: `git grep -n "^<<<<<<< "` before committing.
- A Boat field read in the step must be predeclared in World's boat literal (the object's shape stays one hidden class).
