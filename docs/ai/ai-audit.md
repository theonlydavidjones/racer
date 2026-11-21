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
| 1 | ~~She overstands the windward mark by about 20 m.~~ Remeasured by her ground track: a median of about 6 m (0.7 length). The 20 m was a measuring error. No fix. | ai.ts:448, :855 | – |
| 2 | Her fleet lists filter by `!isUser`, which goes wrong when the player's boat sails on the AI. | ai.ts:285, :383 | S |
| 3 | The fleet starts late: a median of 27 m behind the line at 12 kt, 36 m at 4 kt, the worst 146 m. | ai.ts:717, world.ts:789 | M |
| 4 | In 4 kt against the tide, the fleet doesn't make the first mark in 50 minutes. Probed: it's the tide in the lulls, not the flickers. In slack water all 21 boats round. | ai.ts:848–886 | M |
| 5 | After AP over A, the fleet stays by the line for 11–50 minutes instead of sailing home (Debrief's report). | ai.ts:680, homeCourse | M, to probe |
| 6 | Up to 13 tacks on a beat at 12 kt and 19 at 22 kt, some within 40 m of the mark. | ai.ts:848 | M |
| – | Good, no change: she almost never tacks in dirty air (0–1 of 141–331 turns per wind); roundings are close (median 7–8 m at A); no boat was OCS. | | |

## 1. Overstanding the windward mark: remeasured, no fix

**First measure, withdrawn:** at her last tack before mark A (more than 25 m out), how far the mark lay beyond her layline, taking her heading at the polar beat angle. That gave medians of 19 m (12 kt) and 20 m (22 kt). It ignored the current and her leeway. She already steers up-current of the mark: the fetch test (ai.ts:855) includes the current, and `crabFor` (ai.ts:810) allows for it. So her bow points well above the mark while her track over the ground lays it.

**Second measure:** her ground track over every final tack's last leg. This is how far the mark lies off the straight line from her position 5 s after the tack to where she tacks again, rounds, or comes within 12 m. Positive means overstood. It was run at 12 and 22 kt, seeds 1–3, the first beat, 37 final tacks (3 had less than 5 s and were left out):

| Final leg | n | Median (m) | Each (m) |
|---|---|---|---|
| 5–15 s (tacked 25–50 m out) | 11 | +12 | −10 0 7 11 12 12 13 14 15 17 17 |
| 15 s or more | 23 | +3 | −19 −14 −12 −11 −11 −11 −10 −10 −10 −9 2 3 3 5 5 6 6 10 10 12 13 14 17 |
| All | 34 | +6 | |

- Inside 25 m of the mark, 12 of the 37 boats tacked again, 14 tacks in all, which is the cost of coming up short. They pinched (more than 5° above her polar beat angle) for a median of 4 s, at most 20 s.
- The close tacks lay a point about 12 m wide, which is ai.ts:448's aim point, 10 m off on the passing side. The long legs scatter both ways, by up to 19 m, from shifts and the set changing under her. So the median is about 0.7 of a length.
- Caveat on the measure: a line that ends 12 m from the mark can't show an offset much beyond 12 m, so the close tacks' figure is a floor, not an exact value.

**The aim point tried (fix 1, withdrawn):** aiming 4 m off instead of 10 m left her heading measure at 12 m and moved her ground track to about 10 m short, measured 10–25 s after the tack. It caused more underlays, and an underlay costs two more tacks (Dellenbaugh, "Five Familiar Layline Dilemmas": overstanding a little is the cheaper side). It was not committed.

| Aim / fetch margin (m) | Heading measure, median | Ground track 10–25 s after, median | n | Mark touches |
|---|---|---|---|---|
| 10 / 3, as now | 19.6 | −3.6 | 37 / 22 | 0 |
| 4 / 3 | 12.4 | −9.6 | 37 / 26 | 0 |
| 4 / 0 | 14.8 | −8.5 | 38 / 25 | 0 |
| 1 / 0 | 12.1 | −8.1 | 36 / 23 | 0 |

**Verdict:** not the fault it looked like. By the ground track she overstands by about two-thirds of a length at the median, with a spread a club racer would recognise. The part worth improving is the spread, not the aim. That belongs with finding 6's trace (the tacks at the mark), not a separate fix.

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

### Proposal 3, for the Coordinator's approval

**Cause:**
- The hold is a fixed distance, 55–100 m below the line in every wind and set (world.ts:789). At 4 kt against 0.4 m/s that's over 100 s from the line. At 12 kt it's about 50 s.
- The leave decision (ai.ts:711–717) predicts too short a time. From the moment she leaves, her own live tReach runs 6–10 s over the time left. Whether that's the approach angle, the set or the acceleration curve in timeToCover is not yet traced.

**Fix:**
1. **Hold depth by time, not metres.** Depth = her speed made good toward the line on the approach, in the actual wind and set, × a hold time.
   - The speed: targetFor at the approach's angle, resolved onto the line's normal, plus the current along it.
   - The hold time: 30 + r()·25 s. It keeps the same r() draw, so the seeds still give the same races.
   - It's clamped to 15–100 m. 30–55 s is an ESTIMATE from "at most about 30 s of sailing from the line" (MIT notes; Ian Williams, time-on-distance), with room to wait.
   - In a foul set, the depth shrinks by itself, and she holds close and up-current as a sailor does.
2. **A truthful leave time.** Trace the 6–10 s first. Then make the plan's speed toward the line the same number the depth uses, rather than raising the fixed 8 s margin to hide the error.
3. **Tests:** a start test asserting the median boat is within 1–2 lengths of the line at the gun at 4, 12 and 22 kt, with no rise in OCS. Then the start tests, fouls-pair (12/22 and 4/6) and the berth test.

**Expected effect (ESTIMATES):**
- *Finish times:* earlier by the lateness at the gun, about 13 s at 12 kt (27 m at 2.1 m/s), about 12 s at 22 kt, and 30–40 s at 4 kt.
- *Fouls:* more boats arrive at the line together and on time, so more pre-start and start incidents (rules 11, 15, 16). A guess is +0.1–0.3 a race at 12–22 kt. fouls-pair will show it; if it fails, the start's room logic gets looked at before the depth is.
- *OCS:* a few may appear (none in 63 now). A real fleet has some.

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

### Probe of 4, and proposal 4, for the Coordinator's approval

**The probe:**
- The setup: 4 kt, seeds 1–3, real tide (14 Nov 2026) against slack water, 3000 s. Every boat's turns, and its "flicker triples" (three turns inside 7 s) were counted. Green, seed 2, was traced every 5 s.

| Current | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Real | 2/7 round A (2010, 2058 s) | 0/7 | 7/7 (1272–2115 s) |
| Slack | 7/7 (534–1080 s) | 7/7 (534–1254 s) | 7/7 (504–882 s) |

- **Turns per boat, real:**
  - seed 1: 7–23;
  - seed 2: 22–37;
  - seed 3: 2–8.
- **Turns per boat, slack:** 2–19.
- **Flicker triples, all boats:** real 6+1, 2+2+1, 0; slack 0, 1+1, 0. Ten in 42 races-worth of boats.
- **Green, seed 2, real:**
  - The wind she felt averaged 2.9 kt, from 1.4 to 4.7 kt (the gusts and lulls, environment/gusts.ts).
  - Her speed averaged 0.66 m/s.
  - The current toward the mark was −0.42 m/s throughout, the same from 330 m out to 50 m.
  - Her speed made good toward the mark over the ground: port −0.44 m/s, starboard −0.20 m/s (means of the 5 s samples, out of tacks). **She lost ground on both tacks.**
  - For scale, the class polar's lightest row (4 kt, src/boat/data/nordic-folkboat-orc.json) gives a best upwind VMG of 1.667 kt, 0.86 m/s. Below 4 kt the polar has no data.

**Cause:** mostly no way to make ground. In the lulls below about 3 kt, a Folkboat's VMG through the water is about the ebb's 0.42 m/s or less, and she goes backwards whatever she does. This is the tide's real physics: in slack water every boat rounds. The flickers are too few to matter (seed 3 rounded with none). The slow-tack hold isn't the cause either; Green's goTack was mostly clear.

What the AI does wrong on top of the physics:
- **She tacks as if in a breeze:** 22–37 times in seed 2. Each light-air tack loses most of her way.
- **She splits her time between the tacks** although one loses twice as much ground (port −0.44 against starboard −0.20). The rhumb-line width tack (ai.ts:877) brings her back.
- **She ignores current relief,** although the model has it: current.ts:27 `shoreRelief` gives a quarter of the stream at the beach, rising to full at 350 m out. Nothing in src/ai reads it.

**Fix, in order:**
1. **(S, mine)** In under about 6 kt true wind:
   - she tacks on a header only if it's held twice the usual time (ai.ts:866);
   - the width tack waits until the other tack makes better ground toward the mark (the fetch test's current-aware track, ai.ts:851, is already there to compare).
2. **(M)** Current relief in her tack choice: compare each tack's ground VMG with `currentAt` along it, so she works the shore when it's in reach. First check whether course 10's beat comes within 350 m of the shore at all.
3. **(Owner's call, a big design change, not to build without asking):**
   - *Kedging:* RRS 45 allows anchoring, and it is real SF Bay light-air practice against the ebb.
   - *The committee:* a time limit, or shortening course (RRS 32) when the fleet can't make the mark. That's the race committee, not the AI.

**Expected effect (ESTIMATES):**
- *Fouls:* about unchanged. At 4 kt the fleet spreads out (2 incidents in 3 races in the audit).
- *Finish times:* fix 1 saves the tacks' losses in the marginal races, like seeds 1 and 3. A guess is a few minutes to mark A where she now makes 15–35 tacks. It won't make seed 2 roundable: nothing but relief, kedging or the committee can.

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

### Proposal 6, for the Coordinator's approval

**Cause:** not traced yet. Candidates, as before:
- the header tack (a hazard-rate draw each think while headed more than 4° for more than 15 s, ai.ts:866–870);
- the rhumb-line width tack (ai.ts:877);
- tacking below the mark when she can't fetch it, which finding 1's remeasure puts at 12 of 37 boats inside 25 m.

**Note:** main's newer skipper knobs (src/ai/skipper.ts, after 5de4d67c) scale the header tack by her strategy, down to a 1° header held 3 s. 1° is under the wind's own short swing of 2–3° (the ai.ts comment on beat hysteresis). If that's in v216, expect more tacks than this audit measured. Its author should check that against the same trace.

**Fix:**
1. A probe first. Tag each tack with its trigger (header, width, dirty air, layline, at the mark) at 12 and 22 kt, seeds 1–3.
2. Then, by what it finds:
   - header tacks only on a header larger than the short swing;
   - inside about 3 lengths of the layline, tack only on the layline;
   - if at-mark tacks dominate, nothing more: they're finding 1's underlays.
3. The test: median tacks per beat at most 4 at 12 kt, with the incidents bound unchanged.

**Expected effect (ESTIMATES):**
- *Tacks:* the median per beat from 7 to about 4 at 12 kt.
- *Finish times:* each tack saved is about a length (Dellenbaugh), so about 3 lengths, 23 m, about 10 s a beat at 12 kt.
- *Fouls:* fewer crossings mean slightly fewer rule-10 port-starboard incidents. A guess is −0.1 a race.

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

1. Done: fix 2 (claude/ai-standoff-identity, 77892ae6). test:fast and fouls-pair pass; perf-pair --ai waits for Capacity.
2. Withdrawn: fix 1. See the remeasure in finding 1.
3. Probe 5 (AP over A), then fix it.
4. Proposals 3, 4 and 6 above are for the Coordinator's approval, and 4.3 for the owner's.
