# Room to respond: one model for the rules and the AI (design note)

Built (13 Nov 2026): `escapes()` in src/boat/arcs.ts, and rule 16.1 in src/rules/pairs.ts (`leftRoom`, `roomGap`). The pose history is kept per pair in the rules engine (`PairRecord.hist`, a fixed ring of 80 samples at 0.1 s per boat, `recordPose`), not in world.ts. 16.2 doesn't go through it: on a beat it bars any bear-away that makes the ducking boat respond at once, room or not (WS Case 92). The rest of this note is the design as agreed. It covers finding 2 in docs/RULES-CASES.md, which is WS Case 105
(rule 16.1). Rules and Skipper Model share it, so the sim has one answer to "could she have kept clear from here?", not two.

## The problem

**What the rules ask.** Rule 16.1: "When a right-of-way boat changes course, she shall give the other boat room to keep clear."
Definitions, *Room*: "The space a boat needs in the existing conditions, including space to comply with her obligations under the
rules of Part 2 and rule 31, while maneuvering promptly in a seamanlike way." *Keep Clear*: the right-of-way boat "can sail her
course with no need to take avoiding action".

**What WS Case 105 says** (Case Book 2025–2028, p.235). Two boats are running on opposite tacks, side by side, after a long time
on parallel courses. S luffs, and P doesn't respond, although she could have kept clear (by jibing). P broke 10,
and S didn't break 16.1: P had room.

**What the engine does today.** src/rules/pairs.ts `turnedToward` reads a turn of 12° or more toward the other boat within 3 s
before contact as a 16.1 (or 16.2) breach. It never asks whether the other boat could still have kept clear. So the engine calls
16.1 on a slow luff that left plenty of room, as in Case 105. It can also miss 16.1 for a small, late course change that left no
room at all.

**What the AI does today.** The AI's avoidance (src/ai/ai.ts, the rule 14 and keep-clear branches) picks headings from a closest
point of approach on straight lines. It doesn't know how fast she can actually turn at her speed. Skipper Model's avoidance
redesign needs exactly that: "If I turn hard now, do I clear?"

## One primitive: `escapes()`

This is a pure function. It predicts the keep-clear boat's best avoiding maneuvers from a given moment, using the physics' own
turning model, against the right-of-way boat's actual course. It reports whether any of those maneuvers keeps her clear.

```ts
// src/boat/arcs.ts: Deep Physics owns src/boat, so this is to be agreed with them. It reads only dynamics.ts and physics.ts exports.
interface Pose { t: number; x: number; y: number; h: number; v: number }
interface EscapeOpts {
  delay: number;      // reaction time before the helm goes over, s ("promptly")
  horizon: number;    // how far ahead to look, s
  clearance: number;  // gap that counts as clear, m (hull to hull)
}
/** Can `kc`, starting at `from`, keep clear of `row` sailing the track `rowTrack`? Returns the best manoeuvre found,
 * or null when every one comes closer than `clearance`. */
interface Candidate { helm: number; heading: number; minGap: number } // heading: the one she reaches (the AI sets it as `desired`)
/** Each candidate's least hull gap, over the horizon, to every track given. */
function escapes(kc: Pose & { turnRate: number }, rowTracks: Array<(t: number) => Pose>, wind: number, o: EscapeOpts): Candidate[];
```

The rules engine passes one track and asks whether any candidate's `minGap` is at least `clearance`. The AI passes every
threatening boat's track and steers for the candidate that keeps all the gaps above her clearance and stays nearest her course.
The "hold" candidate continues whatever turn she is already making (`turnRate`: mid-tack, or answering the helm), so the AI
doesn't misjudge a turn she has already committed to. Skipper Model's points, 13 Nov 2026. The per-step kinematics (turn
rate, yaw lag, speed loss) are exported, so the AI and the rules use exactly the same motion.

**The candidate maneuvers.** The helm goes over after `delay`, each way, at each of several amounts (full, half, and holding
her course). For each one she:

- **turns** at physics' own rate: `maxTurnRate(v)` from src/boat/dynamics.ts (the 9 m turning radius, capped at 4–22°/s),
  reached through the first-order yaw lag `yawLag(v)` (src/boat/physics.ts), as physics.ts already steps it;
- **loses speed** in the turn, from the rudder drag physics.ts applies (`rudderDrag`). If that is too heavy for a predictor,
  a fitted decay per degree turned will do;
