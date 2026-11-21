# Phantom land beside the East Bay's piers and wharves

The Coordinator, 21 Nov 2026 (after w044 and the Long Wharf). Where the terrain's 50 m land cells read as land beside a
pier or wharf, where NOAA's chart has water. Read-only survey; each place is fixed on its own after this.

## Method

- **The sim's land:** the 50 m land grid (src/geo/data/shore-mask.json), as onLand reads it after its own corrections, with w044 (the Berkeley deck) and the Long Wharf already cleared (branch long-wharf, 73932148).
- **The chart:** NOAA's ENC, the repo's extract (src/geo/data/enc-chart.json, catalog 2026-11-11). Solid is its land areas (LNDARE), its construction areas (SLCONS, PONTON, DRYDOC, FLODOC, HULKES, BRIDGE, OFSPLF, PYLONS) and its construction lines taken 3 m either side.
- **A candidate:** a land cell in the East Bay box (122.42–122.19 W, 37.735–37.985 N) within 80 m of a charted construction line, and less than 30% charted solid by a 5×5 sampling of the cell. Candidates are grouped into 8-connected patches.
- **Lone or attached:** a *lone* patch touches no other land cell. It's phantom land beside a structure: what the Berkeley deck and the Long Wharf had, and what this work fixes. An *attached* patch is the edge of a shore cell reaching past the charted shoreline. That's the shoreline's own accuracy, docs/plans/shoreline-survey.md's work, not a pier's.

## Lone patches: 4, to fix one at a time

| Near (charted name) | Cell center (lat, lon) | Cells | Charted solid | ENC cell | What the chart has there |
|---|---|---|---|---|---|
| Telegraph Hill | 37.80002, -122.39447 | 2 | 22% | US5OAKFH ed. 1 upd. 1 (2026-10-28) | LNDARE, SLCONS (CATSLC 6, wharf) |
| San Francisco-Oakland Bay Bridge-East of Yerba Buena Island | 37.84561, -122.30235 | 1 | 28% | US5OAKFI ed. 1 upd. 0 (2025-12-05) | LNDARE, COALNE |
| Encinal Basin | 37.77420, -122.30633 | 1 | 24% | US5OAKEI ed. 1 upd. 0 (2025-12-05) | LNDARE, SLCONS (CATSLC 10, sea wall), a dolphin (MORFAC) |
| San Francisco-Oakland Bay Bridge-East of Yerba Buena Island | 37.82900, -122.31315 | 1 | 28% | US5OAKFI ed. 1 upd. 0 (2025-12-05) | LNDARE, SLCONS (CATSLC 4, pier) ×4, a pile (PILPNT) |

Each has charted land or constructions within the cell. So, as at the Long Wharf, the chart's own structures come in first and are kept solid, and only then is the phantom land cleared. Each fix gets a test written first.

- **The Embarcadero** (37.80000 N) is San Francisco's side, outside the East Bay; it's listed because the box reaches it. Its fix is the Cityfront's to decide.

## Attached patches: 13, for the shoreline work

| Near (charted name) | Cell center (lat, lon) | Cells | Charted solid | ENC cell |
|---|---|---|---|---|
| Fleming Point | 37.88559, -122.31685 | 2 | 18% | US5OAKGI ed. 1 upd. 0 (2025-09-24) |
| Castro Point | 37.93275, -122.41068 | 2 | 28% | US5OAKGG ed. 1 upd. 1 (2026-04-22) |
| Parr Canal | 37.91793, -122.36433 | 1 | 8% | US5OAKGH ed. 1 upd. 1 (2025-12-17) |
| Point Isabel | 37.89188, -122.32396 | 1 | 28% | US5OAKGI ed. 1 upd. 0 (2025-09-24) |
| Encinal Basin | 37.76836, -122.30861 | 1 | 24% | US5OAKEI ed. 1 upd. 0 (2025-12-05) |
| Encinal Basin | 37.77734, -122.29894 | 1 | 12% | US5OAKEI ed. 1 upd. 0 (2025-12-05) |
| San Francisco-Oakland Bay Bridge-East of Yerba Buena Island | 37.80070, -122.32965 | 1 | 28% | US5OAKFH ed. 1 upd. 1 (2026-10-28) |
| San Francisco-Oakland Bay Bridge-East of Yerba Buena Island | 37.81013, -122.33476 | 1 | 28% | US5OAKFH ed. 1 upd. 1 (2026-10-28) |
| Point Orient | 37.95926, -122.41097 | 1 | 28% | US5OAKHG ed. 1 upd. 3 (2026-02-02) |
| Point Isabel | 37.90311, -122.32510 | 1 | 24% | US5OAKGH ed. 1 upd. 1 (2025-12-17) |
| North Point | 37.80923, -122.41381 | 1 | 0% | US5OAKFG ed. 1 upd. 2 (2026-04-22) |
| Clinton Basin | 37.79082, -122.29553 | 1 | 28% | US5OAKEI ed. 1 upd. 0 (2025-12-05) |
| Point Isabel | 37.89817, -122.31714 | 1 | 24% | US5OAKGI ed. 1 upd. 0 (2025-09-24) |

These are 8–28% charted solid: the shore cell runs 15–40 m past the charted shoreline beside a structure. They're among the shoreline survey's "sim land in charted water" places, and are fixed with the land mask from the chart, (A).

## Not covered

- Structures the chart draws only as points (piles, PILPNT) and sunken or covered ones aren't treated as solid here.
- **Done already:** the Berkeley Pier deck (w044, ff688cbb) and Chevron's Long Wharf (long-wharf, 73932148).
