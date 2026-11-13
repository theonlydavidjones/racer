# World Sailing Cases: the rules engine's coverage

Toward criterion 5 of docs/VISION-ROADMAP.md: the Racing Rules of Sailing covered for fleet racing, with a test per World Sailing Case
the sim can judge. Source: World Sailing, *The Case Book for 2025–2028*, version 2025-07
(https://media.sailing.org/sailing/wp-content/uploads/2025/07/31104846/WS-Case-Book-2025-2028-v2025-07.pdf); "p." is the PDF page.

Every Case whose rules-referred list touches Part 2 (rules 10–24, 43, 44), marks and obstructions (18–20), starting and the course
(28–31), or the Definitions those use. Cases are taken from each Case's own header; prose citations aren't counted.

**Status**
- **covered**: the engine models every rule the Case turns on; a test sets the Case up and checks the engine reaches its answer.
- **partly**: the engine reaches the Case's answer on the main rule, but the Case also turns on something the sim doesn't model
  (exoneration under 43.1(b)/(c), rule 14 for the right-of-way boat, a judgement of proper course, three or more boats in a chain).
  The test checks what the engine does model.
- **not modelled**: the Case turns on hails' wording, intent, propulsion (rule 42), equipment out of position, protest or race
  committee procedure, or scoring: things the sim doesn't simulate.
- **?** marks a Case where reading the engine suggests it may give a different answer: the test will tell, and a failure is reported
  as a finding, not fixed in the same change.

What the engine models (src/rules): rules 10–13, 15 (a few seconds' grace), 16.1 and 16.2 (a turn toward the other boat), 17
(above proper course), 18.2(a)–(d), 18.3, 18.4, 19.2(b)/(c) (the shore, the committee boat after the start, a boat both must keep
clear of), 20 (hails, "You tack", 20.2(e), 20.3), 21.1–21.3, 23.1/23.2 (physical interference), 29.1, 30 (I, Z, U, black), 31,
43.1(a) (compelled within a few seconds), 44.1 (one penalty per incident), the Part 2 preamble (no penalty when not racing).
Rule 14 only as "the right-of-way boat had to swerve". Not modelled: 43.1(b)/(c) exoneration as such (the engine names one
fouler per incident), damage, and the right-of-way boat's own rule 14 breach.

## Rules 10–17 (Part 2, Sections A and B)

| Case | p. | Rules | The Case's answer | Status |
|---|---|---|---|---|
| 6 | 84 | 13, 16.1, 16.2 | S tacks after P bore away to pass astern: no breach; past head to wind P has right of way (13) | covered |
| 7 | 85 | 11, 15, 16.1, 17 | L overlapped from astern within 2 lengths, not above her proper course: W broke 11 | covered |
| 9 | 88 | 10, 18.1(a) | Opposite tacks at a windward mark: no rule 18; P keeps clear (10) | covered |
| 13 | 95 | 11, 15, 16.1, 17 | Before the start L luffs from a leeward overlap from astern: no proper course, so no 17; W broke 11 | covered |
| 14 | 97 | 11, 16.1, 17 | L luffs slowly to her own proper course: W broke 11 | partly (proper course is a judgement) |
| 17 | 102 | 13 | Rule 13 ends when she's on a close-hauled course, whatever her speed | covered |
| 23 | 109 | 10, 19 | S runs between PL and PW: both P boats broke 10; rule 19 doesn't apply | covered **?** (the engine may treat S as an obstruction to the pair) |
| 24 | 111 | 11, 12, 15 | B overlaps to leeward from astern close to A's stern: A must luff promptly; contact then is B's (15) | covered |
| 27 | 117 | 13, 15 | AS tacks right in front of BP: AS broke 13 and 15 | covered |
| 30 | 123 | 12, 19 | B astern blankets A, A gybes unintentionally: B broke 12 | partly (the unintended gybe) |
| 43 | 142 | 10, 13, 15, 19.2(b) | S tacks near a bank, P sails on: P broke 10; 19.2(b) and 20 don't apply | covered |
| 46 | 147 | 11, 16.1, 17 | L luffs to her proper course after a leeward overlap from astern: W broke 11 | partly (proper course) |
| 50 | 153 | 10 | No contact, S bore away for fear of it: P broke 10 | partly (only as a forced swerve) |
| 51 | 155 | 11, 43.1(a) | A chain of four boats before the start: W broke 11; the others exonerated | partly (two-boat chains only) |
| 52 | 157 | 16.1 | Pre-start manoeuvring to drive a boat off the line: no breach | partly |
| 53 | 159 | 11, 15 | L overlaps a near-stationary W from astern: 15 gives W time; no breach | covered |
| 87 | 203 | 10, 14 | P3 hits S on the line: P3 broke 10 | covered |
| 88 | 205 | 10 | P passes 2 ft astern after S luffed hard: P broke 10 (keeping clear isn't just avoiding contact) | partly (only as a forced swerve) |
| 92 | 213 | 16.1, 16.2 | S keeps bearing away onto P passing astern: S broke 16.2, then 16.1 | covered |
| 99 | 226 | 10, 14, 44.1(b) | P broaches into S: P broke 10 (and retires) | partly (retirement as penalty) |
| 105 | 235 | 10, 15, 16.1 | Running, S luffs after a long parallel course and P doesn't respond: P broke 10, S didn't break 16.1 (P had room) | covered **?** (the engine's 16.1 is "turned toward her within 3 s", which may call S) |
| 107 | 238 | 10, 14 | Head-on before the start: Jupa (P) broke 10 | partly (lookout, 14 for S) |
| 123 | 274 | 10, 14 | S holds her course, P doesn't clear her: P broke 10 | partly (S's own 14 not modelled) |
| 134 | 293 | 17 | Proper course depends on the sails set | not modelled |
| 147 | 317 | 10, 16.1, 43.1(b) | S luffs onto PB after ducking PA: PB exonerated; S owed room under 16.1 | covered |
| 73, 74 | 183–4 | 2, 11 | Crew reaching out to touch the other boat | not modelled (intent, crew position) |
| 77, 91 | 188, 211 | 12, 14 | Spinnaker or guy out of position | not modelled (equipment) |

## Rule 18 (mark-room)

| Case | p. | Rules | The Case's answer | Status |
|---|---|---|---|---|
| 2 | 77 | 12, 15, 18.2(a)(2) | B, clear astern, reached the zone first while A was outside it: A owes B mark-room and broke 12 and 18.2(a)(2) | covered |
| 12 | 93 | 11, 18.2(a)(1) | Overlapped when the first reached the zone, on courses 90° apart: OL broke 18.2(a)(1) | covered |
| 15 | 99 | 12, 13, 18.2(a)(2), 18.2(b) | A clear ahead at the zone, upwind: B keeps clear and gives mark-room; once A tacks, 18.2(a) ends and B has right of way (13) | covered |
| 21 | 105 | Mark-Room, Room | How much space mark-room is | not modelled (a judgement) |
| 25 | 112 | 11, 16.1, 18.1(b) | Once the inside boat has left the mark astern, rule 18 ends: IW broke 11 | partly (when the mark is "left astern") |
| 26 | 115 | 10, 14, 18.1(a) | Boats leaving the mark on different sides: no rule 18; P broke 10 | partly (one course: both boats always leave a mark on the same side) |
| 59 | 167 | 18.2(a)(2) | D outside the zone when E reached it: D owes E mark-room | covered |
| 63 | 172 | 18.2(a), 43.1(b) | C takes space freely given inside B: no breach | partly |
| 75 | 185 | 10, 16.1, 18.4 | S inside luffs, then gybes at the mark: no breach; P broke 10 | partly (proper course) |
| 81 | 195 | 13, 15, 18.2(b) | A, clear ahead at the zone, tacks to round and B hits her: A broke 13 | covered |
| 93 | 215 | 15, 16.1, 18.3 | W tacks in the zone; L overlaps from astern and luffs at once: L broke 15 and 16.1 | covered |
| 95 | 218 | 18.1(a)(1), 18.3, 31 | Jagga tacks to windward of Freebird in the zone and luffs her onto the mark: Jagga broke 18.3(b) and 11 | partly (the mark touch's exoneration) |
| 114 | 253 | 16.1, 18.2(a)(1), 31 | Room owed through a middle boat; at a starting mark L luffs W onto it: L broke 16.1 | partly (three-boat chains; Q3 buildable) |
| 118 | 260 | 18.2(a)(1) | "Room to sail to the mark" at a leeward mark: no breach | partly |
| 132 | 289 | 16.2, 18.1(a)(1) | When boats on opposite tacks are "on a beat" | partly (the sim uses the leg's beat flag) |

## Rules 19–24 (obstructions, hails, Section D)

| Case | p. | Rules | The Case's answer | Status |
|---|---|---|---|---|
| 3 | 79 | 19.2(a), 20, 43.1(a) | PW slow to respond to "Room to tack": PW broke 20.2; PL exonerated | partly (hail timing) |
| 10 | 89 | 20 | Hails when 20.1 isn't met: the hailed boat must still respond (20.2(b)) | partly (the sim only lets a valid hail be made) |
| 11 | 91 | 19.2(b), 20.1, Obstruction | Two port boats overlapped meeting S: PL broke 19.2(b) by not giving PW room astern of S | covered |
| 29 | 121 | 19.2(b), 19.2(c) | M sails between overlapped L and W on a run: L is an obstruction, not a continuing one; no breach | covered |
| 33 | 129 | 19.2(b), 20.1, 20.2 | A hail made too early must still be answered; a new overlap after both tack | partly (hail timing) |
| 35 | 133 | 20.2(c) | "You tack", and L tacks and passes 1 m astern: W complied | covered |
| 41 | 139 | 11, 12, 19.2 | Two overlapped boats overtake a third to leeward: the third is an obstruction while astern, then 11 | partly (three boats) |
| 49 | 151 | 19.2(b), 23.2 | PL gives PW no room to bear away from S on another leg: PL broke 19.2(b); S didn't break 23.2 | partly (procedure) |
| 54 | 161 | 20 | When a boat may hail, and the hailed boat's options | partly (hail timing: sim/obstruction.ts hailRange) |
| 101 | 229 | 20.2(c) | "You tack", A tacks to port, then must keep clear (10) | covered |
| 113 | 251 | 20 | L, M and W: M must pass the hail on to W (20.3) | covered |
| 117 | 259 | 15, 19.2(b) | A row of boats isn't a continuing obstruction; L overlapping D to leeward ends D being an obstruction | partly |
| 124 | 276 | 19.2(a), 19.2(b) | Who chooses the side to pass an obstruction | partly |
| 125 | 278 | 19.2(b) | Three port boats meeting S: PL must give room to PM and PW | partly (three boats) |
| 126 | 280 | 23.2 | Which leg a boat is on when she has made a mistake | partly |
| 146 | 315 | 11, 16.1, Section C preamble | A starting committee vessel in open water: rule 19 doesn't apply; W exonerated (room under 16.1) | partly **?** (the engine treats the committee boat as an obstruction from the gun on) |
| 149 | 322 | 21.2, 23.2, 44.2 | B breaks off her turns to keep clear of A: no breach by B; A broke 23.2 only if off her proper course | covered |
| 150 | 325 | 19.1, 19.2 | When boats are "at" an obstruction; who is inside at a breakwater | partly |

## Starting, the course, penalties (28–31, 42–44) and the Definitions

| Case | p. | Rules | The Case's answer | Status |
|---|---|---|---|---|
| 5 | 82 | Racing, 22, 42 | An anchored boat is racing | not modelled (anchoring, propulsion) |
| 8, 69 | 87, 179 | 42 | Propulsion | not modelled |
| 19, 141 | 104, 308 | 43.1(c), 44.1(b) | "Damage", "serious damage" | not modelled |
| 28 | 119 | 28.1, 31, 43.1(a) | S compelled to touch the pin is exonerated, but must still start | partly (a compelled mark touch isn't exonerated) |
| 31, 79, 96, 111, 136 | | 26, 29.1, 30 | Recall signals and their timing, redress, evidence | not modelled (race committee) |
| 58, 90, 106, 112, 128, 129, 145, 148 | | 28, Finish, Sail the Course | The taut string; finishing | not modelled (the sim's own mark passing, not the string test) |
| 65 | 175 | 2, 30.4 | Racing on after a black flag | not modelled (intent) |
| 68 | 178 | Racing, Part 2 preamble | A boat with an invalid certificate is still racing | not modelled (certificates) |
| 108 | 240 | 31, 44.1, 44.2 | Taking a One-Turn Penalty at a mark | partly (the turn's mechanics) |
| 127 | 282 | Racing | She clears the finishing line and marks when no mark influences her course: touching one before that is rule 31 | covered |
| 135 | 295 | 44.1(b), 61.4 | Redress after damage | not modelled |
| 140 | 305 | Start, 30.3, 43.1(a) | Forced over the line in a U or black flag start | partly |

## Tally

- Covered: 27 (6, 7, 9, 11, 12, 13, 15, 17, 2, 23, 24, 27, 29, 35, 43, 53, 59, 81, 87, 92, 93, 101, 105, 113, 127, 147, 149).
- Partly: 33.
- Not modelled: 27.
- 87 Cases in all (a Case listed under two rules is counted once).

## Tests

The tests live in tests/rules-cases.test.ts, one `it` per Case, named by its number. They are added in slices, highest value first:
rule 18, then 10–11, 15–17, then 19. Findings (the engine reaching a different answer from a Case) are listed here as they're
found.

### Findings

(none yet)
