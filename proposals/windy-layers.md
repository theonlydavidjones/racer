# Proposal: the chart's wind and current, Windy-style

The owner's ask: *"I want to see more prominent information from the condition layers, similar to how the Windy app
handles it. Especially wind and current. Right now it's too hard to find this info on the map, and it's super small and
hard to read."*

Mock-ups, drawn over the real full-screen chart with the sim's own fields (`World.windHere`, `World.currentAt`), by
`proposals/windy-mockup.cjs`. Nothing is built yet.

- `windy-wind.png`: a 16 kt westerly at 15:00, 2026-11-14.
- `windy-current.png`: the same day at 18:30, near the day's strongest ebb. NOAA predicts 2.5–2.8 kt then at Golden Gate
  Bridge (SFB1202) and the Bay Entrance (SFB1201).

## What changes

1. **Colour for speed, on the water only.**
   - A smooth colour field shows the speed at about 60 % opacity, so the chart's soundings and marks still read through it.
   - Wind uses Windy's own ramp: blue-grey below 5 kt, green at 10–15 kt, yellow at 20 kt, orange at 25 kt, red at 30 kt.
     A Windy user reads it at a glance.
   - Current has a ramp of its own, from 0 to 5 kt: dark blue at slack, teal at 1 kt, yellow at 2 kt, orange at 3 kt,
     red at 4 kt.
   - The land keeps the chart's colours. The sim's wind over land isn't something you sail in, so it isn't coloured.
2. **Moving streaks for direction.**
   - Particles drift with the flow and leave short fading trails, as in Windy.
   - Their speed on the screen follows the wind or current speed: the slot's streaks run, the lee's crawl.
   - These replace today's small arrows for whichever layer is on.
3. **A legend in kt**, bottom centre: the ramp with numbers under it.
4. **A readout under the cursor.**
   - It shows the speed and direction of both, for example "17 kt from 273°" with "ebb 1.6 kt toward 259°" under it.
   - The flood or ebb call comes from the nearest NOAA station, as the dial's does. The mock-up uses a simpler
     east-is-flood rule.
   - On the inset, the same two lines stand where "CURRENT HERE 0.9 kt" is now, for where the boat is.
5. **A layer picker you can't miss.**
   - Big pill buttons at the top left of the chart: **Wind · Current · Waves · Fog · Off**.
   - One field layer is on at a time, because two colour fields can't be read on top of each other.
   - Marks, laylines, ships and the route stay as switches in the Layers menu.

## The inset map

- It gets the same colour field for the chosen layer, more faintly (about 35 %), so the course and boats stay on top.
- About 150 streaks at most.
- The two-line readout for where the boat is goes at its foot.
- The picker stays on the inset's layers button.

## Frame budget

- **The colour field** comes from a coarse grid: one sample per 12 px on the chart, about 7,000 points, and about 600 on
  the inset. It is drawn into a small canvas and scaled up smoothly.
  - It is redrawn only when the view moves or the sim's minute changes, never every frame.
  - The current field is already a cached lattice. The wind's mean field is cached too; the puffs are left out of the
    colour, as Windy shows the mean wind and not its gusts.
- **The streaks** are a fixed pool of particles, each stepped once a frame and kept on its own canvas.
  - About 1,500 on the chart and 150 on the inset: roughly 1–2 ms of JS a frame.
  - They stop when the chart is paused off-screen.
- **Nothing is added to the 3-D scene**, so draw calls and triangles don't change.

## Questions for the owner

1. Windy's wind colours, as drawn, or the chart's quieter blues?
2. One field layer at a time, or wind colours with current streaks on top? The mock-ups show one at a time.
3. Should the inset get the colour field too, or only the readout?
4. Particles that move, or still streaks that only redraw when the chart moves? Still streaks cost nothing per frame.
