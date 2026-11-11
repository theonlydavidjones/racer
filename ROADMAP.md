# Build plan

- ~~**West Harbor**~~ (done: docks, slips, sailing in and out, your boats' slips) ~~and Gashouse Cove, South Beach and the Corinthian~~ (done). Later: the other Bay marinas (Sausalito, Richmond, Berkeley, Alameda); the real slip numbers (South Beach's dock letters and the Corinthian's A dock are real; West Harbor's and Gashouse Cove's letters, and every harbor's slip numbers, aren't published where we could reach: the harbor maps on sfport.com, sfrecpark.org and cyc.org need those hosts allowed); boats in neighbouring slips drawn as real boats; docking lines and an outboard for getting in and out.
- **The sea inside the marinas** (from review of the Gashouse Cove seawall; minor): (1) the swell gets in on a single ray
  through the entrance, so a strip a few metres wide just inside Gashouse Cove's entrance gets the full swell while its
  neighbours get a seventh of it; a 12 s swell (~225 m long) should diffract weakly and evenly through a 20–40 m gap, by
  sourced coefficients (Wiegel's diffraction diagrams, Shore Protection Manual) in place of the unsourced ×0.15;
  (2) the 15 fetch rays alias on the 10 m grid near an entrance (chop 0.17 → 0.04 → 0.13 m over 12 m at 315°): spread
  or smooth them; (3) at South Beach and the Corinthian, just inside the entrance has a little more chop than just outside
  (fetch 194 m against 108 m), from the open-water ray's 50 m minimum fetch (2–4 h).

What's planned, roughly in order. Done work is described in the README.

## Priorities (owner's ranking, November 2026)

Estimates are focused build hours including tests, review and publishing, ±50%.

1. ~~Saves kept with your account; save or discard after each sail~~ (done, v53).
2. **Hands-on boat handling**, in order:
   a. ~~Easier sail controls: adjusting one line takes only that line off auto; one tap puts it back; bigger targets~~ (done).
   b. ~~Heaving to: each jib sheet on its own, the tiller lashed at an angle, hove-to physics checked against real boats~~
      (done; the real-boat figures are anecdotal, so a GPS track of a Folkboat hove to would tighten the test bands).
      Later, from review: the hull's lift and broadside drag both act at one centre of lateral resistance (no Munk
      moment), and the hove-to model's lateral area, added masses and side windage are estimates (physics.ts HOVE).
      The force model's drive calibration (physics.ts driveCalibration) comes from full, unreefed sails at their best
      shape, so in a gale (k ≈ 0.2 at 35 kt) it stands in for the reefing and depowering it leaves out; from rest a
      backed-jib boat there gathers way quickly (5 kt in about 10 s). Holding the traveller down doesn't depower her: the
      crew sheets in to keep the boom angle it wants, so with the traveller yours the mainsheet should follow your intent.
   c. Crew weight in the physics: the low side in light air, hiking, body-tacking, forward downwind; the AI crew by
      skill; an option to place the crew yourself (6–10 h).
   d. Real timing and sequencing of adjustments, by crew count and skill; cars rarely moved (4–6 h).
3. ~~Race strategist in the course view, and a navigator for cruising~~ (done; published with the combined build of
   the parallel branches). Later: a gridded wind analysis so the sides of a beat differ by more than the shore and the
   slot; the strategist's plan B checked again on the water at the warning signal; the navigator's hazards from NOAA's
   chart data; the crew-trim model's traveller (boat/controls.ts puts it to leeward in medium air: found in review).
   Also from review: check the brief's leg times against the sim's own fleet sailing the same legs (an observed day's
   long beat was planned at 38 min, the AI took 47–71); list a max flood or ebb already under way at the window's edges;
   the tide predictions stop about 6 h after the gun (tide.ts stationsFor), so later passages see it frozen; and the
   gusts: Fort Point's records show peak gusts of 2–5 × the 6-minute mean on light, puffy days, while the sim's puffs
   stop near +45%, so the brief states the sim's gusts. Whether the puffs should reach the records' peaks is for the
   deep physics pass.

**Performance review** (owner, November 2026; 6–10 h): no lag or crashes as the sim grows. Set a budget first (a
steady 60 fps on a typical laptop in a full race: fleet, ships, wildlife, charts; page load under a few seconds; memory
that doesn't climb over a long session; the page well under the 16 MB limit, 3.1 MB today), then measure against it:
frame time by part (physics step, AI, onLand/shoreDist calls, the sea model, the 3D scene's draw calls and triangles,
the map and chart redraws, the sails' canvas textures), memory over an hour's sail (leaks from scenes, textures and
listeners not freed between races), and the worst cases (big fleet, heavy weather, the chart zoomed out). Fix the
hot spots; add a performance test to the suite (sim steps per second for a full race, headless) so later work can't
quietly slow it down; and a frame-time readout behind a dev key. Do it in a session of its own, with no other
sessions changing the scene or the physics while it measures.

Then, unranked: ~~start screens~~ (done: Race → create a race or run a past race; one-screen setups with the day's real conditions beside your choices; Settings); deep physics pass (8–15 h); skipper and crew model (15–25 h); cheating, protests
and hearings (8–12 h); validation against real fleets (4–6 h); rig tuning (5–8 h); seasons and awards (6–10 h); the Bay
in depth (~~done~~, published); crew figures and animation (10–16 h); ~~NOAA charts on the map~~ (done); the Bay to Berkeley, Alameda
and Richmond (10–16 h); ~~Gashouse Cove, South Beach and Corinthian marinas~~ (done); Sam's (3–5 h); accounts for other
players (3–6 h); ~~AI leeward starts and generic AI boats~~ (done); real slip numbers and nicer moored boats (4–6 h); real
past races (8–12 h); accuracy fixes: the GGYC/StFYC line, the Cityfront shore from OSM, Rule 20 at the islands (6–10 h);
phone layout (on hold, 8–12 h).

Checked: RRS 52 and the ERS rudder definition (primary sources), and the ST2000+'s 4,500 kg rating (Raymarine). Still
unconfirmed: the ST2000+'s hard-over time (now 4.5 s, from secondary sources), its AutoTack default (100°) and AutoTrim;
the handbook (Raymarine document 81130) wasn't reachable.

## The owner's list (November 2026, to prioritise)

In progress: the full-screen chart (tap the inset map: the sim pauses, pick a destination) and a tiller pilot (cruising only; RRS 52).
Then the skipper/crew model (calibration data first; Yacht Club sliders; crew skill driving trim, pole and puff calls; AI
skippers acting on what they believe; cheating, protests and hearings). Also asked for:

- **Rig tuning:** mast rake, shroud tension, pre-bend from the mast heel, forestay sag; each in the physics.
- **A race strategist** in the course view before each race, there to teach, not to win the game for you: the day's
  conditions and how they'll change, the favoured side and course options (one plan, or several when it's uncertain), the
  competition, and trim and tuning by phase ("it starts light, so…; it'll build late, so watch…"), with specifics.
- **A navigator** in cruising, doing the same for the route: timeliness and safety (current gates, the slot, shipping lanes).
- **Easier sail controls:** bigger targets; adjusting one line takes only that line off auto, and it's easy to put it
  back. Longer term: working the lines on the boat itself.
- **Crew weight in the physics:** the low side in light air, hiking in a breeze, body-tacking, moving forward downwind; the AI
  crew doing it by skill; the boat answering every shift; an option to move the crew yourself.
- **Real timing and sequencing of adjustments:** cars rarely moved (it takes time, means leaving the cockpit, which moves
  weight, and the working car usually can't be moved under load); the order and pace of every adjustment set by the number
  of crew and their skill.
- **A deep pass on sail and boat physics:** every crew move, wave, puff and line adjustment makes a response, from real
  science and maths.
- ~~**Cleaner start screens.**~~ (done) Race: create a race (club sponsor, course or the committee's choice, competitors, your crew,
  start time; the real conditions for that day and time by default, overridable) or run a past race. Cruise: likewise
  pared back. First an audit of every start-state screen for redundancy and friction.
- **Seasons** from real events (the Midwinters…), with rankings and awards that become attributes of the winning boat and skipper.
- ~~**The Bay, in depth:**~~ (done: Fort Point, the Bay Bridge's west span, Angel Island, Coit and Salesforce, puffs, waves, wildlife). bridges that reach the shore, Angel Island without the odd houses, a true Coit Tower, the
  Salesforce Tower; puffs you can see on the water; natural waves; seals, porpoises and birds that look and move right.
- **The Bay Bridge and the city at night** (owner, November 2026; 6–10 h): a high-quality Bay Bridge (the West Span's
  suspension towers, cables and anchorage at Yerba Buena Island, the East Span's single tower), with **The Bay Lights**,
  the LED sculpture on the West Span's vertical cables, in its real patterns after dark; and the downtown skyline lit at
  night (windows, the Salesforce Tower's crown, Coit Tower floodlit). The sun and sky are already real for the race day
  and time, so the lights come on at real dusk. Sources: Caltrans and OSM for the bridge's geometry; the Bay Lights' own
  published specifications for its LEDs and patterns.
- **Crew figures and animation:** natural bodies and positions, moving as the physics moves them and as they work the lines.
- ~~**More marinas:** Gashouse Cove, South Beach, Corinthian (Tiburon) to start.~~ (done)
- **Sam's, Sausalito:** dock at Sam's (and have a beer).
- **Save or discard** after each race or cruise: asked when it ends, before it goes in the logbook.
- **Heaving to, and the other seamanship manoeuvres** (a real-world stress test the sim fails today): each jib sheet on
  its own, so the jib can be backed to windward; the tiller lashed at a set angle; the physics of a hove-to boat (backed
  jib against a feathered main and the rudder, fore-reaching slowly and drifting to leeward) checked against real boats.
- **Real nautical charts on the map:** NOAA's official charts (the US nautical charts are NOAA's; USGS makes land maps):
  chart 18649 (Entrance to San Francisco Bay) and its neighbours, as raster tiles or drawn from the ENC vector data
  (depths, channels, buoys, lights, restricted areas), on the inset map and the full-screen chart.
- **The Bay to Berkeley, Alameda and Richmond:** the shores, harbors and marks east and north, with the wind and current
  fields extended over them (NOAA current stations and the NWS grid already reach there).
- **Accounts and logins:** other people play in their own instance, their boats, saves and histories kept from session to
  session. First: make your own saves durable (today a republish can lose race history and boat changes).

## Next up

- ~~Real SF Bay currents and tide timing~~ (done: NOAA stations, any date, offline). Later: eddies behind points, using NOAA's SFBOFS model output for the spatial detail between stations.
- ~~Afternoon westerly~~ (done: NOAA wind records by month and hour, the slot, shore effect, drifting puffs and lulls shown on the water). ~~Winter winds~~ (done: westerly, northerly, southerly and light days by their frequency in the records). ~~Real wind for a past race day~~ (done: observed every 6 minutes since 2021) and ~~the forecast~~ (done: NWS, refreshed daily). ~~The wind across the course~~ (done: the NWS grid for forecasts; station-nudged terrain model for past days). Later: the AI sailing to the pressure; a gridded observed analysis (NOAA's URMA) for past days.
- ~~**Wind shadows**~~ (done: boats' dirty air, ships, the committee boat, the lee of the land). Later: wakes laid down as markers and carried by the wind (so a wake stays where a boat tacked); the AI choosing a clear-air hole on the line; the wind bending round the islands and speeding up on their flanks.
- ~~**Race debrief**~~ (done: what cost you time, ranked, with tips). Later: show each item on the replay (the header you held, where you overstood), and compare against the boat that won.
- ~~**Remaining rules.**~~ (done: 18.2(c)/(d), 18.4, 19, 21.3, 23, 43.1(a), 44.1(a), touching the committee boat). Later: wind shadow (blanketing), which Rule 23 interference and real tactics both need; 19 with a boat as the obstruction; 20.3; backing a sail.
- **GGYC and StFYC, and the start line.** Dial in the clubs' buildings and the GGYC flagpole (the inner end of the start line) on the spot. The course file has the flagpole at 37.80925 N; the city's building data puts the GGYC clubhouse at 37.8077 N.
- **Real shoreline.** ~~Make Marin, Angel Island and Alcatraz solid~~ (done, from the 50 m terrain). Still to do: replace the hand-traced Cityfront outline with real coastline data (~~Fort Mason's piers~~ done: OSM's coast from Crissy Field to Aquatic Park; ~~Pier 39 and the Wharf~~ done: OSM's coast on to Pier 27, with the open piers, breakwaters and Pier 39's docks; still hand-traced from Fort Point to Crissy Field). Still to do at the Wharf: the AI's and the tiller pilot's look-ahead for land samples every 15–45 m (ai/ai.ts, boat/autopilot.ts), so it can step over a 1–10 m pier, breakwater or dock: test those lines exactly against geo/shore.ts WHARF (wharfCrossed), as the passage planner does; the sea lions' floats at Pier 39 aren't solid, and Rule 20 hails at the islands (today only at the Cityfront).
- **Your boat** (done: looks, flags, condition). Later: rig tune (mast rake and the mast-heel position that sets pre-bend, forestay sag); a varied AI fleet (some boats with dirty bottoms and tired sails); hours on each sail instead of three ages; the US courtesy flag's placement checked against the club's own rules; flags hoisted again after you finish.
- **The Seaweed Soup courses** (done: all 41). Done too: the race committee choosing the course from the wind and the tide, flown in numeral pennants. Later: postponement (AP) when there's no wind to race in; shortening course (S); laylines that clear Alcatraz's shore rather than its light; the wind's shadow behind Angel Island and the current around the islands (today the current is the open-water current everywhere but the Cityfront).

## Sea state, and reading the water (requested)

The principle: everything you see on the water comes from the same wind, current and wave fields that the boats sail in. A tideline is drawn where the current field really converges; a puff is dark because the wind really is stronger there. Reading the water should give you true information, as it does on the bay, and never decoration that lies.

### Sea state in the physics — done (see README, Sea state)

Done: wind chop from the wind over the water and the fetch on the real coastline (JONSWAP growth); swell from the SF Bar buoy record by month, dying away inside the Gate; wind against tide from wave–current physics; added resistance (footing pays in chop), wave yaw; flat-water or real, and a small/typical/big swell day. Later:
- **Duration:** the chop takes time to build when the breeze fills in (today it's as if the wind had been blowing for hours).
- **Pitching in the physics** (today it's visual): hobby-horsing in a short chop, and steering harder through it.
- **Archived buoy data for a past race day** (with real past races), and the ocean wind sea through the Gate as its own component.
- **Shoaling** over Harding Rock, Point Blunt and the bar.

### What the water looks like (the cues sailors actually use)

- **Puffs and lulls:** darker, rougher patches where the wind is stronger, moving downwind across the water toward you; lighter, smoother patches in the lulls; cat's paws in light air. Whitecaps starting around 12 kt, foam streaks lined up with the wind in a strong breeze. Their shape and speed come from the wind field, so you can see a puff coming and judge when it will reach you.
- ~~**Tidelines and current lines:**~~ (done, from the current field's convergence; colour change not yet) where currents of different speed or direction meet (along the edge of the Cityfront relief, off points like Fort Point and Blackaller), a line of foam, kelp and debris collects, the water texture changes across it, and sometimes the colour (brown, silty Bay water against clearer ocean water). Drawn where the current field converges, so the line is where the current actually changes.
- ~~**Wind against tide on the surface:**~~ (done) visibly steeper, shorter, whiter chop where an ebb meets the westerly.
- **Eddies and boils** behind points and shoals: swirling, glassy patches.
- **Marks and moored boats:** ~~buoys lean and trail a wake downstream in the current~~ (done); ~~anchored and moored boats swing to point into the current (or the wind, when it wins)~~ (done, in the anchorages).
- ~~**The water texture moves with the current**~~ (done) (flow-mapped), so you can see the set over the bottom against the wind waves.
- **Rendering approach** (the waves and whitecaps are done; tidelines and eddies still to come): a sum of Gerstner waves (or an FFT ocean) built from the wave spectrum, with the wind sea and swell as separate components; a foam and whitecap layer driven by wave steepness; a current-convergence map for tidelines and debris; a puff map from the wind field darkening and roughening the surface. Phone-friendly fallbacks come later.

## Looks: the boats and the bay (requested)

Same principle as the water: realistic means *recognisably the real thing*, and the details a sailor uses (a transit on the shore, the committee boat's flags, a wake) should be there and correct. Rough order: most realism for the effort first.

### The boats
1. ~~**A real Folkboat hull**~~ (done, from class figures and estimated lines; refine against the official lines plan if we get it): the deep, narrow hull with its sweeping sheer, the long keel with the rudder hung on the transom, the doghouse-style cabin trunk with portlights, the cockpit well and coamings, the tiller. Wooden boats lapstrake (clinker), with the plank lands visible; yours smooth glassfibre with a boot stripe and antifouling that shows when she heels.
2. ~~**Materials and light:**~~ (done, but sail translucency) physically based materials (gloss gelcoat, varnished wood, anodised aluminium, Dacron sails with seams and a little translucency), shadows (sails shading the deck, boats shading the water), and reflections of the sky.
3. ~~**Crew:**~~ (done) helm and crew figures that hike out, move across on a tack, and sit where you'd sit.
4. ~~**Bow wave, wake and spray,**~~ (done) sized by boat speed; boats pitch and roll in the waves once sea state is in.
5. **Rigging detail:** (sail numbers and the class letter done) blocks, sheets and control lines (comes with the full sail controls), sail numbers and the class insignia.

### The bay
1. ~~**Sky and sun for the race day and time**~~ (done, with the Golden Gate Bridge modelled): the sun where it really is (we already know the date and time), glare and glitter on the water, and the summer fog bank pouring in through the Gate in the afternoon.
2. ~~**Real terrain:**~~ (done) elevation data for the Presidio, Marin Headlands, Angel Island, Alcatraz and the city hills, coloured from land cover, instead of the hand-traced outline.
3. ~~**Landmarks you steer and sight by:**~~ (done, with transits for the start line and laylines) the Golden Gate Bridge, Alcatraz and its lighthouse, the Palace of Fine Arts, Fort Mason's piers, the yacht clubs, Coit Tower, the Transamerica Pyramid. They're also transits for the start line and laylines, as racers use them.
4. ~~**Marks and the committee boat:**~~ (done; no general recall yet) real buoy shapes swinging to the current, a committee boat flying the actual signals (class flag, P, I, Z, U, black flag, individual recall X) in sequence: teaches the flags.
5. **The water itself:** see Sea state above (waves, sky reflection, foam, tidelines).
6. ~~**Moored boats**~~ (done: the anchorages; marinas need the real shoreline) **and marina life** in the harbour behind the line; traffic (see below).

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
| Starboard | Vang · Outhaul · Jib Cunningham (three cam cleats) |
| Port | Vang · Outhaul · Jib Cunningham (three cam cleats, the other ends of the same dual-ended lines), plus a fixed clam cleat set ~2 in forward, between the outhaul and jib Cunningham cams, which holds the **main Cunningham** (thin line, stopper knot in the end). Also here: the main downhaul and the jib halyard tail (uncleated) |

| Control | Sail | Led to | Notes |
|---|---|---|---|
| Vang | Main | Piano, both sides, innermost | Dual-ended: pulling one tail pulls the other |
| Outhaul | Main | Piano, both sides, middle | Dual-ended; blue line, its middle crosses behind the companionway from one side to the other |
| Jib Cunningham | Jib | Piano, both sides, outermost | Dual-ended |
| Main Cunningham | Main | Port piano only, fixed clam cleat | Its own line through a ring in the luff above the boom. Fine luff tension under way |
| Main downhaul | Main | Port side, via a block and tackle at the mast base | Pulls the luff down: coarse luff tension. Modelled as a gooseneck downhaul (it sails the same as a halyard tensioner) |
| Main halyard | Main | Not used under way | Hoisted before racing, not touched while racing |
| Jib halyard | Jib | Port piano, uncleated | Set before racing, not touched under way; jib luff tension comes from the jib Cunningham |
| Mainsheet | Main | Boom end to the traveller car on a wooden thwart across the cockpit, in front of the helmsman | Purchase unknown: model 4:1 (typical for a keelboat this size) until counted |
| Traveller | Main | Wooden thwart across the cockpit | Dual-ended |
| Backstay | Rig | Each end of the cockpit thwart, where it meets the hull | Dual-ended; the bridle is on the transom |
| Jib sheets | Jib | Along the side decks to the winches | The only lines on the winches. Winches are **not** self-tailing: one hand cranks, the other tails, so trimming in a breeze is slow and takes crew |
| Jib cars | Jib | H-shaped track on each side of the cabin top | Moved by hand with pin stops, both fore–aft (twist) and athwartships (sheeting angle: inboard to point, outboard to foot). Set before a leg, not adjusted while loaded. Best guess until counted: 7 fore–aft positions and 5 athwartships, 25 mm apart (the usual hole spacing) |

### What each one does (the physics to model)

- **Backstay:** tightens the forestay (less sag, so a flatter jib that points higher) and bends the mast (flattens the main and opens its upper leech). Ease it for power in light air or chop.
- **Vang:** holds the boom down and controls main leech twist. It matters most off the wind, when the mainsheet no longer pulls the boom down.
- **Outhaul:** depth in the lower main. Ease for power, tighten to flatten.
- **Cunningham and halyards:** luff tension, which moves the draft forward and opens the leech. The fix when the draft blows aft as the breeze builds.
- **Traveller:** sets the boom's angle to the centreline without changing twist, which sheet tension controls.
- **Mainsheet:** angle and twist together. Trimming hard closes the leech.
- **Jib sheet and cars:** sheet tension sets the angle. Car fore–aft sets twist: forward makes a deeper jib with a tighter leech, aft a flatter jib with an open top. Car in–out sets the sheeting angle: inboard points higher in flat water, outboard gives more power and speed in chop or when reaching.
- **Downhaul vs. Cunningham:** both tension the main's luff. The downhaul (with its tackle) does the heavy lifting; the Cunningham fine-tunes it.
- **Winches:** the jib sheet needs a winch to trim in a breeze, so trimming takes time and effort, while easing is quick.

### How it should play

- See each line in 3D: the piano, the thwart controls, the winches, the cars on the cabin-top tracks. Dual-ended lines show both tails moving together.
- Settings per sail, with crew defaults for each wind strength, and the option to work every line yourself (like today's trim switch).
- Telltales, the leech, the draft position and the speed readout respond, so you learn by feel and by numbers.
- Keyboard controls (rebindable) and a trim panel that groups the lines as they are on the boat: piano, thwart, winches.

### Defaults until someone's aboard to check (easy to change later)

- Mainsheet purchase: 4:1.
- Jib car pin positions: 7 fore–aft and 5 across, 25 mm apart.
- Downhaul: drawn as a gooseneck downhaul, cleat position approximate.

## Later

- Real past races with real wind and current (goal 4).
- More courses, and race-committee options (course changes, shortened courses).
- Phone and tablet layout (on hold: desktop first).
