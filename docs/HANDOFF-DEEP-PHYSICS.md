# Deep Physics: handoff (13 Nov 2026)

## Branches

| Branch | Head | State | What's left |
|---|---|---|---|
| `car-lead` (PR #236) | cff4f0e | **Held by the Coordinator.** Its full suite (main merged in) fails the AI yardstick, approx "sixteen races": 38 penalties at 20 Hz against 25 every step, bound 34.5. Main passes it. Everything else passes, apart from load timeouts. Two physics reviews are done. | Find the cause (see the bisect below) and fix it, then the full suite. Contents: the jib lead from North's car geometry (`JOSEPHINE_CAR` in controls.ts: 58 cm, a 2.65 m **tape** from the stay's pin, so `CAR_AFT` is 2.585 m and the lead 11.6–13.7°); boom stop 70° (`BOOM_STOP`, CR 7.20/7.60); jib aoa 16.5° (fitted to the lead, Gentry's upwash); crew car pick un-frozen; crewWork's big trip goes to `want`, not `lw` (Crew Figures OK'd); coach and hud say "the boom's on the shroud". |
| `shore-relief` (no PR) | 53601c4 | Two commits. (1) A comment in current.ts saying why there's **no flood/ebb factor** in the shore relief: mid-channel PCT0281 and Pier 35 SFB1205 ebb in the channel's own ratio, about 1.2, while Crissy's 3.7 (PCT0286) is Fort Point's lee on the flood and is already carried by that station. The 25 %/350 m profile is flagged as an estimate. (2) **Windage from ORC** (VPP 2023, §5.3, eq. 5.26, Table 5.10): `windCdA(awa, crew)` in dynamics.ts, 1.7 m² bow-on, 4.6 at 30°, 6.2 beam-on; it replaces `HANDLING.windageCdA` and `HOVE.windSide`. | test:fast has about 7 real failures from windage (the rest were load). Re-measure from the sim: routing.ts `MANOEUVRE_LOSS` (a 25 kt tack measures 5.5 s against the table's 4.3) and drill's `SIM_CREW` (25 kt 10.7 against 9.1). Look into: heaveto 25 kt (122 against < 120), motor tick-over (0.577 against > 0.6 m/s), balance "taking the mainsheet … changes nothing" (Δ 0.0077 against 0.005), heaveauto made-fast sheet, crew flicker (80 against < 80). Then a physics review, merge main, the full suite, and the PR. |
| `rudder` (no PR) | e366827 (this doc after it) | **Parked** by the Coordinator. RUDDER is now the class blade (CR 5.20: 0.562 m², AR 4.16, Helmbold slope 3.97/rad). It breaks 12 fast tests balanced on the old weak rudder: heave-to, round-up, lee helm, carrying helm. Also holds `docs/TURNING-PROPOSAL.md`. | Waits on the owner (see owner asks). Don't retune tests to the unsourced sail moment. |
| `mainsheet-point` (PR #165) | f0dd429 | Waits on Crew Figures' crew-still / HOLD.react landing. Fails crew.test "sit still through the flicker" (81 against 80). Crew Figures is re-deriving that test in settled moves (limit 74 = main 69 + 5) and tracing a real 5-move interaction. | Merge main once crew-still lands, then the full suite, then hand the head to the Coordinator. |

Merged: `boat-wakes` (#226), `standoff` (#232), `legs-multiseed` (#197), `rules-gybe` (through #201).

## The car-lead bisect

Running in worktrees `/home/user/bisect-739ae07` and `/home/user/bisect-5f2b93d` (approx "sixteen races"). Results go to the scratchpad files `bis-*.txt`; see the Coordinator's message for the outcome if this container is gone.

Note: those commits sit on an **older main**, from before the merge commit 44335f9. If both pass, the culprit is the interaction with newer main. Then test car-lead's merge against main's head directly, or reapply car-lead's diff piece by piece on current main:
1. jib aoa;
2. crewWork `!big`;
3. lead geometry;
4. boom stop.

Prime suspects: the crewWork `!big` line, which changes crew timing, and the jib aoa or lead, which changes AI trim.

## Open owner asks (through the Coordinator)

1. **Josephine's weather helm** close-hauled in 15–20 kt (tiller degrees, or by feel). It gates the rudder.
2. **Approval** of `docs/TURNING-PROPOSAL.md`.
3. **The jib car**: the bar's centre off the centreline, and the distance aft of the forestay pin. The Coordinator asked the owner. The branch uses North's 58 cm; the drawing reads 0.66 m from a photo.

## Next, in order

1. Car-lead: find and fix the yardstick failure, then land it.
2. Windage (shore-relief): re-measure the tables and review, then the PR.
3. #165 once crew-still lands.
4. Turning and rudder, once the owner answers.
5. The rest of audit #23:
   - RESIDUARY against Fn, and formFactor (1.15 on ITTC-57 against ORC's 1.05 on Hughes);
   - controls targetShape/shapeEfficiency;
   - sailYaw's 0.55/1.6;
   - trim's stall and over-eased curve;
   - seaway's added-resistance spectrum (sourcing C_AW; Bay East's pitch loss of 0.5–3.3 % is in their PR);
   - at-rest roll damping (ζ 0.079 is Klaka's Van de Stadt 34 fin-keeler with the main up, at 2–4° amplitude; quadratic keel damping is missing; curate.curtin.edu.au would need allowing);
   - light-air jib twist (at its lead stop the sheet reads full tension, so twist drops 6°).

## Things not to relearn

- **turnDrag**, the speed bleed `0.15·v·|ω|`, is linear in the turn rate. Small corrections cost the AI 3–4 % of its beat speed: the mean |rate| on a beat is 1.2–1.9°/s. A full-helm tack, meanwhile, barely brakes her. One cause for both; the fix is the force-based turn, not a curve fit. The 720 takes about 72 s against a real 30–45 s (unsourced).
- **Fleet beat speed** (seed 4, training course, 12 kt, flat water): one AI boat alone is −3.3 % of polar; the fleet −2 to −12 %. A lone test boat sailed straight meets ORC. Bay East's flat-water figures against ORC: TWA 40, 2.31 against 2.40 m/s; 50, 2.60 against 2.65; 90, 3.03 against 3.03. Waves cost only 0.3–1.6 %, through seaDrag; the seed-4 fleet result was chaos.
- **escapes()** (src/boat/arcs.ts, Rules' file) has no tack deceleration in the no-go zone. A tack is predicted 20–38 % too fast, which is 2–3 m of distance. Skipper Model added a 0.18 m/kt margin. The real fix, `surgeAccel(v, 0, windage)` inside the no-go zone, is for Rules to make; review it when it comes.
- **HOVE constants** (physics.ts): latArea, crossCd 1.0 (Hoerner), swayAdded 0.9, yawAdded 0.4, gyration 0.25, rudderFlow 0.5 (estimate), windLever 0.3. `SWING_DRAG` is in world.ts. Paddling (Crew Controls) and dock lines (Marinas) reuse them. Marinas' dockStep **replaces** moveBoat while a line is ashore (no Boat.ext); the handoff in both directions is tested continuous. They'll switch yaw damping to Crew Controls' `yawDamping(u)` when it lands.
- **Shore depths**: depth-grid.json covers only San Rafael and San Leandro Bays. The Cityfront needs `chartDepth` (sea.ts, an ENC polygon scan: slow, coarse bands 2.7/7.3/13.6/22.8 m).
- **Research hosts**: these are allowed now: apps.dtic.mil (DTIC itself still 403s automated fetches), ntrs.nasa.gov, ocw.tudelft.nl (Journée & Massie downloaded; §6.3 has the equivalent-linear damping, b_eq = b1 + 8/(3π)·ω·φa·b2), espace.curtin.edu.au (redirects to curate.curtin.edu.au, which isn't allowed). The TU Delft repository's Keuning papers are embargoed.
- **Process**: merge main and run the full `npm test` before a PR. "OWNER ASK:" messages go to the Coordinator. Don't move test bounds; restate a test only to its intent, with the Coordinator's OK, in the same units.
