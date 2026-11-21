# The Bay floor's depth in the waves and the current: a plan

The Coordinator's ask (21 Nov 2026): the owner's bathymetry of the Bay floor, for the physics: the waves and the current.
Scenery draws the floor from the same tiles (branch scenery/bathymetry-r296, render/bathy.ts). This is a plan, no code.
It's for after Tuesday 24 Nov, and after or beside SFBOFS step 3 (docs/plans/sfbofs-field.md).

The citations below are standard references, but I haven't re-read them in this session (most of their hosts are
outside this environment's network). Each is checked against its text before its effect is built, and the code cites
the page.

## What the sim does with depth today

- **The waves** (environment/sea.ts):
  - **The wind sea** grows by fetch and duration as in deep water (`windSea(U, F)`: no depth term).
  - **The swell** comes through the Gate with a hand-set reach and spread (`swellReach`: an estimate, as it says).
  - **Linear dispersion** (`waveLength(T, h)`) is used only at harbor entrances. The waves on the current
    (`onCurrent`) don't depend on depth.
- **Depth itself** comes from NOAA's ENC depth areas and soundings (`chartDepth`): banded, at harbor entrances. A 50 m
  grid of the same bands (depth-grid.json) exists only in San Rafael and San Leandro Bays, for their tide flows.
- **The current** is the NOAA stations' blend now, and SFBOFS's field after step 3.
  - SFBOFS is a hydrodynamic model run on its own bathymetry (its mesh's node depths, extracted in step 1). It
    already resolves the shoals at its resolution, about 170 m off the Cityfront.

## The data

- **The source** is the USGS 1 m Central San Francisco Bay bathymetry DEM (public domain), which the owner resampled to
  3 m (EPSG:6339, meters above NAVD88).
  - Scenery's tile 1 is 29 one-kilometer tiles, from about Crissy Field to beyond Pier 39 and out to Alcatraz,
    stored at 12.5 m cells for the picture.
- **The step doesn't need 3 m, or 12.5 m.** The shortest waves that matter in the step are the wind sea's, 2–4 s,
  6–25 m long. What depth does to them depends on depth over about a wavelength (kh).
  - So the physics takes a derived grid of **25 m cells**: each the mean depth of its 3 m points. For breaking,
    each cell also keeps its shallowest 3 m point, so a pinnacle smaller than a cell (Harding Rock's crest, Blossom
    Rock's) isn't averaged away.
  - Over the tiles that's about 46,000 cells; two Int16 a cell is about 190 KB raw, at a centimeter.
- **Beyond the tiles:**
  1. SFBOFS's node depths (170 m, the whole area), interpolated in its triangles;
  2. then the ENC bands.
  - The edge of the tiles is blended over 200 m, so a boat sailing off a tile sees no step in depth.
- **Datums.** The DEM is NAVD88, the chart MLLW, the tide (tide.ts) relative to MLLW.
  - The water's depth = the bed below MLLW + the tide's height there now.
  - NAVD88 → MLLW by NOAA CO-OPS 9414290's published datums (to fetch from CO-OPS's datum page; the scenery script
    already uses its MSL and NAVD88 figures).
  - A flat that dries at low water is then land for the waves: no waves over it, and they break at its edge.

## The effects, each with its science

### 1. Shoaling: the swell and the wind sea steepen as the water shoals

- **The science.** Linear wave theory, energy flux conserved: H/H₀ = √(cg₀ / cg), cg from the dispersion relation
  ω² = gk tanh kh. It matters where kh < about π: depths under half a wavelength.
  - Source: USACE Coastal Engineering Manual, EM 1110-2-1100, Part II-1; Dean & Dalrymple, *Water Wave Mechanics
    for Engineers and Scientists*, 1991, ch. 4.
- **Where on the course.** The ocean swell (10–17 s, 150–450 m long) feels the bottom everywhere in the Bay.
  - Over the Gate's shoals and the bar it steepens and slows.
  - The Potato Patch on Four Fathom Bank, outside the Gate, is the Bay's known breaking shoal.
  - The wind sea (2–4 s) feels only depths under about 3–12 m: the shoals and the shore.
- **In the step.** A factor on the swell's height per cell, for its period band: precomputed, read with the depth.
  The wind sea's own factor is the same formula at its peak period.

### 2. Refraction: the swell turns toward the shallows

- **The science.** Snell's law for waves: sin θ / c is constant along a ray, c the phase speed at that depth.
  Waves turn toward shallower water, converge on shoals and points, and spread over channels. Ray methods: Munk &
  Arthur 1952; CEM Part II-3.
- **Where.** The swell's direction and height through the Gate, onto the Cityfront's shoals, Alcatraz, Point Blunt.
  - Today `swellReach` sets this by hand: 0.55 of the swell at the bridge, falling over 2.8 km, its spread
    estimated.
  - Refraction over the real bed would replace part of that estimate with physics. The diffraction at the Gate
    stays as it is: rays don't diffract.
- **In the step.** None of its own. Rays are traced when the swell's direction or period moves to a new bin
  (every 5° and 1 s; the swell changes over hours), and give each cell a height factor and a direction.
  - The step reads them as it reads the depth. Ray tracing is minutes of work at load at most, so it happens at
    load and is cached per bin (a cost to measure).

### 3. Breaking: no wave taller than the water allows

- **The science.**
  - A single wave breaks at H ≈ 0.78 h on a flat bed (McCowan 1894), and steepens to break at H/L ≈ 0.142 tanh kh
    (Miche 1944).
  - For the random sea, the depth-limited Hrms ≈ 0.42 h (Thornton & Guza 1983), or the bore model of Battjes &
    Janssen 1978.
  - Source: CEM Part II-4.
- **In the step.** A cap on Hs at each cell: min(Hs, γ h), with γ from those sources. Where the cap bites, the
  whitecaps (sea.ts whitecaps) become breaking.
  - That's what a sailor sees on a shoal on a big ebb: the ebb steepens the waves (onCurrent) and the depth caps
    them.

### 4. Depth-limited growth: a wind sea over shallow water grows less

- **The science.** Fetch-limited growth in finite depth: the wind sea saturates at a height set by the depth.
  - Young & Verhagen 1996, *Coastal Engineering* 29 (Lake George): Hs and Tp as functions of fetch and depth.
  - The CEM II-2's shallow-water growth curves.
- **Where.** Mostly off the course: the flats off the East Bay, the South Bay, Richardson Bay, San Rafael Bay. On
  the Cityfront the water is deep enough for the wind sea, except over the shoals.
- **In the step.** windSea(U, F) takes the fetch's mean depth (precomputed along the fetch's line, as fetchAt
  already walks it) and applies the finite-depth curve. It reads the same as today in deep water.

