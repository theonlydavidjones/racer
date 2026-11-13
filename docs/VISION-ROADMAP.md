# Vision roadmap: near, middle and long term

A proposal for the owner (13 November 2026). It's drafted by the Roadmap session and measured against the mission and
priority at the top of CLAUDE.md. That priority is **physics and racing first**: "If it's not real and accurate, then
it's not a simulator." ROADMAP.md stays the working list. This page says where that list is heading, and what "done"
means at each stage. Hours are rough focused build hours, ±50%.

## 1. Now to near: physics and racing dialled in

### What "dialled in" means (checkable)

| # | Criterion | How it's checked | Where it stands (13 Nov) |
|---|---|---|---|
| 1 | **The AI fleet races like the real SF Folkboat fleet.** On the five real Seaweed Soup days, in real wind and tide: the last finisher's median gap is within ±3 points of the real 11.9%; the median boat within ±2 of 5.8%; the race-to-race order (Kendall's tau) at least 0.35, against the real 0.42; the gap widening in light air, as in the real slope of about −2%/kt. | `npm run calibrate` (tests/calib), with the bands written into summary.calib.ts | Spread close (14.8%, median boat 7.7%). Order not yet: tau is 0.09, because there's no skill in the AI. That is the skipper model's job. |
| 2 | **Fouls at a real rate.** Protests, penalty turns and DSQs per race in line with the fleet's. | Fleet results plus protest records, if they exist (open question 1) | No real figure yet |
| 3 | **Every physics constant sourced, or flagged as an estimate with what would settle it.** | A list built from the code's "estimate/unsourced" comments, kept at zero unflagged | About 100 such comments; the big open ones are below |
| 4 | **The speed budget holds** in a full race: the perf test passing, a steady frame on a typical laptop, the physics moved to a Web Worker so the scene never stutters. | tests/perf.test.ts, plus a frame-time readout | Budget held after the speed passes; the Worker not yet landed |
| 5 | **The Racing Rules of Sailing covered for fleet racing:** Part 2 (10–24), 28, 31, 42, 44, signals and scoring, with a test per World Sailing Case used. Protests and hearings come later, in the middle stage. | tests per rule | Part 2 finished (v125–v137), blanketing ruled legal (owner), Z flag scored |
| 6 | **Crew and skipper models calibrated:** crew timings measured, skipper skill producing the real fleet's order (criterion 1). | crew timing tests; calibration | Crew timings still estimates; skipper model designed (docs/SKIPPER-MODEL-PROPOSAL.md) |
| 7 | **Heavy and light air true:** she copes unreefed as Bay boats do up to the 23 kt call-off; the light-air heel is checked. | heavyweather.test.ts and a source | Call-off and light-air heel done; depowering against the sailmaker still open |

### What remains, ranked

1. **The skipper model and its calibration** (15–25 h). This is the gap in criterion 1. Skill gives order, belief gives
   mistakes. The design is in docs/SKIPPER-MODEL-PROPOSAL.md.
2. **True-to-life rigging** (8–14 h; the owner's top boat item, Rigging is on it). The blocks, the Cunninghams and the
   lines along the traveller, each in its control's colour.
3. **The rest of the physics pass** (10–18 h):
   - depowering against the sailmaker's guide;
   - every wave and puff felt in the boat's response;
   - gust peaks against the Fort Point record;
   - water in the cockpit;
   - the hull's hydrostatics and righting curve past a few degrees, which needs the class lines plan (Plan 1; the
     researcher is finding who holds it).
4. **The physics in a Web Worker, and the frame budget** (6–10 h).
5. **Measured crew timings**, for criterion 6 (4–6 h). Video of Folkboat crews, or the owner's crew timed with a phone.
6. **Rig tuning** (5–8 h): mast rake, shroud tension, pre-bend, forestay sag, each in the physics.
7. **Real past races** (8–12 h): race a day the fleet actually sailed, in its real wind and tide, and see where you'd
   have placed. This is also the strongest validation of criterion 1.

That's about 55–90 h to "dialled in".

## 2. Middle: the Yacht Club, Seasons and the training tools

| Item | What it is | Needs first | Size |
|---|---|---|---|
| **The Yacht Club** | Where crew are made, set up and assigned to boats, and where you see and make other skippers (owner, 12 Nov). The race setup only shows and swaps the assigned crew. | The skipper and crew models (1.1, 1.5); accounts, so other players' boats and people persist | 8–14 h (Crew Model and Skipper Model are drafting it) |
| **Seasons and awards** | Real series (the Midwinters, the Seaweed Soup) with standings; awards become attributes of the boat and skipper | The Yacht Club; real past races | 6–10 h |
| **Cheating, protests and hearings** | Boats that bend the rules, hails of "Protest", a hearing that finds facts and decides under the RRS | The skipper model (belief and temperament); criterion 2's foul rate | 8–12 h |
| **Training tool 1: the wind indicator** | Arrows in the air showing true and apparent wind at several heights (owner's first) | Nothing | 2–4 h |
| **Training tool 2: the flow view** | Flow over the sails and hull: attached and stalled flow, the slot, what the telltales mean | The sail-shape model settled (1.3) | 8–14 h |
| **Next training tools** (proposals) | A start-line drill (timed runs at the line); tack-and-gybe drills scored on speed lost; a rules trainer that replays real WS Cases on the water; a VMG and polar trainer; a coach's replay comparing you with the winner (begun in v147) | The rules and debrief already in place | 3–6 h each |

Why it serves the mission: these are how the sim *teaches*. A season gives the reason to come back. The training tools
turn the physics into understanding.

## 3. Long term (after physics and racing are dialled in)

### (a) The Bay's beauty

- **What it is:** the light at each real hour; fog pouring through the Gate and burning off; sunsets; the skyline and
  bridges by day and night; wildlife; sound (wind in the rig, water along the hull, foghorns with their real
  characteristics, the bell buoys).
- **True to life:** all of it driven by real data. The sun's position for the date and time (already in), NWS and
  observed visibility for the fog, the chart's light and sound characteristics.
- **Why it serves the mission:** the owner chose the Bay for its "staggering beauty". It's also information: fog closes
  your eyes on the course, and the light shows the puffs.
- **Prerequisites:** the frame budget (1.4). Beauty can't cost speed.
- **Size:** 20–40 h, in pieces.
- **Open questions:** how much sound? Should there be a "photo mode"?

### (b) A robust open-Bay cruising mode

- **What it is:**
  - passages with goals: Sausalito for lunch, round Angel Island, under the Gate and back on the ebb;
  - seamanship challenges: anchoring, docking under sail and power, man overboard, night navigation by the lights and
    chart, and reefing in a blow (held until there's a Folkboat-specific source);
  - a cruising log, and an improvement loop: "you and your crew against yourselves", with your times, your clean
    dockings and your passages in the log.
- **Why it serves the mission:** it makes better sailors without a fleet, and it's the "family weekend cruiser" side
  of the Folkboat.
- **Prerequisites:** the Bay East harbours and current fields; the navigator (done); docking physics under sail
  (push-off is done); a reefing source.
- **Size:** 30–50 h.
- **Open questions:** which passages first? Should a seamanship challenge be scored, and how? Does cruising keep the
  same boat and crew as racing?

## Open questions for the owner

1. Are the fleet's protest and penalty rates recorded anywhere (results with DSQs, protest committee minutes)? This
   would settle criterion 2.
2. Could the owner's crew time a few routines on Josephine (a tack, a gybe, setting the pole)? This would settle crew
   timings.
3. Are the criteria in section 1 the right bar for "dialled in"? Should anything be added, or tightened?
