# The skipper model: proposal (Skipper Model session, 12 November 2026)

Phase 1 of the ROADMAP's "skipper/crew model": research and a design. Nothing is built yet. The crew side (trim,
pole, puff calls, crew work) belongs to the Crew Model session. This document covers the skipper.

## 1. Calibration data: what the real fleets do

### What we have

`src/boat/data/sf-folkboat-results.json` was fetched on 11 November. `scripts/analyse-folkboat-results.mjs` adds
Fort Point's observed wind (NOAA 9414290) for each race.

- **Timed races.** Only 5 races have every finisher's elapsed time: the GGYC Seaweed Soup on Jibeset, 5–6 Folkboats
  each, on courses of 3.4–8.9 nm.
- **Places only.** 50 more races give places but no times: the SYC Classic Boat Invitational and the SFYC Resin
  Regatta, on Regatta Network.

| Date | Wind at Fort Point | Gaps behind the winner, % of the winner's elapsed time |
|---|---|---|
| 2025-11-01 | 7.3 kt | 0, 2.9, 7.3, 10.5, 11.9 |
| 2025-12-06 | 11.1 kt | 0, 1.1, 1.4, 2.1, 5.5 |
| 2026-02-07 | 5.2 kt | 0, 9.0, 10.5, 12.5, 19.8 |
| 2026-03-07 | 8.5 kt | 0, 1.8, 2.9, 5.8, 8.0, 14.7 |
| 2026-11-07 | 7.4 kt | 0, 0.6, 1.2, 1.8, 6.7 |

The targets these give:

- **Last finisher.** A median of **12%** behind the winner (IQR 6.7–14.7%, range 5.5–19.8%), about 121 s per nm.
- **Median boat.** **5.8%** behind (1.5–11.5%).
- **By quarter of the fleet behind the winner.** The median gaps are **1.8, 2.9, 5.8 and 10%**. Most of the spread
  is at the back.
- **Wind.** Light air spreads the fleet. The last finisher's gap is about 27.7 − 2.0 × wind (kt) %, with r = −0.74.
  That rests on only 5 races.
- **Consistency.** Kendall's tau between two races' finishing orders averages **0.43**. The skipper accounts for
  about **47%** of the variance in relative place (55 races, places only). So about half of a result is the
  skipper and half is the day.
- **Order and wind.** The order is less settled in light air: tau with the fleet's usual order is 0.35 under 8 kt,
  0.55 at 8–14 kt and 0.60 at 14 kt and over.
- **One star.** The real fleet has one boat that wins 29 of 40 races (mean relative place 0.08). The next best has
  13 wins in 36 races. A realistic club fleet has a star, a few good boats and a long tail. Its abilities are not
  spread evenly.

**A cross-check from other SF Bay one-designs.** These are YRA Great Vallejo 2026 results on Jibeset, about 22 nm
each way. The Express 27s (8 boats) finished 10.4% and 17.9% last-behind-winner, with the median boat 2.5–5.5% and
8.6% behind. The J/105s and Express 37s were 3–4 boats each and gave 0.6–10%. This matches the Folkboats' order of
magnitude.

**What isn't there.**

- Five older Seaweed Soup seasons (2019–2024) are marked "gated" in the data file. I won't try to get past a gate.
- I found no timed Folkboat results from other clubs. StFYC, CYC Midwinters and the Woodies are not yet searched on
  Jibeset.

Proposed Phase 0 step (about 1 h): fetch those other clubs' Jibeset pages with WebFetch, add them to the data file,
and rerun the analysis. The aim is 10 or more timed races, so the wind slope rests on more than five.

### What the science says about skill (the researcher's findings)

- **Direction by feel.** Pluijms et al. 2015 (Attention, Perception & Psychophysics 77(6), PMC4521093) tested
  blindfolded sailors. At about 3 kt, experts judged wind direction to a mean signed error of **3.2°** and
  non-sailors to **11.1°**. The gap closed by about 5 kt. Their figures give the intermediate group graphically
  only.
- **Speed.** In 63 Laser World Cup and Olympic races (Heliyon 2022, PMC9719898, Table 2), the top 10 made good
  **about 3–8% more VMG upwind** than the rest (8% in light air, 3% at 8–12 kt and over 12 kt). The gap was **5–7%
  on reaches** and **0–3% downwind**. That is among elites, so club fleets differ more. Manoeuvre counts didn't
  differ by rank. Speed and position decided it, not the number of tacks.
