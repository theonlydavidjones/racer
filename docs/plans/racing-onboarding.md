# Racing onboarding: a plan (r289)

ROADMAP 8s13, the owner's request of 20 November 2026: "a flow so players understand the race UI". This is the plan, with no code. The owner's rule governs every step: no blocks of copy on the game surface. At most one short line where the player acts. Everything longer goes behind a hover, a link, or the Help Center (r290).

## The order a new racer meets it

The order is the order of a real first race. Each step is learned in a drill before the player meets it in a fleet.

| # | Moment | Rules (RRS 2025–2028) | Learned in | In a race: the one line, and where |
|---|---|---|---|---|
| 0 | Sailing the boat: tack, jibe, points of sail | — | Learn to sail lessons 3–7 (`sim/lessons.ts`); the Tack & jibe drill (`'manoeuvres'`, `sim/drill.ts`) | No line. A racer who can't tack yet is sent to the lessons from the race setup, not told mid-race. |
| 1 | The sequence: warning, preparatory, one minute, start; the flags and sounds | 26; 29.1 (X); 30 (P, I, Z, U, black) | Start practice (`'drill'`, from one minute to go). A fuller run from the warning (`seq`). | The start card's timer and flag strip (the 8s6 race card) is the teaching. There's no copy, and the flag's meaning goes on its hover (`sim/signals.ts` `PREP_MEANING`, `FLAG_NAME`). |
| 2 | The line and the favored end | Definitions, Start; 30 | Start practice with `favAsk: 'ask'` (`ui/hud.ts`). The player names the favored end and the gun reveals it. `startDebrief` scores the start. | In races the favored end stays hidden until the player has found it in practice (owner, 20 Nov, 8s6). |
| 3 | Over early, and coming back | 29.1; 21.1 | Start practice. The OCS toast exists ("Over early! Return below the line…"). | The existing toast, one line. The situation pod then shows "You're returning. Keep clear of everyone." (`rules/explain.ts` `situationText`). |
| 4 | Port and starboard | 10; 14; 16.2 | Rules trainer Cases (`ui/rulesTrainer.ts`): 23, 43, 92, 105. There's no drill yet: see gaps. | The situation pod, one line, only when a meeting is near ("Keep clear of Blue. You're on port…"). The boat tags' keep-clear and right-of-way colors (`render/labels.ts`) carry it without words. |
| 5 | Windward and leeward; clear astern; tacking | 11; 12; 13; 15; 16.1; 17 | Cases 7, 13, 14, 27, 53 | The same pod lines (11, 12, 13, 15, 16.1, 17). |
| 6 | Rounding a mark, the zone and mark-room | 18.2(a), (c); 18.3; 18.4; 31 | The Mark-rounding drill (`'roundings'`, `sim/roundings.ts`), alone; Cases 15 and 25 | The pod's 18 lines ("Give Blue mark-room."). The zone ring drawn on the water says it without words. |
| 7 | A foul, the penalty and the turns | 44.1, 44.2; 21.2; 23.2 | Nowhere yet: see gaps | The incident review shows what happened (`rules/explain.ts`). On the water, one line ("You're doing turns. Keep clear of everyone."). The turns' progress is shown by the boat tag (`turnsTag`), not words. |
| 8 | Protests and the hearing | 60–64; Appendix P (umpired) | The hearing flow (`rules/hearing.ts`), when it first happens | After the race, never during it. |

## Where each is taught

- **Practice comes before the fleet.** The race setup offers the next drill a racer hasn't done, as the Learn to sail grid already marks passed lessons (`ui/lessons.ts` `lessonGridHtml`). It's an offer, never a gate: an experienced sailor goes straight to a race.
- **The Rules trainer is the reference.** It holds the World Sailing Cases on the water (`rules/cases.ts`, 12 Cases), asked and answered, then sailed yourself. A race's incident review links to the Case that matches its rule.
- **In a race, the situation pod is the only words.** It holds one line at a time, only when a boat is near and a rule binds. The coach (`boat/coach.ts`) stays on trim and speed, not rules.
- **The Help Center (r290) holds the rest:** the long explanations already written in `rules/explain.ts` (`RULES`, the incident `what`/`tip`), the flags' meanings, and the sequence diagram. The pod's line and the incident review link to it with one hover or link.

## Reuse, not rebuild

| Built | Where | Its role here |
|---|---|---|
| Start practice, `favAsk` | `app.ts:679`, `ui/hud.ts:596`, `sim/startDebrief.ts` | Steps 1–3 |
| Tack & jibe drill; Mark-rounding drill | `sim/drill.ts`, `sim/roundings.ts` | Steps 0 and 6 |
| Learn to sail lessons 1–12 | `sim/lessons.ts`, `ui/lessons.ts` | Step 0 |
| Rules trainer, 12 Cases | `ui/rulesTrainer.ts`, `rules/cases.ts`, `sim/caseRun.ts` | Steps 4–6 |
| Situation pod lines | `rules/explain.ts` `situationText` | The in-race line for every rule |
| Incident review; hearing | `rules/explain.ts`, `rules/hearing.ts` | Steps 7–8 |
| Signals, flag names and meanings | `sim/signals.ts` | Step 1's hovers |

## Gaps: what would be new

1. **A meeting drill:** port and starboard, then windward and leeward, with one AI boat placed to meet you, as the Cases place theirs (`sim/caseRun.ts`). It reuses the Case machinery with a free helm. It's the one new piece of practice.
2. **A penalty drill:** foul once on purpose, take the two turns clear of a boat or two, and see 44.2 and 21.2 work. Today a player first meets turns in a real foul.
3. **The setup's next-drill offer** (above), using the lessons grid's passed state for drills too.
4. **The Help Center itself** (r290), and the links into it from the pod and the incident review.

The owner's approval is needed before any of 1–4 is built. They're features, so they come after the sprint.
