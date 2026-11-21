# AI audit: the fleet as a club racer sees it (21 Nov 2026)

Skipper Model, at the Coordinator's request. This audits how the AI boats race, measured on v215's head (5de4d67c).

**How it was measured:**
- The course: Seaweed Soup course 10, the fouls-pair gate's course. Seven AI opponents, umpired, real current (tide 14 Nov 2026), wind west.
- The races: 3 seeds each at 4, 12 and 22 kt. The races ran 3000 s at 4 kt and 1500 s at 12 and 22 kt, so they cover the start, the first beat and the first two roundings, not whole races.
- The logger recorded every AI boat:
  - its place and speed at the gun;
  - every tack and gybe, with whether it was in dirty air (shadowK/leeK < 0.9, as ai.ts judges it);
  - how far it overstood at its last tack before a windward mark, more than 25 m out;
  - its closest pass of each mark;
  - every incident and protest.
- A second probe logged each boat's start plan at 60, 40, 30, 20, 10 and 0 s to go.

The probes are throwaway test files, kept outside the repository; the numbers below are theirs.

**Sizes:** S is a few lines, with the gates run in a day. M is a design change, or needs more probing first.

**Sources:**
- Most come from search-tool summaries of the pages, so they're paraphrase-grade. Only the US Sailing page was read in full.
- They are rules of thumb, not measurements.

**Not covered in this pass:**
- **Covering, ducking and crossing.** The logger didn't pair boats, so there is no finding on them either way. That's a gap for a second pass.
- **Protests.** The races were umpired, so none were lodged.

## Summary

