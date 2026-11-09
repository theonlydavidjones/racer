# Build plan

What's planned, roughly in order. Done work is described in the README.

## Next up

- ~~Real SF Bay currents and tide timing~~ (done: NOAA stations, any date, offline). Later: eddies behind points, using NOAA's SFBOFS model output for the spatial detail between stations.
- ~~Afternoon westerly~~ (done: NOAA wind records by month and hour, the slot, shore effect, drifting puffs and lulls shown on the water). Later: wind bending along the shore, the AI sailing to the pressure, real wind for a past race day.
- **Remaining rules.** 18.4 (gybing at a mark), 19 (room at obstructions other than through a Rule 20 hail), 18.2(c)/(d), 21.3, 23, exoneration (43) and 44.1(a). Also detect touching the committee boat.
- **Real shoreline.** Replace the hand-traced Cityfront outline with real coastline data.

## Sea state, and reading the water (requested)

The principle: everything you see on the water comes from the same wind, current and wave fields that the boats sail in. A tideline is drawn where the current field really converges; a puff is dark because the wind really is stronger there. Reading the water should give you true information, as it does on the bay, and never decoration that lies.

### Sea state in the physics

- **Wind waves** grow with wind speed, fetch (distance of open water upwind) and duration, using a standard wave spectrum (JONSWAP). Inside the Central Bay the fetch is short, so the westerly makes a short, steep chop rather than big waves.
- **Ocean swell** comes in through the Golden Gate, long and low, and dies away inside the bay.
- **Wind against tide:** an ebb running out against the westerly shortens and steepens the waves, sometimes until they break (the classic chop off the Cityfront and at the Gate). Wind with the tide gives longer, smoother waves. This falls out of wave–current interaction, not a special case.
- **Effect on the boat:** added resistance in waves (slower, worse pointing in chop), pitching, harder steering, and the value of footing for speed in a seaway versus pinching in flat water.
- **Real time and configurable:** pick a sea state (flat, light chop, building, wind against tide, big ebb) or use real data. Swell height and period from the NDBC buoys (46026 San Francisco, 46237 SF Bar); the local wind sea computed from the wind and current fields. For past races, the archived buoy data for that day.

### What the water looks like (the cues sailors actually use)

- **Puffs and lulls:** darker, rougher patches where the wind is stronger, moving downwind across the water toward you; lighter, smoother patches in the lulls; cat's paws in light air. Whitecaps starting around 12 kt, foam streaks lined up with the wind in a strong breeze. Their shape and speed come from the wind field, so you can see a puff coming and judge when it will reach you.
- **Tidelines and current lines:** where currents of different speed or direction meet (along the edge of the Cityfront relief, off points like Fort Point and Blackaller), a line of foam, kelp and debris collects, the water texture changes across it, and sometimes the colour (brown, silty Bay water against clearer ocean water). Drawn where the current field converges, so the line is where the current actually changes.
- **Wind against tide on the surface:** visibly steeper, shorter, whiter chop where an ebb meets the westerly.
- **Eddies and boils** behind points and shoals: swirling, glassy patches.
- **Marks and moored boats:** buoys lean and trail a wake downstream in the current; anchored and moored boats swing to point into the current (or the wind, when it wins), as they do in the harbour before the start.
- **The water texture moves with the current** (flow-mapped normals), so you can see the set over the bottom against the wind waves.
- **Rendering approach:** a sum of Gerstner waves (or an FFT ocean) built from the wave spectrum, with the wind sea and swell as separate components; a foam and whitecap layer driven by wave steepness; a current-convergence map for tidelines and debris; a puff map from the wind field darkening and roughening the surface. Phone-friendly fallbacks come later.

## Looks: the boats and the bay (requested)

