# Build plan

What's planned, roughly in order. Done work is described in the README.

## Next up

- **Real SF Bay currents and tide timing.** Use real tide and current predictions for a chosen date, so the ebb and flood build, turn and ease during a race. Add stronger relief along the Cityfront shore. Needs a data source the environment can reach (NOAA).
- **Afternoon westerly.** The breeze fills in and builds through the afternoon, with stronger patches in the slot off the Golden Gate.
- **Remaining rules.** 18.4 (gybing at a mark), 19 (room at obstructions other than through a Rule 20 hail), 16.2, and exoneration (43, 44.1(b)). Also detect touching the committee boat. Check the rule wording against the 2025–2028 rulebook itself.
- **Real shoreline.** Replace the hand-traced Cityfront outline with real coastline data.

## Full sail controls (requested)

Build every line on the boat as something you can see in 3D and work yourself, each with its effect on sail shape and speed. This extends the sail trim model (`src/boat/trim.ts`), which today has only the two sheets.

### Lines and where they're led (from the owner's boat)

The **piano** is the row of cam cleats on the aft face of the cabin top (the bridge deck bulkhead), one row each side of the companionway. Lines run forward along the cabin top to turning blocks at the mast.

| Piano | Inboard (by the companionway) → outboard |
|---|---|
| Starboard | Vang · Outhaul · Jib Cunningham (three cam cleats) |
| Port | Vang · Outhaul · *main Cunningham / downhaul* · Jib Cunningham (three cam cleats, plus a fixed clam cleat set ~2 in forward, between the jib Cunningham and outhaul cams) |

| Control | Sail | Led to | Notes |
|---|---|---|---|
| Vang | Main | Piano, both sides, innermost | Dual-ended: pulling one tail pulls the other |
| Outhaul | Main | Piano, both sides, middle | Dual-ended |
| Jib Cunningham | Jib | Piano, both sides, outermost | Dual-ended |
| Main Cunningham (downhaul) | Main | Port piano only, fixed clam cleat | Labelled "CUN" on the boat. Single-ended. What exactly it pulls: to confirm (see below) |
| Main halyard | Main | Port side, tail parked | Set before racing, not adjusted under way |
| Jib halyard | Jib | To confirm | |
| Mainsheet | Main | Boom end to the traveller car on the transom | Purchase unknown: model 4:1 (typical for a keelboat this size) until counted |
| Traveller | Main | Transom | Dual-ended |
| Backstay | Rig | Both sides of the transom | Dual-ended |
| Jib sheets | Jib | Along the side decks to the winches | The only lines on the winches. Winches are **not** self-tailing: one hand cranks, the other tails, so trimming in a breeze is slow and takes crew |
| Jib cars | Jib | Tracks on the cabin top | Moved by hand, pin stop: a set of fixed positions, set before a leg, not adjusted while loaded |

### What each one does (the physics to model)

- **Backstay:** tightens the forestay (less sag, so a flatter jib that points higher) and bends the mast (flattens the main and opens its upper leech). Ease it for power in light air or chop.
- **Vang:** holds the boom down and controls main leech twist. It matters most off the wind, when the mainsheet no longer pulls the boom down.
- **Outhaul:** depth in the lower main. Ease for power, tighten to flatten.
- **Cunningham and halyards:** luff tension, which moves the draft forward and opens the leech. The fix when the draft blows aft as the breeze builds.
- **Traveller:** sets the boom's angle to the centreline without changing twist, which sheet tension controls.
- **Mainsheet:** angle and twist together. Trimming hard closes the leech.
- **Jib sheet and cars:** sheet tension sets the angle; the car position sets twist. Car forward makes a deeper jib with a tighter leech, car aft a flatter jib with an open top.
- **Winches:** the jib sheet needs a winch to trim in a breeze, so trimming takes time and effort, while easing is quick.

### How it should play

- See each line in 3D: the piano, the transom controls, the winches, the cars on the cabin-top tracks. Dual-ended lines show both tails moving together.
- Settings per sail, with crew defaults for each wind strength, and the option to work every line yourself (like today's trim switch).
- Telltales, the leech, the draft position and the speed readout respond, so you learn by feel and by numbers.
- Keyboard controls (rebindable) and a trim panel that groups the lines as they are on the boat: piano, transom, winches.

### Still to confirm

1. **Main Cunningham vs. downhaul.** Follow the line from the port fixed clam cleat forward to the mast. If it ends at a ring in the mainsail's luff just above the boom, it's a Cunningham. If it ends at the gooseneck and pulls the boom down a track on the mast, it's a gooseneck downhaul. If it goes up inside the mast, it's the halyard tail with a tackle (a halyard tensioner). All three tension the luff and sail the same in the sim; they just look different.
2. **Mainsheet purchase.** Count the parts of line running between the block on the boom and the block on the traveller car: that number is the purchase (4 parts = 4:1).
3. **Jib halyard.** Where is it led and cleated?
4. **Jib cars.** How many pin positions, and roughly how far apart?

## Later

- Real past races with real wind and current (goal 4).
- More courses, and race-committee options (course changes, shortened courses).
- Phone and tablet layout (on hold: desktop first).
