# SFBOFS as the sim's current field

Approved by the owner on 19 Nov 2026, to be built after the stability sprint. The owner: if the sim can't reproduce
the Bay's current in high resolution, the game has no point.

## Why

The owner's race on v208 (Seaweed Soup race 1, Course 2, 7 Nov 2026 at 13:35) was slower than the real fleet by a
factor of two, and the current was why. NOAA's SFBOFS nowcast for that afternoon (scripts/data/sfbofs-transect.mjs,
the extract in src/environment/data/sfbofs-cityfront-2026-11-07.json; stills in docs/sfbofs/) shows:

- at NOAA's station SFB1204 the model agrees with NOAA's prediction: a 2.2 kt surface ebb against 2.33–2.38;
- at the marks the stream is weaker than the sim has it: 2.1 kt at X, 2.0 at A and 1.3 at mark 6 (Fort Mason), where
  the sim has 2.35–2.4 at all three;
- the falloff toward the shore reaches 700–1000 m, not the sim's 350 m. The sim's shoreRelief is unsourced, and it's
  switched off within 600 m of a station, so near SFB1204 (0.8 km out, in the stream) the sim spreads the mid-channel
  current in to the marks.

Skipper Model put the sim's floor for Course 2 that day at 65–75 minutes with perfect sailing (an estimate). The real
fleet took 51–55.

## The grid and its resolution

- SFBOFS is NOAA's San Francisco Bay Operational Forecast System. It's FVCOM, an unstructured triangle mesh: 54,120
  nodes and 102,264 elements over 2,581 km², with 20 sigma layers.
- Cut to the racing and cruising area, from Point Bonita to the Bay Bridge and Richmond to Hunters Point (234 km²), it
  is 15,278 triangles on 8,172 nodes. The triangles are a median 175 m across (10% are 155 m, 90% are 188 m). Off the
  Cityfront, from the Gate to Pier 39, there are 1,222 triangles, 146–185 m across.
- The field is stored at the nodes and interpolated inside each triangle (barycentric), so it's continuous, with no
  steps at the triangles' edges.
- One layer: the top sigma layer, about 1 m deep in 18 m of water. That's the water a Folkboat (1.2 m draft) sails
  in, and what NOAA's SFB1204 2 ft bin measures.

## Time: any date, past or future

The sim needs a current for any date and time, like NOAA's predictions. SFBOFS's archive on NOAA's open-data bucket
(noaa-nos-ofs-pds) starts on 21 Mar 2024, and it forecasts only 48 hours ahead, so the model itself is analyzed:

- 29 days of hourly nowcasts for each season: a wet-season month and a dry-season month, about 1,400 fields files of
  56 MB. They're streamed through the script one at a time (about 80 GB of transfer, nothing kept but the extract).
- A least-squares tidal harmonic fit of each node's u and v, to M2, S2, N2, K2, K1, O1, P1, Q1 and the shallow-water
  M4, MS4, MN4 and M6, plus each season's mean flow (the river outflow).
- The page synthesizes the current for the race's date and time, continuous in time, with no gaps between nowcasts to
  interpolate.
- What it misses is what NOAA's predictions miss too: the day's weather (wind setup, a storm's river flow). For a real
  race day inside the archive, the day's non-tidal residual could be added later, about 60 KB a day, loaded lazily.
  That's an option, not part of this plan.

## Validation, before anything ships

- Against held-out nowcasts (the 7 Nov afternoon is already extracted): the target is 0.2 kt RMS or better in the
  racing area.
- Against every NOAA prediction station in the area: SFB1202–1205 and SFB1211, and the PCT stations where they predict.
- Stills of the synthesized field against the nowcast, and of the sim's current before and after.

## Size on load

| Part | Size |
|---|---|
| Harmonics at the nodes: 8,172 × 2 (u, v) × 12 constituents × 2 (amplitude, phase), int16 | 785 KB |
| Each season's mean flow | 65 KB |
| The nodes, 2 × float32 | 65 KB |
| The triangles, 3 × uint16 | 92 KB |
| **Total** | **about 1.0 MB raw, roughly 0.7 MB gzipped** |

With 8 constituents instead of 12 it's about 0.7 MB raw. For scale, the page already carries sf-real-days.json at
1.7 MB.

## Step cost

- Point location: a 100 m bucket grid built at load (about 50k cells), then the containing triangle (1–3 tests), then
  its barycentric weights.
- Each node's current at the clock: the sum of 12 cosines, cached per node for 10 s of race time (the tide doesn't
  change faster than that).
- So a boat's current is about three cache reads and a few multiplies, likely no slower than today's inverse-distance
  blend of the stations. perf-pair against main, and the chart's streak drawing (which samples the whole area), before
  it ships.

## Where the model doesn't reach

- Outside the area: today's NOAA-station field (environment/tide.ts), blended over 500 m at the area's edge.
- Inside the harbors and marinas, which 170 m triangles don't resolve (the model's coastline is coarse there: see the
  Marina and Fort Mason's piers in docs/sfbofs/sfbofs-mesh.png): today's harbor models (basinCalm, the harbor mouths,
  the pier wakes).
- Between the model's coastline and ours, where we have water it calls dry (mostly the last 50–150 m off the
  seawall): the nearest wet node's current, eased to the bank by today's shoreRelief. That's the only place an
  estimate stays.

## Order of work

1. The harmonic-analysis script and the download: a data job, about a day with checking (estimate).
2. The validation report against the nowcasts and the NOAA stations, with stills, before anything goes in the page.
3. The field in tide.ts behind the existing currentAt, with tests: the owner's case reproduced (whether the real
   fleet's 51–55 minutes becomes reachable), perf-pair, and the stills of the sim against SFBOFS.
4. Physics review.

shoreRelief isn't refitted in the meantime (the Coordinator, 19 Nov 2026): SFBOFS replaces it.

## Tools and data

- h5wasm, a devDependency (the owner, 19 Nov 2026), used only by scripts under scripts/data/ and never in the page.
  SFBOFS's fields files are NetCDF-4 (HDF5).
- NOAA's open-data bucket, noaa-nos-ofs-pds.s3.amazonaws.com, is reachable from the sessions' network. The nowcast
  files are named sfbofs/netcdf/YYYY/MM/DD/sfbofs.tHHz.YYYYMMDD.fields.nNNN.nc, n000 to n006 being the six hours up to the cycle
  (cycle 03z's n000 is 21:00 UTC the day before).