### 5. Bottom friction: the swell loses height over long shallow runs

- **The science.** JONSWAP's bottom friction, energy lost as Γ ∝ 0.038 m²/s³ (Hasselmann et al. 1973; SWAN's
  default).
- **Where.** Small inside the Gate over a few kilometers; it matters for the swell that reaches the inner Bay.
- **In the step.** Folded into the refraction's height factor (it's along the same rays).

### 6. The current over the shoals

- **The science.** Continuity: a stream over a shoal speeds up, and in a deep channel it slows (q = u h). Friction
  shapes how much.
- **But SFBOFS already does it**, at its resolution, with its own bathymetry. The step-3 field carries it, so
  adding a depth factor on top would count it twice.
- **What the fine bed could add:** only what's smaller than SFBOFS's triangles (170 m), such as the stream over a
  pinnacle or a rock's lee. Whether that's needed shows in step 2's leave-one-out at the stations by the shoals:
  - SFB1204, SW of Alcatraz;
  - PCT0291, west of Alcatraz;
  - PCT0301, south of Alcatraz.
- **The plan.** If those stations are left with a residual the blend can't take out, a sub-grid continuity
  correction: u × (h_SFBOFS / h_fine)^n over cells shallower than the mesh's depth, n fitted at those stations.
  Otherwise none.
- **The current's depth also feeds the waves:** waves on a current steepen as onCurrent has it, and the depth
  decides how far.

## The cost

- **The budget.** The step's per-boat cost of all of this, a 1.5% perf-pair against main at most. Aim for well
  under 1%: about one cached read a boat a step.
- **How it stays cheap.**
  - Everything depth-dependent is precomputed per 25 m cell: depth, shoaling factor, refraction's factor and
    direction for the swell's current bin, and the breaking cap.
  - The swell's bin changes over hours; the tide's height changes the depth, so the factors are worked out per cell
    for the tide's height, refreshed every 10 minutes of race time.
  - The step reads them through SeaField.at, which every boat already calls. No line goes in World.step (CLAUDE.md):
    the reading is behind the one test SeaField.at already makes, whether she's still in the same cell. A boat
    that stays in her cell pays a comparison.
- **The load.** The 25 m grid over tile 1 is about 190 KB raw, gzipped less. SFBOFS's depths are part of its own
  field (step 3). Each later tile adds about 6.4 KB a km².
