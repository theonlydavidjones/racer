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
- A Case the engine answers differently is a **finding** (below): its test is written as `it.fails` with the Case's answer, so it
  turns red, asking to be made a plain test, once the engine is fixed. Findings aren't fixed in the same change.

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
| 17 | 102 | 13 | Rule 13 ends when she's on a close-hauled course, whatever her speed | partly (the physics decides when she's close-hauled) |
| 23 | 109 | 10, 19 | S runs between PL and PW: both P boats broke 10; rule 19 doesn't apply | covered |
| 24 | 111 | 11, 12, 15 | B overlaps to leeward from astern close to A's stern: A must luff promptly; contact then is B's (15) | partly (whether A responded promptly) |
| 27 | 117 | 13, 15 | AS tacks right in front of BP: AS broke 13 and 15 | covered (finding 4, fixed) |
| 30 | 123 | 12, 19 | B astern blankets A, A gybes unintentionally: B broke 12 | partly (the unintended gybe) |
| 43 | 142 | 10, 13, 15, 19.2(b) | S tacks near a bank, P sails on: P broke 10; 19.2(b) and 20 don't apply | covered |
| 46 | 147 | 11, 16.1, 17 | L luffs to her proper course after a leeward overlap from astern: W broke 11 | partly (proper course) |
| 50 | 153 | 10 | No contact, S bore away for fear of it: P broke 10 | partly (only as a forced swerve) |
| 51 | 155 | 11, 43.1(a) | A chain of four boats before the start: W broke 11; the others exonerated | partly (two-boat chains only) |
| 52 | 157 | 16.1 | Pre-start manoeuvring to drive a boat off the line: no breach | partly |
| 53 | 159 | 11, 15 | L overlaps a near-stationary W from astern: 15 gives W time; no breach | covered (finding 5, fixed) |
| 87 | 203 | 10, 14 | P3 hits S on the line: P3 broke 10 | partly (S's own rule 14) |
| 88 | 205 | 10 | P passes 2 ft astern after S luffed hard: P broke 10 (keeping clear isn't just avoiding contact) | partly (only as a forced swerve) |
| 92 | 213 | 16.1, 16.2 | S keeps bearing away onto P passing astern: S broke 16.2, then 16.1 | covered |
| 99 | 226 | 10, 14, 44.1(b) | P broaches into S: P broke 10 (and retires) | partly (retirement as penalty) |
| 105 | 235 | 10, 15, 16.1 | Running, S luffs after a long parallel course and P doesn't respond: P broke 10, S didn't break 16.1 (P had room) | **finding 2** |
| 107 | 238 | 10, 14 | Head-on before the start: Jupa (P) broke 10 | partly (lookout, 14 for S) |
| 123 | 274 | 10, 14 | S holds her course, P doesn't clear her: P broke 10 | partly (S's own 14 not modelled) |
| 134 | 293 | 17 | Proper course depends on the sails set | not modelled |
| 147 | 317 | 10, 16.1, 43.1(b) | S luffs onto PB after ducking PA: PB exonerated; S owed room under 16.1 | partly (43.1(b) exoneration) |
| 73, 74 | 183–4 | 2, 11 | Crew reaching out to touch the other boat | not modelled (intent, crew position) |
| 77, 91 | 188, 211 | 12, 14 | Spinnaker or guy out of position | not modelled (equipment) |

## Rule 18 (mark-room)

| Case | p. | Rules | The Case's answer | Status |
|---|---|---|---|---|
| 2 | 77 | 12, 15, 18.2(a)(2) | B, clear astern, reached the zone first while A was outside it: A owes B mark-room and broke 12 and 18.2(a)(2) | covered, gybes included (finding 3, fixed) |
| 12 | 93 | 11, 18.2(a)(1) | Overlapped when the first reached the zone, on courses 90° apart: OL broke 18.2(a)(1) | covered |
| 15 | 99 | 12, 13, 18.2(a)(2), 18.2(b) | A clear ahead at the zone, upwind: B keeps clear and gives mark-room; once A tacks, 18.2(a) ends and B has right of way (13) | covered |
| 21 | 105 | Mark-Room, Room | How much space mark-room is | not modelled (a judgement) |
| 103 | | Room, 19.2(b) | Room at an obstruction and seamanlike handling | not modelled (a judgement) |
| 25 | 112 | 11, 16.1, 18.1(b) | Once the inside boat has left the mark astern, rule 18 ends: IW broke 11 | partly (when the mark is "left astern") |
| 26 | 115 | 10, 14, 18.1(a) | Boats leaving the mark on different sides: no rule 18; P broke 10 | partly (one course: both boats always leave a mark on the same side) |
| 59 | 167 | 18.2(a)(2) | D outside the zone when E reached it: D owes E mark-room | covered |
| 63 | 172 | 18.2(a), 43.1(b) | C takes space freely given inside B: no breach | partly |
| 75 | 185 | 10, 16.1, 18.4 | S inside luffs, then gybes at the mark: no breach; P broke 10 | partly (proper course) |
| 81 | 195 | 13, 15, 18.2(b) | A, clear ahead at the zone, tacks to round and B hits her: A broke 13 | covered |
| 93 | 215 | 15, 16.1, 18.3 | W tacks in the zone; L overlaps from astern and luffs at once: L broke 15 and 16.1 | covered (finding 1, fixed) |
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
| 29 | 121 | 19.2(b), 19.2(c) | M sails between overlapped L and W on a run: L is an obstruction, not a continuing one; no breach | partly (three boats, room judged) |
| 33 | 129 | 19.2(b), 20.1, 20.2 | A hail made too early must still be answered; a new overlap after both tack | partly (hail timing) |
| 35 | 133 | 20.2(c) | "You tack", and L tacks and passes 1 m astern: W complied | partly (as finding 6) |
| 41 | 139 | 11, 12, 19.2 | Two overlapped boats overtake a third to leeward: the third is an obstruction while astern, then 11 | partly (three boats) |
| 49 | 151 | 19.2(b), 23.2 | PL gives PW no room to bear away from S on another leg: PL broke 19.2(b); S didn't break 23.2 | partly (procedure) |
| 54 | 161 | 20 | When a boat may hail, and the hailed boat's options | partly (hail timing: sim/obstruction.ts hailRange) |
| 101 | 229 | 20.2(c) | "You tack", A tacks to port, then must keep clear (10) | covered (finding 6, fixed) |
| 113 | 251 | 20 | L, M and W: M must pass the hail on to W (20.3) | partly (the pass-on's timing only) |
| 117 | 259 | 15, 19.2(b) | A row of boats isn't a continuing obstruction; L overlapping D to leeward ends D being an obstruction | partly |
| 124 | 276 | 19.2(a), 19.2(b) | Who chooses the side to pass an obstruction | partly |
| 125 | 278 | 19.2(b) | Three port boats meeting S: PL must give room to PM and PW | partly (three boats) |
| 126 | 280 | 23.2 | Which leg a boat is on when she has made a mistake | partly |
| 146 | 315 | 11, 16.1, Section C preamble | A starting committee vessel in open water: rule 19 doesn't apply; W exonerated (room under 16.1) | partly (the engine always names one boat at an incident, where the Case penalises nobody: W exonerated, L met 16.1. Not tested: after the gun the committee boat is an obstruction once both have started, where the Section C preamble excludes it until they've left it astern) |
| 149 | 322 | 21.2, 23.2, 44.2 | B breaks off her turns to keep clear of A: no breach by B; A broke 23.2 only if off her proper course | partly (23.2 for A) |
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
| 127 | 282 | Racing | She clears the finishing line and marks when no mark influences her course: touching one before that is rule 31 | partly (the sim's `cleared` flag, not the judgement) |
| 135 | 295 | 44.1(b), 61.4 | Redress after damage | not modelled |
| 140 | 305 | Start, 30.3, 43.1(a) | Forced over the line in a U or black flag start | partly |

## Tally

- Covered, the test reaching the Case's answer: 17 (2, 6, 7, 9, 11, 12, 13, 15, 23, 27, 43, 53, 59, 81, 92, 93, 101).
- Findings, the engine answering differently: 1 (105). Findings 1 (Case 93), 3 (the gybe, found while checking Case 2) and
  4–6 (Cases 27, 53, 101) are fixed.
- Partly: 42.
- Not modelled: 28.
- 88 Cases in all (a Case listed under two rules is counted once).

## Tests

tests/rules-cases.test.ts: one `it` per covered Case, named by its number, each reaching the Case's answer; a test of the modelled
part for some partly covered Cases (17, 24, 87, 113, 127, 149); and for each finding an `it.fails` with the Case's answer, next to a
"(the setup)" test pinning what the engine does today, so a fix shows up as both turning red. Every diagram first checks the boats
start apart (`clean`): an opening contact starts the 6 s incident cooldown and would hide the contact the Case is about.

### Findings

1. **Fixed. Case 93 (rule 18.3): the engine made the boat that tacked in the zone keep clear, where 18.3 only gives her
   duties.** W tacks from port to starboard in the zone; L, on starboard and fetching, gets a leeward overlap from clear astern and
   luffs straight into W. The Case: L broke 15 and 16.1 (and 14); W broke 11 but is exonerated, and gave L mark-room, so didn't
   break 18.3. The engine had returned the tacker as the keep-clear boat under 18.3 whenever they were overlapped, and skipped rule
   15 for it. Now (src/rules/rightOfWay.ts, pairs.ts): 18.2 is off between them, as before; the tacker keeps clear under '18.3' only
   with the fetching boat to windward of her, where rule 11 alone would have that boat luff above close-hauled; otherwise the basic
   rules, 15 and 16 govern. At an incident, 18.3(a) is the tacker's breach when the fetching boat, at or above close-hauled and not
   turning toward her, was overlapped to windward or clear astern of her; a fetching boat that bears away into her broke 11 or 12.
   Not modelled: 18.3(b)'s mark-room as exoneration under 43.1(b) (as for 18.2). Tests: Case 93 in tests/rules-cases.test.ts,
   "Rule 18.3" in tests/rules.test.ts.
2. **Case 105 (rule 16.1): the engine calls any turn toward the other boat a 16.1 breach, without asking whether she had room to
   keep clear.** Running on opposite tacks after a long time side by side, starboard luffs; port doesn't respond, though she could
   have kept clear (by gybing), and they touch. The Case: port broke 10; starboard didn't break 16.1, because port had room. The
   engine (src/rules/pairs.ts `turnedToward`): a right-of-way boat that turned 12° or more toward the other within 3 s before the
   contact broke 16.1, whatever the other boat could have done. 16.1 asks only that she "give the other boat room to keep clear":
   a fix would judge that room (the keep-clear boat's distance and time to respond against how fast she could turn or gybe away),
   not the turn alone. Test: Case 105 (`it.fails`).
3. **Fixed** (headToWindT, set by physics.ts only on a tack; read by 18.2(b), 18.2(d), 18.3 and rule 20's hails). **A gybe counted as passing head to wind (18.2(b), 18.3, 13).** The boats' `lastTackT` (src/rules/types.ts: "race time she last
   passed head to wind") is set by src/boat/physics.ts on any change of tack, gybes too. So a boat entitled to mark-room under
   18.2(a) that gybes in the zone loses it (src/rules/pairs.ts: 18.2(b) is taken as having happened), where 18.2(b) ends it only
   when she "passes head to wind or leaves the zone"; and a gybe from port to starboard in the zone of a mark left to port starts
   rule 18.3, which is about passing head to wind. It bites at leeward and gybe marks, so Cases 2, 59 and 75 are only right while
   nobody gybes. Worse, at a leeward mark left to port a gybe from port to starboard in the zone starts 18.3 and makes the gybing boat
   keep clear. A fix: a separate head-to-wind time, set in physics.ts only when the change of tack is through the wind (her TWA under
   90°), used by 18.2(b), 18.3 and 18.2(d)'s "tacker" (ovStart); rule 15's "just tacked" and the rest keep lastTackT, since a gybe
   too can give the other boat right of way. physics.ts is Deep Physics'.
   Test: "Case 2, with the gybes" (`it.fails`).
4. **Fixed.** **Case 27 (rules 13, 15): rule 15's grace goes to the wrong boat when the boat ahead tacks.** AS, clear ahead and to leeward of BP
   on port, tacks; BP, faster, hits her while she is still turning. The Case: AS broke 13 (and 15). The engine: BP, under 15. In
   src/rules/pairs.ts the grace is given whenever right of way passes and the boat that had been keeping clear under 12 is the one
   that now has it (`rec.rule === '12' && rec.kc === newRow.id`); here BP stays the keep-clear boat but under 13, and the condition
   still fires for the change itself. Rule 15 is for a boat that *acquires* right of way, not for the boat whose own action (AS's
   tack) changed it. A fix: only when the new rule is 11 (a leeward overlap from astern), `&& r.rule === '11'`. Test: Case 27.
5. **Fixed.** **Case 53 (rule 15): a leeward boat bearing away to give the windward boat its rule 15 time is called for a swerve.** L overlaps a
   near-stationary W to leeward from astern and bears away at once to give W room. The Case: no breach. The engine: L, under 15
   (kind 'swerve': it reads her bearing away as the right-of-way boat forced to swerve). During the grace the boat that gets right of
   way and changes course *away* from the other is complying with 15, not a victim of the other's breach. A fix: in the grace window,
   don't count a turn away by the boat that gained right of way as a forced swerve. Test: Case 53.
6. **Fixed.** **Cases 101 and 35 (rule 20.2(c)): after "You tack" the engine makes the boat that replied keep clear under 20.** A, hailing for
   room to tack, is told "You tack"; she tacks onto port; B is on starboard. The Case: right of way doesn't pass with the room; A, on
   port, keeps clear under 10, and B must only give her room to tack and keep clear. The engine (src/rules/rightOfWay.ts) returns B
   as the keep-clear boat, `rule: '20'`, from the reply onward. A fix: after "You tack" B owes A room (a room obligation, like 18
   or 19), not right of way; once A has tacked and is clear of B, rule 10 governs. Test: Case 101.
   The fix: right of way follows the basic rules after "You tack"; the room is judged at an incident (src/rules/pairs.ts):
   contact while the hailing boat is still tacking, or within rule 15's few seconds after (her time to bear away round the
   other's stern), or after the replying boat turned toward her, is the replying boat's breach of 20.2(c); after that it is
   the hailing boat's, under 10 (or 12, or 13).