| # | Finding | Where | Size |
|---|---|---|---|
| 1 | She overstands the windward mark by about 20 m (2.6 lengths) at 12 and 22 kt. | ai.ts:448, :855 | S |
| 2 | Her fleet lists filter by `!isUser`, which goes wrong when the player's boat sails on the AI. | ai.ts:285, :383 | S |
| 3 | The fleet starts late: a median of 27 m behind the line at 12 kt, 36 m at 4 kt, the worst 146 m. | ai.ts:717, world.ts:789 | M |
| 4 | In 4 kt against the tide, the fleet doesn't make the first mark in 50 minutes. Boats make 20 to 37 tacks, some of them flickers in irons, and don't look for current relief. | ai.ts:848–886 | M |
| 5 | After AP over A, the fleet stays by the line for 11–50 minutes instead of sailing home (Debrief's report). | ai.ts:680, homeCourse | M, to probe |
| 6 | Up to 13 tacks on a beat at 12 kt and 19 at 22 kt, some within 40 m of the mark. | ai.ts:848 | M |
| – | Good, no change: she almost never tacks in dirty air (0–1 of 141–331 turns per wind); roundings are close (median 7–8 m at A); no boat was OCS. | | |

## 1. Overstanding the windward mark (S)

**What happens:** at her last tack before mark A (taken more than 25 m out), the mark lay this far beyond her layline, measured across her track. Positive means overstood.

| Wind | Overstand (m), each rounding | Median |
|---|---|---|
| 4 kt | −50 −39 −18 −15 −10 −6 0 14 21 | −10 (short) |
| 12 kt | −2 1 3 5 9 10 17 18 19 19 19 20 20 22 22 23 24 24 26 32 35 | 19 |
| 22 kt | −5 2 4 8 13 16 16 17 19 19 20 20 21 21 21 22 23 26 33 33 36 | 20 |

A sample line from the 22 kt log, seed 2: `t 324 ROUND Black mark A (beat) closest 11.2 m; leg turns 3; last turn t 293 overstand 65°`.

**Why:**
- More than 35 m from a rounding mark, she steers for a point 10 m off the mark on its passing side (ai.ts:448, `P = off(…, 10)`).
- She tacks for it only once she can fetch that point with 3 m more to spare (ai.ts:855, `lat > 3`).
- She looks only once 9 s have passed since her last tack (ai.ts:848). At about 2 m/s that's another 18 m.

So she lays a point about 13 m wide of the mark on purpose, before her reaction time.

**Is it wrong?** Yes.
- Dellenbaugh's rule: "tack on your layline". Every boat length overstood costs about 1.4 lengths of sailing at 45° (geometry, not a quote). The source is Dellenbaugh, Speed & Smarts / Wind Check, "Five Familiar Layline Dilemmas".
- A strategic rounding, with nobody close, passes close to the mark (Dellenbaugh, Speed & Smarts #131, "Mark Rounding").
- 20 m is 2.6 Folkboat lengths, about 3.6 lengths of extra sailing at each windward mark. A club racer would call it overstanding.

**Fix (S):**
- Aim about half a length off the mark: 4 m, room for her half-beam and the rounding swing.
- Keep the 3 m fetch margin. The tide is already in the fetch test.
- The risk to watch is touching the mark (rule 31) in a set. fouls-pair and the mark-touch tests guard that.

**At 4 kt she tacks short instead,** a median of 10 m. That belongs to finding 4: the tide sets her down while she beats.

## 2. The fleet filtered by `!isUser` (S)

**What happens:**
- `homeCourse` reads its stand-off place as `places[w.boats.filter(o => !o.isUser).indexOf(b)]` (ai.ts:285).
- `standOffPlaces` lays out a place for each boat in `w.boats.filter(o => !o.isUser)` (ai.ts:383).
- Nothing in src changes a boat's `isUser`, but scripts/check/ghost.cjs does. It sets the player's boat to `isUser = false` and gives her an AI, to sail her on the AI's skipper, and a player-facing "sail her on the AI" would do the same.
- The places are worked out once, when racing is called off, and kept (`w.cancelled.places`). If her flag flips after that, every boat's index shifts by one: two boats share a place, and the last falls back to the course's middle (`?? at`).

FTUE found this. Its fix in the HUD (ui/rivals.ts, 6e2be1a5) filters by identity, not by the flag.

**Fix (S):** key the places by the boat itself, not by a filtered list.
- Lay out a place for every boat in `w.boats`, and read `places[w.boats.indexOf(b)]`.
- That costs one spare place. The order no longer depends on who is steering.
- The rule-14 check at ai.ts:1111 (`o.isUser ||`) is about the other boat being unpredictable, so it's right as it is.

## 3. The start: late at the gun (M)

**What happens:**

| Wind | Behind the line at the gun (m), 21 boats | Median | Speed at the gun (m/s) |
|---|---|---|---|
| 4 kt | 16 to 69 | 36 | 0.65–1.17 |
| 12 kt | 14 to 110 | 27 | 0.9–2.3, mostly about 2.1 |
| 22 kt | 14 to 146 | 30 | 0.9–2.6 |

At 12 kt, 27 m at 2.1 m/s is 13 s late. No boat was OCS.

The start probe (12 kt, seed 1, Black):

```
t -60 mode approach d -97.9 v 0.75 tReach 65.7   (5.7 s late already)
t -40 mode approach d -82.3 v 1.71 tReach 47.7   (7.7 s late)
t -20 mode approach d -52.3 v 2.08 tReach 27.8   (7.8 s late)
t -10 mode approach d -35.8 v 2.10 tReach 19.7   (9.7 s late)
t   0                d -19.4 v 2.08
```

- Every boat at 10 s to go has a predicted time to the line (tReach) of 17–27 s, so she's late on her own plan from the moment she leaves the holding pattern.
- The plan's time to the line (ai.ts:711–716) is optimistic.
- She leaves the hold at `tl < leave + 8 + aggr` (ai.ts:717), with an 8 s margin, but the error is larger.
- The current over the line was 0.25–0.40 m/s, setting her away from it (`cN` in the probe), and the approach is close-hauled, so her speed toward the line is about 1.1 m/s, not her 2.

**At 4 kt she can't get there:**
- Her hold is 55–100 m below the line in every wind (world.ts:789, `depth = 55 + r() * 45`).
- She sails 0.9 m/s against 0.4 m/s of foul current. Black's tReach was 65–69 s with 30 s to go, and its leave time came out infinite, so she went straight to her approach.
- A sailor in a foul tide holds close to the line and up-current.

**Is it wrong?** Yes.
- The aim is full speed at the gun, on your spot, at most about 30 s of sailing from the line (MIT sailing notes; Ian Williams, Yachting World, time-on-distance).
- A whole fleet 3–5 lengths back at the gun is the weakest club start.

**Fix (M):**
- Make the holding depth a matter of time, not metres: about 30–40 s of her speed in this wind, against the current over the line.
- Measure the plan's error and lead the leave decision by it: have timeToCover count the approach angle and the set.
- This changes every race's start, so it needs the start tests, fouls-pair and the berth test. It's a design change to agree first.

## 4. Light air against the tide: the first beat isn't sailed (M)

**What happens:**
- At 4 kt, after 3000 s, most of the fleet had not rounded mark A, 440 m to windward. Only 9 of 21 boats rounded it.
- Tacks on the first beat, per boat: 37 36 34 33 31 29 22 21 14 12 12 10 8 7 7 6 4 2 2 2 2.
- Seed 2, Green:

```
t 1045 TURN Green beat to P v 0.60 dist 69 m
t 1239 TURN Green beat to P v 0.60 dist 49 m
t 1285 TURN Green beat to S v 0.42 dist 58 m
t 1286 TURN Green beat to P v 0.41 dist 58 m      ← three "tacks" in 3 s: her tack flag flickering head to wind
t 1288 TURN Green beat to S v 0.40 dist 59 m
t 1645 TURN Green beat to P v 0.25 dist 70 m
t 1648 …  t 1653 …                               ← again, at 0.25 m/s
t 1891 TURN Green beat to S v 0.29 dist 123 m     ← 74 m further from the mark than at 1239
t 2904 TURN Green beat to P v 0.56 dist 36 m
```

**Why, in part:**
- In 4 kt her speed toward the mark is about 0.3–0.4 m/s. The ebb on the course is about 0.3–0.4 m/s (the start probe's cN), so for long stretches she makes nothing good and goes backwards.
- That is the tide's real physics, but the AI doesn't answer it:
  - she doesn't look for relief out of the stream (the shore, or the shallows' weaker current);
  - she tacks as often as in a breeze.
- The triples, three "tacks" inside 3–7 s at 0.25–0.4 m/s, are her lying head to wind with her tack flag flicking either side of 4°. They may come from the slow-tack and footing logic (v213–v216, mine) meeting the tide. Needs a probe.

**Is it wrong?** Yes, against two sources:
- Light air: minimise tacks, the heavier the boat the more so (Jerry Latell, via Sailing Scuttlebutt).
- Bad air and current matter most in light air (US Sailing, Speed & Smarts, wind shadows).

**Fix (M):**
1. Probe the triples first. If they're the slow-tack hold, it's S and mine to fix.
2. Then a light-air rule: no tack on a header in under about 6 kt unless it's held twice as long (ai.ts:870, the header tack).
3. Then current relief in her plan. That's a strategy change, after the sprint.

## 5. After AP over A, the fleet stays by the line (M, to probe)

**Debrief's report:** after a call-off for wind, every AI boat stays near the line for 11–50+ minutes. The repro: 5de4d67c, west 22 kt, seq 1, raceFrom water, the Practice race, seed 1523510690, the call at t = −180.

**What the code does:**
- world.ts:1930 sets `w.cancelled`, and ai.ts:680 then gives `homeCourse` priority over the pre-start hold. So the AI does mean to sail home.
- `homeCourse` works its route out a slice at a time (`routeAroundSteps`, HOME_SLICES a step, shared by the fleet). Its stand-off places come from `standOffPlaces`.
- Either could keep the fleet by the line: a route that takes minutes to work out, or stand-off places near it.

**Not yet reproduced.** Next: the repro in a test, a probe of each boat's job and stand, and the same after the gun (an abandonment on leg 2). Then the fix and a test, through Capacity.

## 6. Many tacks on a beat at 12 and 22 kt (M)

**What happens:**
- Tacks per beat to mark A:
  - 12 kt: 3–13, median 7;
  - 22 kt: 3–19, median 5.
- 22 kt, seed 1, Red: 19 tacks.
- 22 kt, seed 1, Black tacked at 17, 16, 41 and 18 m from the mark between t 400 and 462: four tacks at the mark, a sign she couldn't fetch it and tacked back and forth below it.
- A 440 m beat needs 2–4 tacks. Each tack costs about a boat length (Dellenbaugh, "Five Familiar Layline Dilemmas").

**Why:** not traced. Candidates:
- the header tacks (`headerTackRate`, a random draw each think while headed);
- the rhumb-line width tack;
- at the mark, the 9 s lockout (ai.ts:848) with finding 1's aim point.

**Fix (M):** trace Red and Black's tacks by cause first. Finding 1's fix may take care of the tacking at the mark.

## Good, and left alone

- **Dirty air:** she tacked in another boat's wind shadow 0 times of 331 turns at 4 kt, and once of 158 at 12 kt and of 141 at 22 kt. A sailor in breeze may hold in bad air; in light air it's very slow (US Sailing, wind shadows).
- **Mark A roundings:** closest a median of 7.3 m (4 kt), 8.3 m (12 kt) and 7.8 m (22 kt). The worst was 18 m, which goes with finding 1. About a length off, the strategic rounding (Dellenbaugh #131).
- **The reach mark (4):** rounded at 8.0–9.4 m by nearly every boat, steady. The aim at 12 m (ai.ts:458) keeps her clear of the boats inside.
- **No OCS** in 63 starts.
- **Incidents,** over 3 races per wind:

  | Wind | Incidents | In the pre-start | The fouler was the probe's unsteered player boat |
  |---|---|---|---|
  | 4 kt | 2 | 0 | 0 |
  | 12 kt | 14 | 6 | 3 |
  | 22 kt | 12 | 6 | 3 |

  Mostly rules 10, 12 and 13, plus one 16.1 and one 21.2. With the unsteered boat taken out, that's 2–4 by the AI a race in a breeze. Nothing stood out to an umpire's eye, but nothing was counted against a sailed fleet either: no finding.

## Next

1. Fix 1 and 2 (S), each with a test, test:fast, and perf-pair --ai and fouls-pair through Capacity.
2. Probe 5 (AP over A), then fix it.
3. Probe 4's triples.
4. Agree the start redesign (3) and the light-air tacking (4) with the Coordinator before building.
