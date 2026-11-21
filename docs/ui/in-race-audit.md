# In-race audit (21 Nov 2026, on 5de4d67c + the compass fix)

A whole race (Course 2, the 8-boat fleet, the user's boat on the AI's skipper to the finish) and a cruise, at 1280×720,
stopping eight times in the race and five in the cruise for a still. Stills are in `docs/ui/in-race/`. The capture is
`docs/ui/in-race/audit.cjs` (stills plus the page's own checks: truncated text, long hovers, UK spellings, the HUD's
positions; the numbers are in `audit.json`); `answers.cjs` clicks each control and reads back what changed.

Size: **S** = under an hour, CSS or one string; **M** = a few hours or a decision. "Mine" = src/ui, src/render, styles,
index.html (not src/sim, src/boat, src/ai, src/rules, src/environment).

## Checked and clean

- **UK spellings:** none in the visible text at any of the 13 stops (the DOM scan for colour, centre, metre, harbour,
  favour, manoeuvre, grey, programme, -ise, traveller, gybe), and `spelling.cjs` passes.
- **Controls that don't answer:** none. Pause, Resume (the pause screen), Speed ×3 and its key (Shift+Y), Sound ×2, Tools
  ×2, the view button ×3, Crew ×2, the band's ▾ and key 4, T (the tiller) and P (pause) each changed the state they
  should (`answers.cjs`). The band's ▾ answers by class (`sailband shut`), not by height.
- **HUD pods:** all three (and the fourth in a cruise) are 104×58 on a 64 px pitch, left 16, top 16 (`audit.json`).
- **Margins:** 16 px left and right at 1280 and 1920 (the pods, the Strategist card, the messages, the view bar); the
  Strategist card and the messages share a bottom edge (648 at 1280, 1008 at 1920).

## Findings

| # | What | Still | Where | Size | Mine |
|---|------|-------|-------|------|------|
| 1 | The Strategist card's headline is cut mid-sentence with an ellipsis: "Blue is clear astern and m…", "Her rig was set for more wind than this: it costs her about 1.3% of her…". One line, `nowrap`. | race-01-prestart, race-04-beating | `src/styles/08-chase.css:169` (the rule), text `src/ui/hud.ts:459`, `src/boat/coach.ts:681` | S (let it take two lines) | CSS yes; the rig line is src/boat |
| 2 | The race line in the same card runs 8 px over: "Burn 1 s, then go for the line" (166 of 174 px). Same rule as 1. | race-03-just-started | `src/styles/08-chase.css:169`, `src/ui/hud.ts:453` | S (same fix) | yes |
| 3 | Three boat tags collide where boats bunch: "Green P · protest" lies over the "X" mark tag and "Blue P". Tags are placed one by one with no clearing. | race-08-finished-or-late | `src/render/labels.ts:85` | M | yes |
| 4 | A boat tag is drawn over the inset's "© OpenStreetMap contributors" line ("Red S"). | race-05-near-the-mark | `src/render/labels.ts` (place) | M | yes |
| 5 | The chart's north arrow and "WIND n KT" (moved down 56 px under the new toggles) are drawn bare over the chart print: "WIND 12 KT" lies on the soundings and the Tanker label. The same on the cruise setup's small chart. | cruise-04-chart, cruise-05-navigator, cruise-01-setup | `src/ui/hud.ts` drawChart, the "north, the wind" block (~line 775) | S (a halo, as the names have) | yes |
| 6 | The chart's "No destination set. Click the water…" box sits on the scale bar and its "0.5 nm" label. | cruise-04-chart | `src/styles/04-screens.css:257` (`.ch-info` bottom 20) | S | yes |
| 7 | The bottom-left Crew button is 46 px tall; the bottom-right buttons are 40 (their tops differ by 6). | race-01-prestart | `src/styles/05-setup.css` (`#viewBar .ib.meta` height 40; `.ib` 46) | S | yes |
| 8 | The nav strip is 46.3 px tall; the compass bar beside it is 44 (a 2.3 px step at the bottom). | race-04-beating | `src/styles/18-layout-d.css:16` | S | yes |
| 9 | The nav strip says "▶ stbd" / "◀ port" while the rest of the game spells starboard out. (w035, with FTUE.) | race-04-beating | `src/ui/hud.ts:581`, `:70` | S | with w035 |
| 10 | Hover titles run 130–190 characters: the line-transit card ("Line transit: X in line with the shore of Belvedere and Tiburon means you're on the line…"), the message log's rows (the whole message), the chart's field buttons and Layers rows (129–157). | race-01-prestart, cruise-04-chart | `src/ui/hud.ts:243`, `src/ui/layers.ts` (LAYERS `what`), `index.html` chart rows (w037) | S each | yes (w037 is Charts') |
| 11 | The setup's "More about the day" note is 441 characters, a paragraph behind one link. | cruise-01-setup | `src/app/setup.ts:209` | M (split into short lines) | yes |
| 12 | The compass bar painted over the open motor dialog's title. Fixed in 05bd8927. | compass-motor-dialog-fixed | `src/styles/18-layout-d.css` | done | yes |

Not findings, for the record: the Messages box shows only its header when empty (by design); "DTW 78 m" turning into
"0.2 nm" is the unit switch at 0.1 nm; the stock boats go by color name in the order board (the owner's ruling, see
`ui/leaderboard.ts`); the wind arrow on the chart reading backwards is r287.

## Fixed on ui-small-tasks (stills in `docs/ui/in-race/after/`, test:fast 279 files / 2128 tests)

- 1, 2: the Strategist card's headline and race line take two lines (`08-chase.css`). The coach's own rig line
  (`src/boat/coach.ts:681`) is still long: src/boat's.
- 5: the chart's north arrow and wind readout have a halo (`hud.ts`).
- 6: the chart's info box sits above the scale bar (`04-screens.css`).
- 7: the bottom-left helm buttons are 40 px (`07-band.css`).
- 8: the nav strip is 44 px (`18-layout-d.css`).
- Left: 3, 4 (the boat tags), 9 (w035), 10 (hovers; w037), 11 (the setup note), and the coach's rig line.
