# Capacity: more room for the physics without simplifying it

Capacity session, 12 November 2026. Phase 1 is a design only: no code changes. Building starts when the owner approves.

**The owner's brief**: "Hold the budget. But physics accuracy is prime in this game, especially in race mode. So it may
be time to start thinking about how to get more capacity for this game."

**In short**: today the sim and the drawing share one browser thread. In the drawn frame the sim's steps are about a
quarter of the JavaScript time, and the drawing is about two thirds. The step itself has no single big cost: it is
spread over eight boats' physics, the AI, the wind and current lookups and the rules. So shaving the step gives a few
percent at a time. Moving the World onto its own thread (a Web Worker) gives it a whole core. At 4× speed that is
about **4–5× today's step cost before a frame is missed**, and at 1× about 16×. The physics is not simplified, and
the race stays bit-identical: the same `World.step` runs, only in a different thread. SharedArrayBuffer isn't
available on the claude.ai host, so the plan uses plain messages, which are fast enough here (below).

**The recommended first step** (about 1 hour): a probe page that checks whether the artifact host lets the page start
a Worker from a blob URL. Its content security policy is the one unknown that could block the plan.

---

## 1. Measurements

All taken in this container (4 cores, Node 22, headless Chromium with software GL), on main at 6e4fbd2. The race is the
perf test's: Seaweed Soup course 10, a fleet of eight (seven opponents), west wind 22 kt, the real current for
14 Nov 2026, seed 3.

### 1.1 The budget test (tests/perf.test.ts)

| run | CPU µs per step | reference (CPU ms) | ratio (budget 54.7) |
|---|---|---|---|
| 1 | — | — | passed (under 54.7; vitest kept the log quiet) |
| 2 | 1,498 | 26.6 | **56.28** (fails) |
| 3 | 1,446 | 25.8 | **55.94** (fails) |

This agrees with the Coordinator's 55–58. Main sits right at the line.

### 1.2 Where a step's time goes (Node CPU profile, 450 s of the race from t = −150 s, 27,000 steps)

Inclusive time (a function plus everything it calls), as a share of all the steps' time:

| part | share | notes |
|---|---|---|
| `moveBoat` (each boat's physics) | **41%** | of which `trimSails` 13%, `crewAndHeel` 8% (`placeCrew` 4.5%, `crewJobs` 3%), the speed search `fastestStep`/`pick` ~2% |
| `aiThink` | **12%** | `blocked` 2%, `bestApproach` 1% |
| `windHere` | **9%** | terrain wind, shifts, gusts, `shadowAt` (the wind shadows, 3%) |
| `checkPairs` (rules, every pair) | **7%** | `assessPair` 4.4%, `rights` 1.2% |
| `currentAt` | **5%** | `atShore` 3.2%: the tide stations blended near the shore |
| `landAlong` / `onLand` / `shoreDist` | ~4% | the shore's distance for the wind, the current and the rules |
| `shipEncounters` | 2.4% | |
| `trackCourses` | 1.7% | |
| the sea (`sea.at`, `fetch`) | ~2% | |
| garbage collection | **3.9%** | |

Self time by file: world.ts 19%, physics.ts 18%, math.ts 6%, crewPhys.ts 5%, controls.ts 5%, shore.ts 5%, GC 4%, ai.ts
3.5%, balance.ts 3%, crewWork.ts 3%, tide.ts 2.5%, rules/pairs.ts 2.3%. Nothing else is over 2%.

So **the step has no hot spot**. The biggest single piece is the eight boats' own physics. That is the fidelity the
owner wants kept, and it shares its time across a dozen solvers.

### 1.3 Spikes: the periodic work comes in bursts

The same race, wall-clock time per step, grouped by the step's place in the schedule (`World.step`):

| steps | how many | mean µs | p99 µs | max µs | share of all time |
|---|---|---|---|---|---|
| ordinary | 25,650 | 958 | 2,391 | 10,380 | 87% |
| every 30th (the sea for all eight boats, and the lee of the land) | 900 | **2,992** | 7,618 | 12,436 | 9.5% |
| every 60th (the breeze, the tide) | 435 | 2,125 | 3,651 | 5,667 | 3.3% |
| every 1,800th (`buildField`, the weather field over ~1,700 points) | 15 | 9,125 | — | **36,222** | 0.5% |

At 4× speed a frame runs four steps. The sim's time per frame (Node, here) is then p50 3.8 ms, p90 5.9 ms, p99 9.2 ms,
max 38.7 ms. **2.3% of frames have more than 8 ms of sim**, almost all of them frames that contain a periodic step.
These are hitches the eye notices, and a mean-only budget doesn't see them.

### 1.4 The frame in the browser (dev server, headless Chromium, a race of eight, the chase view)

With software GL a frame takes 1–2 s of wall time, so the frame's `dt` clamp (0.05 s) gives about 12 steps a frame at
4×. A laptop at 60 fps gives 4. The parts below are the page's JS per frame. The shares are what matter. The
milliseconds run about 3× a laptop's (perf.cjs's own calibration).

