# SFBOFS step 2: the tide corrected to NOAA's stations, and the river outflow from DAYFLOW

The owner approved both (20 Nov 2026, via the Coordinator). This is the design, for the Coordinator before anything is
built. The heavy work starts after 24 Nov. Step 1's fit and its comparison are in docs/plans/sfbofs-field.md.

## 1. The tide corrected to NOAA's current stations

**What the fit shows against all 18 harmonic stations in the area.** The ratio is the model's amplitude over NOAA's; the
phase difference is model minus NOAA. Each was taken along NOAA's flood axis at the nearest element, 9–77 m away.

| Constituent | Median ratio | Range | Median phase | Read |
|---|---|---|---|---|
| M2 | 1.05 | 0.86–1.17 | +6° (late) | Weak at the Gate and the Cityfront (0.86–0.93), strong east of Alcatraz, by the Bay Bridge and toward Richmond (1.13–1.17) |
| S2 | 1.18 | 0.76–1.43 | +3° | One outlier at 2.66 (SFB1209) |
| N2 | 0.88 | 0.66–1.31 | +10° | |
| K1 | 1.08 | 0.80–1.68 | +3° | |
| O1 | 1.17 | 0.81–1.71 | −1° | |
| M4 | 0.75 | 0.51–3.4 | scattered | Small amplitudes (0.05–0.3 kt); station and model both noisy |

(The full table is in step 1's scratch output; it will be a committed report in step 2.)

The error varies across the Bay, so one factor for the whole area won't do. The design:

- **What's corrected: M2, S2, N2, K1, O1**, the five whose amplitudes are over 0.1 kt nearly everywhere.
  - K2, P1 and Q1 take the correction of their partner (S2, K1 and N2 by frequency), as NOAA's own inference does.
  - The overtides (M4, MS4, MN4, M6) stay as the model has them. Their station values scatter too much to trust as a
    correction, and they're small.
- **The correction at each station is a complex factor per constituent:** NOAA's amplitude over the model's, and
  NOAA's phase minus the model's.
  - It's applied to both u and v of each element's constituent: it scales the tidal ellipse and shifts its timing,
    and leaves its direction alone. NOAA gives only the major axis; the direction stays the model's.
- **Depth: compare like with like.** NOAA's bins are 0.5–9 m down; the field is the model's top layer.
  - Corrected directly, a surface would take a 9 m bin's tide (SFB1203). So the factor is NOAA's bin against the
    model at the same depth, and is then applied to the model's top layer.
  - That needs the model's 20 layers at the 18 station elements only. It means one more pass over the same 1,392
    files, keeping 18 × 20 × 2 values an hour: about 40 minutes of download, little CPU. (I'd do this pass this week if
    you agree. It's a data fetch.)
- **Which stations are trusted.** The 18 harmonic stations, less any whose factor for M2 or K1 is more than 30% or 25°
  from its neighbors' blend (a sign of the station or the model's local mesh, not the tide).
  - On today's numbers that drops SFB1209 (S2 2.66; only 16 constituents published) and puts SFB1206 in question (9 m
    from the Pier 23 bulkhead). It's checked by leaving each station out in turn: predict it from the others' blend, as
    below.
  - The 36 subordinate stations (offsets from a reference station) are only checks, not anchors.