- **jibes** if the turn passes the wind astern. That is allowed, with no extra cost over the turn itself. Case 105 counts
  jibing as a way to keep clear, and the crew's jibe timing (Crew Model, 9057d28) can limit the rate later;
- **tacks** if the turn passes head to wind. That is allowed, at the tack's own speed loss.

The function steps every candidate at 0.1 s over the horizon, and gets the gap from src/rules/geometry.ts `hullGap` on the
predicted poses.

**Cost.** Each call is about 6 candidates × 60 steps × 1 hullGap, a few microseconds. The rules call it only at an incident,
which is rare. The AI would call it per threatened pair, about once a second (Skipper Model's budget, docs/CAPACITY.md).

## How the rules use it (rule 16.1 and 16.2)

1. **Detecting the course change.** Keep `turnedToward`'s test, a turn toward the other boat. "Changes course" is the rule's
   trigger, and contact alone isn't 16.1.
2. **The moment she changed course, `t0`.** This needs a short history of each boat's poses: a ring buffer of about 5 s at
   10 Hz, kept by the World and passed in as `RulesBoat.track`. The diagram tests have no history. There, the engine falls
   back to the right-of-way boat turning from `headingAgo` to `h` at the rate the turn implies.
3. **Room or no room.** Call `escapes(kc at t0, row's actual track from t0, …)`:
   - If an escape exists, the right-of-way boat gave room. Contact is then the keep-clear boat's breach of the basic rule
     (10, 11, 12 or 13). That is Case 105's answer.
   - If none exists, she didn't give room. That is 16.1, or 16.2 for a starboard boat bearing away on a beat.
4. **The parameters.** These are modeling choices, to be confirmed with the researcher (human reaction time at the helm,
   and what "seamanlike" margin protest committees accept):
   - `delay` = 1.0 s ("promptly": a helmsman watching the other boat);
   - `horizon` = until the predicted closest point of approach has passed, at most 8 s;
   - `clearance` = CONTACT_GAP (2.2 m), the gap the engine already calls contact. "Keep clear" also needs the right-of-way
     boat to have no need to take avoiding action. A slightly larger margin, such as 3 m, could stand for that, to be
     tested against Cases 50 and 88, where she bore away for fear of contact.
5. **Unchanged:** rule 15's grace (finding 5 covers turns away), 17, 18 and 19. Those are about room for other things; this is
   only about 16.

## How the AI uses it (Skipper Model)

The same call drives the keep-clear decision:

- Before the boat commits, it checks whether holding course still `escapes()` from the other boat's predicted track. That
  track is her course extrapolated, or her current turn continued.
- If the only escapes left are the late, hard ones, she acts now and takes the best `turn`.

A skipper's skill (docs/SKIPPER-MODEL-PROPOSAL.md) enters through her own `delay` (an expert about 0.5 s, a novice about 2 s) and the errors in what she sees. The rules
engine always judges with the fixed, exact values, so the AI's mistakes don't change what a protest would find. That is the
proposal's rule: "rule-reading errors are applied to the `rights()` answer she acts on, not to the rules engine".

## Tests

- **Case 105:** turn its `it.fails` into a plain test. The luff is slow and the boats start a beam's width apart, so P can
  jibe or luff away, and P broke 10.
- **Case 92 (16.2)** and the 16.1 tests in tests/rules.test.ts must still hold. Those turns were sharp and late, and left no
  room.
- **New unit tests for `escapes()`:**
  - straight-line encounters with known answers;
  - turn rates matching physics at 1, 2 and 3 m/s;
  - a jibe escape on a run.
- **The AI's avoidance tests** (tests/ai-avoid, sim-fleet) as Skipper Model wires it in.

## Who does what

| Part | Owner |
|---|---|
| `escapes()` in src/boat/arcs.ts | written by Rules, reviewed and owned by Deep Physics |
| The pose ring buffer in world.ts (a fixed-size typed array per boat, about 50 poses × 8 boats, no per-step allocation: perf.test is at its limit) | Rules, in agreement with whoever is in world.ts |
| 16.1 and 16.2 in pairs.ts | Rules |
| The AI's use of it | Skipper Model |

Order: `escapes()` and its unit tests first, then rules 16.1/16.2 with Case 105, then the AI.
