# Chart audit (21 Nov 2026)

An audit of the charts, like FTUE's first hour. Requested by Coordinator 2.

**What was looked at.** The v215 head (5de4d67c), at 1600×960 and 2× scale:
- the inset map, racing and cruising;
- the full chart: day and dusk; zoomed in and out; with Wind, Current, Waves and Fog; with the key open;
- the cruise setup's chart;
- the plan chart, via `setup-map.cjs`.

**The two passages used.**
- Cruising: Alcatraz → off Crissy Field in a 12 kt westerly. The named spots are gone since r270, so these are given by position.
- Racing: the default race, 14 kt west.

The stills are in `audit/`. Line numbers are on 5de4d67c.

**Sizes.** S is a few lines in one place, fixed on `claude/leaderboard-b`, one commit each. M needs a design choice or touches several drawing paths, so it's left for a ruling.

| # | What | Still | Where | Size |
|---|------|-------|-------|------|
| 1 | **Place names under the chart's own panels.** The buoys' names are drawn under the Layers panel ("15 · Hank Easom (Yellow Bluff)"), under the field picker ("21 · North Channel G "1"", racing) and cut by the top edge ("8 · North Channel R "4""). The names keep clear of each other and of her boat, but not of the panels. | `audit/01-labels-under-panels.png`, `audit/01b-label-under-picker.png` | src/ui/hud.ts:801-810 | S |
| 2 | **"WIND 12 KT" sits on the chart's own print at the right edge.** It's centered on the wind arrow 28 px from the edge, so it runs into the ENC's place names ("Sa…"). | `audit/02-wind-label-cut.png` | src/ui/hud.ts:843 | S |
| 3 | **Dusk: the route's 15-minute clock labels are black on a black halo.** They're drawn in `I.edge`, which is black at dusk, so they read as a blob. | `audit/03-dusk-clock-label.png` | src/ui/hud.ts:1145 | S |
| 4 | **The sim's lines run over the chart's names.** Laylines and her course cross "Alcatraz Shoal" and "Presidio Shoal"; the bridge's line crosses "Golden Gate Bridge"; the red layline runs through "ETA 15:24". The ENC's text keeps clear only of the buoys and her boat, not of the lines drawn later. | `audit/04-lines-over-names.png`, `audit/04b-bridge-name.png` | src/ui/hud.ts:796, :1159; src/ui/encChart.ts (label placement) | M |
| 5 | **The route reads as the red port layline.** Same orange dashes beside the red dashes. | (r267 stills, `stills/r267/` on stills/leaderboard-b) | src/ui/draw2d.ts:56 | done (fc4a70b3, r267) |
| 6 | **Zoomed out, the chart goes past NOAA's coverage.** There's a gray void beyond the ENC cells' rectangle, with the wind or current colors and the wave labels drawn over it and over land outside. | `audit/05-past-coverage.png` | src/ui/chart.ts (zoom limits) | M |
| 7 | **Waves in meters, the rest of the game in feet.** The Waves layer labels heights "1.0 m". The setup's conditions and the HUD's sea line give swell in feet ("0 ft", "3 ft swell"). | `audit/06-waves-meters.png` | src/ui/mapLayers.ts:99 | S |
| 8 | **Key gap: her course isn't listed while she sails.** The cyan course with ▲ tacks and ○ jibes is drawn once the plan's in, but the key lists it only before she casts off. | `audit/07-key-no-course.png` | src/ui/hud.ts:944 | S |
| 9 | **Inset, racing: "WIND ↓" and the N arrow sit on the course.** Wind up puts the next mark at the top, under the orientation label and the north arrow. | `audit/08-inset-wind-label.png` | src/ui/hud.ts:761 | M |
| 10 | **A ship drawn over the scale bar** (bottom left). The scale bar has no halo and is drawn under the ships. | `audit/09-ship-on-scale-bar.png` | src/ui/hud.ts:844 | S |
| 11 | **Setup chart.** "WIND 12 KT" lands beside her boat in the middle of the small chart, and the NOAA credit covers the scale bar's right end. | `audit/10-setup-chart.png` | src/ui/hud.ts:837-844 (`cornerFree`) | M |
| 12 | **Wordy hover: the Wind shadows layer.** 164 characters: "Where the wind is lighter for what stands upwind: the lee of the land, boats' dirty air, ships, the committee boat and the bridge piers, as the sails feel it". | — | src/ui/layers.ts:15 | S |
| 13 | **Wordy hovers: the Wind and Current pickers** (90 and 137 characters). | — | index.html (planField, chartField) | done (fc4a70b3, w037) |
| 14 | **Two chart checks are stale since r270.** `nav-layer.cjs` and `plan-chart.cjs` start from and sail to the removed named spots (alcatraz, crissy). On v215 they open with no destination: nav-layer fails, and plan-chart throws. | — | scripts/check/nav-layer.cjs:17; scripts/check/plan-chart.cjs | S |
| 15 | **UK spelling.** None in what the player reads on the charts. `spelling.cjs` finds 3, all in docs/marinas drafts. A few code comments in encChart.ts and hud.ts say "colours"/"grey"; they're not shown. | — | — | — |
| 16 | **Chart features against NOAA's ENC.** Not compared feature by feature: that needs the ENC's own data beside the drawing, a research task of its own. Nothing looked wrong or missing in the area sailed. | — | — | — |

The S items fixed on `claude/leaderboard-b`: 1, 2, 3, 7, 8, 10, 12 and 14. Each commit cites "chart audit #n".
