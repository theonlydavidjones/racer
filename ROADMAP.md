# Build plan

**The mission** (the owner's words, 13 November 2026; in full at the top of CLAUDE.md): a true-to-life sailing simulator
that helps people learn to sail, sail better and race better, as good as actually sailing to the maximum reasonable
extent. Racing (tactics, seamanship, helmsmanship, teamwork, knowing the conditions and your boat) and cruising (you and
your crew against yourselves, and the beauty and magic of sailing), on San Francisco Bay, for its complexity,
variability and staggering beauty, in a Folkboat, the purest sailing boat a normal person can own. "If you can sail the
Bay, you can sail anywhere; if you can sail a Folkboat, you can sail anything." Every item below is weighed against it.

**The vision roadmap** (adopted by the owner, 13 November): docs/VISION-ROADMAP.md, near, middle and long term. Its
seven "dialed in" criteria are the bar for physics and racing. On its questions: the owner will try to get protest
records (Skipper Model researches meanwhile); crew timings come from published sources until next season.

**Standing rule for the screen** (owner, 13 November): "We should be extremely conservative about allowing new buttons
and distractions on the game surface." New controls go inside existing elements (the inset map, the sail band, the
menus, the Keys), not as new buttons on the screen. Every item below that adds a control is held to this.

**The order of work** (owner, 13 November, also in CLAUDE.md): physics and racing first. "If it's not real and accurate,
then it's not a simulator." Later, once the physics and racing are dialed in (the owner loves both):
- **The Bay's beauty:** light, fog pouring through the Gate, sunsets, the skyline, the bridges.
  Scenery for it (owner, 13 November; later, with the Bay's beauty):
  - **Oracle Park** (6–10 h): the ballpark on the shore by McCovey Cove, with its pennants waving during games, the
    lights on for night games and concerts, the scoreboard lit during games, and kayakers in the cove waiting for splash
    hits. Driven by the Giants' real home schedule and the park's events for the sim's date, where it can be sourced.
  - **Alcatraz, properly built out** (6–10 h): the cellhouse, the lighthouse, the water tower, the guardhouse and
    dock, the ruins, at real scale and in significant detail.
  - **The Palace of Fine Arts, refined** (2–4 h).
- **A robust open-Bay cruising mode:** passages with goals; seamanship challenges such as anchoring, docking and
  reefing (reefing still waits on a Folkboat source); a cruising log.
  - **The Farallon Islands, built out and reachable** (owner, 16 November; feature; later, not urgent; 20–40 h, an
    estimate): "built out the farallon islands and make them an attainable destination on the map. many sailors
    consider a rounding of the islands from the Bay to be a test of whether a sailor and vessel are ready for true blue
    water passages, as it's one of the trickiest and most demanding passages you can do." The islands lie about 27 nmi
    west of the Gate, far outside today's map (its west edge is 122.61°W): the map, the chart (NOAA ENC), the sea and
    the wind extended out to them; the islands themselves at real scale (Southeast Farallon, its lighthouse and station,
    Maintop, the Middle and North Farallons, Fanny Shoal, Noonday Rock) as a named destination and a rounding, Bay to
    Bay. The open ocean done honestly: the full swell and wind sea from the buoys (NDBC 46026, 46237), the shipping
    lanes, the sanctuary's rules. To research first: positions, heights and hazards from the chart and Coast Pilot 7,
    and the real races that round them (the Singlehanded and Doublehanded Farallones, the OYRA Full Crew Farallones),
    their courses and times, as the yardstick.

- ~~**West Harbor**~~ (done: docks, slips, sailing in and out, your boats' slips) ~~and Gashouse Cove, South Beach and the Corinthian~~ (done). ~~Horseshoe Bay~~ (done, v81: Travis Marina at Fort Baker, 79 slips on docks A–C (the sim's own letters), the breakwater from NOAA ENC, docks on white piles, shelter from the harbor walls). Noticed there, later (polish): a coarse 50 m terrain strip about 20 m off the breakwater's outer face; the Golden Gate Bridge's blocky north anchorage; ~~chunky generic moored boats in the marinas~~ (done: the slips within 120 m of the camera drawn in detail, boot stripe and bottom paint, cockpit well, raked cabin with its windows, shrouds and spreaders, pulpits and lifelines; the rest with bottom paint, shrouds and a cockpit sole; render/mooredNear.ts). Later: the other Bay marinas (Sausalito, Richmond, Berkeley, Alameda); ~~the real slip numbers~~ (done: South Beach's docks and slips, and West Harbor's and Gashouse Cove's slip numbers and Docks E, F, G, from the harbors' maps, the order along a dock inferred where the maps don't show it; the Corinthian's A dock is real, its others and its numbers aren't published); ~~boats in neighboring slips drawn as real boats~~ (done: lofted hulls, cabins, rigs and covers, a share of powerboats; their proportions and the power share are estimates still to check against sources); docking lines and an outboard for getting in and out.
- **The beat angle in chop jumps** (fixed on a branch, 8e8e7c06, the angle's choice blended; awaiting the batch; Deep Physics, 16 November; from the cross-World leak's review): speedInChop × cos(twa) has
  steps where driveCurveFor (boat/driveCurve.ts) rounds the angle to 5° bins and the wind to whole knots, unblended,
  so the VMG curve has two near-equal peaks and beatInChop's answer swings 5–7° on a 0.25 kt puff (the speed made good
  between them under 0.2%). The AI's target angle and the laylines move with it. Blend the drive curve across its
  neighboring bins, as driveCalibration already does across the wind.
- **AI steering in a dying breeze** (Skipper Model, after their irons PR; the Coordinator, 16 November; found by Crew
  Model's crewstation work): in races whose 6 kt westerly dies to 1–4 kt, the AI's tacks stall at about 2.3 kn and fall
  off the long way round through a jibe, and its desired heading flips 190↔284 every 10–20 s, or zig-zags 55°↔105–160°
  true, each held 20–100 s. Her crew trim for each course (the vang on for the reach, off again for the beat), and
  tests/crewstation.test.ts's 2.0 backstop failed on 6 kt seeds 4, 11 and 15; since the AI's pole call waits for the run to
  hold and the guide's angle holds through a swing (claude/crew-habits), all 24 seeds pass it and nothing is held. The
  steering itself is still to fix.
- **The light-air tack's follow-ups** (after the sprint; Skipper Model, from the physics review of claude/ai-light-steer,
  19 November): physics.ts slowTack, the speed the AI tacks from (TACK_WAY, 0.6 of her close-hauled speed, an estimate):
  - **Chop lowers it, the wrong way:** a seaway stops her head to wind more than flat water does, but targetFor falls in
    chop, so slowTack falls with it (0.05–0.08 m/s at 6–8 kt; SLOW_TACK caps it from 10 kt). It wants an allowance for
    the waves' braking, not only her lower target speed.
  - **Swell isn't in it:** targetFor reads only the wind sea (hsW, tpW), so in 3 kt with the Gate's swell slowTack is
    0.56 m/s, where a real Folkboat would be stopped dead in a tack.
  - **Sternway head to wind in a breeze** (with the heavy-air tack work, SLOW_TACK itself, still unsourced): stopped head
    to wind in 12 kt, a committed tack showed no sternway over 23 s; her rig's windage, about 110 N there, should start
    her drifting astern. The sculling floor (dynamics.ts HANDLING.minTurnRate, 4°/s, an estimate) gets every tack round
    from rest in this sim, so it, not the boat's way, decides whether a slow tack succeeds.
- **The outhaul in a breeze wandering across the guide's steps** (Crew Model; the physics review of the crew habits,
  16 November): two cases left after the guide's steps were read as its ranges (controls.ts guideLimits):
  - a light-air beat whose breeze swings across both 4 and 5 kt (3.5 to 5.7 kt read) still has them at the outhaul
    every 70-90 s, 0.05 to 0.45 and back: what the guide says for those winds, but more than a crew would do;
  - in 11.5 ± 1.2 kt the outhaul creeps off the mark in six trips, a trip each 95 s, for one ease.
  Both want the trip judged against what it's worth and the wait since the last, not forced by the band.
- **The sea turning with the wind, truly** (for Deep Physics, next after the boom's place on a beat; the Coordinator,
  16 November; Capacity to check the frame's cost): the wave field is plane waves turned about your boat, so any turn
  sweeps the pattern sideways at a distance; its turn is now capped at about 4° an hour (environment/waveField.ts
  turnCap), a stopgap that stops the "rushing water" on days sailed from the observed record but leaves the chop
  lagging a big shift for hours. Real short chop comes round in ten minutes or so, the old waves dying as new ones
  grow from the new direction: model that, two seas cross-faded, and take the cap out.
- ~~**The sea turning with the wind, truly**~~ (done on branch sea-born, Deep Physics, 17 November; awaiting the batch):
  no wave of the chop turns now. Its components change direction in pairs, one dying into its neighbor and born again
  for the new wind, the pair's energy kept, so the old sea fades as the new one grows across it and nothing sweeps at
  any distance (environment/waveField.ts update); the cap on the chop's turn is gone, and the boat's wave drag reads
  the chop's direction from the same components. The time is the wind's input to waves as measured (Snyder et al.
  1981, Komen et al. 1984): in 10 kt the 1 s waves in about 8 minutes, the main chop in about an hour. (The earlier
  line here, and #450, said real chop "comes round in ten minutes or so": that was unsourced, and true only of the
  shortest waves in a breeze.)
- **Smooth the drive curve's other corners** (later, for Deep Physics; the Coordinator, 16 November; 4–8 h, an
  estimate): the polar's straight lines between its tabulated angles, and the hull resistance's table over Froude number,
  put kinks in every boat's speed curve. The beat-chop fix (8e8e7c06) fixed the choice of angle without touching them.
  Fit both smoothly (monotone cubic or similar), then calibrate afresh against the polar and the Delft resistance;
  perf-pair --ai, then the physics-reviewer.
