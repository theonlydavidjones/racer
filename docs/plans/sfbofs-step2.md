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
