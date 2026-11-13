# How she turns: a proposal (Deep Physics)

This proposal is for the owner to approve. It is a design change to how the boat steers.

## In one line

She would turn by her rudder's real lift and drag, as the sim already does when she's hove to, instead of by a fixed turning circle and a flat speed charge. Small corrections become nearly free, a hard helm brakes her, and the rudder is the class's blade.

## What you'd feel at the helm

| Situation | Now | After |
|---|---|---|
| Steering a steady beat (small corrections) | Every correction costs speed in proportion to how fast she turns. The AI loses **3–4 %** of its beat speed this way. | Cheap. A rudder's drag grows with the **square** of its angle, so a nudge costs next to nothing. |
| Throwing the helm hard over | Barely brakes her. A slammed-tiller tack costs only about 10 % more than the crew's smooth one. | The blade stalls past about 15° and brakes hard. A rough tack costs clearly more than a smooth one. |
| A 720 penalty | About **72 s** of turning (real boats in a breeze: about **30–45 s**, a coaching estimate, unsourced). | Her real turning circle sets it. The prediction is about 40–50 s. We'd check it against your own timed 720. |
| Weather helm | The tiller angle comes from a rudder **25 % too small** with **⅓ of its real aspect ratio**. | It comes from the class blade, waiting on your answer about Josephine's helm (see below). |
| Heaving to, docking, paddling | Already force-based. | Unchanged in kind, now with the same rudder as everywhere else. |

## What's sourced and what's an estimate

| Part | Source | Status |
|---|---|---|
| Rudder area 0.562 m², span 1.53 m, aspect ratio 4.16 | NFIA Class Rules 2025–28, rule 5.20 (the blade's offsets) | **Sourced** |
| Rudder hung on the keel, no gap | Class rules 4.70 and 5.40 | **Sourced** |
| Lift slope 3.97 per radian | Helmbold's lifting-surface formula (1942), which fits Whicker & Fehlner's 1958 rudder tests | **Sourced** (textbook) |
| Rudder drag: profile plus induced (CL² / πA) | Standard foil theory | **Sourced** (textbook) |
| Past the stall, about 1.2 broadside | Hoerner, flat plate (already used for the backed jib) | **Sourced** |
| Stall angle about 15° | No primary figure reached (the DTIC report blocks downloads) | **Estimate, flagged** |
| How much the hull above the blade raises its effective aspect ratio | Molland & Turnock 5.5, not reached | **Estimate**: taken as none, the cautious choice |
| The flow at the rudder behind the keel (now 0.5) | Keuning's Delft papers, embargoed | **Estimate, flagged** |
| Hull and keel's resistance to turning | Already in the sim: keel lift with way on, Hoerner cross-flow drag | **Sourced** (in use) |
| The sails' turning moment (weather helm) | Not found; the North guide only speaks of "rudder pressure" | **Waiting on you** |

**The one question for you.** Roughly how much weather helm does Josephine carry close-hauled in 15–20 kt? Tiller degrees, or "two fingers", "a firm hand" or "both hands" is fine.

With the class blade, the sim's present sail moment gives only about 2° of tiller in 20 kt. That's probably too light, but your answer is the best source we have.

## What it changes

**Removed:** the fixed turning radius (9 m), the turn rate cap (22°/s) and the flat speed charge (turnDrag 0.15). All three are uncited.

**Same:** straight-line speeds, which are pinned to the ORC polar. The beat gets about 3 % faster for the AI and for you on autopilot, which is closer to ORC.

**Tests that would move.** These have to be re-measured, not refitted:
- The tack tables (the passage planner's manoeuvre costs, and the coaching's tack and gybe yardstick). Both are measured from the sim by design.
- Boat tests on tack time (5–9 s) and speed loss (50–70 %). We'd check these against the same sources they cite today.
- Turn-rate and penalty-turn tests (the 720).
- Heave-to and weather-helm tests (12 of them already move with the class rudder alone).
- The AI's escape predictions (Rules' `escapes()`) follow automatically, because they read the turn model live.

**What it costs to run.** It's one small force sum per boat per step, the same one the slow-speed model already does. Expected perf change: about 1 %.

## Hours

| Step | Session time |
|---|---|
| One turning model at every speed, with the class rudder | 2–3 h |
| Re-measure the tack tables and the coaching yardstick | 1 h |
| Re-check the tests above against their sources, and fix what's really wrong | 2–3 h |
| Physics review (two rounds) and the full suite | 2 h |
| **Total** | **about 7–9 h** |

The weather-helm calibration waits on your answer and adds about an hour once it arrives.
