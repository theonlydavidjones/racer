# Vision roadmap: near, middle and long term

_Adopted by the owner, 13 Nov 2026: the seven "dialled in" criteria are the bar. Protest records: the owner will try to get some; meanwhile we research independently. Crew timings: the owner can time routines next season (the current season is over); until then, published sources._

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
| **Learn to sail** (owner, 13 Nov; unranked, design to the owner first) | Guided lessons on the water for a first-timer: parts of the boat, the tiller, points of sail, telltales, tacking and gybing, heaving to, docking. Checked against a recognized syllabus (US Sailing Basic Keelboat). The only place step-by-step instructions belong; the sailing screen stays clear of them | The Drill section; the coach's on-water cues | 12–20 h |
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

## 4. Community (owner, 13 November)

The owner's words: "You can't race in real life without belonging to a club. No single person can know or do everything
required to sail and maintain a boat. The building of marinas, the trading and training of crew, the flying of
burgees, the traditions, the legacies, the trophies all belong to that community element. Eventually we'll want a live
multiplayer mode." The priority still holds: physics and racing first. Community builds on them.

### Middle: the Yacht Club as the hub

- **What it is:** the club as the place your sailing lives.
  - **Membership:** you join a club, and its burgee flies from your boat.
  - **Crew:** crew trained and traded between members, their skills growing with the races they sail.
  - **Officers:** a commodore and a race committee, with the club's burgee, flag etiquette and traditions (the
    first-race-of-the-season blessing, the Wednesday nights).
  - **Perpetual trophies** with their history: every winner's name on them, year after year.
  - **Seasons and standings**, run by the club.
- **Why it serves the mission:** racing on the Bay is a club life. Crewing for others and learning from better
  sailors is how real sailors improve, and the traditions are part of the magic.
- **Prerequisites:**
  - the skipper and crew models (section 1);
  - the Yacht Club screens (section 2, Crew Model and Skipper Model's design);
  - accounts, so other people and their boats persist. The artifact already declares the `user` and `db`
    capabilities that the saves use (store/cloud.ts).
  - Seasons (section 2).
- **Size:** 15–25 h beyond the Yacht Club and Seasons themselves.
- **The owner's answers (13 November):**
  - **Real clubs**, for now (GGYC, StFYC, the Corinthian, SBYC…). Before any public release, each real club's name and
    burgee need its permission.
  - **Crew trading with AI members only**, until multiplayer.
  - **Traditions:** researched, ranked by how central they are to a member's life and by what a sim can honestly
    portray, in docs/TRADITIONS.md.

### Long term: live multiplayer

- **What it is:** racing other people in real time, on the same Bay, in the same wind and tide, under the same rules.
  Later: cruising together, and a club's own regattas.
- **Why it serves the mission:** racing real people is the real test of tactics and the rules. It's also the community
  the owner describes.
- **What the Capacity work already gives it** (steps 1–3, under way):
  - the sim in a Web Worker, apart from the page;
  - a snapshot/command boundary: the page reads the race through a read-only view and changes it only by commands.
    Commands are exactly what a network would carry;
  - deterministic, seeded races, so every player's machine can run the same race from the same inputs, with only the
    commands sent.
- **What it would still need:**
  - **A server.** An artifact page can't host a live race, so this needs a game server, or a relay that orders the
    commands. This is the step the desktop release's watch note anticipates.
  - **Authority and anti-cheat.** The server is authoritative for positions and the rules, so no client can push its
    boat.
  - **Latency on rules calls.** Overlaps, hails and protests decided at the server's tick, with the delay shown
    fairly. Close-quarters moves like a mark rounding or a port–starboard crossing are where 100–200 ms shows.
  - **Accounts and identity,** beyond the artifact's user and db.
  - **Moderation** for chat and hails.
- **Prerequisites:**
  - physics and racing dialled in (section 1);
  - the Capacity work complete;
  - the Yacht Club;
  - the desktop release or a hosted page that can reach a server.
- **Size:** 60–120 h for a first live race of a few boats, more for a full regatta.
- **The owner's answers (13 November):**
  - **Club members only**, but "membership is just an attribute at this point".
  - **"Ghost" races first:** racing against another member's recorded race, with no server needed.
  - **Who runs the server:** open for later. When it's time, this doc lays out the simple options and their costs in
    plain words.

## Open questions for the owner

1. Are the fleet's protest and penalty rates recorded anywhere (results with DSQs, protest committee minutes)? This
   would settle criterion 2.
2. Could the owner's crew time a few routines on Josephine (a tack, a gybe, setting the pole)? This would settle crew
   timings.
3. Are the criteria in section 1 the right bar for "dialled in"? Should anything be added, or tightened?
