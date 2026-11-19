# Traffic that gives way to sailing boats

Parked by the owner on 19 Nov 2026, with no route change in the meantime. To be built after the stability sprint as
one design. This file holds what was tried, what four physics reviews found, and the harnesses they used, so the
design can start from them.

## The bug

The owner's race on v208 (Seaweed Soup race 1, Course 2, 7 Nov 2026 at 13:35). Josephine was making half a knot over
the ground into a 2.4 kt ebb and was run down by the Bay cruise boat: wrecked, RET.

- The cruise boat's route (src/sim/traffic.ts ROUTES.tour) runs west straight down the course, from mark 6 at about
  37.8128 N.
- Every vessel's place is a pure function of the clock (traffic.ts `at`), so no vessel ever alters course or speed for
  anyone.
- The AI boats dodge every vessel early (World.keepClearOfShips). The player isn't steered, so a slow player is run
  down.

## The rules (sources read by the session's researcher, 18 Nov 2026)

- **Which rules apply.** Inside the COLREGS demarcation line (33 CFR 80.1142: Point Bonita through Mile Rocks to the
  shore) the Inland Rules apply, 33 CFR Part 83.
- **Rule 18(a)(iv).** "A power-driven vessel underway shall keep out of the way of … a sailing vessel", except where
  Rules 9, 10 and 13 require otherwise.
- **Rule 9 and the narrow channels.**
  - Rule 9(b): a sailing vessel shall not impede a vessel that can navigate safely only within a narrow channel.
  - NOAA Coast Pilot 7 ch. 7 (p. 272) designates the narrow channels for enforcement: all traffic lanes, separation
    zones and precautionary areas of the SF Bay RNA (33 CFR 165.1181), and a list of industrial channels. The
    Cityfront isn't among them.
  - The RNA's lane rules bind vessels of 1,600 GT or more. The container ship and tanker are therefore the Rule 9
    case; the ferries, tour boats and the Coast Guard boat give way.
