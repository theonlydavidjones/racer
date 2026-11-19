# Shoreline survey: the sim's land against NOAA's chart

Prep for ROADMAP (A), the shoreline and chart accuracy (the Coordinator, 19 Nov 2026). Read-only: no fixes yet.

## Method

- **The chart:** NOAA Office of Coast Survey ENC (S-57), as already in the repo (`src/geo/data/enc-chart.json`, made by
  `scripts/fetch-charts.mjs` from catalog ENCProdCat.xml of 2026-11-11). Solid is land areas (LNDARE), shoreline
  constructions and the like as areas (SLCONS, PONTON, DRYDOC, FLODOC, HULKES, BRIDGE, OFSPLF, PYLONS), and the same
  drawn as lines, taken 6 m either side.
- **The sim:** `onLand` (src/geo/shore.ts), what a boat runs aground on: the 50 m terrain mask
  (`shore-mask.json`, from elevation tiles), the hand-drawn shores (Cityfront, Lime Point), the wharves, piers and
  marinas.
- **The comparison:** both rasterized at 10 m over the chart's box (37.735–37.985 N, 122.61–122.188 W). Each patch where
  they disagree is measured by how far it reaches from the charted edge, chamfer distance, good to about ±5 m. Kept: a
  patch reaching 15 m or more, that a boat can reach (sim water connected to the Central Bay, or sim land touching it).
- **Reproducible:** `SURVEY=1 OUT=<file.json> npx vitest run tests/shoreline-survey.test.ts --silent=false` (about 3
  min; skipped in the suite).
- **Cells:** each place's cell is the band-5 cell covering it (a grid of 0.075° squares, E–H by latitude from 37.725 N,
  E–J by longitude from 122.625 W). Every cell here is **edition 1**; the update and issue date are given per row.

## Headline

| | patches ≥15 m | ≥30 m | ≥50 m | worst |
|---|---|---|---|---|
| **Sim water on charted land** (a boat can sail where the chart has land) | 1568 | 358 | 35 | 270 m |
| **Sim land in charted water** (a boat runs aground in charted water) | 912 | 38 | 0 | 47 m |

- **Sim water on charted land is the problem.** It's the 50 m terrain mask reading low-lying filled land as water:
  Alameda's north shore, the Port of Oakland fill at the Bay Bridge's east end, Point Richmond and the Richmond harbors,
  the Sausalito waterfront, and San Francisco's Mission Bay and Potrero shore. Boats can sail 100–270 m into charted land
  there.
- **Sim land in charted water is the mask's own grain.** It stays within one or so 50 m cell (≤47 m), mostly on the
  outer coast and the headlands, with Lands End and Baker Beach the nearest to where people sail.
- The hand-drawn Cityfront shore is mostly within 15 m. Gashouse Cove (45 m) and Telegraph Hill (45 m) are its worst
  places, both on (A)'s list already.

## Worst places: sim water on charted land

By place (the nearest charted name to the worst point, as a label, not an exact match), worst first. "Reach" is how far
the worst patch extends inside the charted land.

