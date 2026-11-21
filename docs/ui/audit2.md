# UI audit: pause screen, Season, Yacht Club tabs (21 Nov 2026)

`docs/ui/audit2/audit.cjs` visits each at 1280×800 and 1920×1080. The DOM scan (stray separators, clipped text, things past the
window's edge) found none at either size, so the findings below are from the stills (`before/`, `after/`).

| Finding | Where | Fix |
|---|---|---|
| The setup race's own displays (start clock, strategist, messages, inset map, NEXT strip) showed behind the Yacht Club; at 1280 its panel covered half the inset and the strip lay over its corner | Yacht Club, all three tabs | `body:has(#fleet:not([hidden]))` hides what `body.still` hides behind the setup (09-audit.css, 18-layout-d.css); tests/clubQuiet.test.ts |
| "no throwout" in the head over "one throwout after all five races" in the footer | Yacht Club, Season tab | the head names a throwout only when there is one (src/ui/season.ts) |

Seen and left: the Season page's race-day tile repeats the date in two places (a design call); the pause screen's gap above Exit is the
separation, by design. No misaligned rows, clipped labels or stray dots at either size.
