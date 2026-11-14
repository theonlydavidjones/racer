# Commercial traffic: the Bay's rule

On San Francisco Bay, a racing boat that gets in a ship's way is protested by the race committee. If the protest is
upheld, she is disqualified, and the disqualification can't be thrown out. Owner's line in ROADMAP.md ("Next for the
rules"): "a ship's five blasts lead to a race committee protest; the boat is presumed to have impeded; if upheld, a DNE
DSQ. Built on the hearing."

## The sources

- **Inland Navigation Rules (33 CFR 83)** (eCFR, 1 Nov 2026):
  - **Rule 9(b):** "A vessel of less than 20 meters in length or a sailing vessel shall not impede the passage of a
    vessel that can safely navigate only within a narrow channel or fairway."
  - **Rule 9(d):** the ship "must use the signal prescribed in Rule 34(d) if in doubt as to the intention of the
    crossing vessel".
  - **Rule 34(d):** "at least five short and rapid blasts on the whistle".
  - **Rule 8(f)(i):** a vessel required not to impede "shall … take early action to allow sufficient sea room for the
    safe passage of the other vessel".
- **Richmond YC 2025 Intraclub SIs, clause 16**
  (regattanetwork.com/clubmgmt/regatta_uploads/29818/2025IntraclubSIsv21.pdf):
  - "Compliance with RRS 60-63 will not be required".
  - "A violation of Rule 9 may not be exonerated by a Turns or Scoring penalty".
  - A complaint from a ship "that has sounded five blasts" brings "an automatic protest by the Race Committee if the
    captain, bar pilot or Coast Guard identifies an offending boat by sail number".
  - "a presumption shall be created at the protest hearing that the protested yacht(s) has (have) violated Rule 9 and
    the protested yacht(s) shall have the burden of proving that it (they) did not impede the progress of the ship."
- **2025 Sunset Series and 2025–26 Chili Midwinters SIs, "Safety" 1:** "A DSQ for a safety violation shall be
  considered as disqualification not excludable (DNE)".
- **YRA Appeal 08-02** (yra.org/appeals/docs/Appeal_2008-02.pdf, Rolex Big Boat Series 2008):
  - The committee's own Rule 9 protest is valid. A competitor's is not, because an SI can't change Part 2 (RRS 86.1).
  - Ignoring the committee's hail "triggers a protest and a hearing, but does NOT cause an automatic DSQ".
  - The boat was reinstated because no facts were found showing she impeded the ship.
- **RRS 2025–2028:**
  - **A10:** "DNE Disqualification that is not excludable".
  - **90.3(b):** "any score that is a Disqualification Not Excludable (DNE) shall be included in a boat's series
    score".

## As built

- **The signal** (sim/world.ts `dangerSignals`):
  - A moving ship sounds five blasts at any boat whose closest approach over the next `SHIP_LOOK` (40 s) comes inside
    `shipRoom`: half the ship's length plus 60 m, measured from her middle.
  - It's one signal per ship, and it sounds again only after 45 s. Every boat inside the room is named.
  - You hear it to about 2 km.
- **The protest:** in a club race judged by protests, each boat named while racing gets one race committee protest per
  encounter (`COMMITTEE`, rule '9').
- **The facts** (`committeeWatch`): the protest records her closest approach to the ship from the signal on. It stops
  recording when the ship has passed, after two minutes, or when the boat finishes or retires.
- **The hearing** (rules/hearing.ts `shipHearing`):
  - Not decided while the ship is still passing.
  - She is presumed to have impeded the ship. The record rebuts that if she kept outside the room the ship wanted
    (Rule 8(f)'s "sufficient sea room"). Then the protest is dismissed.
  - Otherwise she scores DNE. Retiring doesn't answer it.
- **Scoring:** a DNE scores as a disqualification (A5.2: one more than the boats entered). The season's throwout skips
  it (90.3(b)).
- **Under umpiring** (practice, the drills): the signal and its warning only, with no protest.
- **The AI boats** look the same 40 s ahead to keep clear. They steer for the ship's stern a little before she would
  doubt them.

## Modeling choices (no number in the sources)

- `SHIP_LOOK` 40 s and the room (half her length plus 60 m) are the sim's. Rule 8(f) gives no distance, and no Bay SI or
  VTS text found gives one. The only distance in a racing SI is San Diego's "two of her ship lengths" (Cortez Racing
  Association), which isn't the Bay's.
- The committee always protests. In real life it acts only on a report naming the boat. Here the ship always names her.

## Left for later

- Ferries and the Coast Guard boat sound the signal too. Whether a ferry counts as a vessel that "can safely navigate
  only within a narrow channel" (Rule 9) is a question to check against the 33 CFR 165.1181 Regulated Navigation Area.
- The moving security zone around tankers, cruise ships and other High Value Assets (33 CFR 165.1183: 500 yards).
- The engine allowed to clear a channel (RRS 42.3(i), RYC SI 1.5) with its scoring penalty.
