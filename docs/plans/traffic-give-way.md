# Traffic that gives way: a plan (Deep Physics, 21 Nov 2026)

A plan only: no code before Tuesday 24 Nov. For the Coordinator, and for Charts, whose routes these are (src/sim/traffic.ts).

## The problem

The sim's vessels are a pure function of the clock (traffic.ts `at`): each runs her route on schedule whatever is in
her way, so a ferry or the Bay cruise boat runs down a small boat that stands on. Since the routes' fix (Charts,
a16bb939) two nav-pier cases were run down: the Alcatraz ferry at 14 min, and the cruise boat by Pier 41 at 1.2 min
(traffic is off in those two cases for now: nav-pier-traffic-off, e0c66643). Real ferries are bound by the rules to
keep out of a sailing boat's way. Only the deep-draft ships in the lanes aren't.

## What the rules say (all read in the text, eCFR 2025-01-01 and Coast Pilot 7, 15 Nov 2026 edition)

- **Which rules.** Inside the line from Point Bonita Light through Mile Rocks Light to the shore (33 CFR 80.1142),
  the Inland Navigation Rules apply (33 CFR 80.01, 83.01), not the 72 COLREGS. The whole Central Bay is inside.
- **Who keeps clear of whom.**
  - Rule 18(a)(iv), 33 CFR 83.18: "A power-driven vessel underway shall keep out of the way of … a sailing vessel",
    except where Rules 9, 10 and 13 require otherwise. So the Sausalito and Alcatraz ferries, the cruise boats and the
    Coast Guard boat keep out of the way of a boat under sail. (Rule 18(d), constrained by draft, is reserved in the
    Inland Rules.)
  - Rule 3(c): a sailing vessel is under sail "provided that propelling machinery, if fitted, is not being used". With
    her outboard running she's power-driven. Then Rule 14 (meeting head-on: each alters to starboard) and Rule 15
    (crossing: the vessel with the other on her starboard side keeps out of the way) apply between her and a ferry.
  - Rule 13: "any vessel overtaking any other shall keep out of the way of the vessel being overtaken". This covers a
    sailing boat overtaking a slow or stopped vessel. Overtaking means coming up from more than 22.5° abaft her beam.
  - Rule 9(b): "a vessel of less than 20 meters in length or a sailing vessel shall not impede the passage of a vessel
    that can safely navigate only within a narrow channel or fairway". Coast Pilot 7 ch. 7 ("Enforcement of
    Navigation Rules in San Francisco Bay") designates all the traffic lanes, separation zones and precautionary areas
    of the RNA (33 CFR 165.1181) as narrow channels or fairways, the Central Bay's among them. That covers the
    container ship and the tanker: they don't alter, as now (world.ts's warning and five blasts stay). A ferry isn't
    a vessel that can navigate only in a channel, so 9(b) doesn't free her from 18(a). The Rule 9(a)(ii) downbound
    provision doesn't apply here: 33 CFR 89.25 doesn't list the Bay.
- **How she gives way.**
  - Rule 16: "take early and substantial action to keep well clear".
  - Rule 8(b): "large enough to be readily apparent … a succession of small alterations … should be avoided".
  - Rule 8(c): course alone, "made in good time, is substantial and does not result in another close-quarters
    situation".
  - Rule 8(d): "passing at a safe distance".
  - Rule 8(e): slacken speed, or stop.
  - No rule or guide found gives a number, an angle or a passing distance. The often-quoted "at least 30°" wasn't
    found in anything readable from here (MAIB, Cockcroft & Lameijer and the Harbor Safety Plan are blocked). So the
    sim's figures below are design choices, labeled so.
- **The stand-on boat.**
  - Rule 17(a)(i): she keeps her course and speed.
  - 17(a)(ii): she may act once it's apparent the give-way vessel isn't.
  - 17(b): she must act when the give-way vessel alone can't avoid a collision.
  - Rule 34(d): the five short blasts are the doubt signal. The sim already sounds it.