- ~~**The way round the land out of the Estuary runs through Alameda**~~ (done: estuary-route and ai-calloff-clear, batch48; Bay East, 16 Nov 2026, found reviewing #442; the
  Coordinator: Bay East's, next): sim/routing.ts routeAround from the Estuary's harbors (Encinal, Oakland YC, Marina
  Village, Fortmann, Grand Marina, Alameda Marina) to the central Bay (Pier 39, Alcatraz) gives a single straight leg
  through Alameda, on main as on #442: 186 of 1356 ways out of the harbors' entrances. The way out is down the Estuary
  and round Alameda's west end. Found: at 120 m off the land every cell of the Estuary was blocked. Fixed on
  estuary-route: where no way is found, half as far off and half again, down to 30 m, her width kept on every leg then;
  0 of 156 harbor-to-harbor ways now cross the land. And the call-off's ways home are worked out a slice a step (from off
  Emeryville the fleet's took ~400 ms in each of three steps).
- ~~**The AI keeps way on in irons; no penalties left to take once racing's called off; the inset's route worked out without freezing (#440)**~~ (done: claude/irons-main, rules-abandon, batch48; navroute-sliced, batch47b).
- **Fort Point: its rocks solid, and its surf** (owner, 16 November; accuracy; not urgent; next; 8–14 h in two parts;
  for Bay East or Deep Physics): "lets look into the area around fort point, especially inside the gate, to be sure
  we accounting for all the rocks and jagged coastline there. also look into the waves there; this is a popular surfing
  spot in the right conditions, and very very dangerous for boats, but I'm not seeing that reflected in the sim."
  Found (Roadmap, 16 Nov): the NOAA ENC in src/geo/data/enc-chart.json already holds 1051 charted hazards, 33 of them
  around Fort Point (lon −122.485 to −122.46, lat 37.800–37.815: 28 rocks that cover and uncover, 2 awash, 2 always
  under, 1 obstruction) and 17 at Mile Rocks, but only the chart draws them (ui/encChart.ts): nothing in the sim hits
  them, the router and navigator don't avoid them, and damage.ts's 'rock' is never set by them.
  - (1) The rocks solid (4–6 h): each charted rock a hazard by its water level (S-57 WATLEV) and the tide's height
    (tide.ts): a strike graded by damage.ts as 'rock'; routing.ts and the navigator keep clear; the shore under the fort
    as riprap, its outline checked against the ENC's coastline at the chart's largest scale.
  - (2) The surf (4–8 h): waves shoaling and breaking over the rocks and shallows under the fort and the south tower,
    from the real swell (NDBC 46237, San Francisco Bar; 46026) and the current (NOAA SFB1201, Bay Entrance: ebb toward
    239°, to 4.8 kt this November; flood toward 061°, to 3.1 kt): breaking where the depth is under about 1.3 times the
    wave height, and steeper on an ebb against a westerly swell; shown as breakers and felt by the boat. Sources to
    confirm first (blocked from here: nauticalcharts.noaa.gov for Coast Pilot 7 and charts 18649/18650): the break's
    swell (W–NW, about 4–8 ft, low tide, by surf reports only), and the Coast Pilot's warnings at the Gate.
- **A room for each cell of the way round the land** (the physics review of estuary-route; the Coordinator, 16 Nov 2026:
  a follow-up): routeAround's lesser room is one for the whole way, so once a narrow channel needs 60 or 30 m the open
  Bay's legs keep only as far off too (Encinal to Berkeley: 57 m where 120 m would give 62–102 m). Each cell the most of
  120/60/30 m it allows, or a cost for less, so only the narrow reach is sailed close.
- **Prepare for the rounding** (Crew Model; the Coordinator, 16 November): with a mark close ahead, the crew get ready for
  the rounding (the pole, the vang, the jib car for the next leg) and make no small-gain cabin-top trips for this leg:
  within about 30 s of a mark (an ESTIMATE, to be sourced if possible). Found on the shelved back-up-to-speed branch
  (claude/back-to-speed, 60e0dbb4): waiting for her speed after a tack moved a jib-halyard trim to five seconds before
  the windward mark, undone after the bear-away (12 kt seed 6: three extra trips). Back-up-to-speed returns on top of
  this and the AI's light-air steering.
- **AI boats into the harbor after an abandonment** Also, from the perf branch's checks: a boat right by the West Harbor entrance at the
  call-off can brush a breakwater's end with her side as she leaves (westerly, seed 6 of 16: 1.5 s; routeAround lets a way
  come close near its start). (for Marinas, with Deep Physics; the owner, 12 Nov 2026: later):
  after N or AP over A the AI boats now sail home and stand off the nearest racing harbor, each at her own spot with
  open water to leeward, lying to (ai.ts homeCourse). Real boats would go in: sail or motor through the entrance and
  berth in the basin, out of the breeze (lying to for an hour in 23+ kt is hard on the sails). That needs the AI boats
  given slips and the marina's way in (geo/marina.ts), as the user's boat has.
- **Sternway and leeway with sails up** (from the push-off work; for Deep Physics and the AI): physics.ts now drives a
  stopped boat astern and sets her to leeward from the wind on her bare rig (sails struck, as at the dock). In irons with
  her sails up and flogging she'd drift astern too (a knot or two in 15 kt), and slow with sails up she'd make more leeway
  (the sails' own side force: done, with leeway, Deep Physics item 7), but the AI's sailing doesn't reckon with sternway
  yet (an AI boat luffing by the committee boat drifts onto it), so with sails up she still stops dead. Also: heaveTo still clamps
  sternway; ~~the end tie's push-off doesn't allow for the wind setting her back onto the dock~~ (done: her bow's pushed off to close-hauled, away from the dock; a boat set sideways now stops against a dock or the shore instead of passing through).
- **Her bare hull's windage at its own height, and the bare-poles drift ahead** (physics review of the sternway drag,
  17 Nov 2026; for Deep Physics, later): the wind on her bare hull and rig (windageCdA 2.0, ORC) is all taken at the
  sails' height (4.29 m), but about 1.17 m² of it is hull near 0.6 m, where the log profile gives 0.63 of the wind
  against 0.889: weighted by height the push falls about 30% and her terminal sternway about 15%. And a wind abaft the
  beam drifts her ahead at a tenth of the wind (1.03 m/s in 20 kt), unsourced, where a force balance on the same
  windage gives about 1.4 m/s; stern first she now makes 1.07 m/s against twice the drag.
- ~~**The sea inside the marinas**~~ (done, bay-east-7: the swell diffracts through each entrance by the exact gap solution, scripts/make-gap-diffraction.py, the Penney & Price problem the Shore Protection Manual draws for B/L 0.5–5; the fetch is traced finely just outside a marina as well as inside, every 2° by one, and blended between its 10 m nodes;
  swell running past an entrance bends round its breakwater head by Sommerfeld's half-plane solution; over a swell's
  spread of directions, Mitsuyasu/Goda s 75. Left out, from review: the basin's own walls reflecting the waves (Gashouse
  Cove's seawall reflects nearly all, so the real basin holds more than the bare diffraction gives, and long swell can
  set up a harbor's seiche); piers between an entrance and a slip (20 of Gashouse Cove's slips have none in sight); the
  tide's depth over the entrance (MLLW's); a curved breakwater taken straight at its head (West Harbor, facing east,
  away from the swell, gets well under a millimeter in a 2 m swell outside, where the old unsourced ×0.15 gave 3 cm)) (from review
  of the Gashouse Cove seawall; minor): (1) the swell gets in on a single ray
  through the entrance, so a strip a few meters wide just inside Gashouse Cove's entrance gets the full swell while its
  neighbors get a seventh of it; a 12 s swell (~225 m long) should diffract weakly and evenly through a 20–40 m gap, by
  sourced coefficients (Wiegel's diffraction diagrams, Shore Protection Manual) in place of the unsourced ×0.15;
  (2) the 15 fetch rays alias on the 10 m grid near an entrance (chop 0.17 → 0.04 → 0.13 m over 12 m at 315°): spread
  or smooth them; (3) at South Beach and the Corinthian, just inside the entrance has a little more chop than just outside
  (fetch 194 m against 108 m), from the open-water ray's 50 m minimum fetch (2–4 h).

What's planned, roughly in order. Done work is described in the README.

**v210 (19 Nov, main 08afb104):** the AI's penalty turns (#483), the soak, letting a sheet go, detours near boats (#480), the helm's foot, headroom (#482), the jumpers' arrows and readout rounding, Hoist tabs, the weather refresh, the Berkeley Pier gap reopened.

**v209 (19 Nov, main c1e3b75a):** #460 and #467–#479, crew hands, the weather-helm chip, crew dock jobs and poses, the tide-leg coach line, brand names out of player text, approx.test on 24 seeds.

**v208 (18 Nov, main b4334c09):** shallow waves (#454: the chop at the depth's group speed), the router's give-up fixes (Deep Physics' reviews), lying to after racing is called off, the setup chart's lee warm-up, the ten-race-mean budget for AI and rules changes. perf-ab clean against v207. Held out: FTUE's first run (reverted again). v209 is collecting.

**v206 (18 Nov):** the tiller's travel to the after deck (46.5° hard over, fitted to three photos; #437) with the AI's helm to the stall near a boat and its first-mark fix; the boat editor's colors (#354); push-off reasons and the sourced sternway drag (#458); Nav home's way in and the navigator layer; the cold current and the pump fix; the club burgees and five club bases; shore-pinned and sea-born (#456, #457); rules incidents; the outboard's start under 5 s. Held: shallow waves (#454, cleared, v207), FTUE's first run (back once its inset cost is fixed).

**v206 (18 Nov):** tiller travel to the deck's stop and the AI's helm (#437), the boat editor's groups, picker and colorways
(#354), sternway drag and push-off reasons (#458), the navigator home and as a layer on the chart, the burgees and five
club bases, Rule 44.1 jams as one incident, the outboard in 5 s. Held: shallow waves (#454, cleared for v207), the first
run (FTUE, its inset cost).

**v205 (18 Nov):** fewer first-mark pile-ups (#453), the committee's beat-start course (#452), hands on the lines when
hiking, crew stations (#446) and habits (#455), Sail Home paced, the destination pin, the 8 m slip walk-out, the rounding
note (#447), the coach's heeled speed (#449), the wind to the second (#451). Still open: shallow waves (#454, pulled: it
broke the first-mark test), the navigator's harbor-mouth pilot home, the navigator as a layer.

**Every owner request is also kept in Owner's Requests** (https://claude.ai/artifact/9LqaHyCJvUStsifA29UAj3; the owner,
17 November: "I feel like features I've requested are being lost"): one row per request, ranked now · next · later ·
done, in the artifact's own database, so it survives compaction. Each new request goes there as well as here, and moves
to done there when it ships.
**Every finished feature is kept in Finished Features** (https://claude.ai/artifact/RzR3C42c24ZiGNCWsrPn7Q; the owner,
17 November, for documentation later): one row per feature, by area, with what it does, its key, the version and its
sources. Each shipped item is added there when it's published.

- **Motor sailing: her speed with the sails up and the motor on** (owner, 17 November; accuracy; later, "low priority";
  1–3 h; Deep Physics): "motoring speed should account for sails being up. sails should impact physics when motor
  sailing, if they don't already." Found (Roadmap, 17 Nov): physics.ts already adds the outboard's thrust (motor.ts
  motorForce) to the sails' drive and drag in the one surge equation, so the sails do count. To check and test: motor
  alone against motor and sails on a reach and close-hauled (faster, toward hull speed), head to wind (the flogging
  sails slow her), and the apparent wind the sails see while she motors (her motored speed in it); then the physics
  review.
- ~~**Mounting the outboard takes far too long: 5 seconds at most**~~ (done, v206: running in 1.9 s, 4.9 s at worst) (owner, 17 November; polish; later, "low priority";
  1–2 h; Marinas): "mounting the motor takes way, way too long. 5 seconds max." The crew's lowering and mounting of the
  outboard on its bracket, from the call to running, in 5 s or less.

## Priorities (owner's ranking, November 2026)

**The sprint: stability, performance, playability** (owner's ruling, 18 November 2026, via the Coordinator):
1. In-flight work finishes and ships: what's already built or approved (the sail band's tips, the jumpers and the
   Hoist tabs, Sail home and tie-up, the tiller-angle needle, Mile Rock and the rest of v208).
2. After that, no new features until the sprint ends.
3. The sprint's order: the owner's bugs first, then lag and frame time, then playability end to end (slip out,
   hoist, sail, home, tie up, and a race).
4. Each bug gets a test that reproduces it before it's fixed.
5. Bugs are tracked in Owner's Requests' Bugs view, each with its assignee.
6. Parked until after the sprint: turn drag, the collision changes, the slow-boat keep-clear, and anything new.
   Also parked (the Coordinator, 19 Nov): **the way off a structure's follow-ups** (8q7, nav-beside, in v210; the
   physics reviews' points left open). The pilot's turn lags the arc it's judged by (1.5 s measured against the arc's 1,
   and a small turn never reaches hard over), so a way off accepted near its 2 m keep may pass closer; the full-rate helm
   and the 1.5 s lag were tried and each made a start worse. Re-looks every 0.5 s along a converging face can creep her in
   (hold the line's keep to her offing when the way off was found). No charted depth along a way off (with the grounding
   on depth). The tack gate (OFF_TACK, 2 m/s, 2.5 pinched) is fitted to two starts, not measured: judge a tack's real
   track, 8–18 s of slow turning, instead. The bridge piers' collision shape may be larger than wharfNearest sees (Pier F).
   Struck but still engaged: from 1.1 m off Pier 45 the pilot stays on through six strikes (on main too). And 31 of 155
   sweep starts are handed over "too close alongside", most then striking unattended: starts 45° into a face at 5–6 kn.
   Also parked (the Coordinator, 19 Nov): **the unanswered-hail duck** (Rules, branch ai-keepclear-hail, c59e42c7). On
   main, W never ducks S when her hail goes unanswered (rules-finish). The branch fixes it with a keep-clear-first state
   for a boat owing turns, but the 92-race census read 300 fouls vs main's 295 and 30 touches vs 26 (sign test p 0.77,
   0.58). It moved penalties to the marks: 76 within 35 m vs 62. A boat owing turns waited up to 30 s in the mark
   traffic before turning. To do: no keep-clear-first inside a mark's zone, then census again. Its three W–S stalled-hail
   checks stay it.fails, for the hail lead time and the rule-10 ratchet.
7. **Auto-nav paused** (owner, 19 November 2026): "pause all future work on autonav"; auto-navigation isn't the point of the
   game. No session starts work on the Nav pilot, its planner or its follow-ups (8s and PR #337, closed; 8q5, 8q7, 8q9).
   Bugs that break something else (a test, a race) are still fixed, kept small. Land and water true to life stays:
   see "Real shoreline" (the shoreline survey) and 8q8.
7. **First after the sprint: Alcatraz and the whole city front, Fort Point to Fisherman's Wharf, in high resolution**
   (owner, 18 November; feature; status: planning; the Coordinator drafting). The plan so far: (1) a researcher pass on
   data and licenses (LiDAR, OSM, public-domain plans, CC-licensed models); (2) the models built outside the agent
   sessions where possible (Blender with Blosm, compressed glTF with levels of detail) to save tokens; (3) one
   integration session to wire them in, checked against frame speed and the page's 16 MB size budget (about 6 MB used
   today). It takes over the "Alcatraz, properly built out" item (6–10 h) and widens it. The plan, in four phases
   (Alcatraz, then the city blocks, then the hero landmarks, then night windows): docs/plans/cityfront-alcatraz.md.

**The open work, ranked** (owner, 12 November 2026, after an audit of every item against main; hours ±50%):
1. ~~P0 phase 2: the interior true to a real Folkboat~~ (done: the berths in the GRP inner molding with brown cushions,
   shelves and fiddles, floorboards, knees, a hanging locker, the forepeak opening to the rule, the keel-stepped mast).
   Next in P0: true-to-life rigging (the owner's top boat item, Rigging, begun with the mainsheet's blocks) and the
   boat review's bugs, winching and polish (P0 items 6–7).
2. ~~Finish the crew figures: the crew's stations onto the real benches~~ (done, crew-stations merged). Owner chose option 2: the benches plus the side
   deck alongside them and aft of the thwart beside the after shelf (hips 1.35–2.5 m), where crews really sit; about
   today's fore-and-aft range, shifted aft; the trim calibration re-tied, physics review done. Crew Figures, one PR
   (in progress). Follow-ups from Crew Figures: the helm's shin cuts up to 9 cm into the aft coaming as she crosses in
   a 20 kt hiking tack (around z 2.55, x 0.6; on main too): fix the crossing path, then sample every 2 cm along each
   bone in tests/crewfig.test.ts's "never pass through the boat" check (1–2 h). (Fixed in its own PR, Crew Figures.)
   ~~Next follow-up~~ (done, #126, v136; Crew Figures, 12 November; 2–3 h): the crew's legs graze 3–8 cm into the coaming while moving along
   the side deck (climbing out, passing the thwart, sitting down on the deck), mostly on the route planner from #110.
   One cause found: in render/crew.ts route(), a goal aft of the thwart isn't updated when the physics target moves
   forward of it mid-route, so the figure sits and stands at the old spot for a second or more (20 kt tack: crew 1 at
   2.245 while the physics has her at 1.65). A naive fix upsets other moves, so it's its own piece of work. Done when
   tests/crewfig.test.ts samples every figure at 0.05, not only the helm, and passes.
   Parked for the owner to choose (Crew Figures, 12 November; minor by the visual round): in a tack in 12–16 kt the two
   crew's hips pass within 0.21–0.23 m mid-cockpit for 1–1.3 s (8 and 20 kt are clean). The forward hand's deck seat
   (1.65, just aft of the jib winch) and the aft hand's climb-out point to pass the thwart (1.85) are only 0.2 m apart,
   both physical limits. Options: (1) a sit-and-swing over the thwart inside the cockpit (sit on it, legs over, step
   down onto the after shelf), properly staged; or (2) the main hand tacks the mainsheet from aft of the thwart, at the
   after shelf, so he never passes forward along the deck (a change to the tack role's station: physics and a pose).
3. ~~Crystal clarity on the crew and trim controls~~ (done, live in v134: the band with the main halyard renamed, the jib
   halyard, the Auto-trim and Pole tabs, the windex and the Hail tab, v120–v129; the chase-view layout, v129; every RRS
   2025–2028 race signal in the flag index and one-line messages with the log, v132; line colors in the boat editor and
   the committee's call-off shown clearly, v134). Owner's answers (12 November): the crew leans across from windward, as the sim has it; no tiller strip. The
   questions were: (1) on Josephine, does the crew reach
   the far side of the piano from windward (the sim leans them in, 0.2 m to windward)? (2) bring back a tiller strip
   (left out because the cursor is the tiller)? The design as agreed: **the sail controls band**, the owner's design (12 November): "toggle
   on a view of the sail controls that stretches across the bottom of the screen — maybe the bottom quarter; more if it
   needs the room". Three horizontal layers in the band, top to bottom:
   - **The piano**, "mirroring what really exists on Josephine" (the table under Full sail controls: starboard, inboard
     to outboard, vang · outhaul · jib Cunningham · the jib halyard tail; port, vang · outhaul · the main Cunningham's
     clam cleat (main Cunningham) · jib Cunningham, with the main halyard's tackle). Mock-up in progress with the UI & Experience session:
     https://claude.ai/artifact/TiHGqpmpSFh5bw7AJ6RctB: trim / ease buttons on each.
   - **The jib**: a sheet on each side, trim / ease.
   - **The main**: the mainsheet, the backstay, and "the traveler specifically I would want to move left and right
     like a real traveler" (a car you drag along a track).
   Laid out as you face forward from the helm (port on the left), each control with its auto pill, its setting, and its
   ends named. Later: the jib cars and the rig ("we can figure that out later"). A clickable mock-up goes to the owner
   before the build. 6–10 h; replaces the trim-panel review.
   **Design agreed with the owner, 12 November; handed to the Coordinator to build.** Mock-up:
   https://claude.ai/artifact/TiHGqpmpSFh5bw7AJ6RctB (source design/sail-controls-band.html on branch
   ui/sail-controls-band-mockup). A compact console at the bottom center:
   - the piano lines and jib sheets vertical (▼ pulls on);
   - the jib cars as an H: the crossbar slides fore and aft on two tracks, the car slides across it (controls.ts's 7×5
     pins). The cars are now in scope, no longer later;
   - the backstay's ends pulled outboard;
   - the mainsheet shown as the boom's position, stacked above the traveler car;
   - one click is one step; rope colors by sail (jib warm, main cool);
   - Crew or You shown by an amber name, tap it to hand the line back, "All ↺" for every line.
   Build needs: "downhaul" renamed "Main halyard" everywhere the player sees it, and a new jib halyard control
   (starboard, jib luff tension), with a physics review.
   **With the band: the chase-view layout** (owner approved 12 November; handed to Crew Controls with the band). Mock-up
   https://claude.ai/artifact/S2ZAPSy3CPsptyFWidxh8N (design/chase-layout.html on ui/sail-controls-band-mockup):
   - the middle ~40% of the screen kept clear for the rig;
   - the dials in the top corners: a rectangular heading pod in place of the compass tape, and a circular inset chart;
   - one "where next" card (start line, over early, next mark, finish, or the navigator) in place of the start-line
     and transit banners;
   - a flags-only tile that opens a flag index, for learning the flags;
   - the Coach card bottom left, the Messages card bottom right;
   - Hail as a tab on the band, only when a hail applies; the old trim panel removed;
   - the chase camera framing the whole boat above the band by default (zooming past it allowed);
   - on the band: an AUTO-TRIM tab (was "All"), a POLE OUT / POLE IN tab only on a run, a round windex between the
     vangs.
   Also queued (owner, 12 November: "yes"): the rest of the RRS race signals in the flag index (AP, N, first
   substitute, S… from the RRS 2025–2028 "Race Signals" page, checked by the researcher; 1–2 h); and one-line
   on-screen messages with the full text in the log (1–2 h). Not queued: renaming the "Crew · Auto" button.
   After the band (owner, 12 November; not urgent; 1–2 h): line colors chosen in the boat editor, one per line (jib
   sheets, jib Cunningham, jib halyard, mainsheet, outhaul, vang, main Cunningham, main halyard, backstay), used in the
   band and on the 3D lines once P0 phase 4 draws them; the band's defaults (jib warm, main cool, backstay white) as
   the starting set; saved with the boat.
4. ~~Outside the Gate, the sea dial against the chart and the water~~ (done: the tide predictions roll on past the
   race's window; the swell from the bar buoy's own swell part (NDBC SwH/SwP/SwD); the chase camera rides the swell,
   with a switch). Open: the swell's reach into the Gate is an estimate.
5. Heavy weather, the depowering question and the rest of the deep physics pass, as one pass (14–24 h).
   ~~**Now, first in the pass: the helm's travel and response**~~ (done, v206: #437, Crew Figures + Deep Physics; ai-helm,
   Skipper Model). Where it stands:
   - The after deck stops the tiller, the same both sides (the owner chose option (a)): HARD_OVER 46.5°, fitted to three
     of the owner's photos (41–49°) and labeled as fitted. Drawn with a 12 cm pin and 4° rest (Deep Physics suggests
     8 cm and 6°, a 46.8° stop; held by Crew Figures, not shipped).
   - The ensign staff is at the owner's spot on the starboard quarter, 0.46 m out and 2 in forward of the deck's aft
     edge, clear of the tiller. The aft cleat is on the centerline.
   - The rudder stalls at 40°. Her gyration is 0.25 → 0.19, so the turn answers in 0.36 s at 4.7 kt, not 0.6.
   - The AI's helm: 30° normally, the stall (40°) when about to touch another boat, never hard over. Start penalties are
     unchanged over 60 paired starts; hits went 53 → 50. The first-mark fix took the AI's penalties at a crowded mark from
     15 to 9 over nine seeds.
   - Speed: the pair passed at 0.972. Changes to how boats sail or are judged are now budgeted on the ten-race mean (the
     owner, 18 Nov; Capacity's PR #465).
   - Optional, for the owner: measure hard-over at Josephine.
   - Open, parked for the sprint: **turn drag** (Deep Physics, turn-drag). It replaces the uncited 0.15 with ORC VPP 6.37 induced drag and the
     blade's separation from 15° (NACA Report 938; the 15–40° ramp is an estimate), so a tack loses 0.8–2.1 lengths. The
     physics review is done; the full suite and the ten-race budget are left. A known limit: the keel's side forces are
     charged separately, not as their sum squared.
   - Open, parked for the sprint: **the slow-boat AI** (Skipper Model). It centers the helm under 1 kt instead of hunting, then looks ahead to
     keep clear by its speed (every fouler was under 2.7 m/s). Judged with fouls-pair (#461).
   - Open: weather helm against the AI's turn (not started), and the #460 rules contact fix (held from v208 for the
     duck test, with Rules).
   - The request (owner, 15 November; accuracy): "the turning
   radius is too slow and not wide enough when I'm tacking ... short tacks in the marina. I need to be able to push the
   tiller about 50% wider, and I would expect the tiller to be much more reactive ... There should be no delay in the
   turn of the boat and the push of the tiller ... exactly in line." The owner's answers:
   - It's the mouse on the tiller, and the keys too.
   - The tiller doesn't go far enough: "the tiller handle should be pushable to where it's almost flush to the transom;
     the entire radius of the tiller handle is maybe 150º or so."
   - The delay is from tiller to boat.
   - Responsiveness shouldn't depend on her speed, as long as she's moving.

   Before #437 (15 November):
   - The rudder stops at ±30° (FULL_RUDDER, src/boat/balance.ts:99), a 60° arc against the owner's ~150°.
   - The mouse span is TILLER_SPAN 0.35 of the window (app.ts:450).
   - The turn radius at full helm is 9 m, an estimate (dynamics.ts:46), capped at 22°/s.
   - The turn reaches the helm's rate through yawLag (physics.ts:544), the delay the owner feels.

   The first plan (replaced by the deck's stop at 46.5°, v206):
   - The tiller swings about ±75°. Past about 35–45° the rudder stalls and brakes more than it turns, as a real one does,
     so the extra travel is for short-tacking, sculling and braking, not a free tighter circle.
   - The yaw response is tightened until the turn visibly starts with the tiller. Test it on the water at slow speeds
     in a fairway.

   The researcher (15 November) found no source for the rudder's stop, the tiller's swing, a Folkboat turning circle or
   a measured yaw time constant. The class rules fix the rudder's outline (about 490 mm wide, NFIA 2025–2028 §5) but not
   its angle. So the owner's own boat is the reference: their ~150° tiller arc and how she answers. Physics-reviewer and
   perf-pair as usual.
   Confirmed by a seasoned skipper (the owner, 15 November): the feedback came from a seasoned skipper, for whom "it
   was immediately apparent that the tiller was wrong. sixty degrees turning radius is 'crazy'", and "the boat is
   promptly responsive to tiller turning IRL (unless she has no momentum obviously)." That's a practitioner's account,
   the best evidence there is short of a logged sea trial, and it's to be cited as such in the code's comments.
   Approved by the owner (13 November): Deep Physics' force-based turning model with the class rudder (in PR #289; sternway in PR #317). Sculling comes
   from the rudder's real oscillating force in that build, with rule 42's limits kept. Deep Physics
   (now session_012Uu5QjUo5M6STTKgfgRYcx) and the physics-reviewer run on Fable 5.2, as a trial.
   Includes, from a physics review (done, #125, v134: checked, no change needed, a test added): the drifter heel. In about 3 kt the crew's placement prefers near upright over the
   leeward heel light-air technique calls for (heeled to leeward to hold the sails' shape and cut wetted area); check
   crewBestHeel and the light-air "want" in crewPhys.ts against sources, then a test.
6. ~~The racing rules still to finish~~ (done, live v125, follow-ups through v137): 20.3, 20.2(e)'s end, a boat as the
   Next for the rules (owner, 13 November):
   - ~~**Protests and hearings (RRS Part 5): design approved**~~ (done: 34e430c, 7d5972b, a5135a6; follow-ups b3af54d, dfa6758, 4f501a0, 789f1c7) (docs/PROTESTS-PROPOSAL.md, branch rules-protests-design;
     owner, 13 November):
     - An "On-the-water judging" setting in the race setup: Protests for races, Umpired for practice and the drills.
     - Hearings find the facts exactly, from the sim's own record. Testimony through the skippers' beliefs is a later
       option.
     - Known modeling limit: the engine names one boat at fault per incident. Under the RRS both may have broken a rule:
       a boat that interferes with a boat on another leg (23.2), and that boat failing to keep clear of her from astern
       (12). Only one is penalized, and a hearing finds only that one.
     - Rule 31 under protests (branch rules-31): a mark touch is any boat's to protest that saw it (60.1,
       60.4(a)(2)). The boats within four lengths saw it: you may hail, and the nearest AI boat hails at once. The toucher's turn is her own choice, as for a foul.
       The hearing decides it as a foul.
   - **Commercial traffic, the real Bay rule** (RYC SIs, YRA Appeal 08-02): a ship's five blasts lead to a race
     committee protest; the boat is presumed to have impeded; if upheld, a DNE DSQ. Built on the hearing.
   obstruction (rules 19 and 20.1, WS Case 11), 21.1 for any boat returning to start, the Definitions of Start and
   Racing, the Part 2 preamble. Blanketing was built as rule 23 interference and then taken out on the owner's decision
   (12 November): "Stealing wind is a significant part of the strategy of tacking. It's not a foul." Wind shadow stays a
   tactical fact in the debrief ("in X's dirty air"); rule 23 is called for getting in a boat's way only.
7. ~~The debrief shown on the replay~~ (done, v127, PR #93: "Watch your race" on the results and "Watch your race so
   far" on pause; the race overhead, wind up, every boat's track; each finding colored and numbered on your track and
   a bar on the timeline; jump to a moment, rule incidents in close-up, 10/30/60× or follow your boat).
8. ~~Cruise and race: places on the map, conditions and the start changed mid-sail, "Send her home"~~ (done: the start
   and destination picked on the chart; Change the conditions mid-sail, physics-reviewed; "Move her here" without
   ending the cruise; Home: back to her slip when cruising, retire and head home when racing). The showroom's own time
   of day and conditions are done too.
   ~~Follow-up~~ (done: both planned on one big chart) (owner, 12 November; polish; 2–3 h): "on cruise configuration, I need to be able to open up a larger
   view of the map to select start and end. I should be able to select both in the same map and not have to bounce from
   one to another." One large chart, opened from the cruise setup, where you place both the start and the destination
   (and move either), then return to the setup with both set.
   ~~Also~~ (done: the navigator is a view of the inset map, toggled on the map's rim) (owner, 12 November; polish; 1–2 h): "the navigator button is at
   bottom-right atm. it should just be a view in the inset map." The navigator becomes one of the inset map's views
   (its route and advice there), and its button leaves the bottom-right cluster.
   Follow-ups built on branch rules-followups (stacked on rules-finish): AI boats hail at a boat obstruction (WS Case
   11), holding close-hauled while it's answered, only with 9–12 s to the meeting and no other boat close by.
   (23.2 for bearing away onto another boat's wind was built too, then taken out with blanketing on 12 November.)
   ~~properTwa ignores the current~~ (done, branch proper-current: it allows for the crab that makes good the line).
8h. ~~**The chart's Wind shadow layer shows nothing**~~ (done: c1ea689, a716a18; the shadows from the physics, checked in the built page) (bug; 1–2 h): owner, "also on chart: toggling wind shadow
   doesn't do anything that I can see." Find out whether it draws nothing (a bug), draws only near other boats or only
   while racing (then say so on the chart when there's nothing to show), or draws too faintly (as with Waves). The
   shadows to show: boats' dirty air, ships, the committee boat, the lee of the land and of the bridge piers, all already
   in the physics. With 8f and 8g: the same layer row.
8g. ~~**The chart's Waves layer is unreadable**~~ (done: c1ea689; legible at the chart's usual zoom, checked in the built page) (polish/clarity; 1–2 h): owner, "waves notation in chart view is too
   small and low-contrast to be useful." Bigger, higher-contrast wave marks on the chart and inset: legible at the
   chart's usual zoom, on halos like the other overlays, in colors the NOAA chart doesn't use. Show the height (and the
   swell's direction) plainly where it matters, without cluttering the chart. Options to the owner if the look changes
   much.
8f. ~~**The map layer buttons need two clicks**~~ (done: c1ea689; scripts/check/layer-clicks.cjs) (bug; 1 h): owner, with a screenshot of the layer row (… WAVES · FOG ·
   OFF, the long visibility note above it), "these buttons are requiring two clicks for some reason". One click should
   switch the layer. Suspects: the first click only dismisses the note or the tooltip over the row, or moves focus, or a
   re-render under the pointer swallows it. Check every chip row with the same pattern (the map layers, the setup's
   choices). A test that one click switches.
8e. ~~**A crew member's arms are on backwards**~~ (done: 407791f, 2fdfe20; the owner's 14 November report, 792cc3a; every pose from both sides still to confirm) (bug; Crew Figures; 1–2 h): owner, from a close cockpit view, "these
   arms are backwards. poor guy." The crew member in the orange jacket at the piano has both forearms pointing back
   past his body, hands facing the wrong way, as if the shoulders or elbows were mirrored. Likely the arm IK choosing
   the wrong elbow side, or a left/right swap for that pose or tack. Check every crew pose (piano, winch, hiking,
   tacking) from both sides on both tacks, and add a test that the elbows bend forward and down.
   Still there on 14 November (owner: "still have backwards arms", a second screenshot): both crew in the cockpit, the
   blue jacket at the piano and the orange jacket by the compass, have forearms bent backwards at the elbow, hands
   pointing behind them. No fix has gone in yet. The owner doesn't
   remember the conditions it happened in, so the check covers every pose and wind.
8d. ~~**Now — auto keeps her hove to**~~ (done: the crew hold her hove to under Auto, and through the wind the sheets change roles as they really do; 4e3a340) (bug; 1–2 h): owner, "when I heave the boat to, resetting it to auto crew and auto
   tune should keep her hove to." Handing the lines back to the crew (Auto-trim, the crew's Auto) while she's hove to
   should leave her hove to: the jib still backed to windward, the main eased, the tiller still lashed to leeward. That's
   what a real crew told "we're hove to" does. Auto-trim sails her on only when the helm sails her off (the lash
   released, or a new course). A test: heave to, press Auto-trim and the crew's Auto, and she stays hove to.
8m. **Now — leaving the slip at Gashouse Cove: she drifts to windward under bare poles** (partly done: acd54e6, 35957a2, 72f5bfa; the windward drift didn't reproduce, c192351; the slip-572 exits wait on PRs #289 and #326, tests/gashouse.test.ts's it.fails) (bug, physics; 3–5 h; owner, 13
   November): "coming out of a slip at Gas House Cove. The wind is on the beam on the port side. I get pushed off. I
   don't raise the sails. And the boat seems to just drift to windward, weirdly, even if I have the tiller at
   centerline… what surprises me is that the boat does not turn nose to wind… I'm completely unable to get out of the
   slip at Gas House Cove. I've tried over and over and over again. I just can't get pushed back far enough, and I
   can't seem to get the nose around."
   - Batch 34: at the dock and under bare poles the crew now sit centered; and Deep Physics' test of leaving under bare
     poles on the real tide, beam wind both ways, finds she goes to leeward, so the windward drift didn't reproduce. If
     it's still seen, the owner's exact case (time, tide, wind) is needed. The push-off and getting the nose round stay open.
   - **Drifting to windward with no sails up is a bug.** A boat with no way on and no sail up is set to leeward by
     the wind on her hull and rig, plus or minus the current. Nothing drives her upwind. Look at the bare-pole windage
     force's sign or direction, the hove-to and in-irons models acting with the sails down, the shelter field inside
     the basin, and any current in the basin.
   - **The crew's weight doesn't move her sideways.** It changes her heel, and so a little of her drag and turning, not
     her drift. Crew hiking or sitting to leeward at the dock is itself odd: they should be aboard and ready, not hiking.
   - **Which way her bow goes**, to check against a source: with no sail up, a boat usually lies beam-on or falls off,
     because her rig's windage is forward of her lateral resistance. She doesn't come head to wind; that happens with
     the main up and free. The sim should show whichever is sourced for a Folkboat, and the coach should say how to
     get out: walk her out further, hoist the main at the dock head to wind, or paddle (8c).
   - **A gentler way out than the walk-pace shove (Marinas; from the sourced sternway drag, 17 Nov 2026):** the gentlest
     shove the crew give is their walk, 0.45 m/s, which now glides her 23 m in still air, so six South Beach berths
     (D2, E1, E2, F1, F2, G1; 9–12 m of clear water astern) are kept fast in a dead calm. A real crew hands her out
     slower, checks her on a line, or paddles. (The plan is judged to her way lost, 240 s, since 18 Nov 2026: at 90 s
     she crept on some 14 m, and five light-air shoves crept into a dock, the breakwater or the next boat.)
   - **Her crew take charge at the coast's end in a breeze forward of her beam (Marinas; the creep sweep, 18 Nov 2026):**
     shoved off stern first with a breeze on her bow, a bare-poled boat never loses her way (0.76 m/s in 15 kt on the
     sourced drag), so on the way-lost horizon 73 berths that were shoved are kept fast, nearly all in a 12 or 20 kt
     easterly (West Harbor 373–407 odd and 637–649, Gashouse Cove 516/518/520, Corinthian A5–A14 and B30–B35, South
     Beach A77/A79/A81, Horseshoe Bay A12, A15, C21, Corinthian B3). A real crew finds that the easy way out: the jib up
     or the main, and she's sailed off where her coast ends. The push-off ends passively, and steered and left alone 87
     such shoves touched. Let the crew sail her out, with its own every-berth sweep, and those berths come back.
   - **Next for the push-off (Marinas):** a walk-out on a stern line from the twelve berths her crew won't shove her off
     from (geo/marina.ts NO_ASTERN, NO_ASTERN_WEST): it un-flags them, with the test. The lee's edge is allowed for in the shove (done,
     Deep Physics: gauged to the wind along her line out and to leeward of it, World.windAstern; Corinthian B16 in a 20 kt
     northerly and Horseshoe Bay A27 in a 20 kt easterly stop where it meant). Left: the planner's own look (marina.ts) is
     still in the slip's wind, and a steered plan's arc leaves the line the wind is read along.
   - **The place** (owner's chart screenshot): Josephine's real slip, number 572, at the west end of a Gashouse Cove fairway close to
     the basin's west seawall. "it's one of the narrowest fairways in the Bay. very hard to get in and out of anyway. but
     literally impossible in current sim." The test is getting her out of this slip, in the day's wind, as a skilled
     crew would. It's hard but possible, as in real life.
   - **Push-off at Gashouse Cove** (built by v96, test over every slip): she can't be pushed back far enough there.
     Recheck that harbor's slips against the fairway's width and the wind on the beam, with a test that sails out of
     Gashouse Cove with the wind on the beam both ways.
8o. ~~**Hoisting at the mast, finishing at the piano**~~ (done: each sail hoists in about 5 s at the mast, the take-up its own state) (owner, 13 November; next; 2–3 h). First ask: "when sails are down,
   hoisting the halyards does not hoist the sail… we can probably use the lines instead of the hoist buttons, no?" Then
   the owner's correction: "there is some difference. the sails are hoisted from the mast. the piano controls use a
   block and tackle to finalize the last several inches of hoisting. so having the piano halyard control fully 'on'
   isn't the same distance as the actual hoisting distance." As on Josephine:
   - **The hoist is done at the mast:** a crew member (or you) goes to the mast and hauls the sail up, taking the real
     time and moving the crew's weight forward. It's started from inside an existing element (the band's crew tab,
     or the key), not a new button. Both sails are hoisted at the mast (owner confirmed).
   - **The piano's halyard controls finish it:** the main halyard's tackle and the jib halyard take up only the last
     several inches, then set the luff tension. Their range is that short distance, not the whole hoist. With the sail
     down they show as slack and idle.
   - **The routine** (owner): "one of the first steps after raising sails and getting underway is tensioning the
     halyards from the piano. they usually stay untouched for the rest of the sail, unless there's need to fine tune
     (which better sailors than I may do often; I'm not sure)." So the crew tension the halyards at the piano soon
     after getting under way, then leave them; a skilled crew may fine-tune them as the wind changes (to source).
   - **Lowering:** let the halyard go at the mast, and the sail comes down fast.
   - The sails, flags, telltales and physics answer the hoist as it happens: half-hoisted sails draw badly, luff and
     flog.
8q. ~~**The boom on the centerline in the slip**~~ (done: 16af648; kept through batch 37, 5d33817) (owner, 13 November; <1 h): "when in a slip, boom should be at
   centerline (when starting) or brought to centerline (when finishing a sail and docking)." She starts in her slip
   with the boom amidships, and docking brings it amidships: the mainsheet hauled in and made fast, as a crew does
   tied up.
8q9. **PAUSED: auto-nav (owner, 19 Nov 2026)** **Bug: on Nav, a replan after a corner she can't turn from waits on the live plan's cadence** (the physics review of
   nav-pier, 19 November; bug; a sprint bug; 1–2 h; owner of the navigator): past a plan corner with the way on not yet
   clear, HelmFeed asks for a new plan at once (sim/helmPlan.ts heldPast), but on the page passageLive gives back its
   memoized plan until she leaves its 150 m cell or the 2-minute bucket turns (sim/navigator.ts LIVE_M, LIVE_MIN): 52–142 s
   a passage spent wanting a plan, steering meanwhile for the corner astern. The fix: a fresh plan from where she is when
   the helm asks for one, not the cell's memo.
8q8. **Bug: phantom land astride the Berkeley Pier's deck** (the physics review of nav-pier, 19 November; bug; a sprint
   bug; 1 h; data): two 50 m terrain cells read as land across the deck, about (10308–10356, 5480–5530), ~100 m east of
   the gap at its end, and (10880–10930, 5730–5780): ~20 m either side of a 6.6 m deck, where in fact only the deck is
   solid. It's the water a boat turns into after the gap, northbound for the marina. The fix: the terrain mask there
   from the shore's data, not the 50 m cells (geo/shore.ts onLand), with a test that the water beside the deck is water.
8q7. **PAUSED: auto-nav (owner, 19 Nov 2026)** **Bug: Nav engaged with way on alongside a pier wrecks or strikes it** (the physics review of nav-pier, 19 November;
   bug; a sprint bug, after nav-pier; 2–4 h; owner of the navigator and pilot): engaged a meter or two along or in from
   8 m off Pier 45's head bound for off Alcatraz, she's wrecked on the wharf or strikes it (one start has no plan from
   there at all). Main does the same. The pilot's own way round (ai.ts detour, rays 25 m either side) turns her into the
   pier when the plan's first leg begins beside it. Kept in tests/nav-pier.test.ts as it.fails (known to fail), to be
   seen and to show the fix. The fix: off a leg begun beside a structure, steer the plan's line off it (the router's
   "no nearer than she is"), or hand over with the alarm.
8q6. **Now — bug: the OpenStreetMap attribution isn't on screen** (the Coordinator, 18 November; legal, an ODbL
   requirement; now, a sprint bug; 1 h; UI & Copy): wherever the page draws OSM-derived data (the chart, the shore, the
   buildings), "© OpenStreetMap contributors" shows, on the chart and in the credits. One short line, in an existing
   element, no new button.
8q5. **PAUSED: auto-nav (owner, 19 Nov 2026)** **Now — bug: on Nav, she steers the rhumb line, not the plotted course** (owner, 18 November; bug; now, a sprint
   bug; 4–8 h; owner of the navigator and pilot): "when in autonav, the boat doesn't seem to be following the plotted
   course. it just follows the rhum line to the destination. this is bad, especially if the plotted route is avoiding a
   strong tide or wind shadows." The pilot steers for one point: world.ts `navTarget()` returns `dest.p` (or her
   harbor's mouth), and `pilotStep` steers there with its own look ahead (boat/autopilot.ts), so the plan's legs
   (navigator.ts, hud.ts `navRoute`) never reach the helm. The fix: the pilot's target is the plan's next leg point (the
   one the route reaches by tide and shadow), advanced as she gets within a few boat lengths of it. A leg she can't
   reach is the pilot's cue to re-plan, not to cut across. Keep it working with the way in (the hand-over at the mouth).
   First a test that reproduces it: a route that bends round a foul-tide patch or a wind shadow, then the pilot's track
   stays within a tolerance of the plotted legs (and fails on main).
8q4. **Now — the backstay's chainplates where the tiller would hit them** (owner, 18 November, with a screenshot;
   accuracy; now; 1 h): "backstay attachments are too far forward. the tiller would run right into them. they should sit
   about one inch forward of the aft edge of the deck, about six inches from the tiller on either side." In
   src/render/boatMesh.ts the plates are BS_CHAINPLATE_X = 0.3 m out, forward of the deck's edge. Move them to 2.5 cm
   forward of the after deck's aft edge, and about 15 cm clear of the tiller each side (≈0.17 m out with its width).
   The bridle's legs follow. The ensign staff's place was measured as "equidistant from the toe rail and the starboard
   chain plate", so keep it at the owner's 0.46 m and check the two stay clear. Add a test that the tiller's swing,
   hard over at 46.5°, stays clear of both plates. Check it from both quarters.
8q3. **Now — bug: no Hoist tabs on a cruise started mid-water with the sails down** (owner, 18 November; bug; now; 1–2 h):
   "while cruising, I started a cruise mid-water with sails down. I don't see hoist buttons. I should always see those if
   sails are down." The tabs come from app.ts `hoistTab()` and are drawn by sailBand.ts (`.sb-hoist`, ~L553). It hides
   them when `!w.running`, or when the rig says up and hoisted outside a basin. Check how a mid-water start with sails
   down sets `rig` (mainUp/jibUp and the hoist fraction), and whether the band or its tabs are shown at all then. The rule:
   a sail that's down always has its Hoist tab while she's on the water. Add a test: a mid-water cruise start with the
   sails down shows Hoist main and Hoist jib.
8q2. **The crew bring the boom back to the centerline when the main drops** (owner, 18 November; accuracy; later, "not
   urgent"; 1–2 h; Crew Model): "when the main drops, the crew should bring the boom back to centerline." 8q does this
   only in the slip. On the water, once the main is down, the crew sheet in and center the traveler as a called job, and
   the boom stays there. A test: the boom within a few degrees of the centerline after the main drops.
8s. **PAUSED: auto-nav (owner, 19 Nov 2026)** **Now — the navigator can't find its way round the Aquatic Park seawall** (in PR #337) (bug; 2–3 h): owner, "at aquatic park, auto
   nav failed to navigate around the seawall." The route, or the tiller pilot following it, doesn't get round the
   curved Municipal Pier and the basin's breakwater. Check the router against those exact shapes (they're from OSM in
   geo/shore.ts), the pilot's look-ahead along the curve, and the entrance's width. Add a test that routes into and out
   of Aquatic Park from the Cityfront, and round the outside of the pier, without touching.
8r. ~~**The stowed jib on the foredeck**~~ (done: 59a1cfa, 014db55, 0591197) (owner, 13 November, with a screenshot; Boat Detail; 1–2 h): "stowed jib sheet
   intersects the forestay. also it looks like an oval; it should be more cigar shaped and lashed with a sail tie."
   Today the lowered jib is a dark-blue oval mound on the foredeck, with the forestay running down through it. As it
   really lies: rolled or flaked into a long, narrow sausage along the foredeck from the stemhead aft, its luff still on
   the forestay at its forward end (so the stay meets it, not passes through), tied with a sail tie or two. Check from
   both sides.
8p. ~~**Bug: with the sails down, the jib cars show as loaded**~~ (done: bf2a855, ecc0d4c) (owner, 13 November; <1 h): "with sails down, neither jib
   car should show as loaded." With no sail up there's no sheet load, so both cars are free to move and shown that way.
   - **The push-off's known limits** (physics review of #384, not blocking): kept-fast for the six westerly berths is
     asserted at 12 kt, not at 8; at the six any-wind berths with no motor, "stays fast until it changes" promises a wind
     that may not come (the stern-line walk-out is the answer); and no flag covers 20 kt on her stern (9.5 s of steerage,
     under the 10 s bar) or 16 kt and more on her bow (carried on at over 0.5 m/s): the bar is stated for a 12 kt westerly.
8m3. ~~**The bow-line let-go bumps the next boat in a northerly**~~ (done: 94c34591, batch48; Marinas; from their own work, 16 November; their entry and fix land in v201).
   Also (the owner, via the Coordinator, 16 November): AI boats wait for their own crew's "ready", by skill (#434, with Crew Model).

8m4. **Gashouse Cove's entrance sign as it really is** (owner, 16 November, a screenshot and a Street View photo of the
   entrance; polish; next, not urgent; 1–2 h; Marinas): "text on this sign is crowded. second pic shows what the sign
   looks like entering the harbor." Today (render/marina.ts noWakeBoard) "IDLE SPEED / NO WAKE" in 48 px letters on a
   1.2 × 0.9 m board, cut off at its edges, on the red beacon's post. The real one: a square, weathered gray-white board
   with an orange circle and "5 MPH" in it (the US regulatory "controlled area" mark), on a pipe frame on top of the
   concrete seawall's end, the red light on its top. Draw that, readable from the fairway, both ways.

8m2. ~~**Josephine can't leave slip 572: walk her out to the fairway, and the moored boats solid**~~ (done, v200: marinas-8m2) (owner, 15 November; bug;
   now; 4–6 h): "i still cannot get out of josephine's gashouse cove slip. ive never had this problem in real life. the
   main issue is that her bow starts turning west, since the wind is pushing her hard. ... she doesn't seem to get
   underway until the pushoff animation stops ... so i keep getting pushed into other boats long before i have a chance
   to get out." In real life the owner walks her out by hand to the fairway first. The owner's day: a real day, 15 kt
   from the SW, a 1.1 kt flood, 13:35.
   Isolated (a scratch replay of that day, nothing committed; the logs are in the Roadmap session's scratchpad):
   - **Baseline.** The plan is a swing. She walks 10 m in 22 s, then swings −90° in 24 s, and is handled for 46 s with
     her sails let fly. She's let go at 0.5 m/s, heading 261, bow west into the dead end, on the line of the moored
     boats' sterns. Her hull is inside the next boat 2 s later. The fairway is about 12 m between the sterns and the
     way out is east.
   - **The lee at the slip** is 0.17 (12.4 kt against 15.1 open).
   - **Moored boats aren't obstacles** to a boat sailing free. Physics stops her only on docks and land
     (src/boat/physics.ts:1017); `hitsMooredBoat` runs only in `mooringStep` (src/sim/world.ts:1920). So she sails
     through them with no bump.
   - **One lever at a time:**
     - A longer walk alone (14 m) clears the let-go, but she's still bow west and must turn about 140° at 0.2–0.7 m/s
       in 12 m: she touches the far side.
     - The crew-only swing rate, the sails live during the handling, a 1.0 m/s shove, and 0.3–0.5 of shelter each
       change only timing or speed.
     - **A walk to the fairway (14 m) with the swing turned toward the exit** (heading 081, the bow east): no overlap
       and no bump through the turn-out.
   The fix, as the owner does it in real life:
   - (1) walk her out to the fairway and point her bow at the way out (src/geo/marina.ts:619-628; the walk at
     world.ts:2096-2106);
   - (2) make the moored boats solid to a boat sailing free;
   - (3) then tests/gashouse.test.ts slip 572 goes from `it.fails` to passing.
   Symptom (b), sails dead while she's handled, is the scripted push-off by design (world.ts:1283). Once the walk
   leaves her pointing out, a short hand-over is enough; giving her sails during the walk drove her back into the
   slips in the replay.

8m3. **Let go from the bow-line swing with room to sail off** (Marinas, 15 November; found once the moored boats were solid,
   8m2; on the coordinator's call, ahead of the navigator). A sweep (every berth whose plan was the swing on her bow line, in
   12 and 15 kt from 270, 225 and 000: 1,604 cases at 753 berths) found the crew's swing itself touches no moored boat
   anywhere. But let go at the finger's end, the jib going up, she hit a boat within 15 m in 1,124 cases (593 berths), even
   with her heading held: let go along the row, the next boat's stern just off her bow, and set 1–2 m to leeward as she
   gathered way. The planner's clear run ahead was checked every 2 m with no margin.
   - **Done (geo/marina.ts clearRun):** a let-go with only the crew's push for way needs her hull half a meter bigger all
     round clear for her first 15 m, sagging 1.75 m to leeward in 12 kt (in proportion to the wind), and in a breeze 60
     degrees and more off the wind. The walk-out is held to the same, and is tried before the astern shove wherever no
     swing passes. The astern shove too, where her coast ends (the coordinator's ruling, 16 Nov 2026): where the clear
     water isn't there, she's kept fast and told, the motor offered where she has one. The same 1,604 cases now: 1,296
     walked out, 148 held for the main, 118 on the bow line, 11 shoved off astern (steered as the plan says), none
     touching a boat or a dock; 31 kept fast (before, the astern shove touched in 27 of its 42). West Harbor 507 in a
     12 kt northwesterly is walked out, 68 degrees off. tests/pushoff-sweep.test.ts (a sample, in npm test, every plan
     held to zero touches and each plan's count exact; PUSHOFF_SWEEP=all sails the whole 1,604).
   - **Still to do (Deep Physics' review, 16 Nov 2026):**
     - **~~The berths kept fast: the stern-line walk-out's target~~** (done, 16 Nov 2026, the coordinator's calls). Where
       the shove would leave her kept fast, she's walked out by hand instead, even from a slip the wind blows straight out
       of, and turned the way a crew does it (the physics review): about her bow at the finger's end by a hand on the dock
       with a stern line, who then steps aboard (in about 8 kt and less, either way round: the line to her stern runs
       nearly through her bow, a lever of 1.1–1.4 m, and turned with the wind she still has to be checked before she lies
       head to wind), or, where that won't do, out in the fairway about her middle on a slip line round the finger's cleat,
       all hands aboard, hauled in as she comes round (set no more than 2 m to leeward while the crew's haul, 271 N on her
       less the cleat's friction, beats the wind's push with a third to spare, to about 16 kt; set more and more beyond, to
       her bare-rig drift where the push beats the haul outright, about 18.7 kt). Every let-go 60 degrees and more off the
       real wind. Sample of every 25th bow-in berth in seven winds: kept fast 90 of 434 to 31 (8 by a hand on the dock,
       383 on a slip line), none touching. The 1,604 once swung on the bow line: 1,254 on a slip line, 106 kept fast (31 before the review), none
       touching. In 20 kt from the north no berth is shoved off astern any more: walked out or
       kept fast. In 12 kt from 090, the easterly, rare on the Bay, the sample still keeps most fast: not in the sweep test.
     - **Two winds it doesn't hold in yet:** in 12 kt from 090 and from 180 the sample has one touch each, both shoved off
       astern (Richmond YC B5, her bow on the dock; West Harbor 757, onto the breakwater). 20 kt from 270 holds, and is in
       the test.
     - **The sag is gauged at the slip's own wind:** the lee's edge a few meters out, where the breeze is fresher, isn't
       in it.

8n. **The Gashouse Cove exit, true to life** (partly done: the Fort Mason pile fields and wrecks, 0e6f3e0, 91e1146, 7a508da; the shelter inside and the exposure outside in PRs #300 and #338; the eddies and gyre in PR #308; the exit test on branch bay-east-23) (owner, 13 November; accuracy; next, with 8m; 4–6 h): "it's one of the
   trickiest marina entries/exits… it's a big challenge, and I want the sim to get it right." Photos:
   reference/photos/gashouse-cove-exit-breakwater-and-fort-mason.jpg (the exit from inside: the breakwater's end with
   its "IDLE SPEED / NO WAKE" sign and light to the west, Fort Mason's pier to the east, the Bay and Angel Island
   beyond) and reference/photos/fort-mason-pier-piles-gashouse-exit.jpg (the pier's open undercroft of massive concrete
   piles).
   1. Inside, sheltered: "the marina side of the exit is nicely sheltered from wind and current by the breakwater."
   2. Outside, all at once: "the bay side of the exit smacks straight into the wind and the tidal current, and the boat
      usually feels it immediately." The shelter has to end at the entrance in a few boat lengths, not fade over a
      long distance, for the wind, the current and the chop alike.
   3. The Fort Mason pier to leeward: "the eastern (usually leeward) side of the exit is the ft mason pier, which has
      massive concrete piers supporting it. the wind (and often current) badly want to push you into those piers. that
      means bye bye to your boat; you would just churn around under there in all the decades-old concrete and rebar and
      barnacles." So:
      - the pier's pile field is solid to the boat;
      - the current runs through and under the piles, while the shed above blocks the wind;
      - getting set under it is a real wreck, not a bounce. Until the wreck design below is agreed, contact with the piles
        just stops her;
      - the coach and the smart crew know the danger and the way out: build speed before the gap, hold up to windward
        of the pier, and pick the tide.
   4. Eddies in the entrance (owner: "There are also frequent eddies in the entry. Have the physics session model the
      water there carefully"): the tidal stream separating off the breakwater's end and the pier's corner sheds eddies
      into the gap, which turn the current across the entrance and back on itself. Deep Physics models the water there
      carefully, from the flood and ebb past the breakwater and through the pier's piles, sourced where it can be
      (NOAA's SFBOFS currents, shallow-water eddy shedding behind a breakwater). The eddies should be visible on the
      water as the other eddies are. Deep Physics takes it after the turning model.
   Drawn as in the photos: the breakwater's end, its sign and light, and the pier's piles. A test: leaving in the
   common westerly on a flood and on an ebb, both doable by a skilled crew, and a careless exit set onto the piles.
   5. **Now — the hit at the edge** (owner, 15 November; physics; Bay East, Deep Physics reviewing; for v198): crossing
      out of the cove's shelter, the full breeze and the ebb or flood hit her suddenly: she heels, jumps in speed, and is
      set sideways. On main the wind's lee (harborLee.ts) and the current's basin calm (current.ts, BASIN_MOUTH 30 m) both
      exist, but the current's edge widths are estimates with no measured source. Size how sharp the edge is from real
      data (NOAA currents, observations at the Marina and Fort Mason), not invented numbers, and test that the heel, speed
      and set all change within a few boat lengths of the entrance, on a flood and on an ebb.
   6. ~~**"Fort Mason Center" lettering on the big pier**~~ (done, merged 15 Nov, batch44) (owner, 15 November; the shore; Boat Detail): the
      lettering on the pier by Gashouse Cove, drawn as it is in life (its words, color and place from photos). Before
      and after pictures go to the owner before it ships.
   7. **The cove's edge: the harbor's buildings and trees** (Bay East, 15 November; physics; after the wind-shadow seams;
      needs heights): by the shore's own physics the cove isn't in slower air than its mouth (docs/WIND-FETCH-CHECK.md),
      so a sharper edge would come from the Golden Gate YC and St. Francis YC buildings on the moles, Marina Green's
      trees and the cove's seawall with the land behind it. Built as harborLee obstacles if their heights can be sourced;
      otherwise it waits.
   8. **The shore's slowdown by fetch, everywhere** (Bay East, 15 November; physics; needs an open-water Bay wind
      record): the slowdown by how far the air has come over the water, not the distance to the nearest shore, with
      OPEN_WATER re-derived by direction at Fort Point. It moves the courses' wind by −15% to +12% by direction, so it
      needs a record to check against (the pier stations are ruled by their own shelter) and then the owner's OK. The
      check so far, and the code on branch bay-east-26: docs/WIND-FETCH-CHECK.md.
8za. **Start practice teaches picking the favored end** (owner, 15 November: "start practice also needs to help me learn how
   to pick the favored side. don't just tell me."; Debrief; design first): the player works it out the way sailors do,
   then is told whether they were right and why. The real methods: head to wind on the line (the bow points nearer the
   favored end), sighting the line square to the wind, and the line's compass bearing against the wind's. The drill hides
   "favored" until the player commits to an end; the debrief scores the call; later attempts fade the help. A mock to
   the owner before building. (Built: the head-to-wind read on the water, the call in the start line's card, the call
   scored first in the debrief, the read drawn for the first three calls; design/favored-end on design/learn-to-sail.)
   Later (owner OK'd, not built):
   - **the compass:** a white tick on the heading tape at the line's square heading, beside the wind's blue one, so the
     gap between them is the bias;
   - **sighting down the line:** from either end, in the cockpit view, the line against the wind.
8z. **DONE (15 Nov, 4f410526): the cabin-top instrument on a taller mount** (owner, 15 November; shipped as the unit's own black stand, taller and sturdier, no separate riser, after a post, a teak block and a 5 cm riser were tried): "I'm having trouble seeing
   the cabin top instrument over the hatch door. let's put it on a mount that's two or three inches taller." Raise it
   5–8 cm on a bracket, readable over the hatch boards from the helm; pictures to the owner before it ships.
9a. **The bow profile, true to the class plans** (owner, 14 November; accuracy; not for now, to slot when the owner says;
   later, Crew Figures with a physics check; earlier Boat Detail): owner, "the hull shape, particularly the profile of the prow, isn't matching the true
   Folkboat shape. current shape is too full and round. I want to work on it." Their references (reference/
   josephine-confirmed.md, "Open: the hull's bow profile"): the class construction plan (SSA / NFIA: profile, half-breadths,
   midsection), an older lines drawing, and a photo of a clinker Folkboat on its trailer; the stem a long, fine, nearly
   straight rake from a cut-away forefoot to the stemhead, the forward sections fine and V'd. A lines job in render/hull.ts
   (the stations, the stem's profile, the forefoot), with a physics review after: the bow's shape feeds the hull's
   resistance and wetted area, and boat/hullPlan.ts's deck outline (the rules' touching shape) if the deck line moves.
   Kept (owner, 15 November): "hang onto the new boat drawing work. I want to come back to it." The draft is kept on
   branch `claude/bow-rework` (1a4711ca…bf79aeff: straighter stem, cut-away forefoot, finer forward sections, the
   forefoot faired into the keel, the bow lab and before/after stills). Don't delete the branch; it's the starting
   point when 9a is picked up.
   Tried 15 Nov: a draft (straighter stem, cut-away forefoot, finer forward sections) is on branch claude/bow-rework, with
   before/after stills in shots/bow-rework/. The owner preferred main's bow, so nothing merged. The class bow figures aren't
   published as numbers; revisit when the owner's class plan, lines drawing and trailer photo are in reference/.
9b. **The crew's walk forward and back, and sitting on the bow** (in PR, claude/crew-bow-walk) (owner, 14 November; animation;
   Crew Figures): owner, "look at this dork. have him hang his legs over the front please. also the way the head forward
   looks like they're dragging their legs like paralyzed people. let's do better on these animations." Sat on the bow
   facing forward, the legs hanging down over it either side of the stem; going forward and back a crouch, short steps
   each foot lifted clear, along the side deck beside the cabin with a hand on its edge or the shroud; in a seaway
   (the boat's pitching) lower, both hands down, slower. Pictures: docs/crew-bow-walk/.
9c. **Ducking under the spinnaker pole** (Coordinator, 15 November; animation; with the pole work; Crew Figures): going
   forward past the mast with the pole out, the walker's head and shoulder pass through the pole. A crew member ducks
   under it or goes round it: the walk's height and route by the mast should answer the pole's place, both tacks.
8z. ~~**Now — the cruise setup's map is blank**~~ (done: redrawn whenever its size changes, 0e622c58) (regression; 1–2 h): owner, with a screenshot of Cruise → Where, "map is
   no longer showing in cruise config." Under Start / Destination the chart area is an empty dark box. Start
   (37°48.68′N 122°26.69′W) and To (37°48.79′N 122°26.72′W) are set only about 200 m apart, which may be a side effect of
   picking on a blank map. Suspects: the setup now builds the World only at Start (cca5f47), so the map has nothing to
   draw; the app.ts split (src/app/setup.ts); the chart's tiles or canvas not sized when the panel opens. "Plan on the
   big chart" should be checked too. Add a check that the setup's map draws the chart.
   Done on claude/cruise-map: the chart is drawn whenever its size changes (a ResizeObserver): opened before the setup's
   panel was laid out, it had no size and nothing redrew it. The big chart was fine. scripts/check/setup-map.cjs.
8y. ~~**The mast passes through the jib when she's hove to**~~ (done: the backed jib lies against the mast and shrouds, 476ed502) (bug, visual; 2–3 h; Boat Detail or Rigging): owner, with a
   screenshot of USA 122 hove to, "mast penetrates jib when hove to." With the jib backed to windward, its cloth is drawn
   through the mast (and likely the windward shroud and spreader). As in real life, a backed jib bellies to windward
   and comes up against the shroud and spreader, draping round them, never through the mast. So the jib's shape needs
   the mast, the shroud and the spreader as obstacles, on both tacks, hove to and when backed in a tack. Check from both
   sides.
8w. **The crew's places on the rail, and moving through the cockpit** (in PRs #347 and #348) (owner, 14 November; accuracy; next; 3–5 h; Crew
   Figures, with a physics review since the stations feed the trim):
   - Moving fore and aft: "they tend to squat-crawl along the side of the hull, between the coaming and the toe rail, to
     move fore and aft. that's just not true to life. any human crew would step into the cockpit to get around." So
     the route is down into the footwell, along it, and back up, not along the side deck outside the coaming.
   - Their places, sitting on the rail: "front crew would be between the aft cabin wall and the winch, middle crew
     between the winch and the thwart, and the skipper behind the thwart. the area behind the thwart is pretty
     exclusively reserved for the skipper." Today the middle crew sits aft of the thwart. Change the stations from the
     option-2 layout of 12 November: crew 1 from the cabin's after bulkhead to the winch, crew 2 from the winch to the
     thwart, aft of the thwart the skipper's alone. That shifts the fore-and-aft trim, so the calibration is re-tied
     and reviewed. It also likely retires the parked "crew pass close mid-cockpit" item.
   - **Bug: a crewmate standing upright on the rail** (owner, 16 November, a screenshot: "bro just out here standing on
     the rail"; bug; now; 1–3 h): a crew figure stands straight-legged on the side deck at the rail, leaning outboard,
     with no seat under him. Find the state that poses it (a move or a hike pose before he sits), and a test in
     tests/crewfig.test.ts that no hand is standing on the deck while she's sailing and he isn't moving.
   - ~~Hands on what they'd really hold, hiking on a beat~~ (done, v205: hike-hands) (owner, 16 November; accuracy; not urgent; 3–5 h): "when hiking
     out, crew seem to be holding on to thin air. IRL, when beating, forward crew would be holding the lee jib sheet, and
     middle crew would be holding the traveler and/or mainsheet, often tucking their aft leg under the thwart for
     stability. if only one crew, they would hold the jib sheet and the traveler." The hands go on the lee jib sheet's
     tail and the traveler or mainsheet; the middle hand's aft foot hooked under the thwart. Checked from both sides on
     both tacks.
   - Arms through bodies in a tack (Crew Figures, 17 November; from the owner's "his right arm seems to extend through his
     torso"; bug; next; most of a day): tests/crewarms.test.ts holds the steady poses (sitting out, the lines in hand);
     through a tack in 15 and 18 kt, getting ready, crossing and hiking again on the new side, the hikers' arms pass
     through their own torsos by up to 12 cm in many frames, the lone hand's getting up off the cabin top to the rail too.
     Hands go straight from place to place, through the chest and thighs, and the tack's poses don't keep each hand on its
     side; a hand put to rest on the lap sinks 3–4 cm into the thigh (lifting it pushed elbows forward: crewfig's arm checks).
     A test of its own first, failing on main (every frame of a tack and of the moves, both tacks, one and two crew),
     then hands that go round the torso and poses with each hand on its own side. Checked from both sides on both tacks.
   - Open question (Coordinator, 14 November; from the physics review of claude/crew-mast-sheets): in about 16 kt and
     up the crew won't leave the rail to set the lazy jib car (crewWork.ts carJob: not while she needs their weight), so
     after a change of breeze she sails the next tack on the old car. Arguably right: a good crew stays hiked and sets
     the car later, in a lull or before the tack. Left as it is until a source or the owner says otherwise.
   - To look at (Crew Model, 15 November; from the crew chain against batch 43's land lee): an AI crew kept the pole up
     until 108° true as she hardened up from a run to a reach, so the forward hand dropped it, walked aft and trimmed
     the jib in one move. A crew would drop the pole earlier as she comes up, about where it stops helping the jib
     (ai.ts poleRefused sets it at 145°). Check where it comes down.
8x. ~~**URGENT — the whole new release stutters**~~ (fixed on main: each boat's fixed parts merged into one mesh per material, the hull in three levels of detail, small parts culled, fewer shader programs, page writes only on change, triangles back to v186's; a frame-time release gate, perf-ab.cjs, and the F9 frame-time readout) (regression, performance; owner, 14 November): "the whole new release is
   moving very, very slow. whitecaps on the water are stuttering. everything is stuttering." The boat editor's slowness
   (8v) is part of it. If the cause isn't found quickly, roll back to the last smooth version, then find it: compare
   frame time and the worker's step against v178 (perf-pair.mjs, and the frame-time readout), and look first at what
   the latest batches added to every frame or step (the protests batch, the basin grids warmed between frames, the app
   split, new per-frame water or crew work). The prime suspect is v187's boat detail (#291). The owner loves the new
   model ("really don't want to have to roll it back"): fix its render cost rather than roll it back. Merge its small
   meshes per material, use level of detail by distance, hide the interior and small fittings when unseen, share
   geometry and materials across the fleet, and limit shadow-casting. Any rollback is the owner's call first. Add a
   Measured (Coordinator, 14 November, v186 against v188): the scene's JS per frame up 10–100%, worst at the night start
   (20 → 41 ms) and the course map (24 → 34 ms); triangles +9%, with more geometries and shader programs, and +24 MB of
   heap; the labels, HUD and maps up from 2 to 8–10 ms in two views. Cause: mainly the new boat model's render cost
   (#291, v187). No rollback (owner). Assigned:
   - Boat Detail: merge meshes per material, share across the fleet, level of detail and culling for the interior and
     small fittings, back to v186's frame cost; then the editor clicks (8v).
   - UI & Experience: the per-frame UI increase.
   - Capacity: the hitches (garbage collection, worker spikes, the 95th percentile) and a release gate so a stuttering
     build can't ship.
   Batch 40 is held until the frame fix lands, so nothing adds load meanwhile.
   frame-time check to the release smoke test so a stuttering build
   can't ship.
8v2. **Now — lag again: in the boat editor, and at the start of cruises** (owner, 18 November, on v207; bug; now; 2–4 h;
   Capacity): "getting a lot of lag, in boat editor, at beginning of cruises. it tends to resolve after a while, but still
   not good." Lag that clears by itself points to work done once at the start: the planner's or inset's first slices,
   the weather loading, the shaders compiling, or the editor's speed report benching while it's open. First, profile both
   on the published page (perf.cjs's views, plus the editor open and a cruise's first 60 s), and name what runs. Then
   spread it out or defer it. Add both to perf-ab's views so it doesn't come back.
8v. ~~**Now — the boat editor is very slow**~~ (done: look-only changes restyle her in place, sail pictures shared, the cockpit linings worked out once; a speed check) (regression, performance; 2–3 h): owner, on the new release, "moving very,
   very slow in the boat editor. each click (entering the editor, switching the time of day, opening the hatch) takes
   several full seconds." Every change should land within a frame or two, as before. Suspects:
   - each change rebuilding the whole boat model or the showroom scene;
   - the boat cards' golden-hour pictures re-rendered on each change;
   - the Save pattern's "changed?" check copying or comparing the whole save each time;
   - the time of day rebuilding the sky and lights from scratch.
   Profile one click of each kind, fix the slow path, and add a check that a boat-editor change takes under a frame
   budget.
8u. ~~**Partly fixed — the boat editor shows no way to set her sail number or country**~~ (done: a stray .row2 rule; checked on every boat, dd7db94c) (bug; 1 h): owner, "I'm in the boat
   editor now and there's no way to change her country or sail number. same with creating a new boat." The fields are
   in the code (src/ui/boatPanel.ts, "Particulars": "Sail number · home country", a country select and a number
   input), so something hides them on screen. Not the Save banner (owner: there's none showing). Suspects: the turning boat's panel pushing
   Particulars out of view with no scroll, a CSS rule from the styles split, or the copy-noise cut. Check in the
   published page, for an existing boat and a new one. Her ensign follows her country, so this also blocks changing the
   ensign. Owner, 14 November: they're back for Josephine; the other boats in the fleet still to check.
8t. ~~**Now — the boats have vanished from the boat cards' pictures**~~ (done: framed by what's drawn, 03b2c494) (regression; 1–2 h): owner, with a screenshot of the
   Yacht Club's Boats tab, "my boats have disappeared." All four cards (No Inheritance GBR 1655, Josephine USA 122,
   Caviaro RSA 100, Sailor Twift USA 225) show the golden-hour sea and sky but no boat. Suspects:
   - the pictures are kept between visits, so empty ones may have been saved and are now reused;
   - the boat model not built yet when the picture is taken (the setup now builds lazily, and the page is split);
   - the camera framing.
   Fix the cause, throw away any saved empty pictures, and add a check that each card's picture has the boat in it.
8l. ~~**Rushing water is back**~~ (done: 31ce983, a test over every water layer; c71226a, ef44267; the chart's streaks, the owner's meaning, c2d8b51) (regression, third time; 2–3 h): owner, "getting rushing water again" (13 November,
   v176). Fixed before for the waves turning about the sim's origin (1bda738, v146) and for the ripples starting out of
   line (aced96b). Find the layer that still moves faster than real water: the ripples, the foam and wake, the
   current's flow-mapped texture, a jump in the focus (camera switch, the chart opened and closed, "Move her here"), or
   float precision far from the origin. Owner's report: cruising, off South Beach (about 6 km southeast of the
   Cityfront, far from the sim's origin), when it started unknown. A second report with a chart screenshot: the boat just inside a breakwater's corner, by a
   channel marked by green lights "9" and "11" (Fl G 2.5s 15ft 4M) and an "Iso G 6s 34ft" light, in 3–5 ft charted
   water, heading northeast along the shore. Owner's answer: it was the chart's moving streaks, not the 3D water (Charts and
   Bay East have it). Shallow-water waves by the breakwater: yes, with Bay East, after the rushing fixes. Then add one test over every water layer: none moves past a still boat faster
   than its own waves, or the current, at any distance and after any of those events. That test is what stops it coming
   back.
   ~~**Back again**~~ (done) (owner, 15 November; regression, fourth time): "rushing water is back. I'm way out at the
   map edge outside the Golden Gate." The owner confirms it's the 3D sea around the boat, not the chart's streaks.
   Far out beyond the Gate is the farthest the sim goes from its origin, so float precision (positions or wave phase
   in 32-bit in the shaders) is the first suspect, then the map edge itself (a sea layer clamped, wrapped or tiled
   differently at the edge, or the swell from the open ocean). The every-layer test (31ce983) evidently doesn't reach
   this far: extend it to the map's edge, west of the Gate, at the corners, so it can't come back a fifth time.
   **Fixed** (Deep Physics): not float precision, and not the edge itself. Three drawn layers lie along the wind or
   the waves (the ripples, the foam's streaks, the wave groups' light) and each was turned by turning its coordinates,
   about the Bay's origin by the GGYC line. 14 km from it, a degree of turn swept the pattern 250 m: measured in the
   page at the west edge, the mean wind turned 3 degrees, the ripples went 209 m past a still boat in a second. Each
   now turns where it lies by the boat (render/waterFrame.ts): 0.04 m. tests/rushing-drawn.test.ts holds the three at
   the west edge, past it, the four corners and off the bar; scripts/check/rushing-edge.cjs checks the page itself;
   stills on the branch claude/rushing-water-shots (shots/rushing-water/), kept off main.
8j. ~~**The windex lost its point of sail**~~ (done: e62a2229; tests/pointofsail.test.ts, scripts/check/point-of-sail.cjs) (regression; <1 h): owner, "I want the windex dial to show the point of
   sail (broad reach, close haul, etc)". It did as of v83; the chase-view layout's round windex in the sail band dropped
   it. pointOfSail() in src/ui/hud.ts (head to wind, close-hauled, close reach, beam reach, broad reach, run, by her own
   beat angle) is still there but called nowhere. Show it with the windex again, wherever the windex is (the band, and the
   dial under the inset map, 8b), and a test that it's on screen.
8i. ~~**The boat editor reorganized, with a real color picker**~~ (done, v206: #354; the Yacht Club move still open; any color kept already, 1271a6f) (owner, 13 November; next; 4–6 h; UI & Experience, a mock-up to
   the owner first):
   - "all sail stuff together, all hull stuff together, etc." Proposed groups:
     - **Her:** name, sail number and country, club.
     - **Hull:** material, topsides, boot stripe, bottom paint and its finish, bottom last cleaned, name lettering, weight
       over the class minimum.
     - **Deck and cabin:** deck, cabin top, forehatch, companionway, whisker pole stowage, navigation lights, outboard.
     - **Rig:** mast, boom, rig tune.
     - **Sails:** sailcloth, mainsail, jib, sail number color, class letter F color.
     - **Lines:** each line's color.
   - The skipper, and the home marina and slip: "not sure skipper assignment belongs here. also not sure about marina and
     slip assignment. help me decide." **Owner's decision (13 November): as recommended.** The skipper moves to the Yacht Club, which is
     already where crew are assigned to boats; the boat page shows the skipper read-only, with a link there. The home
     marina and slip stay with the boat, as her "Home berth" at the end, since a berth is where the boat lives, not a
     person's attribute.
   - Color: "I don't like the little color chips, or the fact that some elements use a kind of toggle array for color.
     I'd like a color picker for everything ideally, with ability to add hex codes, and some smarts to save a few custom
     color chips (like in Google Docs) so I don't have to re-enter them for each different thing." One color picker for
     every color on the boat (hull, boot stripe, bottom, deck, cabin top, lettering, sail numbers, the F, each line): a
     full picker, a hex field, the class's usual colors as presets, and a row of your own saved custom colors shared by
     every picker and kept with your account. Where a choice is a material rather than a color (teak or fiberglass,
     sailcloth), it stays a choice.
   - Lines are the exception (owner, 13 November): "color selection for lines should probably give options for real rope
     patterns. there's not a ton of options IRL, so an infinite color picker seems to be the wrong choice." Lines get a
     palette of real rope colorways, not the free picker. Sourced so far, from New England Ropes only (Sta-Set, Endura
     Braid, VPC; neropes.com, fetched 13 November):
     - solids: white, red, blue, black, green;
     - flecks: red, blue and green fleck (on white, inferred from the naming).
     Marlow's Excel Racing also has a "mottled" range from 3 mm (search snippet only; the site blocks automated
     fetches). Samson and the others are not yet sourced. Add colorways as each maker is sourced, or from the lines on
     Josephine in the owner's photos (reference/photos). No color-coding convention by function was found.
8i2. **The editor's folded groups: buttons that say what they do** (owner, 18 November; polish; now; ½–1 h; UI &
   Experience; src/ui/boatPanel.ts `grp`): "Change to See is terrible content design. Buttons should say what they do;
   here, you don't change anything by clicking change. Just say "View", and remove the "Change to see" string
   altogether. or replace it with some kind of cumulative statistic, in which case View should say Expand."
   - Speed (read-only): its header says View ▾ (Hide ▴ open), and "What she gives away / Change to see" goes. If its
     folded line shows one total instead (her all-together loss upwind, from the same bench the table uses), the header
     says Expand ▾.
   - Lines: "N more / Change to see" becomes "N more"; its header keeps Change, since there you do change them.
   - Check every group's folded line for the same pattern.
   - Bug: a boat's page reads "Bottom: , just cleaned" (owner, 18 November: "copy error on this ', just cleaned'
     string"). In src/ui/fleet.ts, color() returns '' when her color isn't a named one (any color is kept since
     #354's picker), and the row joins it with ", " anyway. The fix: name the nearest swatch, or say "Custom", and join
     only the parts that exist. Topsides uses the same color() and needs the same fix.
   - The rope picker (owner, 18 November, with a screenshot): "copy strings here should right-align close to their
     swatches." Each colorway's name sits right-aligned, just left of its swatch, not at the far left of its cell.
8k. **Drop and raise the anchor** (in PR #339; rule 22 in PR #335) (owner, 13 November; feature, seamanship and racing; next; 4–6 h; it also seeds the
   later cruising mode's anchoring challenge):
   - Drop anchor: a crew member goes forward, the anchor and rode go over, she drifts back and the anchor sets. Raise
     anchor: haul in the rode, break it out, stow it. Each takes the time it takes, by crew and skill.
   - The physics, sourced: the holding force against the wind and current on her hull and rig; the scope (rode out
     against depth, from the NOAA chart, with the tide's height); she swings to whichever wins, wind or current, as the
     moored boats already do; and she drags if the scope is short, the bottom poor (the chart's bottom types) or the
     load too high.
   - Racing: on the Bay, kedging is a real tactic. In no wind against a foul tide, anchoring keeps the ground a drifting
     boat would lose. The racing rules allow anchoring, but she must recover the anchor before she continues (check
     the 2025–2028 text, rule 45). The strategist and the smart crew should know when to call it.
   - At anchor: the anchor light at night (built, Rule 30) and the anchor ball by day (Rule 30(a)).
   - On the screen rule: the call goes inside an existing element (the sail band's crew tab, a key), not a new button.
8c. **"Oh fuck time to paddle"** (in PR #326) (the owner's name for it, 13 November; feature, seamanship; next; 3–5 h): "sometimes when
   you're in a jam you need to grab the boom crutch from the cabin and start paddling. there's just one crutch, so just
   one crew will paddle. need to be able to tell them starboard or port. smart crew will do it on their own."
   - One crew member fetches the boom crutch from the cabin (it takes the time it takes), and paddles on the side
     you call, port or starboard, which turns her as well as pushing her.
   - Smart crew start on their own when she's in a jam: no wind, the current setting her onto a pier, a mark or the
     shore, or stuck in irons by the dock.
   - The physics, sourced: what one person can sustain with a short blade (watts), against her own low-speed resistance
     already in the sim, so a 2-tonne keelboat makes a fraction of a knot, not a dinghy's speed.
   - Racing: RRS 42 allows only the wind and water to propel her. Its exception lets a boat get clear after grounding or
     a collision, using her crew's force. Check the 2025–2028 text for the exact wording. Otherwise, paddling while
     racing breaks rule 42: the debrief and the protest logic should know it. Cruising: no limit.
   - On the screen rule: the call goes inside an existing element (the sail band's crew tab, or a key), not a new button.
     The on-screen label is the owner's choice.
   - ~~**The paddling drawn**~~ (done: claude/paddle-drawn-r3, 8596bedf) (owner, 15 November: "there's no animation associated with paddling?"; Crew Figures):
     the physics shipped in v196 but nothing is drawn. The crew member goes below for the boom crutch, comes up with it,
     kneels at the rail on the called side and strokes, the blade dipping in time with the push; then stows it.
   - ~~**Paddling tires the paddler**~~ (done, v200: claude/paddle-fatigue) (owner, 15 November: "paddling is exhausting… strength of paddling and duration
     without rest should be tied to crew fitness"; Crew Model, Deep Physics reviewing): the stroke's power and how long
     it lasts before a rest come from the paddler's fitness and the same fatigue model as hiking (crewPhys.ts), with a
     sourced sustainable-power curve for one person paddling; a tired paddler slows, rests and can be swapped.
   - ~~**The paddle tab as arrows**~~ (done: paddle-arrows) (owner, 15 November: "the P and S buttons on the paddle tab are confusing. maybe
     clickable arrows like < PADDLE >"; UI & Copy): ‹ paddles on port, › on starboard (the side the crew kneels on,
     as you face forward); tap the lit one again to stop.
8b. **A UI audit with real rigor** (owner, 13 November; next; drafted in docs/UI-AUDIT.md; built so far: one back stack with named back links and Esc as back, the Yacht Club's members as two plain lists): "a UI audit on the roadmap to focus on real rigor on these
   screens, with a focus on navigation, cognitive load of information, and IA." UI & Experience is drafting
   docs/UI-AUDIT.md: the setup screens, the Yacht Club, the logbook, past races, settings and the Keys; back-stack
   navigation in place of "< Start page"; and the Yacht Club's Everyone / Skippers / Crew / Yours toggle, which confuses
   the owner. Proposals go to the owner before building; the screen rule above applies.
   Also filed with it:
   - ~~The setup builds the World only on Start~~ (done: one World per change, the scene once at Start) (owner: the configurator lags because it rebuilds the play surface
     behind it).
   - ~~Bug: the flag index doesn't scroll~~ (done: wheel and drag).
   - ~~The wind angle dial, when shown, under the inset map~~ (done: directly under the inset, which is at the top right) (owner, 13 November; polish; <1 h).
   - **The cruise planner's layers: slow to switch, streaks redrawn oddly** (owner, 15 November; not urgent; 1–2 h):
     "toggling between current and waves in cruise planner takes forever, and the moving lines redraw themselves in
     weird ways." Switching layers should be near instant: build each layer's field once and keep it, rather than
     recomputing it on each toggle. The moving streaks should carry on smoothly from where they were, not restart or
     jump. Likely the same code as the chart's rushing streaks and two-click layer row (8f, 8l), so fix them together.
   - **Bug: the start-line drill's cue card floats out of view** (owner, 15 November, from a screenshot; bug; <1 h): "this
     floating guidance card in start-line trainer mode keeps floating out of view." The cue ("BUILD SPEED", "8 s · late
     by 3 s") drifts up until the top bar cuts it off. It should stay fully on screen and steady: kept below the top bar
     and clamped inside the view wherever the boat it's pinned to goes. Its faint second line also needs to be readable
     against a pale sky.
   - **Bug: the start-line drill's "With the fleet" brings no fleet** (owner, 15 November; bug; <1–2 h): "in start line
     trainer, I started alone, then after a couple tries I toggled on 'with the fleet.' but no fleet appeared." Switching
     mid-drill must bring the fleet in at the next attempt, at the latest (src/app/drills.ts, the drill's choices).
     The owner also asked "I also don't understand what the yellow pathing is referring to. is it just pointing me to
     the line?" The gold lane is the approach to the line (render/drillGuides.ts). It needs to show at a glance what it
     is, without copy: for example, ending on the line at the spot to cross at the gun. It folds into the favored-end
     work below, where the lane should lead to the favored end.
   - **The start drill's results: "End" unclear; the table unreadable; the copy block** (owner, 15 November, from screenshots; now; 3–4 h): "don't know what
     'end: middle' means (the column) in start practice." It's where along the line she crossed: the pin end, the
     middle or the committee boat end (src/app/drills.ts endW). Make it plain without copy: a tiny line icon with her
     crossing marked, the favored end lit once the favored-end work lands, so the column also says whether she started
     at the right end.
     Then (15 November, from a screenshot of the results; now; 2–3 h): "I can't read this table. I don't know which
     session is my most recent; apparently the yellow is my best? and some of the times are preposterous. I didn't take
     17m 8s to cross the line." And: "that copy block is insane. nobody will every read that. short, sharp takeaways."
     The "At the gun" column reads "17 m · 8 s" (meters behind, seconds late) as a time; the latest start isn't marked;
     gold for the best isn't explained; one row says "X" (the line's end mark) where the others say "middle". The "What
     happened" block (about ten sentences) breaks the standing rule: replace it with two or three short, sharp
     takeaways (the biggest loss first, with the fix), the rest behind one hover or cut. Make the table read at a glance:
     the latest start marked, distance and time apart with units that can't be misread, prefer visuals to words.
   - ~~**Start practice: restart without finishing**~~ (done: start-drill-check, batch44) (owner, 15 November; feature; now; <1 h): "in start line mode, I'd
     like to be able to restart without having to finish the whole drill." The pause menu has a Restart (labeled
     "Restart Race" here, since only drill and rounding say "Drill"), which the owner didn't find or which starts over
     from scratch. Give a new countdown from the same setup at any time, keeping the session's starts table: a key
     (listed in Keys) and the pause menu's Restart labeled for the drill. No new on-screen button.
   - **A breeze (lesson 11): see the puffs coming** (owner, 15 November; feature; next; 2–3 h): "on the breeze drill, I
     need more in-game guidance about when the puffs are coming." The water already darkens under a puff (render/scene.ts,
     a 15% puff plainly darker), but nothing teaches her to look for it. Teach reading the water, as a real sailor does:
     before each puff, mark its dark patch upwind (a ring or arrow on the water) with a short countdown cue ("Puff · 8 s"),
     then "Ease" as it lands; fade the marker over the lesson so she ends up spotting the patches herself. Visual, no
     copy; the puff's timing from the sim's own Puffs (environment/wind.ts), never invented.
   - **The race strategist, redone as an expert at your side** (owner, 15 November, from a screenshot of the Strategist
     tab; polish/feature; next; 6–10 h; mock-up to the owner first): "the race strategist tab ... is a mess. way too much
     copy, way too much self-referential stuff ("sim physics"), etc. This page should feel like an expert racer is at
     dockside or in your boat before a race, assessing the course and competition and conditions, and giving you easy to
     understand advice about how to win. definitely should touch on how to find the favored start side, and any clues
     about which side that might be, assuming those clues are discernible from pre-race context (i.e. we haven't had a
     chance to get to the line and measure; make this real world). stacking all the legs into one advice column is too
     much. one bit at a time." So: the voice of a racer, not of the sim (no "sim physics", no methods); short, sharp
     calls; the course, the fleet (by sail number) and the conditions; one bit at a time (one leg, one point, stepped),
     not all eight legs stacked. The start: how to find the favored end once she's at the line (the methods of the
     favored-end drill below) and the pre-race clues a real racer would have: the forecast wind's direction against the
     course's axis, a known shift (the sea breeze veering through the afternoon), the tide's set across the line, the
     committee's habit; the researcher to source these for the Bay. Never the measured answer before she's measured it.
     The researcher's first pass (15 November, search summaries only): the general clues are sourced (line bearing
     against the wind, about 1/8 of the line per 5° of bias, sailmagazine.com/cruising/choose-wisely; oscillating vs
     persistent, windcheckmagazine.com; a back before the start: start right and tack toward the veer, sailingworld.com).
     The Bay's lore is not: the sea breeze veering as it fills (one unread blog), the ebb in the deep water (forum
     posts). Nothing from St. Francis YC, GGYC or US Sailing yet, and no sourced committee-habit claim, so the strategist
     says none of it as fact until better sources (the clubs' race and sailing-instruction pages; latitude38.com is
     blocked here) are read.
   - ~~**Jibe-ho: a confirmation, a reachable key, and how to use it**~~ (done: jibe-ho, batch44) (owner, 15 November; polish; now; 1–2 h): "I need to
     see some kind of confirmation when I call jibe ho during a jibe. and the shift-j command is too hard. those keys are
     too far away from each other. need a better option, clearer instructions on how to use it." Today turnHo is
     Shift+J (src/ui/keys.ts:73; app.ts:1223 sends {k:'turn'}), J is also the jib halyard, and nothing shows the call
     was made. Wanted:
     - The confirmation: the call itself, seen and heard where she's looking: the crew's "Ready to jibe" … "Jibe-ho"
       (or "Ready about" … "Helm's a-lee") as a brief call by the helm, and the crew visibly moving to it.
     - The key: Space (the owner chose it, 15 November), replacing Shift+J; keep it
       rebindable in Keys.
     - The how-to: no copy block; at most one short chip at the moment it's useful (bearing away toward a run, or
       close-hauled before a tack), e.g. "Space · jibe-ho", fading once she's used it a few times.
     - The call leaves sooner (owner, 15 November; polish; <0.5 h): "the "tacking!" and "jibe ho!" commands can leave the
       screen sooner. once called, they're called." The order is held for the whole turn plus 1.5 s today
       (src/render/labels.ts:90-92). Show it about 1–1.5 s after the warning, then let it go.
   - **Tiller and mainsheet keys that follow the tack** (owner, 15 November; feature; next; 2–4 h): "tiller and mainsheet
     key commands should switch based on starboard or port tack to reflect real life movement." The owner chose:
     - An option in Keys, with today's fixed port/starboard (A/D) staying the default. The option makes the tiller keys
       push and pull from the helm's windward seat, so they swap sides with each tack.
     - The mainsheet follows the hand holding it on each tack: pull in and ease, toward and away from the helm.
     The swap happens when she's through the tack or jibe, not mid-turn, so a held key doesn't reverse under the
     player's finger. The keys' labels show which way each key works now. No new screen controls.
   - **The trim coach's ◆ unexplained** (owner, 15 November, from a screenshot of the mainsheet in the sail band;
     polish; next; <1 h): "what does the little turquoise diamond mean". It's the trim coach's target, where the coach
     wants that control (sailBand.ts .sb-cue; trimNotes.ts). It has no hover. Give it one hover tip, e.g. "Coach: trim
     to here", and nothing on the screen.
   - ~~**The navigator doesn't see piers, and can't bring her home**~~ (done, v206: the way in from the harbor's mouth) (owner, 15 November; bug; now; 6–10 h):
     "navigator not detecting this pier. I ran right into it." The planned track runs straight along a long NE–SW pier
     to its tip, in the Precautionary Area (20–39 ft charted). Suspects: the planner's land test (src/sim/routing.ts
     landDist, :47-66) uses the terrain's land mask and the Cityfront's hand-drawn shore, not the wharf layer
     (geo/shore.ts wharfNearest, imported but apparently unused there); and its grid cache and ring search can miss a
     pier about 30 m wide. The fix: every pier and wharf counts as land for routing, kept clear by at least half a
     boat length plus a margin, with a test that a plan past each Embarcadero pier keeps clear. Then (15 November): "it looks
     like navigator is missing most of the piers actually. we're tacking toward one right now. not urgent but let's get
     the coastlines updated." So it's all the piers, not one: bring every pier, wharf and breakwater the chart draws
     into the planner's land, from the same source as the chart (NOAA ENC/OSM), and test along the whole Cityfront and
     Embarcadero. 2–4 h. Then (15 November; now; 6–10 h in all): "navigator just cannot take her home to her slip. it
     doesn't understand how to move around piers, obstacles, even other docks in the same marina." So the navigator
     needs a real route, not only land avoidance:
     - (1) every pier, wharf, breakwater and dock as an obstacle with clearance;
     - (2) inside a marina, a path along the fairways to her own slip (the marinas' dock and fairway data in
       src/geo/marina.ts), finishing with the docking hand-over;
     - (3) moored boats solid, the same fix as slip 572 (8m2);
     - (4) a test that the navigator brings her home from the Bay to slip 572 with no contact.
   - ~~**Bug: "Sail Home" from Mile Rock still plotting after ten minutes**~~ (done, v205: nav-pace) (owner, 16 November; bug; now; 2–4 h): "I was
     sailing outside of the gate, with a destination near the old mile rock lighthouse. when I got near to the
     lighthouse, I went into the nav view and clicked Sail Home. It appears that my destination has updated, but we're a
     full ten minutes in and the course is still plotting in the nav map. I need that to move more quickly." Lead: since
     #440 (navroute-sliced, 5fe08a2a) the route is worked out 2 ms in every 16 (hud.ts navRoute, routing.ts
     routeAroundSteps) and re-planned every 100 m sailed; on a long passage the search may outlast 100 m and start over
     each time, never finishing. Finish (or carry on) the search under way rather than restart it, and give a new
     destination a bigger share of the frame. The bar: Mile Rock to her slip drawn within a few seconds, tested sailing
     at 6 kt (tests/insetRoute).
   - ~~**A clicked destination shown as a pin, not coordinates, and moved when the destination changes**~~ (done, v205: nav-dest-pin) (owner, 16
   - **The passage plan's cold first fill: exact speedups left** (17 November; perf; later; each 1–3 h). From Mile Rock to
     Gashouse Cove the first plan now takes 63 s of work, not 87 s. Two changes did that, both exact (the same track point
     for point; branch cold-current): the lee rays skip open water, and the current grid keeps the shore's share per
     point. The Coordinator stopped the work there. What's left, from a CPU profile of that plan (the profiler adds ~3%):
     - the router's clear-water test (sim/router.ts `clear`): ≈15 s, about half of it the exact `landAlong` walk;
     - routeLegSteps' own loop: ≈9 s;
     - the polar speed in chop (`chopSpeed`): ≈6 s;
     - the weather field (`wx.field`): ≈5 s;
     - windTerrain's shore distance (`shoreDistAt`): ≈5 s;
     - the land's lee: ≈6 s, down from ≈20 s.
     Each needs a test that the plan is identical. Changes that alter accuracy (a coarser lee grid, a shipped table) go to
     Deep Physics.
   - **A clicked destination shown as a pin, not coordinates, and moved when the destination changes** (owner, 16
     November: "bug: when I change sailing destinations, the destination pin on the horizon doesn't seem to update. we
     could bundle this fix with the earlier request to use pins instead of coordinates for non-named destinations."; bug
     and polish; now; 1–2 h). The 3D marker's place and label follow every change of destination (a click on the chart,
     a choice in the navigator, Sail Home, cleared), with a test that changes it twice and checks the marker each time.
     Earlier (owner, 15 November, from a screenshot of the 3D view; polish): "destination indicator can just be a pin or something if it's not a named
     destination. the long coordinate string is ugly and not useful." The cruise's destination label in the scene reads
     "37°50.92'N 122°26.85'W" for an unnamed point. Give it a plain pin (a marker, no text). A named destination keeps
     its name. Coordinates at most behind a hover on the chart.
   - ~~**The inset map is lagging again**~~ (done, v200: claude/inset-lag) (owner, 15 November; regression; now; 1–3 h): "inset map is really lagging
     again." Recent changes to the chart: dbb27a7e (the layers switch at once: each field kept, each kind's streaks its
     own), caae0506 (chart-skip-3d, batch 42b), the harbor lee's cells (3c80d150) and the wind shadows' skip
     (aa6471f7). Measure the inset's draw time per frame against the published version before these (perf-ab's views,
     with the inset open and a layer on). Likely more fields or streaks redrawn every frame than before. Add the
     inset's cost to the frame gate so it can't creep back.
   - **On-water current view, in Tools** (owner, 15 November; feature; next; 3–5 h): "on-water current view, toggle-able
     from Tools". Like wind in the air and the flow view: the current drawn on the water around her (its set and drift,
     from the sim's own current field, NOAA's), switched on and off in the Tools tray, with no new button. Its marks
     move over the ground at exactly the current's speed and direction, never faster, so the every-layer test (8l) covers
     it and it can't bring back the rushing water. Asked again 18 November (not urgent): "I'd like to toggle on and off a
     view of the current directly on the water around me to help me understand the nuances of the bay and the ocean."
     A feature, so after the sprint.
   - **A heel indicator at the top-center of the sail controls** (owner, 15 November; feature; next; 2–3 h; drawings first):
     "at top-center of the sail controls, I want a heel indicator. show me drawings before building anything." Then:
     "need to see it in situ with the sail panel." Three options shown in place on the real band:
     - (A) an arc with a mast that tilts;
     - (B) a tiny hull and mast from astern;
     - (C) a flat bubble bar like the band's tracks.

     Each has the teal ◆ at her best heel (boat/crewPhys.ts crewBestHeel), amber past 20° (the coach's
     "overpowered", coach.ts:98) and red past 25° (laid over), with only the degree number as text. It follows the side
     she's heeled to (b.heelMag), sits inside the band, and adds no new button. Then (15 November): "the heel indicator
     should be the same height as the auto-trim tab, and the same basic design." So it's a tab on the band's top
     edge: `.sb-tab` (07-band.css:55, 22 px, the same background, border and radius), in the center slot
     `.sb-tillerslot`, which has been empty since the tiller strip went. Three ways to fill it are shown in place: T1 a
     slim bar, T2 a tilting mast glyph, T3 both. Then: "I feel like it needs to be centered to make sense. is there a
     way to make the windex smaller and get the heel indicator into the main part of the panel, just above the windex?
     or even as an outside ring on the top part of the windex, like from 10:00 to 2:00?" Two more are shown in place:
     (R) a ring around the windex's top from 10:00 to 2:00, its mark at her heel angle one to one; and (S) the windex
     about 20% smaller with the slim bar just above it. The owner picked R, then refined it in place (15 November):
     - **Ring:** a thin ring hugging the windex's top from 10:00 to 2:00, one to one with her heel, all inside the
       panel. The windex is a little smaller (about 87%) and set a hair lower, clear of the mainsheet row.
     - **Mark:** a small circle on the ring, white, then amber past 20° and red past 25°, with the ring's amber and red
       zones behind it.
     - **Best heel:** a teal ◆ tucked tight outside the ring at her best heel; the circle may overlap it, so long as
       the ◆'s top half shows.
     - **Degrees:** just outside the ring at 1:30 or 10:30, on the side she's heeled to.
     After two flat-bar variants (along the panel's top edge), the owner chose (15 November): "lets go back to the last
     iteration of the curved dial. build that." **Final, to build (now; 2–3 h; UI & Experience):** the ring above,
     with the windex at about 87% and raised a hair, the 4.5 px circle and the ◆ tucked tight. The stills are on branch
     claude/hopeful-thompson-m94ahm, reference/screens/heel-ring/ (wp6, wp16, wp-26, heel-ring4). Draw it in
     src/ui/sailBand.ts as an SVG layer over `.sb-wx`. It reads b.heelMag and her heel side, crewBestHeel
     (boat/crewPhys.ts), and the thresholds: 20° (coach.ts:98) and 25°. No new button. Check both tacks, and send stills
     to the owner before it ships.
   - **Learn to sail, lesson 1 "The boat": teach the parts, then quiz them** (owner, 15 November; feature; next, "not
     urgent"; 6–10 h; a design change to a lesson, so the design goes to the owner before it's built). The owner's
     brief:
     - **The problem.** For a total beginner it's a click-and-guess game. The cue says only "Find the <part> · n of 43"
       (src/app/boatLesson.ts paint). A wrong click says only "That's the <other part>". The boat is never introduced,
       and a part's explanation shows only after it's found, for 2.6 s (NOTE_MS). The boat spins all the time
       (`open()` sets app.look.spin = true; only a drag stops it), so a beginner can't hold a view.
     - **What the owner wants:**
       1. Teach, don't hunt: walk the parts a few at a time, in the existing groups (src/render/boatParts.ts
          PARTS[].set): the boat (hull and deck), the rig, the sails, the controls, the wind's sides.
       2. Focus on each section: frame the camera on it (the rig, the sail corners, the cockpit and controls), mark the
          part being taught, and dim or hide the rest. Keep the underwater view for the keel and rudder.
       3. Name and explain each part as it's shown: its name and its one-line `what` on screen while she looks. A
          "Next" step moves on, with nothing to find.
       4. Stop the spin: the boat holds still while a part is taught, and dragging still looks round her. Anything that
          turns is the camera moving to the next section, slowly and on purpose.
       5. Quiz at the end, e.g. "Which one is the boom?" (tap it on the boat) or "What does the outhaul do?" (pick from
          a few). A wrong answer shows the right part and asks again. Passing the quiz passes lesson 1, not the
          walkthrough.
       6. She can leave the quiz.
     - **The owner's answers:**
       - A core set of about 15 parts first, then the quiz on them, repeated set by set until all 43 are done.
       - In the quiz, tap the part first; two wrong taps bring multiple choice.
       - Missed parts come back until they're right.
     - **Constraints:**
       - No new buttons: use the showroom's cue bar (#showCue) and the lesson overlay.
       - One short line per part, and a highlighted part over words. Learn to sail is the one place step-by-step
         instruction belongs (VISION-ROADMAP.md:54).
       - US spelling; keep the existing part names.
       - The visual-checker, both sides and both tacks.
       - Keep ASA 101 knowledge items 1–3 covered (design/ASA-101-CHECK.md).
   - ~~**The start-line drill teaches you to find the favored end yourself**~~ (done, v200: favored-end) (owner, 15 November; feature; 4–6 h): "start
     line training also needs to help me learn which side is favored and why." Then: "don't just show me which line is
     favored. help me learn how to find that out myself." The drill teaches the methods racers actually use, done on the
     water before the gun, with the answer only after you've judged:
     - **Head to wind on the line:** luff head to wind at mid-line. The end the bow points nearer to is the favored end.
     - **The compass:** sight down the line from one end for its bearing, then go head to wind for the wind's. If the
       wind is more than 90° from the line toward one end, that end's favored. The tactical compass on the cabin top
       (in progress) is the tool.
     - **Sailing the line:** reach down the line, sails trimmed, and see which way the sails need easing or trimming.
     - **The current:** watch the committee boat's anchor line, the pin's wake or a crab pot, to see where the stream
       carries you at the gun.
     - **The first beat:** which side pays, from the wind and tide (the strategist).
     - **The crowd:** where the fleet bunches.
     Each run asks you to call it ("which end?") before the reveal. Then it shows how you could have told: the square
     line against the real one, and the bias in boat lengths. It also shows how your call and your start compared. The
     wind's shifts stay real, so the favored end can change while you check it, as on the day. Pictures and actions,
     not copy. Methods to be checked by the researcher against published racing guides (US Sailing, North U).

   - **Bug: no way to the navigator from the expanded chart in a cruise** (owner, 15 November; bug; <1–2 h): "when in a
     cruise, if I expand the inset map I can no longer find navigator mode." Once the inset map is expanded, the full
     chart must still offer the navigator (the passage plan): an icon in the chart's own row, where the layer and flag
     toggles moved (8b), and its key working with the chart open. Check the strategist in a race the same way.
   - **Bug: the navigator opened from the inset map comes up without its map** (owner, 16 November; bug; now; 1–2 h):
     "when in inset map, clicking the navigator button opens the navigator modal, which fails to populate with the
     map." The navigator's own panel (ui/navView.ts) opens empty of its chart. Fix, with a test that its chart draws
     (scripts/check/setup-map.cjs's way), from the inset and from the expanded chart.
   - ~~**One chart: the navigator as a layer on the map, not a map of its own**~~ (done, v206: marinas-nav) (owner, 16 November; feature, design;
     next; 4–8 h; mock-up to the owner first): "tapping the navigator button should just surface the navigation map on
     the map directly, or as its own layer, rather than opening a separate map. I see no reason why an IRL sailor would
     have two separate maps: one for conditions and one for navigation." The passage plan (destination, track, hazards)
     drawn on the inset and the expanded chart beside the wind, current and wave layers; the separate navigator panel
     retired. Supersedes the fix above once built.
   - **The boat's own controls, in one menu** (owner, 16 November; feature; next, not urgent; 4–6 h; placement shown to
     the owner first): "I want to make certain boat controls available during cruising and racing: opening/closing the
     companionway door and hatch, turning the cabin lantern on and off, turning nav lights on and off, raising or
     striking the burgee and other flags. they should all be tucked into the same menu somewhere. find a good place and
     show me when the time is right." Today the companionway and hatch are set only in the boat editor. Proposed home:
     one "Boat" group in the Tools tray, no new button; the mock-up once the UI audit and the one-chart work have
     settled the tray. Science: navigation lights sunset to sunrise and in restricted visibility (COLREGs rules 20, 25),
     the ensign's hours kept; later, an open companionway counts in a knockdown's downflooding.
   - **Bug: lashing the tiller less than about 13° off the centerline lashes it amidships** (owner, 15 November; bug;
     <1–2 h): "tiller lashing is glitching when I try to lash it less than 13ish degrees off centerline. it just lashes
     it amidships." Leads in src/app.ts:
     - The double-click route (around line 1192) records the first press's angle (`firstPress`), but the first click
       also lets go of the tiller. Between the clicks the tiller springs back toward the center (`tillerSpring`, 2.5 a
       second), so a small angle can reach zero first.
     - Check that the right-click route keeps the angle too, and that `setTiller`, then the `lash` command (sim/commands.ts
       line 120, which lashes at `u.tiller`), reach the worker in that order, with nothing in between zeroing a small
       angle.
     A test: lash at 5°, 10° and 15° each way, by right-click and by double-click; each must hold the angle it was
     lashed at.
   - ~~**Bug: "gray confetti" running up the sails**~~ (done: 705ab35c, her ropes cast no shadow) (owner, 15 November, from a screenshot of USA 122 on the wind; bug;
     <1–2 h): "a weird animation effect running up the sails in the form of these odd rectangular shadows. look like
     gray confetti flying up the sail." Small dark rectangles, in a diagonal band, travel up the mainsail. They look
     like shadows cast by something small and moving (spray, wind or flow particles, telltales) that shouldn't cast
     shadows, or a shadow-map artifact. Find what casts them and stop it; check both sides on both tacks.
   - **The flow view keeps the boat in the middle of the screen** (owner, 15 November; not urgent; polish; <1 h): "when
     I engage wind-over-sails, don't bump the boat to the left. keep her center screen." Opening the flow view shouldn't
     move the camera or shift the boat aside to make room. The flow panel sits over the scene, and the boat stays where
     she was.
   - **The flow view with one sail down** (owner, 15 November; not urgent; accuracy; 1–2 h): "check that the wind over
     sails map is accounting for when I'm sailing on just jib or just main." A first look found nothing in
     ui/sailFlow.ts or ui/flowPanel.ts that checks whether each sail is hoisted. With one sail down, the view should
     draw and describe only the sail that's up. There's no slot then: no jib bending the flow onto the main's lee side,
     no main's upwash on the jib. A lowered sail's telltales go too. The physics' own sail forces should be checked the
     same way.
   - ~~**The passage plan's track: hairpins and doubling back**~~ (done, v200: the isochrone router) (owner, 15 November, from a screenshot of Horseshoe Bay to
     the Berkeley side; accuracy; 3–6 h): "explain this routing to me. why does it need that awkward first big jibe?"
     The plan (sim/routing.ts sailLeg, plan 'middle') sails the run at her deepest VMG angle and jibes whenever she's
     more than 12% of the leg's length off the straight line, measured over the ground. In a strong cross-current the
     jibe that sails into it makes little or no ground, so the track doubles back on itself (the hairpins off Yellow
     Bluff). A navigator would sail hotter angles nearer the straight course, or hold the favored jibe and use the
     current, and never draw a track going backward. Fix: choose the angle and the jibes by speed made good over the
     ground toward the destination, current included (an isochrone router is the full answer: ask the owner before
     changing the design). The AI's own leg planning shares sailLeg: check it too.
     **The isochrone router** (the owner's decision, asked 15 November): the rule-based planner can't get out of a dead end
     on a run, light air in a lee with the tide setting her on (the owner's own route off Yellow Bluff, 25 Nov 15:00,
     with the land's lee without seams: tests/passage-hairpin's it.fails). A router spreading out every minute on every
     heading, with the real wind, lee and current, keeps the fastest way to each place; a plan in 3–7 s cold, worked out
     between frames, nothing per step. (Built: sim/router.ts, the passage planner's; the owner said yes, 15 November;
     physics review two rounds, Deep Physics.)
     **The router's pruning by place, not by bearing** (Deep Physics, review round 2): the front keeps one point per 1°
     sector of bearing from the start, so two points on one bearing either side of a point of land share a sector, and
     the one kept can be in a dead-end bay. Alcatraz to Clipper in 6 kt shows it: finer grains plan 14% slower than FINE,
     whose route sails true. Tried and failed (15 November): pure 100 m cells by tack (the front floods the Bay, out of
     memory); cells added to the sectors, a cell never taken twice (a light-air boat can't leave its cell in a minute,
     worse everywhere); the same with 3 minutes' grace (still worse). Next to try: a dominance test on time-of-arrival
     per cell, keeping the sectors as the bound.
     **The router off the page's thread** (Capacity's suggestion, 15 November; the Coordinator to decide): 3–7 s of CPU,
     sliced 2 ms a frame, puts the first plan up in about 50 s. In its own worker, or as a job in the sim's worker
     between steps, it would show in about 6 s with nothing on the frame.
     **Next: the race brief and the AI's leg planning onto the router** (the Coordinator, 15 November): strategist.ts
     comparePlans and the AI still sail the old rules (routing.ts sailLeg). Moved later, with the race's own timing in mind.
   - **The cruise setup: an expand icon on the map, not a button** (owner, 15 November; not urgent; <1 h): "kill the
     'plan on the big chart' button and just have an expand icon on the map itself." The small map gets an expand
     icon in its corner that opens the big chart; the "Plan on the big chart" button goes.
   - ~~**Bugs in the race setup's "When" section**~~ (done: 196e7db) (owner, 13 November, from a screenshot; UI & Experience, #272; 1–2 h):
     - "date picker gets cropped at bottom of screen": the date picker opens below the Date field and the panel cuts it
       off after the first week. It should open fully visible, flipping upward or scrolling the panel.
     - Starting from her slip at Gashouse Cove with "Leave at 1:35 PM", equal to the 13:35 gun, the line reads "She
       starts in her slip… -3 minutes before the start": a negative lead time. Clamp it to a real lead time, or say
       plainly that she can't make the start from there.
   - ~~The sail band's decorative cleats removed, with no dimming in their place~~ (done: 12f4199) (owner, 13 November).
   - ~~Yours or the crew's, shown coherently in the sail band~~ (owner, 14 November: declined, "The current tab copy and
     states are fine." The Auto-trim / Hand back tab stays as it is.)
   - ~~Remove the line~~ (done) "Real boats have neither: they have the windex and the telltales." from Settings (owner, 13 November;
     index.html line 369; minutes).
   - ~~**Boat editor copy out**~~ (done: 848df4b) (owner, 13 November; minutes): the slip note ("She lies bow in … The docks are mapped from
     OpenStreetMap.") and the whole "Her flags" field, which is only a note (src/ui/boatPanel.ts lines 208–209, flagNote).
   - ~~**The season's flow**~~ (done: 65fe35b, 39558a0) (owner, 13 November; clarity; next; 3–5 h; a mock-up to the owner first): "I'm confused about the
     UX for seasons. I go to the yacht club to pick a season (counterintuitive, since I would think to go to Race), then
     when I select a season, BAM, I'm in my slip. no clue what's going on." Proposed:
     1. **Enter from Race:** Race → Season (the Yacht Club's Season tab shows the standings and history too).
     2. **Choosing a season opens its overview first,** not the water: the calendar (the real regattas, which are done),
        the next race (date, club, course, the day's real conditions), the standings, and her crew.
     3. **"Sail the next race"** opens that race's setup, filled in, and the brief.
     4. **Then the water,** with one line saying where she is and what's next ("In your slip at South Beach. The warning
        signal is at 11:55 off StFYC: sail out to the start."). Starting in the slip is true to life; it just needs
        saying.
   - ~~**A Save button on the Yacht Club's member page**~~ (done, batch 34: Save, and "Save changes?" on leaving, on a member's page, a boat's crew and the boat editor) (owner, 13 November, with a screenshot of "Crew 2"; 1 h): "I'd like a
     save button here. clicking it should give a quick visual confirmation and send me back to previous page." Save
     commits the member's edits, shows a quick confirmation (a check and "Saved"), and goes back one step on the back
     stack (to Members). Today edits apply as they're made (81ed7c5). The same pattern for the other edit pages (the boat
     editor, the Yacht Club's boats) in the audit. Owner's decision: leaving with unsaved edits asks "Save changes?" with Save and Discard.
   - ~~**The pause menu redesigned**~~ (done: 37fd550) (approved by the owner, "fine for now"; 13 November, with a screenshot; 1–2 h): "these buttons are a beast to read.
     too wide, incoherent stacking. just bad design." Today it's full-width buttons in rows of 1, 1, 3 and 2: Resume,
     Change the conditions…, Restart this cruise · Back to setup · Settings, Sound: On · Exit to the start page.
     Proposed: one narrow column (about a third of the screen's width), grouped by what you're doing:
     1. Resume.
     2. On the water: Change the conditions.
     3. Start again: Restart this cruise, Back to setup.
     4. The game: Settings, Sound.
     5. Exit to the start page, set apart.
     The same pattern for every menu in the game. A mock-up to the owner first.
   - ~~**The inset map's flag and layer icons off the game surface**~~ (done: 52846f2, 251ad9e, b1bf2ff) (owner, 13 November; 1–2 h): "the little flag icon and
     layer icon on the inset map doesn't belong on the game surface. those should be toggles in the full map view, with
     the inset remembering my choices." The layer choices (and the flag index) move into the full chart. The inset shows
     whatever was last chosen there, saved with the player's settings. The standing screen rule applies.
   - ~~**The on-screen tiller instructions out**~~ (done: 848df4b, 80d5b36) (owner, 13 November; minutes): the keys line across the screen (#keysHint,
     "click: take or let go of tiller · right-click, double-click… lash it · … steer · … luff · …", src/app.ts keysHint).
     The keys stay in the Keys panel. Such instructions belong only in a learn-to-sail mode (Training tools, below).
   - **One way in to the features on the game surface** (owner, 15 November; feature; 2–4 h; UI & Copy to design after the copy audit,
     to the owner before building): "there's a lot of really cool shit we've built, like wind-in-air and wind-over-sails,
     but it's hard to find these things. I think we need a 'more' (not that copy though) button on the game surface for
     all features that show up on the game surface itself." One button, an icon rather than the word "More", that opens a
     tray of icon tiles, each turning one on-surface feature on or off and showing its key. The candidates, from the
     Keys list: the wind indicator (wind in the air), the flow view (wind over the sails), the sail controls band, the
     course and strategist or navigator, the cabin-top instrument, the paddle, the navigation lights, the hail, the
     views, all messages and the frame-time readout. The owner asked for this button; it should also absorb scattered
     on-screen toggles, so the surface ends up with fewer controls, not more. Ties in with the UI audit (#236).
   - **Show the tiller angle** (owner, 15 November; polish; 1–2 h; Crew Figures from 18 Nov, with the tiller guide): "we took away the copy
     on the tiller interface, which was good. but it might be nice to show the tiller angle." A picture, not words: a
     small tiller (or rudder) needle in an existing element, such as the sail band or beside the wind dial, showing how
     far it's over to port or starboard and where it's lashed. No new button, and no new strip across the screen (on 12
     November the owner said "no tiller strip"; this is a needle, not the old strip).
   - **Now — an audit for that kind of noise everywhere** (UI & Copy from 18 Nov; earlier Crew Art, annotated screenshots to the owner; fixes so far a756fbf, 848df4b) (owner: "let's do an audit for this kind of noise throughout"; part
     of the UI audit; 2–4 h): every explanatory line on every screen (setup, boat editor, Yacht Club, Settings, the chart,
     the logbook, the panels, the coach) listed and kept only if the player needs it to act. The rest is cut, or moved to
     the coach, the help or the Keys. The list goes to the owner before cutting, unless a line is plainly noise like
     these.
     - **Bug: the jumpers' control** (owner, 18 November; bug; now; 2–3 h): "jumper control are confusing and glitchy.
       can't seem to reach the minimum 0 or maximum 5. left/right arrow control UI is super weird. and the controls should
       show on the panel by default." In src/ui/sailBand.ts `jumpers()`, the dial shows only when her Rig tune has
       `jumpersUnderWay`: the owner wants it shown by default. 0 and 5 aren't reached: check jumpersBy's step from
       jumpersNow/jumperTarget (two quick presses, the guide's tune with no tune set) against condition.ts wantJumpers'
       clamp and fixTune. Add a test that presses take it from 2.5 to 0 and to 5. The left/right halves of the dial go;
       in their place, a plain − 2.5 + stepper in the band, its mock-up to the owner first.
     - **First: the sail band's and coach's tips** (owner, 18 November, with a screenshot of Jumpers' tip, 11 lines; now;
       3–5 h): "we need to work on these gargantuan copy blocks. no one will read this." Each tip (src/ui/sailBand.ts,
       e.g. `jt`) becomes one line of about 12 words: what it does, and the cue to act (Jumpers: "More turns stiffen the
       masthead. Tall tick: North's 2.5."). The click and scroll use goes to Keys. The sources and the physics go into the
       code's comments, or into one "Why" link per control if the owner wants them kept. All the band's new lines go to
       the owner as one table before they replace the old ones. A test: no band tip over about 90 characters.
       - The Jib car tip covers both settings (owner, 18 November, with a screenshot of "In medium air, the jib car sits in
         the middle, for an even twist."): "jib car guidance should provide advice about both settings: fore/aft, and
         athwartship." One line each, within the same limit: fore/aft sets the twist (aft eases the leech, forward
         tightens it); athwartship sets the slot and the pointing angle (in to point, out to reach). The wording goes to
         the owner in the tips table; its figures follow the car's real track and sheeting range in the sim.
       - The pole toast's "Up here" (owner, 18 November, with a screenshot of hud.ts:437, "Up here the poled-out jib does
         less than it would to leeward…"): "what does 'up here' mean? clarify this copy." It fires with the pole set at a
         true wind angle under 154.5°, a broad reach, not a run. It says so, in one line ("Poled out on a broad reach,
         the jib pulls less than on the lee side. Stow the pole (Pole tab, O) or bear away."). The other toasts and tips
         get a read for the same kind of word ("up here", "down here", "this").
   - ~~Remove the body line under "Chart · Pick a destination"~~ (done: c1ea689; the title kept) ("Paused. Tap the water or a place: sail there, or move her
     there. Drag to move, scroll to zoom."), keeping the title (owner, 13 November; minutes).
8a. ~~Clean up the wind controls in "Change the conditions"~~ (done: a1e833e5, 9b735925; Kind of wind is the one choice, Turn the wind nudges it up to 30°; tests/windkind.test.ts covers the 355° case) (owner; Crew Controls proposes options to the owner before
   building; 1–2 h): the "Wind from" slider sits beside the Kind of wind choice (real day / westerly / northerly /
   southerly / light), which is confusing, and the owner sailed in a 355° northerly after picking Westerly. One clear
   way to set the direction.
   HUD note (Deep Physics, in progress): the inset map shows the boat's own visibility, and is north-up in Just sail,
   with an N arrow.
9. ~~The flags' original motion back, and "Strike ensign"~~ (done: the committee boat's signal flags have their
   original motion back; the boats' flags keep the measured physics; the strike animates).
10. ~~P0 phase 4: deck hardware and lines, with the rigging detail~~ (done, v128–v134).
Then: the skipper and crew model; cheating, protests and hearings; validation against real fleets; real past races;
rig tuning; seasons and awards; fog's effect on sailing; looks (the Ferry Building, aluminum spars, the boat cards, the
showroom's time and conditions, the swinging lantern); Sam's; accounts for other players; real slip numbers and nicer
moored boats; the sea inside the marinas; the desktop release; the phone layout (on hold). The Bay East work carries on
as it is.

**Built 12–13 November beyond the ranked list** (to v174):
- **Ghost races:** sail against your own recorded race, checked end to end. This is the first step to multiplayer.
- **Real past races:** the replay against the real fleet, for a real past race; a race whose course is uncertain is
  flagged.
- **Training drills:** a start drill, and a mark-rounding drill with each rounding scored.
- **The tactical debrief:** leg by leg against the fleet's middle, the leg's best and the ideal; seconds by cause; sail
  numbers on the chips.
- **Air temperature:** each day's own, from Fort Point and the NWS, for the crew's kit (shorts from 68 °F, the owner's).
- **The ensign:** keeps its hours, 0800 to sunset; the burgee as the fleet flies it.
- **The cabin instrument:** the Tacktick-style unit at the hatch garage's forward end, key 6. This begins the tactical
  compass item.
- **A racing season:** a proposal for the owner (docs), built from the real 2025–26 Seaweed Soup.

**Built 14 November** (on main; each release now passes the frame gate first):
- Learn to sail: the lessons (including heavy-air easing, Lesson 11) and a gear check before casting off.
- The rules trainer: "Sail it yourself". A World Sailing Case laid out on the water, you helm the boat it's about; 23
  Cases sailed and taught.
- Wrecks, built from Marinas' design: every contact graded (boat/damage.ts); a hard blow, a ship, or being pinned in
  Fort Mason's piles wrecks her; then ashore, a tow or carry on; her logbook keeps it, laying up for repairs is off for now (the owner, 15 Nov 2026: "silly and punitive in its current state"; to come back to later; boat/spec.ts LAY_UP).
- The season's flow as approved: Race → Season → the overview → Sail race N → its setup; the announced 2026–27 race days.
- The drills' cues by the boat and guides on the water (8b and Training tools 3, as approved).
- No on-screen tiller instructions outside the Learn to sail lessons.
- The crew's main hand tacks facing the mainsheet, not reaching behind (the first of the owner's backwards arms).
- The rig checked against the class rules' measurement bands; the traveler held where you leave it.

**Built 13 November, also** (to v178):
- Josephine as she really is: sail number USA 122 (the 2026–27 Seaweed Soup results), and her club BVBC.
- The 2026–27 Seaweed Soup season under way: its race 1 (7 November 2026) as a real past race, with 2025–26 a pick
  away. Real skippers appear as anonymous ids, with no names in the shipped page.
- The published page is down from 9.4 MB to 5.3 MB (one copy of the sim's code).
- The Crew button back on the surface, opening on where the crew can sit (owner).
- Your whisker pole goes out only on your call (owner).
- The rest of the site map (UI audit): the Yacht Club as one name, Past races a screen of its own, Settings in two tabs.
- For the owner to review: the boat editor mock-up (8i), and a design note for real docking (docs).

**Owner's decisions, 12 November (morning)**, via the Coordinator:
- Blanketing is not a foul: "stealing wind is a significant part of the strategy of tacking". Rules removes it as
  rule-23 interference (rule 23 protects a boat taking a penalty or on another leg, not one being covered on the same leg).
- The piano: the crew leans across from windward (confirmed). No tiller strip.
- Z-flag penalties scored by RRS 44.3(c) (Debrief).
- Gashouse Cove kept as it was (before 2026).
- The swell view holds still.
- The crew passing close mid-cockpit in a 12–16 kt tack: left as it is (parked).
- Four boat-spec sites allowed, for Marinas to source the moored boats (begun: their proportions from the J/105's
  published figures, and the SF Marina's occupancy).
- The lines plan: the researcher to find who holds Plan 1.
- The speed budget held, with one deeper speed pass (done by v147: hull ends and chop lookups memoised, the current's
  shore distance off a 10 m lattice, tested against a 0.1% current change).
- The daily weather refresh now builds from main.

The original ranking, for the record:

Estimates are focused build hours including tests, review and publishing, ±50%.

1. ~~Saves kept with your account; save or discard after each sail~~ (done, v53).
2. **Hands-on boat handling**, in order:
   a. ~~Easier sail controls: adjusting one line takes only that line off auto; one tap puts it back; bigger targets~~ (done).
   b. ~~Heaving to: each jib sheet on its own, the tiller lashed at an angle, hove-to physics checked against real boats~~
      (done; the real-boat figures are anecdotal, so a GPS track of a Folkboat hove to would tighten the test bands).
      Later, from review: the hull's lift and broadside drag both act at one center of lateral resistance (no Munk
      moment), and the hove-to model's lateral area, added masses and side windage are estimates (physics.ts HOVE).
      The broadside drag's center hove to is tuned (HOVE.dragAft 0.3 m aft of the CLR, against the drawn profile's
      0.81 m, which makes her wander 30° in 8 kt), and HOVE.latArea (3.39 m²) disagrees with the drawn profile (5.36 m²):
      a towing-tank or GPS record of a long-keeler drifting, or the class lines (Plan 1), would settle both.
      The force model's drive calibration (physics.ts driveCalibration) comes from full, unreefed sails at their best
      shape, so in a gale (k ≈ 0.2 at 35 kt) it stands in for the reefing and depowering it leaves out; from rest a
      backed-jib boat there gathers way quickly (5 kt in about 10 s). Holding the traveler down doesn't depower her: the
      crew sheets in to keep the boom angle it wants, so with the traveler yours the mainsheet should follow your intent.
   c. ~~Crew weight in the physics: the low side in light air, hiking, body-tacking, forward downwind; the AI crew by
      skill; an option to place the crew yourself~~ (done). Later: the hull's hydrostatics (MCT, the wetted surface's
      change with trim and heel) from a Folkboat lines plan, and the righting curve's shape past a few degrees (the
      moment at 1° is now from three ORC certificates; the curve needs the hull's offsets); a roll jibe; the help a roll
      tack: she now rolls through it (in light air too), the rig's sweep adds push while she rolls (quasi-steady, from the
      sail forces) and a turn costs speed by the rudder it needs net of her helm, but in a 2-tonne keelboat that adds
      up to nothing measurable; the only measured gains are a Laser's (Kogure et al. 2013, GPS: 5.3% faster through the
      tack in 2–4 m/s, 2.8% in 4–6 m/s) and Cornell's towing-tank work on the unsteady thrust (APS DFD 2015–19, behind
      a browser check), and nothing sizes the heeled hull's own turning or the unsteady flow for a keelboat; the helm's own steering suffering while
      single-handed at the cabin top; crew moving in waves (aft in a chop to free the bow).
   d. ~~Real timing and sequencing of adjustments, by crew count and skill; cars rarely moved~~ (done). Later: measured
      timings for Folkboat crew work (the times are estimates); the order of jobs at a mark rounding (pole, vang, cars)
      planned ahead of the mark by a skilled crew.
3. ~~Race strategist in the course view, and a navigator for cruising~~ (done; published with the combined build of
   the parallel branches). Later: a gridded wind analysis so the sides of a beat differ by more than the shore and the
   slot; the strategist's plan B checked again on the water at the warning signal; the navigator's hazards from NOAA's
   chart data; the crew-trim model's traveler (boat/controls.ts puts it to leeward in medium air: found in review).
   Also from review: ~~check the brief's leg times against the sim's own fleet sailing the same legs~~ (done, PR #111:
   with four AI boats on Seaweed Soup course 2 and the training course, the 38 vs 47–71 gap is gone since the AI's held
   tacks; runs and reaches match the plan or the fleet is a little faster; beats take 5–20% longer, the plan being a
   perfect sail at 8 s a tack; the first beat and the leg after the first mark are slowest, from traffic and penalties
   at the first rounding; the whole race 47 min planned, about 50 sailed; tests/sim-fleet.test.ts holds the brief to
   the fleet, and the brief will say upwind times are for a perfect sail); list a max flood or ebb already under way at the window's edges;
   the tide predictions stop about 6 h after the gun (tide.ts stationsFor), so later passages see it frozen; and the
   gusts: Fort Point's records show peak gusts of 2–5 × the 6-minute mean on light, puffy days, while the sim's puffs
   stop near +45%, so the brief states the sim's gusts. Whether the puffs should reach the records' peaks is for the
   deep physics pass.

**P0 — the Folkboat herself, a full true-to-life 3D model** (owner, 12 November 2026; owned by Boat Detail; about
16–28 h over four phases): "this is a Folkboats simulator, and the accuracy of the boat itself is a P0… properly build
out a full true-to-life 3D model of the folkboat… use as much care inside as we have everywhere else. we still have more
work to do on the deck as well (lines, hatch, fairleads, etc) but that's not urgent either." The cabin lighting at night
is now "much better" (owner).
1. ~~The interior reads as real 3D by day~~ (done, v106) (parallax, daylight in through the companionway and lights), and the
   translucent panel over the companionway at night is gone (2–4 h).
2. ~~The interior true to a real Folkboat~~ (done), from the construction plan and reference photos (6–10 h).
3. ~~The cockpit to the plan~~ (done: benches as lazarettes, footwell, thwart, after shelf, winches on pedestals from Josephine's photos), with the seats and positions exported for the crew (4–6 h; takes in "the thwart, the
   cockpit's proportions and where the skipper sits", below, and reference/photos).
4. ~~Deck hardware and lines: hatch, fairleads, blocks, sheets and control lines~~ (done, v128–v134).
5. ~~The cabin lantern swings with the boat's motion~~ (done by v147: a damped pendulum on its chain driven by her roll,
   pitch and heave, its light following) (owner, "would love for that lantern to swing with the motion
   of the boat"): a pendulum on its short chain from the cabin top (render/cabinInterior.ts LANTERN), driven by the
   hull's heel, pitch and roll, its light moving with it (1–2 h).
   - **Bug: in heavy weather the lantern swings up through the cabin top** (owner, 16 November, a screenshot; bug;
     later; 1–2 h; Crew Figures, after its tiller and crew queue; earlier Boat Detail): "in heavy conditions, cabin lantern can start to swing through the deck."
     The pendulum's angle is unbounded, so a big roll swings it up past the overhead and it shows above the deck. Stop
     its swing where the lantern meets the cabin top or the bulkhead (it knocks against it and falls back), so it never
     leaves the cabin; check at 25 kt on both tacks.
6. ~~**True-to-life rigging, the owner's most important boat item**~~ (done: rigging-gear #159 and rigging-deck; the piano in the band's order, the halyard tackles, the jib sheet as Josephine has it) (12 November, from the owner's boat review; Rigging,
   after its current PRs; a big job, about 8–14 h): the blocks for the jib and main at the mast and the boom's junction,
   the Cunninghams, and the lines visible along the traveler, each led as on Josephine (the Full sail controls
   tables, reference/photos).
7. From the same review (12 November):
   - Bugs (Boat Detail; about 1–2 h): ~~a stray second toerail on the starboard side~~ (done: e744781); a half-circle see-through patch at
     the cabin's front by the mast foot (probably done: f4f9d6b, 5c467bf; to check on screen).
   - Winching (Crew Figures; 1–2 h): ~~the jib winch handle sits under the deck, beneath the winch, which passes through
     the deck~~ (done: 68d428b, 3f77d2b); and the crew winch in short pulls of at most 45°, not full circles (in PR #347).
   - Polish (Boat Detail; 2–3 h): the hatch less of a perfect square, as real hatches are (probably done: 42c298b, rounded corners); ~~the whisker pole stowed~~ (done: its real 2.85 m, on the side deck)
     farther forward on the bow; ~~cleats amidships~~ (done: 8abd529).

**Running order** (11 November, Coordinator, to keep within the 5-hour usage window: at most three build sessions at
once): running now, Deep Physics (AI tacking), Charts (the bridge towers and their wakes), Boat Detail (the
companionway redo) and Crew Figures; next as each finishes, Crew Controls and Marinas, then Bay East.

**Owner's feedback, 11 November 2026** (from screenshots at night; ranked now / next / later):

- ~~**Now — crew buttons fight auto**~~ (done, v82): "If auto is on and I click 'Hike' or anything else, Auto seems to stay
  on, and the crew doesn't stay hiked out." Picking a crew position should take the crew off auto, as the sail lines do
  (one line off auto, one tap back), and hold until changed.
- ~~**Now — the cockpit sole and companionway**~~ (done, redone by v108: open or closed in the boat editor, panelled doors, hinges and latch; bug + accuracy; 2–4 h; Boat Detail; the first try, live in v86 (PR #39), was rejected by the owner: an orange cube aft, an orange disc forward on the cabin top, the doorway misunderstood, lines across the hatch; Boat Detail rolls it back and redoes it after the usage reset): water shows through the cockpit sole, and it's
  unclear whether the companionway is open or shut. Draw it open (more true to life under way): the opening, its washboards
  or door stowed, and at night "the cabin lights shining through it" (ties in with the warm cabin light planned under
  Lights on the boats). Check from both sides on both tacks.
- ~~**Now — bow spray**~~ (done, #39: droplets lit by the scene; bug; 1–2 h): at night the spray against the bow is "white squares… they look fake and read as
  sparks, not water". Cause: square, unlit white points (render/wake.ts, PointsMaterial). Real spray is droplets and sheets
  that take the scene's light, so they go dark at night and catch only the boat's own lights.
- ~~**Now — cruise ignores the chosen origin**~~ (done: 1ace228 in #54, checked in the browser by Marinas; bug; ~1 h): owner, "there's a bug in cruise
  mode where I have an origin selected but it still starts me in the slip." When a cruise origin other than her slip is
  chosen, she must start there (sim/world.ts, the slip and docked start, near line 301). Goes with the push-off fix.
- ~~**Double-click to lash the tiller always lashes it amidships**~~ (done: fa60fd0, 99eaf29, #50; it lashes at the first press's angle) (bug; <1 h; Crew Controls after the reset, with
  its batch): owner, "double-clicking to lash the tiller doesn't work. if I double click while the tiller is selected,
  the first click registers as a release, and the second as a lash. that means the tiller always gets lashed
  amidships." Lash at the angle she held before the first click, or hold the release until the double-click window has
  passed (app.ts tiller handling). Owner, after: "maybe two-finger click? look into how games tend to solve something like
  this." Plan: lash on right-click or two-finger click (the browser's context menu suppressed over the water), which
  can't be mistaken for the release click; keep I as the key; keep double-click working by lashing at the angle from
  the first press; say so in the tiller hint. Owner: "one issue with double-click in browser is that it surfaces the
  browser menu. need to solve somehow." Over the 3D view only: no context menu, no double-click text selection, no
  double-tap zoom; menus and text selection still work on the panels. Test in Chrome, Safari and Firefox on a trackpad.
- **Done — she sailed through the Golden Gate Bridge's north tower** (bug): every bridge pier and tower base standing in
  the water is solid (NOAA's chart and OpenStreetMap; geo/shore.ts PIERS): collisions, the look-ahead, the navigator's
  routes, Rules 19 and 20; the Golden Gate and the Bay Bridge's West Span re-laid on them. Each casts a wind shadow
  downwind and a current wake downstream that turns with the tide (environment/pierWakes.ts). Tests: bridges.test.ts,
  pierWakes.test.ts. Still open: the wake's constants for long rectangular piers (C_D by side ratio, the recirculation
  length) and the bed friction c_f want primary sources (NACA TN 3038, Norberg 1993, Parnaudeau 2008 were out of reach).
- ~~**Now — a see-through seam between the keel and the hull**~~ (done, #39: the garboard lands flush in the keel's rabbet; bug; 1–2 h): "a transparent seem between the keel and the
  hull. That shouldn't be there." Seen side-on in the showroom: thin gaps let the background through along the join, from
  the forefoot aft along the garboard. On a real Folkboat the keel is faired into the hull with no gap (the planks land on
  the keel's rabbet). Check from both sides.
- ~~**Next — the thwart, the cockpit's proportions and where the skipper sits**~~ (done with P0 phase 3: the cockpit to the construction plan, the thwart a deep varnished beam with the traveler and cam cleats, the helm on the after deck; accuracy; 4–6 h; owner: "when time is
  right"): the thwart is drawn as "a horizontal plank", and "the skipper is crammed behind the thwart with the thwart in
  their lap. That's not true to life. While underway, skippers often (but not always) sit on the stern… or along the rear
  rail." From the owner's three photos (Josephine at the dock, Josephine under way looking aft, CircleSea side-on; the
  photos are in reference/photos: josephine-cockpit-at-dock.jpg, josephine-helm-on-aft-deck-underway.jpg,
  circlesea-helm-on-aft-rail-side.jpg):
  (1) the thwart is a deep wooden beam spanning the cockpit at about coaming height, with a vertical face, not a flat
  plank; the black traveler track and car with the mainsheet blocks run along its top, and the green cam cleats for the
  traveler (and the backstay ends) sit at each end where it meets the coamings;
  (2) aft of it there's real room: the helm sits on the aft deck (green non-skid, the ensign staff at the stern) with legs
  in the cockpit, or on the aft coaming, steering with the tiller extension; under way side-on, crew forward by the
  shrouds and the helm well aft on the rail;
  (3) the first photo shows how the mainsheet and traveler attach to the boom (mainsheet blocks from the car up to the
  boom).
  Use these and class sources (Nordic Folkboat construction plan, class rules) for the cockpit length, the thwart's
  position and height; the helm's places (aft deck, aft coaming) go to the crew-placement model too. Check from both
  sides on both tacks.
- ~~**Now — push off doesn't get her out of the slip**~~ (done, by v96; bug; 2–3 h; Marinas, with a test over every slip): "push off action is still not getting me far
  enough into the fairway of any marina to be able to get out of the slip. also, push off should move me forward if
  I'm at a dock that doesn't require me to be nosed in." Today (geo/marina.ts planPushOff) every berth is treated as
  bow-in: the crew walks her back until her bow is level with the finger's end, swings her and shoves, and she stops
  short of a fairway she can sail or steer out along. True to life: the crew walks her right out of the slip and into
  the fairway, pointed down it toward the exit, before stepping aboard with a shove, so she keeps steerage way; at
  an alongside or end tie (or any berth where she lies bow out) they push her off forward and out from the dock. Check
  in every marina (West Harbor, Gashouse Cove, South Beach, the Corinthian, Horseshoe Bay), with the boat's coast after
  the shove from her real mass and low-speed drag, not a set distance.
- **Done — outside the Gate, the sea dial disagreed with the water and the chart** (bug): the stations' tide predictions
  covered only the race's window; past it each held its last value, frozen at different points of their tides, so on a
  long sail the dial (its nearest station, frozen mid-flood) and the chart's arrows (others, mid-ebb) disagreed. They now
  roll on (CurrentField.cover; tests/seaDial.test.ts at the owner's spot). The swell: the dial and the water come from
  the same sea state, and 9 ft is what the model gives there on a big day with an ebb against it (0.77 of the bar
  buoy's height, steepened by the ebb). A long-period swell (14–18 s, 300–500 m long) is a slope of about 1°: the boat
  heaves about a meter and the cockpit view rises and falls with her, but the chase camera holds its height, so the
  horizon stays put. Open: (a) should the chase camera ride the swell? (owner's call); (b) the swell's reach into the
  Gate (0.77 there, 0.55 at the bridge) is an estimate: no measured ratio found (Hanes & Erikson 2013, ECSS 133, is
  paywalled; the ESA/BCDC Crissy Field comparison is on a blocked host); (c) Deep Physics: the bar buoy's total height
  includes its own wind sea (NDBC publishes the swell part, SwH, separately), and the swell's real direction is dropped
  at the Gate.
- **Next — heavy weather: how she copes in 30+ kt, and reefing for cruising only** (accuracy + feature; 8–12 h; owner:
  "not for now"): at 32 kt close-hauled under full main and jib she lay at 60°+ of heel, 0 kt, cockpit filling. Owner:
  "that boat would have sunk by now… How would an IRL skipper handle this situation? can't Folkboats handle heavy weather
  like this?" and, after: "I don't know of any Folkboats skipper on the Bay who reefs, or even has reefing capabilities…
  I've heard that Folkboats don't *need* to reef because of their heavy keel… If we introduce a reefing mode, make sure
  it's true to life, and keep it hidden in racing mode."
  What's sourced: ballast about 50% of displacement, cast-iron keel (Folkboat Year Book 2023; NFIA class rules
  2025–2028, rule 4.10); capsize screening 1.78 (keelindex.com). The NFIA rules (March 2026 update) say nothing about
  reefing either way; the UK Folkboat Association's rules (10.0) allow reef points "at the discretion of the owner" and
  ban flattening-reef zips. A self-draining cockpit is optional (NFIA 3.21) and pumping only while racing (12.40).
  Not found: the SF Bay fleet's practice in 25–30+ kt, first-hand accounts of a Folkboat in 30+ kt, how classic boats
  reefed, the AVS. So "they don't need to reef" is the owner's report of Bay practice, not yet sourced either way; to
  try next: sfbayfolkboats.org and the YRA sailing instructions, the Year Books, North Sails' Folkboat guide.
  To build:
  (1) first, the physics: with the main eased or luffing, traveler down and backstay on, what does she really do in
  30+ kt under full sail? The heel past a few degrees still needs the righting curve from the hull's offsets (see crew
  weight, above); if Bay racers sail on unreefed, she must be able to too, not lie at 60° at 0 kt;
  (2) the auto crew's heavy-air handling as Bay sailors do it (dump the main, sail on the jib, feather);
  (3) water in the cockpit and the bilge, and the bilge pump (owner, 13 November, "for later": "pumping the bilge is
  important to the physics. unpumped adds substantial weight. we may need a crew animation for this, but only if
  performance allows. also. need logic for how and when the bilge fills: rain fills it, heavy heeling can fill it,
  heavy seas and splash can fill it"; 4–6 h):
  - How the bilge fills, each from the physics:
    - rain, from the observed and forecast rainfall for the day (NWS);
    - heeling far enough to put the lee rail or cockpit coaming under;
    - green water and spray in heavy seas;
    - a wooden boat's planks weeping a little, as lapstrake hulls do.
  - Its weight (1 kg a liter) is carried low and sloshes to leeward, adding to her displacement, heel and drag.
  - Pumping: a crew member at the pump, at a sourced rate per stroke. The class rules allow pumps only while racing
    (no self-bailers; NFIA 12.40). The smart crew pump when it pays.
  - A pumping animation only if the frame budget allows; otherwise the crew member shows as busy at the pump.
  (4) reefing only in cruising, hidden in racing, and only once it's sourced how a Folkboat reefs (slab or roller, how
  many reefs, at what wind).
  Update (12 November): owner, "nobody who races Folkboats on the bay has a reef setup. races just get canceled at 23
  knots… at 23 knots everyone takes a vote on canceling. mostly bc at that speed things start breaking on boats." The
  SFBFA's site (sfbayfolkboats.org/racing, fetched 12 November) has a "Proposed High Wind Race Cancellation Protocol":
  "OA will cancel racing for the day when wind is above 25 knots"; before dockout, if the forecast is above 25 kt, the
  Race Chair with the OA decides, and tells the fleet by text. It's marked proposed; the bylaws say nothing on wind. So
  in racing: no reefing; the committee cancels in a blow, by the fleet's practice (the owner's 23 kt vote; the written
  proposal's 25 kt), signaled as the sim's committee boat does (AP or N with A), and the strategist warns ahead from
  the forecast. Racing above that isn't part of the Bay fleet's sailing. **Owner's decision: the sim cancels at 23 kt** (built: the committee calls racing off over 23 kt, AP or N over A, the
  strategist warns ahead, CXL in the logbook) (the fleet's
  practice), and **reefing is held until there's a Folkboat-specific source** (a cruiser's account or a sailmaker). For cruising: the owner expects blue-water
  Folkboats to reef; still unconfirmed. Ann Gash (solo round the world, 1975–77) reportedly used a working jib and a
  trysail in a storm, not a reefed main (a search summary of her memoir, not read); Hasler's Jester was junk-rigged
  (Folk Boat Year Book 2021, p.46). Richard Sherwood (1994, via Wikipedia): she "often carries full sail in 20–25".
- ~~**Cruising and racing: pick places on the map, change the conditions, and "Send her home"**~~ (done: a4cc101, ec76fd9, 770fddc, e87d126; item 8 above) (feature; 6–10 h
  in all): owner, "when cruising, I'd like to be able to pick my start and end locations on the map rather than in
  dropdowns. I'd also, when cruising and racing, like to be able to change the conditions without restarting the
  cruise, and in both modes I would like a 'Send her home' feature (copy TBD) that auto-sets her home slip as the
  destination. In race mode, send her home would essentially be withdrawing from the race, if actioned before race is
  complete." ~~(1) Cruise setup: tap the start and the destination on the chart, in place of the dropdowns~~ (done).
  ~~(2)~~ (done: Pause → Change the conditions…, at once) Change the conditions mid-cruise and mid-race (wind, tide, sea, the day's real data or your own), without a
  restart (2–4 h). ~~(3) "Send her home"~~ (done: the *Home* button, "Send her back to her home slip") (wording to be settled), in both modes: sets her home slip as the destination for
  the navigator or tiller pilot; before she finishes a race it retires her (scored RET under RRS A5.1 and A11) (1–3 h).
  ~~(4)~~ (done: "Move her here" on the chart) After "cast off", change where she starts without ending the cruise (owner, "once I tap 'cast off' in cruise
  mode, I'd like to be able to edit the starting location without having to end the cruise altogether"): pick a new
  start on the chart and she's moved there, the cruise and its log carrying on (1–2 h).
  Layout to the owner first.
  ~~Also in the showroom~~ (done: the showroom's Time of day and Conditions…) (later; 1–2 h, shares the conditions control with (2)): owner, "I want to be able to change the
  time of day and conditions in showroom mode. no rush on this request." Time of day (so the sun, dusk and the night
  lights can be seen on the boat) and the wind, sea and sky.
- **Later — your crew's looks and character** (the owner, 14 November 2026; Crew Figures with Crew Model; community and
  fun, after physics and racing): set each crew member's outfit when you configure them in the Yacht Club's Members tab:
  foul-weather gear, jackets, life jackets, hats and caps, sunglasses, gloves, boots, and their colors (club colors
  and burgees among them). Plus other fun attributes: hair, beards, a nickname, a favorite position aboard, a lucky
  item. Looks only, no effect on the physics; anything that would change the boat (weight, height, skill) stays where
  it is set today. In the members' own pictures and on the water.
- **Later — found along the way (12 November)** (polish/accuracy; from the building sessions):
  - From Marinas, the motor (on branch motor-thrust, c0a8b4a, no PR yet): the outboard's thrust is off her centerline (about 0.45 m out on the bracket, some 180 N·m at full
    throttle: she swings away from the motor's side until she has steerage), and prop walk in reverse; both left out for now,
    both real lessons at the dock. And sourced figures for the figure of merit (0.55), reverse (0.5) and the leg's drag.
  - From Charts, after Lime Point (#64): ~~blocky 50 m terrain cliffs along the Marin shore~~ (done: the shore fit and
    12.5 m shore patches, and from 13 Nov the Headlands' water's edge in rock, sand only on OpenStreetMap's beaches:
    no pale sand skirt under the cliffs); ~~the sand sliver southwest of Horseshoe Bay's marina~~ (done: a 64 m piece of
    the chart's land, drawn as a rock); ~~a possible spike at the west edge of the Lime Point box~~ (checked 13 Nov:
    none); still open: the tiller pilot tacks into the cove behind Lime Point on a westerly beat out of the Gate
    (AI/pilot), and Kirby Cove's beach, which OpenStreetMap doesn't map as one (drawn as rock).
  - From Crew Figures (#63): the crew's fore-and-aft stations (crewPhys) reach slightly past the real benches; fixing it
    shifts the trim calibration, so it needs its own reviewed PR.
  - From Bay East: Richmond YC and Encinal slips, BYC and Encinal racing marks, and the current in embayments without
    NOAA stations all need sources it can't reach yet (the club sites aren't allowed hosts).
- ~~**Later — aluminum spars look like white plastic**~~ (done by v147: clear-anodised extrusion, a satin mid-gray with soft
  broad highlights, checked against CircleSea's boom in strong sun; polish; 1–2 h): owner, "the aluminum on the masts and booms
  looks like white plastic, not aluminum." Anodised aluminum is a satin silver metal (physically based: fully metallic,
  fairly smooth, a faint brushed streak along the spar) that reflects the sky and the water, darkens at dusk and shows
  a long highlight down the mast. For every aluminum rig (the wooden spars stay wood). Check in daylight and at night.
- ~~**Later — the boat cards' pictures**~~ (done, v144, PR #141: the owner chose the Bay at golden hour, a physical sky
  with a low sun and rippled water reflecting it, her whole rig in frame, the pictures kept between visits; polish; 2–3 h): owner, "make the background of these models more true to life
  and less ugly af, or just show the model suspended in empty space and slowly rotating? find something beautiful to do
  here." Today (render/thumbs.ts) each boat card (name, flag, sail number) shows her on a flat blue sky over a flat blue
  sea. Options to show the owner as pictures before building: her on the real Bay water and sky at golden hour; or alone
  in soft studio light on a dark gradient, turning slowly (live on hover, still otherwise); either with her heel and sails
  set as she'd sail, and her own colors. A design change, so the owner picks.
- ~~**Chase view: see the sails clear of the dials**~~ (done: fa60fd0, 99eaf29, 01919c1, cd2932f) (polish; 1–2 h): owner, "right now in chase view the hull
  appears to be centered in frame, but I need to be able to see the sails easily. currently too much stuff (dials,
  notifs) sit on top of the sail." Frame her so the whole sail plan sits in the open middle of the screen, clear of
  the dials and messages: the hull low in frame (render/scene.ts chase camera), and the HUD kept out of the sails' area.
  May fold into a broader HUD review. Batch with: the Navigator button (owner, "move the navigator button to be next
  to the autopilot button. probably to the left of it."): in a cruise it moves from beside the map (#mapBar) to the
  bottom-left bar, just left of Autopilot (in a race the same slot is Course; ~15 min). And the Hail icon (owner, "the hail button icon is the same as the
  sound icon. let's fix that too."): a distinct icon, a hand cupped to the mouth or a sailor calling, never a speaker or
  megaphone (that reads as Sound).
- ~~**The flags: bring back the original motion, and strike the ensign in a blow**~~ (done, v126, #92) (polish + feature; 1–2 h; for
  Boat Detail): owner, "I know we dialed down the flag flapping but the new flag physics are ugly and stiff. let's bring
  back the original physics, and add an option to strike the ensign in high wind. not urgent. put the 'strike ensign'
  button with the bottom-right controls, and only during cruise mode when winds are high." Restore the flag motion from
  before it was toned down (render/boatMesh.ts flags; the earlier version is in git history). Add "Strike ensign" to
  the bottom-right cluster (#viewBar), shown only in a cruise when the wind is high (threshold to propose, about 20 kt):
  it lowers the ensign and its staff, and a second press hoists it again.
  Built (bay-east-6): the boats' flags now flap as measured flags do (render/flagWave.ts: f·L/U 0.55 and a 0.19 L
  swing, Chen et al. 2014, J. Fluids Struct. 45; the cloth's angle waves, so it doesn't stretch; hanging below 3 kt),
  livelier than either old version; the old code (8d45d94's revert) was 3–5× too slow. Follow-up: the committee boat's
  signal flags keep their restored motion (render/flags.ts, within about 2× of the physics for their 1.8 m fly); to
  move them onto flagWave.ts, SignalMast.sync needs the wind's speed passed in.
- ~~**Next — the boat's lights only when in use**~~ (done, #42: none in the slip or when switched off, Rule 25 under way, Rule 30 at anchor, the lanterns drawn only while lit; accuracy; ~1 h): "Remove the hull lights when they're not in use
  please." They're already off from sunrise to sunset (render/navLights.ts, ON()); still to do: off in the slip and tied
  up at a dock, the all-round anchor light alone at anchor or on a mooring, the sidelights and sternlight only under way
  (COLREGS/Inland Rules 25 and 30), and off when the owner switches them off. When they're off, hide the fittings too (the bow lantern, the sternlight
  and any masthead tricolour): owner, "hide the fittings". Also check whether the "big white V" at the
  bow (below) is partly the sidelights' glitter streaks on the water.
- **Now — the crew, drawn and animated as well as the boat** (partly done: e8cfc06, 84f9e2b, 597babe, d0dfa45, 407791f, 792cc3a; the rest in PRs #347 and #348) (accuracy + bug; 10–16 h; in progress: Crew Figures, screenshots to the owner partway; moved up from the unranked
  "crew figures and animation"): owner, "crew movement animations are clumsy, ugly, and distracting… we have so much
  beauty and accuracy in this game and the physics of crew movement are super cool, but the animations are complete
  garbage… we need crew drawings and animations to be commensurate with what we have for the boat." Found: (1) the crew
  move through the hull (their paths must go over the deck, coamings and thwart, never through them); (2) in auto they
  move "with a frequency that isn't true to life": a real crew moves on a puff, a lull, a tack or a job, and otherwise
  sits still, so the auto crew needs a dead band and a minimum time between moves (source it: racing coaches'
  guidance, or video of Folkboat crews); (3) in "mid" they're "sitting on an invisible chair": they need a real seat
  (the cockpit seat, the thwart, the floor, the bridge deck). Real bodies (proportions, clothing, lifejackets as in
  reference/photos), poses for each job (helm on the aft deck or aft rail per the thwart item, hiking with feet under
  the straps, sitting to leeward, at the winch, at the piano, crossing on a tack), and moves that follow the physics.
  Check from both sides on both tacks.
- ~~**Crystal clarity on the crew and trim controls**~~ (done, as item 3 above: b3124c3, v134) (polish/clarity; 4–6 h; Crew Controls, after the bottom-bar layout; merged with the trim controls review
  below): owner, "I also can't understand the buttons, even after using them for a while. how do I get them to hike on
  the lee? which buttons do what? I can't figure it out… we need crystal clarity on the button controls." The crew row
  (Lee · Mid · Up · Hike, keys 7/8 to step, crewWords.ts) needs plain words for what each place does to the boat
  (to leeward heels her in light air; hiking is always to windward, to hold her flat), which way is which on the
  current tack, and what auto is doing now. Every line's setting, too: owner, "can't tell which way is 'on' for the
  backstay. is 0% on? or 100%?" (100% is on: controls.ts, 0 off … 1 bar tight). Label each end in sailors' words
  (eased … on, or for the traveler windward … leeward) and what that end does to the sail. Layout to the owner first.
- **Next — a broader review of the trim controls** (the band done with item 3; the trim coach on branches ui/trim-coach, design/trim-coach, ui/telltale-words, no PR yet) (polish/clarity; 4–6 h; done together with the crew controls above): owner, "we need a broader review of trim
  controls, which are still confusing." A full review of the trim panel's clarity: the labels, who's in charge of each
  line, auto against yours, and the coach. The plan goes to the owner as a layout before anything is built.
- **Next — the trim coach's promise in light air** (the next coach item after the trim coach's PR; accuracy; 3–5 h;
  the Coordinator, 15 Nov 2026: lessons are in light air, so it matters for learners). Since the trim coach's promise
  fix, its top fix pays at least ¾ of what it says across 10–20 kt (tests/coach-promise.test.ts). Under 10 kt it still
  over-promises: in 7 kt, outhaul eased, it promised 1.47% and the boat paid 1.02%. In the first ~20 s of a lull the
  crew are still coming in off the rail, while the coach has them where they are, and it promises about twice what she
  gets. Find the terms the coach's speedFactor still lacks there (the crew's light-air placing, crewAndHeel below their
  best heel; clothFill), and extend the test down to 5 kt and into the lull. Also: with old sails in 20 kt and the main
  bar-tight, its fix (ease the main) pays only 62–72% of the promise; the crew's way back off their depowering steps is
  only roughly foreseen (coach.ts speedFactor). And the coach's settle lacks the sea's drag, fouling and the weight
  aboard, so in chop or on an old, heavy boat it under-promises by 1.3–2×.
- ~~**Next — the bow wave**~~ (done, #39: a ridge of sea-colored water, foam only at its crest, sized by the stem rise and Froude number; polish/accuracy; 2–3 h): looks "like a big white V rather than water", worse at night. A bow
  wave is a raised, curling ridge of water with broken foam only at its crest, lit like the rest of the sea; the Kelvin
  angle (19.5°) already used for ship wakes. Do with the spray.
- ~~**Next — instruments**~~ (done, v83: wind speed the big number on the wind dial, the tide (Flood/Ebb/Slack) on the sea dial, the point of sail under the windex): the TWD dial's big number should be **wind speed** ("I already have the windex
  for" the angle); the **Sea** dial's big number should be the **tide** (keep the chop/swell subtext, which they like);
  the **windex** dial's subtext should add the **point of sail**.
- ~~**Next — the buttons at bottom-left**~~ (done, v87; polish; 3–5 h; Crew Controls; owner's decisions on the layout: as proposed, but Lash tiller goes into the tiller control itself (e.g. a double-click), not a button of its own; Hail stays a button; an icon with a short word under each; "Trim · crew" moves into the trim panel's header in plain words; the Main and Jib rows get the crew row's Auto pill): "starting to overload". They mix trim, navigation, pausing and
  more, and one isn't a button at all. Audit them, move the ones that don't belong to where they fit, and make the rest
  "smaller iconographic buttons". Show the owner the proposed layout before building (a design change).

**Deep physics pass: the audit** (Deep Physics session, November 2026; six independent reviews of the sails, hull and
appendages, waves, wind and puffs, crew and balance, and the AI, with sources). Where the sim disagrees with published
data, ranked by how much it changes what a sailor feels or a race result. Each fix gets a test against its source.
1. ~~**Feathering cost 10–16× ORC's pinching curve**~~ (done): the sails flogged by the angle below the polar's beat
   angle, on top of the polar's own pinch, so 1–2° low cost 1.6–3.5% of VMG at 20 kt (ORC: 0.1–0.3%), teaching "never
   feather". Now they flog as far as they luff (trim.ts), and below the beat by the square of the angle below it (flat
   at the beat, so ORC's optimum stays: 1–2° low costs 0.2–0.6%; ten degrees high still a big loss; she stops in the
   no-go zone). The polar's pinch curve itself is unmeasured: it should come from the sails' forces once 9 is done. And
   the crew's deliberate ease of the main on the last depowering steps (up to 7°, half luffing) flogs at no cost, in the
   speed search and on the water alike: price it in the search, then judge the main where it is.
   **The flogging main's drag: no measurement; revisit if a source or an on-the-water observation turns up** (the
   owner, 15 Nov 2026: paused). As it is (dynamics.ts flogCdA, 0.12 on the cloth): close-hauled with the jib drawing and
   the main let right off, she slows from 5.4 kn to 1.8 kn in 30 s in 18 kt and stops inside two minutes; in 10 kt she is
   down to 0.9 kn. At 0.05 she would keep 1.0 kn and 1.4 kn. Flags give 0.05 before they flutter and 0.15 to 0.35
   fluttering; ORC's zero-lift main is 0.03 to 0.04. Until then the crew's ease in a puff must not go past the luff.
2. ~~**No tactical wind shifts on most days.**~~ (done: environment/shifts.ts, fitted to FTPC1's record by kind of day and
   strength, counted from when the course is laid, carried down the course; later: the lateral coherence (the sides of
   the course) from two stations' records rather than assumed; the HUD's lift/header readout and the rules' wind (Overlap,
   Rule 18's beat) still use the course-center wind, not the boat's; shifts quicker than ~12 min aren't resolved by
   6-minute samples) Off observed days the only shifts are two fixed sine waves (120 s ±6°,
   41 s ±2.5°, unsourced) and a 63 s ±8% pulse: about 1° rms change over 30–60 min, against Fort Point's 13–14° on
   10–15 kt westerlies (6-minute record, 492 days, racing hours) and 26–29° on 6–10 kt days. Beats are drag races; a
   fixed period can be timed. Fix: a seeded, broadband shift process fitted to FTPC1's structure function by kind of day
   and strength.
3. ~~**Shifts hit every boat at once.**~~ (done, but on a past day the record's shifts are still course-wide) Carried down the course with the wind (Taylor's frozen turbulence), the boat 300 m
   to windward gets a header about a minute before the one to leeward, and one side of the course gets a lift first.
   And on observed days the station's own 6-minute turbulence (about 5–6° of it) becomes a course-wide shift: smooth
   the record and hand the residue to the local turbulence (4).
4. ~~**Almost no gusts**~~ (done: environment/gusts.ts, open-water turbulence from the log law and Charnock's roughness,
   IEC 61400-1's scales, the puffs keeping the minutes; in a race at 12–18 kt a 5-s gust factor of 1.24–1.28 at a fixed
   point; light-air gusts in knots; later: more turbulence downwind of land (off the Cityfront), the light-air floor from a
   sourced convective or stable scaling, the crests' lie turning with the wind) **and the gusts' peaks** (the item from the strategist's review): open water at 6 kt and up should
   not reach the records' 2–5× peaks: those are almost all below 6 kt mean (a third of 6-minute windows at 4–6 kt reach
   2×; none above 12 kt) and the station's off-land turbulence (TI ≈ 0.22). Open water: TI ≈ 0.09–0.12, a 5-s gust over
   the 2-min mean of 1.15–1.27 at 10–15 kt (WMO TD-1555, Harper et al. 2010). The sim's puffs give TI ≈ 0.03 and gust
   factor 1.10, so heel and helm feel steady in a breeze. Light-air gusts are sized as a share of the mean, so they
   vanish as it dies (the record: +1.5–4 kt at 2–6 kt); puffs die before they cross the course (60–210 s); one gustiness
   everywhere (off the Cityfront it should be about twice the slot's).
4a. ~~**The AI's tacks aren't held**~~ (done: a tack or jibe she decides on is held until she's round; the rhumb-line test by
   her close-hauled course; clear of the whole committee boat) (AI 1; src/ai): the tack decision is made afresh every step (the rhumb-line test
   uses her heading, which crosses the course axis mid-tack; the header tack is a fresh random draw each step), so
   boats sit head to wind or wheel round and run off for a minute: beats 448–909 s against 337 s at polar VMG, and the
   last boat 63% behind the winner where the real SF fleet's median is 12% (sf-folkboat-results.json). Holding the
   decision (as autopilot.ts does) gives beats of 349–428 s and a 12% spread. Probably the strategist's "planned at
   38 min, the AI took 47–71". And (AI 2) AI boats hit the committee boat (avoidMarks steers clear of its windward end
   only) and some never start.
4b. **The AI sails at the mark** (AI 3, 4, 8, 9; done: the crab for the current reaching, the run angle and jibing on the
   laylines downwind, headers from her own wind held 10 s; to do: the planner's 8 s a tack; and the AI fouls at the
   windward mark: 3–7 two-turn penalties among five boats in a 620 m race, the base code as much: mark-room and
   right-of-way handling there): no allowance for a cross-current reaching (1.5 kt costs 5%, 2 kt 15%:
   she ends up running), no run angle or jibing on the laylines downwind (2–6% VMG in 6–12 kt, and 3–14 jibes on a
   620 m run as the wind swings through dead downwind), headers judged from the course-wide wind rather than her own,
   and the planner charges 8 s a tack where the physics' own tack costs 3.4–5 s (0.8–1.2 boat lengths, the low end of
   US Sailing's 1–2 for keelboats).
5. **The waves move her only on average** (waves 1): a mean added drag and a synthetic yaw; no surge, roll, pitch or
   heave, so no hobby-horsing in the Bay's 2–3 s chop (her pitch period), no rolling on a reach, no surfing, and the
   telltales don't answer the pitching. The drawn hull rolls on the waves the physics doesn't have, so heel, sails and
   flags don't answer the same motion. Needs the wave field shared by the physics and render/waves.ts (render's owners).
6. ~~**The swell's yaw is wrong in kind**~~ (done: a slender hull's Froude–Krylov moment) (seaway.ts waveYaw): it doesn't fall with wavelength (a slender hull's
   Froude–Krylov yaw goes as k²), and peaks abeam not on the quarter: up to 16° heading swings and 3% speed lost in a
   2 m 13 s swell outside the Gate, where it should be next to nothing.
7. ~~**No leeway**~~ (done, owner's yes) (hull 1): she slides along her heading. At speed the polar's VMG is right (its angles are course
   angles), but slow she should slip: 0.3–0.7 kt to leeward at 1.5 kt close-hauled in 12 kt, so a boat parked on the
   line sags onto the one below her and each tack costs 0.2–0.4 boat lengths more. Now: the sails' side force against
   the keel's lift (slender wing, Newman §5.12) and the hull's broadside drag, as a sideways motion; close-hauled 2.9°,
   4.3° and 6.0° in 6, 12 and 20 kt; slow, 0.36 kt at 1.5 kt in 12 kt. The polar's speed is her course's; the sails
   are trimmed and their forces read in the wind across her course (turned from her heading by her steady leeway), the
   frame the sail model was calibrated in before leeway: a calibration choice, not shown from ORC's documentation (its
   VPP PDF isn't reachable from here). A real windex reads her leeway less; recalibrating trim.ts's angles (the jib's
   8° sheeting limit and 18° angle of attack, both unsourced) in the hull's frame belongs with item 9. She, the AI and
   Nav steer her leeway above the beat. The compass's "tack" marker and its mean close-hauled
   heading allow for it too (ui/hud.ts); the laylines are right as they are (her track). Hove to in 8 kt is a knife edge (a few % more speed going
   in and she rounds up and tacks; it was before leeway too).
8. ~~**Too much push from rest and through a tack**~~ (done: the drive's shape from the sail model, driveCurve.ts; 1 kt → 90% close-hauled in 6 kt now 50 s; the Delft resistance, below, still to do) (hull 2): driveBoost ×1.6 everywhere; ORC's own sail model gives
   0.7–0.8 of the full-speed drive close-hauled at rest (more only from 120°). 1 kt to 90% close-hauled in 6 kt takes
   32 s, the force model 45 s. And the upright hull's resistance at 3–5 kt is 24–37% above the Delft series (hull 4).
   ~~The AI's slow tack on a hail~~ (done, branch ai-hail-tack: a hailed boat that puts her helm down at once had been
   called in breach for not reaching head to wind in 5 s, and then fell back onto her old tack; starting to tack is now
   her response under 20.2(c), and a slow AI boat tacks through rather than jibing round). The Delft resistance is
   blocked by data: the Folkboat's hull form (waterline beam, canoe-body draft, Cp, Cm, LCB, LCF) isn't published in
   any source found, and the DSYHS coefficients only in a secondary source (a 2022–23 ULiège thesis reproducing
   Keuning & Sonnenberg 1999). It needs the class lines plan and offsets (NFIA Plan 1, 1961).
9. **Sail shape and speed** (sails 2, 6): ~~speed went as the square root of drive~~ (done, branch sail-shape: a share of
   the drive is now worth what it is where it meets the hull's resistance, with the sails' drive changing with her speed:
   dynamics.ts speedForDrive. The effective exponent runs from about 2 in 6 kt to 4.7 near hull speed in 20 kt, so a 20%
   loss of drive costs 4–6% of speed in a breeze, not 11%; the step, the crew's depowering search, the coach and the
   debrief all count it the same way). RIG.fullDepth: kept. ORC's own text (VPP Documentation 2022, §5 and after eq.
   5.48) makes flat = 1 the maximum lift, and its maximum lift the sail at its fullest ("the inability to increase sail
   camber in light airs" is why a simple rig has less), so full power at the light-air depth is ORC's reading, not an
   error (the depth itself, 0.145/0.141, is still unsourced: no camber figure for a Folkboat, or ORC's flat against
   camber, was found). ORC's least flat is 0.42 since 2023 (VPP Documentation 2023, §5: "reduced to 0.42 from 0.62"),
   as the sim's flatOf has it.
10. **In irons** (hull 3): ~~at rest she turns 4°/s the way the tiller points and sails off~~ (done, branch in-irons:
   with her sails up she gathers sternway, the rudder works backwards by its flow, and the 4°/s at a crawl is sculling,
   only as RRS 42.3(d) and World Sailing's interpretations allow: from above close-hauled to either tack's close-hauled
   course, not back against itself, not against a backed jib; backing the jib keeps her sternway). ~~No yaw inertia~~
   (done, branch yaw-inertia: her turn answers the helm with the hove-to model's own time constant, 0.6 s at 4.7 kt,
   2.8 s at 1 kt). Open, unsourced either way: sternway in a breeze (2.2 m/s in 22 kt, 2.7 in 28, on the ahead
   resistance curve going astern: a transom-first hull may drag more); held amidships head to wind she never sheers
   off; in 6 kt held head to wind she makes a little headway as she rolls from side to side (the roll's sweep).
11. **The chop** (waves 3–6): ~~it follows the wind at the boat, so a puff or a neighbor's lee changes her sea~~ (done:
   the wind over the water); ~~it's fully grown at once~~ (done) (CEM: 3.4 h to fetch-limited on the Berkeley Circle
   in 18 kt, so 2.5× too big an hour into the breeze); ORC's polar already has a seaway drag in it (eq. 3.2, D_raw), so
   the chop is partly counted twice and "flat water" isn't flat (est. 1–3% upwind); and its added drag falls off too
   little toward the beam, so footing hardly pays.
12. **Heel** (sails 3, crew 3, hull 6, 9): 21–25° upwind from 18 kt is the high end of practice (no Folkboat figure is
   published; Elvstrøm's H-boat guide 6–10°, general keelboat guidance 15–20°, 20–25° at most) and is set by heelFactor's
   unsourced knee at 20°. Fixes: the Delft series' heeled resistance; the deck edge from the class freeboard (0.568 m:
   about 27.5°, not 30°); the effective draft from the Delft series by heel and speed (the speed search's induced drag
   is about 1.5× Delft's, the hove-to model's about right).
13. **Pointing and the top of the range** (sails 4, 5, 7): a flatter sail can't point higher (luffing starts at a fixed
   angle of attack whatever the camber), so the guide's "sheet tight … pointing ability is improved" has no effect;
   above about 26 kt nothing is left to depower (ORC next reduces the jib, then reefs: VPP 2022 §5.1.3), and ORC's
   flattest is 0.62 × the 8-kt flat in the 2022 documentation against the sim's 0.42 (the 2025 text unconfirmed).
14. Smaller: in chop the best beat narrows by 0.2–0.4° where the comment says footing pays (the added drag rises
   with speed and the acceleration boost is used as a steady drive: AI 6); the leeward-mark round-up loses a third of
   her speed in 18 kt (unsourced); the results file's 2025-11-01 distance looks wrong (7.8 kt over 6.1 nm in 7 kt);
   the rudder (class rules' offsets give about 0.56 m² below the waterline against RUDDER.area 0.42; its drag's
   aspect 1.4 against the lift slope's 2.5; a keel-hung blade works partly as a flap); HOVE.latArea 5.01 m² and dragAft
   0.54 m from the drawn profile without the rudder (not 3.39 m² and a tuned 0.3); the crew (DEFAULT_CREW 230 kg against
   the certificates' declared 240–308, mean 276; the light-air heel target steps at 7 kt; legs over the side on a reach,
   which CR 13.20 allows); the sails' weight aloft (negligible, −1.8% GM); crewSolve's start dependence; the twist
   function against VPP 2022 eq. 5.49; the chop's peak period (SPM against CEM, 25% apart); added masses.
15. ~~The keel's induced drag fell with heel~~ (done): ORC's FH is the force normal to the center plane (VPP 2022 §3),
   not its part across the water, so heel was nearly free to the speed search (about 2° less heel at 18–20 kt now).
   ~~The ×0.6 on heel past 120° TWA~~ (done: no source; the heel follows the balance of moments everywhere).
Checked and sound: the hiking geometry against CR 13.20 (only mid-thigh to feet must stay inboard), the roll period
(3.5 s, Klaka) and its damping, the wind gradient (ORC eq. 7.1) and heeled triangle, the sea's growth laws, wave–current
physics, whitecaps, Kelvin wakes, fatigue, the tiller pilot, the condition model, determinism.

**Depowering: the physics against the sailmaker** (owner, November 2026: "crew follows the guide for now, but let's keep
this on the roadmap as something to investigate"; 4–8 h). With ORC's sail and keel physics, a speed search like ORC's
VPP (physics.ts powerFactor) has a Folkboat carry full power to about 17–18 kt; North Sails' Nordic Folkboat guide has
the outhaul on its band above 12 kt, the Cunningham hard above 15 and the traveler eased down above 14. Fitting the
heeled hull's drag to close the gap needs an impossible value (19% of her speed at 16° of heel), so the crew follows
the guide's line settings and the search decides only the depowering past them. Candidates: ORC's own flat and twist
optimum for a low-stability boat (does ORC's VPP itself flatten a Folkboat at 14 kt?); pointing, which the guide's
settings may serve and the sim's fixed polar beat angle can't reward (a flatter sail points higher: VMG, not speed); the
heeled hull's drag from a real lines plan; the shape model's depth and twist ranges against measured sail shapes.
Open, the rig's height datum (November 2026, the Coordinator: keep the physics on the ORC certificates; settle if the
IMS rule text becomes reachable): the drawing measures the rig from the deck at the mast, as CR 6.1.11 does (the Lower
Mast Point 1000 mm above the deck, along the mast's after side); the physics (balance.ts RIG) uses ORC's BAS 1.00 and
IG 6.50, which ORC measures from the sheer at the mast (VPP Documentation 2026: HBI, "height of sheer at the base of
I"). The deck's camber there is about 4.5 cm, so a class-legal Folkboat's band would be about 1.045 m above the sheer
while the certificates say 1.00: one of them is nominal. If the class rule governs, the sails' heights rise 4.5 cm
(about 0.9% less induced drag, 0.9% more heeling arm). The IMS definition of the mast datum point would settle it
(orc2.orc.org and osiris.ffvoile.fr were blocked from the sessions).

Open items from the physics review (November 2026): the sails' "full" depth (balance.ts RIG.fullDepth) is unsourced, so
ORC's full-power lift is never reached above about 10 kt (this partly hides the gap above); ORC's default crew for
the sailing displacement is about 300–330 kg against the sim's 240 (GM 0.50 rather than 0.52); the sails' own weight
aloft is left out (ORC eq. 4.9); the hove-to force model's keel is a slender wing (Te² = 2T²) while the speed search
uses ORC's effective draft; the crew's line planner (controls.ts crewSolve) is a local search, so two boats can settle
on different but equally good settings. Speed (November 2026, the same race five times, median µs per world step,
fleet of 5): the training course 461 against main's 420 (+10%), Seaweed Soup 444 against 422 (+5%), down from +40% and
+18% (the hull's resistance tabled, the heel solve warm-started, the depowering search cached and simpler, no per-step
allocations in the puffs and the crew). What's left is spread thin: the crew's per-step placement and jobs, the heel
solve, and the search's first look at a new wind (it fills in over a race). (Since: the performance review below.)
Also found on the way: the outhaul's range was five points of camber, past what its black band allows (now about 1.5,
the guide's range), and the mainsheet's hold on the leech is now from its geometry (the slant from the boom end to the
car, an estimate between the end points).

~~**Performance review**~~ (owner, November 2026: no lag or crashes as the sim grows; done, v78). **The budget**: a steady
60 fps on a typical laptop in a full race (eight boats, ships, wildlife, the chart): a frame's JS (the sim's steps, the
scene's update, labels, HUD and maps) within about 8 ms of the 16.7, and the sim's steps within 3 ms of that at 4×
speed; at most 2,000 draw calls and 2 million triangles in any view, day or night; the page up in under a few seconds;
GPU memory and the JS heap level from race to race (no climb over a long session); the page well under the 16 MB
limit (3.5 MB). **Measured** (headless Chromium with software GL in this container: draw calls and triangles are what
a real GPU gets, frame JS here is about 3× a laptop's; the sim in Node), before → after:
- The sim (median µs per step, fleet of eight on course 10 in 22 kt, Node): the whole race 534 → 354 (−34%), its start
  450 → 349; the training course with five 289 → 216, Seaweed Soup course 2 with three 152 → 113. Every race the same
  to the last bit (full-precision state after each race compared with main's). From `shoreNearest` (an exact list of
  the segments that can be nearest anywhere in each 25 m cell, in place of the ring search: it was a third of a step),
  the chop's added resistance and the drive worked out once per speed search, not 30 times, and the clock's
  `Intl.DateTimeFormat` made once.
- Memory: every new race (and every change in the setup, which builds one) left the last fleet's geometry, materials
  and sail textures on the GPU, about 1,350 geometries and 45 textures a race; now freed (render/dispose.ts), and the
  counts stay level race after race. Ships hidden when traffic is off (the last race's had stayed where they were).
- Draw calls (full fleet, before → after): at the start in the chase view 1,780 → 1,740, overhead zoomed out
  2,020 → 1,160, night at the East Span 2,300 → 1,640, night from the start line 1,990 → 1,120. Each boat is about 180
  draw calls; her fittings smaller than half a meter are left out while they'd cover less than a pixel (render/fittings.ts),
  which changes nothing you can see. Triangles 1.0–1.3 million everywhere.
- Frame JS (here, chase view at the start): about 31 → 21 ms (≈ 7 ms on a laptop): the wind map on the water no longer
  works out the shore distance it threw away (25,600 points every 0.15 s), the wave height's directions' sin and cos
  kept (the wakes ask it 5,000 times a frame).
- Nightfall: the city's and the bridge's lights and the sun's shadows going off needed about 50 new shaders compiled in
  the frame night fell (0.6 s here); now compiled in the background at the start of each race (scene.ts warmShaders).
  What's left is a 0.2 s frame here (first upload of the night lights' buffers): a frame or two on a laptop, once.
- Page load (the published page): about 1.8 s to the start page here, 0.65 s for its first frame; a race starts in 0.2 s.
- Kept from creeping back: tests/perf.test.ts (the sim's µs per step for the full fleet against a fixed reference
  workload, so it holds on any machine; in `npm test`, not `test:fast`) and scripts/check/perf.cjs (draw calls, triangles,
  programs and frame JS for seven views, and GPU memory over six races; exits 1 over budget). The ` key shows the
  frame time, draw calls and memory on a real machine (ui/perfMeter.ts).
Left for later: the boats are still most of the draw calls (eight boats ≈ 1,450 near the start); merging each boat's
fixed parts by material would save about 50 a boat (exact, but it works against the pixel test above). The scene's
JS is now three.js's own draw submission (proportional to the draw calls), the wakes and the boats' sails. The sim's
step is spread thin: the AI's look-ahead, the crew, the tide field's blending of its stations.

Then, unranked: ~~start screens~~ (done: Race → create a race or run a past race; one-screen setups with the day's real conditions beside your choices; Settings); deep physics pass (begun, November 2026: stability from ORC certificates, the sails' forces from ORC's model, the
wind's gradient and the heeled wind triangle, the keel's induced drag, depowering by a VPP-style speed search; still to
do: the audit's ranked list above (the depowering question, waves and puffs in every response, the gusts' peaks
against the records among them); in progress: Deep Physics); skipper and crew model (15–25 h); cheating, protests
and hearings (8–12 h); validation against real fleets (4–6 h); rig tuning (5–8 h); seasons and awards (6–10 h); the Bay
in depth (~~done~~, published); crew figures and animation (moved up to now, above); ~~NOAA charts on the map~~ (done); the Bay to Berkeley, Alameda
and Richmond (10–16 h); ~~Gashouse Cove, South Beach and Corinthian marinas~~ (done); Sam's (3–5 h); accounts for other
players (3–6 h); ~~AI leeward starts and generic AI boats~~ (done); real slip numbers and nicer moored boats (4–6 h); real
past races (8–12 h); ~~accuracy fixes: the GGYC/StFYC line, the Cityfront shore from OSM, Rule 20 at the islands~~ (done);
phone layout (on hold, 8–12 h).

Checked: RRS 52 and the ERS rudder definition (primary sources), and the ST2000+'s 4,500 kg rating (Raymarine). Still
unconfirmed: the ST2000+'s hard-over time (now 4.5 s, from secondary sources), its AutoTack default (100°) and AutoTrim;
the handbook (Raymarine document 81130) wasn't reachable.

## The owner's list (November 2026, to prioritize)

~~The full-screen chart and a tiller pilot~~ (done; the ST2000+'s AutoTack and AutoTrim still unconfirmed).
Then the skipper/crew model (calibration data first; Yacht Club sliders; crew skill driving trim, pole and puff calls; AI
skippers acting on what they believe; cheating, protests and hearings).

**The Yacht Club** (owner's direction, 12 November; Crew Model and Skipper Model are drafting a joint design): the Yacht
Club is the place where crew members are created, configured and assigned to boats, and where the owner sees and
creates the other skippers and their details. The race setup shows the boat's assigned crew, swappable there, but isn't
where crew are configured. It's the home of the skipper and crew model's sliders above, and later of Seasons' rankings
and awards (below), which become attributes of the winning boat and skipper.
Trophies (owner, 13 November): use the fleet's real perpetuals where they're found (docs/TRADITIONS.md: the Contender's
Cup, the San Francisco International Cup, and, unconfirmed, the Rick Wolf trophy for the Wednesday series). Elsewhere use
placeholder names, marked as placeholders in the code (and the doc) so they're never shown as a real trophy's history.
After each race, the club's evening at the race's level: drinks; drinks and dinner; drinks, dinner and results; drinks,
dinner, results and awards (owner). The Plastic Classic's committee-boat mark, when it's built (TRADITIONS item 14), as in real life (owner, 13 November:
"this is a true to life sim"): its crew of adult women flash the fleet as boats round, topless only, nothing sexual,
in the crew figures' stylized style. Shown blurred (owner: "just blur the titties"); no mature-content setting. Before any public release, the host
club's permission covers it.

Also asked for:

- **The called turn's effect on the crew** (owner, 15 Nov): experienced crews mostly anticipate a tack or jibe; a novice crew needs the call to move in time and clear the boom. The call (Space) speeds the crew's reaction by skill; an uncalled jibe with a novice crew risks the boom and a slow sheet. Crew Model designs first, owner OKs.
- **Sound, as one holistic effort** (owner, 15 Nov: "much later"): spoken or sounded hails ("Ready about", "Tacking!", "Jibe-ho!"), with the boat's and the Bay's sounds. Not before the physics and racing are dialed in.
- ~~**Rig tuning:** mast rake, shroud tension, pre-bend from the mast heel, forestay sag; each in the physics.~~ Done (built and live, the owner, 18 Nov): the rig tunes in the boat editor and the coach's rig line (tests/rigtune).
  - **Turnbuckle guidance in the trim coach** (owner, 19 November; feature; next, after the sprint; Rigging; 2–3 h): "turnbuckle guidance should appear in trim coach overlay". The coach's rig line (boat/coach.ts ~L679) says "Backstay on hard/off" but never the shrouds' or jumpers' turns. Add one short line from TUNE_PRESETS (boat/rigTune.ts) for the current wind band, e.g. shrouds 1½ turns, jumpers 2–3; no copy block.
  - **The boom's place on a beat** (next for Deep Physics, after the beat angle in chop; Deep Physics, 15 Nov): the main's working angle (trim.ts SAILS.main.aoa 22°) holds the boom 6–8° out at 6–12 kt, where North's guides center it (about 200 mm to leeward under 6 kt). So the model wants the traveler car down where sailors keep it in the middle or to windward. Fix it with the weather-helm and rake recalibration (#345), since the angle feeds helmNeeded and the polar.
- **A race strategist** in the course view before each race, there to teach, not to win the game for you: the day's
  conditions and how they'll change, the favored side and course options (one plan, or several when it's uncertain), the
  competition, and trim and tuning by phase ("it starts light, so…; it'll build late, so watch…"), with specifics.
- **A navigator** in cruising, doing the same for the route: timeliness and safety (current gates, the slot, shipping lanes).
- **Easier sail controls:** bigger targets; adjusting one line takes only that line off auto, and it's easy to put it
  back. Longer term: working the lines on the boat itself.
- ~~**Crew weight in the physics:** the low side in light air, hiking in a breeze, body-tacking, moving forward downwind; the AI
  crew doing it by skill; the boat answering every shift; an option to move the crew yourself.~~ (done)
- ~~**Real timing and sequencing of adjustments:** cars rarely moved (it takes time, means leaving the cockpit, which moves
  weight, and the working car usually can't be moved under load); the order and pace of every adjustment set by the number
  of crew and their skill.~~ (done)
- **A deep pass on sail and boat physics:** every crew move, wave, puff and line adjustment makes a response, from real
  science and maths.
- ~~**Cleaner start screens.**~~ (done) Race: create a race (club sponsor, course or the committee's choice, competitors, your crew,
  start time; the real conditions for that day and time by default, overridable) or run a past race. Cruise: likewise
  pared back. First an audit of every start-state screen for redundancy and friction.
- **Seasons** from real events (the Midwinters…), with rankings and awards that become attributes of the winning boat and skipper (shown in the Yacht Club, above).
- ~~**The Bay, in depth:**~~ (done: Fort Point, the Bay Bridge's west span, Angel Island, Coit and Salesforce, puffs, waves, wildlife; the wildlife remade from the species by v147, #143: gulls, pelicans, cormorants, seals, porpoises and Pier 39's
  sea lions). bridges that reach the shore, Angel Island without the odd houses, a true Coit Tower, the
  Salesforce Tower; puffs you can see on the water; natural waves; seals, porpoises and birds that look and move right.
- ~~**The Bay Bridge and the city at night**~~ (done, v69: the West and East Spans, The Bay Lights' patterns dusk to dawn (their current hours unconfirmed), the skyline lit, reflections; pier positions approximate until overpass-api.de is reachable; the overlit skyline fixed in v79: lit windows follow the DOE reference buildings' lighting schedules, offices 50% at 19:00, 10% by 22:30, 5% on weekend nights, clustered by floor. more far glow on the towers on weekend nights in v80 (owner's call); the homes' peak lit share stays at 0.3) (owner, November 2026; 6–10 h): a high-quality Bay Bridge (the West Span's
  suspension towers, cables and anchorage at Yerba Buena Island, the East Span's single tower), with **The Bay Lights**,
  the LED sculpture on the West Span's vertical cables, in its real patterns after dark; and the downtown skyline lit at
  night (windows, the Salesforce Tower's crown, Coit Tower floodlit). The sun and sky are already real for the race day
  and time, so the lights come on at real dusk. Sources: Caltrans and OSM for the bridge's geometry; the Bay Lights' own
  published specifications for its LEDs and patterns.
- ~~**Lights on the boats at night**~~ (done, v69: sidelights and sternlight or a masthead tricolour, by the Rule 25 arcs; the rule text couldn't be fetched here, so arcs and ranges are flagged in src/render/navLights.ts for checking) (owner, November 2026: "make them beautiful"; 4–6 h): the real navigation lights for a
  sailing vessel under 20 m (Inland/International Rules 25): red and green sidelights over 112.5° each, the white
  sternlight over 135°, or the masthead tricolour as an option under sail; the steaming light when motoring and the
  all-round white anchor light at anchor or on a mooring. Their sectors exact, so you can read another boat's heading
  and right of way from her lights, as the rules intend (and the IRPCAS teaching uses it). Beautiful as well as right:
  soft glow and bloom, their reflections trembling on the water, warm cabin light through the ports, the compass lit,
  a red cockpit light, and the moored and anchored boats' lights round the harbors.
- **Crew figures and animation:** natural bodies and positions, moving as the physics moves them and as they work the lines.
- ~~**More marinas:** Gashouse Cove, South Beach, Corinthian (Tiburon) to start.~~ (done)
- **Sam's, Sausalito:** dock at Sam's (and have a beer).
- **Save or discard** after each race or cruise: asked when it ends, before it goes in the logbook.
- **Heaving to, and the other seamanship maneuvers** (a real-world stress test the sim fails today): each jib sheet on
  its own, so the jib can be backed to windward; the tiller lashed at a set angle; the physics of a hove-to boat (backed
  jib against a feathered main and the rudder, fore-reaching slowly and drifting to leeward) checked against real boats.
- **Real nautical charts on the map:** NOAA's official charts (the US nautical charts are NOAA's; USGS makes land maps):
  chart 18649 (Entrance to San Francisco Bay) and its neighbors, as raster tiles or drawn from the ENC vector data
  (depths, channels, buoys, lights, restricted areas), on the inset map and the full-screen chart.
- **Map layers and contrast** (requested): ~~layers on the inset map and the chart (wind, current, sea state, fog from
  real visibility only, ships, laylines, wind shadows), saved per player; the sim's overlays in colors the chart
  doesn't use, on halos~~ (done). Next: **fog in the 3D scene and on the water** from the same real visibility (today
  the 3D fog bank is an estimate by month and hour), and **its effect on sailing**: you can't see marks, boats or ships
  beyond the visibility, so no transits, laylines by eye or sighting the next mark; ships sound their fog signals (and
  the bridge's and the lighthouses' horns, with their real characteristics from the chart); the AI navigates by
  compass and chart in it. Observed visibility comes from one sensor (Pier 17, 7 km inside the Gate): the Gate's own
  fog can differ.
- **The Bay to Berkeley, Alameda and Richmond:** the shores, harbors and marks east and north, with the wind and current
  fields extended over them (NOAA current stations and the NWS grid already reach there). In progress (Bay East):
  ~~the world east to Oakland and Alameda and north past Richmond to the Brothers (terrain, land from NOAA's chart, the
  chart and inset map), the currents (75 NOAA stations, every one within 0.04 kt of NOAA's predictions) and the NWS grid
  over the new water, every shore slowing the wind and easing the stream, the East Bay's and Richmond's marks, the
  Richmond–San Rafael Bridge, the Brothers, the Berkeley Pier and Long Wharf (solid), the Port's cranes, the Bay
  Bridge's East Span on its real line, the Berkeley Marina, Richmond YC's Brickyard Cove and Encinal YC as harbors you
  can sail into, docks and breakwaters solid, and a berth at BYC's guest dock, inside a basin that takes in the water
  within the breakwaters~~ (done). Next: their slips (only a few fingers are mapped in OSM: Berkeley's
  B–E are combs, F–O lines; the other harbors' dock letters and slip numbers aren't published where we could reach;
  berkeleyyc.org, richmondyc.org, encinal.org need allowing), BYC's guest dock, and Ballena Bay (no marina outline in OSM). ~~The Estuary's other harbors as water to sail into: Oakland YC, Marina
  Village, Fortmann, Grand Marina, Alameda Marina (Island YC)~~ (done, no berths). Polish: the narrow basins (Marina
  Village's) are only partly cut out of the 50 m terrain, so from the air a few docks seem to stand on land. Polish: the land's 50 m cells make a
  stair-step coast from the air (the Berkeley and Emeryville shores); the terrain stops at the world's edge (122.1886 W since San Leandro Bay was added,
  37.985 N), so from high up the hills east of Berkeley and Oakland end in a straight cut.
  Open questions from review: ~~Richardson Bay's current~~ (done: NOAA's 2012 ADCP record there, SFB1219, fitted by the
  sim, peak about 0.4–0.8 kt against Raccoon Strait's 2–3 kt); ~~San Rafael Bay's current~~ (done: a dead end, so by continuity: Point
  San Quentin's tide, NOAA 9414873 from San Francisco's constants by NOAA's offsets, fills and empties the water beyond
  each line across the bay, NOAA chart depths; peak about 0.1–0.3 kt over the open bay against 1.7 kt at the mouth,
  handed over across the first kilometer, but up to about 1.5 kt in the creek channel off San Rafael around spring low
  water, when the flats beyond it (their drying heights from the chart) drain through it; USGS's San Pablo Bay speed-against-depth relation was tried first and rejected in review,
  as San Pablo Bay's shoals sit beside a channel carrying the whole North Bay's tide while San Rafael Bay has nothing
  behind it); ~~San
  Leandro Bay's current~~ (done, bay-east-8: the world taken 2 km further east, to 122.1886 W, and the bay filled
  by continuity like San Rafael Bay, San Leandro Channel's tide, NOAA 9414724, less the Tidal Canal's measured flow,
  NOAA's SFB1216 fitted depth-averaged over its section by Manning; the chart's drying flats now wetted through their
  own bands (DRVAL1 to DRVAL2: they had sat near high water, in San Rafael Bay too); the canal carries much of the
  fill, the San Leandro Channel the rest, never against the slope (about 0.5 kt peak at its mouth); left out: the
  bay's water south of the world's edge (toward Oakland Airport) and its marsh, so the fill is a little short, and the
  canal's jet into the bay, handed over to the bay's own stream within 500 m of the canal's mouth; over the flats the
  stream is held to a long wave's speed in its depth, √(gD), where continuity through a nearly dry line would drive a
  bore); BYC's and Encinal YC's own racing marks aren't published where we could
  reach (yra.org, berkeleyyc.org and encinal.org are blocked here); the Port's crane colors, counts per terminal and
  sizes, the Richmond–San Rafael Bridge's paint and deck profile, and East Brother's house colors are unconfirmed
  (portofoakland.com, dot.ca.gov and eastbrother.org need allowing).
  **Grounding on depth** (Coordinator, 14 November; Bay East, after bay-east-17; physics review; with Skipper Model for
  the AI's routing): today a boat runs aground only on the coastline, so at low water she sails over drying flats and
  shoals with her 1.20 m draft (Folkboat, class rules). San Rafael's and San Leandro's flats, Richardson Bay and the
  Berkeley flats are where Folkboats really go aground. The chart's depth plus the tide's height there (tide.ts
  tideHeightAt) against her draft: soft mud, so she's aground, not wrecked, and stuck until the tide lifts her or she
  kedges off (the anchor); the AI's routes keep to water deep enough.
  ~~East Bay landmarks you navigate by~~ (done: the Campanile and the Claremont, landmarks for bearings) (owner, 13 November; with Bay East; 2–4 h): the **Berkeley Campanile** (Sather
  Tower, on the UC Berkeley campus) and the **Claremont Hotel** (the large white hotel in the Berkeley Hills). Both are
  sighted from across the Bay for bearings and transits, so their positions, heights and outlines need sourcing (OSM,
  the university's and the hotel's own figures) and they belong in the landmark set used for transits, like Coit
  Tower and the Transamerica Pyramid.
  ~~**Sutro Tower, properly built**~~ (done: the legs drawn in to a waist and out, to its real form) (owner, 13 November: "it's sort of decapitated at the moment"; accuracy; a navigation
  landmark already in the transit set, src/sim/transits.ts; 3–5 h). Today (render/landscape.ts) it's three banded legs
  to 298 m with crossarms at two levels and thin masts on top. Find why it reads as cut off: the masts too thin to
  see, the top lost to the far clipping plane or the fog, or the base sunk in the terrain. Build it to its real form,
  sourced: the three-legged frame with its two levels of crossarms, the antenna masts on top, its red and white bands,
  and its aircraft warning lights at night.
- **Accounts and logins:** other people play in their own instance, their boats, saves and histories kept from session to
  session. First: make your own saves durable (today a republish can lose race history and boat changes).

## Training tools (owner, 12 November; ranked by the owner: the wind indicator first, then the flow view)

Owner: "As part of the training tools suite, let's build a sort of midair wind indicator, like an arrow or series of
arrows floating in the air showing where the wind is. Ideally we could also build a second view showing how the wind is
traveling over the hull and sails to help players learn about sail shape and laminar flow."

- ~~**1. A midair wind indicator**~~ (done: true and apparent wind in the air beside her at three heights, key `, physics-reviewed) (2–4 h): arrows or streamers in the air around the boat showing the true and the apparent
  wind, direction and strength, switchable. At several heights, so the wind gradient and the apparent wind's twist up
  the rig (already in the physics) can be seen.
- ~~**2. A flow view**~~ (done: key \, two physics reviews; the labels say which is the sim's, and that the slot isn't modeled) (8–14 h): streamlines over the sails and hull showing attached and stalled flow, the slot between the
  jib and the main, and the telltales' story, driven by the sim's own apparent wind, angle of attack and sail-shape
  model. True to the physics, and labeled where it's illustrative.

- **3. The tack and jibe drill, made a real drill** (owner, 13 November; next; 4–6 h; UI & Experience to mock it up for
  the owner first). Built: every maneuver scored against a good crew's, with what to change (#218). The owner's feedback:
  "the coach info is too far away from the boat for me to see it and keep an eye on the boat at the same time. it's
  also too much copy to read in the moment. I need contextual cues to help me know when to tack, when to wait, etc.
  maybe even some on-water tracks or something. this doesn't feel different from regular cruise mode."
  - **Cues where you're looking, in a word or two:** beside or above the boat, not in the Coach card: "Build speed",
    "Tack now", "Hold", "Ease", "Trim". The full advice moves to after each rep.
  - **On-water guides:** a lane or track drawn on the water showing the line to sail, where to start the turn, and the
    new course after it; a target heading mark; and her wake shown against the ideal turn afterwards. All drawn from
    the sim's own polar and turn model.
  - **A drill's own shape,** so it doesn't feel like cruising: a set course in open water, numbered reps, a short
    score after each (speed lost, distance lost, the turn's rate and the tiller's), and a best-of summary.
  - On the screen rule: the cues live on the water and on the boat, not as new buttons.

- **4. A learn-to-sail mode** (owner, 13 November: the on-screen tiller instructions don't need to be there, "except maybe
  in a 'learn to sail' mode, which we haven't even roadmapped yet"; not ranked; a design to the owner first). For
  someone who has never sailed: the parts of the boat, steering with the tiller, the points of sail, trimming to the
  telltales, tacking and jibing, heaving to and docking, each as a short guided lesson on the water, with the
  instructions on screen there and nowhere else. It builds on the drills, the wind indicator, the flow view and the
  coach. The lessons' content should be checked against a recognized syllabus (US Sailing's Basic Keelboat, for one).

- **Badges along the ASA ladder** (owner, 13 November): the learn-to-sail mode's lessons and badges follow the American
  Sailing Association's course ladder, with ASA 101 Basic Keelboat as Learn to Sail. Each badge has a hover saying it
  isn't the certification. ASA's permission is needed before any public release.

## Next up

- ~~Real SF Bay currents and tide timing~~ (done: NOAA stations, any date, offline). Later: eddies behind points, using NOAA's SFBOFS model output for the spatial detail between stations.
- ~~Afternoon westerly~~ (done: NOAA wind records by month and hour, the slot, shore effect, drifting puffs and lulls shown on the water). ~~Winter winds~~ (done: westerly, northerly, southerly and light days by their frequency in the records). ~~Real wind for a past race day~~ (done: observed every 6 minutes since 2021) and ~~the forecast~~ (done: NWS, refreshed daily). ~~The wind across the course~~ (done: the NWS grid for forecasts; station-nudged terrain model for past days). Later: the AI sailing to the pressure; a gridded observed analysis (NOAA's URMA) for past days.
- ~~**Wind shadows**~~ (done: boats' dirty air, ships, the committee boat, the lee of the land). Later: wakes laid down as markers and carried by the wind (so a wake stays where a boat tacked); the AI choosing a clear-air hole on the line; the wind bending round the islands and speeding up on their flanks.
- ~~**Race debrief**~~ (done: what cost you time, ranked, with tips). ~~Show each item on the replay~~ (done, v127). ~~Compare against the boat that won~~ (done by v147: the replay shows your race against the winner's, leg by leg,
  physics-reviewed).
- ~~**Remaining rules.**~~ (done: 18.2(c)/(d), 18.4, 19, 21.3, 23, 43.1(a), 44.1(a), touching the committee boat). Later: backing a sail. (Rule 19 and 20 now apply at the islands and the Marin shore too, and 20.2(e).)
- ~~**GGYC and StFYC, and the start line.**~~ (done: the GGYC clubhouse on OSM's footprint at 37.8077 N, the line's inner end on the seawall in front of it, about 410 m to X on 351°; StFYC was already right). Later: the race-deck marker's exact spot and the line's wording from GGYC's own current sailing instructions (only third-party summaries of past SIs were reachable: "an orange marker on the race deck" to X), and whether X is the YRA's position or NOAA's 66 m away.
- **Real shoreline: land and water true to the chart** (owner, 19 November 2026: part of the broader work on the Bay,
  its hydrography and coastlines; after SFBOFS; Bay East). The survey (docs/plans/shoreline-survey.md, branch
  shoreline-survey 5976fe30) against NOAA's ENC at 10 m: sim water on charted land in 1,568 patches, 35 of them 50 m+
  (the 50 m terrain mask reads low fill as water): Alameda by Coast Guard Island 270 m, Point Richmond 128 m, the
  Port of Oakland fill 125 m, Clinton Basin 103 m, Strawberry and Sausalito Points 96 and 79 m, Mission Rock to Rincon
  Point 57–69 m; sim land in charted water at most 47 m (outer coast); the Cityfront mostly within 15 m (Gashouse Cove
  and Telegraph Hill 45 m). Proposed (the owner to decide): the land mask built from the ENC at 5–10 m, which also
  covers 8q8. Then the shore's kinds and damage (#338, Bay East), lower priority.
  Earlier: ~~Make Marin, Angel Island and Alcatraz solid~~ (done, from the 50 m terrain). ~~Replace the hand-traced Cityfront outline with real coastline data~~ (done: OSM's coast from the Gate's south shore round Fort Point to Pier 27, with the open piers, breakwaters and Pier 39's docks; east of Pier 27 is still hand-traced). ~~The AI's and the tiller pilot's look-ahead stepping over piers~~ (done: geo/shore.ts landAlong tests the whole line exactly) and ~~Rule 20 hails at the islands~~ (done: at every obstruction, src/sim/obstruction.ts). Still to do at the Wharf: the sea lions' floats at Pier 39 aren't solid. Rule 20 still to finish (from the final review): 20.3, passing a hail on to a third boat on the same tack (a hailed boat tacks at once now, even with a boat to windward); 20.2(e) should keep 18.2 off until the hailer has tacked and kept clear (it lapses on a breach call or after 30 s); `fetchingIsland` should also require passing to windward of the island (not reachable today); and an AI boat pinned by a windward boat that could clear by bearing away 10° tacks instead of sailing round.
- **Your boat** (done: looks, flags, condition; the stern, transom, cabin, coamings, her name on the cabin side, the cockpit lip and the after-deck cleat, v71–v77). Later: rig tune (mast rake and the mast-heel position that sets pre-bend, forestay sag); a varied AI fleet (some boats with dirty bottoms and tired sails); hours on each sail instead of three ages; the US courtesy flag's placement checked against the club's own rules; flags hoisted again after you finish.
  Owner's requests, 12 November (unranked; the owner will rank them):
  1. Significantly more hull paint colors (later, Crew Figures; partly #354).
  2. Color options for the sail numbers and the F class letter (later, Crew Figures).
  3. The interior and cockpit material, teak or fiberglass (later, Crew Figures).
  4. The drawn rigging lines in the colors chosen for the control panel (the Boat page's line colors), so each line
     wears its control's color (Rigging, with the rigging rendering).
  5. A tactical compass on the cabin top, as Josephine's Tacktick-style unit at the mast foot
     (reference/photos/josephine-cabin-top-forward-port.png): usable in the game, readable from the cockpit camera,
     showing heading, and used tack to tack to read lifts and headers like the real one (Boat Detail for the unit,
     UI & Experience for its readout).
  6. The deck less flat and static: texture and depth, the non-skid pattern and wear, as in the photos (later, Crew Figures).
- **The Seaweed Soup courses** (done: all 41). Done too: the race committee choosing the course from the wind and the tide, flown in numeral pennants. Later: postponement (AP) when there's no wind to race in; shortening course (S); laylines that clear Alcatraz's shore rather than its light; the wind's shadow behind Angel Island and the current around the islands (today the current is the open-water current everywhere but the Cityfront).

## Sea state, and reading the water (requested)

The principle: everything you see on the water comes from the same wind, current and wave fields that the boats sail in. A tideline is drawn where the current field really converges; a puff is dark because the wind really is stronger there. Reading the water should give you true information, as it does on the bay, and never decoration that lies.

### Sea state in the physics — done (see README, Sea state)

Done: wind chop from the wind over the water and the fetch on the real coastline (JONSWAP growth); swell from the SF Bar buoy record by month, dying away inside the Gate; wind against tide from wave–current physics; added resistance (footing pays in chop), wave yaw; flat-water or real, and a small/typical/big swell day. Later:
- ~~**Duration:** the chop takes time to build when the breeze fills in~~ (done: CEM's duration-limited growth, run up through the day's own wind from the calm morning; a set strength has been blowing for hours). Later: a sea that lingers as the wind drops.
- **Pitching in the physics** (today it's visual): hobby-horsing in a short chop, and steering harder through it.
- **Archived buoy data for a past race day** (with real past races), and the ocean wind sea through the Gate as its own component.
- ~~**Shallow-water waves: length and speed for the depth**~~ (done, Bay East, branch shallow-waves: each component's
  wavenumber by linear dispersion at the reference place's chart depth and the tide, eased in, its phase and its groups
  carried on where you are. Off the Cityfront, 15 m, an 18 s swell is 212 m long and runs at 11.8 m/s, not 506 m and
  28 m/s; the chop is deep there and unchanged.) Still to do:
  - **Depth-limited growth of the chop** (sea.ts: Hs and Tp lower over shoal water, g·d/U² below about 5; the
    Coordinator: after beat-chop lands, its own PR, with Deep Physics' agreement on what seaway.ts reads). The
    coefficients from Young & Verhagen 1996 (Coastal Engineering 29) checked against the paper, or else the USACE
    Coastal Engineering Manual's (EM 1110-2-1100, Part II-2). With it, the deep-water lengths still in sea.ts and
    seaway.ts (the physics review of shallow-waves): sea.ts onCurrent's dispersion (the breaking caps, Hs ≤ 0.1·L, and
    `steep`, the HUD's "steep chop"), groupSpeed in the current's stretch of the fetch, harborSwell's depth without the
    tide; seaway.ts awAt's λ = gT²/2π and waveYaw's k = 4π²/(gT²). Each the local depth's, as the field's are the
    reference place's.
  - **True refraction** (crests bending toward a shoal across the field): the field is a sum of plane waves, one
    direction each, the same everywhere, so it can't. It needs a field for each place (or rays traced from the Gate).
    And with it each place's own depth: racing, the field takes the course's water's (its line and marks, by the swell
    at each), cruising the Central Bay's, one depth for all the water you see. (A depth that followed her boat ran the
    far water past as it changed: a sum of plane waves can't change its lengths in one place only.)
  - **The depth varying across the water** (the Coordinator, 16 Nov 2026): one depth a World for now, so a boat sailing
    into the South Bay's or San Pablo Bay's shoal water doesn't meet their shorter, steeper chop. It comes with Deep
    Physics' (b), the old sea dying and a new one growing, where the field can change without sweeping the far water.
  - **The depths are the ENC's band middles** (a band 9–18 m deep reads 13.6 m). Open question: the chart reads 2.7 m
    (its 1.8–3.6 m band) for the Berkeley Circle at 37.857 N, 122.345 W; NOAA ENC (src/geo/data/enc-chart.json). Is
    that the band the Circle is in, or the polygon's edge? To check against chart 18649.
- **Shoaling** over Harding Rock, Point Blunt and the bar.

### What the water looks like (the cues sailors actually use)

- **Puffs and lulls:** darker, rougher patches where the wind is stronger, moving downwind across the water toward you; lighter, smoother patches in the lulls; cat's paws in light air. Whitecaps starting around 12 kt, foam streaks lined up with the wind in a strong breeze. Their shape and speed come from the wind field, so you can see a puff coming and judge when it will reach you.
- ~~**Tidelines and current lines:**~~ (done, from the current field's convergence; color change not yet) where currents of different speed or direction meet (along the edge of the Cityfront relief, off points like Fort Point and Blackaller), a line of foam, kelp and debris collects, the water texture changes across it, and sometimes the color (brown, silty Bay water against clearer ocean water). Drawn where the current field converges, so the line is where the current actually changes.
- ~~**Wind against tide on the surface:**~~ (done) visibly steeper, shorter, whiter chop where an ebb meets the westerly.
- **Eddies and boils** behind points and shoals: swirling, glassy patches.
- **Marks and moored boats:** ~~buoys lean and trail a wake downstream in the current~~ (done); ~~anchored and moored boats swing to point into the current (or the wind, when it wins)~~ (done, in the anchorages).
- ~~**The water texture moves with the current**~~ (done) (flow-mapped), so you can see the set over the bottom against the wind waves.
- **Rendering approach** (the waves and whitecaps are done; tidelines and eddies still to come): a sum of Gerstner waves (or an FFT ocean) built from the wave spectrum, with the wind sea and swell as separate components; a foam and whitecap layer driven by wave steepness; a current-convergence map for tidelines and debris; a puff map from the wind field darkening and roughening the surface. Phone-friendly fallbacks come later.

## Looks: the boats and the bay (requested)

Same principle as the water: realistic means *recognisably the real thing*, and the details a sailor uses (a transit on the shore, the committee boat's flags, a wake) should be there and correct. Rough order: most realism for the effort first.

### The boats
1. ~~**A real Folkboat hull**~~ (done, from class figures and estimated lines; refine against the official lines plan if we get it): the deep, narrow hull with its sweeping sheer, the long keel with the rudder hung on the transom, the doghouse-style cabin trunk with portlights, the cockpit well and coamings, the tiller. Wooden boats lapstrake (clinker), with the plank lands visible; yours smooth glassfibre with a boot stripe and antifouling that shows when she heels.
2. ~~**Materials and light:**~~ (done, but sail translucency) physically based materials (gloss gelcoat, varnished wood, anodised aluminum, Dacron sails with seams and a little translucency), shadows (sails shading the deck, boats shading the water), and reflections of the sky.
3. ~~**Crew:**~~ (done) helm and crew figures that hike out, move across on a tack, and sit where you'd sit.
4. ~~**Bow wave, wake and spray,**~~ (done) sized by boat speed; boats pitch and roll in the waves once sea state is in.
5. **Rigging detail:** (sail numbers and the class letter done) blocks, sheets and control lines (comes with the full sail controls), sail numbers and the class insignia.

### The bay
1. ~~**Sky and sun for the race day and time**~~ (done, with the Golden Gate Bridge modeled): the sun where it really is (we already know the date and time), glare and glitter on the water, and the summer fog bank pouring in through the Gate in the afternoon.
2. ~~**Real terrain:**~~ (done) elevation data for the Presidio, Marin Headlands, Angel Island, Alcatraz and the city hills, colored from land cover, instead of the hand-traced outline.
3. ~~**Landmarks you steer and sight by:**~~ (done, with transits for the start line and laylines) the Golden Gate Bridge, Alcatraz and its lighthouse, the Palace of Fine Arts, Fort Mason's piers, the yacht clubs, Coit Tower, the Transamerica Pyramid. They're also transits for the start line and laylines, as racers use them.
4. ~~**Marks and the committee boat:**~~ (done; no general recall yet) real buoy shapes swinging to the current, a committee boat flying the actual signals (class flag, P, I, Z, U, black flag, individual recall X) in sequence: teaches the flags.
4a. ~~**The Ferry Building, drawn properly**~~ (done by v147: from OpenStreetMap, the tower's stages to 75 m, the arcade on
   every long face, gates B–G, the Port of San Francisco sign on the Bay roofline across from the tower) (owner, November 2026: "a more complete drawing of the ferry building, with
   Port of San Francisco sign… Not urgent"; later; accuracy/polish; 4–6 h). Today (render/landscape.ts) it's a
   30 × 200 × 15 m cream box with a 60 m tower, a pyramid roof and four lit 6.7 m clock dials; no sign, arcade or slips.
   True to life (Wikipedia, Ferry Building (San Francisco)): A. Page Brown, Beaux-Arts, opened 1898; the clock tower is
   245 ft (75 m), so ours is 15 m short; the building is about 660 ft (200 m) long with an arched arcade along the
   whole base; four 22 ft (6.7 m) dials, the inner dial lit at night; ferry slips B–G behind it on the Bay side (B to
   the north, C–D the Golden Gate Ferry terminal at the center, E–G south); the plaza in front. The **PORT OF SAN
   FRANCISCO** sign has been on the Bay side since 1951, replacing "Welcome to San Francisco" (OpenSFHistory photo
   wnp25.2344). Still to find: its letter style and color, exact position, and whether it's lit at night (the Port's
   sign guidelines, sfport.com, have a Ferry Building section: that host needs allowing), the building's width and
   roof height, and its OSM footprint.
5. **The water itself:** see Sea state above (waves, sky reflection, foam, tidelines).
6. ~~**Moored boats**~~ (done: the anchorages; marinas need the real shoreline) **and marina life** in the harbor behind the line; traffic (see below).

## Ship traffic and wakes — done (see README, Ship traffic)

- Vessels passing through the race area on realistic routes: container ships and tankers in the Central Bay traffic lanes, Alcatraz and Sausalito ferries and Blue & Gold / Red and White tour boats from Piers 39–41, Coast Guard boats, pilot boats.
- **Wakes** with the real Kelvin pattern (about 19.5° each side of the track), arriving well after the ship has passed, and hitting the boat as a short burst of steep waves (slowing her and knocking her off course).
- **Rules:** these vessels aren't racing, so the Racing Rules don't apply to them: the collision regulations (IRPCAS) and the traffic scheme do. Keep out of the way of big ships in the lanes; five short blasts mean danger. A teaching moment in itself.

## Full sail controls (requested) — done (see README, Sails and trim)

Build every line on the boat as something you can see in 3D and work yourself, each with its effect on sail shape and speed. This extends the sail trim model (`src/boat/trim.ts`), which today has only the two sheets.

### Lines and where they're led (from the owner's boat)

The **piano** is the row of cam cleats on the aft face of the cabin top (the bridge deck bulkhead), one row each side of the companionway. Lines run forward along the cabin top to turning blocks at the mast.

| Piano | Inboard (by the companionway) → outboard |
|---|---|
| Starboard | Vang · Outhaul · Jib Cunningham (three cam cleats), with the jib halyard tail (uncleated) just outboard of the jib Cunningham (owner, 12 November) |
| Port | Vang · Outhaul · Jib Cunningham (three cam cleats, the other ends of the same dual-ended lines), plus a fixed clam cleat set ~2 in forward, between the outhaul and jib Cunningham cams, which holds the **main Cunningham** (thin line, stopper knot in the end). Also here: the main halyard's tail on its block and tackle, with its own cleat at the tackle's base (there is no main downhaul; owner, 12 November) |

| Control | Sail | Led to | Notes |
|---|---|---|---|
| Vang | Main | Piano, both sides, innermost | Dual-ended: pulling one tail pulls the other |
| Outhaul | Main | Piano, both sides, middle | Dual-ended; blue line, its middle crosses behind the companionway from one side to the other |
| Jib Cunningham | Jib | Piano, both sides, outermost | Dual-ended |
| Main Cunningham | Main | Port piano only, fixed clam cleat | Its own line through a ring in the luff above the boom. Fine luff tension under way |
| Main halyard (tackle) | Main | Port side: the halyard's tail on a block and tackle, with its own cleat at the base of the block | Pulled tight at the start of the sail (the last inches of hoist, and luff tension under load); rarely touched after. Coarse luff tension. In the sim it's the control named `downhaul` (controls.ts), which already sails this way: rename it in the UI (owner, 12 November) |
| Jib halyard | Jib | Starboard piano, outboard of the jib Cunningham, uncleated | Used under way: coarse jib luff tension, beside the jib Cunningham. The owner's crew uses it and the jib Cunningham rarely; top sailors who borrowed Josephine for the Internationals used the jib Cunningham. The sim needs a jib halyard control (owner, 12 November) |
| Mainsheet | Main | Boom end to the traveler car on a wooden thwart across the cockpit, in front of the helmsman | Purchase unknown: model 4:1 (typical for a keelboat this size) until counted |
| Traveler | Main | Wooden thwart across the cockpit | Dual-ended |
| Backstay | Rig | Each end of the cockpit thwart, where it meets the hull | Dual-ended; the bridle is on the transom |
| Jib sheets | Jib | Along the side decks to the winches | The only lines on the winches. Winches are **not** self-tailing: one hand cranks, the other tails, so trimming in a breeze is slow and takes crew |
| Jib cars | Jib | H-shaped track on each side of the cabin top | Moved by hand with pin stops, both fore–aft (twist) and athwartships (sheeting angle: inboard to point, outboard to foot). Set before a leg, not adjusted while loaded. Best guess until counted: 7 fore–aft positions and 5 athwartships, 25 mm apart (the usual hole spacing) |

### What each one does (the physics to model)

- **Backstay:** tightens the forestay (less sag, so a flatter jib that points higher) and bends the mast (flattens the main and opens its upper leech). Ease it for power in light air or chop.
- **Vang:** holds the boom down and controls main leech twist. It matters most off the wind, when the mainsheet no longer pulls the boom down.
- **Outhaul:** depth in the lower main. Ease for power, tighten to flatten.
- **Cunningham and halyards:** luff tension, which moves the draft forward and opens the leech. The fix when the draft blows aft as the breeze builds.
- **Traveler:** sets the boom's angle to the centerline without changing twist, which sheet tension controls.
- **Mainsheet:** angle and twist together. Trimming hard closes the leech.
- **Jib sheet and cars:** sheet tension sets the angle. Car fore–aft sets twist: forward makes a deeper jib with a tighter leech, aft a flatter jib with an open top. Car in–out sets the sheeting angle: inboard points higher in flat water, outboard gives more power and speed in chop or when reaching.
- **Halyard tackle vs. Cunningham:** both tension the main's luff. The main halyard's tackle does the heavy lifting; the Cunningham fine-tunes it. On the jib, the halyard and the jib Cunningham share the job the same way.
- **Winches:** the jib sheet needs a winch to trim in a breeze, so trimming takes time and effort, while easing is quick.

### How it should play

- See each line in 3D: the piano, the thwart controls, the winches, the cars on the cabin-top tracks. Dual-ended lines show both tails moving together.
- Settings per sail, with crew defaults for each wind strength, and the option to work every line yourself (like today's trim switch).
- Telltales, the leech, the draft position and the speed readout respond, so you learn by feel and by numbers.
- Keyboard controls (rebindable) and a trim panel that groups the lines as they are on the boat: piano, thwart, winches.

### Defaults until someone's aboard to check (easy to change later)

- Mainsheet purchase: 4:1.
- Jib car pin positions: 7 fore–aft and 5 across, 25 mm apart.
- Main halyard tackle: drawn as a gooseneck downhaul until redrawn; to be relabelled and led to port.

## Later

- **A hit off a boat's center turns her** (owner question; the physics review of the hull contact, #460, 18 Nov 2026): struck near her bow or stern, a hull mostly swings rather than slides sideways (effective mass there about a third of hers). The contact now moves boats only along the line between the hulls, with no yaw; and no friction between them yet, as there's no sourced value for wet topsides. Build it?

- **Wrecks** (built 14 November, docs/WRECK-PROPOSAL.md section 8; to publish. Next: the shore's kinds and the charted rocks from the NOAA chart, so a seawall or a rock grades as one. Was: designed, the owner's answers 14 November; Marinas; 6–10 h):
  the contacts in its table as wrecks, damage or notes, the damage cutoffs ESTIMATES. A wreck ends the outing with a
  short statement of where and how, logged, or you carry on marked wrecked. Optional towing ends it "towed in". Repairs
  lay her up for a few real days, with no money. In a season race it's RET. Only your boat is wrecked. Until it's built,
  contact with the Fort Mason piles just stops her.

- **Leaving a race, and whether it's recorded** (owner, 13 November: "eventually we need logic for leaving a race and
  whether it gets recorded"; Debrief, or Marinas for the season, when it comes up): leaving mid-race and how it's
  scored and saved. That covers RET or DNF in the season and the results, the ghost and the logbook kept or not, and
  practice against a season race.

- **Desktop release** (owner, November 2026: "put a desktop release on the roadmap. it's not urgent, but if we're
  getting to a place where it no longer makes sense to keep building in-browser, say so."; later; 3–6 days for the
  technical port, plus the business setup):
  - Wrap the same TypeScript and three.js code as a Mac and Windows app: Tauri for a small download, or Electron for
    consistent graphics.
  - Sell it on Steam, itch.io, or direct through Paddle or Lemon Squeezy.
  - Move saves from the artifact's database and localStorage to local files, with Steam cloud sync.
  - Cache NOAA, NWS and chart data for offline use, and check the ENC chart data's terms for bundling.
  - Add a graphics-quality setting, an installer, and code-signing (Apple and Microsoft certificates, about $100 a year
    each).
  - Store page, trailer, privacy policy, price and refunds.
  - Keep real skippers' names out of the shipped product without permission.

  **Watch note:** move off the browser when any of these becomes true (the Coordinator flags it when one comes close):
  - the artifact's 16 MB size limit is in sight (3.5 MB today);
  - performance needs native threads or a GPU budget the browser can't give;
  - saves outgrow the artifact database;
  - we need things a page can't have: file access, game controllers, a full-screen app.

- Real past races with real wind and current (goal 4).
- More courses, and race-committee options (course changes, shortened courses).
- Phone and tablet layout (on hold: desktop first).
