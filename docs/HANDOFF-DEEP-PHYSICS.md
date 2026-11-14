# Deep Physics: handoff (updated 13 Nov 2026, late; Fable session)

Supersedes the copy on branch `rudder` (kept there for its "things not to relearn", which still hold).

## Branches

| Branch | State | What's left |
|---|---|---|
| `car-lead` (PR #236, f392fbf) | Full suite passes except the old approx yardstick on its own 16 seeds (sampling: on 32 new seeds 20 Hz 62 against every step 73; on 64 more, every-step fouls 120 against main's 120) and perf (about 2% over main back to back before the lead table; unresolved on this host after it). Dock-jib line fixed with a test. | Rebase on Rules' paired yardstick (`rules-approx-stats`) when it lands; the Coordinator measures perf on their host. Then the full suite again. |
| `shore-relief` (no PR, 074da61) | Windage: ORC's sizes bow-on and beam-on, the hull between by Blendermann 1994 (via Fossen's MSS code), mast and crew along the wind; `windFore`, `windSide`. One physics review done and fixed (mast and wire from the class rules, bare mast, windage in the steered leeway). Full suite on main 93c21f7: all pass but three yardsticks at their edges, put to the Coordinator: crew "told to hike" 39 against < 30 (one downhaul trip moved by the tack), crew flicker 85 against < 80, abandon-home 20 against < 20. A NaN in the steered leeway (negative side force) was found by the suite and fixed; approx and sim-fleet need rerunning. | The Coordinator's ruling on the three; rerun the full suite; a second review round on the fixes; PR. |
| `turning` (no PR) | The owner-approved force-based turn, on top of `shore-relief` and the class rudder (`rudder`'s 76f2b40). `src/boat/turning.ts`; moveBoat's steering block; hove to shares the rudder, strips and windage lever. test:fast: 18 failures, sorted below. Whole-race suites not yet run. Perf: a lone boat's step +0.7 µs (about 5% of 13 µs), under 1% of a fleet step; the fleet ratio on this host read 44.8–45.8 against main's 43.2–43.5, within its noise but not shown clear. | See "Turning: what's left". |
| `mainsheet-point` (PR #165) | Unchanged: waits on Crew Figures' crew-still. | |
| `rudder` | Superseded by `turning` (its blade commit is in it). | Delete once `turning` lands. |

## Turning: what's measured

- Turning circle 9.2 m radius at every speed (the old constant was 9 m).
- Weather helm with the class blade: 0.4° at 12 kt, 1.5° at 20 kt. Light; the sail-moment calibration waits on the owner's helm answer (flagged, don't tune to tests).
- Crew tack at 12 kt: 3.3 s head to wind, mean 10.9°/s, lowest speed 0.61, loss 3.4 s (main 3.2). Gybes as main's table.
- Tiller hard over: a circle in 35–45 s, so a 720 on the rudder alone is about 80 s; the AI's backed-sail spin keeps PENALTY_TURN_RATE.
- Bare poles: she settles with the wind 86° off the bow in about 80 s from any attitude, drifting at half a knot. Computed from the drawn boat's levers (dynamics.ts `windTurn`), not observed: an OWNER ASK is out.
- `b.helmNeed` now includes the windage's moment and the hull's broadside drag, at her own speed (floor 0.5 m/s, was 1.8).

## Turning: what's left (test:fast's 18)

- Re-measure last: routing `MANOEUVRE_LOSS` tack row, drill `SIM_CREW` tack rows (scratchpad harness `zz-measure.test.ts`: copy into tests/, run with OUT=file).
- Waiting on the helm calibration: balance.test's four helm tests.
- Rules' (told, with traces): rule20 slow hailed boat (TACK_BEGUN's 15° takes about 5 s at 0.9 m/s now), arcs.test's 90° turn (167.7 against > 170).
- Encode the old model, need the Coordinator's OK to restate: drill "full helm … turns at least as hard" (a stalled blade turns slower now: 10.6 against the crew's 12.2°/s) and "half helm is slow through the eye" (12° of helm is near the blade's best now).
- To look into: coach and drill heave-to sequences (lashed she settles as before, 62° off at 1.1 kt, but with the tiller amidships and the jib aback she bears away faster: the class blade's skeg effect in heaveTo's sway inflow, `HOVE.rudderFlow`), irons SCULL 2 (coasts 2.6° on her momentum against 2°), and small shifts: pinching 0.98760 against 0.988, drifter heel, old sails, crew flicker 82.
- Then: full suite, physics review (Fable), the PR. Remove `HOVE.windLever` and the CONSTANTS.md rows for turnRadius, maxTurnRate, turnDrag.

## Queue after turning

- ROADMAP 8n point 4: eddies at the Gashouse Cove entrance, on Bay East's current field (bay-east-15 and their harbor-wall lee). A researcher's report on the local stream, the geometry and the eddy literature was commissioned (results in the session, not saved).
- Audit #23's remainder (see `rudder`'s copy), now including: calAt's clamp (the sail model's raw drive falls short of the polar's need in two cells in five).

## Owner asks out (through the Coordinator)

1. Josephine's weather helm close-hauled in 15–20 kt.
2. The jib car's position.
3. How she lies left alone with her sails down, and how long her bow takes to fall off.
4. (Useful) her own timed 720.

## Things learned this session

- The approx yardstick's penalty check was noise-limited (±7 on a margin of 10 over 16 races); Rules replaced it with a paired per-seed test over 48 races.
- The owner's "drifts to windward under bare poles" was the tidal stream inside Gashouse Cove on main (0.30–0.35 kt), fixed by bay-east-15's basin calm; Bay East has the repro as a test.
- Run perf.test only on a quiet machine; anything beside it taints it. A lone-boat benchmark (cpuUsage over 36,000 steps) resolves 5% where the fleet test can't resolve 3%.
- Scratch tests go in tests/zz-*.test.ts (ignored locally via .git/info/exclude) and write to a file: console output is swallowed.