| | 4×, chase, 1280×760 | 4×, cockpit, 480×300 | 1×, chase, 480×300 |
|---|---|---|---|
| sim steps per frame | 11.8 | 11.8 | 2.95 |
| sim µs per step (in the page) | 1,144 | 1,084 | 1,851 |
| **sim** ms/frame | 13.5 | 12.8 | 5.5 |
| **render** (scene update + three.js) ms/frame | 37.6 | 35.9 | 33.0 |
| **HUD and maps** ms/frame | 3.9 | 4.2 | 3.5 |
| other (labels, buttons) ms/frame | 0.9 | 0.9 | 0.9 |
| draw calls | 1,716 | 1,616 | 1,154 |
| JS heap | 293 MB | 289 MB | 284 MB |

The CPU profile of the 4× chase frame (only time inside `frame()`):
- render 67%: three.js's own submission 30%, `syncBoatMesh` 15%, the wakes 12% (mostly `waves.height`, asked
  thousands of times a frame on the CPU), the crew figures 9% (`ground`/`soleHalf` → `hull.sectionPoint`), the
  shadow map 6%;
- **sim 24%**;
- HUD 7%.

**Scaled to a laptop** (perf.cjs: the sim in the page is ~1.8× slower than Node here, and a laptop core is ~1.5–2×
this one): one step is about 0.55–0.75 ms, so four steps at 4× take **2.2–3.0 ms against the 3 ms budget**. That is
why each feature's +1 shows. Rendering is the larger share of the main thread, and it is outside the sim budget.

### 1.5 What the host allows

- `crossOriginIsolated` is **false** in the dev page. On claude.ai the top page sends
  `cross-origin-opener-policy: same-origin-allow-popups` and no `cross-origin-embedder-policy`. The artifact runs in
  an iframe on `*.frame.claudeusercontent.com`, and a frame can only be cross-origin isolated if the top page is too.
  So **SharedArrayBuffer and Atomics are not available to the published page**, and nothing we ship can change that.
- WebAssembly, OffscreenCanvas and `navigator.hardwareConcurrency` (4 here) are present.
- **Unknown: whether the content frame's CSP lets the page start a Worker from a blob URL** (`worker-src`, or
  `script-src` as its fallback). The parent page's CSP is strict (nonce scripts plus a list of hosts). The frame's CSP
  isn't visible without loading the artifact in a signed-in browser. This is the one fact that can block the plan, so
  the first step checks it.

### 1.5a The probe page

The owner approved a probe page: https://claude.ai/artifact/AR1y44ZFdL63SzwV2Byc5s. It is a separate private artifact,
not the live one. It checks the blob and data: Workers (classic, and module the way Vite's `?worker&inline` builds
them), `crossOriginIsolated`, a 64 KB transfer round trip, a fleet-sized structured-clone round trip, and the perf
test's reference workload in the worker against the page's own thread. It saves each run to its db (`runs`). Locally
in headless Chromium, all three Worker kinds started; the transfer round trip took 0.1 ms and the clone round trip
1.0 ms (so pack the snapshot into typed arrays and transfer it). The reference workload took the same time in the
worker as on the page (110.6 against 110.8 ms). **The owner's result** (13 Nov 2026, two runs, Safari 27 on an 8-core Mac, inside claude.ai):

