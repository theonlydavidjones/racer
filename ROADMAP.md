# Build plan

What's planned, roughly in order. Done work is described in the README.

## Next up

- **Real SF Bay currents and tide timing.** Use real tide and current predictions for a chosen date, so the ebb and flood build, turn and ease during a race. Add stronger relief along the Cityfront shore. Needs a data source the environment can reach (NOAA).
- **Afternoon westerly.** The breeze fills in and builds through the afternoon, with stronger patches in the slot off the Golden Gate.
- **Remaining rules.** 18.4 (gybing at a mark), 19 (room at obstructions other than through a Rule 20 hail), 16.2, and exoneration (43, 44.1(b)). Also detect touching the committee boat. Check the rule wording against the 2025–2028 rulebook itself.
- **Real shoreline.** Replace the hand-traced Cityfront outline with real coastline data.

## Full sail controls (requested)

Build every line on the boat as something you can see in 3D and work yourself, each with its effect on sail shape and speed. This extends the sail trim model (`src/boat/trim.ts`), which today has only the two sheets.

### Lines and where they're led

| Control | Sail | Led to | Notes |
|---|---|---|---|
| Vang | Main | Piano, innermost (nearest the centreline) | Dual-ended: port and starboard tails are one line, so pulling one end also pulls the other |
| Outhaul | Main | Piano, next out | Dual-ended |
| Cunningham | Jib (main? to confirm) | Piano, outermost | Dual-ended? To confirm |
| Halyard | Main | To confirm | Luff tension |
| Halyard | Jib | To confirm | Luff tension |
| Mainsheet | Main | Transom | |
| Traveller | Main | Transom | |
| Backstay | Rig | Both sides of the transom | Dual-ended |
| Jib sheets | Jib | Along the side decks to the winches | The only lines on the winches |
| Jib cars | Jib | Tracks on the cabin top | Move the jib sheet lead fore and aft |

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

### Questions for the owner (before building)

1. Is the Cunningham on the piano for the jib or the main? Is there a Cunningham for the other sail too, and where is it led?
2. Is the piano Cunningham dual-ended? (If pulling the port tail also moves the starboard tail, yes.)
3. Where are the main and jib halyards led: the piano, or cleated at the mast?
4. Jib cars: moved by hand along the track with a pin stop, or with a control line? Same position on both sides, or set separately?
5. Traveller: a dual-ended line across the transom (pull to windward, ease to leeward)?
6. Mainsheet: straight to the boom, or a multi-part purchase? Cleated on the traveller car?
7. Are the winches self-tailing?

## Later

- Real past races with real wind and current (goal 4).
- More courses, and race-committee options (course changes, shortened courses).
- Phone and tablet layout (on hold: desktop first).