- **Decisions.** Araújo, Davids & Serpa 2005 (Psych. Sport & Exercise 6(6)) compared skill levels in a simulated
  regatta. Sailors of different levels used the same information (the wind and the opponents), and the better
  ones used it better. Pluijms et al. 2015 (J Sports Sci 33(4)) found that better sailors look at the tangent
  point when rounding a mark.
- **Laylines.** Coaching sources say overstanding is the most common windward-mark mistake, and that a call made
  far away misses by more (Dellenbaugh, Windcheck; Ed Adams' "no more than 10 lengths out", Sailing World). No
  measured error in degrees was found.
- **Not found** (any figure here will be a labelled estimate, tuned against the fleet results above):
  - the threshold and delay for seeing a shift;
  - how far off a puff can be read on the water;
  - OCS rates, or the distance behind the line at the gun;
  - how much rules knowledge club racers have.

### Where the sim is now

A baseline of today's AI fleet is in §6. ROADMAP 4a records the last boat about 12% behind once the AI's tacks were
held. But that spread comes from the dice (each boat's random `aggr`, `width`, `aware`, `f` and `depth`, drawn per
race), not from who the skipper is. Nobody is consistently good, so the race-to-race tau is about 0, where the real
fleet's is 0.43.

## 2. The skipper

Each AI skipper has seven attributes on 0 (novice) … 1 (expert), as the crew's skill is (boat/crewPhys.ts). Each one
changes things the AI already decides, so no new behaviour is invented.

| Attribute | What it changes in the AI (src/ai/ai.ts) | Expert … novice (estimates unless cited) |
|---|---|---|
| **Starting** | `plan.tReach`, the error in judging her time to the line, which is a lasting bias plus noise. `aggr`, her margin. Which end she judges favoured. Her depth and where she sets up. | Time-on-distance error σ about 1.5 s … 6 s. A line-bias judging error of 2° … 8°. |
| **Boat speed** (the helm) | How well she holds the groove: the error in her steered angle to the wind upwind (pinching and footing) and how much it wanders, and how far her steering lags in waves. Trim stays the crew's (Crew Model). | Upwind VMG lost about 0–1% … 5–8% at 6–12 kt, more in light air (Laser data: 3–8% among elites). |
| **Strategy** (the wind and the water) | When she sees a shift: its size and how long she waits (now fixed at 4° and 15 s). How far ahead she reads puffs. How much current she allows for (now `aware`, 60% or 100%). The favoured side she believes in from the pre-start (the strategist's plan, with an error). | Shift seen at 3°/8 s … 8°/30 s (Pluijms: 3° vs 11° by feel). Puffs read 400 m … 80 m out. Current allowed 95% … 40%. |
| **Tactics** (boat on boat) | Laylines judged by eye (below). When she tacks out of dirty air. When she covers or splits. When she ducks or tacks at a crossing. When she hails. | Layline bias 1–2° … 6–8° (overstanding more often), growing with distance. |
| **Rules knowledge** | Whether she reads an encounter right: who has right of way, mark-room, room to tack. A skipper who reads it wrong keeps clear late or not at all. The safety net (rule 14, contact) stays exact for everyone. Later: whether she knows she fouled. | Encounter read right 99% … 85%. |
| **Consistency** | Her form on the day: a draw per race for each attribute. Her lapses: per leg, a chance of one real blunder (a shift missed, the wrong side, a bad rounding). | Day-to-day σ 0.05 … 0.2. A lapse in about 2% … 15% of legs. |
| **Nerve in traffic** | The clearances she keeps (now 14 m and 12 s fixed for keep-clear, 10 m in the pre-start). How close to others she starts. Whether she holds a lane or bails out. Whether she'll lee-bow or come in on port. | Margins 0.7× … 1.5× today's. More nerve means more distance gained, and more fouls. |

**Errors are mostly lasting, not jitter.** A skipper who misjudges a layline misjudges it by the same few degrees
until she gets closer and sees better. A skipper who believes the left pays goes left. Fresh noise every step would
average away, and it would make her dither, which real skippers don't. So each error is a bias drawn when the
judgement is made (each leg, each approach, each crossing), and it shrinks as she gets closer or as time passes,
with a small noise on top. All of it is drawn from the world's seeded `w.rng`, so races and replays repeat.

## 3. Acting on what she believes

Each AI boat gets a **mind**. It is updated on the same slow clock the AI already staggers its heavy work on (the
`refresh` tick, every 6 steps), and parts of it only every 1–2 s. The AI reads the mind instead of the true state.
These are the places that change:

1. **The wind she's in.** She knows her own wind through her compass average (`avgFrom`, already there) and her
   telltales. She sees a shift only when it exceeds her threshold for her hold time. A novice sails a 6° header for
   half a minute.
2. **The wind ahead.** She sees the puffs and lulls (environment/wind.ts `Puffs`) whose centres fall within her
   reading range and roughly ahead of her. She sees them with a position error that grows with range, and only on
   a 1–2 s tick. She uses them to choose which tack, to stay in a puff, or to head for one. Puffs aren't read in
   fog or at night (they already depend on the light: the dark patches).
3. **Laylines by eye.** `fetch()` and `lays()` use her judged layline: the true one (wind and current) turned by
   her bias. The bias is drawn as she comes to the layline, with σ ∝ distance (Dellenbaugh), and is re-judged
   inside about 10 lengths, where an expert gets it nearly right.
4. **The current.** She allows for part of the tide's set, by strategy. This replaces the `aware` coin with a share
   from 40% to 95%.
5. **Other boats.** Within about 60 m she sees exactly where they are. What she misjudges is the crossing: their
   speed and heading carry an error, so her "can I cross?" (the cpa) carries one too. Rule-reading errors are
   applied to the `rights()` answer she acts on, not to the rules engine.
6. **The start.** Her time to the line carries her starting error. She believes the line is biased the way her
   pre-start check said.

**What stays exact for everyone:**

- the rules engine (src/rules), which judges what happened;
- contact avoidance (the rule 14 move);
- the shore and the marks;
- hails being answered.

So a weak skipper loses distance and fouls more, but never sails into the land, a mark or a boat. She makes a
novice's mistakes, not a bug's.

**The cost.** The heavy parts are the puff scan (about 170 cells against a range check, per boat, once a second,
so about 25 checks a step for 8 boats) and a few extra subtractions on the refresh tick. That is well under 1% of a
step. perf.test sits at 54.7, near its limit. I'll measure before and after each phase and keep it flat.

## 4. The Yacht Club sliders

**Agreed with Crew Model:** one panel with two rows, **Skippers** and **Crews**. Each row has a Level and a Mix.

- **Same people each race.** Each AI boat's people are drawn from a fixed seed from her name, so a boat has the same
  people race to race.
- **Crew follows skipper.** A boat's crew level is correlated with her skipper's (r ≈ 0.5), because good skippers
  sail with good crews.
- **The crew's puff calls.** Their `b.calls` (kind, seconds away, strength, veer, where) feed the skipper's
  `mind.puffs`, along with what she sees herself.
- **Calibration is joint.** The real results measure boat, skipper and crew together, so the default pair is
  fitted with both models plugged in.
- **Who builds it.** I build the panel, with the crew row as a plug-in. The layout goes to the owner first.

The Race setup gets a **Fleet** section beside "competitors". The owner chooses the layout before I build it. Each
row has:

- **Level.** Club night … Club championship … Regional … Nationals … Worlds. This sets the fleet's mean ability.
- **Mix.** Even … Typical … Mixed. This sets how far apart the skippers are. "Typical" gives the real shape: one
  star, a few good boats and a tail.

Under the sliders, each skipper has one hidden **ability**, drawn as level + mix × a skewed draw. Their seven
attributes are drawn around it, correlated at about 0.6. Real sailors have profiles (a good starter and poor
tactician, a fast helm who misses shifts), not one number.

Later, with the Yacht Club proper, each club boat gets a lasting skipper: a made-up name, never a real one (ROADMAP
line 842); her attributes; her form; and in time her seasons and awards.

The **default fleet** ("Club night, Typical") is calibrated to the real SF fleet, the GGYC Seaweed Soup.

**Calibration** is a slow test, outside test:fast. It runs about 20 races on real days (sf-real-days.json: real
wind and tide), 5–7 boats each, with the same skippers each time. The level and mix scale are fitted so that:

- the last finisher's median gap is about 12% (band 8–16%);
- the quarters fall at about 2, 3, 6 and 10%;
- light days spread wider than fresh ones (a negative wind slope);
- race-to-race tau is 0.3–0.55;
- the most able skipper wins about half the races or more.

Today's baseline gives a tau of about 0, because there are no skippers yet.

## 5. How it plugs in

- **New code.** A new `src/ai/skipper.ts` holds the attributes, the fleet's generation from the sliders, and the
  mind and its updates. `AiState` gains `sk` (attributes) and `mind`.
- **The legacy profile.** Until the sliders exist, each boat's attributes come from the same dice as now (`aggr`,
  `width`, `aware`). The existing tests (sim-starts, sim-fleet, sim-ai, ai-avoid, the rules tests and perf) should
  then pass unchanged in Phase 1. Each later phase moves one decision onto the mind, with its own test, and reruns
  them.
- **Ownership.** `src/ai/ai.ts` is Deep Physics' file, so the edits there are small and named. I'd make them in
  small PRs that Deep Physics reviews, or hand Deep Physics a hook if they prefer.
- **Crew Model.** Their crew skill drives trim, the pole and the puff calls. A crew's puff call is one source of
  what's in the skipper's `mind.puffs`, so a good crew gives a weak skipper eyes. We agree that interface before
  either of us builds it.
- **Rules.** Rules owns what a foul is. The skipper's "rules knowledge" only changes what she believes.
- **Your own boat.** You are its skipper. Your crew's skill stays the Crew Model's.

### Room for cheating, protests and hearings (a later phase, 8–12 h)

The mind keeps an **incident memory**: each close encounter, with who she believed had right of way, whether she
believes she fouled, and how sure she is. That leads to:

- **Taking a penalty.** She does her turns if she believes she fouled. That depends on her rules knowledge, and on
  a later eighth attribute, **sportsmanship**. Sportsmanship opens the door to cheating: not taking a penalty she
  knows she owes, or pushing a luff she knows is marginal.
- **Protests.** The other boat's memory of the same incident, and her own temperament, decide whether she hails
  "Protest" and flies the red flag (RRS 60–61).
- **Hearings.** The World already logs every pair's record (`pairRecord`), so the truth is there. Witnesses are
  other boats whose minds saw the incident, each with their own view. A hearing compares them, as the RRS Part 5
  hearing does, and can find against the true state when the testimony is poor, as real ones sometimes do.

## 6. Today's baseline (sim, no skippers)

See the session's message to the Coordinator. The numbers are filled in there.

## 7. Phases and hours

| Phase | What | Hours |
|---|---|---|
| 0 | Calibration data: other clubs' timed Folkboat results; a baseline harness (spread, quarters, wind slope, tau) as a slow test | 2–3 |
| 1 | `skipper.ts`: attributes, the legacy profile, `AiState.sk` and `mind`. No change in behaviour, all tests green | 2 |
| 2 | Beliefs about the water: shifts, puffs read ahead, laylines by eye, current share, start timing and line bias | 6–8 |
| 3 | Traffic: nerve margins, crossing misjudgement, rules reading (safety net exact) | 3–4 |
| 4 | The Yacht Club sliders (layout to the owner first) and the fleet's generation | 3–4 |
| 5 | Calibration: fit level and mix to the real fleet; bands in the slow test | 3–5 |
| — | Reviews: physics-reviewer for each phase that touches src/ai | 1–2 |
| **Total** | | **20–28 h** (ROADMAP estimate: 15–25 h for skipper and crew together) |

Later: cheating, protests and hearings (8–12 h, as the ROADMAP has it).

## Questions for the owner

1. **Sliders.** Are two sliders (Level and Mix) right, or do you also want to set each opponent's skipper by hand?
2. **Showing skill.** Should the player see the skippers' attributes (on the boat card, or in the strategist's
   "the competition"), or only discover them by racing?
3. **Lasting skippers.** Should club boats keep the same made-up skipper race to race (so you learn that one is a
   great starter), or should the fleet be drawn afresh each race until Seasons?