- **Measured, not assumed:**
  - perf-pair plain, and `--ai` (the AI's predictions read the sea);
  - the load time;
  - the chart's sea drawing (it samples the sea over the whole view).

## The tests: against real data where there is any

Real wave measurements inside the Bay are scarce. NDBC 46237 (CDIP 142, the San Francisco Bar) is outside the Gate,
and no NOAA or CDIP wave buoy is inside it (CO-OPS's and NDBC's station lists). So the tests are of three kinds.

- **The physics' own laws, against their published tables** (each effect's unit tests):
  - shoaling coefficient against linear theory's (CEM II-1's table of H/H₀ by h/L₀);
  - refraction on a straight sloping bed against Snell's law, analytically;
  - the breaking cap against McCowan's and the depth-limited random sea's;
  - finite-depth growth against Young & Verhagen's curves at their Lake George depths.
- **The boundary, against 46237.**
  - The swell the sim brings in at the bar (its height, period and direction) against the buoy's spectra on
    archived days.
  - The shoaling and refraction over the bar should take the offshore swell (NDBC 46026, 18 nm out) to 46237's
    height on the same hours. That's the one real wave-to-wave check, across real bathymetry.
- **Inside the Gate, against what is measured:**
  - USGS's published wave measurements in the Bay (Hanes & Erikson 2013 and the USGS's ADCP deployments), if their
    data can be reached. That isn't checked yet; it would replace swellReach's estimate with a measured ratio;
  - the current: NOAA's stations by the shoals (above), the leave-one-out of SFBOFS step 2;
  - and the owner's own tracks for the sea's look over the shoals: where whitecaps and steep water are on a big
    ebb (a check by eye, not a figure).
- **Every effect also:**
  - **Deep water unchanged:** with depth set to 1,000 m everywhere, the sea is what it is today.
  - **The race unchanged where nothing's shallow:** fouls-pair --winds 4,6, and perf-pair.

## Step 0: grounding on the charted depth, rocks and wrecks (addendum, 21 Nov 2026)

Charts' ENC check (docs/charts/enc-check.md #6, on claude/leaderboard-b 4ab48de4) found that in the Central Bay a
boat grounds only on the shore mask:

- depth-grid.json covers only San Rafael and San Leandro Bays;
- physics.ts's `solidAt` (the shore, the docks and the moored boats) is all that stops her, and its comment says the
  charted rocks aren't in yet;
- there are 92 charted rocks, wrecks and obstructions in the race areas at under 1.8 m or drying, 36 of them more than
  40 m from any sim land. Examples: Anita Rock (1.5 m), a 0.9 m obstruction off the St. Francis YC, a drying rock west
  of Alcatraz, a wreck at 0.3 m off Yerba Buena.

A Folkboat draws 1.141 m (ORC). So step 0 is to ground her where the chart says she would. It comes ahead of the
waves, and the waves' depth grid (step 1) comes from the same data.

### The data

- **NOAA's ENC.** The depth areas (DEPARE: each a band, shoal edge to deep edge, below MLLW) and the soundings are
  already in src/geo/data/enc-chart.json. The hazards come from Charts' JSON of the 92: UWTROC, WRECKS, OBSTRN, each
  with its least depth (VALSOU) and its kind.
- **The owner's bathymetry** (USGS 1 m DEM, at 3 m) where its tiles cover: each 25 m cell's shallowest 3 m point,
  NAVD88 to MLLW by CO-OPS 9414290's datums, as in step 1.
- **Which wins where they differ.**
  - A charted hazard always stands, at its charted least depth. The chart is what a sailor navigates by, and a rock
    smaller than a cell must not be averaged away.
  - Elsewhere, the shallower of the DEM's cell and the depth area's shoal edge. That's conservative, as a navigator
    reads a band.

### The grid

- **The race areas' depth, at 25 m cells,** as the shallowest depth below MLLW in each cell, in 0.1 m steps
  (one byte, like depth-grid.json):
  - from the Gate to the Bay Bridge and Angel Island to the Cityfront, about 15 × 10 km: 240,000 cells, 240 KB raw;
  - mostly deep and the same, so about 30–40 KB gzipped (an estimate, to measure).
  - Deeper than 4 m stored as "deep": no tide or heel could ground her there, so the byte only needs the shallow
    water's detail.
