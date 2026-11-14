# Wrecks: the design (agreed 14 Nov 2026; built 14 Nov 2026, section 8)

The owner, 13 Nov 2026: "we need to work through the broader logic and plan for wrecks. I don't know yet."

**Today:**
- Contact with Fort Mason's pier piles stops her dead, with one line: "Set onto the piles of Fort Mason's Pier N: in real life, likely the end of your boat." (`boat/physics.ts onPiles`). This happens when she's set onto them with no steerage way (under 0.5 m/s through the water, motor off), or swept sideways onto them.
- A hard bow-first hit is a bump, as on any pier.
- Nothing is logged and the outing goes on.

Below are the questions, each with a suggestion to react to.

## 1. What counts as a wreck

Today the sim has these kinds of contact; each could have its own threshold:

| Contact | Today | Suggestion |
|---|---|---|
| Fort Mason's piles (set in under the deck) | stop and say so | **wreck**: the rig comes down on the deck's edge, the hull's ground on concrete and rebar |
| A ship | a toast: "In real life that ends your day, or worse" | **wreck** at any speed |
| A seawall, breakwater rock or pier face, bow first | bump | **damage** above a speed (see 2); a wreck only well above it |
| Grounding on mud or sand | "Aground!" | no damage; stuck until the tide or a kedge (later, with 8k's anchor) |
| Grounding on rock (charted rocks, Blossom Rock, the Gate's ledges) | as aground | **damage**, a wreck at speed |
| Another Folkboat | a rules incident | **damage** by the energy of the collision. RRS 44.1(b): a boat that causes serious damage must retire. |
| A dock or finger, docking | fender and lines (docking) | a "hard bump" note only |

## 2. How hard is "damage"

- A simple measure is her kinetic energy into the thing she hit, ½ m v².
  - At 2.4 t, 0.5 m/s is about 300 J.
  - 2 m/s (4 kt) is about 4.8 kJ.
  - 3 m/s (6 kt) is about 11 kJ.
- **NOT SOURCED:** the speed at which a wooden or GRP Folkboat's hull is holed on concrete or rock. The docking research found no figure. Survey reports or insurers' claim data might give one.
- Until sourced, suggested ESTIMATES:
  - under 0.5 m/s: a scrape;
  - 0.5–1.5 m/s: damage;
  - above 1.5 m/s on concrete, rock or a ship: a wreck.

## 3. What damage does to her

From lightest to worst:
- **Cosmetic:** a scrape, kept on the boat's record. The Yacht Club's boat page could show "repairs".
- **Taking water:** she settles over time. Pump, or head for the nearest dock. Her handling changes with the weight.
- **Rig damage:** the main or jib can't be set, or the mast comes down.
- **Wreck:** the outing ends there.

## 4. How it ends

- **Racing:**
  - She retires (RET, RRS A5.1).
  - If she caused serious damage to another boat, she must retire (RRS 44.1(b)).
  - In the season, that's RET, scored per A5 as today.
- **Towed:** a tow (TowBoatUS or Sea Tow on the Bay) brings her home, and the outing ends with "towed in". It's optional, a cost to choose against getting out under her own power.
- **Wrecked:** the outing ends with a short statement (where, how) and no replay of the impact. Her logbook keeps it: "Wrecked under Fort Mason's Pier 3".

## 5. The boat afterwards (the community side)

The suggestion is the lightest version: the boat is "laid up for repairs" for some number of real days, or until you mark her repaired. Meanwhile you sail another boat of yours or a club boat. Insurance, costs and yard bills are left out unless the owner wants them.

## 6. Questions for the owner

1. Which of the contacts in 1 should be wrecks, which damage, and which just a note?
2. Should a wreck end the outing, or let you carry on, marked as wrecked?
3. Are towing and repairs worth having, and should repairs take real days?
4. Should a wreck in a season race count only as RET, or carry more?
5. Should the AI boats ever be wrecked, or only you?

## 7. The owner's answers (14 Nov 2026, through the Coordinator)

1. **What counts:** the table in section 1 as it stands. The damage cutoffs of 0.5 and 1.5 m/s stay, marked as ESTIMATES until sourced.
2. **How it ends:** a wreck ends the outing with a short statement of where and how, and it goes in her logbook. An option lets you continue instead, with her marked as wrecked.
3. **Towing and repairs** (left to the Coordinator):
   - Towing: yes, optional. It ends the outing as "towed in".
   - Repairs: she's laid up for a few real days. No money.
4. **Season scoring:** a wreck in a season race is RET only. Not answered by the owner; the Coordinator's call for now.
5. **Who can be wrecked:** only your boat, not the AI boats. Not answered by the owner; the Coordinator's call for now.

## 8. As built (14 Nov 2026)

**Grading a blow.** The shared measure, src/boat/damage.ts (with Rules), grades every contact.
- Energy: ½·μ·v², from the contact point's speed into the face, along the face's outward normal, her turn included (boat/physics.ts `closingAt`). A glancing touch closes slowly.
- Mass: her displacement with her crew.
- The bands are ESTIMATES: 0.5 and 1.5 m/s. No published data was found; World Sailing Case 19 and US Sailing Q&A 115 give the meaning of "damage" and "serious damage".

**What she hit:**
- Fort Mason's piles;
- a pier, wharf, breakwater or seawall, as concrete;
- a floating dock, a scrape at most;
- the open shore, as mud and sand for now: no damage. Which stretches are seawall, riprap or beach isn't in the sim's data yet, nor are the charted rocks.

**Pinned on Fort Mason's piles.** Kept on them for 30 s by a set her crew can't fend off: about 0.23 m/s, a hand's 250 N against the water's drag on her beam on (ESTIMATES).
- End on for most of it: a wreck.
- Beam on: damage.

**The rest:**
- **Ships:** a wreck at any speed.
- **Who:** only your boat is wrecked or marked.
- **When it happens:** the race pauses on one line of how and where, then Go ashore, Call a tow or Carry on. Racing, she retires (RET).
- **The logbook** keeps the wreck, the tow, or the worst damage.
- **Repairs:** she's laid up 3 days after a wreck and 1 after damage (ESTIMATES), on your own clock. A laid-up boat can't be taken out, and the Yacht Club shows it.

**Still to source:**
- the shore's kinds, and the charted rocks, from the NOAA chart;
- the bands;
- the pinning numbers.