- **San Francisco practice.**
  - Coast Pilot 7 (Ferries; the Ferry Traffic Routing Protocol): ferries "may maneuver quickly when approaching and
    departing the dock", and they often back away from it.
  - Between the city front, Alcatraz and Sausalito/Tiburon they "do not run along charted ferry routes".
  - The Harbor Safety Committee "recommends that recreational and fishing vessels keep a close lookout when near
    ferry routes and avoid ferry routes whenever possible". That's advice to small craft, not a change of the rules.
  - A ferry about her berth is maneuvering, and in practice can't be expected to give way.
- **The racing rules.** Between a boat racing and a vessel that isn't, the RRS Part 2 preamble hands it to the
  government right-of-way rules, here the Inland Rules. That's what the log row now says (r026-keys 51dede5a).
  "The Collision Regulations" in that row is the sailor's name for them; inside the Gate the exact name is the Inland
  Navigation Rules. That's a copy choice for UI & Copy if wanted, not a physics change.

## What changes

1. **The give-way vessels**: the Sausalito and Alcatraz ferries, the two cruise boats and the Coast Guard boat.
   - Each looks, once a second, for any boat it's meeting where Rule 18(a) puts the vessel as the give-way one. The
     boat is under sail, isn't overtaking her (Rule 13), and isn't about her own berth.
   - A meeting is a CPA under PASS_M within LOOK_S.
   - Under motor the boat is power-driven, and Rules 14 and 15 decide by bearing.
   - Then the vessel takes one substantial action, not a series:
     - an alteration to starboard of TURN_DEG, or to pass astern of the boat, whichever gives the larger CPA and
       keeps her off land and the other boats;
     - failing either, she slows (Rule 8(e)) to SLOW_KT.
   - She holds that until the CPA has opened and the boat is abaft her beam, then rejoins her route at the route's
     own speed (no catching up: the schedule slips, as a real ferry's does).
   - Near her berth (BERTH_M of the route's end) and for the first and last minute of a leg she stands on. The rules
     still bind her there, but a maneuvering ferry can't give way, and the boat must keep clear by seamanship
     (Rule 2).
2. **The ships in the lanes** (container, tanker): unchanged. Rule 9(b) as above.
3. **The AI racers.** Today `keepClearOfShips` sends every AI boat astern of every vessel within 900 m. With the
   ferries giving way, that's prudence, not the rules: two choices for the owner (below).
4. **The stand-on boat's warning.**
   - The ferry and cruise-boat log row and the five blasts stay.
   - The blasts sound only when the vessel is still standing on and the CPA is under the close distance. A vessel
     giving way doesn't blow the doubt signal at a boat holding her course.

The figures are ESTIMATES and design choices (no published number was found; Rules 8 and 16 are qualitative):

| Name | Proposed | Why |
|---|---:|---|
| PASS_M | 150 m for the ferries and cruise boats, 60 m for the Coast Guard boat | a few of her own lengths: room for her wake to spread before it reaches the boat |
| LOOK_S | 240 s (ferries at 17 kt: about 2 km) | "early": a ferry seen 2 km off, as a lookout on the boat would see her |
| TURN_DEG | 35° | "readily apparent" by eye; more than a 10° alteration, which an IMO case (secondhand) called too small |
| SLOW_KT | 5 kt | steerage way for a 40–50 m vessel; she keeps way on |
| BERTH_M | 300 m | a berth's approach and turn, as the Coast Pilot describes the ferries' |

## How (the cost and the shape)

- **State.**
  - A vessel's give-way state is its offset from the route: an extra heading that decays back to zero, and the
    schedule's slip in seconds. It's integrated once a second.
  - It lives on a World field, not on `Traffic`: sync.ts walks `traffic` only when it's replaced (BY_IDENTITY), so
    state there would never reach the page's mirror. `w.vessels` is already sent every frame, so the drawing needs
    nothing new.
- **Determinism.** The state is a function of the boats' states, which are the race's own, so replays and the mirror
  check (sync.ts checkOf) hold. A test sails the same seed twice and compares the vessels to the bit.
- **Wakes.** `wakeAt` looks back along `at()`. Once a vessel can leave her route, it looks back along her own
  recorded track instead: a ring of her positions every 4 s over 240 s (60 per vessel, 7 vessels). The Kelvin arms
  then follow where she really went.
- **The navigator's AIS line** (navigator.ts 492) predicts from the schedule. That stays: AIS shows where she's
  bound, and the schedule's slip is minutes.
- **World.step.**
  - No new line: the one that sets `this.vessels` becomes one call to a method that does both (CAPACITY §8a).
  - The cheap test: no boat within 2.5 km of a moving give-way vessel, so nothing to do.
  - Its work is at most 5 vessels × 20 boats CPA tests once a second. Gate: `perf-pair --ai` (it changes the race),
    and `fouls-pair` (the AI's behavior near ferries changes).

## Tests (written first)

1. A ferry crossing ahead of a boat close-hauled on starboard, CPA 0 on the schedule: she alters, the CPA is at least
   PASS_M, and the boat holds her course and is never run down.
2. The same with the boat motoring, the ferry on her starboard bow (Rule 15): the boat must give way. The ferry
   stands on, and the warning and the five blasts come if the boat holds on.
3. Head-on, both power-driven (Rule 14): both alter to starboard, or the ferry alone if the boat doesn't.
4. The boat overtaking the cruise boat slowed at Pier 41's approach (Rule 13): the vessel stands on.
5. Within BERTH_M of a ferry's berth: she stands on.
6. A container ship in the lane: unchanged, five blasts and all (the existing ship tests).
7. A fleet of 20 in her way: she gets through on one action or by slowing, never stopping mid-Bay for more than a
   few minutes, and rejoins her route.
8. Determinism: the same seed twice gives the same vessels to the bit; the mirror check passes under `?simguard`.
9. Acceptance: nav-pier's two cases sail with traffic on again ("running along a pier's face", "in irons by a pier
   head"), with every bound as it is.

## Questions for the owner

1. **The rules or the habit?** The Inland Rules make the ferries give way to a boat under sail. San Francisco's
   Harbor Safety Committee asks small craft to avoid the ferry routes and keep a lookout, and many sailors here keep
   clear of the high-speed ferries anyway. Should the ferries give way as the rules say (this plan), or should the sim
   teach "keep clear of the ferries" with them standing on?
2. **The AI racers.** Should they stand on as the rules allow (Rule 17(a)), acting only when the ferry hasn't by a
   time, or keep clear as now, by prudence?
3. **The figures.** PASS_M, TURN_DEG and the rest are design choices. Any figure the owner has seen on the Bay (how
   far off a ferry passes, how early she turns) replaces them.

## Sources

- 33 CFR 80.01, 80.1142; 33 CFR 83 (Inland Navigation Rules: Rules 2, 3, 8, 9, 13–18, 34); 33 CFR 89.25; 33 CFR 161
  (VTS San Francisco: 161.50, 161.16, 161.11); 33 CFR 165.1181 (the San Francisco Bay RNA). eCFR, version
  2025-01-01, https://www.ecfr.gov/current/title-33.
- NOAA, United States Coast Pilot 7, chapter 7 (San Francisco Bay), the 15 Nov 2026 edition: "Enforcement of
  Navigation Rules in San Francisco Bay", "Ferries", "Ferry Traffic Routing Protocol".
  https://nauticalcharts.noaa.gov/publications/coast-pilot/files/cp7/CPB7_C07_WEB.pdf
- RRS 2025–2028, Part 2 preamble.
- Not reachable from here: the San Francisco Bay Harbor Safety Plan (sfmx.org), the VTS San Francisco User Manual
  (navcen.uscg.gov), MAIB reports, and Cockcroft & Lameijer, *A Guide to the Collision Avoidance Rules*.
