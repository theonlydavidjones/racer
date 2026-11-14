# Gashouse Cove entrance: what the sources give (researcher's report, 13 Nov 2026)

For ROADMAP 8n point 4 (the owner: "frequent eddies in the entry"). No published measurement or model of the current
in the East Harbor entrance was found: the stream and the geometry are sourced, the eddies' sizes and speeds have to come
from general results, flagged as estimates.

## The stream
- Nearest NOAA station: SFB1204 "Alcatraz Island, southwest of", 37.81425 N 122.432 W, about 0.75 km north of the mouth
  (api.tidesandcurrents.noaa.gov currents_predictions, bin 1). Mean flood 088° true, mean ebb 260°: along the Cityfront,
  across the entrance's mouth. Nov 2026 peaks: flood 0.39–1.38 kt (mean 1.02), ebb 0.27–1.72 kt (mean 0.93). Already in
  src/environment/data/sf-currents.json. No station on the Marina Green or Fort Mason shore.
- Coast Pilot 7, ch. 7, para. 272 (8 Nov 2026 edition): "The east basin is protected on the north by a breakwater
  extending east from the west shore and on the east by a pier of Fort Mason. The seaward end of the breakwater is marked
  by a light. East basin is entered between the breakwater light and the pier." Depths 8–12 ft to the berths.

## The geometry (from OpenStreetMap, ±5–10 m; src/geo/data/gashouse-cove.json has the same breakwater)
- Breakwater: east about 175 m from 37.8077 N 122.4358 W, then about 100 m east-southeast to its tip at 37.80794 N
  122.43293 W (the red beacon).
- Entrance: between the tip and Fort Mason Pier 1's west face, about 36 m wide (43 m to the shed's corner), facing north.
- Pier 1: about 130 m long, 30–40 m wide, its north-west corner (37.80797 N 122.43252 W) about 60 m north of the tip's
  latitude: out in the stream. The ebb passes that corner before the gap; the flood passes the breakwater's outer leg.
- Not found: whether the piers are on piles or fill, the pile spacing, whether the breakwater is rubble, soundings in
  the entrance (the ENC cell in src/geo/data/enc-chart.json was not decoded).

## The fluid mechanics (read: Bijvelds 1997, TU Delft report 1-97; Langendoen 1989, report 8-89; Signell & Geyer's abstract)
- A harbor beside a steady stream holds one gyre filling it, its edge at about 0.25 of the stream's speed (Booij 1986, in
  Bijvelds §3).
- The mixing layer across the mouth: free layer dB/dx = 0.18 (Ur − Uh)/(Ur + Uh) (Brown & Roshko 1974; Bijvelds eq. 3.6),
  about 0.11 with Uh = 0.25 Ur; measured in a harbor B ≈ 0.17x–0.23x. The largest eddies in it about 3 layer widths.
  Fluctuations at its centre u'² ≈ (0.2 Δu)², v'² ≈ (0.1 Δu)² (Uijttewaal & Tukker, in Bijvelds §2).
- The gyre's response time Te ≈ 50 β² Le B / (Ur Bm), β 0.4–1 (Booij 1986, in Langendoen ch. 2). For the cove (Le ≈ B ≈
  36 m, Ur 0.5 m/s, β 0.59: the researcher's estimate) about 20 min: it follows the tide quasi-steadily.
- Separation at a headland or pier corner (Signell & Geyer 1991, JGR 96(C2) 2561–2575, abstract only): governed by b/a,
  H/(C_D a) and U0/(σ a); a strong start-up vortex each time the stream builds. Here U0/σ ≈ 3.6 km ≫ the pier: steady
  for hours.
- Shallow wakes (a search summary of Branson, Ghisalberti & Ivey 2019, unchecked): S = c_f D/H; shedding for S ≲ 0.2.
  The corner (c_f 0.0025 assumed, D 35 m, H 3 m) has S ≈ 0.03: it sheds. Strouhal 0.2 (textbook) gives a period of
  6–7 min at 0.5 m/s.
- Under a pile pier: single-pile Cd about 0.94–1.13 (snippets); no spacing for Fort Mason, so no sourced reduction.

## Blocked hosts
tidesandcurrents.noaa.gov (the website; the API works), www.bcdc.ca.gov, www.nps.gov, dolphinclub.org,
sfmarinaharbor.org (DNS); core.ac.uk, bopc.ca.gov, www2.sfmx.org (403). The BCDC project PDF and the Recreation and Park
FAQ (sfrecpark.org/DocumentCenter/View/20896) may hold bathymetry or hydrodynamics.

## Corrections from the physics review (14 Nov 2026; Bijvelds 1-97 and Langendoen 8-89 read in full)
- The layer's spread: 0.17 and 0.23 are one measurement of Booij's in two definitions of width (b between his marks,
  B = 1.39·b = ΔU/(dU/dy)max), not a range. Bijvelds' computed layers gave 0.13 (k-ε) and 0.20 (TLS).
- The gyre's 0.25·Ur is "a first guess" (Bijvelds §3); the Booij case he compares has about 0.11·Ur at the layer's inner side.
- "Three layer-widths" is the size the largest eddies can reach (Tukker 1997), not their spacing; Bijvelds carries them
  at half the stream's speed.
- The response time for the cove's own gyre (73 m pool behind a 37 m mouth, β 0.59) is 1½–3 hours at the streams this
  mouth sees, not 20 minutes: the earlier figure took the pool as 36 m. Langendoen asks for a tidal period of 4·Te or
  more before a gyre may be taken as steady; pp. 4–5 describe the old gyre after slack drawing the new stream in while
  a new one starts at the upstream corner.
- Not settled: whether the flood leaves the breakwater at its knuckle 64 m west of the tip (the last leg runs 27° off
  the stream) and whether the ebb piles on that leg and pushes in through the gap. Asked of the owner.
