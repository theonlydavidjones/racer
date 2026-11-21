# The sim's chart features against NOAA's ENC (21 Nov 2026)

Requested by Coordinator 2: a one-by-one check of the sim's chart features against NOAA's ENC, race areas first.

## How it was checked

- **NOAA's data:** all 21 cells fetched fresh by `scripts/fetch-charts.mjs`, with catalog `ENCProdCat.xml` of 2026-11-21. GDAL read each S-57 object with its LNAM.
- **The sim's data:**
  - the chart data (`src/geo/data/enc-chart.json`);
  - the racing marks (`src/sim/places.ts` and the course files);
  - the depth grid (`src/environment/data/depth-grid.json`);
  - the AI ships' routes (`src/sim/traffic.ts`);
  - the land a boat runs aground on (`src/geo/shore.ts` onLand).
- **Areas:**
  - the race areas: the City Front, Alcatraz, Angel Island, the Berkeley and Olympic Circles;
  - the passages between them (37.79–37.90 N, 122.30–122.50 W).
- **Scripts:** the checking scripts are in my scratchpad, not the repository.

**Sizes.** S is a fix outside `src/sim`, made here. A **flag** touches racing marks or `src/sim` and is for the Coordinator to rule on before anything changes, as the request said.

## What matches

- **Government buoys and beacons:** `places.ts` has 27. Of these, 25 are within 2 m of their ENC objects, Blossom Rock is 8 m off, and Harding Rock is 28 m off (#3 below). Their colors, shapes and light characteristics all match.
- **Light text on the chart:** every light in the race areas reads the same on the sim's chart as in the ENC's LIGHTS objects. That's the character, color and period of each buoy or beacon (`aidText` against the ENC's LITCHR, color and SIGPER attributes), with no mismatches.
- **Depth contours and soundings on the chart:** drawn straight from the ENC. The contours are its fathom lines (0, 1, 2, 3, 5, 6, 10, 15 and 20 fm) and the soundings are converted to feet at MLLW (×3.28084), as the chart's note says.
- **The shipping lanes on the chart:** the TSS lanes, separation zones and lines, the precautionary areas and the deep-water route are all drawn from the ENC objects.
- **The course files:** their marks (`src/courses/data`) agree with `places.ts` to the meter, and in shape and look.

## Mismatches

| # | What | ENC cell, object | The sim | Still | Size |
|---|------|------------------|---------|-------|------|
| 1 | **The chart data is one NOAA update behind.** US4CA2CJ went from update 1 to 2 and US5OAKFF from 2 to 3, both issued 2026-11-12. In the new data, Four Fathom Bank Lighted Bell Buoy moves 35 m north and two restricted areas lose their name ("San Francisco Bay"). | US4CA2CJ, US5OAKFF | src/geo/data/enc-chart.json | — | S (regenerated: see below) |
| 2 | **The City Front marks A, X and Blackaller sit 66–148 m from the ENC's yellow racing buoys, and their shapes differ.** The ENC charts yacht-racing buoys A, B, C, D and X off the City Front (CATSPM 52, from the Local Notice to Mariners 51/11 of 2011). The sim's marks come from YRA's published positions. A is 136 m west of ENC "A" (the sim draws a sphere, the ENC a nun). X is 66 m north of ENC "X" (cylinder against spherical). Blackaller is 148 m east of ENC "C", if C is Blackaller (column against can). Which is right today, YRA's list or a 2011 notice, isn't something the data can say. | US5OAKFG BOYSPP: A 0226014C1D8E0032, X 0226014C1D8F0032, C 0226014C1D8B0032 (also B …8D, D …8C) | src/sim/places.ts:33, :34, :36; the course files | `enc-check/enc-01-cityfront-marks.png` | **flag** (racing marks) |
| 3 | **Harding Rock buoy is 28 m north of the ENC's.** The sim has 37.83824, -122.44599; the ENC has 37.837987, -122.446044 (source date 2004-08-24). | US5OAKFG BOYLAT 0226014C1D7F0032 ("Harding Rock Light Buoy HR") | src/sim/places.ts:38 | `enc-check/enc-04-harding.png` | **flag** (a racing mark, 17) |
| 4 | **The container ship and the tanker sail across Yerba Buena Island.** Their route's last leg (37.824 N 122.390 W to 37.806 N 122.350 W) crosses the island's land, and water under 2 m on both sides. It also leaves every lane and the deep-water route east of 122.396 W, and crosses a separation zone once off Fort Point. | LNDARE (Yerba Buena Island); TSEZNE 022640005FEBA2D0 | src/sim/traffic.ts:31 (ROUTES.channel) | `enc-check/enc-02-ship-route-ybi.png` | **flag** (src/sim) |
| 5 | **The bay-cruise boats' route turns on land at Lime Point.** Its waypoint 37.8280 N 122.4790 W is ashore under the bridge's north end. | LNDARE, US5OAKFF | src/sim/traffic.ts:37 (ROUTES.tour) | `enc-check/enc-03-tour-route-limepoint.png` | **flag** (src/sim) |
| 6 | **No depth in the race areas, so the rocks there can't be hit.** The sim's depth grid covers only San Rafael Bay and San Leandro Bay. In the Central Bay a boat runs aground only on the shore mask. Of the ENC's rocks, wrecks and obstructions in the race areas that are under 1.8 m or dry, 92 lie in water the sim treats as open, 36 of them more than 40 m from any sim land. Among them: Anita Rock (1.5 m, UWTROC 02260BEBA22DA2D0) and an obstruction at 0.9 m beside it, off the St. Francis YC; a rock west of Alcatraz that dries 1.5 m (0226F2B6F9D8A2D0); a wreck 0.3 m deep off Yerba Buena Island (02267B11D222A2D0); and the rocks off Fort Point, Lime Point and Angel Island. The list is in my scratchpad (shallow-sim.tsv), not the repository. | UWTROC, WRECKS, OBSTRN (US5OAKFF, FG, FH, GF, GG, GH, EF, EH) | src/environment/data/depth-grid.json; src/geo/shore.ts:405 (onLand) | `enc-check/enc-01-cityfront-marks.png` (Anita Rock) | **flag** (src/geo, src/environment: the physics) |
| 7 | **The converter leaves out four classes that matter to a small boat:** tide rips (WATTUR, 8 objects), sand waves (SNDWAV, 7), piles (PILPNT, 248) and hulks (HULKES, 1). Tide rips are charted off the Gate and Alcatraz. | WATTUR, SNDWAV, PILPNT, HULKES | scripts/fetch-charts.mjs (its classes) | — | M (symbols to draw: a ruling on which) |
| 8 | **Marks the ENC doesn't have.** 6 · Fort Mason "M", 15 · Hank Easom, 4 · Knox, the Berkeley Circle marks (XOC, FOC), Campanile YC's, Brickyard RC's and the Oakland and Sandbar YC marks have no ENC object. They're YRA's and the clubs' own marks, not charted. Nothing to fix. | — | src/sim/places.ts | — | — |

## Fixed here

- **#1:** the chart data regenerated from the 2026-11-21 catalog, with US4CA2CJ at update 2 and US5OAKFF at update 3 (the commit cites "ENC check #1"). It's data under src/, so the batch it's in needs the full `npm test` (CLAUDE.md).