| Place (nearest charted name) | Reach (m) | Area (ha) | Patches | Worst at (lat, lon) | Sim x, y (m) | Cell, edition, update (issued) |
|---|---|---|---|---|---|---|
| Coast Guard Island | 270 | 35.9 | 22 (8 ≥30 m) | 37.77331,-122.24575 | 17376,-4143 | US5OAKEJ ed 1 upd 0 (2025-12-05) |
| Point Richmond | 128 | 17.4 | 19 (6 ≥30 m) | 37.91084,-122.38344 | 5266,11167 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| San Francisco-Oakland Bay Bridge-East of Yerba Buena Island | 125 | 61.0 | 127 (35 ≥30 m) | 37.82110,-122.32329 | 10556,1177 | US5OAKFI ed 1 upd 0 (2025-12-05) |
| Clinton Basin | 103 | 46.0 | 37 (17 ≥30 m) | 37.79101,-122.26292 | 15866,-2173 | US5OAKEI ed 1 upd 0 (2025-12-05) |
| Strawberry Point | 96 | 30.3 | 51 (15 ≥30 m) | 37.86746,-122.49760 | -4774,6337 | US5OAKFF ed 1 upd 2 (2026-02-18) |
| Sausalito Point | 79 | 22.7 | 19 (6 ≥30 m) | 37.85757,-122.48009 | -3234,5237 | US5OAKFF ed 1 upd 2 (2026-02-18) |
| Parr Canal | 77 | 14.1 | 15 (11 ≥30 m) | 37.92082,-122.36241 | 7116,12277 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| Mission Rock Terminal | 69 | 17.4 | 17 (7 ≥30 m) | 37.77116,-122.38617 | 5026,-4383 | US5OAKEH ed 1 upd 0 (2025-12-05) |
| Railway bridge | 69 | 12.2 | 41 (15 ≥30 m) | 37.77268,-122.24063 | 17826,-4213 | US5OAKEJ ed 1 upd 0 (2025-12-05) |
| Richmond Yacht Harbor | 67 | 4.2 | 4 (4 ≥30 m) | 37.92441,-122.37435 | 6066,12677 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| Potrero Point | 65 | 13.8 | 14 (4 ≥30 m) | 37.75768,-122.38163 | 5426,-5883 | US5OAKEH ed 1 upd 0 (2025-12-05) |
| Fleming Point | 62 | 32.3 | 87 (25 ≥30 m) | 37.86844,-122.31795 | 11026,6447 | US5OAKFI ed 1 upd 0 (2025-12-05) |
| Illinois Saint Drawbridge | 62 | 15.1 | 23 (12 ≥30 m) | 37.74834,-122.39140 | 4566,-6923 | US5OAKEH ed 1 upd 0 (2025-12-05) |
| Bluff Point | 62 | 3.2 | 18 (2 ≥30 m) | 37.88866,-122.44530 | -174,8697 | US5OAKGG ed 1 upd 1 (2026-04-22) |
| Tiburon Peninsula | 59 | 13.5 | 39 (13 ≥30 m) | 37.89755,-122.46463 | -1874,9687 | US5OAKGG ed 1 upd 1 (2026-04-22) |
| Rincon Point | 57 | 9.5 | 23 (10 ≥30 m) | 37.79505,-122.39243 | 4476,-1723 | US5OAKEH ed 1 upd 0 (2025-12-05) |
| Point San Pablo | 55 | 7.0 | 21 (4 ≥30 m) | 37.96537,-122.42711 | 1426,17237 | US5OAKHG ed 1 upd 3 (2026-02-02) |
| Encinal Basin | 53 | 34.0 | 67 (11 ≥30 m) | 37.76864,-122.28498 | 13926,-4663 | US5OAKEI ed 1 upd 0 (2025-12-05) |
| Castro Point | 53 | 7.8 | 27 (4 ≥30 m) | 37.93743,-122.41301 | 2666,14127 | US5OAKGG ed 1 upd 1 (2026-04-22) |
| Yerba Buena Island | 53 | 7.0 | 21 (5 ≥30 m) | 37.81661,-122.37025 | 6426,677 | US5OAKFH ed 1 upd 1 (2026-10-28) |
| Grand Avenue Pedestrian Bridge | 49 | 19.7 | 68 (6 ≥30 m) | 37.96932,-122.50158 | -5124,17677 | US5OAKHF ed 1 upd 2 (2026-05-06) |
| Punta San Quentin | 47 | 25.1 | 79 (16 ≥30 m) | 37.94291,-122.51341 | -6164,14737 | US5OAKGF ed 1 upd 1 (2026-02-18) |
| Bay Farm Island | 47 | 15.9 | 82 (9 ≥30 m) | 37.74618,-122.21562 | 20026,-7163 | US5OAKEJ ed 1 upd 0 (2025-12-05) |
| Point Protero | 47 | 15.4 | 40 (7 ≥30 m) | 37.90959,-122.35502 | 7766,11027 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| Silva Island | 47 | 10.6 | 56 (7 ≥30 m) | 37.89207,-122.51921 | -6674,9077 | US5OAKGF ed 1 upd 1 (2026-02-18) |
| Ayala Cove | 47 | 1.2 | 3 (2 ≥30 m) | 37.86826,-122.43461 | 766,6427 | US5OAKFG ed 1 upd 2 (2026-04-22) |
| Gashouse Cove | 45 | 13.0 | 5 (2 ≥30 m) | 37.80691,-122.44575 | -214,-403 | US5OAKFG ed 1 upd 2 (2026-04-22) |
| Treasure Island | 45 | 11.8 | 31 (15 ≥30 m) | 37.82748,-122.36628 | 6776,1887 | US5OAKFH ed 1 upd 1 (2026-10-28) |
| Telegraph Hill | 45 | 11.3 | 14 (6 ≥30 m) | 37.80817,-122.40789 | 3116,-263 | US5OAKFG ed 1 upd 2 (2026-04-22) |
| Peninsula Point | 45 | 5.2 | 24 (5 ≥30 m) | 37.86844,-122.46236 | -1674,6447 | US5OAKFG ed 1 upd 2 (2026-04-22) |

## Worst places: sim land in charted water

