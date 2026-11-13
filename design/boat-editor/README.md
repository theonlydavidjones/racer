# The boat editor reorganized: mock-up (ROADMAP 8i; nothing built)

The real editor panel with `mock.js` injected (`node design/boat-editor/shoot.cjs design/boat-editor`, dev server on 5199):

- `editor-folded.png`: every group folded to a short vertical list (label left, value right; at most four rows). The groups are Her, Hull, Deck and cabin, Rig, Sails,
  Lines, Home berth. The skipper is read-only under Her, with a link to the Yacht Club.
- `editor-hull.png`: Hull open, one row per property on a single grid; the one color picker opens under Topsides. It has a hue and shade field, a hex field, the
  class's usual colors as presets, and your own saved colors, which every picker shares and your account keeps.
- `editor-lines.png`: Lines open. Each line picks from real rope colorways, drawn as rope (braid, flecks, tracers), not
  from the free picker (the owner).

Rope colorways, from retailers' listings of the makers' ranges (no maker's chart could be read directly):
- **New England Ropes:** Sta-Set solids, white/red/blue/green flecks, and Sta-Set X white with two red tracers.
- **Samson XLS:** solids including navy, and navy with a beige tracer.
- **Marlow Doublebraid:** a gold fleck, and solid gray (D2 Racing).

Fleck density and tracer spacing are drawn by eye. No source gives them.
