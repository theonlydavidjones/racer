# Sail band scale: feel vs true rope eased (mock-up)

A still for the owner's decision on the sail band's scale (Coordinator's request, 13 Nov 2026). Mock-up only: nothing in
the sim or the band changes.

- `bandscale.png`: the still (1920 px wide, 2× pixels). Three columns at the same two moments (close-hauled and a beam
  reach, 12 kt, the sim crew's trim): today's feel scale, true rope eased, and a middle way (today's marks with inches of
  rope marked on each line and under the mainsheet track).
- `bandscale.html`: the page the still is drawn from (the numbers are worked in its script).
- `render.cjs`: `node reference/design/bandscale/render.cjs` redraws the PNG (Playwright, headless Chromium).

Purchases and travels are Rigging's (13 Nov 2026), with their flags: the mainsheet's 4 parts and blocks are measured
(reference/design/sheet-geometry.md); the vang's parts, every travel but the outhaul's 3 cm (North Sails), and the
backstay bridle's figures are estimates, shown in amber. The control values at each moment are the sim crew's own, read
from the physics (12 kt, testBoat, 90 s settled).