| Place (nearest charted name) | Reach (m) | Area (ha) | Patches | Worst at (lat, lon) | Sim x, y (m) | Cell, edition, update (issued) |
|---|---|---|---|---|---|---|
| Frank Valley | 47 | 3.0 | 19 (8 ≥30 m) | 37.87321,-122.60062 | -13834,6977 | US5OAKFE ed 1 upd 0 (2025-12-05) |
| Lands End | 47 | 1.6 | 9 (1 ≥30 m) | 37.78607,-122.50909 | -5784,-2723 | US5OAKEF ed 1 upd 0 (2025-12-05) |
| Tennessee Point | 47 | 1.5 | 8 (3 ≥30 m) | 37.83422,-122.55048 | -9424,2637 | US5OAKFE ed 1 upd 0 (2025-12-05) |
| Tiburon Peninsula | 43 | 1.7 | 16 (2 ≥30 m) | 37.88587,-122.47998 | -3224,8387 | US5OAKGF ed 1 upd 1 (2026-02-18) |
| Baker Beach | 43 | 1.6 | 15 (2 ≥30 m) | 37.80053,-122.48123 | -3334,-1113 | US5OAKFF ed 1 upd 2 (2026-02-18) |
| Marin Peninsula | 43 | 1.4 | 10 (1 ≥30 m) | 37.85209,-122.56355 | -10574,4627 | US5OAKFE ed 1 upd 0 (2025-12-05) |
| Grand Avenue Pedestrian Bridge | 39 | 7.1 | 47 (2 ≥30 m) | 37.97561,-122.47441 | -2734,18377 | US5OAKHG ed 1 upd 3 (2026-02-02) |
| Silva Island | 35 | 5.3 | 50 (2 ≥30 m) | 37.89288,-122.50227 | -5184,9167 | US5OAKGF ed 1 upd 1 (2026-02-18) |
| Point Isabel | 35 | 1.4 | 15 (1 ≥30 m) | 37.89036,-122.32818 | 10126,8887 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| Punta San Quentin | 33 | 5.1 | 45 (1 ≥30 m) | 37.94597,-122.50966 | -5834,15077 | US5OAKGF ed 1 upd 1 (2026-02-18) |
| Point Protero | 33 | 3.1 | 24 (1 ≥30 m) | 37.89611,-122.35900 | 7416,9527 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| Point Lobos | 33 | 1.9 | 8 (4 ≥30 m) | 37.77888,-122.51636 | -6424,-3523 | US5OAKEF ed 1 upd 0 (2025-12-05) |
| Point San Pablo | 33 | 1.8 | 19 (1 ≥30 m) | 37.96313,-122.43234 | 966,16987 | US5OAKHG ed 1 upd 3 (2026-02-02) |
| Point Bonita | 33 | 1.8 | 18 (1 ≥30 m) | 37.82524,-122.51818 | -6584,1637 | US5OAKFF ed 1 upd 2 (2026-02-18) |
| Bird Island | 33 | 1.4 | 12 (2 ≥30 m) | 37.82434,-122.53797 | -8324,1537 | US5OAKFF ed 1 upd 2 (2026-02-18) |
| Invincible Rock | 33 | 1.0 | 9 (1 ≥30 m) | 37.96304,-122.43563 | 676,16977 | US5OAKHG ed 1 upd 3 (2026-02-02) |
| Point Blunt | 33 | 0.8 | 7 (1 ≥30 m) | 37.85389,-122.41812 | 2216,4827 | US5OAKFG ed 1 upd 2 (2026-04-22) |
| Parr Canal | 33 | 0.2 | 2 (1 ≥30 m) | 37.91776,-122.36457 | 6926,11937 | US5OAKGH ed 1 upd 1 (2025-12-17) |
| San Francisco-Oakland Bay Bridge-East of Yerba Buena Island | 29 | 7.3 | 71 (0 ≥30 m) | 37.82739,-122.31181 | 11566,1877 | US5OAKFI ed 1 upd 0 (2025-12-05) |

## Suggested order for (A)

Where people sail first, then by how far off:

1. **The Central Bay's city waterfront:** Rincon Point (57 m), Mission Rock Terminal (69 m), Potrero Point (65 m), the
   Illinois Street drawbridge (62 m), Telegraph Hill (45 m), Gashouse Cove (45 m, with (A)'s Gashouse Cove exit), Yerba
   Buena and Treasure Islands (53 m, 45 m).
2. **The East Bay shore by the Bay Bridge:** the Port of Oakland fill (125 m, 61 ha) and Fleming Point (62 m).
3. **The Estuary and Alameda:** Coast Guard Island and Alameda's north shore (270 m), Clinton Basin (103 m), Encinal
   Basin (53 m), Bay Farm Island (47 m).
4. **Richmond:** Point Richmond and Brickyard Cove (128 m), Parr Canal (77 m), Richmond Yacht Harbor (67 m), Point
   Potrero (47 m).
5. **Marin:** Strawberry Point (96 m), Sausalito Point (79 m), Tiburon Peninsula (59 m), Bluff Point (62 m).
6. **The outer coast and headlands, sim land in charted water (≤47 m):** Lands End, Baker Beach, Point Bonita, Tennessee
   Point. These are lower priority: they're under one terrain cell, and they're kept clear by the routers' 50 m shore keep.

**Likely fix, for (A) to decide:** build the land mask from the ENC's land and constructions at 5–10 m in place of the
50 m terrain cells, keeping the hand-drawn shores where they're closer. That also covers ROADMAP 8q8 (phantom land
astride the Berkeley Pier's deck). Then rerun this survey as the check.

## Not done

- **OSM:** not compared. From this environment, overpass-api.de resets the connection and osmdata.openstreetmap.de is
  refused by the proxy (403). The repo's OSM-derived files (the marinas, piers and wharves) came from OSM, so there's
  nothing to compare there. The natural coastline against OSM needs one of those hosts allowed, or an OSM coastline
  extract added to the repo.
- **Depth and hazards:** not part of this survey (the ENC fields of (A)).
- **Under 15 m:** patches under 15 m aren't listed. At 10 m and with the mask's 50 m cells, they're within the method's
  noise.