- **Blending between stations, by distance along the water.**
  - The model's mesh is the water, so distances are shortest paths over the mesh's element-to-element neighbors
    (Dijkstra from each station's element, once, in the script). Water around Alcatraz or Angel Island takes the way
    round, never through land.
  - Each element's factor is the stations' factors weighted by exp(−(d/L)²) on that water distance. L is about 1.5 km
    (an estimate: about the stations' spacing along the Cityfront). Amplitude ratios are blended in their logarithm and
    phases as angles.
  - Beyond about 3L from every station, the weights fade to the area's median factor, not to the nearest station's.
- **The check is leave-one-out.** Each station's constants are predicted from the others' blend and compared with
  NOAA's: M2 amplitude within 10% and phase within 10° (estimates for the target), and the whole predicted current
  against NOAA's predictions over a month, as RMS.
- **What's stored stays as the plan has it:** the corrected constants at the nodes, int16. The correction is applied in
  the script; the page does no correction of its own.

## 2. The river outflow from DWR DAYFLOW

- **The source:** DWR DAYFLOW, the daily net Delta outflow (OUT, cfs), on the California Natural Resources Agency's
  open-data portal (data.cnra.ca.gov, dataset "dayflow"). It's cited in the code.
- **The model needs:** each element's mean flow as a function of the outflow, mean(Q) = m0 + m1·Q.
  - Step 1's two seasons give two points per element: December 2024 (a strong surface ebb, 0.3–1.5 kt) and September
    2025 (about none). Those are exactly a line, and there's nothing left to check the line against.
  - So step 2 adds two more months of nowcasts (about 40 minutes each), chosen from DAYFLOW for outflows between and
    beyond those two (a wet spring and a moderate one).
  - With four points per element, the fit of m0 and m1 has a check. Whether Q or √Q fits better (the Bay's estuarine
    flow isn't linear in the river), the four will say.
- **Outflows past the months fitted** (a flood above any month seen) are held at the largest fitted. That's an
  estimate, said where it's used.
- **The fallback for a day DAYFLOW doesn't have yet** (DAYFLOW lags; recent days are provisional or missing), in this
  order:
  1. **DWR's CDEC daily Net Delta Outflow Index** (station DTO, cdec.water.ca.gov), published within days: the same
     quantity, provisional.
  2. **For a day neither has** (the future, a race planned ahead, or no network): DAYFLOW's median for that day of the
     year over the record since water year 1997. It's stored in the page, 366 values, about 1 KB. The page names it
     as typical for the date, not the day's own.
  - **What ships in the page:** DAYFLOW's OUT since 1997 (about 10,500 days, about 30 KB packed) and the 366 medians.
    For a day after the shipped data, the page asks CDEC if it can, and otherwise uses the median.

## 3. What's blocked here

The network policy of this session's environment refuses all of DWR's hosts:

- **data.cnra.ca.gov** (DAYFLOW);
- **cdec.water.ca.gov** (the DTO fallback);
- **data.ca.gov** and **water.ca.gov**.

NOAA's API (api.tidesandcurrents.noaa.gov) and the SFBOFS bucket are reachable.

- **The two hosts DAYFLOW needs:** data.cnra.ca.gov and cdec.water.ca.gov. Without them, part 2 can't be built from
  the source, and I won't stand in made-up flows.
- **The page itself** would also need cdec.water.ca.gov for the live fallback, an outside request from the player's
  page. That's a separate question for the owner. Without it, the shipped series plus the day-of-year median covers
  every date.

## Results this week (20 Nov 2026)

### The stations at their own depths

The model's water column at the 18 station elements (scripts/data/sfbofs-harmonics.mjs `layers`, then `stations`):
the same 1,392 hours, the current along NOAA's flood axis at the bin's depth, fitted as the field is. The factors are
in docs/sfbofs/stations-depth.json. NOAA's bin depths are taken as meters below the surface (an assumption to confirm
against CO-OPS's station metadata).

| Station | Bin / column, m | M2 factor | S2 | N2 | K1 | O1 | Model's top / bin, M2 |
|---|---|---|---|---|---|---|---|
| PCT0336 Oakland, YBI | 4 / 11.8 | ×1.02 −8° | ×1.00 −16° | ×1.07 −8° | ×0.95 +8° | ×1.00 +5° | 1.19 |
| SFB1202 Golden Gate Bridge | 6.5 / 46.1 | ×1.04 −4° | ×0.89 +8° | ×1.22 −12° | ×0.95 −10° | ×0.69 +8° | 0.93 |
| SFB1203 E of the Bridge | 9.1 / 91.6 | ×1.04 −5° | ×0.83 −1° | ×1.13 −9° | ×1.05 −5° | ×1.04 +5° | 0.97 |
| SFB1204 SW of Alcatraz | 0.5 / 22.1 | ×1.07 −5° | ×0.99 −2° | ×1.14 −17° | ×1.04 −11° | ×1.18 +10° | 1.00 |
| SFB1205 N of Pier 35 | 3.5 / 20 | ×1.17 −6° | ×1.11 −2° | ×1.23 −18° | ×1.04 +1° | ×1.11 +7° | 1.04 |
| SFB1206 Pier 23 | 1.2 / 15.5 | ×1.05 −11° | ×1.29 −15° | ×1.34 −22° | ×0.78 +17° | ×1.29 +33° | 1.02 |
| SFB1207 Bay Bridge Pier D | 2.7 / 22.6 | ×0.90 −7° | ×0.78 −4° | ×1.05 −16° | ×0.95 −2° | ×0.84 −5° | 1.04 |
| SFB1208 Bay Bridge B-C | 3.4 / 21.2 | ×0.92 −8° | ×0.79 −7° | ×1.02 −15° | ×0.99 −7° | ×0.76 −1° | 1.05 |
| SFB1209 YBI, W of mid-channel | 3.7 / 34.1 | ×0.91 −13° | ×0.37 +6° | – | ×1.04 −8° | ×0.87 −7° | 1.06 |
| SFB1210 NW of Treasure I. | 0.8 / 8.8 | ×0.91 −6° | ×0.81 −20° | ×1.08 −33° | ×0.62 +1° | ×0.59 −7° | 1.04 |
| SFB1211 N of Alcatraz | 1.7 / 28.6 | ×1.15 −3° | ×0.84 +4° | ×1.20 −10° | ×1.25 −6° | ×0.68 −2° | 0.99 |
| SFB1212 Raccoon Strait | 5.7 / 36 | ×0.96 +1° | ×0.97 +5° | ×1.31 −9° | ×0.78 +5° | ×0.74 −5° | 0.86 |
| SFB1217 Rincon Point | 2.7 / 20.6 | ×0.91 −7° | ×0.86 −9° | ×0.79 −8° | ×0.87 +3° | ×0.89 +0° | 1.04 |
| SFB1309 E of Pt Chauncey | 2.2 / 14 | ×1.04 −1° | ×1.00 +11° | ×1.28 +8° | ×0.97 −3° | ×1.05 −2° | 1.05 |
| SFB1310 N of Pt Chauncey | 1.5 / 13.1 | ×0.90 +5° | ×0.74 +12° | ×0.94 +8° | ×0.83 +5° | ×0.91 +15° | 1.02 |
| s08010 Southampton Shoal | 4.7 / 12.1 | ×1.04 +6° | ×1.00 +1° | ×1.00 +3° | ×1.08 +3° | ×1.06 +3° | 1.18 |
| SFB1201 Bay Entrance | 5.8 / 64.3 | ×1.16 −4° | ×1.19 +6° | ×1.28 −12° | ×1.19 −14° | ×1.23 −9° | 1.01 |
| PCT0666 Richmond | 4.3 / 15.5 | ×1.09 +2° | ×1.04 +2° | ×1.07 +4° | ×1.07 +1° | ×1.14 +3° | 1.14 |

The factor is NOAA over the model at the bin's depth: the amplitude ratio, and NOAA's phase minus the model's
(negative: the model is late).

- **M2's corrections, at like depths, are ×0.90–1.17** and mostly −3° to −8°: the model is 6–16 minutes late.
- **The depth mattered.**
  - At PCT0336 the top layer against NOAA's 4 m bin made the model look 17% strong; at 4 m it's within 2%.
  - At SFB1212 the top layer is 14% weaker than the model's own 5.7 m.
- **N2 is late by 8–18°** at most stations: its own phase, not M2's.
- **Outliers for the leave-one-out to test:**
  - SFB1209 (S2 ×0.37; only 16 constituents published);
  - SFB1206 (K1 +17°, O1 +33°, by the Pier 23 bulkhead);
  - SFB1210 (K1 and O1 ×0.6, in 8.8 m off Treasure Island).

### The outflow

- **src/environment/data/delta-outflow.json** (31 KB, scripts/data/delta-outflow.mjs):
  - DAYFLOW's OUT, final, 1 Oct 1996 – 30 Sep 2025;
  - then CDEC's DTO, provisional, to the day fetched;
  - and the day-of-year medians.
- **DTO against DAYFLOW over WY2015–2025:** 3% high at the median. One year's median ratio ran 0.86 to 1.17
  (WY2025 1.17). It's used as published, not scaled.
- **The fitted months:** Dec 2024 averaged 27,449 cfs, Sep 2025 3,716. The record's median is 9,000.
- **The two months to add:** Feb 2025 (100,006 cfs) and May 2025 (14,725).
- **The owner's race day, 7 Nov 2026, was 5,300 cfs (DTO):** near the dry season's mean flow.

## Order of work

1. **This week (light):**
   - the design (this file);
   - the station comparison committed as a report;
   - if you agree, the layered pass at the 18 stations;
   - DAYFLOW fetched once the hosts are allowed.
2. **From 24 Nov:**
   - the water-distance blend and leave-one-out check;
   - the two more months and the outflow fit;
   - then step 3 of the plan (the field in tide.ts).
