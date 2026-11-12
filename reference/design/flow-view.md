# Flow view: design proposal (the owner's #2 training tool)

Mock-up: `flow-view-mockup.png`. Its source is `flow-view-mockup.html`, a real vortex-panel solve in SVG.

## What it is
- A toggle, perhaps `F` or a button in the trim band: a plan-view overlay of the sails' sections.
- It is drawn at three heights (foot, middle and head), cycled or chosen, in the boat's frame with the bow up.
- A side panel says, in words, what the flow is telling you.
- Desktop only. It is a 2D canvas over the 3D view and is redrawn at about 5 Hz.

## What comes from the sim (true to the physics)
- **Apparent wind** (b.awa, b.aws) at each height, through the existing wind gradient, so the head sees more and freer wind.
- **Each section's angle and shape:**
  - from the sheet angles (b.sheets) and the twist, camber and draft (b.shape, controls.ts);
  - the tune's effects included (forestay sag adds jib camber).
- **Angle of attack and the best angle**, from trim.ts: err, eff, and flow ('good' / 'luffing' / 'stalled') with its amount.
- **Telltales** from luffTellStates. This is the same function the 3D telltales use, so the two never disagree.
- **Leeway** (b.leeway) for the keel inset.

## What's illustrative (labelled on screen)
- **Streamline shapes and the speed shading:**
  - 2D potential flow, lumped vortex panels with the Kutta condition, around the sim's own sections in the sim's apparent wind.
  - It is qualitatively right: upwash ahead of the jib, the slot effect, faster air on the lee side.
  - It is not the sim's force model, and it never feeds forces back.
- **Separation:**
  - Potential flow can't stall, so the stalled eddies at the leech and the backing bubble at the luff are drawn from the sim's own flow state and amount.
  - They are not computed. The label says so.

## The story panel (generated from the same data)
- Per sail:
  - the angle of attack against the best angle;
  - the flow state;
  - the telltales;
  - one action ("ease about 6°", "bear away or trim").
- **The slot:**
  - What the jib's leech does to the main's luff.
  - Over-trimming the jib (car forward, sheet hard) backs the main.
  - It shows when the main's windward telltales lift while its angle of attack is fine.
- **Under water:** the leeway angle, and what pinching does to it.

## Cost
- The panel solve is about 30 panels: one 30×30 solve per redraw, plus about 40 streamlines.
- That is under 1 ms at 5 Hz, and only while the view is open. Nothing runs in the sim step.

## Estimate
About 10–14 h:
- the overlay and solver: 4 h;
- the heights and twist: 2 h;
- the story panel: 2–3 h;
- tests (it agrees with trim.ts and the telltales; the slot gets faster when the jib is trimmed): 2 h;
- the visual-checker and physics-reviewer rounds: 2 h.

## Questions for the owner
1. Should it be an overlay on the 3D view, or a separate panel beside it?
2. Should the heights cycle on a key, or show all three at once as small multiples?
3. Should it be live while racing, or only in practice and the showroom?
