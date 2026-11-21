# Aboard Josephine: what the sim needs from the owner

Kept by the Coordinator. Sessions add asks here, not only in messages; an item is struck with the owner's answer and date when it's used (CLAUDE.md, Records).

Source: origin/main, plus git history where main points to it. Items marked (history) come from handoff docs that are not in main's tree. Line numbers are on main as of 20 Nov 2026.

## If you only have an hour at the dock

- 1.1 Jib cars: tape the car's center off the centerline and aft of the forestay pin; count the holes and the pitch.
- 1.2 Tiller: photograph hard over each way from straight above; tape the tip off the centerline, the pin height and the tiller length.
- 1.3 Backstay plates: tape each plate off the centerline and forward of the deck's edge; check the tiller against the bridle legs at hard over.
- 1.4 Jumper turnbuckle: close-up photos with a ruler (turnbuckle, both stays, struts); tape its height; read its thread pitch.
- 1.6 Lines: count the parts in the mainsheet, vang and both halyard tackles; photograph the Cunningham and outhaul leads.
- 1.8 Sails: read the tags (luff, foot, LP, maker, age); count reef points.
- 1.10 Heel at the dock: crew weight on the rail, phone inclinometer; and the yard's scale weight if you have it.
- 3.1 Tune: forestay mark, mast rake with a plumb weight, mast foot position, shroud turnbuckle pitch.
- 1.14 Mast bend: the mast's section (outside size, wall thickness); the main's luff curve laid out flat; the masthead's bend with the backstay on, jumpers at 0 and at 3 turns.

## If you're out sailing today

- 2.1 In irons: head to wind, sheets in, tiller centered; which way she falls off, how long, how fast astern.
- 2.2 Weather helm: photograph the tiller from above close-hauled in 12, 16 and 20 kt; note the true wind.
- 2.3 Turning circle: tiller hard over at 4–5 kt; time a 360 and a 720, and read the diameter off the GPS.
- 2.4 Tack: time, lowest speed and recovery, in 10–12 kt and in 6 kt.
- 2.7 Polar check: boatspeed against true wind angle and speed on each point of sail; the best tacking angle.
- 2.8 Heel: phone inclinometer close-hauled in 8, 12, 16 and 20 kt.
- 2.6 Heaving to: heading, forereach and drift on the GPS in 8 kt and in 15–20 kt.
- 2.11 Timings: stopwatch the hoists, drops, pole, winch trim and a jumper half turn.

## 1. At the dock: measuring and photographing

Ordered by accuracy gain.

