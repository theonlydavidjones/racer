# Crude-model audit (r296, 21 Nov 2026)

The shoreline from the water, one still a landmark (scripts/check/audit.cjs; stills on branch `r296-stills`:
`stills/overnight-9a.png`, `-9b.png`, `-9c.png`). Listed worst eyesore first. Fix size: S under half a day, M a day, L
more. "Method" is what the Fort Point, Alcatraz and city-front work has already shown to work: OSM outlines for the footprints,
USGS 3DEP lidar (CA_SanFrancisco_1_B23, EPT, public domain) for the heights and the shape, and the 1 m DEM for the ground.

| # | Stand-in | Where (lat, lon) | Still | Size | Method |
|---|---|---|---|---|---|
| 1 | Bay Bridge's San Francisco anchorage and the Oakland touchdown: single gray boxes; the viaduct's piers plain boxes | 37.7945, -122.3865 (anchorage); 37.8190, -122.3330 (Oakland end) | 9a bb_west, bb_east; 9c oakland | S | OSM bridge supports and lidar slabs, as render/ggSouth.ts |
| 2 | Downtown and the Embarcadero beyond the city-front strip (the Financial District, Rincon Hill, SoMa, Telegraph and Russian Hill): random gray boxes in the old city grid | 37.78 to 37.80, -122.42 to -122.39 | 9a ferry; 9b coit, sutro | M | extend `scripts/make-cityfront.mjs`'s strip (STRIP, BOXES) south and east with `--lidar`; the far levels keep the triangles in budget |
| 3 | Marin shore's houses: white cubes on the hills (Belvedere, Tiburon, Sausalito, Marin City), no footprints or heights | 37.87, -122.46; 37.85, -122.48 | 9b tiburon, sausalito | M | the same generator for a Marin strip; ground from the 1 m DEM (a third tile) |
| 4 | Yerba Buena and Treasure Islands: terrain and a dome of trees, no buildings, no tunnel portal, no marina | 37.810, -122.364; 37.823, -122.370 | 9a yba, ti, ti_n | L | OSM buildings and the DEM; Treasure Island is flat, so the strip method works as it is |
| 5 | Angel Island: terrain and trees, the old army and immigration buildings only as approximate boxes (render/landscape.ts, "to about 50 m") | 37.862, -122.430 | 9b angel_s, angel_e | M | OSM footprints, lidar heights, as Alcatraz |
| 6 | Oracle Park's surroundings (South Beach's towers and the piers): the old boxes, now beside a real ballpark | 37.778, -122.389 | 9a (not shown), `overnight-10` | M | covered by #2 if the strip runs south to Mission Bay |
| 7 | The Golden Gate Bridge's north anchorage and pylons: heights are estimates ("pylons standing 14 m above the roadway", render/landscape.ts) | 37.8265, -122.4795 | 9c ggb_n | S | the lidar slab method, as the south end (render/ggSouth.ts, make-gg-south.mjs) |
| 8 | Embarcadero seawall and piers south of Pier 39: a dark strip, no pier sheds | 37.795, -122.393 | 9b sutro | M | OSM piers and sheds, lidar heights |
| 9 | East Bay (Alameda, Oakland, Berkeley): shore lines and the port's cranes only | 37.77 to 37.87, -122.33 to -122.28 | 9c oakland, alameda, berkeley | L | too far to matter for the racing: leave |

What is already real (r254, r295, r296): Alcatraz, the city front from Fort Point to Telegraph Hill's west slope and south to
Pacific Heights, Fort Point, the Golden Gate Bridge's south end, the Palace of Fine Arts, Oracle Park, the Hyde Street ships
and the Ferry Building.
