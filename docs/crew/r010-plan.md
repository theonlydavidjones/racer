# r010: the tack's choreography (Tue 24 Nov, Crew Figures)

One PR, the Coordinator's ruling of 21 Nov 2026: r010's arms through bodies in a tack, the helm's crossing (crew audit
item 3) and the crew's crossing after a tack (crew audit item 4), together.

## Found so far (the r010 check, 20 Nov; the crew audit, 21 Nov, docs/crew/crew-audit.md on crew-figures-audit)

- **Arms in a tack:**
  - The main hand's hands stay on the mainsheet's tail in front of the thwart while they cross over it, arms through their own chest. This is `ready()` and the tack's `main` role.
  - The helm's stick hand is chosen by the physics' side, not the nearer shoulder (`helmCrossing`).
  - At 8 kt, the jib hand's arms go through the main hand's chest as the main hand crosses in front of them.
  - Stills: r010-arms-check, docs/crew-pose-figures/r010/.
- **The helm's crossing (item 3):** about 1 s behind the physics' weight in every tack.
- **The crew's crossing after a tack (item 4):**
  - The jib hand kept the tack's `jib` role (kneeling at the new leeward winch) until arrived, frozen 1.1–1.3 s up to 1.8 m from their weight.
  - Ending the role once the tack is over and their weight is past the middle (this branch) cuts it to 0.42 s, the turn about.
  - That doesn't fix what's seen. The walk across after it is upright, hips 1.1–1.16 m, nearly vertical under the boom; on main the same, only later.
  - Released during the tack as well, both crossed at once, through each other mid-cockpit.

## To build

1. **The physics' weight is the truth.** Check the jib hand's place in a tack against how a real crew tacks: where the jib hand is while the old sheet is let go and the new one sheeted in, and when they cross. Make the drawing's `jib` role and crewPhys agree. Today the drawing kneels them at the new leeward winch while the physics already has them going to windward.
2. **Crossing crouched under the boom:** low, hands on the boat, not stood up.
3. **Staggered:** the two crew never cross through each other. Order them by the physics' crossing.
4. **Arms clear of every body through the tack.** The new test fails first: 8/14/20 kt, both tacks, one and two crew, every frame, crewarms' capsules.
5. **The helm:** the stick in the hand on its shoulder's side, and the crossing paced to the physics.
6. **Stills** before and after from both sides on both tacks; the crew suite and test:fast.

## This branch (crew-audit-4-partial, off 5de4d67c)

`syncCrew` ends the tack role once the physics has the weight across the middle after the tack's end. The replay
`tests/fixtures/crew-tack-jibhand-12kt.json` with `replayHeldBack` keeps it to under 0.5 s still. A starting point, not
for merging alone.
