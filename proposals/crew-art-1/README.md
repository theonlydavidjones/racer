# Crew art, round 1 (design only)

A fresh start on how the crew are skinned. No animation work; the figures sit on the sim's existing eleven-bone
skeleton (crewBody.ts) so crew.ts can pose them unchanged. Code: `src/render/crewArt.ts`. Not wired into the game:
the crew lab shows it with `?crewArt`.

## Why round 4 looked wrong

| What the close-up showed | Cause | What this round does instead |
|---|---|---|
| Blotchy beanie colour bleeding onto the forehead and temple | Colour painted per vertex on one continuous body: every triangle spanning two garments blends their colours | Every garment is its own closed surface with its own vertices. A colour stops exactly at its edge. Colours and roughness come from a small palette texture (one texel per material) |
| Grey-white, sickly skin smeared over facets | A pale albedo under the sim's light (blue-white sky light at 0.85π, dark teal ground light, no tone mapping) blows out where it faces the sky and goes grey-blue in shade. Faceted normals on a decimated scan | Skin albedos chosen for this light (a little warmer than the tone they should read as), plus a faint warm self-light on skin only (standing in for light scattering under the skin). Smooth normals within each piece |
| "Sunglasses" as flat black pixel rectangles | A decal: no geometry, so no depth, edge or highlight | Wraparound lenses modelled 13–17 mm off the face, with two lenses meeting at a bridge, a frame along the top and arms back over the ears. Lenses are glossy and lighter at the top where they reflect the sky |
| Long, thin, grey neck; lumpy, faceted skull | The scan's own neck, nothing over it, and the decimated skull | A short neck hidden in a foul-weather collar zipped to the chin. The head is a smooth egg of real head size, with the nose modelled into its surface |
| Beanie like a helmet with a ball on it | A rigid shell standing off the head, plus a pompom | A knit beanie hugging the head, pulled over the tops of the ears, with a turned-up ribbed cuff and a little slouch at the back. No pompom |

## The three candidates

All three use the same approach and the same kit list: jacket, salopettes, sea boots, life jacket, gloves and headwear.
They differ in what they wear, so the owner can judge the approach over several kinds of garment.

- **A: helm, cap** (`A-cap-inflatable.png`). Red offshore jacket with charcoal shoulder reinforcement, a reflective
  band on the collar and a storm flap over the zip. Inflatable life jacket lobes with a harness belt and buckle.
  Charcoal salopettes with knee patches, black rubber boots, navy cap with a curved peak, short hair under the cap.
  About 7.3k triangles.
- **B: trimmer, beanie** (`B-beanie-foam-vest.png`). Navy jacket. Orange foam buoyancy vest with black side panels, a
  zip, a waist strap and reflective patches. Charcoal knit beanie, brown leather sea boots, darker skin. About 7.9k
  triangles.
- **C: wet beat, hood up over a cap** (`C-hood-over-cap.png`). Yellow jacket and salopettes, red inflatable, grey boots,
  fair skin. The hood is worn over a cap, with the peak sticking out to shade the face, the way sailors wear them.
  About 7.7k triangles.

Also in this folder: `aboard.png` shows them posed by the sim, both tacks, from both sides. `chase-view.png` shows them
at the chase camera's distance. `lineup.png` has all three side by side.

**Triangles.** A is 7.3k, B 7.9k and C 7.7k, a little over the ~7k budget. The cheapest cuts if needed: the beanie's
ribbed cuff (48 segments, about 480 triangles), the vest's waist strap, and fewer rings in the legs. Each figure is
still one skinned mesh, one draw call and one material.

## Known weak points (judged against the old screenshot)

- From the side, the hood still shows a lower rim where it meets the collar.
- The jacket's shoulders are boxy, with the sleeve heads standing proud when the arms are raised. Fixing that is
  shoulder skinning, which is animation work.
- Seated, the hips and thighs fold with simple two-bone blending, which makes a soft lump at the hip. That is also
  animation work.
- The faces are plain on purpose: no eyes or mouth are drawn, the eyes are behind sunglasses and a peak, a cuff or a
  hood covers the brow, and a collar covers the chin.

## Reproduce

```bash
npm run dev &
node scripts/check/crew-art.cjs <out>          # A/B/C sheets and the lineup (scripts/check/crewart: the sim's light)
node scripts/check/crew-art-cockpit.cjs <out>  # aboard, in the crew lab with ?crewArt (helm A, crew B, C)
```

The close-up sheets are lit by the sim's own lights (render/scene.ts: the same hemisphere and sun, 55° up), with the
sun ahead of the figure and to one side. The boats turn every way under the sun, so a front-lit face is a real case.
The crew lab keeps its own sun, from astern.