- **The hazards stay points too:** each with its least depth and a radius (from its ENC geometry where it's an area,
  else 10 m: an estimate, a rock's charted symbol). They're filed in a spatial hash of 100 m squares, about 3 KB.

### What she meets, and when she grounds

- **The water's depth** where her keel is: the cell's depth below MLLW plus the tide's height there now
  (tide.ts tideHeightAt). Heeled, her keel draws less: about 1.141·cos(heel) (an estimate, the keel's tip swinging
  up; the hull's own draft at the turn of the bilge is checked against the lines drawing).
- **Grounded** when her keel's depth is more than the water's at its point under the hull. That's one point at her
  keel's deepest part, or two (its leading and trailing ends) if one proves too coarse at a rock's edge.
- **What it does:**
  - On a depth area's mud or sand: she stops, aground, as on the shore today. She gets off as a sailor does: by
    heeling her (the crew to leeward), going astern under motor, or waiting for the tide to float her.
  - On a charted rock, wreck or obstruction: a strike, as on a wharf (boat/damage.ts), by her speed.
  - The ENC's bottom quality (NATSUR) says which, where it's charted.
  - How hard the damage is, is the owner's to set: a question below.

### The cost

- **The test is cheap:** grounding is checked only in cells that could ground her, those shallower than her draft
  plus the highest tide (about 1.1 + 2.2 = 3.3 m; to take from 9414290's datums). Everywhere else is one byte read:
  "deep".
- **It's folded into the step's existing land test** (physics.ts solidAt, which every boat already makes at her hull's
  points), not a line in World.step (CLAUDE.md). The cell index is remembered per boat, so a boat in the same cell
  pays a comparison.
- **The target:** perf-pair, plain and --ai, within the budget, expected well under 1%. Most of the course is deep, so
  most steps read "deep" and stop.

### The AI

A boat that grounds where the AI doesn't know there's a rock is a fleet aground. The router and the AI's
keep-clear (src/ai, src/sim/router.ts) read the same grid. A cell she'd ground in at the tide's height for the
hour is land for planning. That's Skipper Model's side of src/ai: I'll tell it before editing.

### The tests

- **The data:**
  - each of Charts' 92 hazards is in the grid at its charted least depth;
  - the ENC's soundings in the race area are reproduced, to the cell, by the grid;
  - the DEM and the chart are compared at their overlap (a report, not a bound).
- **The physics of it, at named places:**
  - Anita Rock (1.5 m): she sails over it at MLLW (1.5 > 1.141) and grounds at a minus tide below −0.36 m.
    Heeled 20°, she clears at about −0.43 m.
  - The 0.9 m obstruction off the St. Francis: she grounds below a +0.24 m tide.
  - The drying rock west of Alcatraz grounds her at any tide below its drying height plus her draft.
  - Each case is checked by sailing a line over it at the tide's height on a real day.
- **Getting off:** heeled by her crew, astern under motor, and on a rising tide, each frees her where the arithmetic
  says it should.
- **Unchanged where it's deep:**
  - fouls-pair --winds 4,6 and perf-pair;
  - in the fleet races, no AI boat aground: the fleet gate, as the traffic work's was.

### Size and order

About 2–3 days, as step 0 of the order below:

1. The grid and the hazards from the ENC, Charts' JSON and the DEM: 1 day.
2. Grounding in the step, getting off, and the damage on rocks: 1 day.
3. The router and the AI reading it, with Skipper Model: ½–1 day.

Then the physics review.

**Questions for the owner:**

- How hard is a rock strike? A wreck, as a wharf at speed is now, or a scrape that costs the race?
- Should the chart's hazards also be drawn on the chart (Charts' side)?

## The order of work (for after Tuesday)

| # | Step | Size (estimate) | Depends on |
|---|---|---|---|
| 1 | The 25 m depth grid from the tiles; SFBOFS and the ENC beyond; NAVD88 → MLLW; plus the tide; tests against the ENC's soundings at named points | 1 day | the CO-OPS datums |
| 2 | Shoaling and the breaking cap, for the swell and the wind sea | 1 day | 1 |
| 3 | Finite-depth wind-sea growth along the fetch | ½ day | 1 |
| 4 | Swell refraction by rays per direction/period bin, with bottom friction; the check 46026 → 46237 across the bar; swellReach's estimate replaced where the rays reach | 2–3 days | 1, 2 |
| 5 | The current's sub-grid correction over shoals, only if SFBOFS step 2's leave-one-out leaves a residual by the shoals | ½–1 day, or none | SFBOFS steps 2–3 |
| 6 | Physics review; perf-pair, --ai, fouls-pair; the stills of the sea over the shoals on a big ebb | ½ day | all |

Steps 1–3 can go before SFBOFS step 3; 4 can go beside it; 5 comes after it. Each is its own branch, with its own
gates.

## Open questions for the owner

- Are tiles beyond tile 1 coming, and in what order? The Gate and the bar matter most for the swell (step 4), then
  Alcatraz and Angel Island.
- Is the bar's breaking on a big swell (the Potato Patch) in scope for the sim's waters? It's outside the Gate,
  where racing is rare but cruising isn't.
