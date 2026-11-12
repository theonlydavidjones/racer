# Crew art, round 2 (design only)

This round follows the owner's note on round 1: *"Crew is looking MUCH MUCH better. Let's stick with this direction. A
little less cylindrical and more natural on the limbs and torso though."*

The approach is unchanged: a separate surface for each garment, the palette texture, modelled eyewear and headgear, the
short neck in the collar, the tuned skin, and one draw call per person on the existing eleven-bone skeleton. The views
are the same as in round 1. Code: `src/render/crewArt.ts`; aboard: the crew lab with `?crewArt`.

## What changed

- **Why the limbs were cylinders.** Round 1 had a real bug. The routine that reads the shape tables assumed each
  table ran from the bottom up. The legs, sleeves and seat were written top down, so they only ever used their
  first row and came out as constant-width tubes. It now sorts each table by height, so every shape actually
  applies.
- **Legs.** The thighs are fuller in front (the quadriceps) and wider than the knees. The thighs angle in to the knees,
  the kneecap shows in front, the calf swells behind and outward, and the leg narrows to the ankle. The salopette cloth
  bunches in soft folds above the boot. The boot shafts are slimmer so the trousers can be.
- **Arms.** The deltoid is rounded over the shoulder's point, the biceps sits in front, and the elbow is narrow with
  its point behind. The forearm swells below the elbow and the sleeve narrows toward the wrist. The cuff hangs loose,
  with a few folds.
- **Torso.** The jacket now has a chest, a waist and hips instead of a tube. The shoulders slope up to the neck at
  about 30°, as the trapezius does, instead of a square corner. The cross-sections are rounder in plan, and the hem
  hangs looser over the seat and the tops of the thighs, with soft folds.
- **Hood.** It's rebuilt as a shell about 2 cm off the head and the cap, fuller behind. Its lower edge goes down
  inside the collar, which is zipped up over it, so no hood edge shows from any side. The face opening is an oval from
  chin to brow, with a rolled drawcord edge. The cap's peak still comes out under it.

## Triangles

| Candidate | Round 1 | Round 2 |
|---|---|---|
| A (cap) | 7.3k | 7.2k |
| B (beanie) | 7.9k | 7.7k |
| C (hood over cap) | 7.7k | 7.8k |

Cuts used to stay near 7k:
- The beanie's ribbed cuff, 48 segments down to 40.
- Coarser boots and soles.
- Lighter waist belts and sunglass frames.
- No crown segments or ears hidden under the hood.

## Files

- `A-cap-inflatable.png`, `B-beanie-foam-vest.png`, `C-hood-over-cap.png`: the same six views as round 1. The full-body
  views are framed a little closer, so the limbs can be judged.
- `aboard.png`: the figures posed by the sim, on both tacks, from both sides.
- `chase-view.png`: the figures at the chase camera's distance.
- `lineup.png`: all three side by side.
- `round1-vs-round2.png`: the full bodies of both rounds, one above the other.

## Still to do (animation, out of scope)

When sitting, the hips and thighs fold with two-bone blending, which makes a soft lump at the hip. When the arms are
raised, the shoulders stretch.
