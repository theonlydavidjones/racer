# Real docking (approved by the owner 13 Nov 2026; built: boat/dockLines.ts, sim/world.ts mooringStep)

Today only her home slip, as Home's destination, makes her fast, and it does so automatically: she's within 2.5 m, under 0.6 m/s and bow in (`world.ts intoSlip`). The plan is to dock anywhere, done by the crew, with real forces.

**Where.** Any empty slip, end tie or guest dock in any harbor. Today the drawing code alone decides which slips hold boats (`render/marina.ts`, e.g. 87% at the SF Marina). That choice moves into `geo/`, so the sim and the drawing agree on which slips are empty. Each berth keeps its kind: bow in between fingers (as the Bay's marinas do), or alongside at an end tie or guest dock.

**How you call it.** The same key as Push off (G), and a row in the Crew panel: "Lines ready". No new button.
- With crew, the crew member forward goes to the shrouds on the dock side with the bow line coiled.
- One-word cues by the boat, like the drills:
  - "Closer" while the gap is too wide;
  - "Too fast" while she's moving too fast to step;
  - "Step" when they go;
  - "Made fast", or "Lost her" if the line can't hold.
- A skilled hand steps at a slightly wider gap, and takes the turn sooner.

**The steps, crewed.**
1. **Step off** at the shrouds when the gap and speed allow.
2. **Snub:** a turn on the nearest cleat, holding the bow line.
3. **Stern line:** a second hand ashore, or the same one walking aft, takes the stern line.
4. **Springs:** the springs go on, and she's made fast.

**Single-handed.** You let go of the tiller and step off at the shrouds with a midships line, then snub it on a cleat. Some sources call this the standard single-handed technique (search summaries: Seabreeze, boats.com). It's harder to time: nobody is steering, and she starts to wander once you let go.

**The physics** (with Deep Physics, at their force seam in `boat/physics.ts`; physics-reviewer on all of it):
- **A line** is a stiff spring with damping, between a cleat on her and a cleat on the dock.
  - Stretch: about 2.5% for nylon at its working load (10% of break; Practical Sailor).
  - Breaking strength: 3/8" nylon three-strand breaks at about 15–20 kN, and the makers differ by 30%.
- **The snub:** a hand on a line with a turn round a cleat holds by friction, T_load = T_hold·e^(μθ) (the capstan equation).
  - If she's moving too fast, the line runs out through the crew's hand and she drifts on.
- **Wind and current** keep pushing her on or off the dock the whole time, through the sim's existing forces.
- **A bump** against the dock or a finger goes through the existing side contact. Her momentum at contact is reported: a "hard bump" above walking pace.

**Not sourced yet.** The research found no authoritative figure for:
- the step-off gap and speed. PBO and 48° North say never step while she's still moving toward the dock; Spinsheet says step off at the shrouds.
- rope-on-cleat friction μ. The only figure is bulk nylon on steel, about 0.4.
- a person's holding force.
- a hull-damage speed.

I'd use these clearly flagged estimates until sourced:
- step gap up to 0.6 m, more by skill;
- step speed under 0.5 m/s;
- μ 0.3;
- holding force 250 N;
- "hard" bump above 0.5 m/s.

The hosts that might settle them (practical-sailor.com, goodoldboat.com, seabreeze.com.au) are blocked here.

**Home.** Home keeps working as it does now. With "Home" as the destination, sailing into her own slip close and slow still makes her fast on its own, so the tiller pilot's arrival goes on working. Calling "Lines ready" does it by hand there too, and anywhere else.