**1.1 Jib cars (Boat Detail's waiting ask; Deep Physics car-lead).**
- **Do (tape, at the dock, sails off):**
  - Measure from the centerline to the middle hole of the athwartships bar, to the hole's center, on each side.
  - Measure from the pin in the forestay (the fitting where the stay meets the deck, not the stemhead) to the car's center block, two ways. First, a straight tape. Second, fore and aft along the cabin top, using a plumb line or square.
  - Count the athwartships holes and the fore-and-aft pin holes.
  - Measure the hole pitch both ways.
  - Measure the track's overall length and the bar's length.
  - Measure the forward end of the track against the grab rail's forward end.
  - Photograph from directly above, with the tape in frame.
- **Why:** it sets the jib's lead angle, and so every jib trim and the crew's car choice (`src/boat/controls.ts:96-114`, `CAR_AFT`, `leadAt`).
- **Sim now:**
  - Center 0.58 m, from North Sails' guide (58 cm).
  - Tape 2.65 m from the forestay pin, rise 0.06 m, which gives 2.585 m aft. The lead is 11.6–13.7°, 12.65° at the middle hole.
  - Pin pitch 0.024 m, from the drawing.
  - A photo reading gives 0.66 m. `josephine-confirmed.md` says "not yet measured" and notes the guide's numbers land on the grab rail, so one is off.
  - The pin counts of 7 fore and aft and 5 athwartships are "an estimate until counted" (`controls.ts:48`; ROADMAP 2288).
  - The track is drawn as a 5 in cross-bar by 7 in tracks (`boatMesh.ts:479`, `TRACK`).
  - `sheet-geometry.md` says the hole spacing should be about 0.5° a hole against the old 1.25°.
- **Also:** where the old side-deck track sits relative to the forward window (the owner's photo exists). Not needed for the physics.
- **Origin of the ask:** the Boat Detail handoff (COORDINATOR.md:74) says "Waiting on the owner: the jib car tape measurements". The wording of the ask, recovered from the Deep Physics handoff (history, a9a95050), is "the bar's center off the centerline, and the distance aft of the forestay pin".

**1.2 Tiller geometry and hard-over (ROADMAP 353; Deep Physics re-placing the tiller pin).**
- **Do (tape, phone photo straight down from above the after deck, boat at the dock):**
  - Swing the tiller to each stop and photograph both from above.
  - At each stop, measure the tiller tip's distance from the centerline and from the transom's top edge.
  - Note what stops it (deck, coaming, bridle leg).
  - Measure the tiller's pin-to-tip length.
  - Measure the pin's height above the transom top.
  - Measure the pin's distance forward of the aft deck edge.
  - Measure the tiller's rest height at the tip (the tip's height over the deck at the after coaming).
  - Check the two stops are symmetrical.
- **Why:** `HARD_OVER` is the tiller's swing each side, so it sets all steering (`balance.ts:99-120`). The re-placed pin is the held fix for the backstay-plate clearance (1.3).
- **Sim now:**
  - `HARD_OVER` 46.5°, fitted from 3 photos (41–49°). ROADMAP 353 lists measuring it as optional.
  - `TILLER.len` 1.2 m, rest 4°, pin 12 cm above the transom (`hull.ts:696-704`, all labeled ESTIMATES).
  - Deep Physics suggested 8 cm and 6°, a 46.8° stop; it was not shipped.
  - The comment in `balance.ts:108-113` says the tip's distance from the centerline with the tiller down on the deck "would make the stop a measurement".
  - The rudder stall of 40° is an estimate, and no dock check settles it (see 2.5).

**1.3 Backstay chainplates and bridle (ROADMAP 8q4). The owner gave "1 in forward of the aft edge, 6 in either side of the tiller", and main's code does not yet have it.**
- **What is still unconfirmed:**
  - Main still has `BS_CHAINPLATE_X` 0.3 m (`boatMesh.ts:1173`). The fix is on branch `claude/backstay-plates` (3414f103), which uses 0.17 m out and 2.5 cm forward. It is held because the tiller root comes within 2.7–4.5 cm of the bridle legs in the last 4° to hard over, and the test needs 4.8 cm.
  - Whether "6 in from the tiller" means the plate's center or its inner edge, and whether it is measured to the tiller at rest or at hard over.
  - The bridle legs' attachment points, and the bridle apex height with the backstay slack and fully on.
  - Whether the tiller actually touches the legs at hard over.
- **Do (tape):**
  - Measure from the centerline to each plate's center (inches, both plates).
  - Measure from the aft deck edge to each plate center.
  - Measure the plate size.
  - Measure the ensign socket's distance from the centerline, from the toerail's inner face, and from the starboard plate.
  - With the backstay fully slack and then fully on, measure the bridle leg length.
  - At both extremes, swing the tiller hard over each way and measure its clearance from the legs and plates. Photograph from astern.
- **Ensign staff (ruled 20 Nov by the owner: "move the ensign staff to halfway", between the toe rail and the starboard plate; Rigging, r248). Still worth a tape: the socket from the centerline, to check the drawing.** The note it replaced:
  - The staff is held at 0.46 m. Its old formula was midway between the toerail's inner face and a plate at 0.30 m (`boatMesh.ts:1181`), so the toerail's inner face is about 0.62 m out there. That is my arithmetic, not a figure in the repo.
  - With plates at 0.17 m, "equidistant from toerail and chain plate" would put the staff near 0.395 m. The two owner statements agree only if the plate really is where the code had it, or the toerail is further out.
- **Why:** the bridle sets the backstay's mechanical range and the tiller's real clearance. The sim draws the bridle foot at z 3.74 and apex travel 2.7 m down to 1.4 m, and the plate z is 3.64 on main (`boatMesh.ts:854`). `ropeScale.ts:36` gives the bridle as "about 1.3–1.5 m of rope: an estimate".

**1.4 Jumper turnbuckle and stays (parked redraw, 20 Nov; ROADMAP 2003).**
- **Which photo:** the code comment says the turnbuckle's low position on the after side is "inferred from the owner's photo of a Folkboat mast". It is not stated to be Josephine's, and it is not clear which file in `reference/photos` it is. It was identified as a jumper turnbuckle but not checked against class drawings. Photograph it fresh rather than trusting the old one.
- **Do (phone photos plus tape, at the dock, mast up):**
  - Photograph the mast from astern, close up, from the deck to 2.5 m up, with a tape or ruler against the mast.
  - Photograph both jumper stays in full, from the strut tip to the lower fairleads, from the side and from ahead.
  - Photograph the common turnbuckle itself with a ruler in frame, including its shackle and plate.
- **Measure:**
  - The turnbuckle's height above the deck or gooseneck, and its side of the mast.
  - Whether the two wires run down the after corners and meet at one turnbuckle.
  - The strut length and its fore-and-aft rake, and the height where each wire leaves the mast side.
  - The strut tip's height above the mast and how far each wire stands off the mast (this settles "the stays' rise to the struts looks wrong").
  - The turnbuckle's thread pitch (mm per turn), body size and wire diameter.
- **Sim now:**
  - Main draws both ends on the mast's front face (`boatMesh.ts:1122-1124`, `1262-1267`).
  - Class rule CR 7.60 puts the top at 8.5–8.75 m and the lower end at 2.235–2.265 m above the lower band.
  - Struts are 5.50 m up, 450 mm, tips 900 mm apart, per CR 6.1.12.
  - The branch put the turnbuckle just under the boom, inferred and not measured.
  - The turn pitch is unsourced.
  - Jumper effect per turn is `JUMPER.twistPerTurn` −0.6° and `depthPerTurn` −0.0008 (`rigTune.ts:218`, labeled estimates).
- **Settles:** where the turnbuckle sits (the redraw), the stays' geometry, and how much a turn bends the mast.

**1.5 Mast datum and freeboard (public rule, plus measured fact).**
- **Do (tape, at the dock):**
  - Measure the lower band's top edge above the deck at the mast, along the after face, with the deck's camber noted.
  - Measure from the sheer to the waterline at the mast, at the lowest freeboard point, and at the transom.
  - Do this with the usual crew weight aboard and the outboard on or off.
- **Why:** `RIG.BAS` is 1.00 and `hbi` is 0.65 from ORC and the Danish class sheet. ROADMAP 1904 says the class band would be about 4.5 cm higher; one of the two is nominal and the IMS text was unreachable. This moves rig heights by about 0.9% (induced drag and heeling arm).
- **Also:** overall length on deck and waterline length. `hull.ts:5` says the 7.64 m deck length "isn't confirmed" against 7.68 overall. Waterline is taken as 6.0 m.

**1.6 Mainsheet, vang and halyard-tackle purchases and leads (Rigging; "until counted").**
- **Do (count and photograph):**
  - Count the mainsheet parts and blocks, and photograph the boom-to-car arrangement.
  - Count the vang tackle's parts.
  - Count and photograph the main halyard tackle: parts, moving-block height up the mast, where it cleats.
  - Count the jib halyard tackle the same way.
  - Photograph the main Cunningham's route (the clam cleat, up the mast to a cringle above the tack).
  - Photograph the jib Cunningham's route (it may run below deck).
  - Photograph how the outhaul gets from the mast foot to the boom, and the lead through the foot block to the piano.
- **Why:** ROADMAP 2284 says "Purchase unknown: model 4:1". `boatMesh.ts:1000` says "tackle's purchase and exact height aren't known: drawn as 2:1, moving block about 0.4 m up (estimates)". Lines 923, 992-997 and 1116 call the vang parts, outhaul route and Cunningham cringle heights "estimates: not in the photos". The Cunningham cringle heights, 0.22 m for the main and 0.3 m for the jib, are labeled estimates. These drive rope-per-setting figures in `ropeScale.ts:20-30` (vang 4:1 "read off a photo", Cunningham, downhaul and halyard 2:1 "estimates").
- **Also:** rope travel per full range, in inches, at each line: vang, outhaul, each Cunningham, halyards, backstay. This is the `ROPE_IN` table.

**1.7 Piano halyard take-up (`controls.ts:407`, ROADMAP 8o).**
- **Do:** hoist each sail at the mast until it stops, then measure how many inches the piano tackle takes up the last of the hoist. Time that last take-up at the piano. Time how long the crew take to get from the mast to the piano.
- **Sim now:** 15 cm (6 in) of take-up and 5 s crew time, both estimates. The jib luff for take-up is given as 8.5 m, which looks wrong against `RIG` jib luff 5.95 m; measure the jib's actual luff from the sail tag or with a tape.

**1.8 Sails (data are from four other boats' ORC certificates).**
- **Do:** read the sail tags or measure each sail: luff, foot, leech, head and clew heights, the jib's LP (leading-edge perpendicular distance from the clew), maker, cloth, age and number of seasons.
- **Why:** `nordic-folkboat-orc.json` averages four other boats' certificates (NED 737, NED 923, EST F39, EST F51). The rig is built from `RIG`: P 8.75, E 3.38, J 2.00, jib luff 5.95, LP 2.36, main 18.45 m², jib 7.31 m². The sail-wear tier is chosen by hand from `SAIL_WEAR` new, mid and old.
- **Also:** whether she has reef points or cringles in the main, and what the jib's hanks and head fitting are. This unblocks the "reefing waits on a Folkboat source" item (ROADMAP 29, 1604-1640).

**1.9 Crew placement and weights (`balance.ts:62`).**
- **Do (tape):** with the crew sitting where they actually hike, measure from the centerline to their hips on the hiking rail or toerail. Record the crew's usual total weight.
- **Sim now:** `CREW` is 240 kg with a 1.05 m reach (labeled unsourced and estimate in docs/CONSTANTS.md:42). ORC's default crew is about 300–330 kg (ROADMAP 1912).

**1.10 Heel-and-stability check (inclining test).**
- **Do (phone inclinometer on the cabin top or thwart, at the dock in calm water):** with no wind, put a known crew weight standing on the toerail or hiking rail amidships, one side at a time, and note the heel. Note the heel at which the toerail would touch the water, or the freeboard to the toerail at the rail amidships.
- **Why:** `DECK_EDGE` 30° is labeled an estimate. The class freeboard gives about 27.5° (ROADMAP 1871). Stability comes from the average of three other boats' certificates: GM about 0.52 m sailing trim. `balance.ts:25` says the figures "are estimates for a Folkboat, not measurements."
- **Also, weigh her:** the yard's lift scale at haul-out. `displacementSailing` is 2329 kg from ORC averages, and ROADMAP 8i says the editor has a "weight over class minimum" setting. A fiberglass Josephine with an outboard aboard will differ from the class sheet.

**1.11 Outboard (low priority).**
- **Do:** confirm the make, model and hp. Measure the bracket position on the after deck and the shaft height out of the water. Note whether it has reverse.
- **Why:** the sim models 2.5, 3.5 and 6 hp Tohatsu motors (`motor.ts`), and defaults to 3.5. `outboard.ts` uses a transom-top height of 0.54 m from a forum measurement.

**1.12 Dock-handling dimensions (low priority).** Measure the real cleat positions (bow, midships, stern) along the hull and the fender size. Dock-line parameters in `dockLines.ts:24-33` and `202-215` are estimates (line damping, `CLEAT_MU` 0.3, hand pull 250 N, step gap 0.6–0.9 m, 0.5 m/s step speed, bump 0.5 m/s). A tape and your own judgment of safe step speed are the checks.

**1.13 Drawing dimensions "read off photos, estimates within a few cm" (lowest priority; cosmetic).** These are in `hull.ts` and `boatMesh.ts`: cabin light heights (`hull.ts:443`), cabin-top crown height at the front on the centerline (`hull.ts:484`), the cabin front's rake, thwart underside depth (`COCKPIT_FIT`, "ESTIMATES, uncited", `hull.ts:377`), the footrest hollow, the companionway sill (150 mm over the sole), the mast-foot plate, horseshoe and boot sizes (`boatMesh.ts:1212`), and winch pedestal height. A tape and straight-on photos settle them. The Tacktick unit's tilt (20° is an estimate) and its stand height can be checked in the same way.

**1.14 Mast section, the main's luff round and the masthead bend (r299, the mast-bend model; Rigging; added 21 Nov, the owner's ask).**
- **Do (tape and phone, at the dock, mast up):**
  - The mast's outside size at the boom band, fore and aft and side to side, in mm. If an end of the section can be seen (the masthead cap off, or the foot), the wall thickness, and a photo of the section's shape with a ruler.
  - The mast's maker or section name, if it's marked.
  - The main's luff round: lay the main flat on a floor, stretch a string from head to tack, and measure the luff's distance from the string every 1 m, the deepest point especially. Note the main's maker and model (e.g. North's "LM-5" or "LM-5A").
  - The masthead bend: with a halyard tied off at the gooseneck as a straight reference (or a sight up the mast's aft face), measure how far the masthead moves aft with the backstay off, half on and fully on. Do it twice: the jumpers at 0 turns, and at 3 turns. A phone photo up the mast's side with the halyard in frame works.
- **Why:** how stiff the mast is, and how much curve the main's luff has, decide what the jumpers and backstay do to the main in a breeze. North's guide (loose jumpers in a breeze) and Heikkilä's (tight) are each right for their own main (`docs/rig/jumpers.md`).
- **Sim now:** no published stiffness exists. Rigging estimates EI about 140 kN·m² fore and aft, ±30%, from the class rule's outside size and its 3.10 kg/m minimum (CR 6.2). The jumpers are a fixed −0.6° twist per turn (`rigTune.ts:218`, estimates). Without the measurements, the model is built on the estimates, labeled as such. The other source is class drawing No. 12 from the NFIA.

## 2. Underway: observing

Ordered by accuracy gain. Where the existing GPS tracks (2.4) can answer, use them first.

**2.1 In irons (the owner's r261 ask on the Owner's Requests page; Deep Physics waits).**
- **Note on the label:** `docs/data/owner-tracks/README.md` (branch `owner-tracks`, commit 92dfbf70) uses "r261" for something else: "tack times, speed loss and turn rate" from the owner's GPS tracks. Check the number on the Owner's Requests page before striking this item.
- **Do (stopwatch, boat's GPS or phone GPS, instruments for apparent wind, in about 8–12 kt true and again in about 15 kt if you can, flat water, no tide if possible):**
  - Luff head to wind with the main in tight (sheets in) and the tiller centered. Let go of the tiller.
  - Record whether she falls off by herself, which way, and how many seconds until she bears off 30° and 90°.
  - Record whether she goes astern, and her sternway speed from the GPS (speed over ground, ignoring tide) or by a thrown float and a count.
  - Record the time to stop.
  - Repeat with the tiller hard to each side.
  - Note the heading when she settles.
- **Why:** sternway and irons behavior are open and "unsourced either way" (ROADMAP 1856-1862; 62-65; 156-160).
- **Sim now:**
  - Held amidships head to wind she never sheers off.
  - Sternway is about 2.2 m/s in 22 kt and 2.7 in 28, from a sourced-by-analogy drag (`ASTERN`).
  - In irons with sails up she sculls at about 4°/s (`HANDLING.minTurnRate`, an estimate).
  - `SLOW_TACK` 1.3 m/s is unsourced.
  - In 6 kt held head to wind she makes a little headway as she rolls.
  - History (a5aec05b): the handoff asked "how she lies left alone with her sails down, and how long her bow takes to fall off". The sim's bare-poles result is 86° off the bow in about 80 s, drifting 0.5 kt, computed not observed.

**2.2 Weather helm, close-hauled in 15–20 kt (history; open owner ask, gates the rudder calibration).**
- **Do:** close-hauled and balanced, on each tack, in about 12, 16 and 20 kt true, photograph or video the tiller from directly above at the helm, with a protractor mark or a line along the boat's centerline for reference. Record the true wind. Estimate the tiller angle from the photo. Or note "two fingers" or "firm hand".
- **Sim now:** weather helm at the class rudder is 0.4° at 12 kt and 1.5° at 20 kt (history, a5aec05b). A trial branch calibrated to a published 2° general target gave 2.1°, 3.1° and 3.7°. `IDEAL_HELM` is 2.5°, unsourced. The Coordinator ruled on 14 Nov that "the owner has no figure", so this is still open. Also record the mast rake for this (see 3.1), since the plan was to calibrate the raked rig and the helm together.

**2.3 Turning circle and timed penalty turn (history; "Useful" ask; `physics.ts:52`).**
- **Do (stopwatch; GPS track):** at about 4–5 kt on a beam reach in light wind and flat water, put the tiller hard over and hold. Time a full 360° and a 720°. Read the circle's diameter from the GPS track. Repeat on each side.
- **Sim now:** `PENALTY_TURN_RATE` 10°/s is an "uncited estimate", and the comment says "The owner is to time one". The sim's 720 takes about 72–96 s. History says tiller hard over gives a circle in 35–45 s, and a real 720 is 30–45 s (unsourced). `HANDLING.turnRadius` 9 m is an estimate (the physics now computes the turn from forces).

**2.4 Tack: time, speed loss, heading change.**
- **Do:** close-hauled in 10–12 kt and again in 6 kt, with a normal crew, tack several times each way. Note the time from tiller over to settled on the new close-hauled heading, the lowest speed, the time to recover to full speed, and the true wind angle and speed on each side.
- **Sim now:** crew tack at 12 kt is 3.3 s head to wind, lowest speed 0.61 m/s, loss 3.4 s (history). ROADMAP 355: a tack loses 0.8–2.1 lengths. `TACK_WAY` 0.6, `OFF_TACK` and the tack gate are "fitted to two starts, not measured" (ROADMAP 239).
- **Note:** the owner's GPS tracks on branch `owner-tracks` already hold tacks from 7 Nov and 11 Jul. They give times, speed loss and turn rate without a new sail, but no wind (take it from NOAA/NDBC).

**2.5 Rudder stall and the helm's response (helpful side check for 1.2).** At 2–3 kt, hard over, note how the boat answers when you take the tiller from half to full: does the turn rate keep rising or fall off? The sim's stall of 40° is "an ESTIMATE", with no Folkboat figure found. The owner's quote, "no delay in the turn of the boat and the push of the tiller", is the current benchmark, and the yaw lag is 0.36 s at 4.7 kt.

**2.6 Heaving to (observation; `physics.ts:585-615`, ROADMAP 1455).**
- **Do:** heave to in about 8 kt and again in about 15–20 kt: jib backed, main eased, tiller lashed to leeward. Once settled, read her heading against the wind, her speed over ground (forereach) and her drift to leeward from the GPS. Time how long she takes to settle.
- **Sim now:** about 50–60° off the wind, 0.7 kt forereach in 8 kt and 1.5 in 20 kt, "forum and seamanship-guide figures, none measured". `HOVE.dragAft` 0.3 m is "TUNED, not measured". The ROADMAP asks for "a GPS track of a Folkboat hove to".

**2.7 Polar check: boatspeed against true wind angle and speed.**
- **Do:** with the instruments, record boatspeed, true wind speed and angle close-hauled, on a reach and on a run, in at least 6–8 kt, 10–12 kt, 15+ kt. Note the best tacking angle on each tack (add the two true wind angles).
- **Sim now:** the polar is the average of four other boats' ORC certificates, with the beat angle at about 41° in 10 kt, and `NO_GO` 25°. The pinch curve is unmeasured.

**2.8 Heel against wind.** With a phone inclinometer, record the heel angle close-hauled in 8, 12, 16 and 20 kt true, with a note of crew position and sail settings. The sim's 21–25° upwind from 18 kt is "the high end of practice" and the knee at 20° is unsourced (ROADMAP 1869).

**2.9 Flogging main's drag (ROADMAP 1774; paused until an observation turns up).** Close-hauled on the jib alone with the main let right off, at about 10 kt and about 18 kt, record how long she takes to drop from full speed to a given speed on the GPS. The sim has her slowing from 5.4 kn to 1.8 kn in 30 s in 18 kt (flog `CdA` 0.12 on the cloth, against 0.05 for flags).

**2.10 Coasting and sternway (public data cannot answer; the sim's astern drag is analogy-based).** In flat water with no sails, push or let her run astern from a standstill (a push-off) and time how far she goes, or the sternway speed from the GPS; also time how long she carries way ahead when luffed head to wind from 3–4 kt and the distance coasted. `ASTERN` is "AN ESTIMATE: no measurement of a small keelboat's resistance stern first". `STEERAGE` 0.5 m/s is an estimate; note the speed below which she stops answering the helm.

**2.11 Crew and line timings (VISION-ROADMAP 160; CONSTANTS 45, 82).**
- **Do (stopwatch, phone video):**
  - Hoist and drop each sail. The owner already gave 5 s each to hoist; the strike times of 4 s main and 3 s jib are marked "the owner's figure asked for" (`physics.ts:148`).
  - Set and stow the whisker pole (the sim has 8, 5, 8 s).
  - Trim the jib sheet in on the winch in 6, 12 and 18 kt, and ease it.
  - Move a jib car pin.
  - Time a tack and a jibe sequence.
  - Time a half turn on the jumpers' turnbuckle under load (the sim has 4 s).
  - Time a mainsheet full ease and full trim, and the traveler end to end.
- **Sim now:** `CONTROL_RATE` is mainsheet 0.12 per second, vang 0.25, outhaul 0.3, jib sheet 0.16, traveler 1–2 s end to end (the owner said releasing is very rapid and hauling slightly slower), and `winchFactor`.

**2.12 Motoring (low priority, ROADMAP 212).** On flat water in calm, record speed over ground against throttle (idle, half, full) with the sails down. Then repeat with the sails up on a reach, to see the motor and sails together. `FIGURE_OF_MERIT` 0.56, `REVERSE` 0.5 and `LEG_CDA` 0.010 are estimates.

**2.13 Bare-poles drift at the dock.** Let her lie at rest in wind with sails off, and note which way the bow falls, her heading to the wind and drift speed. The sim says about 86° off the bow, 0.5 kt, computed, and windage and the hull's height profile are labeled estimates (ROADMAP 161-166; 464-489).

## 3. Rigging and tuning

Ordered by accuracy gain.

**3.1 Josephine's actual tune (the sim assumes North Sails' guide).**
- **Do (tape, at the dock; photos):** measure:
  - Forestay mark: lay the forestay along the mast, mark it level with the gooseneck, and measure the mark's distance from the deck along the stay.
  - Mast rake: a plumb line or heavy weight on the main halyard from the masthead. Measure the gap behind the mast at the gooseneck and at the deck.
  - Mast foot: how far aft of the hole's after edge it sits, in mm.
  - The forestay's sag in cm at known wind (light and medium air, close-hauled, backstay off).
  - Each shroud's turnbuckle: thread size and pitch (mm per turn), wire diameter, and how many turns you actually use between light and medium air.
  - The mast section, make, and whether aluminum.
- **Sim now:**
  - Mark 1.31 m, foot 22/16/10 mm, shrouds 0/1.5/3 turns, jumpers 0/2.5/0 (`TUNE_PRESETS`, North Sails' guide).
  - Sag 8 cm in light air.
  - `FORESTAY.perTurn` 610 N and `perMmFoot` 110 N/mm, both labeled estimates and flagged.
  - Shroud turnbuckle pitch is assumed at 3 mm per ½ in screw.
  - Heikkilä's variant uses 1.355 m.
  - Mast bend is 125 mm (average aluminum); soft 145, stiff 105.
- **Why:** these set the tune effect on both sails and the helm. The rake was also the open question for weather helm (about 6° aft, center about 0.4 m aft, from history f4c24de6).

**3.2 Backstay (bridle) range and effect.** With the backstay fully off and fully on, measure the bridle apex's height and the length of the bridle's legs and wire. Record how much the forestay sag changes in cm (the sim has 8.0 cm to 3.7 cm in 17 kt apparent). `FORESTAY.backstay` 2500 N and the 60 mm full-range bend are labeled estimates.

**3.3 Mast stiffness (only when the mast is down).** Run the class bend test: 16 kg hung 4.8 m from the top, measure the deflection in mm (aluminum is 125 mm in the sim, from folkebaad.dk). This sets `MAST_BEND`.

**3.4 Sail shape (depth and draft) at known settings.** Take photos of each sail close-hauled from the cockpit, with the outhaul at its black band at both ends of the range, with the Cunningham and halyard tackle off and on. Mark the depth (camber over chord, in %) and draft position. The shapes `fullDepth` 0.145 and 0.141, targets of 12–14% depth, 46–48% draft and 7–13° of twist are all unsourced or fitted (ROADMAP 1853; docs/CONSTANTS.md). Photograph the telltale-stripe or draft-stripe positions if she has them. Old-sail wear: note the sail's age against the `new`, `mid` and `old` rows.

**3.5 Bilge pump (later feature; ROADMAP 1621-1630).** Note the pump type (manual or electric), its location, liters per stroke or per minute, and the bilge volume under the cockpit sole. Note how much water she takes aboard in rain. This is not built, but sourced pump rates are required.

## Public-data items (not for the owner)

- Tack, wind and tide checks from the owner's existing GPS tracks: the files are already on branch `owner-tracks`.
- Class bow lines and plans: public or the class (ROADMAP 9a, 737-752). The owner already has the plans, and has asked to come back to it.
- Fort Mason Center lettering, pier heights and the sheds' dimensions (`landscape.ts`): public survey and photo sources, and ashore, not Josephine.
- The rudder blade's outline: fixed by the class rules (CR 5.20), so public. `RUDDER.area` 0.42 m² against the class 0.56 m² is a physics choice, not a measurement.
- Dock-line stretch and breaking strength: manufacturer data.
- Motor thrust (bollard pull): the YACHT magazine tests, except for the 2.5 and 3.5 hp motors, which were not tested.
- Reefing practice, protest rates and race-committee habits: sourced from fleet documents and sailing instructions, not aboard.
- IMS mast datum definition: rule text.

## Searched and found nothing further

Searched: `ROADMAP.md`, `README.md`, `reference/josephine-confirmed.md`, `docs/*.md` (CONSTANTS, COORDINATOR, VISION-ROADMAP, DOCKING, WRECK, WAVES, SKIPPER-MODEL, ROOM-TO-RESPOND, SEASON, TRADITIONS, UI-AUDIT, WIND-FETCH-CHECK, CAPACITY, RELEASE-NOTES), `docs/plans/*`, `reference/design/sheet-geometry.md`, `reference/research`, `reference/photos` (names), `design/` and `proposals/` (grep only), the `src/` comments in `boat`, `render`, `ui`, `environment` and `sim`, and `tests`. I also searched git history on all branches for "owner ask", "tape", "jumper", "r261" and "weather helm".

Nothing aboard-settleable turned up in `docs/plans/*`, `reference/research` (an eddies note), `src/ai`, `src/rules`, `src/club`, `tests/` (they cite the same estimates), and the environment files, where the open items are data and modeling (harbor wall heights, current edge widths, fetch and swell reach).

Not run: any tests or rebuilds. A computation of the half-beam at the ensign staff failed to finish, so the 0.62 m toerail figure is derived from the old formula in the code, not computed.
