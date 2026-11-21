# City front: sources (researched 21 Nov 2026)

For r296 (the city front, Fort Point to Pier 39, as simple massing plus a few detailed landmarks). Follows docs/plans/cityfront-alcatraz.md; format after docs/plans/alcatraz-sources.md. Nothing built and no geometry. "Read" means opened and parsed; "seen" means a search result or listing only.

## Answer first
- **Terrain:** two 1 m 3DEP tiles cover the whole stretch: `x54y419` (112 MB, Fort Point to the Marina) and `x55y419` (86 MB, Fort Mason to Pier 39 and Coit). Public domain. The Alcatraz step already read x55y419.
- **Bay floor:** the USGS 1 m central-Bay bathymetric DEM is on ScienceBase, public domain, item `607df15ad34e8564d67e3ae9` (NAVD88). A 962 MB zip; its download host (sciencebase.usgs.gov) is blocked, so it may be unfetchable here.
- **Footprints and heights:** OSM has most of what is needed. Four bbox pulls (-122.490..-122.399, 37.800..37.815) hold 5,444 building ways, 4,380 (80%) with `height` (median 10 m, max 225 m); about 190 have `building:levels`. Where the heights came from isn't stated (DataSF itself is blocked).
- **Measured drawings at LoC:** Aquatic Park Bathhouse (12 sheets), Municipal Pier (64), Balclutha (71), C.A. Thayer (38), 7 each for Eureka, Alma, Hercules and Eppleton Hall. Fort Point at LoC is photographs only (65 photos); its 1997–98 HABS drawings (9 sheets, Carey & Co) are cited in NPS's 2006 Historic Structure Report, which has the floor plans.
- **No HABS/HAER found for:** Coit Tower, Ghirardelli, Pier 39, Fort Mason's piers and warehouses, the Marina Green, Crissy Field's airfield (not found in LoC searches: not proof they don't exist). The Palace of Fine Arts has photos and data pages (HABS CA-1909), no drawings.
- **Licenses:** only OSM (ODbL) needs on-screen credit and share-alike. USGS, NOAA, NPS and the LoC HABS/HAER records are US government material, public domain, with a courtesy credit. No license found that blocks use.

## Hosts
- **Reachable:** www.loc.gov (JSON API works), tile.loc.gov (URLs only), www.nps.gov (curl; WebFetch couldn't resolve it), npgallery.nps.gov, www.sciencebase.gov, www.ncei.noaa.gov and cmgds.marine.usgs.gov (landing pages only), prd-tnm.s3.amazonaws.com, usgs-lidar-public.s3.amazonaws.com, noaa-nos-coastal-lidar-pds.s3.amazonaws.com, api.openstreetmap.org, charts.noaa.gov, overturemaps-us-west-2.s3.amazonaws.com. en.wikipedia.org works but the proxy rate-limits it (HTTP 429 on about half the calls).
- **Blocked:** data.sfgov.org, cdn.sfgov.org, sfplanninggis.org, commons.wikimedia.org, www.openstreetmap.org, overpass-api.de, www.historicalcharts.noaa.gov, nowcoast.noaa.gov, www.davidrumsey.com, ngmdb.usgs.gov, sciencebase.usgs.gov.
- **Not tried:** sketchfab.com (the Palace scan), coast.noaa.gov, ngdc.noaa.gov.

## 1. Photos and drawings (LoC HABS/HAER/HALS, NPS)
Rights (read on ca0649, applies to all HABS/HAER items): "No known restrictions on images made by the U.S. Government; images copied from other sources may be restricted" (https://www.loc.gov/rr/print/res/114_habs.html). LoC does not own the rights; assess each item. Credit: "Library of Congress, Prints and Photographs Division, HABS/HAER/HALS". Counts are from each item's JSON (`https://www.loc.gov/item/<id>/?fo=json`).

| Place | LoC item (call no., survey no.) | Contents | Notes |
|---|---|---|---|
| Fort Point | https://www.loc.gov/item/ca0649/ (HABS CAL,38-SANFRA,4-; CA-1239) | 65 photos, 3 color transparencies, 5 data pages, 6 caption pages; no drawings | Color TIFF masters ~52 MB each. "For additional photographs see Golden Gate Bridge (HAER CA-31)". |
| Golden Gate Bridge, Fort Point arch | https://www.loc.gov/item/ca1355/ (HAER CAL,38-SANFRA,140-) | 41 photos, 6 transparencies | Photos only |
| Aquatic Park Bathhouse (Mooser, 1939) | https://www.loc.gov/item/ca1404/ (HABS CA-2225) | **12 measured drawings**, 46 photos, 22 transparencies, 10 data pages | Sheets: https://www.loc.gov/resource/hhh.ca1404.sheet (titles not read) |
| Aquatic Park (HALS) | https://www.loc.gov/item/ca4182/ (HALS CA-113) | 13 drawings, 102 photos, 62 data pages | Landscape history |
| Municipal Pier | https://www.loc.gov/item/ca4327/ (HALS CA-113-A) | **64 measured drawings**, 41 photos, 19 data pages | The nearest thing to a measured plan of the curved pier |
| Balclutha | https://www.loc.gov/item/ca1493/ (HAER CA-54) | **71 drawings**, 150 photos, 240 data pages | Sheets: https://www.loc.gov/resource/hhh.ca1493.sheet. Color TIFFs ~54 MB each |
| C.A. Thayer | https://www.loc.gov/item/ca1506/ | 38 drawings, 31 photos | |
| Ferry Eureka | https://www.loc.gov/item/ca1504/ (HAER CA-59) | 7 drawings, 51 photos | |
| Scow schooner Alma | https://www.loc.gov/item/ca1505/ (CA-60) | 7 drawings, 13 photos | |
| Tug Hercules | https://www.loc.gov/item/ca1507/ (CA-62) | 7 drawings, 44 photos | |
| Tug Eppleton Hall | https://www.loc.gov/item/ca1508/ (CA-63) | 7 drawings, 28 photos | |
| Other small craft | ca2623 to ca2638, ca3967, ca3979, ca3980 | 1 drawing each | Low priority |
| Palace of Fine Arts | https://www.loc.gov/item/ca0686/ (HABS CA-1909) | 13 photos, 2 transparencies, 16 data pages; no drawings | Joseph Baird Jr., 1956, before the 1964–74 rebuild |
| Fort Mason | https://www.loc.gov/item/ca0646/ (CA-1119, 6 photos); officer and NCO quarters ca0647, ca0648, ca0995, ca1039 | Photos only, 2 to 6 each | Barracks ca1030, ca1135: 2 photos each |
| Fort Mason Pumping Station No. 2 | https://www.loc.gov/item/ca0723/ (HAER CA-1) | 71 photos, 20 data pages | |
| Pier 39 area | https://www.loc.gov/item/ca0638/ (Eagle Cafe, moved to Pier 39; CA-2046) | 7 photos, 4 data pages | Pier 39 itself has no record |
| North Point Pier, Pier 42 bulkhead buildings | https://www.loc.gov/item/ca0682/ (27 photos); https://www.loc.gov/item/ca1551/ (15 photos) | Photos only | Wharf-side seawall buildings |
| Crissy Field and Presidio | ca2040, ca2042 (Crissy Field North Cantonment), ca3738, ca4242 to ca4249 (Mason Street warehouses), ca1983 (Cavalry Stables, 31 photos) | Photos and data pages only | |
| Coit Tower, Ghirardelli, Marina Green, Pier 39 | none found | not found | A negative search, not proof |

NPS documents:

| Document | Gives | URL | Rights |
|---|---|---|---|
| Fort Point Historic Structure Report 2006 (4.9 MB PDF; read) | Floor plans in Appendix A (HABS-based measured drawings, figures 25 to 33); cites a 1997–98 HABS recording of 9 sheets by Carey & Co | https://www.nps.gov/goga/learn/historyculture/upload/2006-fopo-hsr.pdf | NPS, public domain unless marked; individual photos may be third-party |
| Fort Point HSR 1973 (Bearss, 34 MB; size only) | Historic data | https://www.nps.gov/goga/learn/historyculture/upload/1973_Fort_Point_HRS_by_Bearss.pdf | Same |
| NPS terms of use (read) | NPS-created material "generally considered in the public domain"; citation appreciated | https://www.nps.gov/aboutus/disclaimer.htm | n/a |
| Hyde Street ship pages (read) | Lengths and beams (section 5) | https://www.nps.gov/safr/learn/historyculture/ (balclutha.htm, eureka.htm, hercules.htm, alma.htm, c-a-thayer.htm) | Same |

Wikimedia Commons is blocked, so no public-domain image there was checked.

## 2. Maps and charts

| Source | Covers | Scale and format | License | Status |
|---|---|---|---|---|
| NOAA ENC cells, https://charts.noaa.gov/ENCs/ | src/geo/data/enc-chart.json (scripts/fetch-charts.mjs) already holds US5OAKEE (entrance, 1:22,000), US5OAKEG (San Francisco, 1:22,000), US5OAKFF (Golden Gate and Marin, 1:22,000), US5OAKFG (Alcatraz and Angel Island, 1:12,000) | S-57 vector; piers, depths and structures already in the file | Public domain | Read (repo; 200 from charts.noaa.gov) |
| USGS historical topo, `https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/GeoTIFF/CA/` | "CA_San Francisco North" 1:24,000 (1947, 1956, 1993, 1995, 1950 re-issue) and "San Francisco South"; older 1:62,500 `298889_1895`, `298890_1899`, `298896_1915` | GeoTIFF, ~10–13 MB each (e.g. `CA_San Francisco North_300059_1947_24000_geo.tif`, 11.5 MB) | Public domain | Listing seen; quad bounds not read |
| Sanborn Fire Insurance Maps, LoC (https://www.loc.gov/item/sanborn00813_019/ and neighbors) | San Francisco 1913 (Vol. 5, 110 sheets) and 1948–50 updates | Scanned sheets: footprints and storeys | Pre-1927 public domain; per-item "no known restrictions" statement not read | Seen; sheets not matched to places (the Palace and Marina, 1915 fair, probably not in 1913) |
| NOAA historical charts and T-sheets, USGS NGMDB, David Rumsey | | | | Blocked |

## 3. Elevation, lidar and bathymetry
Terrain tiles at https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/ (public domain):

| Tile | Size and bounds (UTM 10N, NAD83) | Covers | Read? |
|---|---|---|---|
| `USGS_1M_10_x54y419_CA_SanFrancisco_B23.tif` | 111,944,984 bytes (HEAD). About E 539,994–550,006, N 4,179,994–4,190,006 by pattern | Fort Point (E 546,027, N 4,184,930), Crissy Field, Marina Green (E 549,181), Palace of Fine Arts (E 548,559) | Size confirmed; bounds inferred |
| `USGS_1M_10_x55y419_CA_SanFrancisco_B23.tif` | 86,461,076 bytes; from E 549,994 | Fort Mason (E 550,088), Aquatic Park, Hyde Street Pier, Ghirardelli, Pier 39 (E 551,953), Coit (E 552,309) | Read (the Alcatraz step) |

- Fort Mason's west edge (Black Point) is near E 550,000: the Fort Mason to Marina stretch needs both tiles. x54y420, x55y420 and x56y419 don't exist (404). UTM positions are a conversion good to about 1 m. Bare earth; water is nodata with a belt at −0.4 to +0.5 m (docs/plans/alcatraz-sources.md).
- Lidar (EPT, `https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23/`; the Alcatraz step has read it with laz-perf): depth-6 nodes by place, points in the subtree: Fort Point 6-13-50-31 (3.52 M); Crissy Field west 6-17-49-31 (50 k, beach and water); Marina Green 6-25-48-31 (5.93 M); Fort Mason 6-28-48-31 (4.42 M); Aquatic Park and Hyde Street 6-32-49-31 (4.54 M); Pier 39 6-35-49-31 (4.97 M); Palace 6-22-47-31 (6.61 M); Coit 6-37-47-31 (6.28 M); Ghirardelli 6-31-48-31 (not fetched). The cube is EPSG:3857, edge 21,110 m (a depth-6 cell about 330 m in Web Mercator, 260 m on the ground). No building class: roofs are class 1, separated by DEM difference (as docs/plans/alcatraz-sources.md and scripts/make-alcatraz-heights.mjs).

Bathymetry:

| Source | Gives | Format and size | License | Status |
|---|---|---|---|---|
| USGS ScienceBase 1 m Central SF Bay DEM, https://www.sciencebase.gov/catalog/item/607df15ad34e8564d67e3ae9 (NAVD88; MLLW twin `606b73efd34e3d0429b204d3`) | Whole central Bay, −122.5167 to −122.2351, 37.7251 to 37.9943; surveys 2005–2020, published 2021-07-08 (Fregoso, Jaffe, Foxgrover); 24,577 × 29,697 cells, UTM 10, NAVD88 m | `CentralSFBay_DEM_Mosaic_NAVD88_1M.zip`, 962,525,101 bytes (a 216 KB quick-look JPEG) | Public domain, "freely redistributable with proper metadata and source attribution"; not for navigation | Item JSON and metadata read; zip not downloaded (link points at blocked sciencebase.usgs.gov). Gaps of 10–300 m are interpolated |
| USGS whole-Bay 1 m DEM v2.0, item `5e0592d6e4b0b207aa094f2a` (DOI 10.5066/P9TJTS8M) | North, central and south sections, MLLW and NAVD88 | Only a version history file is on the item | Same series | Read; data files not on the item |
| Historical bathymetry 1855–2005 (`663ea8fdd34eaf9729f7b46d`), "Central San Francisco Bay bathymetry" (`66760468d34e3cf50fef28ec`) | Old soundings and surfaces | | USGS, public domain | Titles only |
| NOAA coastal lidar, `noaa-nos-coastal-lidar-pds` | Bucket opens; no dataset matched to the Bay | | NOAA, public domain | Unconfirmed; not needed if 3DEP and the Bay DEM are used |
| NCEI, cmgds.marine.usgs.gov | Landing pages only | | | Unused: the ENC depths are already in the repo |

## 4. Building and pier footprints

| Source | Gives | License | Status |
|---|---|---|---|
| OSM via `https://api.openstreetmap.org/api/0.6/map?bbox=...`, four boxes (W,S,E,N): -122.4900,37.8000,-122.4600,37.8150 (5.2 MB); -122.4600…-122.4350 (9.8 MB); -122.4350…-122.4150 (9.6 MB); -122.4150…-122.3990 (7.8 MB) | 5,444 unique building ways; 4,380 with `height` (per box 210/276, 1,438/1,645, 1,557/1,894, 1,215/1,675); few `building:levels`; about 100 named. The few `source` tags say Bing or survey | ODbL 1.0: visible "© OpenStreetMap contributors", derived databases shared under ODbL | Read and parsed. Origin of the heights not stated |
| Overture Maps buildings, `s3://overturemaps-us-west-2/release/2026-11-18.0/theme=buildings/type=building/` | Parquet parts of ~520 MB each, with `type=building_part` | Built from OSM (ODbL), Microsoft ML and others: ODbL credit applies at least; not re-read | Listing only; needs DuckDB or a Parquet range read; adds nothing OSM lacks unless its heights are better |
| DataSF Building Footprints, ynuv-fyni | The plan's pick | PDDL (secondary, unconfirmed) | Blocked: unverified |
| Repo `src/geo/data/` (OSM, ODbL, fetched 11 Nov 2026) | `wharf.json` (Fort Mason east to Pier 27: Municipal Pier, Black Point Pier, Hyde Street Pier, Piers 47, 41, 39, 33, 27, the Wharf breakwater, 305 dock lines); `marina-coast.json`; `fortmann.json` (Fort Mason boat harbor with slips); `ferry-building.json`; `pile-piers.json`; `east-piers.json`; `south-beach.json`; `shore-mask.json` | ODbL | Read (keys and sources) |

Landmarks in OSM (the four boxes; height 0.01 on "San Francisco Tower" is a placeholder):

| Place | OSM way | Height | Notes |
|---|---|---|---|
| Palace of Fine Arts | 288371295 | 48 m | 188 nodes, 37.8029 N, 122.4484 W |
| Coit Tower | 28824850 | 64 m | 37.8024 N, 122.4058 W (Wikipedia: 180 ft = 55 m) |
| Fort Point Light (`building:part`) | 1358282761 | none | |
| Fort Point itself | untagged way 370509217 (28 nodes), probably the outline: unconfirmed | | No tagged building |
| Warming Hut | 32777524 | 7 m, 2 levels | |
| Crissy Field Center | 288374432 | 5 m | |
| Fort Mason Pier 1, 2 (Herbst), 3 (Festival) pavilions | 288387751, 288387752, 288387753 | 17, 16, 13 m | |
| National Maritime Museum (Bathhouse) | 32839686 | 10 m | |
| The Cannery | 288391070 | none | |
| Clock Tower Building (Ghirardelli) | 939539785 | 10 m, 3 levels | Ghirardelli's main building not named in the pull |
| Pier 39 Garage; Pier 41 | 27570851; 288472568 | none; 9 m | |
| Pier 33, Pier 35 | 91913158, 91913150 | 11 m, none | |
| Golden Gate Bridge south tower, anchorage | 1560010162 to 1560010167 | none | |

## 5. Landmark dimensions

| Landmark | Dimension | Source | Quality |
|---|---|---|---|
| Fort Point, gorge (south-west) face | 110 ft long, 40 ft high | NPS HSR 2006, "Physical Description" (read) | Primary |
| Fort Point, exterior walls | brick and rubble fill, 7 ft thick, Flemish bond, Folsom granite quoins 36 × 24 × 16 in, Chinese granite foundation (the HSR text reads "10 feet thick": garbled extraction) | NPS HSR 2006 | Primary |
| Fort Point, sally port doors | each 4'-10" wide × 9'-4" high | NPS HSR 2006 | Primary |
| Fort Point, built | 1853–1861, brick, three casemate tiers plus the barbette tier, 7 ft walls | NPS HSR 2006, NPS search summaries | Primary / summary |
| Fort Point, plan | an "irregularly shaped rectangle", two flanking bastions, flanks of 13, 26 and 35 ft | NPS HSR 2006 | Primary; overall plan size is on the HABS sheets, not read |
| Palace of Fine Arts | rotunda about 162 ft (49 m) by one source, 158 ft by another; rebuilt 1964–74 in reinforced concrete; colonnade length not found | Wikipedia, SF Chronicle (summaries) | Secondary, conflicting |
| Coit Tower | 180 ft (55 m) fluted concrete shaft, observation deck 32 ft below the top, built 1932–33, Arthur Brown Jr. | Wikipedia | Secondary |
| Aquatic Park Bathhouse | WPA, streamline moderne, William Mooser III, opened 22 Jan 1939; dimensions are on the 12 HABS sheets (not read) | LoC ca1404, ca4182 | Primary for the history |
| Balclutha | 256.5 ft long, 38.65 ft beam, 22.75 ft depth of hold, 1,689 gross tons; built 1886 | NPS safr page (read) | Primary |
| C.A. Thayer | 219 ft full length, 156 ft deck length, 11.38 ft depth of hold | NPS safr page (read) | Primary |
| Eureka | 299.5 ft overall, 78 ft extreme width | NPS safr page (read) | Primary |
| Hercules | 151 ft long, 26 ft beam | NPS safr page (read) | Primary |
| Alma | 80 ft overall, 59 ft registered, 22.6 ft beam | NPS safr page (read) | Primary |
| Pier 39 | opened 4 Oct 1978 by Warren Simmons; footprint from OSM (way 27570851 for the garage, plus `wharf.json`) | Wikipedia | Secondary |
| Ghirardelli Square | block bought 1893, mall 1964, Clock Tower building; NR listing "Pioneer Woolen Mills and D. Ghirardelli Co."; no dimensions found | Wikipedia | Secondary |

## What to fetch first
1. Both 1 m DEM tiles `x54y419` (112 MB) and `x55y419` (86 MB) into a cache; scripts/lib/geotiff-f32.mjs reads them.
2. The OSM building pull as four boxes with a User-Agent: the 5,444 footprints and 4,380 heights are the city-front massing. Keep the credit.
3. LoC HAER CA-54 (Balclutha, 71 sheets), CA-60 and CA-62 (Alma, Hercules), and the ca1404 and ca4327 sheets as JPEG service files (tile.loc.gov), not the 50–240 MB TIFF masters: the Hyde Street ships, the Bathhouse and Municipal Pier.
4. Fort Point: Appendix A (floor plans) of the 2006 NPS HSR, plus the 65 HABS photos from ca0649 at 1024 px for the detailed model.
5. The central-Bay 1 m bathymetry DEM (962 MB zip), if sciencebase.usgs.gov can be allowed; otherwise keep the ENC depths in the repo.
6. The Palace and Coit Tower have no measured drawings: use OSM heights (48 m, 64 m), the lidar nodes (6-22-47-31, 6-37-47-31) and the HABS ca0686 photos for the Palace.

## Gaps and uncertainty
- x54y419's bounds are inferred, not read: a range read of its header would settle whether it covers Fort Point.
- Lidar roof heights for the city front are unmeasured (the "deepest level" per place is a minimum; the Alcatraz step shows the method).
- DataSF ynuv-fyni, Wikimedia Commons, historical NOAA charts and David Rumsey are blocked and unread; where OSM's heights came from is unknown.
- LoC counts are from item JSON, not the sheets: no drawing sheet was opened, so which views the 12 Bathhouse sheets show is unknown. LoC may hold other items for the same places under other titles.
- Sanborn sheets are not matched to places.
- Palace, Coit Tower, Pier 39 and Ghirardelli dimensions are Wikipedia or search summaries only; no primary measured dimension was found. The Palace's rebuild years and heights conflict between sources.
- The Sketchfab Palace model (CC BY) was not checked (host not on the allowed list). The NOAA coastal lidar dataset for the Bay was not located.