| check | result |
|---|---|
| Worker from a blob URL, classic | starts, answers |
| Worker from a blob URL, module (Vite `?worker&inline`) | starts, answers |
| Worker from a data: URL (Vite's fallback) | **refused** (the frame's CSP) |
| crossOriginIsolated / SharedArrayBuffer | false / absent (as §1.5 predicted) |
| 64 KB transfer and the clone round trip | both "0 ms": under Safari's 1 ms clock resolution |
| reference workload: worker / page | 35 / 34–37 ms (this container's headless Chromium: 110.6) |

What follows for the build:
- **Go.** The blob module worker is exactly what the plan needs.
- The fallback must be the in-process World, **not** Vite's data: URL. Vite falls back to data: only when the blob
  worker throws, and that would fail here too, so our code catches the failure and runs in-process.
- The owner sails in **Safari** (JavaScriptCore). The perf numbers in this doc are V8's, so the worker step is to be
  checked in Safari as well. Safari's `performance.now()` resolution is 1 ms, which the `` ` `` meter has to average
  over frames.
- The owner's machine runs the reference about 3.2× faster than this container's headless page. So their 4× sim today
  is likely nearer 1–1.5 ms a frame than the 2.2–3 ms estimated for a typical laptop, and the budget mainly protects
  slower machines. The worker's headroom on their machine is correspondingly larger.

### 1.6 What a snapshot costs

A structured clone of every cloneable field of all eight boats is ~5.1–5.8 KB a boat, 42 KB for the fleet, and takes
**171 µs** to serialise in Node. A lean render-state is a fraction of that: positions, headings, heel, sail shapes,
crew poses and lines, packed in a `Float64Array` that is transferred, not copied. So the cost of sending the state each
frame is a few tenths of a millisecond at most, on threads that have room for it.

---

## 2. The options, ranked

The common constraints: one HTML artifact, no new npm packages without the owner's OK, desktop only, and deterministic
seeded races (byte-identical tracks run to run). Below, **bit-identical** means the same race to the last bit as main.
**Re-baselined** means still deterministic, but a different (equally valid) race, which needs Deep Physics and the
owner to agree.

| # | option | headroom for the physics | hours | fidelity | verdict |
|---|---|---|---|---|---|
| A | **The World in one Web Worker, pipelined lockstep with the frame** | **~4–5× the step at 4×, ~16× at 1×**; also frees 2–3 ms of the laptop's main thread | 26–42 | bit-identical | **recommended** |
| B | Exact cuts and memoisation in the step (Deep Physics's pass now) | 5–15% | (Deep Physics) | bit-identical | yes, already under way |
| C | Even out the periodic bursts (stagger the sea per boat, build the weather field ahead in slices) | removes the 4× hitches (p99 9 → ~5 ms); mean unchanged | 3–5 | re-baselined | yes, but A's run-ahead absorbs most of it, so after A only if still needed |
| D | Wave height for the wakes on the GPU | render only: ~12% of the chase frame's JS | 4–8 | render only (the physics' sea stays on the CPU) | later, for the render thread |
| E | Typed-array struct-of-arrays boats | under 5%: the cost is branchy logic, not memory layout | 20+ | bit-identical if careful | no, except as A's snapshot format |
| F | WASM kernels | ~1.5–2× on kernels that are each a few % of the step | 20+ | **not** bit-identical (WASM has no `Math.sin`; ours would differ in the last bit) | no |
| G | Several workers (AI boats split across them) | small: each step needs every boat's state, so 240 syncs a second at 4× cost about as much as the work saved | 30+ | bit-identical only with careful ordering | no (needs SharedArrayBuffer, which the host doesn't allow) |
| H | A fixed sim step decoupled from the frame rate | already so: `DT = 1/60` with an accumulator, the frame's dt clamped at 0.05 s | 0 | — | done |

### A. The World in a Web Worker (recommended)