- **Rule 13.** An overtaking vessel (coming up from more than 22.5° abaft the other's beam) keeps out of the way, sail
  or not. A later change of bearing doesn't end that.
- **Rule 8.**
  - Action shall be taken in ample time (8(a)) and be large enough to be readily apparent (8(b)).
  - It shall result in passing at a safe distance, its effectiveness checked until the other is past and clear (8(d)).
  - A vessel shall slacken her speed or take all way off if needed (8(e)).
- **Rule 17.** The stand-on vessel keeps her course and speed (17(a)(i)). She may act once the give-way vessel plainly
  isn't acting (17(a)(ii)), and shall act when collision can't be avoided by the give-way vessel alone (17(b)).
- **RRS 2025–2028.**
  - The Part 2 preamble: a racing boat meeting a vessel not sailing under the RRS shall comply with the IRPCAS or
    government right-of-way rules.
  - RRS 62.1(b)(3) gives redress for damage from a vessel required to keep clear. That's a follow-up for Rules.

## What was tried

### 1. The stand-off model (branch give-way, 6c1cf656 then 0e0ab65e): course and speed

The vessel slowed (8(e)) and stood off to one side of her route (8(b)), then rejoined her route and timetable. The
offset and lag were recorded in the race track.

**Review 1 (on 6c1cf656)**
- She hunted: the closest approach was predicted from her own turn. She did nothing until 230 m, and her heading jumped
  25–35° a step.
- She took the wrong side for crossing boats, standing off the way the boat was going. Some hits the old timetable
  missed.
- Her side flipped at the mark 6 corner.
- She jumped up to 99 m onto her berth.
- Docked boats made the Coast Guard boat give way.
- The AI still dodged everything, against Rule 17(a)(i).
- The toasts missed Rule 13 and motoring.
- The land probe was one point. She could stop forever with land on both sides.
- The wake used the current state for her past track.

**Review 2 (on 0e0ab65e).** The fixes held in open water: early, steady, astern of steady crossers, no corner flip, no
berth jump. But:
- The AI fleet did worse than on main: 8 vessel–boat contacts in eight Course 2 races, against main's 1. At her limits
  (150 m off, 30% speed) she never stopped and pushed through six boats running down leg 2.
- She turned toward boats that tacked or jibed near her: 21 hits in 144 tacking cases, about ten the timetable missed.
- Near land (Pier 45, Pier 33) she hunted against the probe and grounded. When her held side closed, she ran back
  through the boat.
- The AI's late dodge (Rule 17 "late") aimed astern of her, which for a boat ahead of her bow is into her.
- At the 150 m limit her heading was wrong by 23°. Rounding error decided her side dead ahead. Only the soonest of two
  boats counted. Toast wording.

### 2. The stop-only model (branch give-stop, c16b43f4 then b4ad46f1): speed only, on her route

The Coordinator chose this (19 Nov) to remove the land, side and flip failures. It passed the fleet gate: in 8 Course 2
races with 7 AI boats, no vessel contacts and no passes under 30 m, against main's 1 and 4.

**Review 1 (on c16b43f4)**
- test:fast failed: the mirror kept `traffic` by identity (sync.ts), and there was Math.hypot in the step.
- The AI's dodge aimed astern of a stopped vessel and brought boats from ahead into her.
- With no speed clear she always stopped. Boats tacking toward her route late were hit where the timetable missed: 14–31
  of 280 per vessel. The candidate speeds were predicted as if already reached.
- She was blind round her route's bends, and left her berth at full speed without looking.
- A boat inside her pass radius that she was leaving behind pinned her forever. The two cruise boats stacked. Lag was
  unbounded.
- Hunting between four speed steps; toast wording; the wake 4 s stale.

**Review 2 (on b4ad46f1)**

The review-1 fixes were:
- the prediction along her route at each of six speeds, reached at 0.25 m/s², every 0.5 s;
- the widest berth when none clears;
- the τ = 0 exemption;
- leaving the berth from rest;
- a Rule 13 latch;
- the mirror walking the traffic;
- the AI passing a stopped vessel's side;
- the wake's real age.

They held for tackers (0 contacts where the timetable missed in 2,656 cases), bends, berth departure, the mirror and
the wake. But:
- **She stopped for a boat coming up her route, then got under way again and ran it down.** Every speed misses by about
  zero once the boat is within the look-ahead, and the 3 s-sampled widest-berth fallback picked the fastest. This hit
  every boat on her reciprocal course on her line, all five vessels, including the owner's 0.5 kt case after a
  19-minute wait.
- **The Rule 13 latch made her blind to a boat that had passed her and was now ahead.** "Overtaking" was judged against
  her slowed speed, and the latch released too late: 131 contacts of 180 cases.
- **The two cruise boats locked for good near the shared berth** after a hold of 25 minutes or more. The last and first
  legs of the loop are about 80 m apart there, inside the pass radius.
- **A boat lying still 70–90 m off her line, ahead of her beam, pinned her forever,** including at her berth.
- **The AI's dodge was still unsafe against a vessel creeping** (above its 0.5 m/s threshold). Beside a stopped one,
  the AI boat parked.
- Hunting behind a short-tacking boat. Arriving alongside, she went from service speed to zero in a step.

## Lessons for the design

- Every rule added to a hand-written decision opened a new way to hit someone. Four reviews, two designs.
- The design needs to be one piece, tested against the reviewers' sweeps from the start, not patched against them:
  - a vessel controller with real speed and course dynamics (stopping and turning at sourced rates for a 15–50 m
    passenger vessel; none found yet);
  - a COLREGs decision layer (who gives way, Rules 8, 13, 17, 18, 9);
  - the AI's side of it (stand on, then act late and the right way);
  - and the toasts from the same state.
- It must handle:
  - a boat ahead and closing that no action clears: stop, stay stopped, sound five blasts;
  - a boat lying still near her line: pass it at a safe hull gap, at her lowest speed;
  - vessels on shared routes, ordered along the route;
  - land, in a hull-footprint probe;
  - and committing to a side or a speed with hysteresis.
- The tests to pass are the reviewers' sweeps (below), the owner's case run on for 25+ minutes, and the fleet gate: no
  worse than main, and better.
- The race track's frames can carry the vessels' state (Frame.v). Nothing reads it yet; the replays don't draw vessels.

## The harnesses

They were written as scratch vitest files against absolute paths in the sessions' worktrees (/home/user/yield,
/home/user/stop), so fix the imports before running. They're kept as .txt so nothing compiles or runs them.

- **traffic-give-way/standoff-reviews/** (review 2 of the stand-off model): a–f, with c.test.ts the fleet harness.
  It's 8 Course 2 races, seeds 1–4 at 13:35 and 14:05 on 7 Nov 2026, 12 kt west, 7 AI boats, counting vessel–boat
  contacts and passes under 30 m. Run it with PART=fleet and TREE=<tree>.
- **traffic-give-way/stop-only-review-1/**: r1–r5. Their sweeps:
  - E1, bends; E2, hunting; E4, a long hold on the route; E5, late tackers;
  - E6, random straight-line boats; E7, pinned; E8, the wake; E9, berths; E10, the Coast Guard route in Horseshoe Bay;
  - E11, Rule 13; W3, the AI dodge in the World.
- **traffic-give-way/stop-only-review-2/**: h1–h9:
  - h1/h1b, reciprocal courses; h2, the Rule 13 latch; h3/h3b, the cruise boats' lock and the berth pins;
  - h5, cost; h6/h7, the AI dodge and the owner's case run on; h9, the mirror.

The code of both models is on their branches: give-way (0e0ab65e) and give-stop (b4ad46f1, with this file). Both have
tests/give-way.test.ts.