Same principle as the water: realistic means *recognisably the real thing*, and the details a sailor uses (a transit on the shore, the committee boat's flags, a wake) should be there and correct. Rough order: most realism for the effort first.

### The boats
1. ~~**A real Folkboat hull**~~ (done, from class figures and estimated lines; refine against the official lines plan if we get it): the deep, narrow hull with its sweeping sheer, the long keel with the rudder hung on the transom, the doghouse-style cabin trunk with portlights, the cockpit well and coamings, the tiller. Wooden boats lapstrake (clinker), with the plank lands visible; yours smooth glassfibre with a boot stripe and antifouling that shows when she heels.
2. **Materials and light:** physically based materials (gloss gelcoat, varnished wood, anodised aluminium, Dacron sails with seams and a little translucency), shadows (sails shading the deck, boats shading the water), and reflections of the sky.
3. **Crew:** helm and crew figures that hike out, move across on a tack, and sit where you'd sit.
4. **Bow wave, wake and spray,** sized by boat speed; boats pitch and roll in the waves once sea state is in.
5. **Rigging detail:** blocks, sheets and control lines (comes with the full sail controls), sail numbers and the class insignia.

### The bay
1. **Sky and sun for the race day and time:** the sun where it really is (we already know the date and time), glare and glitter on the water, and the summer fog bank pouring in through the Gate in the afternoon.
2. **Real terrain:** elevation data for the Presidio, Marin Headlands, Angel Island, Alcatraz and the city hills, coloured from land cover, instead of the hand-traced outline.
3. **Landmarks you steer and sight by:** the Golden Gate Bridge, Alcatraz and its lighthouse, the Palace of Fine Arts, Fort Mason's piers, the yacht clubs, Coit Tower, the Transamerica Pyramid. They're also transits for the start line and laylines, as racers use them.
4. **Marks and the committee boat:** real buoy shapes swinging to the current, a committee boat flying the actual signals (class flag, P, I, Z, U, black flag, individual recall X) in sequence: teaches the flags.
5. **The water itself:** see Sea state above (waves, sky reflection, foam, tidelines).
6. **Moored boats and marina life** in the harbour behind the line; traffic (see below).

## Ship traffic and wakes (later)

- Vessels passing through the race area on realistic routes: container ships and tankers in the Central Bay traffic lanes, Alcatraz and Sausalito ferries and Blue & Gold / Red and White tour boats from Piers 39–41, Coast Guard boats, pilot boats.
- **Wakes** with the real Kelvin pattern (about 19.5° each side of the track), arriving well after the ship has passed, and hitting the boat as a short burst of steep waves (slowing her and knocking her off course).
- **Rules:** these vessels aren't racing, so the Racing Rules don't apply to them: the collision regulations (IRPCAS) and the traffic scheme do. Keep out of the way of big ships in the lanes; five short blasts mean danger. A teaching moment in itself.

## Full sail controls (requested)

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
| Mainsheet | Main | Boom end to the traveller car on the transom | Purchase unknown: model 4:1 (typical for a keelboat this size) until counted |
| Traveller | Main | Transom | Dual-ended |
| Backstay | Rig | Both sides of the transom | Dual-ended |
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

- See each line in 3D: the piano, the transom controls, the winches, the cars on the cabin-top tracks. Dual-ended lines show both tails moving together.
- Settings per sail, with crew defaults for each wind strength, and the option to work every line yourself (like today's trim switch).
- Telltales, the leech, the draft position and the speed readout respond, so you learn by feel and by numbers.
- Keyboard controls (rebindable) and a trim panel that groups the lines as they are on the boat: piano, transom, winches.

### Defaults until someone's aboard to check (easy to change later)

- Mainsheet purchase: 4:1.
- Jib car pin positions: 7 fore–aft and 5 across, 25 mm apart.
- Downhaul: drawn as a gooseneck downhaul, cleat position approximate.

## Later

- Real past races with real wind and current (goal 4).
- More courses, and race-committee options (course changes, shortened courses).
- Phone and tablet layout (on hold: desktop first).