**How it works.** The World, which imports nothing from three.js or the DOM since "World independence" (#168), runs in
one dedicated worker. Each frame the main thread posts `{ steps: n, commands }`: n comes from the same accumulator as
today, and commands are the tiller, sheet, button and pilot inputs, applied before the steps as today. The worker runs
the n steps and posts back a snapshot. The main thread draws the latest snapshot it has. That puts the drawing **one
frame behind** (16.7 ms: below what a helmsman can feel, and no longer than a frame of input lag). The sim's cadence,
step count and input order are exactly today's, so **the race is bit-identical**: the same code, the same inputs, in
the same order.

- **Headroom.** The worker has a core to itself (laptops have 4–8; the GPU process and the main thread use about
  two). At 4× and 60 fps, four steps can take ~12 ms of the 16.7 ms frame, keeping ~4 ms slack for the bursts, GC and
  messages. That is ~3 ms a step on a laptop against ~0.6–0.75 ms today: **4–5×**. At 1×, one step a frame: ~16×.
  The main thread also gets back the 2.2–3 ms the sim takes there today.
- **Spikes.** The worker can run up to two frames ahead (a small queue), so the 30-step and 1,800-step bursts are
  absorbed instead of dropping a frame. The headless races (the tests) have no player inputs, so they stay
  bit-identical. In play, a run-ahead step that has already been taken can't receive an input, so the player's input
  lands on the first step not yet run. That is at most two frames later than now, and a step lands as today when the
  worker isn't ahead. Play is never bit-reproducible anyway, because the frame times decide the step counts.
- **What the main thread reads.** The render, HUD and maps read about 110 boat fields and about 100 World fields, and
  ask the World a few questions (`currentAt` ×8, `nextMark` ×6, `seaHere` ×4, `windHere`, `fieldAt`, `rights`,
  `pairRecord`, `lineD`, `laylineTransit`, `canPassOn`, `hailOption`). The plan:
  - per-frame state → the snapshot (boats packed in a transferred `Float64Array` plus a small object for the rest);
  - the user boat's rules answers (`nextMark`, `rights`, `lineD`, `canPassOn`, …) → worked out in the worker and put
    in the snapshot;
  - the wind-on-water map and current arrows → grids the worker builds at the rates the maps refresh now (0.15 s),
    transferred as `Float32Array`s;
  - one-off questions (a click on the chart) → an async request answered next frame;
  - commands (`pushOff`, `setSail`, the motor, `retire`, `applyConditions`, …) → messages applied at the next step
    boundary, in the order they were sent.
- **Fallback.** The same boundary has an in-process mode: the World on the main thread, exactly as today. The page uses
  it if `new Worker` throws (a CSP refusal), and it's also the dev/test mode, so the check scripts that reach into
  `window.sim()` keep working.
- **Building it with no new packages.** Vite's own `?worker&inline` puts the worker's bundle in the page as a string
  and starts it from a blob URL. The artifact stays one HTML file.

**Risks.**
1. The frame's CSP may forbid blob workers. The first step checks this. If it is forbidden, the fallback is today's
   behaviour, and options B, C and D remain.
2. It's a large refactor of app.ts and the HUD: everything that reads `w.*` must read the snapshot. It touches files
   other sessions are working in (app.ts, ui/hud.ts, render/scene.ts), so it needs a quiet window from the Coordinator,
   or landing in slices (step 1 below lands in-process first and changes nothing visible).
3. Nine check scripts (scripts/check/*.cjs) reach into `window.sim()` and change the World directly (the time of day,
   `w.step` wrapped for timing). They run in in-process mode, plus one smoke run in worker mode.
4. Memory: the worker holds its own copy of the sim's data (tide, shore, terrain, charts used by the physics):
   +50–150 MB of heap, by estimate. The page is at ~290 MB now. To be measured in step 4.
5. One frame more between the tiller and the picture (16.7 ms). Commands are applied on the very next step, as today.
6. The replay and the debrief read `w.rec` and `w.track`. They're fetched from the worker when the race ends; they
   aren't sent every frame.

### B. Exact cuts (Deep Physics, under way)

Deep Physics is doing this now, and I haven't duplicated it. For their list, the measured candidates:
- `windHere` 9%, `currentAt` 5% (`atShore` 3%), `shadowAt` 3%: the same point is asked several times a step (a
  boat's own wind, her sails' wind, the AI's look-ahead), so a per-step memo keyed on the exact point is exact.
- `trimSails` 13% and the crew's placement (`placeCrew`, `crewJobs`) 7.5%;
- `checkPairs` 7% (28 pairs; most pairs are far apart and could be culled by an exact distance bound);
- GC 3.9% (allocations in `V`/`segPt` in math.ts and the per-step `{...}` copies in world.ts: `b.sea = { ...b.sea, ... }`,
  `this.cur = { ...this.cur, ... }`).

### C. Smoothing the bursts

- **The sea every 30 steps for all eight boats** (≈ +2 ms in that step): each boat on its own step,
  `(steps + id) % 30`. That is deterministic, but each boat's sea updates on a different step than now, so it's a
  re-baselined race.
- **`buildField` every 1,800 steps (up to 36 ms)**: build the next field in slices over the preceding steps. That's
  exact if its inputs are known ahead. The clock time is, but `wind.from` at the build step isn't, so taking it from
  the start of the slices re-baselines.

After A, the worker's run-ahead hides both, so C is only needed if A doesn't go ahead.

### D–H

See the table. Two notes on E–G. JavaScript's hot paths here are object-heavy solvers. Without a large rewrite that
would also change the last bits, WASM and struct-of-arrays rearrange the costs instead of removing them. Several
workers need SharedArrayBuffer to be worth it, and the host rules that out (§1.5).

---

## 3. What the budget test should measure afterwards

The guard must keep watching the race-mode physics at full fidelity. The worker runs the same `World.step`, so:

1. **Keep tests/perf.test.ts as the per-step guard**: the same race, the same CPU-time ratio against the reference.
   Only its limit changes, and only once the worker ships, by the owner's decision. Derived from the worker's frame
   (four steps in ~12 ms on a laptop), the room is roughly **54.7 × 3–4 ≈ 160–220**. I'd suggest raising it in
   steps the owner chooses (e.g. 80 first), so the room is spent deliberately rather than all at once.
2. **Add a spike guard**: the p99 of four-step groups (one 4× frame) in the same race, against the same reference. The
   mean doesn't see the 2.3% of frames that hitch today.
3. **Add a determinism guard**: the race run through the worker protocol (Node `worker_threads`, the same message
   handler) gives a track byte-identical to the in-process World.
4. **Keep perf.cjs's main-thread frame budget** (24 ms here ≈ 8 ms on a laptop), now covering the snapshot's apply.
   With the sim off the main thread it measures the render, HUD and maps alone.
5. **A fidelity rule**: race mode must have no quality switches. If any are ever added (for cruising or the showroom),
   a test asserts that each is off in races, and the perf test runs the race path with every model on, as now.

---

## 4. The plan, in order

| step | what | hours | lands as | race |
|---|---|---|---|---|
| 1 | **Probe** (recommended first): a tiny private test page (a separate artifact, never the live one) that reports `crossOriginIsolated`, whether `new Worker(blob:)` starts and answers, and `hardwareConcurrency`; the owner opens it once in their browser | 1 | a link to the owner | — |
| 2 | **The boundary, in-process**: the `SimView` snapshot plus the command queue; app.ts, the HUD and the render read the view; the World stays on the main thread | 12–18 | one PR (or two: the commands, then the reads) | bit-identical, nothing visible changes |
| 3 | **The worker**: `?worker&inline`, pipelined lockstep, run-ahead of up to two frames, the in-process fallback, the end-of-race fetch of `rec`/`track` | 6–10 | one PR | bit-identical |
| 4 | **The maps' grids and the async questions from the worker**; memory measured | 4–8 | with 3 or after | — |
| 5 | **The guards** (§3: spike, determinism, perf.cjs); the budget's new limit proposed to the owner with the measured room | 3–5 | with 3 | — |
| | **total** | **26–42** | | |

Laptop numbers are estimates from this container's calibration. The `` ` `` key's meter (ui/perfMeter.ts) gives the real
ones: the owner's sim ms per frame at 4× in a full race, read once before step 2 and once after step 3, would settle
the headroom on their actual machine.

After step 3 the main thread is mostly the drawing (three.js submission, boat and crew mesh sync, the wakes), and that
becomes the next limit. That's separate from the physics budget, and option D plus merging each boat's fixed parts
(ROADMAP, Performance review, "Left for later") are its first candidates.

---

## 5. Step 2, built: the boundary, in the page's own thread

The owner gave the go on 13 November 2026, through the Coordinator. Step 2 is on branch `claude/sim-boundary`.

- **sim/commands.ts**: every change the page makes to the race, as plain data, each applied by the page's old code
  moved unchanged. That covers the helm and tiller, lashing, lines taken and given back, the band's targets and
  jumpers, the lazy car, the crew's place, the pole, the ensign and lights, the halyards, the pilot, the motor, a hail,
  push-off and cast-off, the destination, home and move-here, retiring, a penalty, conditions, the chart's colours and
  layers, the log's notes, and running, pause and speed.
- **sim/host.ts**: `SimView`, the World as the page may read it: read-only all the way down, with none of the methods
  that change the race. `SimHost` with `frame` (the old accumulator), `idle`, `send` and `drainEvents`, and
  `LocalHost`, the World in the page's thread as before. The read surface step 3 must serve is listed there.
- **The page** (app.ts, the HUD, the chart, the band, the scene, the replays): reads `SimView` and changes the race
  only by `send`. The strategist, laylines and debriefs take a `SimView` too.
- **Checks**:
  - **The compiler**: any write to the view, or any call of a race-changing method, is a type error.
  - **scripts/check/simguard.cjs**: the dev page with `?simguard`, where the view is a proxy that throws on any write,
    driven through a race at 4× (helm, sheets, lash, band, crew, pole, hail, views, chart, course, pause) and a cruise
    (motor, push-off, halyards, lights, ensign, pilot, chart destination, home). It finds no write, and its self-test
    confirms the guard is on.
  - **tests/host.test.ts**: a race and a cruise, each sailed through the host (uneven frames, speed changes, about 30
    commands) and by the page's old direct writes, are identical in every boat's whole state, to the last bit.
  - **Before and after**: three headless races (course 10 with eight boats at 22 kt, course 2 with five at 12 kt in
    an ebb, course 2 with six at 16 kt from the north) gave byte-identical full-precision tracks on main and on the
    branch.
- **Safari**: no WebKit build is installed here, so no Safari run. The change has nothing engine-specific in the
  published page: a plain class, plain objects and the same language features the page already uses. The proxy guard
  is dev-only. The owner's probe (§1.5a) covers the Worker side for step 3.

## 6. Step 3, built: the race in a Web Worker

The owner gave the go on 13 November 2026. Step 3 is on branch `claude/sim-worker`.

### The design: a mirror World on the page

The page doesn't only read the race's state. Every frame it also asks the World questions synchronously: the current
at each mooring, the wind map's field, the laylines, the strategist's briefing, the passage plan, the debriefs. A
snapshot of fields can't answer those. So the page keeps its own World, the **mirror**, built from the same course,
settings and seed, and never stepped.

- **Each frame** (sim/host.ts `WorkerHost`): the page sends the time that's passed and the commands since the last
  frame. The worker (sim/worker.ts `RaceWorker`) applies the commands and sails the steps due, with the same fixed step
  and accumulator as before. It then sends back what changed, the race's events and the commands' answers. The page
  writes those onto the mirror (sim/sync.ts), and draws the mirror and asks it its questions: the same code on the
  same numbers. The picture is one frame behind the race.
- **What's sent** (sim/sync.ts):
  - Both sides number every object in their World in the same walk order, and the numbers match because the Worlds
    are built alike.
  - The worker sends each object whose own fields changed, and only those fields. The mirror updates its object of
    that number in place, or makes a new one of the same class, so identities hold: a boat stays the same boat, and a
    new destination is a new object.
  - Functions, the random streams and the events aren't part of the state. The events travel in the packet, with the
    mirror's own boats in them.
  - **Memos stay local to each side** (the `LOCAL` table: the World's `kcMemo`, the tide field's memos, and the
    sea's fetch memo). The page's questions fill the mirror's memos, so sending the worker's would mix one side's key
    with the other's answer. Each of them gives the same answer whoever fills it. The piers' wakes are an exception:
    they refresh every 30 s from whenever they're first asked for, so they're sent, as the worker's.
  - **Classes are matched by their place in both sides' first walk, not by name.** The page's and the worker's code
    are minified separately, so the same class has different names in the two.
  - The course, the weather and the wind field are sent only when they're replaced. The tide stations' long
    prediction lists are sent once. The recorded frames and the track send only what's new.
- **The published page** carries the worker's code (built by Vite as one classic script) in a script element that
  isn't run, and starts the worker from a blob URL of it. The owner's probe showed the host allows blob workers.
- **New conditions mid-sail** (from the pause menu) replace the weather, the tide and the sea with new objects, and
  turn the course's legs.
  - The worker numbers its World afresh after the change and sends everything.
  - The page does the same frame's commands to its mirror up to the change. `applyConditions` is the same on both
    sides, so the new objects come with their functions.
  - The page then numbers the mirror afresh and takes the packet.
- **Sweep**: both sides forget the objects their World no longer holds, every 300 frames.
- **A check in the published page**: every 20 frames the worker sends a fingerprint of the race. It covers every
  boat's place, heading, speed and heel, the clock, the wind, and the current, field and wind at the course's middle.
  The mirror's own must match to the last bit. A difference is counted and reported, and the smoke check and the
  write guard require none.
- **Fallback**:
  - With `?inproc`, or where a worker can't start, the race sails in the page as before (`LocalHost`).
  - If a running worker fails, the mirror sails on in the page from the race as of the worker's last answer, and the
    player sees a short message. The commands of the unanswered frames are done again on the mirror.
  - A worker that stays unanswered through 30 of the page's frames and 5 seconds is taken for stuck.
  - The race carries on, but not exactly as the worker would have sailed it: the random streams (the puffs', the
    AI's) belong to each side, and the mirror's never ran.
- **The answers the page needs** (the motor's start while racing, home, move her here) come back as promises, at
  most a frame later.
- **Two-frame rule**: at most two frames are in flight. Past that the page's time waits, as a slow frame's does now.
  While the worker keeps up, the race is bit-identical to `LocalHost`'s. When it falls behind, a held-back frame's
  time is added to the next, which can round differently, so the race is still repeatable but no longer bit-identical
  to `LocalHost`'s.

### Checks

- **tests/sync.test.ts**: a race of eight at 1× and 4× through the start, and a cruise driven by commands. The mirror
  equals the worker's World in every member, its objects correspond one to one, and it gives the same answers to every
  question the page asks: current, wind, sea, the field, puffs, marks, right of way, hails, laylines, the race log's
  moments and findings, the start's debrief, the briefing, and the passage now and its plan.
- **tests/worker.test.ts**:
  - The same frames and about 16 commands through `LocalHost` and through `WorkerHost` give the same race to the last
    bit, whether the worker answers within the frame or a frame late. The worker runs as `RaceWorker` behind a stand-in
    Worker, with every message cloned.
  - The mirror equals the worker's World.
  - The page's own questions asked of the mirror (field, current, sea, puffs, laylines, right of way, the passage)
    give the same answers as with the race in the page.
  - New conditions mid-race (the wind turned 60° to 20 kt, then a slack tide made real) leave the mirror equal to the
    worker's World. The page's questions are asked of it every frame, and the course's legs turn with the wind.
  - With the worker answering only every third frame, through four sweeps, the mirror is still the race.
  - Answers come back.
  - A failing worker leaves the mirror sailing.
- **tests/host.test.ts** still holds: the commands sail as the page's old direct writes did.
- **scripts/check/simguard.cjs** (dev, worker mode): no write by the page, the guard's self-test passes, and the race
  is confirmed to be in its worker.
- **scripts/check/smoke.cjs** (the published page): clean, and the race is in its worker.
- **The perf test**: the step is unchanged. A second test guards the sync's cost a frame on each side, against the
  same reference workload.

### What it costs and gives (this container; a laptop runs this workload about 3× faster, §1.5a)

| | in the page (before) | with the worker |
|---|---|---|
| The page's JS a frame, race of eight at 4× (software GL, 480×300) | 52 ms | 40 ms |
| The sim on the page's thread at 4× | 4 steps, about 5.8 CPU ms | none: applying the mirror, about 0.5 CPU ms |
| The worker's frame at 4× | — | 4 steps (5.8 ms) plus finding what changed and cloning it (3.1 CPU ms; 2.3 after the cheaper walk, 13 Nov) |
| The page (HTML) | 5.0 MB | **8.9 MB** (the worker's code, 3.9 MB, travels alongside the page's) |

- **Headroom for the physics**: the worker's frame can take about 12 of the 16.7 ms at 60 fps. Less the sync's
  fixed part, that's about 3.5× today's step at 4× on a laptop (about 3.7× after the cheaper walk), and about 14× at 1×. It's less than §2's estimate of
  4–5×, because finding what changed walks the World's state every frame. Making that walk cheaper is the next lever
  (most of it: about 180 new small objects a step, the 170 puffs and the boats).
- **At 1×** the page's thread saves about half a step a frame: the mirror's apply and the message cost about half
  what a step does. The gain at 1× is mostly the room for the physics, not the page's frame.
- **The page's size**: 8.9 MB is under the host's 16 MB, but heavier to load. The sim's code and data are in it
  twice: once for the mirror and once for the worker. One copy would do if the page could `import()` a blob URL
  (the worker and the page sharing a module). The probe didn't test that, so a second probe would settle it.

## Method (to repeat these numbers)

- The budget test: `npx vitest run tests/perf.test.ts --silent=false` (the ratio is in the log line).
- Step profile and spikes: a throwaway vitest file building the perf test's World, then `node:inspector`'s Profiler
  over 450 s of the race (sampling at 200 µs), and wall time per step grouped by `steps % 30 / 60 / 1800`.
- The browser frame: `npm run dev`, Playwright, the perf.cjs setup (seeded `Math.random`, the full fleet, 22 kt),
  `w.step`, `view.render` and `__hud.update` wrapped with timers, CDP `Profiler` over 60 frames, the samples filtered
  to those under `frame()`.
- The host: the response headers of the claude.ai artifact page (COOP, no COEP, CSP).

## The compiler's thrown-away work (13 Nov 2026)

Bay East's waves (phase 2) cost about +30% in perf.test's first race in a fresh process, and about +3% after. The
step's own thread didn't show it: profiles and call counts matched. The cost was V8's optimizing compiler, on its own
threads: in that first race it compiled the rules' two hottest functions, `checkPairs` 629 times and `assessPair` 196,
and threw each one away ("Maps became deprecated during optimization"), 14 s of work (bay-east-11: 15 aborts, 0.4 s).

- **The cause:** boat fields built holding a whole number that later hold a fraction (`lastTackT`: −999, then her first
  tack's time; the penalty's fields; `poleT`; and `weatherHeld` and `carOff`, given later from 0). V8 keeps a field that
  has only held small integers as one. When it first holds a fraction, the boats' hidden classes change (15–97 maps at
  a time), and if that comes after the rules' functions have learnt the old ones, their every recompile is discarded
  until the old classes are collected. The waves only moved those first fractions later in the race. Any change to the
  race could do the same.
- **The fix** (world.ts `asDoubles`, makeBoat): those fields are made doubles as she's built (stored once as a fraction
  and put back, the value unchanged), and `weatherHeld` and `carOff` are declared `undefined` from the start. On
  bay-east-12: no aborts for either function, and the first race 1,023–1,085 CPU µs a step against 1,615–1,772 (bay-east-11:
  1,122–1,177). The race is identical to the last digit, on that branch and on main.
- **The guard:** `node scripts/check/deopt.cjs` (~30 s): the perf race, cold, under `node --trace-opt`, failing if any one
  function's compiles are aborted more than 20 times. Main: about 10 in all, no function over 3. The unfixed
  bay-east-12: `checkPairs` 608, `assessPair` 195 (fails). To find the field when it fails: `node --no-sparkplug
  --trace-generalization`, looking for `s->d` (a whole number becoming a fraction) with `(+N maps)` after the hot
  function is first marked for optimizing.
- In the browser the compiler's threads are off the worker's, so this costs a player background CPU in the first race
  rather than frame time. Safari's engine (JavaScriptCore) keeps shapes its own way: not measured, and the fix costs it
  nothing.
