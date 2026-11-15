# The shore's slowdown of the wind: by fetch, checked (November 2026)

ROADMAP 8n.5 (the Gashouse Cove exit) asked why the wind doesn't rise sharply as a boat leaves the cove. This is what
was tried, what the records say, and why main keeps its shore factor for now. The code is kept on branch `bay-east-26`
(commits 92e5f7f8 and fdc59c9a, src/environment/fetch.ts), not merged.

## The model on main

`wind.ts windTerrain`: the wind is 0.8 of open water's at every shore, rising to full strength 400 m off, whatever the
wind's angle to the shore. `OPEN_WATER = 1.25` turns the NOAA station's wind (9414290 / NDBC FTPC1, Fort Point) into
open water's. The two pair: the station is taken to be at the shore's 0.8.

## The physics of fetch

The slowdown comes from air that has crossed land. Over smooth water a new layer grows up from the surface (the internal
boundary layer). Within it the wind speeds up toward open water's, so what counts is how far upwind the air last crossed
land (its fetch), not the distance to the nearest shore. A westerly along the Cityfront has come kilometers over the
water.

- Layer depth: δ = 0.75·z0·(x/z0)^0.8 (Elliott 1958, as reviewed by Garratt 1990, "The internal boundary layer — a
  review", Boundary-Layer Meteorology 50:171–203). Log profiles above and below, matched at δ.
- Estimates (no San Francisco measurement found): land z0 0.3 m, water z0 0.0002 m, blending height 60 m. Open water's
  wind returns 2.0 km downwind of the land.
- Rig-averaged as harborLee.ts averages its lee: 0.61 at the land, 0.68 at 100 m, 0.84 at 400 m, 0.94 at 1 km.
- Land under 40 m wide along the wind isn't counted (breakwaters, docks, Fort Mason's pile piers); harborLee gives their
  own lee.
- The station's anemometer: 7.4 m above a site 2.7 m above MSL, about 10 m over the water (NDBC FTPC1 station page).

## Taken everywhere: the calibration moves by direction

With the station at its own fetch, `OPEN_WATER` becomes a function of direction. Change in each course's wind (the
committee boat and the marks) against main's, over the 42 courses:

| From | Station fetch | Open-water scale (main 1.25) | Courses |
|---|---|---|---|
| 225–255 | 70–90 m | 1.30 | −6…+4% (ss41 −14%) |
| 270 | 115 m | 1.30 | +3…+20%, most +5…+12% |
| 285 | 265 m | 1.26 | +1…+17%, most +4…+9% |
| 300 | 435 m | 1.12 | −10…+4%, most −5…−7% |
| 330–45 | over 2 km | 1.00 | −7…−20%, most −15% |
| 90 | 950 m | 1.06 | −15…−35% |
| 135 | 145 m | 1.30 | −12…+4% |
| 180 | 60 m | 1.30 | −21…−1% |

With land z0 0.1 m instead of 0.3, the westerly scale is 1.19, and the westerlies move about −5% instead.

## The cross-check: no open-water record inside the Bay

No open-water anemometer inside the Bay could be downloaded: Alcatraz and Point Blunt aren't in NDBC's inventory. The
pier and shore stations against FTPC1 (matched hours with FTPC1 at 5 kt or more, binned by FTPC1's direction; NDBC
historical stdmet 2023–24 and CO-OPS 2024; the :00 reading, no height correction). Measured / the fetch model's
prediction:

| Station | W 240–290 | N 330–30 | E 30–150 | S 150–240 |
|---|---|---|---|---|
| Richmond 9414863 / RCMC1 | 0.69–0.71 / 1.00 | 0.70–0.72 / 0.77 | 0.96–1.01 / 0.91 | 0.69–0.71 / 1.30 |
| Point Potrero 9414847 | 1.09 / 1.00 | 0.64 / 0.77 | 1.26 / 0.82 | 1.18 / 1.00 |
| Alameda 9414750 | 0.88 / 1.00 | 0.33 / 0.77 | 1.04 / 0.82 | 0.83 / 1.30 |
| Tiburon TIBC1 | 0.69 / 1.00 | 0.53 / 0.77 | 0.82 / 1.06 | 0.62 / 1.00 |

1,100–3,000 hours a cell in the westerly bin, 250–1,260 in the northerly. The 290–330 bin had 13–75 hours and is left
out. Buoy 46026, outside the Gate, reads 1.2–1.9× FTPC1: ocean, not Bay.

- If FTPC1 really reads nearer open water in a northerly, a station whose own exposure doesn't change should fall about
  ×0.77 against it from W to N. Point Potrero falls ×0.59, Alameda ×0.38, Tiburon ×0.77, Richmond not at all. The
  direction is mostly as predicted; the sizes are each site's own shelter.
- The fetch model alone misses the stations by up to 2×: their hills and buildings rule their readings. These records
  can't set z0 or the station's scale.

So the calibration stays as it is. Taking the shore's slowdown by fetch everywhere needs an open-water wind record
inside the Bay (ROADMAP 8n).

## Taken locally, at the Marina only: no sharper edge

Shaped by fetch between main's own ends (0.8 at the land, 1.0 in open water), only in and around West Harbor and
Gashouse Cove, with the calibration untouched. The skilled exit from tests/gashouse-exit.test.ts, 14 kt westerly, the
wind she feels:

| | −20 m (inside) | the gap | +60 m | +100 m | out/in at 60 m |
|---|---|---|---|---|---|
| main's factor, flood | 10.3 kt | 9.3 | 11.0 | 12.3 | 1.07 |
| by fetch, flood | 12.3 | 11.1 | 12.9 | 15.0 | 1.05 |
| main's factor, ebb | 10.4 | 9.5 | 12.1 | 13.9 | 1.16 |
| by fetch, ebb | 12.4 | 11.2 | 14.7 | 17.0 | 1.19 |

It makes the cove and its mouth about 18% windier and the edge no sharper. In a westerly the air reaching the cove has
come mostly over the harbor's own water, docks and breakwaters; the rays cross one 100 m mole, and 5° either side they
slip past its end. By this physics the cove isn't in the land's slower air. Its shelter is its walls (harborLee: 0.88 in
the gap, nothing 60 m out). If the edge the owner feels is sharper, it more likely comes from what the model lacks:
the yacht clubs' buildings on the moles, Marina Green's trees, and the seawall with the land behind it, whose lee is cut
at 15 heights. Those need heights from a source (ROADMAP 8n).
