# City front and Alcatraz in high resolution (after the sprint)

Owner request, 18 Nov 2026: Alcatraz and the city front, Fort Point to Fisherman's Wharf, in beautiful resolution.
Status: planned, starts after the stability sprint. Research by the researcher agent, 18 Nov. Licenses marked
(secondary) were read from search excerpts and must be re-read on the live pages before anything ships.

## What we have now
- Everything is procedural. No model files, no loaders.
- src/render/landscape.ts draws the city as random boxes on a 36 m grid, by neighborhood. It hand-models the
  landmarks from primitives (Fort Point, the Palace of Fine Arts, Coit Tower and others).
- Alcatraz (~line 459) is boxes at the author's own positions, which are unverified.
- The terrain is 50 m cells (src/render/data/terrain.png).
- The page is 4.99 MB against a 16 MB limit.

## Sources (all free)
| Source | Use | License |
|---|---|---|
| USGS 3DEP 1 m DEM, CA_SanFrancisco_B23 (prd-tnm S3) | Terrain: Alcatraz, Fort Point bluffs | Public domain |
| USGS 3DEP lidar, CA_SanFrancisco_1_B23 (EPT, ~30 pts/m², estimate) | Building heights and roof shapes, Alcatraz structures | Public domain |
| DataSF building footprints with heights, ynuv-fyni (2011 lidar) | City-front footprints and heights | PDDL (secondary) |
| OpenStreetMap / Overture buildings | Footprints, levels, piers (already used for the coast and the Wharf) | ODbL: on-screen credit, and derived footprints shared under ODbL |
| HABS/NPS drawings and scans of Alcatraz (LoC CAL,38-ALCA,1-…) | The cellhouse, the lighthouse, the warden's house | Federal, likely public domain; check per item |
| Palace of Fine Arts, Sketchfab, A. Balabanian | Hero model, needs retopology (711k tris) | CC BY (secondary) |
| NPS 2025 Alcatraz scan (VCTO Labs) | Ask GGNRA whether it can be released | Unknown |

## No-gos
- Google Photorealistic 3D Tiles and Cesium tiles: no caching or extraction.
- NonCommercial or editorial-only models.
- OSM data without visible credit.

## Pipeline
1. A build script (scripts/make-cityfront.mjs, the repo's make-* pattern): DataSF and OSM footprints and heights,
   extruded and merged by block, with no UVs, quantized and meshopt-compressed. The lidar refines roof heights.
2. Alcatraz: island terrain from the 1 m DEM. Structures modeled from the HABS drawings and the lidar, by hand in
   Blender or by script. Positions are checked against the drawings.
3. Hero landmarks: Fort Point, the Palace, Coit, Ghirardelli and the Hyde Street ships, at 20–60k triangles each.
   The owner doesn't use Blender (18 Nov), so there are two routes:
   (i) an agent models them in code from the HABS/NPS drawings and photos: no money, more tokens, architectural rather
       than photo-real;
   (ii) a hired freelance modeler delivers glTF, about $50–300 each (an estimate).
   The plan: Alcatraz's structures by route (i), since they are plain concrete masses. The fancier landmarks get decided
   from the stills. The Palace can start from the CC-BY scan.
4. three r186 loads meshopt, Draco and KTX2 with no new npm package. Meshopt first, since it inlines easily. KTX2
   textures only if the budget allows: its wasm must be inlined or fetched.
5. Level of detail: full detail within ~1 km of the boat, merged blocks beyond, the current boxes inland.

## Budget (estimates)
- Mesh plus textures: about 6–12 MB binary. Inlined as base64 that grows by a third, so the target is about
  5–6 MB binary to stay under 16 MB.
- The frame gate: perf-ab's +5% draw calls and +15 MB heap still apply.
- Sizes are measured on the first block before committing to the whole stretch.

## Sessions (when it starts)
- A researcher (light model): re-read every license on the live pages. The network allowlist needs data.sfgov.org,
  openstreetmap.org, loc.gov, nps.gov and sketchfab.com.
- Scenery, one Opus session at medium effort: the build script, the loader, the LOD and the frame and size gates.
- Optional: a Sonnet session for the Alcatraz structures from the drawings.
- The visual-checker on each stage, and the owner sees stills before anything ships.

## Phases
1. Alcatraz: the island terrain and the structures (the smallest, most visible win).
2. The city-front blocks, Fort Point to the Wharf.
3. The hero landmarks.
4. Night windows on the new buildings (night.ts).
