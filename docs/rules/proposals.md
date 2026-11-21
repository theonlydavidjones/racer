# Three judging questions for the owner (21 Nov 2026)

These come out of the rules coverage check (`docs/rules/coverage.md`). Each is a change to how races are judged, so
nothing is built yet.

The text is the World Sailing 2025–2028 RRS PDF with its changes and corrections (sailing.org, April 2026 build). The
Cases marked "via Perry" are quoted from Dave Perry's *Understanding the Racing Rules of Sailing through 2028* (US
Sailing). The Case Book itself wasn't reachable.

## 1. Rule 14 against a right-of-way boat

**What the rules say**
- **Rule 14:** "If reasonably possible, a boat shall (a) avoid contact with another boat…". A right-of-way boat "need not act to avoid contact until it is clear that the other boat is not keeping clear".
- **43.1(c):** a right-of-way boat (or one in her room or mark-room) "is exonerated for breaking rule 14 if the contact does not cause damage or injury". The RRS don't define damage. Case 19 reads it as harm "impairing the value or usefulness" of the boat.

**What a protest committee does**
- **Case 87 (via Perry):** a port boat hit a starboard boat amidships, causing considerable damage. The starboard boat did not break 14. It became clear too late for her to avoid the port boat.
- **Case 123 (via Perry, not read):** a starboard boat that holds her course into a port boat, with time to avoid her and with damage, breaks 14 as well as the port boat breaking 10. Both are penalized.

**How the sim judges it now**
- A forced swerve or contact is always the keep-clear boat's foul.
- The right-of-way boat is never called under 14.

**Proposal**
- After contact between boats, call 14 on the right-of-way boat too, only when all three hold:
  - **Damage:** `src/boat/damage.ts` grades the blow `damage` or worse. That grade already exists for 43.1(c), agreed with Marinas on 14 Nov.
  - **It became clear:** it was clear she wasn't being kept clear of. Measure from the moment the keep-clear boat's closest approach, held on its course, falls inside `KEEP_CLEAR_GAP`.
  - **Time to act:** at least about 2 s passed from that moment to contact, a Folkboat's time to answer the helm. That is an estimate; Case 87's "so brief that it was impossible" is the other side.
- Both boats take turns. Under 44.1(b), serious damage means retiring instead.

**Effect on the AI's fouls**
- The AI right-of-way boat already swerves to avoid contact (`ai.ts` `forced14`).
- New calls only where a contact does damage. How often that happens in a fleet race is unmeasured: a fouls-pair run with a damage count would say.
- It would also catch the user who holds a "Starboard!" course into a crash for the call.

**Risk of false calls**
- The "clear" moment is a judgment, and setting it too early penalizes a right-of-way boat that held her course as she may.
- The damage gate keeps every no-damage touch exonerated, as 43.1(c) says. That keeps the call rare.
- Needs fouls-pair and a physics review.

## 2. Rule 28, sailing the course

**What the rules say**
- **28.1** "A boat shall sail the course"; **28.2** she may correct errors before she finishes.
- **The string test** is in the Definition "Sail the Course".
- **A5.1:** when a race committee "determines that a boat did not sail the course … it shall score the boat accordingly without a hearing". That is NSC (A10). A5.2 scores it one more than the boats entered.
- **Protests:** 60.1 lets "a boat or committee" protest. New in 2025, 60.2(b)(2) only asks that a boat be informed "at the first reasonable opportunity" for "an error in sailing the course".

**What a race committee does**
- If its mark boats saw a boat miss or go the wrong side of a mark, it scores NSC without a hearing.
- A boat may ask for redress (61.4(b)(1)) if she did sail the course.

**How the sim judges it now**
- In practice it already enforces 28. A boat can't finish without rounding every mark in order on the required side: the leg only advances on a correct rounding (`world.ts` ~1640–1672).
- A boat that misses a mark is told so, and must go back, as 28.2 allows. If she never does, she never finishes. That's a DNF, where a real committee would score NSC.

**Proposal**
- Keep the engine as it is: it's the string test, applied as she sails.
- Change only the score. A boat that crosses the finishing line with marks unrounded is scored NSC (A5.1, A10) rather than racing on. The results say "NSC: didn't round Mark 6 (Rule 28.1)".
- Leave protests out of it: under A5.1 the committee scores it without a hearing.

**Effect on the AI's fouls**
- None. The AI rounds every mark, so this only changes a user who sails to the line without rounding.

**Risk of false calls**
- An island rounding's "anywhere off its shore" test (`md < 250` m) and the 75° angle window could, in a rare track, miss a real rounding. NSC would then cost a race where today she'd sail back.
- Needs a test of each course's roundings before it ships.

## 3. Rules 22 and 24

**What the rules say**
- **There is no rule 24 in 2025–2028:** Section D of Part 2 has 21, 22 and 23 only.
- **Rule 22:** "If possible, a boat shall avoid a boat that is capsized or has not regained control after capsizing, is anchored or aground, or is trying to help a person or vessel in danger." A boat is capsized when her masthead is in the water.

**How the sim judges it now**
- Not at all.
- Boats can go aground (`world.ts`, the shore and islands). A boat that's wrecked is fixed in place, and other boats treat her as an obstruction.
- A boat can't capsize: a Folkboat is a keelboat. Anchoring and rescuing aren't modeled for AI boats. The crew-overboard lesson is the user alone.

**Proposal**
- **Rule 22:** call it on a boat that hits a boat aground (`wrecked`, or held on the shore below steerage way), when she could have avoided her.
  - It's a Part 2 rule, so turns apply (44.1).
  - It's the same test as 14's "reasonably possible": she was in view and there was time to steer clear.
  - Capsize, anchoring and rescue wait until they're modeled.
- **Rule 24:** drop it from the lists. It doesn't exist in this edition.

**Effect on the AI's fouls**
- A grounded boat is rare in a race, so few calls.
- The AI should already steer round a fixed boat as an obstruction. Check that it does before calling it.

**Risk of false calls**
- Low. The boat aground can't move, so "could she have avoided her" is a plain look-ahead.
- The one risk is a boat pinned on the shore by the current, which may still count as aground.
