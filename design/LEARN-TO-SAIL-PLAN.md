# Learn to sail: the build plan (Debrief, 13 Nov 2026)

The owner approved the design (`learn-to-sail-mockup.png`) and the knowledge cards. Still open: the badge's name, and
the pass marks, which stay proposals in a single table for the owner to tune. The work is six PRs, each standing on
the one before.

| PR | What | Touches | Reviews | Hours |
|---|---|---|---|---|
| 1 | **The lesson engine and the lesson tiles.** A `lesson` mode in Settings, and a `LessonTracker` in the World (src/sim/lessons.ts), like the drills' trackers: it gives each lesson its start, one cue, a check and a result. The cue goes in the coach box, not a new element. The tiles sit in the Drill section (placement agreed with UI & Experience). Progress is kept in your saves (store). The pass marks are in one table, `LESSON_MARKS`. First lessons: **3 The tiller** and **4 Points of sail** (telltales from the trim model). | src/sim, src/ui, src/app/drills.ts | physics-reviewer, visual | 8–12 |
| 2 | **5 Stop, go, irons · 6 Tacking · 7 Gybing · 8 Heave to.** These reuse the tack and gybe drill's measures (sim/drill.ts): back to speed, the boom's crossing, by the lee. Heave-to comes from the physics' own `hove` state. | src/sim/lessons.ts | physics-reviewer | 6–8 |
| 3 | **1 The boat** (find the named part on the showroom boat) · **2 Before you go** (the checks at the dock) · **11 A breeze** (depower through a puff) · **12 Home to the slip** (the docking that's already built). | src/ui, src/sim/lessons.ts | physics-reviewer, visual | 6–8 |
| 4 | **9 Rules of the road** (stand-on and give-way with the traffic and AI boats; buoys) · **10 Crew overboard**: a person in the water who drifts with the current and the wind, and the quick-stop or figure-8 to come back alongside. This is new physics for the person in the water, so it's sourced and reviewed. | src/sim, src/environment | physics-reviewer, researcher, visual | 8–12 |
| 5 | **The knowledge cards.** The four knots of the standard (stopper knot, bowline, cleat hitch, square knot), the distress signals (Navigation Rules, Annex IV), and first aid (hypothermia, overheating, seasickness). Each card is a picture first and one line, citing its source; the sources come from the researcher first. They show between lessons. | src/ui | researcher, visual | 5–7 |
| 6 | **The badge** on your skipper, once the owner names it. | src/ui, store | visual | 1–2 |

Each PR has origin/main merged in and passes the full `npm test` before it's opened. None adds an on-screen button:
the tiles live in the Drill section, the cue in the coach box, and the cards on the lesson's own result screen.
