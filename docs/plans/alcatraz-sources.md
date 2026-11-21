# Alcatraz: sources (researched 20 Nov 2026)

The researcher's pass for phase 1 of docs/plans/cityfront-alcatraz.md (r254). Facts with sources; nothing built yet.

## Answer first
- **Terrain:** one USGS 3DEP 1 m tile covers the whole island, `USGS_1M_10_x55y419_CA_SanFrancisco_B23`: downloaded and the island read out of it (verified). Bare earth; water is nodata (no bathymetry).
- **Lidar:** EPT `CA_SanFrancisco_1_B23` (usgs-lidar-public), flown 2023-04-20, about 90 first-return pts/m² on average; the EPT hierarchy has points over Alcatraz.
- **HABS:** only the cellhouse has a measured drawing (1 sheet, HABS CA-1792-A). No HABS/HAER record found for the lighthouse, water tower, dock or recreation-yard walls. LoC was blocked, so the HABS facts come from search summaries and NPGallery mirrors.
- **Footprints:** OSM has 28 building ways on the island; only 2 carry a height and 1 carries levels.
- **NPS 2025 scan:** no public release found.

## 1. Terrain: USGS 3DEP 1 m DEM
- Download: https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/USGS_1M_10_x55y419_CA_SanFrancisco_B23.tif
- GeoTIFF, float32, 86,461,076 bytes, 10,012 × 10,012 px at 1 m. Upper-left E 549,994 / N 4,190,006 (UTM 10N); lon −122.4323 to −122.3179, lat 37.7654 to 37.8561.
- CRS NAD83 / UTM 10N (EPSG:26910), meters; vertical NAVD88 meters (lidar source NAVD88 Geoid18). Collected 2023-04-20, published 2024-08-26. Nodata −999999.
- License (metadata): "All 3DEP products are public domain." No fees; acknowledgement appreciated; don't imply USGS endorsement.
- Metadata XML: `.../CA_SanFrancisco_B23/metadata/USGS_1M_10_x55y419_CA_SanFrancisco_B23.xml`; reports in `.../metadata/CA_SanFrancisco_B23/CA_SanFrancisco_1_B23/reports/`.
- Alcatraz is at about UTM 10N E 550,778 / N 4,186,744 (the researcher's conversion), inside x55y419 (the project has 4 tiles).
- Coverage: 84,423 land cells above 0.5 m (about 20.9 acres; the NHL nomination says 22.5); no nodata holes on the island; cliffs resolved (457 cell steps over 3 m, up to 10 m).
- Bare earth: buildings removed (ground at the cellhouse about 39 m, the water tower about 29.6 m).
- Highest point: 42.64 m NAVD88 (139.9 ft) at E 550,804.5 / N 4,186,695.5, on the lighthouse knoll (flat at 41.5–42.1 m).
- Water: nodata plus a belt at −0.4 to +0.5 m (hydro-flattened shoreline, not bathymetry).
- Vertical accuracy: NVA 0.0318 m at 95% over 30 checkpoints (spec 0.196 m); Quality Level 0.
- No 1/9 arc-second DEM for San Francisco; the 1/3 arc-second tile (`Elevation/13/TIFF/current/n38w123/USGS_13_n38w123.tif`) is too coarse.
- Bathymetry, none verified:
  - NOAA OCM 2025 Baylands DEM (`dem/CA_SFBay_Hyfltnd_DEM_2025_14675`, 1 ft, CC0): no tile over Alcatraz (all 16,260 STAC items checked; nearest about 1.3 km off).
  - NOAA OCM 2011 California Topobathy DEM (`dem/California_Topobathy_DEM_2011_2616`, 1 m): 4 tile names probed around Alcatraz, none exists (footprint file not read: probable, not proven).
  - USGS 1 m San Francisco Bay bathymetric DEM (Fregoso, Jaffe, Foxgrover; DOI 10.5066/P9TJTS8M, v2.0, 2021): the likely source; host blocked.
  - NCEI San Francisco Bay 1/3 arc-second NAVD88 DEM (gov.noaa.ngdc.mgg.dem:741): host blocked.

## 2. Lidar
- EPT: https://usgs-lidar-public.s3.amazonaws.com/CA_SanFrancisco_1_B23/ept.json (EPT 1.0.0, laszip, EPSG:3857), 13,088,433,078 points.
- CA San Francisco B23, Work Unit 300449, contract 140G0223F0099; flown 2023-04-20, one lift, Riegl VQ1560ii (NV5 Geospatial).
- Density: planned 50 pts/m²; achieved first-return 90.1, ground 40.8 pts/m² (project report §3.10, project-wide).
- LAS 1.4 point format 6; source CRS NAD83(2011) / San Francisco CS13 + NAVD88 Geoid18 meters.
- Classes 1, 2, 4, 7, 9, 17, 18, 20: no building class (6), so roofs are class 1 and must be separated from vegetation by the DEM difference.
- Public domain per the USGS metadata.
- Report: https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/metadata/CA_SanFrancisco_B23/CA_SanFrancisco_1_B23/reports/CA_SanFrancisco_LiDAR_ProjectReport.pdf
- Coverage: node 10-502-918-504 over Alcatraz has 17,441 points. LAZ not decoded (no PDAL or laspy here): no roof heights measured yet.

## 3. HABS records (LoC, call numbers HABS CAL,38-ALCA,1-)
Titles and URLs from search results; B, E, G, K and L's letters and public-domain status from NPGallery mirror pages (the Jet Lowe 1986 photos). Counts from search summaries, not read on LoC.

| Structure | HABS no. | LoC URL | Measured drawings |
|---|---|---|---|
| Cell House (with recreation yard views) | CA-1792-A | https://www.loc.gov/item/ca1498 (sheets: https://www.loc.gov/resource/hhh.ca1498.sheet) | 1 sheet (29 photos, 5 transparencies, 1 drawing); type unknown. Captions: https://tile.loc.gov/storage-services/master/pnp/habshaer/ca/ca1400/ca1498/data/ca1498cap.pdf |
| Warden's House (ruin) | -B | https://www.loc.gov/item/ca1510 | photos only, as far as known |
| Industries Building | -C | https://www.loc.gov/item/ca1511 | not confirmed |
| Laundry Building | -D | https://www.loc.gov/item/ca1512 | not confirmed |
| Power Plant | -E | https://www.loc.gov/item/ca1513 | photos only; no chimney record |
| Warehouse-Bakery | -F | https://www.loc.gov/item/ca1514 | not confirmed |
| Building 64 (barracks) | -G | https://www.loc.gov/item/ca1515 | photos only |
| China Alley | -H | https://www.loc.gov/item/ca1516 | not confirmed |
| Guard Tower | -I | https://www.loc.gov/item/ca1522 | not confirmed |
| Military Chapel | -J | https://www.loc.gov/item/ca1517 | not confirmed |
| Sally Port | -K | https://www.loc.gov/item/ca1518 | not confirmed |
| Officers' Club | -L | https://www.loc.gov/item/ca1519 | not confirmed |
| Guardhouse, Renovating Plant | -M | https://www.loc.gov/item/ca4132 | not confirmed |
| Overall | CA-1792 | https://www.loc.gov/item/ca0622/ | n/a |

- The lighthouse, water tower, dock and recreation-yard walls have no record of their own (the yard is in the cellhouse's photos, e.g. https://www.loc.gov/resource/hhh.ca1498.photos/?sp=14). Lighthouse plans are at the National Archives (NAID 731005).
- Unresolved leads: https://www.loc.gov/item/ca3606, https://www.loc.gov/resource/hhh.ca3069.sheet.
- NPS HDP documented the Citadel in 2016: https://www.nps.gov/HDP/exhibits/alcatraz/alca.htm (not opened).
- Rights: NPGallery mirrors say "Public domain" (e.g. https://npgallery.nps.gov/AssetDetail/3c7b8aab-54b1-423d-aa5f-ea296758b3b5); LoC's own statement not read.

## 4. OSM footprints
- From `https://api.openstreetmap.org/api/0.6/map?bbox=-122.4285,37.8235,-122.4175,37.8300` (ODbL 1.0).
- 28 ways with `building` / `building:part`, plus a toilets node, 2 building:part relations and 2 unnamed ruins.
- Named: Main Prison / Cellhouse (way 128245373), Lighthouse (99202294), Water Tower (660870452), Powerhouse (27996721), chimney (1056707165, about 3 × 3 m), Guard Tower (1056707180), Building 64 (24617219), Warden's House (27996789, ruins), New Industries (24433395), Model Industries (24433389), Dining Hall, Administration Block, Sally Port, Military Chapel, Quartermaster, Electric Shop, Morgue, Officers' Club ruin, gift shop, 2 restrooms.
- Heights: `height=9`, `building:levels=2` (New Industries); `height=26` (lighthouse). None on the cellhouse, water tower or Building 64.
- Quality is coarse: the cellhouse polygon is 2,832 m² (the real building about 142 × 50 m), the lighthouse a 14 m² circle, the water tower 140 m². Use the NHL dimensions, HABS and lidar for the main structures.
- Peak node 13541331931 at 37.82653, −122.42261, ele 41.
- ODbL: visible "© OpenStreetMap contributors" credit; share-alike on derived databases.

## 5. NPS documents
- NHL nomination (read): https://npgallery.nps.gov/NRHP/GetAsset/NHLS/76000209_text (public domain). Island "approximately one third of a mile long, 525 feet across at its widest and 140 feet high, comprising 22.5 acres"; cellhouse "two-story structure measuring 465' x 165'", reinforced concrete; lighthouse "84', six-sided fluted tower… of reinforced concrete with a steel frame lens room" (1909); Citadel 112' × 52'.
- Blocked, not read: Cultural Landscape Report (Mundus Bishop, 2010) https://www.nps.gov/goga/learn/historyculture/alcatraz-clr.htm; Building 64 HSR https://www.nps.gov/goga/learn/historyculture/upload/Alcatraz-Bldg-64-HSR-for-web.pdf; Guardhouse Complex HSR (Lerner, 2002); the Blueprint collection https://www.nps.gov/goga/learn/historyculture/upload/18298fa-Alcatraz-Blueprint-collection.pdf. The Main Prison has only a Historic Furnishings Report. No lighthouse HSR found.
- 2025 3D scan (VCTO Labs): 4 TB of laser, drone lidar and photogrammetry as a change-detection baseline; no source says it's public. Ask GGNRA or VCTO Labs.

## 6. Key dimensions
| Feature | Value | Source |
|---|---|---|
| Cellhouse with wings | 465 × 165 ft (141.7 × 50.3 m), two stories on the 1909 Citadel base | NHL 1986 |
| Cellhouse height | not found | from the lidar later |
| Lighthouse tower | 84 ft (25.6 m), six-sided, concrete, lit 1909-12-01 | NHL; Wikipedia agrees |
| Lighthouse focal plane | 214 ft (65.2 m), Fl W 5s | Wikipedia, Lighthouse Digest (secondary; the USCG Light List returned 403) |
| Water tower | 94 ft (29 m), 250,000 gal, 1940–41, Chicago Bridge & Iron | Wikipedia (secondary) |
| Highest point | 140 ft (NHL), 135 ft (Wikipedia), 41 m (OSM), 42.64 m NAVD88 (DEM) | datums differ |
| Island | about 1/3 mi × 525 ft, 22.5 acres (NHL); 1,675 × 590 ft (Wikipedia) | |

- DEM ground levels: lighthouse knoll about 41.7 m; cellhouse about 39.0 m; warden's house about 38.8 m; water tower 27.7–30.6 m (NAVD88).
- Arithmetic, not sourced: lighthouse top about 67 m NAVD88; water tower top about 58 m. The 84 ft may include the lantern.

## Recommended inputs for the terrain step
1. The tile above, cropped to UTM 10N E 550,300–551,300, N 4,186,300–4,187,300 (about 100 m margin). Keep NAVD88 meters; map nodata and the near-zero belt to sea level.
2. Cliffs resolve at 1 m; 10 m steps need steep-edge handling or a cliff mesh.
3. Building heights later from the EPT points minus the DEM (needs a LAZ reader, which needs approval).
4. Footprints from OSM, but the cellhouse, lighthouse and water tower from the NHL dimensions and the HABS sheet.
5. Credits: "© OpenStreetMap contributors" on screen; a courtesy credit to USGS 3DEP.
6. Bathymetry: next try the USGS 1 m Bay DEM or the NCEI 1/3 arc-second DEM (both blocked here).

## Hosts
- Blocked: www.loc.gov, tile.loc.gov, www.nps.gov, the nationalmap.gov and usgs.gov hosts, sciencebase.gov, ncei.noaa.gov, coast.noaa.gov, ngdc.noaa.gov, overpass-api.de, www.openstreetmap.org, data.sfgov.org, catalog.data.gov, doi.org, archive.org, sketchfab.com, and the Light List copies. www.navcen.uscg.gov is allowed by the proxy but returns 403.
- Reachable: prd-tnm.s3.amazonaws.com, usgs-lidar-public.s3.amazonaws.com, noaa-nos-coastal-lidar-pds.s3.amazonaws.com, npgallery.nps.gov, api.openstreetmap.org, en.wikipedia.org.
- To request for the structures step: www.loc.gov, tile.loc.gov, www.nps.gov, home.nps.gov.
