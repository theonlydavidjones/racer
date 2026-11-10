# Folkboat Racing Sim

A Folkboat racing simulator for learning starting tactics, right of way under the Racing Rules of Sailing, and racing on San Francisco Bay.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules + simulation tests
npm run build      # static site in dist/ (relative paths, host anywhere)
npm run data:polar # re-pull Folkboat ORC certificates (behind a proxy: NODE_USE_ENV_PROXY=1)
npm run data:currents # re-pull NOAA tidal-current data for the Cityfront (same proxy note)
npm run data:wind  # rebuild the wind climatology from NOAA's Crissy Field station (same proxy note)
npm run build:artifact  # single-page build for the claude.ai artifact → artifact/folkboat-racing-sim.html
```

**Playing it:** the claude.ai artifact link is the playable version. It's built for desktop (keyboard plus trackpad or mouse); phone layout is on hold. It's rebuilt with `npm run build:artifact` and republished after changes; three.js loads from jsDelivr, pinned to the version in package.json.

The original single-file prototype is kept, unchanged, at `reference/folkboat-sim.html`.

## Controls (desktop)

Every key can be changed: Setup → **Keyboard settings**, or **K** in the game. Your keys are saved in the browser.

- **Tiller.** Click the water in cockpit or chase view, or press **T** in any view, to take the tiller. While you hold it, the cursor's left–right position *is* the tiller handle: the dashed line down the middle of the screen is straight ahead; right of it pushes the handle to starboard, which turns the boat to port (as on a real boat), and left of it turns her to starboard. The further from the centre, the harder over; the solid lines mark hard over. Over buttons and panels the tiller stays put, so you can reach them. Click again, **T** or **Esc** lets go (Esc never pauses while you hold the tiller), and the tiller springs back to centre. You can also drag the tiller bar at the bottom, or hold **A**/**D** to turn to port/starboard. There are no tack or gybe buttons: you put the helm over and hold it until she's round. (Earlier versions captured the mouse; browsers handle that badly, especially inside the claude.ai page.)
- **Views.** **1** cockpit, **2** chase (scroll or **+**/**−** to move closer or farther), **3** overhead, **V** cycles. In cockpit view you look over the helm's shoulder from behind the boat, so you see all of her; scroll (or **+**/**−**) to move your eye fore and aft. It's remembered.
- **Look around.** Arrow keys (or Q/E/R/F) turn your head; **W** looks ahead again. Looking never steers.
- **Overhead.** **N** switches between north up, bow up and wind up (saved). Scroll or **+**/**−** to zoom, drag to move the map, **B** (or the "Back to boat" chip) recentres on your boat.
- **Sails.** **S** luffs (hold), **O** whisker pole, Z/X and , / . work the sheets when you trim.
- **Other.** **H** hail, **M** course view, **L** message log, **P** pause.
- **Messages.** Notices stay up longer than before, the last few stay in the Messages panel at the right, and **All** (or **L**) opens the whole session's log, including incident explanations.

## Modes

- **Full race:** the start sequence, the course and the fleet.
- **Start practice:** see below.
- **Just sail:** open water, no fleet, no clock. Practise steering with the tiller, trimming, tacking, gybing and poling out. The HUD shows the polar target speed for your wind angle and how close you are to it.

## Layout

```
src/
  core/         math.ts (units, vectors, angles), rng.ts (seeded PRNG)
  geo/          geo.ts (lat/lon → local metres), shore.ts (Cityfront shoreline, grounding, distance to shore)
  environment/  wind.ts (synthetic oscillating breeze), current.ts (presets, shore relief, wind felt on the water)
  boat/         boat.ts (Boat state, fleet), polar.ts (ORC-based polar), dynamics.ts (forces: drive, drag,
                windage, turning), physics.ts (per-step steering, tacking, speed, trim, heel),
                data/nordic-folkboat-orc.json (written by scripts/fetch-orc-polar.mjs)
  rules/        pure RRS engine: rightOfWay.ts, pairs.ts (zone tracking, Rule 15 grace, incidents),
                geometry.ts (overlap, hull gap, CPA), explain.ts (rule text, explanations, banner text)
  ai/           ai.ts (pre-start holding and approach, beating, laylines, marks, shore, rules-based avoidance)
  courses/      data/*.json (one file per course), course.schema.json, course.ts (loader), registry.ts
  sim/          world.ts (World: fixed 60 Hz step, lines, marks, signals, incidents), events.ts
  replay/       recorder.ts (10 Hz snapshots), replayView.ts (overhead wind-up incident replay)
  render/       three.js scene, boat meshes, landscape, floating labels
  ui/           HUD (pods, dial, map, situation banner, line aid), toasts, horn, 2D drawing helpers
  main.ts       wiring: input, setup screen, incident and results panels, the frame loop
scripts/
  fetch-orc-polar.mjs  pulls current ORC certificates for the class and writes the averaged polar
tests/
  diagram.ts    helpers for writing tests like rulebook diagrams
  boat.test.ts  polar vs ORC data, acceleration, slowing, turning, tack loss, wing-on-wing
  rules.test.ts classic rules scenarios
  sim.test.ts   course loading, reproducibility, OCS through the real line logic, AI completes both courses
```

### How the pieces fit

- **World** (`sim/world.ts`) owns all race state and advances it with `step(1/60)`. It never touches the DOM or audio; it emits events (`toast`, `horn`, `incident`, `finished`) that `main.ts` turns into UI.
- **Fixed timestep.** `main.ts` accumulates wall-clock time × sim speed and calls `step` in whole 1/60 s steps. Rendering runs at the display rate. With the same seed and inputs a race replays identically (there's a test for this). All sim randomness comes from `World.rng`; `Math.random` is used only for scenery.
- **Rules engine** (`rules/`) is pure: it gets boats (only the fields it needs), a context (race time, wind, marks) and a per-pair record, and returns who keeps clear, under which rule, and any incident. The pair record is the engine's memory (who was inside at the zone, who just gained right of way) and is passed in explicitly.
- **Courses are data.** Every file in `src/courses/data/` shows up in the course picker. Marks have lat/lon (or an offset from the line centre), legs give the rounding side and `round` or `pass`, the start line is either two fixed ends or a centre, bearing and length, and `obstructions` marks the line as an obstruction once racing. See `course.schema.json`.

### Boat model

- **Polar.** Averaged from four current ORC certificates for Nordic Folkboats (NED 737, NED 923, EST F51, EST F39). In 12 kt: 4.7 kt close-hauled at 40.7°, 5.9 kt on a beam reach. Below the beat angle the curve is shaped so that the ORC beat angle really is the best VMG angle; nothing sails below 25°.
- **No spinnaker.** The certificates assume a 24 m² spinnaker; Folkboats race without one. Jib-only downwind speeds are derived from the certificates' own dead-run data: drive ∝ sail area × apparent wind², with main + poled-out jib (26 m²) instead of main + spinnaker (43 m²). Result: 85% of spinnaker speed in light air, 93% near hull speed; 4.3 kt dead downwind in 12 kt. The spinnaker version is still available (`new Polar(data, { spinnaker: true })`).
- **Speed.** Forces, not a fixed lag: drive is set so the boat settles at its polar speed; hull drag comes from the certificate's wetted surface plus wave drag rising toward hull speed; flogging sails and rig windage slow the boat when it luffs or points too high. Calibration (12 kt): 1 kt → 90% speed in ~12 s; luffing halves speed in ~13 s, then the boat stops and loses steerage; shooting head to wind carries ~3.5 lengths; a tack takes ~7 s, slows to ~58% and costs ~0.9 lengths. `tests/boat.test.ts` pins these ranges. All tuning constants are in `HANDLING` in `src/boat/dynamics.ts`.
- **Downwind: wing-on-wing.** The polar has three sail plans: `jib` (sheeted normally, on the main's side: blanketed by the main when deep), `wing` (poled out to windward with the whisker pole: only fills within ~15–20° of dead downwind, aback on a reach) and `main` (jib not drawing while the crew handles the pole). Each plan's speed comes from the sail area actually drawing, using the same dead-run drag model. In 12 kt dead downwind: 3.95 kt normal, 4.26 kt wing-on-wing; poling out pays from ~153° TWA; best downwind VMG ~168°. The crew takes 8 s to set the pole, 5 s to stow it, and gybes it end-for-end (8 s) when you gybe. Use **Pole** or **O**. The HUD suggests the pole when you run deep without it and warns when it's left out on a reach. AI boats pole out when running deep and stow before rounding marks.
- **Build.** Your boat is fiberglass with an aluminium mast and boom; the AI fleet is wooden. Class rules give both the same minimum weight and they race on equal terms, so build changes looks only (`build` in `FLEET`, `src/boat/boat.ts`).
- **Easing sails to slow down** works upwind and reaching (the sails flog). From a broad reach to a run, eased sails still fill against the shrouds, so it barely slows you: head up first.
- **Turning.** Turn rate = speed / turning radius (9 m), up to 22°/s, down to 4°/s when nearly stopped. Turning bleeds speed.
- **Uses of the polar.** AI close-hauled courses, the dial's no-go zone and the laylines use the polar's beat angle (it changes with wind speed) instead of a fixed 42°. The line aid's "time to line" and the AI's start approach assume you sheet in now and accelerate from your current speed, and the AI allows for coasting when it eases sails.

### Start practice

Setup → Mode → **Start practice**. You begin one minute before the gun, somewhere below the line. Fifteen seconds after the gun the race pauses for a debrief:

- where you were at the gun (distance from the line, speed as a % of full close-hauled speed, position along the line), when you crossed and your place in the order across the line;
- which end was favored and by how much (in metres upwind);
- a grade (great, good, late, slow, over early) with specific tips (how many seconds to turn earlier, when to sheet in, what the current was doing);
- an overhead replay of the last 45 s, with every boat's position at the gun marked.

**Same start again** replays the identical setup (same seed: same boats, wind and positions). **New start** draws a new one; **Keep racing** carries on with the race. The debrief logic is `src/sim/startDebrief.ts`.

### Rules

Checked against the official 2025–2028 rulebook (World Sailing, with changes and corrections, July 2025). Implemented: 10, 11, 12, 13 (including two boats tacking at once), 15, 16.1, 16.2, 17, 18.1(a), 18.2(a) to (d), 18.3, 18.4, 19, 20 (hail, "You tack" reply, and the hailing boat tacking after the response), 21.1, 21.2, 21.3, 23, 31 (including the committee boat), 43.1(a) and 44.1(a), plus a right-of-way boat forced to swerve (14). Rule numbers follow the 2025 edition: returning to start and taking a penalty are now 21.1 and 21.2 (they were 22.1 and 22.2), and mark-room at the zone is 18.2(a), which ends under 18.2(b) when the entitled boat passes head to wind or leaves the zone.

- **Windward and leeward** are sides, as in the Definitions: on starboard tack the boat on the other's starboard side is windward, whoever is farther upwind. (Close-hauled, a boat half a length ahead and a few metres to leeward is still the leeward boat.)
- **18.1(a):** no mark-room between boats on opposite tacks on a beat to windward; port/starboard decides.
- **18.3 (tacking in the zone):** a boat that passes head to wind from port to starboard inside the zone of a mark left to port, near a starboard boat that is fetching the mark, gets no mark-room from her (18.2 doesn't apply between them). If that boat has been on starboard since entering the zone, the tacker must not make her sail above close-hauled to avoid contact, and gives her mark-room if she gets inside. "Fetching" is approximated as being able to reach a point just to windward of the mark on starboard without sailing above close-hauled.
- **18.2(c) and (d):** once 18.2(a) has ended (the entitled boat passed head to wind or left the zone), an outside boat still gives an inside overlapped boat mark-room while one of them is in the zone. Not if the inside boat got her overlap from clear astern or by tacking to windward when the outside boat couldn't give room from that moment (no room between her and the mark).
- **18.4 (gybing in the zone):** an inside overlapped boat with right of way that must gybe at the mark to sail the next leg may not sail on past it, farther from the mark than she needs, taking the outside boat with her.
- **19 (room to pass an obstruction):** the shore (with the Fort Mason piers) and, after the start, the committee boat. When boats are overlapped there, the outside boat gives the inside boat room between her and the obstruction (19.2(b)); squeezing her toward it is the outside boat's foul, unless there was no room from the moment the overlap began. The inside boat still keeps clear in other ways (bearing down onto the outside boat is still her foul). Along the shore, a continuing obstruction, a boat that comes from clear astern into a gap that isn't there gets no room and keeps clear (19.2(c)). Before the start the committee boat is a starting mark, not an obstruction, so there's no room for barging there.
- **21.3:** a boat moving astern or sideways to windward by backing a sail keeps clear. The rule is in the engine, but the boats can't sail backwards yet, so it doesn't come up.
- **23:** a boat that has finished (not racing) mustn't interfere with boats still racing (23.1); and you mustn't go out of your way (turning toward her, or above your proper course after the start) to hinder a boat on another leg, doing turns or returning to start (23.2). Sailing your proper course past her is fine.
- **31 (touching a mark):** touching a starting mark before you start (the committee boat too, when the line has one), a mark of the leg you're sailing (the one you're heading for or the one you just left), or a finishing mark is a one-turn penalty (one circle, with a tack and a gybe), whatever the Part 2 penalty setting. The AI gives marks room and takes its turns away from them. Boats bounce off the committee boat whenever they hit it.
- **43.1(a) (exoneration):** if another boat's foul compelled you to break a rule (she forced you to swerve, and you swerved into a third boat), you're exonerated: no penalty, and the replay says so. Approximated as: you fouled within 3 s of being fouled by a different boat.
- **44.1(a):** a Part 2 foul and a mark touch in the same incident (within 8 s) cost only the Part 2 penalty.

- **16.1:** a right-of-way boat that turned more than 12° toward the other boat in the 3 s before an incident didn't give her room to keep clear, and is the one penalized. Slow, steady course changes are fine; turning away is fine.
- **16.2:** on a beat, a starboard boat that bears away onto a port boat ducking behind her breaks 16.2 (16.1 covers other course changes).
- **17:** if a boat clear astern gets an overlap to leeward within two lengths, she may not sail above her proper course while that overlap lasts (after the start signal; there's no proper course before it). "Proper course" is approximated as straight at the next mark if she can lay it, close-hauled if not, and no deeper than the best downwind angle. The situation banner says when Rule 17 restricts you or the other boat.
- **20 and hails:** close-hauled near the shore with a boat on the same tack to windward stopping you tacking, you may hail "Room to tack!" (**Hail** / **H**); the hailed boat must start to tack within 5 s. AI boats pinned against the Cityfront hail you, a banner counts down, and ignoring it is a foul. The hailed boat may instead reply "You tack" at once and then give the hailing boat room to tack and pass astern (20.2(c)): when an AI boat hails you, **H** replies "You tack"; when you hail an AI boat that is clear ahead with room for you to tack under her stern, she replies "You tack" and you should tack. Rule 15's grace doesn't apply to a reply (it's the other boat's own action). Once the hailed boat responds (by tacking or replying), the hailing boat must tack as soon as possible (20.2(d)); the game gives 5 s for each response. On starboard with a port boat converging, Hail calls "Starboard!" and she ducks earlier. Hail when you're not entitled to and it explains why not.
- **Penalties.** A Part 2 foul (Rules 10–22) costs a two-turns penalty (RRS 44.1): two full turns, each with a tack and a gybe, in the same direction. Turns only count in one direction: wiggling back and forth doesn't finish it. Sailing instructions sometimes reduce this to one turn, so Setup has a **Penalty** setting (two turns, the rulebook default, or one). Touching a mark (Rule 31) is always one turn. Being on the course side at the start under SI B1.1 is still two turns.
- Incidents before the start signal now count. (In the prototype, a timer started at −1 s, so collisions before the gun were never judged.)

### The afternoon westerly, puffs and lulls

Setup → Wind → **Afternoon westerly** (the default), then a light, typical or windy day. It uses the same race day and start time as the tide (Setup → Race day), and the graph shows the wind (green line) as well as the current.

- **From the records.** Five years (2021–2025, 43,745 hours) of NOAA's hourly wind at its San Francisco station (9414290, on the shore at Crissy Field, the west end of the race area), summarized by month and hour (`scripts/fetch-wind-climate.mjs` → `src/environment/data/sf-wind-climate.json`). Light, typical and windy days are the 25th, 50th and 75th percentile of the westerly hours. The westerly fills in through the day and follows the clock during the race: in July it builds from about 7 kt at 11:00 to about 12 kt at 16:00 at the station; in November it's lighter and blows on only about half of afternoons (the setup note says how often).
- **Open water vs the station.** The station is on the shore, where the land slows the wind; out on the race course it blows harder. The sim assumes open water is 25% windier than the station (an estimate, not a measurement), easing to 80% of that at the shoreline, so the field matches the station at the station.
- **The slot.** Up to 20% more wind along a band from the Golden Gate toward Alcatraz and Angel Island, where the westerly funnels in; less close to the Cityfront.
- **Puffs and lulls.** Patches of stronger and lighter wind, longer downwind than across, drifting downwind at a bit less than the wind speed and fading in and out over one to three minutes. A puff is up to about a third stronger and veered a few degrees (wind brought down from aloft is veered in the northern hemisphere); a lull is lighter. How strong they are follows the gust factor in the records. Every boat feels the wind where she is.
- **Seeing them.** On the water, puffs are darker and rougher with denser ripples (rough water reflects less of the bright sky), lulls paler and smoother, with whitecaps from about 12 kt; the ripples lie across the wind. They show as dark and pale streaks on the course map and course view, and the wind readout says "puff" or "lull".
- **Presets.** 8, 12 and 18 kt are still there (steady mean wind, with the same slot, shore and puffs).
- Not modelled yet: the wind bending along the shore, the fog and the evening fade beyond what the hourly records show, and the AI deliberately sailing to the pressure.

### Real tides and currents

Setup → Current → **Real tide** (the default), then pick the race day and the time of the start signal. A graph shows the current at the start line through the day, with the gun and the length of a race marked, and a line like "Ebb 0.8 kt, building · turns to flood ~22:45".

- **Where it comes from.** NOAA's tidal-current predictions for six stations around the race area: east of the Golden Gate Bridge (SFB1203), the north side of the channel (SFB1202), southwest and north of Alcatraz (SFB1204, SFB1211), off Pier 35 (SFB1205), and off Crissy Field (PCT0286, where the flood is weak and turns early along the Presidio shore). `scripts/fetch-currents.mjs` downloads each station's tidal constants once (8 KB); the game then predicts the current for any date and time with no network, by summing the tidal constituents with their yearly corrections (`src/environment/harmonics.ts`). The Crissy Field station is derived from SFB1202's slacks and peaks with NOAA's time and speed offsets. The tests check the predictions against NOAA's own: within about 0.03–0.08 kt typically (worst case under 0.2 kt).
- **Across the water.** The station currents are blended by distance, then eased near the shore (25% at the beach, full strength 350 m out), since no station sits right on the Marina Green or Fort Mason shoreline.
- **Through the race.** The current changes as the race goes on: the HUD clock shows the local time, the course map draws the current across the water (arrows longer where it's stronger), and the map corner shows the current where you are.
- **Presets.** Slack, flood and ebb presets (uniform, with the same shore relief) are still there for practice.
- Not modelled yet: eddies behind points, and the difference between surface and deeper current.

### Sea state

- **Chop** from the wind over the water and the fetch (open water upwind, measured on the real coastline, averaged across the directions around the wind as the Shore Protection Manual does), by the standard fetch-limited growth laws (JONSWAP). The Central Bay's fetch is short, so the westerly makes a short, steep chop: about 1 ft at the start line in a 20 kt westerly at slack, 1.5 ft on a 2 kt ebb, more out in the channel.
- **Wind against tide falls out of the physics.** Waves are made by the wind over the *water*: an ebb under a westerly adds to that wind and slows the waves over the ground, so they stay under the wind longer and grow bigger; a flood does the opposite. Where waves run into a stronger opposing current they shorten and steepen (wave action is conserved), and if it's too strong for them they break.
- **Swell** from the San Francisco Bar buoy (NDBC 46237, 2019–2025): a small, typical or big day for the month (about 2 m at 13 s in winter, 1.1 m in late summer, outside the Gate). It comes in through the Gate, fans out and dies away inside, and the islands and points shadow it. How fast it dies is an estimate: there's no wave buoy inside the Central Bay to check it against.
- **What it does to the boat:** added resistance in waves (the standard ρ·g·H²·B²/L form), worst head-on and with waves about a boat-length long, which is exactly the Bay's chop. A pinching boat loses a bigger share of her speed to it, so **footing pays in a seaway**: the best upwind angle widens by a couple of degrees in 2 ft of chop and more in light air or bigger seas. The AI, the laylines, the tack targets and the speed target all sail to it. Calibrated so 2 ft of boat-length chop costs about a tenth of a Folkboat's upwind speed: a judgement, not a measurement. The sea also knocks her bow about, most with it on the quarter.
- **On the water:** the same waves you sail in, drawn as a sum of Gerstner waves (chop and swell, heights from the wave spectrum where you are, bigger or smaller elsewhere from a sea map), with whitecaps on the crests from about 15 kt (more where the chop is steep), and the sky's reflection off each wave face. The boats heave, pitch and roll on them. The cockpit view rides with the hull but keeps the horizon level.
- **Settings:** real waves or flat water, and the swell day. The HUD shows the chop and swell where you are.
- Data: `scripts/fetch-swell.mjs` (`npm run data:swell`) for the buoy climatology; `scripts/make-land-mask.mjs` makes the coastline mask from the terrain.

### Sun, sky, the land and the landmarks

- **The sun where it really is** for the race day and the clock (NOAA's solar position algorithm, for the Cityfront; `src/environment/sun.ts`, tested against noon heights and sunset times). It sets the light's direction, colour (warm and low late in the day) and strength, and the shadows: sails shade the deck and the water.
- **The sky** is a physical sky model (Preetham, from three.js) with scattered cloud, exposed for this renderer; after sunset a twilight glow toward the sun fades over the next half hour or so, and the light dims and cools without going black (you can still sail). The haze toward the horizon matches the sky: blue-grey by day, warm near sunset, deep blue at dusk.
- **On the water:** the sun's glitter path (the ripples break the reflection into sparkles), and the sky reflected at a glancing angle, so the water toward the horizon goes pale.
- **The summer fog bank** over the Golden Gate and the headlands: thickest on summer afternoons and evenings, often lingering on summer mornings, rare in winter. How much there is by month and hour is an estimate (no fog records are reachable from here), and it's scenery only: it doesn't change the wind.
- **The Golden Gate Bridge** from its published dimensions: a 1,280 m main span between towers 227 m above the water, 343 m side spans to the anchorages, the roadway about 67 m up on its stiffening truss, two main cables sagging about 143 m with suspenders every 15 m, stepped tower legs with art-deco portal struts above the roadway and X-bracing below, in International Orange. Its roadway lamps and the towers' red aviation lights come on around sunset. Centre point and axis from published coordinates; positions within a few tens of metres.
- **Real terrain** for everything you can see from the course, out to Mt Tamalpais 25 km away: the Presidio and the city's hills, Twin Peaks and Mt Sutro, the Marin Headlands, Sausalito and Tiburon, Angel Island, Alcatraz, Yerba Buena and Treasure Island. Elevation from the open terrain tiles on AWS (USGS 3DEP/NED), resampled to a 50 m grid (`scripts/fetch-terrain.mjs`, `npm run data:terrain`; a 40 KB image, no network in the game). Along the Cityfront the land follows the sim's own coastline, the one you run aground on. Coloured by what's there (city, the Presidio's woods, grassland with scrub on the north-facing slopes, chaparral up on Tamalpais, beaches and cliffs) and by the season of the race date: the hills are gold from late spring until the first rains, green through winter.
- **The city:** about 17,000 buildings placed by neighbourhood (the Marina's low houses, Pacific Heights and Russian Hill, North Beach, the Financial District's and SoMa's towers, the avenues beyond), and smaller, sparser towns across the water. Not individual real buildings, except for the landmarks. City lights come on at dusk.
- **Landmarks you sight and steer by, at their real positions and heights:** Fort Point under the bridge; the Palace of Fine Arts rotunda and its colonnades; the St. Francis and Golden Gate yacht clubs and the GGYC flagpole; Fort Mason's pier sheds; Coit Tower on Telegraph Hill; the Transamerica Pyramid, Salesforce Tower and the Ferry Building's clock tower; Sutro Tower on its hill; the Bay Bridge's west span to Yerba Buena Island; Alcatraz's cellhouse, lighthouse and water tower; and the lighthouses at Point Bonita, Lime Point and Mile Rock. Positions from the DataSF building footprints, the USCG Light List (via the YRA marks list) and published coordinates, mostly within 5–15 m; the bridge towers and Alcatraz's cellhouse within a few tens of metres.
- The race-day graph on the setup screen shades the hours after sunset and says where the sun is at the gun.

### The boat model (3D)

`src/render/hull.ts` builds a Nordic Folkboat from a handful of functions along the hull: the sheer, the half-beam, the section shape (V-shaped forward, slack bilges amidships), the canoe body and the long keel with its cutaway forefoot (1.2 m draft), and the stern, where the raked transom and the sternpost are one straight line from the heel of the keel to the deck. Class figures are used where known (7.64 m overall, about 6 m on the waterline, 2.20 m beam, 1.20 m draft); freeboard, sections, keel profile, cabin and cockpit sizes are estimates from the boat's well-known look, not from the lines plan.

- **Clinker planking** (nine strakes a side) on every boat: the wooden ones are built that way and the glassfibre ones are moulded to match. Each plank overlaps the one below, with a shadow line under each lap.
- **Paint:** bottom paint, a boot stripe and topsides colour per boat; wooden boats painted or varnished, glassfibre glossy.
- **Deck and fittings:** cambered deck with a varnished toerail; cabin trunk with a rounded front, portlights, wooden grab rails, a sliding hatch, the companionway and a compass on its aft end; a cockpit well that narrows aft with the hull, with seats and coamings; the mainsheet down to the transom.
- **Rudder and tiller** hung on the transom; they swing as the boat turns (pushing the tiller to starboard turns her to port).
- **Josephine** (your boat): pearl-white glassfibre hull, pale green non-skid deck, cream cabin sides, her name on both quarters.
- The rig is lifted to sit on the real deck height (the sails and spars are unchanged).

### Sails and trim

- **Trim physics** (`src/boat/trim.ts`). Each sail has a sheet angle. Its angle of attack is the apparent wind angle minus that; each sail drives best at one angle of attack (main 22°, jib 18°). Ease past it and the sail luffs (drive falls fast: gone 12° past); trim past it and it stalls (drive falls slowly, to about half). From a broad reach to a run the sails just want easing right out. Pointing too high luffs the jib even with the sheet hard in.
- **Every line on the boat** (`src/boat/controls.ts`), laid out as on Josephine:
  - *Cockpit thwart* (a wooden plank across the cockpit, in front of the helmsman): mainsheet and traveller. Together they set the boom angle (the car, under the end of the boom, swings it about ±9.5°); the sheet's tension closes the leech.
  - *Thwart ends:* backstay, a dual-ended control cleated at each end of the thwart where it meets the hull, so you can reach it from either side. The bridle on the transom flattens the main by bending the mast, and the jib by tightening the forestay.
  - *Piano* (aft end of the cabin): vang (holds the leech closed once the sheet is eased; matters most off the wind), outhaul (depth in the lower main), Cunningham and downhaul (luff tension: pull the draft forward), jib Cunningham.
  - *Winches:* the jib sheet, hauled in on the leeward winch: slower as the breeze builds (not self-tailing), quick to ease.
  - *Cabin top:* a jib car each side on an H-shaped track, pinned fore–aft (forward: deeper jib, closed leech; aft: twist off the top) and athwartships (the sheeting angle). You can only move the lazy (windward) car; it takes effect after the tack.
  - The halyards are set before the race and left alone.
- **Shape.** The lines set each sail's depth, draft position and twist; the wind blows the draft aft as it builds. The fastest shape depends on the wind and the point of sail, following standard trim practice: full with some twist in light air; full power with the leech closed in medium; flat, draft forward and twisted to spill power in a breeze; fuller off the wind with the vang controlling twist. Missing it costs up to about 8% of drive. The 3D sails show the depth, draft and twist.
- **Who trims.** The **Trim** button cycles: *crew* (they trim everything: once a second they work out the settings that come closest to the fastest shape, and set the lazy jib car before each tack), *sheets* (you trim the sheets; the crew works the other lines) and *all* (you work every line). **Lines** in the trim panel lists every line with its setting, grouped as on the boat, so you can watch what the crew does too. **[ ]** select a line, **; '** less/more (hold), or the −/+ buttons; the sheets also on Z/X and , / .
- **The shape readout** in the trim panel says what's off and which line fixes it: "Main: too full (outhaul, backstay on), draft aft (Cunningham, downhaul on) · Jib: shape good · shape 97%".
- **On the boat:** the traveller on its thwart across the cockpit, the backstay bridle and its control led to cleats at the thwart ends (pulled down as it goes on), the vang, the winches, the jib cars on their tracks and the sheets led through them (the lazy one slack), and the piano's cleats and lines.
- **Telltales** on your boat: three pairs on the jib luff (red on the port side of the sail, green on starboard, as on real sails), and one on the main leech at each batten. Windward ones lift and dance when you're luffing; leeward ones droop when stalled; leech telltales curl behind the main when it's over-trimmed; downwind they hang. Your sails are slightly see-through so the leeward telltales show through, as on real Dacron.
- **Sail shape detail.** A luff bubble when under-trimmed, flogging when let go, three battens, and a long, low rectangular window in the main parallel to the boom (1.8 m × 0.35 m, 0.3 m above it).

### Seeing the wind, the course and the laylines

- **Cassette-tape telltales.** Both upper shrouds carry a length of old cassette tape about 1.4 m above the deck, where you can see it from the cockpit. Each streams the way the apparent wind blows, droops when it's light (under ~6 kt apparent) and flutters.
- **Free look.** In cockpit and chase view, the arrow keys (or Q/E and R/F) turn your head. Looking never steers. W or the "Look ahead" chip faces forward again.
- **Course view.** "View the course" on the setup screen, or **Course** / **M** during the race (the race keeps running). It opens on one leg (your current one) with the others faded; step through with ◀ ▶, tap a leg in the list, or show the whole course. Drag to move, scroll or pinch to zoom. It shows every leg in order with numbers, the way round each rounding mark (green clockwise arc = leave to starboard, red counter-clockwise = leave to port), the side to pass each pass mark, the start/finish line, zones, laylines, wind, current and boats, plus a plain-language list of the legs with your current one highlighted.
- **Laylines.** Dashed lines on the water and on both maps for your next rounding mark: green = starboard-tack layline, red = port-tack. On beats they use the polar's beat angle; on runs, the best downwind angle (wing-on-wing). Both allow for the current at the mark. Before your start they point at the first mark. Turned off with the training aids.

### Changes from the prototype

The port keeps the prototype's behaviour. These differences are deliberate:

- Three.js r128 → r187. Colour management is turned off and light intensities are scaled by π so the scene looks the same as before.
- Sub-steps are now exactly 1/60 s (they used to be "up to 1/60 s"), and replay snapshots are exactly every 0.1 s.
- AI decisions and boat placement use a seeded RNG instead of `Math.random`.
- Added `[hidden]{display:none}` and `box-sizing` rules. The prototype relied on its host page for these; standalone, the hidden overlays covered the screen.

## Build plan

See [ROADMAP.md](ROADMAP.md) for what's planned, including full sail controls (backstay, vang, outhaul, Cunningham, halyards, traveller, jib cars and winches).

## Known gaps

- Acceleration, slowing and turning are calibrated from physics and sailing judgement, not measured on a real Folkboat. If your boat feels different, the constants in `HANDLING` are the place to adjust.
- Above 24 kt the polar is held flat (no depowering model yet). No sail trim beyond automatic.
- AI starts: on the Seaweed Soup line, median 5–11 s after the gun in slack and ebb, ~25 s in flood, almost never over early. On the short training line they're slower (crowding). The AI keeps clear, takes penalties in clear water, won't tack when too slow to make it, and doesn't sail on a broad reach expecting to slow down by easing sails.
- Wind shifts are still a synthetic oscillation on top of the westerly; puffs are random (seeded), not forecast. Current between the six NOAA stations is interpolated, not modelled hydrodynamically.
- The shoreline the boats sail against is hand-traced (Fort Point to North Beach); the terrain is real, and is fitted to it along the Cityfront. Fort Mason's piers in the sim's coastline sit 50–130 m east of the real ones. Marin, Angel Island and Alcatraz are scenery: you can't run aground on them yet.
- Rules not modelled yet: 14 (beyond the swerve check), 18.1(a)(2) (opposite tacks when only one boat must tack at the mark), 19 with another boat as the obstruction, 20.3 (passing on a hail), 22 (capsized, anchored or aground), and 43.1(b) and (c) beyond what the precedence already gives. Interference by wind shadow isn't modelled (the boats don't blanket each other's wind yet), so Rule 23 only covers physical interference. Boats can't back their sails, so Rule 21.3 never comes up.
- Fouls between two AI boats are penalized but not explained.
