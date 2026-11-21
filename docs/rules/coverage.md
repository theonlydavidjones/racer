# Rules coverage: which calls a test sails to the end (21 Nov 2026, v215)

The question for each rule the sim judges: does a test build a `World`, sail the boats with `step`, and assert the
engine's call? This file is the answer as of v215 plus `rules/fouls-honest`. RRS 2025–2028.

**Legend**
- **sailed**: a test sails it to the call.
- **sailed (new)**: added on this branch, in `tests/rules-e2e.test.ts`.
- **unit**: only the judge is tested, on poses set up by hand (`tests/rules*.test.ts`).
- **gap**: no test drives the call.

S is a test of about 30 lines. M needs a scripted boat, a mark or shore set-up, or engine work.

## Coverage by rule

| Rule | Sailed to the call | Unit tests | Gap |
|---|---|---|---|
| 10 | **new**: `rules-e2e` port meets starboard; also Case 23 in `caseRun.test.ts:91` | `rules.test.ts:16` | — |
| 11 | **new**: windward bears down; also `caseRun.test.ts:45` (Case 7) | `rules.test.ts:47` | — |
| 12 | **new**: clear astern into her transom; also `caseRun.test.ts:65` | `rules.test.ts:88` | — |
| 13 | Case 27 only, where `caseRun.test.ts:91` accepts 13 or 15 | `rules.test.ts:127` | M: needs your tack timed onto her |
| 14 | Not its own call. A right-of-way boat's forced swerve becomes the keep-clear boat's foul (kind `swerve`). | `ai-forced14.test.ts` (AI only, no step) | Engine: 14 is never called against a right-of-way boat (Definitions, Keep Clear; 14). Owner/Coordinator call. |
| 15 | Case 27 only (13 or 15) | `rules.test.ts:101, 137, 417` | M |
| 16.1 | **new**: leeward luffs 20° at once, 2.8 m to windward | `rules.test.ts:525, 552` | — |
| 16.2 | none | `rules.test.ts:546` | M: the AI port boat tacks or crosses rather than ducking, so it needs a scripted ducking boat (`sim/caseRun.ts` style) |
| 17 | **new**: leeward from clear astern within two lengths, sailed above close-hauled | `rules.test.ts:570` | — |
| 18.2(a), 18.2(c), 18.3, 18.4 | none | `rules.test.ts:172–290`, `rules-more.test.ts:33–80` | M: a mark and its zone; Cases with marks aren't sailable (`caseRun.test.ts:86`) |
| 19.2(b), 19.2(c) | none | `rules-more.test.ts:109, 130` | M: the shore or the committee boat |
| 20, the hailed boat doesn't respond | `sim.test.ts:237`, `rule20-obstructions.test.ts:95` | `rules.test.ts:613` | — |
| 20.2(d), the hailer doesn't tack; the "You tack" foul | none (`sim.test.ts:288, 314` sail the reply only) | `rules.test.ts:633, 642` | M: an obstruction and a hail |
| 21.1 | `sim.test.ts:70–99` assert her `returning` state, not a call | `rules.test.ts:393` | S–M: a returning boat meeting one that has started |
| 21.2 | `ai-berth-turns.test.ts` (a count over 124 races), `rules-finish.test.ts:285` | `rules.test.ts:436–500` | — |
| 21.3 | none | `rules-more.test.ts:8` | M: backing a sail |
| 22, 24 | not in the engine | — | not judged |
| 23.1 | **new**: a finished boat in the way of one racing | `rules-more.test.ts:180` | — |
| 23.2 | none | `rules.test.ts:508`, `rules-more.test.ts:142` | M: a boat doing turns or on another leg, and you leaving your proper course |
| 28 | not a call: wrong-side and missed-mark toasts only (`world.ts` ~1642) | — | Engine: no penalty for sailing the course wrong. Owner/Coordinator call. |
| 29.1 (OCS) | `sim.test.ts:52, 119` | — | S: the X flag itself (`world.ts:1956`) |
| 30.1–30.4 | `signals.test.ts:57–69` | — | — |
| 31 | `sim.test.ts:265, 329`, `protest-touch.test.ts`, `breaches.test.ts` | — | — |
| 42 (paddling) | `paddle.test.ts:84–135` | — | — |
| 42.3(d) (sculling) | physics only (`irons.test.ts`) | — | Engine: sculling is allowed when 42.3(d) permits it and never called otherwise (checked 20 Nov) |
| 43.1 | `sim.test.ts:393–463` (the compelling foul seeded by hand) | `hearing.test.ts:22` | S–M: a compulsion sailed end to end |
| 44.1, 44.1(a), 44.2 | `sim.test.ts:416, 506, 522`; `breaches.test.ts` | `boat.test.ts:299` | 44.1(a) with a real foul rather than a seeded one: S |

## What's left

**S gaps:**
- The X flag's signal.
- 44.1(a) after a real foul.
- 21.1 called on a returning boat. It may be M, depending on the line's geometry.

**M gaps:**
- 13, 15 and 16.2 need a scripted boat.
- The rule 18 family needs a mark and its zone.
- 19 and 20.2(d) need an obstruction.
- 21.3 needs backing a sail.
- 23.2 and a sailed 43.1 compulsion.

**Not judged by the engine:**
- Rule 14 as a call on the right-of-way boat.
- Rule 28 as a penalty.
- Rules 22 and 24.

These are design questions for the Coordinator, not test gaps.

The new tests found no engine bug. Each call came out as the RRS has it, on the boat that fouled.
