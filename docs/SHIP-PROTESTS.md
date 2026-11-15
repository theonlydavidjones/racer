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

- **The ship's way** (sim/traffic.ts `entersWay`):
  - The water a ship needs clear, measured from her hull: from her stern to two of her lengths ahead of her bow
    (`WAY_AHEAD`), and her half-beam plus 50 m to either side (`WAY_ABEAM`).
  - It's laid along her route as she'll sail it (`onTrack`), so it bends with her at a waypoint.
  - It slides along the route with her: a boat's predicted track is sampled against it every 2 s (4 s beyond a minute).
  - Nothing abaft the stern: a boat astern of her is no hindrance.
- **The signal** (sim/world.ts `dangerSignals`):
  - A moving vessel sounds five blasts for any boat that would come into her way within `SHIP_LOOK` (40 s), as both
    hold on.
  - It's one signal for all the boats it's for. She sounds again for another boat after 10 s, or for the same boat
    after 45 s.
  - It's heard to the whistle's Annex III range for her length.
- **The protest:** only a ship in the deep-water channel (the container ship and the tanker) is one that "can safely
  navigate only within a narrow channel or fairway". In a club race judged by protests, each boat she sounds for while
  racing gets one race committee protest per encounter (`COMMITTEE`, rule '9'). The ferries, the tour boats and the
  Coast Guard boat sound the signal without a protest: they are power-driven vessels with room to maneuver, and the
  14 m Coast Guard boat is herself a vessel "of less than 20 meters" under Rule 9(b).
- **The facts** (`committeeWatch`): the protest records whether the boat was ever in the ship's way from the signal
  until the ship had passed her (the boat abaft her stern), and her closest approach to the hull. Retiring or finishing
  doesn't stop the record: Rule 9 binds a boat racing or not.
- **The hearing** (rules/hearing.ts `shipHearing`):
  - Not decided while the ship is still passing.
  - She is presumed to have impeded the ship. The record rebuts that if she was never in the ship's way; then the
    protest is dismissed.
  - Otherwise she scores DNE. Retiring doesn't answer it.
  - It is a hearing of its own, apart from any boat's protest at the same moment.
- **Scoring:** a DNE scores as a disqualification (A5.2: one more than the boats entered). The season's throwout skips
  it (90.3(b)).
- **Under umpiring** (practice, the drills): the signal and its warning only, with no protest.
- **The AI boats** (`keepClearOfShips`):
  - Each watches every vessel's way 120 s ahead.
  - Coming into it, she steers square off the ship's track (at that point of the route) to the side she's on.
  - She holds that until the ship's stern has passed her, or she's far enough off that, sailing straight back at a
    Folkboat's hull speed, she couldn't be in the way before the stern goes by. The latch is on where she is, not on
    her heading, so it doesn't flicker.
  - Penalty turns wait while she's keeping clear (44.2: "after getting well clear"; a ship's way isn't clear water).
  - In the test (tests/sim-ai.test.ts), a container ship steams through a seven-boat fleet on the beat from each of
    four directions. No AI boat is in her way, and none decides to keep clear more than twice.

## Modeling choices (no number in the sources)

- **The way's size** (two lengths ahead, 50 m abeam) and `SHIP_LOOK` (40 s) are the sim's. Rule 8(f) gives no
  distance, and no Bay SI or VTS text found gives one. The only distance in a racing SI is San Diego's "do not cross the
  bow of any ship in the channel within two of her ship lengths" (Cortez Racing Association), which the way's length
  follows.
- **The rule is a composite of two Bay SIs.** The five-blast presumption is Richmond YC's, which names no penalty. The
  DNE is from the Sunset Series and Midwinters SIs, which have no presumption and are limited to vessels confined to a
  channel. ROADMAP has the two together. Which SI the Seaweed Soup (GGYC) sails under for ships wasn't found.
- **The committee always protests.** In real life it acts only on a report from the ship, the pilot or the Coast Guard
  naming the boat. Here the ship always names her.

## Left for later

- The moving security zone around tankers, cruise ships and other High Value Assets (33 CFR 165.1183: 500 yards).
- The engine allowed to clear a channel (RRS 42.3(i), RYC SI 1.5) with its scoring penalty.
- Whether the Regulated Navigation Area's traffic lanes (33 CFR 165.1181) make Rule 9 or 10(j) apply to the ferries on
  their routes.
- The logbook records a DNE as "Disqualified" (code DSQ).
