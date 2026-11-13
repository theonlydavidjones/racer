# Build plan

**The mission** (the owner's words, 13 November 2026; in full at the top of CLAUDE.md): a true-to-life sailing simulator
that helps people learn to sail, sail better and race better, as good as actually sailing to the maximum reasonable
extent. Racing (tactics, seamanship, helmsmanship, teamwork, knowing the conditions and your boat) and cruising (you and
your crew against yourselves, and the beauty and magic of sailing), on San Francisco Bay, for its complexity,
variability and staggering beauty, in a Folkboat, the purest sailing boat a normal person can own. "If you can sail the
Bay, you can sail anywhere; if you can sail a Folkboat, you can sail anything." Every item below is weighed against it.

**The vision roadmap** (adopted by the owner, 13 November): docs/VISION-ROADMAP.md, near, middle and long term. Its
seven "dialed in" criteria are the bar for physics and racing. On its questions: the owner will try to get protest
records (Skipper Model researches meanwhile); crew timings come from published sources until next season.

**Standing rule for the screen** (owner, 13 November): "We should be extremely conservative about allowing new buttons
and distractions on the game surface." New controls go inside existing elements (the inset map, the sail band, the
menus, the Keys), not as new buttons on the screen. Every item below that adds a control is held to this.

**The order of work** (owner, 13 November, also in CLAUDE.md): physics and racing first. "If it's not real and accurate,
then it's not a simulator." Later, once the physics and racing are dialed in (the owner loves both):
- **The Bay's beauty:** light, fog pouring through the Gate, sunsets, the skyline, the bridges.
  Scenery for it (owner, 13 November; later, with the Bay's beauty):
  - **Oracle Park** (6–10 h): the ballpark on the shore by McCovey Cove, with its pennants waving during games, the
    lights on for night games and concerts, the scoreboard lit during games, and kayakers in the cove waiting for splash
    hits. Driven by the Giants' real home schedule and the park's events for the sim's date, where it can be sourced.
  - **Alcatraz, properly built out** (6–10 h): the cellhouse, the lighthouse, the water tower, the guardhouse and
    dock, the ruins, at real scale and in significant detail.
  - **The Palace of Fine Arts, refined** (2–4 h).
- **A robust open-Bay cruising mode:** passages with goals; seamanship challenges such as anchoring, docking and
  reefing (reefing still waits on a Folkboat source); a cruising log.

- ~~**West Harbor**~~ (done: docks, slips, sailing in and out, your boats' slips) ~~and Gashouse Cove, South Beach and the Corinthian~~ (done). ~~Horseshoe Bay~~ (done, v81: Travis Marina at Fort Baker, 79 slips on docks A–C (the sim's own letters), the breakwater from NOAA ENC, docks on white piles, shelter from the harbor walls). Noticed there, later (polish): a coarse 50 m terrain strip about 20 m off the breakwater's outer face; the Golden Gate Bridge's blocky north anchorage; chunky generic moored boats in the marinas (with "nicer moored boats"). Later: the other Bay marinas (Sausalito, Richmond, Berkeley, Alameda); ~~the real slip numbers~~ (done: South Beach's docks and slips, and West Harbor's and Gashouse Cove's slip numbers and Docks E, F, G, from the harbors' maps, the order along a dock inferred where the maps don't show it; the Corinthian's A dock is real, its others and its numbers aren't published); ~~boats in neighboring slips drawn as real boats~~ (done: lofted hulls, cabins, rigs and covers, a share of powerboats; their proportions and the power share are estimates still to check against sources); docking lines and an outboard for getting in and out.
- **The beat angle in chop jumps** (for Deep Physics; from the cross-World leak's review): speedInChop × cos(twa) has
  steps where driveCurveFor (boat/driveCurve.ts) rounds the angle to 5° bins and the wind to whole knots, unblended,
  so the VMG curve has two near-equal peaks and beatInChop's answer swings 5–7° on a 0.25 kt puff (the speed made good
  between them under 0.2%). The AI's target angle and the laylines move with it. Blend the drive curve across its
  neighboring bins, as driveCalibration already does across the wind.
- **AI boats into the harbor after an abandonment** Also, from the perf branch's checks: a boat right by the West Harbor entrance at the
  call-off can brush a breakwater's end with her side as she leaves (westerly, seed 6 of 16: 1.5 s; routeAround lets a way
  come close near its start). (for Marinas, with Deep Physics; the owner, 12 Nov 2026: later):
  after N or AP over A the AI boats now sail home and stand off the nearest racing harbor, each at her own spot with
  open water to leeward, lying to (ai.ts homeCourse). Real boats would go in: sail or motor through the entrance and
  berth in the basin, out of the breeze (lying to for an hour in 23+ kt is hard on the sails). That needs the AI boats
  given slips and the marina's way in (geo/marina.ts), as the user's boat has.
- **Sternway and leeway with sails up** (from the push-off work; for Deep Physics and the AI): physics.ts now drives a
  stopped boat astern and sets her to leeward from the wind on her bare rig (sails struck, as at the dock). In irons with
  her sails up and flogging she'd drift astern too (a knot or two in 15 kt), and slow with sails up she'd make more leeway
  (the sails' own side force: done, with leeway, Deep Physics item 7), but the AI's sailing doesn't reckon with sternway
  yet (an AI boat luffing by the committee boat drifts onto it), so with sails up she still stops dead. Also: heaveTo still clamps
  sternway; ~~the end tie's push-off doesn't allow for the wind setting her back onto the dock~~ (done: her bow's pushed off to close-hauled, away from the dock; a boat set sideways now stops against a dock or the shore instead of passing through).
- ~~**The sea inside the marinas**~~ (done, bay-east-7: the swell diffracts through each entrance by the exact gap solution, scripts/make-gap-diffraction.py, the Penney & Price problem the Shore Protection Manual draws for B/L 0.5–5; the fetch is traced finely just outside a marina as well as inside, every 2° by one, and blended between its 10 m nodes;
  swell running past an entrance bends round its breakwater head by Sommerfeld's half-plane solution; over a swell's
  spread of directions, Mitsuyasu/Goda s 75. Left out, from review: the basin's own walls reflecting the waves (Gashouse
  Cove's seawall reflects nearly all, so the real basin holds more than the bare diffraction gives, and long swell can
  set up a harbor's seiche); piers between an entrance and a slip (20 of Gashouse Cove's slips have none in sight); the
  tide's depth over the entrance (MLLW's); a curved breakwater taken straight at its head (West Harbor, facing east,
  away from the swell, gets well under a millimeter in a 2 m swell outside, where the old unsourced ×0.15 gave 3 cm)) (from review
  of the Gashouse Cove seawall; minor): (1) the swell gets in on a single ray
  through the entrance, so a strip a few meters wide just inside Gashouse Cove's entrance gets the full swell while its
  neighbors get a seventh of it; a 12 s swell (~225 m long) should diffract weakly and evenly through a 20–40 m gap, by
  sourced coefficients (Wiegel's diffraction diagrams, Shore Protection Manual) in place of the unsourced ×0.15;
  (2) the 15 fetch rays alias on the 10 m grid near an entrance (chop 0.17 → 0.04 → 0.13 m over 12 m at 315°): spread
  or smooth them; (3) at South Beach and the Corinthian, just inside the entrance has a little more chop than just outside
  (fetch 194 m against 108 m), from the open-water ray's 50 m minimum fetch (2–4 h).

What's planned, roughly in order. Done work is described in the README.

## Priorities (owner's ranking, November 2026)

**The open work, ranked** (owner, 12 November 2026, after an audit of every item against main; hours ±50%):
1. ~~P0 phase 2: the interior true to a real Folkboat~~ (done: the berths in the GRP inner molding with brown cushions,
   shelves and fiddles, floorboards, knees, a hanging locker, the forepeak opening to the rule, the keel-stepped mast).
   Next in P0: true-to-life rigging (the owner's top boat item, Rigging, begun with the mainsheet's blocks) and the
   boat review's bugs, winching and polish (P0 items 6–7).
2. ~~Finish the crew figures: the crew's stations onto the real benches~~ (done, crew-stations merged). Owner chose option 2: the benches plus the side
   deck alongside them and aft of the thwart beside the after shelf (hips 1.35–2.5 m), where crews really sit; about
   today's fore-and-aft range, shifted aft; the trim calibration re-tied, physics review done. Crew Figures, one PR
   (in progress). Follow-ups from Crew Figures: the helm's shin cuts up to 9 cm into the aft coaming as she crosses in
   a 20 kt hiking tack (around z 2.55, x 0.6; on main too): fix the crossing path, then sample every 2 cm along each
   bone in tests/crewfig.test.ts's "never pass through the boat" check (1–2 h). (Fixed in its own PR, Crew Figures.)
   ~~Next follow-up~~ (done, #126, v136; Crew Figures, 12 November; 2–3 h): the crew's legs graze 3–8 cm into the coaming while moving along
   the side deck (climbing out, passing the thwart, sitting down on the deck), mostly on the route planner from #110.
   One cause found: in render/crew.ts route(), a goal aft of the thwart isn't updated when the physics target moves
   forward of it mid-route, so the figure sits and stands at the old spot for a second or more (20 kt tack: crew 1 at
   2.245 while the physics has her at 1.65). A naive fix upsets other moves, so it's its own piece of work. Done when
   tests/crewfig.test.ts samples every figure at 0.05, not only the helm, and passes.
   Parked for the owner to choose (Crew Figures, 12 November; minor by the visual round): in a tack in 12–16 kt the two
   crew's hips pass within 0.21–0.23 m mid-cockpit for 1–1.3 s (8 and 20 kt are clean). The forward hand's deck seat
   (1.65, just aft of the jib winch) and the aft hand's climb-out point to pass the thwart (1.85) are only 0.2 m apart,
   both physical limits. Options: (1) a sit-and-swing over the thwart inside the cockpit (sit on it, legs over, step
   down onto the after shelf), properly staged; or (2) the main hand tacks the mainsheet from aft of the thwart, at the
   after shelf, so he never passes forward along the deck (a change to the tack role's station: physics and a pose).
3. ~~Crystal clarity on the crew and trim controls~~ (done, live in v134: the band with the main halyard renamed, the jib
   halyard, the Auto-trim and Pole tabs, the windex and the Hail tab, v120–v129; the chase-view layout, v129; every RRS
   2025–2028 race signal in the flag index and one-line messages with the log, v132; line colors in the boat editor and
   the committee's call-off shown clearly, v134). Owner's answers (12 November): the crew leans across from windward, as the sim has it; no tiller strip. The
   questions were: (1) on Josephine, does the crew reach
   the far side of the piano from windward (the sim leans them in, 0.2 m to windward)? (2) bring back a tiller strip
   (left out because the cursor is the tiller)? The design as agreed: **the sail controls band**, the owner's design (12 November): "toggle
   on a view of the sail controls that stretches across the bottom of the screen — maybe the bottom quarter; more if it
   needs the room". Three horizontal layers in the band, top to bottom:
   - **The piano**, "mirroring what really exists on Josephine" (the table under Full sail controls: starboard, inboard
     to outboard, vang · outhaul · jib Cunningham · the jib halyard tail; port, vang · outhaul · the main Cunningham's
     clam cleat (main Cunningham) · jib Cunningham, with the main halyard's tackle). Mock-up in progress with the UI & Experience session:
     https://claude.ai/artifact/TiHGqpmpSFh5bw7AJ6RctB: trim / ease buttons on each.
   - **The jib**: a sheet on each side, trim / ease.
   - **The main**: the mainsheet, the backstay, and "the traveler specifically I would want to move left and right
     like a real traveler" (a car you drag along a track).
   Laid out as you face forward from the helm (port on the left), each control with its auto pill, its setting, and its
   ends named. Later: the jib cars and the rig ("we can figure that out later"). A clickable mock-up goes to the owner
   before the build. 6–10 h; replaces the trim-panel review.
   **Design agreed with the owner, 12 November; handed to the Coordinator to build.** Mock-up:
   https://claude.ai/artifact/TiHGqpmpSFh5bw7AJ6RctB (source design/sail-controls-band.html on branch
   ui/sail-controls-band-mockup). A compact console at the bottom center:
   - the piano lines and jib sheets vertical (▼ pulls on);
   - the jib cars as an H: the crossbar slides fore and aft on two tracks, the car slides across it (controls.ts's 7×5
     pins). The cars are now in scope, no longer later;
   - the backstay's ends pulled outboard;
   - the mainsheet shown as the boom's position, stacked above the traveler car;
   - one click is one step; rope colors by sail (jib warm, main cool);
   - Crew or You shown by an amber name, tap it to hand the line back, "All ↺" for every line.
   Build needs: "downhaul" renamed "Main halyard" everywhere the player sees it, and a new jib halyard control
   (starboard, jib luff tension), with a physics review.
   **With the band: the chase-view layout** (owner approved 12 November; handed to Crew Controls with the band). Mock-up
   https://claude.ai/artifact/S2ZAPSy3CPsptyFWidxh8N (design/chase-layout.html on ui/sail-controls-band-mockup):
   - the middle ~40% of the screen kept clear for the rig;
   - the dials in the top corners: a rectangular heading pod in place of the compass tape, and a circular inset chart;
   - one "where next" card (start line, over early, next mark, finish, or the navigator) in place of the start-line
     and transit banners;
   - a flags-only tile that opens a flag index, for learning the flags;
   - the Coach card bottom left, the Messages card bottom right;
   - Hail as a tab on the band, only when a hail applies; the old trim panel removed;
   - the chase camera framing the whole boat above the band by default (zooming past it allowed);
   - on the band: an AUTO-TRIM tab (was "All"), a POLE OUT / POLE IN tab only on a run, a round windex between the
     vangs.
   Also queued (owner, 12 November: "yes"): the rest of the RRS race signals in the flag index (AP, N, first
   substitute, S… from the RRS 2025–2028 "Race Signals" page, checked by the researcher; 1–2 h); and one-line
   on-screen messages with the full text in the log (1–2 h). Not queued: renaming the "Crew · Auto" button.
   After the band (owner, 12 November; not urgent; 1–2 h): line colors chosen in the boat editor, one per line (jib
   sheets, jib Cunningham, jib halyard, mainsheet, outhaul, vang, main Cunningham, main halyard, backstay), used in the
   band and on the 3D lines once P0 phase 4 draws them; the band's defaults (jib warm, main cool, backstay white) as
   the starting set; saved with the boat.
4. ~~Outside the Gate, the sea dial against the chart and the water~~ (done: the tide predictions roll on past the
   race's window; the swell from the bar buoy's own swell part (NDBC SwH/SwP/SwD); the chase camera rides the swell,
   with a switch). Open: the swell's reach into the Gate is an estimate.
5. Heavy weather, the depowering question and the rest of the deep physics pass, as one pass (14–24 h).
   Includes, from a physics review (done, #125, v134: checked, no change needed, a test added): the drifter heel. In about 3 kt the crew's placement prefers near upright over the
   leeward heel light-air technique calls for (heeled to leeward to hold the sails' shape and cut wetted area); check
   crewBestHeel and the light-air "want" in crewPhys.ts against sources, then a test.
6. ~~The racing rules still to finish~~ (done, live v125, follow-ups through v137): 20.3, 20.2(e)'s end, a boat as the
   obstruction (rules 19 and 20.1, WS Case 11), 21.1 for any boat returning to start, the Definitions of Start and
   Racing, the Part 2 preamble. Blanketing was built as rule 23 interference and then taken out on the owner's decision
   (12 November): "Stealing wind is a significant part of the strategy of tacking. It's not a foul." Wind shadow stays a
   tactical fact in the debrief ("in X's dirty air"); rule 23 is called for getting in a boat's way only.
7. ~~The debrief shown on the replay~~ (done, v127, PR #93: "Watch your race" on the results and "Watch your race so
   far" on pause; the race overhead, wind up, every boat's track; each finding colored and numbered on your track and
   a bar on the timeline; jump to a moment, rule incidents in close-up, 10/30/60× or follow your boat).
8. ~~Cruise and race: places on the map, conditions and the start changed mid-sail, "Send her home"~~ (done: the start
   and destination picked on the chart; Change the conditions mid-sail, physics-reviewed; "Move her here" without
   ending the cruise; Home: back to her slip when cruising, retire and head home when racing). The showroom's own time
   of day and conditions are done too.
   ~~Follow-up~~ (done: both planned on one big chart) (owner, 12 November; polish; 2–3 h): "on cruise configuration, I need to be able to open up a larger
   view of the map to select start and end. I should be able to select both in the same map and not have to bounce from
   one to another." One large chart, opened from the cruise setup, where you place both the start and the destination
   (and move either), then return to the setup with both set.
   ~~Also~~ (done: the navigator is a view of the inset map, toggled on the map's rim) (owner, 12 November; polish; 1–2 h): "the navigator button is at
   bottom-right atm. it should just be a view in the inset map." The navigator becomes one of the inset map's views
   (its route and advice there), and its button leaves the bottom-right cluster.
   Follow-ups built on branch rules-followups (stacked on rules-finish): AI boats hail at a boat obstruction (WS Case
   11), holding close-hauled while it's answered, only with 9–12 s to the meeting and no other boat close by.
   (23.2 for bearing away onto another boat's wind was built too, then taken out with blanketing on 12 November.)
   ~~properTwa ignores the current~~ (done, branch proper-current: it allows for the crab that makes good the line).
8h. **Now — the chart's Wind shadow layer shows nothing** (bug; 1–2 h): owner, "also on chart: toggling wind shadow
   doesn't do anything that I can see." Find out whether it draws nothing (a bug), draws only near other boats or only
   while racing (then say so on the chart when there's nothing to show), or draws too faintly (as with Waves). The
   shadows to show: boats' dirty air, ships, the committee boat, the lee of the land and of the bridge piers, all already
   in the physics. With 8f and 8g: the same layer row.
8g. **The chart's Waves layer is unreadable** (polish/clarity; next; 1–2 h): owner, "waves notation in chart view is too
   small and low-contrast to be useful." Bigger, higher-contrast wave marks on the chart and inset: legible at the
   chart's usual zoom, on halos like the other overlays, in colors the NOAA chart doesn't use. Show the height (and the
   swell's direction) plainly where it matters, without cluttering the chart. Options to the owner if the look changes
   much.
8f. **Now — the map layer buttons need two clicks** (bug; 1 h): owner, with a screenshot of the layer row (… WAVES · FOG ·
   OFF, the long visibility note above it), "these buttons are requiring two clicks for some reason". One click should
   switch the layer. Suspects: the first click only dismisses the note or the tooltip over the row, or moves focus, or a
   re-render under the pointer swallows it. Check every chip row with the same pattern (the map layers, the setup's
   choices). A test that one click switches.
8e. **Now — a crew member's arms are on backwards** (bug; Crew Figures; 1–2 h): owner, from a close cockpit view, "these
   arms are backwards. poor guy." The crew member in the orange jacket at the piano has both forearms pointing back
   past his body, hands facing the wrong way, as if the shoulders or elbows were mirrored. Likely the arm IK choosing
   the wrong elbow side, or a left/right swap for that pose or tack. Check every crew pose (piano, winch, hiking,
   tacking) from both sides on both tacks, and add a test that the elbows bend forward and down.
8d. **Now — auto keeps her hove to** (bug; 1–2 h): owner, "when I heave the boat to, resetting it to auto crew and auto
   tune should keep her hove to." Handing the lines back to the crew (Auto-trim, the crew's Auto) while she's hove to
   should leave her hove to: the jib still backed to windward, the main eased, the tiller still lashed to leeward. That's
   what a real crew told "we're hove to" does. Auto-trim sails her on only when the helm sails her off (the lash
   released, or a new course). A test: heave to, press Auto-trim and the crew's Auto, and she stays hove to.
8l. **Now — rushing water is back** (regression, third time; 2–3 h): owner, "getting rushing water again" (13 November,
   v176). Fixed before for the waves turning about the sim's origin (1bda738, v146) and for the ripples starting out of
   line (aced96b). Find the layer that still moves faster than real water: the ripples, the foam and wake, the
   current's flow-mapped texture, a jump in the focus (camera switch, the chart opened and closed, "Move her here"), or
   float precision far from the origin. Owner's report: cruising, off South Beach (about 6 km southeast of the
   Cityfront, far from the sim's origin), when it started unknown. A second report with a chart screenshot: the boat just inside a breakwater's corner, by a
   channel marked by green lights "9" and "11" (Fl G 2.5s 15ft 4M) and an "Iso G 6s 34ft" light, in 3–5 ft charted
   water, heading northeast along the shore. Check both the 3D water there and the chart's own moving streaks, which
   the owner may be describing. Then add one test over every water layer: none moves past a still boat faster
   than its own waves, or the current, at any distance and after any of those events. That test is what stops it coming
   back.
8j. **Now — the windex lost its point of sail** (regression; <1 h): owner, "I want the windex dial to show the point of
   sail (broad reach, close haul, etc)". It did as of v83; the chase-view layout's round windex in the sail band dropped
   it. pointOfSail() in src/ui/hud.ts (head to wind, close-hauled, close reach, beam reach, broad reach, run, by her own
   beat angle) is still there but called nowhere. Show it with the windex again, wherever the windex is (the band, and the
   dial under the inset map, 8b), and a test that it's on screen.
8i. **The boat editor reorganized, with a real color picker** (owner, 13 November; next; 4–6 h; UI & Experience, a mock-up to
   the owner first):
   - "all sail stuff together, all hull stuff together, etc." Proposed groups:
     - **Her:** name, sail number and country, club.
     - **Hull:** material, topsides, boot stripe, bottom paint and its finish, bottom last cleaned, name lettering, weight
       over the class minimum.
     - **Deck and cabin:** deck, cabin top, forehatch, companionway, whisker pole stowage, navigation lights, outboard.
     - **Rig:** mast, boom, rig tune.
     - **Sails:** sailcloth, mainsail, jib, sail number color, class letter F color.
     - **Lines:** each line's color.
   - The skipper, and the home marina and slip: "not sure skipper assignment belongs here. also not sure about marina and
     slip assignment. help me decide." **Owner's decision (13 November): as recommended.** The skipper moves to the Yacht Club, which is
     already where crew are assigned to boats; the boat page shows the skipper read-only, with a link there. The home
     marina and slip stay with the boat, as her "Home berth" at the end, since a berth is where the boat lives, not a
     person's attribute.
   - Color: "I don't like the little color chips, or the fact that some elements use a kind of toggle array for color.
     I'd like a color picker for everything ideally, with ability to add hex codes, and some smarts to save a few custom
     color chips (like in Google Docs) so I don't have to re-enter them for each different thing." One color picker for
     every color on the boat (hull, boot stripe, bottom, deck, cabin top, lettering, sail numbers, the F, each line): a
     full picker, a hex field, the class's usual colors as presets, and a row of your own saved custom colors shared by
     every picker and kept with your account. Where a choice is a material rather than a color (teak or fiberglass,
     sailcloth), it stays a choice.
   - Lines are the exception (owner, 13 November): "color selection for lines should probably give options for real rope
     patterns. there's not a ton of options IRL, so an infinite color picker seems to be the wrong choice." Lines get a
     palette of real rope colorways, not the free picker. Sourced so far, from New England Ropes only (Sta-Set, Endura
     Braid, VPC; neropes.com, fetched 13 November):
     - solids: white, red, blue, black, green;
     - flecks: red, blue and green fleck (on white, inferred from the naming).
     Marlow's Excel Racing also has a "mottled" range from 3 mm (search snippet only; the site blocks automated
     fetches). Samson and the others are not yet sourced. Add colorways as each maker is sourced, or from the lines on
     Josephine in the owner's photos (reference/photos). No color-coding convention by function was found.
8k. **Drop and raise the anchor** (owner, 13 November; feature, seamanship and racing; next; 4–6 h; it also seeds the
   later cruising mode's anchoring challenge):
   - Drop anchor: a crew member goes forward, the anchor and rode go over, she drifts back and the anchor sets. Raise
     anchor: haul in the rode, break it out, stow it. Each takes the time it takes, by crew and skill.
   - The physics, sourced: the holding force against the wind and current on her hull and rig; the scope (rode out
     against depth, from the NOAA chart, with the tide's height); she swings to whichever wins, wind or current, as the
     moored boats already do; and she drags if the scope is short, the bottom poor (the chart's bottom types) or the
     load too high.
   - Racing: on the Bay, kedging is a real tactic. In no wind against a foul tide, anchoring keeps the ground a drifting
     boat would lose. The racing rules allow anchoring, but she must recover the anchor before she continues (check
     the 2025–2028 text, rule 45). The strategist and the smart crew should know when to call it.
   - At anchor: the anchor light at night (built, Rule 30) and the anchor ball by day (Rule 30(a)).
   - On the screen rule: the call goes inside an existing element (the sail band's crew tab, a key), not a new button.
8c. **"Oh fuck time to paddle"** (the owner's name for it, 13 November; feature, seamanship; next; 3–5 h): "sometimes when
   you're in a jam you need to grab the boom crutch from the cabin and start paddling. there's just one crutch, so just
   one crew will paddle. need to be able to tell them starboard or port. smart crew will do it on their own."
   - One crew member fetches the boom crutch from the cabin (it takes the time it takes), and paddles on the side
     you call, port or starboard, which turns her as well as pushing her.
   - Smart crew start on their own when she's in a jam: no wind, the current setting her onto a pier, a mark or the
     shore, or stuck in irons by the dock.
   - The physics, sourced: what one person can sustain with a short blade (watts), against her own low-speed resistance
     already in the sim, so a 2-tonne keelboat makes a fraction of a knot, not a dinghy's speed.
   - Racing: RRS 42 allows only the wind and water to propel her. Its exception lets a boat get clear after grounding or
     a collision, using her crew's force. Check the 2025–2028 text for the exact wording. Otherwise, paddling while
     racing breaks rule 42: the debrief and the protest logic should know it. Cruising: no limit.
   - On the screen rule: the call goes inside an existing element (the sail band's crew tab, or a key), not a new button.
     The on-screen label is the owner's choice.
8b. **A UI audit with real rigor** (owner, 13 November; next; drafted in docs/UI-AUDIT.md; built so far: one back stack with named back links and Esc as back, the Yacht Club's members as two plain lists): "a UI audit on the roadmap to focus on real rigor on these
   screens, with a focus on navigation, cognitive load of information, and IA." UI & Experience is drafting
   docs/UI-AUDIT.md: the setup screens, the Yacht Club, the logbook, past races, settings and the Keys; back-stack
   navigation in place of "< Start page"; and the Yacht Club's Everyone / Skippers / Crew / Yours toggle, which confuses
   the owner. Proposals go to the owner before building; the screen rule above applies.
   Also filed with it:
   - ~~The setup builds the World only on Start~~ (done: one World per change, the scene once at Start) (owner: the configurator lags because it rebuilds the play surface
     behind it).
   - ~~Bug: the flag index doesn't scroll~~ (done: wheel and drag).
   - The wind angle dial, when shown, on the left under the inset map (owner, 13 November; polish; <1 h).
   - **Yours or the crew's, shown coherently in the sail band** (owner, 13 November; clarity; 2–3 h): "there's confusion
     between active and auto state on sail controls. if i'm manually controlling a line, it turns yellow. but there's
     no state change for the auto trim tab. let's get that cleaned up and coherent. not sure the exact solution."
     One visual language for "yours" against "the crew's", on each line and on the Auto-trim tab: the tab shows when
     some or all lines are yours, how many, and what pressing it will do. Options from UI & Experience to the owner
     first.
   - Remove the line "Real boats have neither: they have the windex and the telltales." from Settings (owner, 13 November;
     index.html line 369; minutes).
   - **Boat editor copy out** (owner, 13 November; minutes): the slip note ("She lies bow in … The docks are mapped from
     OpenStreetMap.") and the whole "Her flags" field, which is only a note (src/ui/boatPanel.ts lines 208–209, flagNote).
   - **A Save button on the Yacht Club's member page** (owner, 13 November, with a screenshot of "Crew 2"; 1 h): "I'd like a
     save button here. clicking it should give a quick visual confirmation and send me back to previous page." Save
     commits the member's edits, shows a quick confirmation (a check and "Saved"), and goes back one step on the back
     stack (to Members). Today edits apply as they're made (81ed7c5). The same pattern for the other edit pages (the boat
     editor, the Yacht Club's boats) in the audit. Open for the owner: leaving without saving, discard the edits, or ask?
   - **The pause menu redesigned** (owner, 13 November, with a screenshot; 1–2 h): "these buttons are a beast to read.
     too wide, incoherent stacking. just bad design." Today it's full-width buttons in rows of 1, 1, 3 and 2: Resume,
     Change the conditions…, Restart this cruise · Back to setup · Settings, Sound: On · Exit to the start page.
     Proposed: one narrow column (about a third of the screen's width), grouped by what you're doing:
     1. Resume.
     2. On the water: Change the conditions.
     3. Start again: Restart this cruise, Back to setup.
     4. The game: Settings, Sound.
     5. Exit to the start page, set apart.
     The same pattern for every menu in the game. A mock-up to the owner first.
   - **The inset map's flag and layer icons off the game surface** (owner, 13 November; 1–2 h): "the little flag icon and
     layer icon on the inset map doesn't belong on the game surface. those should be toggles in the full map view, with
     the inset remembering my choices." The layer choices (and the flag index) move into the full chart. The inset shows
     whatever was last chosen there, saved with the player's settings. The standing screen rule applies.
   - **The on-screen tiller instructions out** (owner, 13 November; minutes): the keys line across the screen (#keysHint,
     "click: take or let go of tiller · right-click, double-click… lash it · … steer · … luff · …", src/app.ts keysHint).
     The keys stay in the Keys panel. Such instructions belong only in a learn-to-sail mode (Training tools, below).
   - **An audit for that kind of noise everywhere** (owner: "let's do an audit for this kind of noise throughout"; part
     of the UI audit; 2–4 h): every explanatory line on every screen (setup, boat editor, Yacht Club, Settings, the chart,
     the logbook, the panels, the coach) listed and kept only if the player needs it to act. The rest is cut, or moved to
     the coach, the help or the Keys. The list goes to the owner before cutting, unless a line is plainly noise like
     these.
   - Remove the body line under "Chart · Pick a destination" ("Paused. Tap the water or a place: sail there, or move her
     there. Drag to move, scroll to zoom."), keeping the title (owner, 13 November; minutes).
8a. Clean up the wind controls in "Change the conditions" (owner; Crew Controls proposes options to the owner before
   building; 1–2 h): the "Wind from" slider sits beside the Kind of wind choice (real day / westerly / northerly /
   southerly / light), which is confusing, and the owner sailed in a 355° northerly after picking Westerly. One clear
   way to set the direction.
   HUD note (Deep Physics, in progress): the inset map shows the boat's own visibility, and is north-up in Just sail,
   with an N arrow.
9. ~~The flags' original motion back, and "Strike ensign"~~ (done: the committee boat's signal flags have their
   original motion back; the boats' flags keep the measured physics; the strike animates).
10. ~~P0 phase 4: deck hardware and lines, with the rigging detail~~ (done, v128–v134).
Then: the skipper and crew model; cheating, protests and hearings; validation against real fleets; real past races;
rig tuning; seasons and awards; fog's effect on sailing; looks (the Ferry Building, aluminum spars, the boat cards, the
showroom's time and conditions, the swinging lantern); Sam's; accounts for other players; real slip numbers and nicer
moored boats; the sea inside the marinas; the desktop release; the phone layout (on hold). The Bay East work carries on
as it is.

**Built 12–13 November beyond the ranked list** (to v174):
- **Ghost races:** sail against your own recorded race, checked end to end. This is the first step to multiplayer.
- **Real past races:** the replay against the real fleet, for a real past race; a race whose course is uncertain is
  flagged.
- **Training drills:** a start drill, and a mark-rounding drill with each rounding scored.
- **The tactical debrief:** leg by leg against the fleet's middle, the leg's best and the ideal; seconds by cause; sail
  numbers on the chips.
- **Air temperature:** each day's own, from Fort Point and the NWS, for the crew's kit (shorts from 68 °F, the owner's).
- **The ensign:** keeps its hours, 0800 to sunset; the burgee as the fleet flies it.
- **The cabin instrument:** the Tacktick-style unit at the hatch garage's forward end, key 6. This begins the tactical
  compass item.
- **A racing season:** a proposal for the owner (docs), built from the real 2025–26 Seaweed Soup.

**Owner's decisions, 12 November (morning)**, via the Coordinator:
- Blanketing is not a foul: "stealing wind is a significant part of the strategy of tacking". Rules removes it as
  rule-23 interference (rule 23 protects a boat taking a penalty or on another leg, not one being covered on the same leg).
- The piano: the crew leans across from windward (confirmed). No tiller strip.
- Z-flag penalties scored by RRS 44.3(c) (Debrief).
- Gashouse Cove kept as it was (before 2026).
- The swell view holds still.
- The crew passing close mid-cockpit in a 12–16 kt tack: left as it is (parked).
- Four boat-spec sites allowed, for Marinas to source the moored boats (begun: their proportions from the J/105's
  published figures, and the SF Marina's occupancy).
- The lines plan: the researcher to find who holds Plan 1.
- The speed budget held, with one deeper speed pass (done by v147: hull ends and chop lookups memoised, the current's
  shore distance off a 10 m lattice, tested against a 0.1% current change).
- The daily weather refresh now builds from main.

The original ranking, for the record:

Estimates are focused build hours including tests, review and publishing, ±50%.

1. ~~Saves kept with your account; save or discard after each sail~~ (done, v53).
2. **Hands-on boat handling**, in order:
   a. ~~Easier sail controls: adjusting one line takes only that line off auto; one tap puts it back; bigger targets~~ (done).
   b. ~~Heaving to: each jib sheet on its own, the tiller lashed at an angle, hove-to physics checked against real boats~~
      (done; the real-boat figures are anecdotal, so a GPS track of a Folkboat hove to would tighten the test bands).
      Later, from review: the hull's lift and broadside drag both act at one center of lateral resistance (no Munk
      moment), and the hove-to model's lateral area, added masses and side windage are estimates (physics.ts HOVE).
      The broadside drag's center hove to is tuned (HOVE.dragAft 0.3 m aft of the CLR, against the drawn profile's
      0.81 m, which makes her wander 30° in 8 kt), and HOVE.latArea (3.39 m²) disagrees with the drawn profile (5.36 m²):
      a towing-tank or GPS record of a long-keeler drifting, or the class lines (Plan 1), would settle both.
      The force model's drive calibration (physics.ts driveCalibration) comes from full, unreefed sails at their best
      shape, so in a gale (k ≈ 0.2 at 35 kt) it stands in for the reefing and depowering it leaves out; from rest a
      backed-jib boat there gathers way quickly (5 kt in about 10 s). Holding the traveler down doesn't depower her: the
      crew sheets in to keep the boom angle it wants, so with the traveler yours the mainsheet should follow your intent.
   c. ~~Crew weight in the physics: the low side in light air, hiking, body-tacking, forward downwind; the AI crew by
      skill; an option to place the crew yourself~~ (done). Later: the hull's hydrostatics (MCT, the wetted surface's
      change with trim and heel) from a Folkboat lines plan, and the righting curve's shape past a few degrees (the
      moment at 1° is now from three ORC certificates; the curve needs the hull's offsets); a roll gybe; the help a roll
      tack: she now rolls through it (in light air too), the rig's sweep adds push while she rolls (quasi-steady, from the
      sail forces) and a turn costs speed by the rudder it needs net of her helm, but in a 2-tonne keelboat that adds
      up to nothing measurable; the only measured gains are a Laser's (Kogure et al. 2013, GPS: 5.3% faster through the
      tack in 2–4 m/s, 2.8% in 4–6 m/s) and Cornell's towing-tank work on the unsteady thrust (APS DFD 2015–19, behind
      a browser check), and nothing sizes the heeled hull's own turning or the unsteady flow for a keelboat; the helm's own steering suffering while
      single-handed at the cabin top; crew moving in waves (aft in a chop to free the bow).
   d. ~~Real timing and sequencing of adjustments, by crew count and skill; cars rarely moved~~ (done). Later: measured
      timings for Folkboat crew work (the times are estimates); the order of jobs at a mark rounding (pole, vang, cars)
      planned ahead of the mark by a skilled crew.
3. ~~Race strategist in the course view, and a navigator for cruising~~ (done; published with the combined build of
   the parallel branches). Later: a gridded wind analysis so the sides of a beat differ by more than the shore and the
   slot; the strategist's plan B checked again on the water at the warning signal; the navigator's hazards from NOAA's
   chart data; the crew-trim model's traveler (boat/controls.ts puts it to leeward in medium air: found in review).
   Also from review: ~~check the brief's leg times against the sim's own fleet sailing the same legs~~ (done, PR #111:
   with four AI boats on Seaweed Soup course 2 and the training course, the 38 vs 47–71 gap is gone since the AI's held
   tacks; runs and reaches match the plan or the fleet is a little faster; beats take 5–20% longer, the plan being a
   perfect sail at 8 s a tack; the first beat and the leg after the first mark are slowest, from traffic and penalties
   at the first rounding; the whole race 47 min planned, about 50 sailed; tests/sim-fleet.test.ts holds the brief to
   the fleet, and the brief will say upwind times are for a perfect sail); list a max flood or ebb already under way at the window's edges;
   the tide predictions stop about 6 h after the gun (tide.ts stationsFor), so later passages see it frozen; and the
   gusts: Fort Point's records show peak gusts of 2–5 × the 6-minute mean on light, puffy days, while the sim's puffs
   stop near +45%, so the brief states the sim's gusts. Whether the puffs should reach the records' peaks is for the
   deep physics pass.

**P0 — the Folkboat herself, a full true-to-life 3D model** (owner, 12 November 2026; owned by Boat Detail; about
16–28 h over four phases): "this is a Folkboats simulator, and the accuracy of the boat itself is a P0… properly build
out a full true-to-life 3D model of the folkboat… use as much care inside as we have everywhere else. we still have more
work to do on the deck as well (lines, hatch, fairleads, etc) but that's not urgent either." The cabin lighting at night
is now "much better" (owner).
1. ~~The interior reads as real 3D by day~~ (done, v106) (parallax, daylight in through the companionway and lights), and the
   translucent panel over the companionway at night is gone (2–4 h).
2. ~~The interior true to a real Folkboat~~ (done), from the construction plan and reference photos (6–10 h).
3. ~~The cockpit to the plan~~ (done: benches as lazarettes, footwell, thwart, after shelf, winches on pedestals from Josephine's photos), with the seats and positions exported for the crew (4–6 h; takes in "the thwart, the
   cockpit's proportions and where the skipper sits", below, and reference/photos).
4. ~~Deck hardware and lines: hatch, fairleads, blocks, sheets and control lines~~ (done, v128–v134).
5. ~~The cabin lantern swings with the boat's motion~~ (done by v147: a damped pendulum on its chain driven by her roll,
   pitch and heave, its light following) (owner, "would love for that lantern to swing with the motion
   of the boat"): a pendulum on its short chain from the cabin top (render/cabinInterior.ts LANTERN), driven by the
   hull's heel, pitch and roll, its light moving with it (1–2 h).
6. ~~**True-to-life rigging, the owner's most important boat item**~~ (done: rigging-gear #159 and rigging-deck; the piano in the band's order, the halyard tackles, the jib sheet as Josephine has it) (12 November, from the owner's boat review; Rigging,
   after its current PRs; a big job, about 8–14 h): the blocks for the jib and main at the mast and the boom's junction,
   the Cunninghams, and the lines visible along the traveler, each led as on Josephine (the Full sail controls
   tables, reference/photos).
7. From the same review (12 November):
   - Bugs (Boat Detail; about 1–2 h): a stray second toerail on the starboard side; a half-circle see-through patch at
     the cabin's front by the mast foot.
   - Winching (Crew Figures; 1–2 h): the jib winch handle sits under the deck, beneath the winch, which passes through
     the deck; and the crew winch in short pulls of at most 45°, not full circles.
   - Polish (Boat Detail; 2–3 h): the hatch less of a perfect square, as real hatches are; ~~the whisker pole stowed~~ (done: its real 2.85 m, on the side deck)
     farther forward on the bow; cleats amidships.

**Running order** (11 November, Coordinator, to keep within the 5-hour usage window: at most three build sessions at
once): running now, Deep Physics (AI tacking), Charts (the bridge towers and their wakes), Boat Detail (the
companionway redo) and Crew Figures; next as each finishes, Crew Controls and Marinas, then Bay East.

**Owner's feedback, 11 November 2026** (from screenshots at night; ranked now / next / later):

- ~~**Now — crew buttons fight auto**~~ (done, v82): "If auto is on and I click 'Hike' or anything else, Auto seems to stay
  on, and the crew doesn't stay hiked out." Picking a crew position should take the crew off auto, as the sail lines do
  (one line off auto, one tap back), and hold until changed.
- ~~**Now — the cockpit sole and companionway**~~ (done, redone by v108: open or closed in the boat editor, panelled doors, hinges and latch; bug + accuracy; 2–4 h; Boat Detail; the first try, live in v86 (PR #39), was rejected by the owner: an orange cube aft, an orange disc forward on the cabin top, the doorway misunderstood, lines across the hatch; Boat Detail rolls it back and redoes it after the usage reset): water shows through the cockpit sole, and it's
  unclear whether the companionway is open or shut. Draw it open (more true to life under way): the opening, its washboards
  or door stowed, and at night "the cabin lights shining through it" (ties in with the warm cabin light planned under
  Lights on the boats). Check from both sides on both tacks.
- ~~**Now — bow spray**~~ (done, #39: droplets lit by the scene; bug; 1–2 h): at night the spray against the bow is "white squares… they look fake and read as
  sparks, not water". Cause: square, unlit white points (render/wake.ts, PointsMaterial). Real spray is droplets and sheets
  that take the scene's light, so they go dark at night and catch only the boat's own lights.
- ~~**Now — cruise ignores the chosen origin**~~ (done: 1ace228 in #54, checked in the browser by Marinas; bug; ~1 h): owner, "there's a bug in cruise
  mode where I have an origin selected but it still starts me in the slip." When a cruise origin other than her slip is
  chosen, she must start there (sim/world.ts, the slip and docked start, near line 301). Goes with the push-off fix.
- **Now — double-click to lash the tiller always lashes it amidships** (bug; <1 h; Crew Controls after the reset, with
  its batch): owner, "double-clicking to lash the tiller doesn't work. if I double click while the tiller is selected,
  the first click registers as a release, and the second as a lash. that means the tiller always gets lashed
  amidships." Lash at the angle she held before the first click, or hold the release until the double-click window has
  passed (app.ts tiller handling). Owner, after: "maybe two-finger click? look into how games tend to solve something like
  this." Plan: lash on right-click or two-finger click (the browser's context menu suppressed over the water), which
  can't be mistaken for the release click; keep I as the key; keep double-click working by lashing at the angle from
  the first press; say so in the tiller hint. Owner: "one issue with double-click in browser is that it surfaces the
  browser menu. need to solve somehow." Over the 3D view only: no context menu, no double-click text selection, no
  double-tap zoom; menus and text selection still work on the panels. Test in Chrome, Safari and Firefox on a trackpad.
- **Done — she sailed through the Golden Gate Bridge's north tower** (bug): every bridge pier and tower base standing in
  the water is solid (NOAA's chart and OpenStreetMap; geo/shore.ts PIERS): collisions, the look-ahead, the navigator's
  routes, Rules 19 and 20; the Golden Gate and the Bay Bridge's West Span re-laid on them. Each casts a wind shadow
  downwind and a current wake downstream that turns with the tide (environment/pierWakes.ts). Tests: bridges.test.ts,
  pierWakes.test.ts. Still open: the wake's constants for long rectangular piers (C_D by side ratio, the recirculation
  length) and the bed friction c_f want primary sources (NACA TN 3038, Norberg 1993, Parnaudeau 2008 were out of reach).
- ~~**Now — a see-through seam between the keel and the hull**~~ (done, #39: the garboard lands flush in the keel's rabbet; bug; 1–2 h): "a transparent seem between the keel and the
  hull. That shouldn't be there." Seen side-on in the showroom: thin gaps let the background through along the join, from
  the forefoot aft along the garboard. On a real Folkboat the keel is faired into the hull with no gap (the planks land on
  the keel's rabbet). Check from both sides.
- ~~**Next — the thwart, the cockpit's proportions and where the skipper sits**~~ (done with P0 phase 3: the cockpit to the construction plan, the thwart a deep varnished beam with the traveler and cam cleats, the helm on the after deck; accuracy; 4–6 h; owner: "when time is
  right"): the thwart is drawn as "a horizontal plank", and "the skipper is crammed behind the thwart with the thwart in
  their lap. That's not true to life. While underway, skippers often (but not always) sit on the stern… or along the rear
  rail." From the owner's three photos (Josephine at the dock, Josephine under way looking aft, CircleSea side-on; the
  photos are in reference/photos: josephine-cockpit-at-dock.jpg, josephine-helm-on-aft-deck-underway.jpg,
  circlesea-helm-on-aft-rail-side.jpg):
  (1) the thwart is a deep wooden beam spanning the cockpit at about coaming height, with a vertical face, not a flat
  plank; the black traveler track and car with the mainsheet blocks run along its top, and the green cam cleats for the
  traveler (and the backstay ends) sit at each end where it meets the coamings;
  (2) aft of it there's real room: the helm sits on the aft deck (green non-skid, the ensign staff at the stern) with legs
  in the cockpit, or on the aft coaming, steering with the tiller extension; under way side-on, crew forward by the
  shrouds and the helm well aft on the rail;
  (3) the first photo shows how the mainsheet and traveler attach to the boom (mainsheet blocks from the car up to the
  boom).
  Use these and class sources (Nordic Folkboat construction plan, class rules) for the cockpit length, the thwart's
  position and height; the helm's places (aft deck, aft coaming) go to the crew-placement model too. Check from both
  sides on both tacks.
- ~~**Now — push off doesn't get her out of the slip**~~ (done, by v96; bug; 2–3 h; Marinas, with a test over every slip): "push off action is still not getting me far
  enough into the fairway of any marina to be able to get out of the slip. also, push off should move me forward if
  I'm at a dock that doesn't require me to be nosed in." Today (geo/marina.ts planPushOff) every berth is treated as
  bow-in: the crew walks her back until her bow is level with the finger's end, swings her and shoves, and she stops
  short of a fairway she can sail or steer out along. True to life: the crew walks her right out of the slip and into
  the fairway, pointed down it toward the exit, before stepping aboard with a shove, so she keeps steerage way; at
  an alongside or end tie (or any berth where she lies bow out) they push her off forward and out from the dock. Check
  in every marina (West Harbor, Gashouse Cove, South Beach, the Corinthian, Horseshoe Bay), with the boat's coast after
  the shove from her real mass and low-speed drag, not a set distance.
- **Done — outside the Gate, the sea dial disagreed with the water and the chart** (bug): the stations' tide predictions
  covered only the race's window; past it each held its last value, frozen at different points of their tides, so on a
  long sail the dial (its nearest station, frozen mid-flood) and the chart's arrows (others, mid-ebb) disagreed. They now
  roll on (CurrentField.cover; tests/seaDial.test.ts at the owner's spot). The swell: the dial and the water come from
  the same sea state, and 9 ft is what the model gives there on a big day with an ebb against it (0.77 of the bar
  buoy's height, steepened by the ebb). A long-period swell (14–18 s, 300–500 m long) is a slope of about 1°: the boat
  heaves about a meter and the cockpit view rises and falls with her, but the chase camera holds its height, so the
  horizon stays put. Open: (a) should the chase camera ride the swell? (owner's call); (b) the swell's reach into the
  Gate (0.77 there, 0.55 at the bridge) is an estimate: no measured ratio found (Hanes & Erikson 2013, ECSS 133, is
  paywalled; the ESA/BCDC Crissy Field comparison is on a blocked host); (c) Deep Physics: the bar buoy's total height
  includes its own wind sea (NDBC publishes the swell part, SwH, separately), and the swell's real direction is dropped
  at the Gate.
- **Next — heavy weather: how she copes in 30+ kt, and reefing for cruising only** (accuracy + feature; 8–12 h; owner:
  "not for now"): at 32 kt close-hauled under full main and jib she lay at 60°+ of heel, 0 kt, cockpit filling. Owner:
  "that boat would have sunk by now… How would an IRL skipper handle this situation? can't Folkboats handle heavy weather
  like this?" and, after: "I don't know of any Folkboats skipper on the Bay who reefs, or even has reefing capabilities…
  I've heard that Folkboats don't *need* to reef because of their heavy keel… If we introduce a reefing mode, make sure
  it's true to life, and keep it hidden in racing mode."
  What's sourced: ballast about 50% of displacement, cast-iron keel (Folkboat Year Book 2023; NFIA class rules
  2025–2028, rule 4.10); capsize screening 1.78 (keelindex.com). The NFIA rules (March 2026 update) say nothing about
  reefing either way; the UK Folkboat Association's rules (10.0) allow reef points "at the discretion of the owner" and
  ban flattening-reef zips. A self-draining cockpit is optional (NFIA 3.21) and pumping only while racing (12.40).
  Not found: the SF Bay fleet's practice in 25–30+ kt, first-hand accounts of a Folkboat in 30+ kt, how classic boats
  reefed, the AVS. So "they don't need to reef" is the owner's report of Bay practice, not yet sourced either way; to
  try next: sfbayfolkboats.org and the YRA sailing instructions, the Year Books, North Sails' Folkboat guide.
  To build:
  (1) first, the physics: with the main eased or luffing, traveler down and backstay on, what does she really do in
  30+ kt under full sail? The heel past a few degrees still needs the righting curve from the hull's offsets (see crew
  weight, above); if Bay racers sail on unreefed, she must be able to too, not lie at 60° at 0 kt;
  (2) the auto crew's heavy-air handling as Bay sailors do it (dump the main, sail on the jib, feather);
  (3) water in the cockpit: water shipped, its weight, the pump;
  (4) reefing only in cruising, hidden in racing, and only once it's sourced how a Folkboat reefs (slab or roller, how
  many reefs, at what wind).
  Update (12 November): owner, "nobody who races Folkboats on the bay has a reef setup. races just get canceled at 23
  knots… at 23 knots everyone takes a vote on canceling. mostly bc at that speed things start breaking on boats." The
  SFBFA's site (sfbayfolkboats.org/racing, fetched 12 November) has a "Proposed High Wind Race Cancellation Protocol":
  "OA will cancel racing for the day when wind is above 25 knots"; before dockout, if the forecast is above 25 kt, the
  Race Chair with the OA decides, and tells the fleet by text. It's marked proposed; the bylaws say nothing on wind. So
  in racing: no reefing; the committee cancels in a blow, by the fleet's practice (the owner's 23 kt vote; the written
  proposal's 25 kt), signaled as the sim's committee boat does (AP or N with A), and the strategist warns ahead from
  the forecast. Racing above that isn't part of the Bay fleet's sailing. **Owner's decision: the sim cancels at 23 kt** (built: the committee calls racing off over 23 kt, AP or N over A, the
  strategist warns ahead, CXL in the logbook) (the fleet's
  practice), and **reefing is held until there's a Folkboat-specific source** (a cruiser's account or a sailmaker). For cruising: the owner expects blue-water
  Folkboats to reef; still unconfirmed. Ann Gash (solo round the world, 1975–77) reportedly used a working jib and a
  trysail in a storm, not a reefed main (a search summary of her memoir, not read); Hasler's Jester was junk-rigged
  (Folk Boat Year Book 2021, p.46). Richard Sherwood (1994, via Wikipedia): she "often carries full sail in 20–25".
- **Next — cruising and racing: pick places on the map, change the conditions, and "Send her home"** (feature; 6–10 h
  in all): owner, "when cruising, I'd like to be able to pick my start and end locations on the map rather than in
  dropdowns. I'd also, when cruising and racing, like to be able to change the conditions without restarting the
  cruise, and in both modes I would like a 'Send her home' feature (copy TBD) that auto-sets her home slip as the
  destination. In race mode, send her home would essentially be withdrawing from the race, if actioned before race is
  complete." ~~(1) Cruise setup: tap the start and the destination on the chart, in place of the dropdowns~~ (done).
  ~~(2)~~ (done: Pause → Change the conditions…, at once) Change the conditions mid-cruise and mid-race (wind, tide, sea, the day's real data or your own), without a
  restart (2–4 h). ~~(3) "Send her home"~~ (done: the *Home* button, "Send her back to her home slip") (wording to be settled), in both modes: sets her home slip as the destination for
  the navigator or tiller pilot; before she finishes a race it retires her (scored RET under RRS A5.1 and A11) (1–3 h).
  ~~(4)~~ (done: "Move her here" on the chart) After "cast off", change where she starts without ending the cruise (owner, "once I tap 'cast off' in cruise
  mode, I'd like to be able to edit the starting location without having to end the cruise altogether"): pick a new
  start on the chart and she's moved there, the cruise and its log carrying on (1–2 h).
  Layout to the owner first.
  ~~Also in the showroom~~ (done: the showroom's Time of day and Conditions…) (later; 1–2 h, shares the conditions control with (2)): owner, "I want to be able to change the
  time of day and conditions in showroom mode. no rush on this request." Time of day (so the sun, dusk and the night
  lights can be seen on the boat) and the wind, sea and sky.
- **Later — found along the way (12 November)** (polish/accuracy; from the building sessions):
  - From Marinas, the motor: the outboard's thrust is off her centerline (about 0.45 m out on the bracket, some 180 N·m at full
    throttle: she swings away from the motor's side until she has steerage), and prop walk in reverse; both left out for now,
    both real lessons at the dock. And sourced figures for the figure of merit (0.55), reverse (0.5) and the leg's drag.
  - From Charts, after Lime Point (#64): ~~blocky 50 m terrain cliffs along the Marin shore~~ (done: the shore fit and
    12.5 m shore patches, and from 13 Nov the Headlands' water's edge in rock, sand only on OpenStreetMap's beaches:
    no pale sand skirt under the cliffs); ~~the sand sliver southwest of Horseshoe Bay's marina~~ (done: a 64 m piece of
    the chart's land, drawn as a rock); ~~a possible spike at the west edge of the Lime Point box~~ (checked 13 Nov:
    none); still open: the tiller pilot tacks into the cove behind Lime Point on a westerly beat out of the Gate
    (AI/pilot), and Kirby Cove's beach, which OpenStreetMap doesn't map as one (drawn as rock).
  - From Crew Figures (#63): the crew's fore-and-aft stations (crewPhys) reach slightly past the real benches; fixing it
    shifts the trim calibration, so it needs its own reviewed PR.
  - From Bay East: Richmond YC and Encinal slips, BYC and Encinal racing marks, and the current in embayments without
    NOAA stations all need sources it can't reach yet (the club sites aren't allowed hosts).
- ~~**Later — aluminum spars look like white plastic**~~ (done by v147: clear-anodised extrusion, a satin mid-gray with soft
  broad highlights, checked against CircleSea's boom in strong sun; polish; 1–2 h): owner, "the aluminum on the masts and booms
  looks like white plastic, not aluminum." Anodised aluminum is a satin silver metal (physically based: fully metallic,
  fairly smooth, a faint brushed streak along the spar) that reflects the sky and the water, darkens at dusk and shows
  a long highlight down the mast. For every aluminum rig (the wooden spars stay wood). Check in daylight and at night.
- ~~**Later — the boat cards' pictures**~~ (done, v144, PR #141: the owner chose the Bay at golden hour, a physical sky
  with a low sun and rippled water reflecting it, her whole rig in frame, the pictures kept between visits; polish; 2–3 h): owner, "make the background of these models more true to life
  and less ugly af, or just show the model suspended in empty space and slowly rotating? find something beautiful to do
  here." Today (render/thumbs.ts) each boat card (name, flag, sail number) shows her on a flat blue sky over a flat blue
  sea. Options to show the owner as pictures before building: her on the real Bay water and sky at golden hour; or alone
  in soft studio light on a dark gradient, turning slowly (live on hover, still otherwise); either with her heel and sails
  set as she'd sail, and her own colors. A design change, so the owner picks.
- **Next — chase view: see the sails clear of the dials** (polish; 1–2 h): owner, "right now in chase view the hull
  appears to be centered in frame, but I need to be able to see the sails easily. currently too much stuff (dials,
  notifs) sit on top of the sail." Frame her so the whole sail plan sits in the open middle of the screen, clear of
  the dials and messages: the hull low in frame (render/scene.ts chase camera), and the HUD kept out of the sails' area.
  May fold into a broader HUD review. Batch with: the Navigator button (owner, "move the navigator button to be next
  to the autopilot button. probably to the left of it."): in a cruise it moves from beside the map (#mapBar) to the
  bottom-left bar, just left of Autopilot (in a race the same slot is Course; ~15 min). And the Hail icon (owner, "the hail button icon is the same as the
  sound icon. let's fix that too."): a distinct icon, a hand cupped to the mouth or a sailor calling, never a speaker or
  megaphone (that reads as Sound).
- ~~**The flags: bring back the original motion, and strike the ensign in a blow**~~ (done, v126, #92) (polish + feature; 1–2 h; for
  Boat Detail): owner, "I know we dialed down the flag flapping but the new flag physics are ugly and stiff. let's bring
  back the original physics, and add an option to strike the ensign in high wind. not urgent. put the 'strike ensign'
  button with the bottom-right controls, and only during cruise mode when winds are high." Restore the flag motion from
  before it was toned down (render/boatMesh.ts flags; the earlier version is in git history). Add "Strike ensign" to
  the bottom-right cluster (#viewBar), shown only in a cruise when the wind is high (threshold to propose, about 20 kt):
  it lowers the ensign and its staff, and a second press hoists it again.
  Built (bay-east-6): the boats' flags now flap as measured flags do (render/flagWave.ts: f·L/U 0.55 and a 0.19 L
  swing, Chen et al. 2014, J. Fluids Struct. 45; the cloth's angle waves, so it doesn't stretch; hanging below 3 kt),
  livelier than either old version; the old code (8d45d94's revert) was 3–5× too slow. Follow-up: the committee boat's
  signal flags keep their restored motion (render/flags.ts, within about 2× of the physics for their 1.8 m fly); to
  move them onto flagWave.ts, SignalMast.sync needs the wind's speed passed in.
- ~~**Next — the boat's lights only when in use**~~ (done, #42: none in the slip or when switched off, Rule 25 under way, Rule 30 at anchor, the lanterns drawn only while lit; accuracy; ~1 h): "Remove the hull lights when they're not in use
  please." They're already off from sunrise to sunset (render/navLights.ts, ON()); still to do: off in the slip and tied
  up at a dock, the all-round anchor light alone at anchor or on a mooring, the sidelights and sternlight only under way
  (COLREGS/Inland Rules 25 and 30), and off when the owner switches them off. When they're off, hide the fittings too (the bow lantern, the sternlight
  and any masthead tricolour): owner, "hide the fittings". Also check whether the "big white V" at the
  bow (below) is partly the sidelights' glitter streaks on the water.
- **Now — the crew, drawn and animated as well as the boat** (accuracy + bug; 10–16 h; in progress: Crew Figures, screenshots to the owner partway; moved up from the unranked
  "crew figures and animation"): owner, "crew movement animations are clumsy, ugly, and distracting… we have so much
  beauty and accuracy in this game and the physics of crew movement are super cool, but the animations are complete
  garbage… we need crew drawings and animations to be commensurate with what we have for the boat." Found: (1) the crew
  move through the hull (their paths must go over the deck, coamings and thwart, never through them); (2) in auto they
  move "with a frequency that isn't true to life": a real crew moves on a puff, a lull, a tack or a job, and otherwise
  sits still, so the auto crew needs a dead band and a minimum time between moves (source it: racing coaches'
  guidance, or video of Folkboat crews); (3) in "mid" they're "sitting on an invisible chair": they need a real seat
  (the cockpit seat, the thwart, the floor, the bridge deck). Real bodies (proportions, clothing, lifejackets as in
  reference/photos), poses for each job (helm on the aft deck or aft rail per the thwart item, hiking with feet under
  the straps, sitting to leeward, at the winch, at the piano, crossing on a tack), and moves that follow the physics.
  Check from both sides on both tacks.
- **Now — crystal clarity on the crew and trim controls** (polish/clarity; 4–6 h; Crew Controls, after the bottom-bar layout; merged with the trim controls review
  below): owner, "I also can't understand the buttons, even after using them for a while. how do I get them to hike on
  the lee? which buttons do what? I can't figure it out… we need crystal clarity on the button controls." The crew row
  (Lee · Mid · Up · Hike, keys 7/8 to step, crewWords.ts) needs plain words for what each place does to the boat
  (to leeward heels her in light air; hiking is always to windward, to hold her flat), which way is which on the
  current tack, and what auto is doing now. Every line's setting, too: owner, "can't tell which way is 'on' for the
  backstay. is 0% on? or 100%?" (100% is on: controls.ts, 0 off … 1 bar tight). Label each end in sailors' words
  (eased … on, or for the traveler windward … leeward) and what that end does to the sail. Layout to the owner first.
- **Next — a broader review of the trim controls** (polish/clarity; 4–6 h; done together with the crew controls above): owner, "we need a broader review of trim
  controls, which are still confusing." A full review of the trim panel's clarity: the labels, who's in charge of each
  line, auto against yours, and the coach. The plan goes to the owner as a layout before anything is built.
- ~~**Next — the bow wave**~~ (done, #39: a ridge of sea-colored water, foam only at its crest, sized by the stem rise and Froude number; polish/accuracy; 2–3 h): looks "like a big white V rather than water", worse at night. A bow
  wave is a raised, curling ridge of water with broken foam only at its crest, lit like the rest of the sea; the Kelvin
  angle (19.5°) already used for ship wakes. Do with the spray.
- ~~**Next — instruments**~~ (done, v83: wind speed the big number on the wind dial, the tide (Flood/Ebb/Slack) on the sea dial, the point of sail under the windex): the TWD dial's big number should be **wind speed** ("I already have the windex
  for" the angle); the **Sea** dial's big number should be the **tide** (keep the chop/swell subtext, which they like);
  the **windex** dial's subtext should add the **point of sail**.
- ~~**Next — the buttons at bottom-left**~~ (done, v87; polish; 3–5 h; Crew Controls; owner's decisions on the layout: as proposed, but Lash tiller goes into the tiller control itself (e.g. a double-click), not a button of its own; Hail stays a button; an icon with a short word under each; "Trim · crew" moves into the trim panel's header in plain words; the Main and Jib rows get the crew row's Auto pill): "starting to overload". They mix trim, navigation, pausing and
  more, and one isn't a button at all. Audit them, move the ones that don't belong to where they fit, and make the rest
  "smaller iconographic buttons". Show the owner the proposed layout before building (a design change).

**Deep physics pass: the audit** (Deep Physics session, November 2026; six independent reviews of the sails, hull and
appendages, waves, wind and puffs, crew and balance, and the AI, with sources). Where the sim disagrees with published
data, ranked by how much it changes what a sailor feels or a race result. Each fix gets a test against its source.
1. ~~**Feathering cost 10–16× ORC's pinching curve**~~ (done): the sails flogged by the angle below the polar's beat
   angle, on top of the polar's own pinch, so 1–2° low cost 1.6–3.5% of VMG at 20 kt (ORC: 0.1–0.3%), teaching "never
   feather". Now they flog as far as they luff (trim.ts), and below the beat by the square of the angle below it (flat
   at the beat, so ORC's optimum stays: 1–2° low costs 0.2–0.6%; ten degrees high still a big loss; she stops in the
   no-go zone). The polar's pinch curve itself is unmeasured: it should come from the sails' forces once 9 is done. And
   the crew's deliberate ease of the main on the last depowering steps (up to 7°, half luffing) flogs at no cost, in the
   speed search and on the water alike: price it in the search, then judge the main where it is.
2. ~~**No tactical wind shifts on most days.**~~ (done: environment/shifts.ts, fitted to FTPC1's record by kind of day and
   strength, counted from when the course is laid, carried down the course; later: the lateral coherence (the sides of
   the course) from two stations' records rather than assumed; the HUD's lift/header readout and the rules' wind (Overlap,
   Rule 18's beat) still use the course-center wind, not the boat's; shifts quicker than ~12 min aren't resolved by
   6-minute samples) Off observed days the only shifts are two fixed sine waves (120 s ±6°,
   41 s ±2.5°, unsourced) and a 63 s ±8% pulse: about 1° rms change over 30–60 min, against Fort Point's 13–14° on
   10–15 kt westerlies (6-minute record, 492 days, racing hours) and 26–29° on 6–10 kt days. Beats are drag races; a
   fixed period can be timed. Fix: a seeded, broadband shift process fitted to FTPC1's structure function by kind of day
   and strength.
3. ~~**Shifts hit every boat at once.**~~ (done, but on a past day the record's shifts are still course-wide) Carried down the course with the wind (Taylor's frozen turbulence), the boat 300 m
   to windward gets a header about a minute before the one to leeward, and one side of the course gets a lift first.
   And on observed days the station's own 6-minute turbulence (about 5–6° of it) becomes a course-wide shift: smooth
   the record and hand the residue to the local turbulence (4).
4. ~~**Almost no gusts**~~ (done: environment/gusts.ts, open-water turbulence from the log law and Charnock's roughness,
   IEC 61400-1's scales, the puffs keeping the minutes; in a race at 12–18 kt a 5-s gust factor of 1.24–1.28 at a fixed
   point; light-air gusts in knots; later: more turbulence downwind of land (off the Cityfront), the light-air floor from a
   sourced convective or stable scaling, the crests' lie turning with the wind) **and the gusts' peaks** (the item from the strategist's review): open water at 6 kt and up should
   not reach the records' 2–5× peaks: those are almost all below 6 kt mean (a third of 6-minute windows at 4–6 kt reach
   2×; none above 12 kt) and the station's off-land turbulence (TI ≈ 0.22). Open water: TI ≈ 0.09–0.12, a 5-s gust over
   the 2-min mean of 1.15–1.27 at 10–15 kt (WMO TD-1555, Harper et al. 2010). The sim's puffs give TI ≈ 0.03 and gust
   factor 1.10, so heel and helm feel steady in a breeze. Light-air gusts are sized as a share of the mean, so they
   vanish as it dies (the record: +1.5–4 kt at 2–6 kt); puffs die before they cross the course (60–210 s); one gustiness
   everywhere (off the Cityfront it should be about twice the slot's).
4a. ~~**The AI's tacks aren't held**~~ (done: a tack or gybe she decides on is held until she's round; the rhumb-line test by
   her close-hauled course; clear of the whole committee boat) (AI 1; src/ai): the tack decision is made afresh every step (the rhumb-line test
   uses her heading, which crosses the course axis mid-tack; the header tack is a fresh random draw each step), so
   boats sit head to wind or wheel round and run off for a minute: beats 448–909 s against 337 s at polar VMG, and the
   last boat 63% behind the winner where the real SF fleet's median is 12% (sf-folkboat-results.json). Holding the
   decision (as autopilot.ts does) gives beats of 349–428 s and a 12% spread. Probably the strategist's "planned at
   38 min, the AI took 47–71". And (AI 2) AI boats hit the committee boat (avoidMarks steers clear of its windward end
   only) and some never start.
4b. **The AI sails at the mark** (AI 3, 4, 8, 9; done: the crab for the current reaching, the run angle and gybing on the
   laylines downwind, headers from her own wind held 10 s; to do: the planner's 8 s a tack; and the AI fouls at the
   windward mark: 3–7 two-turn penalties among five boats in a 620 m race, the base code as much: mark-room and
   right-of-way handling there): no allowance for a cross-current reaching (1.5 kt costs 5%, 2 kt 15%:
   she ends up running), no run angle or gybing on the laylines downwind (2–6% VMG in 6–12 kt, and 3–14 gybes on a
   620 m run as the wind swings through dead downwind), headers judged from the course-wide wind rather than her own,
   and the planner charges 8 s a tack where the physics' own tack costs 3.4–5 s (0.8–1.2 boat lengths, the low end of
   US Sailing's 1–2 for keelboats).
5. **The waves move her only on average** (waves 1): a mean added drag and a synthetic yaw; no surge, roll, pitch or
   heave, so no hobby-horsing in the Bay's 2–3 s chop (her pitch period), no rolling on a reach, no surfing, and the
   telltales don't answer the pitching. The drawn hull rolls on the waves the physics doesn't have, so heel, sails and
   flags don't answer the same motion. Needs the wave field shared by the physics and render/waves.ts (render's owners).
6. ~~**The swell's yaw is wrong in kind**~~ (done: a slender hull's Froude–Krylov moment) (seaway.ts waveYaw): it doesn't fall with wavelength (a slender hull's
   Froude–Krylov yaw goes as k²), and peaks abeam not on the quarter: up to 16° heading swings and 3% speed lost in a
   2 m 13 s swell outside the Gate, where it should be next to nothing.
7. ~~**No leeway**~~ (done, owner's yes) (hull 1): she slides along her heading. At speed the polar's VMG is right (its angles are course
   angles), but slow she should slip: 0.3–0.7 kt to leeward at 1.5 kt close-hauled in 12 kt, so a boat parked on the
   line sags onto the one below her and each tack costs 0.2–0.4 boat lengths more. Now: the sails' side force against
   the keel's lift (slender wing, Newman §5.12) and the hull's broadside drag, as a sideways motion; close-hauled 2.9°,
   4.3° and 6.0° in 6, 12 and 20 kt; slow, 0.36 kt at 1.5 kt in 12 kt. The polar's speed is her course's; the sails
   are trimmed and their forces read in the wind across her course (turned from her heading by her steady leeway), the
   frame the sail model was calibrated in before leeway: a calibration choice, not shown from ORC's documentation (its
   VPP PDF isn't reachable from here). A real windex reads her leeway less; recalibrating trim.ts's angles (the jib's
   8° sheeting limit and 18° angle of attack, both unsourced) in the hull's frame belongs with item 9. She, the AI and
   Nav steer her leeway above the beat. The compass's "tack" marker and its mean close-hauled
   heading allow for it too (ui/hud.ts); the laylines are right as they are (her track). Hove to in 8 kt is a knife edge (a few % more speed going
   in and she rounds up and tacks; it was before leeway too).
8. ~~**Too much push from rest and through a tack**~~ (done: the drive's shape from the sail model, driveCurve.ts; 1 kt → 90% close-hauled in 6 kt now 50 s; the Delft resistance, below, still to do) (hull 2): driveBoost ×1.6 everywhere; ORC's own sail model gives
   0.7–0.8 of the full-speed drive close-hauled at rest (more only from 120°). 1 kt to 90% close-hauled in 6 kt takes
   32 s, the force model 45 s. And the upright hull's resistance at 3–5 kt is 24–37% above the Delft series (hull 4).
   ~~The AI's slow tack on a hail~~ (done, branch ai-hail-tack: a hailed boat that puts her helm down at once had been
   called in breach for not reaching head to wind in 5 s, and then fell back onto her old tack; starting to tack is now
   her response under 20.2(c), and a slow AI boat tacks through rather than gybing round). The Delft resistance is
   blocked by data: the Folkboat's hull form (waterline beam, canoe-body draft, Cp, Cm, LCB, LCF) isn't published in
   any source found, and the DSYHS coefficients only in a secondary source (a 2022–23 ULiège thesis reproducing
   Keuning & Sonnenberg 1999). It needs the class lines plan and offsets (NFIA Plan 1, 1961).
9. **Sail shape and speed** (sails 2, 6): ~~speed went as the square root of drive~~ (done, branch sail-shape: a share of
   the drive is now worth what it is where it meets the hull's resistance, with the sails' drive changing with her speed:
   dynamics.ts speedForDrive. The effective exponent runs from about 2 in 6 kt to 4.7 near hull speed in 20 kt, so a 20%
   loss of drive costs 4–6% of speed in a breeze, not 11%; the step, the crew's depowering search, the coach and the
   debrief all count it the same way). RIG.fullDepth: kept. ORC's own text (VPP Documentation 2022, §5 and after eq.
   5.48) makes flat = 1 the maximum lift, and its maximum lift the sail at its fullest ("the inability to increase sail
   camber in light airs" is why a simple rig has less), so full power at the light-air depth is ORC's reading, not an
   error (the depth itself, 0.145/0.141, is still unsourced: no camber figure for a Folkboat, or ORC's flat against
   camber, was found). ORC's least flat is 0.42 since 2023 (VPP Documentation 2023, §5: "reduced to 0.42 from 0.62"),
   as the sim's flatOf has it.
10. **In irons** (hull 3): ~~at rest she turns 4°/s the way the tiller points and sails off~~ (done, branch in-irons:
   with her sails up she gathers sternway, the rudder works backwards by its flow, and the 4°/s at a crawl is sculling,
   only as RRS 42.3(d) and World Sailing's interpretations allow: from above close-hauled to either tack's close-hauled
   course, not back against itself, not against a backed jib; backing the jib keeps her sternway). ~~No yaw inertia~~
   (done, branch yaw-inertia: her turn answers the helm with the hove-to model's own time constant, 0.6 s at 4.7 kt,
   2.8 s at 1 kt). Open, unsourced either way: sternway in a breeze (2.2 m/s in 22 kt, 2.7 in 28, on the ahead
   resistance curve going astern: a transom-first hull may drag more); held amidships head to wind she never sheers
   off; in 6 kt held head to wind she makes a little headway as she rolls from side to side (the roll's sweep).
11. **The chop** (waves 3–6): ~~it follows the wind at the boat, so a puff or a neighbor's lee changes her sea~~ (done:
   the wind over the water); ~~it's fully grown at once~~ (done) (CEM: 3.4 h to fetch-limited on the Berkeley Circle
   in 18 kt, so 2.5× too big an hour into the breeze); ORC's polar already has a seaway drag in it (eq. 3.2, D_raw), so
   the chop is partly counted twice and "flat water" isn't flat (est. 1–3% upwind); and its added drag falls off too
   little toward the beam, so footing hardly pays.
12. **Heel** (sails 3, crew 3, hull 6, 9): 21–25° upwind from 18 kt is the high end of practice (no Folkboat figure is
   published; Elvstrøm's H-boat guide 6–10°, general keelboat guidance 15–20°, 20–25° at most) and is set by heelFactor's
   unsourced knee at 20°. Fixes: the Delft series' heeled resistance; the deck edge from the class freeboard (0.568 m:
   about 27.5°, not 30°); the effective draft from the Delft series by heel and speed (the speed search's induced drag
   is about 1.5× Delft's, the hove-to model's about right).
13. **Pointing and the top of the range** (sails 4, 5, 7): a flatter sail can't point higher (luffing starts at a fixed
   angle of attack whatever the camber), so the guide's "sheet tight … pointing ability is improved" has no effect;
   above about 26 kt nothing is left to depower (ORC next reduces the jib, then reefs: VPP 2022 §5.1.3), and ORC's
   flattest is 0.62 × the 8-kt flat in the 2022 documentation against the sim's 0.42 (the 2025 text unconfirmed).
14. Smaller: in chop the best beat narrows by 0.2–0.4° where the comment says footing pays (the added drag rises
   with speed and the acceleration boost is used as a steady drive: AI 6); the leeward-mark round-up loses a third of
   her speed in 18 kt (unsourced); the results file's 2025-11-01 distance looks wrong (7.8 kt over 6.1 nm in 7 kt);
   the rudder (class rules' offsets give about 0.56 m² below the waterline against RUDDER.area 0.42; its drag's
   aspect 1.4 against the lift slope's 2.5; a keel-hung blade works partly as a flap); HOVE.latArea 5.01 m² and dragAft
   0.54 m from the drawn profile without the rudder (not 3.39 m² and a tuned 0.3); the crew (DEFAULT_CREW 230 kg against
   the certificates' declared 240–308, mean 276; the light-air heel target steps at 7 kt; legs over the side on a reach,
   which CR 13.20 allows); the sails' weight aloft (negligible, −1.8% GM); crewSolve's start dependence; the twist
   function against VPP 2022 eq. 5.49; the chop's peak period (SPM against CEM, 25% apart); added masses.
15. ~~The keel's induced drag fell with heel~~ (done): ORC's FH is the force normal to the center plane (VPP 2022 §3),
   not its part across the water, so heel was nearly free to the speed search (about 2° less heel at 18–20 kt now).
   ~~The ×0.6 on heel past 120° TWA~~ (done: no source; the heel follows the balance of moments everywhere).
Checked and sound: the hiking geometry against CR 13.20 (only mid-thigh to feet must stay inboard), the roll period
(3.5 s, Klaka) and its damping, the wind gradient (ORC eq. 7.1) and heeled triangle, the sea's growth laws, wave–current
physics, whitecaps, Kelvin wakes, fatigue, the tiller pilot, the condition model, determinism.

**Depowering: the physics against the sailmaker** (owner, November 2026: "crew follows the guide for now, but let's keep
this on the roadmap as something to investigate"; 4–8 h). With ORC's sail and keel physics, a speed search like ORC's
VPP (physics.ts powerFactor) has a Folkboat carry full power to about 17–18 kt; North Sails' Nordic Folkboat guide has
the outhaul on its band above 12 kt, the Cunningham hard above 15 and the traveler eased down above 14. Fitting the
heeled hull's drag to close the gap needs an impossible value (19% of her speed at 16° of heel), so the crew follows
the guide's line settings and the search decides only the depowering past them. Candidates: ORC's own flat and twist
optimum for a low-stability boat (does ORC's VPP itself flatten a Folkboat at 14 kt?); pointing, which the guide's
settings may serve and the sim's fixed polar beat angle can't reward (a flatter sail points higher: VMG, not speed); the
heeled hull's drag from a real lines plan; the shape model's depth and twist ranges against measured sail shapes.
Open, the rig's height datum (November 2026, the Coordinator: keep the physics on the ORC certificates; settle if the
IMS rule text becomes reachable): the drawing measures the rig from the deck at the mast, as CR 6.1.11 does (the Lower
Mast Point 1000 mm above the deck, along the mast's after side); the physics (balance.ts RIG) uses ORC's BAS 1.00 and
IG 6.50, which ORC measures from the sheer at the mast (VPP Documentation 2026: HBI, "height of sheer at the base of
I"). The deck's camber there is about 4.5 cm, so a class-legal Folkboat's band would be about 1.045 m above the sheer
while the certificates say 1.00: one of them is nominal. If the class rule governs, the sails' heights rise 4.5 cm
(about 0.9% less induced drag, 0.9% more heeling arm). The IMS definition of the mast datum point would settle it
(orc2.orc.org and osiris.ffvoile.fr were blocked from the sessions).

Open items from the physics review (November 2026): the sails' "full" depth (balance.ts RIG.fullDepth) is unsourced, so
ORC's full-power lift is never reached above about 10 kt (this partly hides the gap above); ORC's default crew for
the sailing displacement is about 300–330 kg against the sim's 240 (GM 0.50 rather than 0.52); the sails' own weight
aloft is left out (ORC eq. 4.9); the hove-to force model's keel is a slender wing (Te² = 2T²) while the speed search
uses ORC's effective draft; the crew's line planner (controls.ts crewSolve) is a local search, so two boats can settle
on different but equally good settings. Speed (November 2026, the same race five times, median µs per world step,
fleet of 5): the training course 461 against main's 420 (+10%), Seaweed Soup 444 against 422 (+5%), down from +40% and
+18% (the hull's resistance tabled, the heel solve warm-started, the depowering search cached and simpler, no per-step
allocations in the puffs and the crew). What's left is spread thin: the crew's per-step placement and jobs, the heel
solve, and the search's first look at a new wind (it fills in over a race). (Since: the performance review below.)
Also found on the way: the outhaul's range was five points of camber, past what its black band allows (now about 1.5,
the guide's range), and the mainsheet's hold on the leech is now from its geometry (the slant from the boom end to the
car, an estimate between the end points).

~~**Performance review**~~ (owner, November 2026: no lag or crashes as the sim grows; done, v78). **The budget**: a steady
60 fps on a typical laptop in a full race (eight boats, ships, wildlife, the chart): a frame's JS (the sim's steps, the
scene's update, labels, HUD and maps) within about 8 ms of the 16.7, and the sim's steps within 3 ms of that at 4×
speed; at most 2,000 draw calls and 2 million triangles in any view, day or night; the page up in under a few seconds;
GPU memory and the JS heap level from race to race (no climb over a long session); the page well under the 16 MB
limit (3.5 MB). **Measured** (headless Chromium with software GL in this container: draw calls and triangles are what
a real GPU gets, frame JS here is about 3× a laptop's; the sim in Node), before → after:
- The sim (median µs per step, fleet of eight on course 10 in 22 kt, Node): the whole race 534 → 354 (−34%), its start
  450 → 349; the training course with five 289 → 216, Seaweed Soup course 2 with three 152 → 113. Every race the same
  to the last bit (full-precision state after each race compared with main's). From `shoreNearest` (an exact list of
  the segments that can be nearest anywhere in each 25 m cell, in place of the ring search: it was a third of a step),
  the chop's added resistance and the drive worked out once per speed search, not 30 times, and the clock's
  `Intl.DateTimeFormat` made once.
- Memory: every new race (and every change in the setup, which builds one) left the last fleet's geometry, materials
  and sail textures on the GPU, about 1,350 geometries and 45 textures a race; now freed (render/dispose.ts), and the
  counts stay level race after race. Ships hidden when traffic is off (the last race's had stayed where they were).
- Draw calls (full fleet, before → after): at the start in the chase view 1,780 → 1,740, overhead zoomed out
  2,020 → 1,160, night at the East Span 2,300 → 1,640, night from the start line 1,990 → 1,120. Each boat is about 180
  draw calls; her fittings smaller than half a meter are left out while they'd cover less than a pixel (render/fittings.ts),
  which changes nothing you can see. Triangles 1.0–1.3 million everywhere.
- Frame JS (here, chase view at the start): about 31 → 21 ms (≈ 7 ms on a laptop): the wind map on the water no longer
  works out the shore distance it threw away (25,600 points every 0.15 s), the wave height's directions' sin and cos
  kept (the wakes ask it 5,000 times a frame).
- Nightfall: the city's and the bridge's lights and the sun's shadows going off needed about 50 new shaders compiled in
  the frame night fell (0.6 s here); now compiled in the background at the start of each race (scene.ts warmShaders).
  What's left is a 0.2 s frame here (first upload of the night lights' buffers): a frame or two on a laptop, once.
- Page load (the published page): about 1.8 s to the start page here, 0.65 s for its first frame; a race starts in 0.2 s.
- Kept from creeping back: tests/perf.test.ts (the sim's µs per step for the full fleet against a fixed reference
  workload, so it holds on any machine; in `npm test`, not `test:fast`) and scripts/check/perf.cjs (draw calls, triangles,
  programs and frame JS for seven views, and GPU memory over six races; exits 1 over budget). The ` key shows the
  frame time, draw calls and memory on a real machine (ui/perfMeter.ts).
Left for later: the boats are still most of the draw calls (eight boats ≈ 1,450 near the start); merging each boat's
fixed parts by material would save about 50 a boat (exact, but it works against the pixel test above). The scene's
JS is now three.js's own draw submission (proportional to the draw calls), the wakes and the boats' sails. The sim's
step is spread thin: the AI's look-ahead, the crew, the tide field's blending of its stations.

Then, unranked: ~~start screens~~ (done: Race → create a race or run a past race; one-screen setups with the day's real conditions beside your choices; Settings); deep physics pass (begun, November 2026: stability from ORC certificates, the sails' forces from ORC's model, the
wind's gradient and the heeled wind triangle, the keel's induced drag, depowering by a VPP-style speed search; still to
do: the audit's ranked list above (the depowering question, waves and puffs in every response, the gusts' peaks
against the records among them); in progress: Deep Physics); skipper and crew model (15–25 h); cheating, protests
and hearings (8–12 h); validation against real fleets (4–6 h); rig tuning (5–8 h); seasons and awards (6–10 h); the Bay
in depth (~~done~~, published); crew figures and animation (moved up to now, above); ~~NOAA charts on the map~~ (done); the Bay to Berkeley, Alameda
and Richmond (10–16 h); ~~Gashouse Cove, South Beach and Corinthian marinas~~ (done); Sam's (3–5 h); accounts for other
players (3–6 h); ~~AI leeward starts and generic AI boats~~ (done); real slip numbers and nicer moored boats (4–6 h); real
past races (8–12 h); ~~accuracy fixes: the GGYC/StFYC line, the Cityfront shore from OSM, Rule 20 at the islands~~ (done);
phone layout (on hold, 8–12 h).

Checked: RRS 52 and the ERS rudder definition (primary sources), and the ST2000+'s 4,500 kg rating (Raymarine). Still
unconfirmed: the ST2000+'s hard-over time (now 4.5 s, from secondary sources), its AutoTack default (100°) and AutoTrim;
the handbook (Raymarine document 81130) wasn't reachable.

## The owner's list (November 2026, to prioritize)

~~The full-screen chart and a tiller pilot~~ (done; the ST2000+'s AutoTack and AutoTrim still unconfirmed).
Then the skipper/crew model (calibration data first; Yacht Club sliders; crew skill driving trim, pole and puff calls; AI
skippers acting on what they believe; cheating, protests and hearings).

**The Yacht Club** (owner's direction, 12 November; Crew Model and Skipper Model are drafting a joint design): the Yacht
Club is the place where crew members are created, configured and assigned to boats, and where the owner sees and
creates the other skippers and their details. The race setup shows the boat's assigned crew, swappable there, but isn't
where crew are configured. It's the home of the skipper and crew model's sliders above, and later of Seasons' rankings
and awards (below), which become attributes of the winning boat and skipper.

Also asked for:

- **Rig tuning:** mast rake, shroud tension, pre-bend from the mast heel, forestay sag; each in the physics.
- **A race strategist** in the course view before each race, there to teach, not to win the game for you: the day's
  conditions and how they'll change, the favored side and course options (one plan, or several when it's uncertain), the
  competition, and trim and tuning by phase ("it starts light, so…; it'll build late, so watch…"), with specifics.
- **A navigator** in cruising, doing the same for the route: timeliness and safety (current gates, the slot, shipping lanes).
- **Easier sail controls:** bigger targets; adjusting one line takes only that line off auto, and it's easy to put it
  back. Longer term: working the lines on the boat itself.
- ~~**Crew weight in the physics:** the low side in light air, hiking in a breeze, body-tacking, moving forward downwind; the AI
  crew doing it by skill; the boat answering every shift; an option to move the crew yourself.~~ (done)
- ~~**Real timing and sequencing of adjustments:** cars rarely moved (it takes time, means leaving the cockpit, which moves
  weight, and the working car usually can't be moved under load); the order and pace of every adjustment set by the number
  of crew and their skill.~~ (done)
- **A deep pass on sail and boat physics:** every crew move, wave, puff and line adjustment makes a response, from real
  science and maths.
- ~~**Cleaner start screens.**~~ (done) Race: create a race (club sponsor, course or the committee's choice, competitors, your crew,
  start time; the real conditions for that day and time by default, overridable) or run a past race. Cruise: likewise
  pared back. First an audit of every start-state screen for redundancy and friction.
- **Seasons** from real events (the Midwinters…), with rankings and awards that become attributes of the winning boat and skipper (shown in the Yacht Club, above).
- ~~**The Bay, in depth:**~~ (done: Fort Point, the Bay Bridge's west span, Angel Island, Coit and Salesforce, puffs, waves, wildlife; the wildlife remade from the species by v147, #143: gulls, pelicans, cormorants, seals, porpoises and Pier 39's
  sea lions). bridges that reach the shore, Angel Island without the odd houses, a true Coit Tower, the
  Salesforce Tower; puffs you can see on the water; natural waves; seals, porpoises and birds that look and move right.
- ~~**The Bay Bridge and the city at night**~~ (done, v69: the West and East Spans, The Bay Lights' patterns dusk to dawn (their current hours unconfirmed), the skyline lit, reflections; pier positions approximate until overpass-api.de is reachable; the overlit skyline fixed in v79: lit windows follow the DOE reference buildings' lighting schedules, offices 50% at 19:00, 10% by 22:30, 5% on weekend nights, clustered by floor. more far glow on the towers on weekend nights in v80 (owner's call); the homes' peak lit share stays at 0.3) (owner, November 2026; 6–10 h): a high-quality Bay Bridge (the West Span's
  suspension towers, cables and anchorage at Yerba Buena Island, the East Span's single tower), with **The Bay Lights**,
  the LED sculpture on the West Span's vertical cables, in its real patterns after dark; and the downtown skyline lit at
  night (windows, the Salesforce Tower's crown, Coit Tower floodlit). The sun and sky are already real for the race day
  and time, so the lights come on at real dusk. Sources: Caltrans and OSM for the bridge's geometry; the Bay Lights' own
  published specifications for its LEDs and patterns.
- ~~**Lights on the boats at night**~~ (done, v69: sidelights and sternlight or a masthead tricolour, by the Rule 25 arcs; the rule text couldn't be fetched here, so arcs and ranges are flagged in src/render/navLights.ts for checking) (owner, November 2026: "make them beautiful"; 4–6 h): the real navigation lights for a
  sailing vessel under 20 m (Inland/International Rules 25): red and green sidelights over 112.5° each, the white
  sternlight over 135°, or the masthead tricolour as an option under sail; the steaming light when motoring and the
  all-round white anchor light at anchor or on a mooring. Their sectors exact, so you can read another boat's heading
  and right of way from her lights, as the rules intend (and the IRPCAS teaching uses it). Beautiful as well as right:
  soft glow and bloom, their reflections trembling on the water, warm cabin light through the ports, the compass lit,
  a red cockpit light, and the moored and anchored boats' lights round the harbors.
- **Crew figures and animation:** natural bodies and positions, moving as the physics moves them and as they work the lines.
- ~~**More marinas:** Gashouse Cove, South Beach, Corinthian (Tiburon) to start.~~ (done)
- **Sam's, Sausalito:** dock at Sam's (and have a beer).
- **Save or discard** after each race or cruise: asked when it ends, before it goes in the logbook.
- **Heaving to, and the other seamanship maneuvers** (a real-world stress test the sim fails today): each jib sheet on
  its own, so the jib can be backed to windward; the tiller lashed at a set angle; the physics of a hove-to boat (backed
  jib against a feathered main and the rudder, fore-reaching slowly and drifting to leeward) checked against real boats.
- **Real nautical charts on the map:** NOAA's official charts (the US nautical charts are NOAA's; USGS makes land maps):
  chart 18649 (Entrance to San Francisco Bay) and its neighbors, as raster tiles or drawn from the ENC vector data
  (depths, channels, buoys, lights, restricted areas), on the inset map and the full-screen chart.
- **Map layers and contrast** (requested): ~~layers on the inset map and the chart (wind, current, sea state, fog from
  real visibility only, ships, laylines, wind shadows), saved per player; the sim's overlays in colors the chart
  doesn't use, on halos~~ (done). Next: **fog in the 3D scene and on the water** from the same real visibility (today
  the 3D fog bank is an estimate by month and hour), and **its effect on sailing**: you can't see marks, boats or ships
  beyond the visibility, so no transits, laylines by eye or sighting the next mark; ships sound their fog signals (and
  the bridge's and the lighthouses' horns, with their real characteristics from the chart); the AI navigates by
  compass and chart in it. Observed visibility comes from one sensor (Pier 17, 7 km inside the Gate): the Gate's own
  fog can differ.
- **The Bay to Berkeley, Alameda and Richmond:** the shores, harbors and marks east and north, with the wind and current
  fields extended over them (NOAA current stations and the NWS grid already reach there). In progress (Bay East):
  ~~the world east to Oakland and Alameda and north past Richmond to the Brothers (terrain, land from NOAA's chart, the
  chart and inset map), the currents (75 NOAA stations, every one within 0.04 kt of NOAA's predictions) and the NWS grid
  over the new water, every shore slowing the wind and easing the stream, the East Bay's and Richmond's marks, the
  Richmond–San Rafael Bridge, the Brothers, the Berkeley Pier and Long Wharf (solid), the Port's cranes, the Bay
  Bridge's East Span on its real line, the Berkeley Marina, Richmond YC's Brickyard Cove and Encinal YC as harbors you
  can sail into, docks and breakwaters solid, and a berth at BYC's guest dock, inside a basin that takes in the water
  within the breakwaters~~ (done). Next: their slips (only a few fingers are mapped in OSM: Berkeley's
  B–E are combs, F–O lines; the other harbors' dock letters and slip numbers aren't published where we could reach;
  berkeleyyc.org, richmondyc.org, encinal.org need allowing), BYC's guest dock, and Ballena Bay (no marina outline in OSM). ~~The Estuary's other harbors as water to sail into: Oakland YC, Marina
  Village, Fortmann, Grand Marina, Alameda Marina (Island YC)~~ (done, no berths). Polish: the narrow basins (Marina
  Village's) are only partly cut out of the 50 m terrain, so from the air a few docks seem to stand on land. Polish: the land's 50 m cells make a
  stair-step coast from the air (the Berkeley and Emeryville shores); the terrain stops at the world's edge (122.1886 W since San Leandro Bay was added,
  37.985 N), so from high up the hills east of Berkeley and Oakland end in a straight cut.
  Open questions from review: ~~Richardson Bay's current~~ (done: NOAA's 2012 ADCP record there, SFB1219, fitted by the
  sim, peak about 0.4–0.8 kt against Raccoon Strait's 2–3 kt); ~~San Rafael Bay's current~~ (done: a dead end, so by continuity: Point
  San Quentin's tide, NOAA 9414873 from San Francisco's constants by NOAA's offsets, fills and empties the water beyond
  each line across the bay, NOAA chart depths; peak about 0.1–0.3 kt over the open bay against 1.7 kt at the mouth,
  handed over across the first kilometer, but up to about 1.5 kt in the creek channel off San Rafael around spring low
  water, when the flats beyond it (their drying heights from the chart) drain through it; USGS's San Pablo Bay speed-against-depth relation was tried first and rejected in review,
  as San Pablo Bay's shoals sit beside a channel carrying the whole North Bay's tide while San Rafael Bay has nothing
  behind it); ~~San
  Leandro Bay's current~~ (done, bay-east-8: the world taken 2 km further east, to 122.1886 W, and the bay filled
  by continuity like San Rafael Bay, San Leandro Channel's tide, NOAA 9414724, less the Tidal Canal's measured flow,
  NOAA's SFB1216 fitted depth-averaged over its section by Manning; the chart's drying flats now wetted through their
  own bands (DRVAL1 to DRVAL2: they had sat near high water, in San Rafael Bay too); the canal carries much of the
  fill, the San Leandro Channel the rest, never against the slope (about 0.5 kt peak at its mouth); left out: the
  bay's water south of the world's edge (toward Oakland Airport) and its marsh, so the fill is a little short, and the
  canal's jet into the bay, handed over to the bay's own stream within 500 m of the canal's mouth; over the flats the
  stream is held to a long wave's speed in its depth, √(gD), where continuity through a nearly dry line would drive a
  bore); BYC's and Encinal YC's own racing marks aren't published where we could
  reach (yra.org, berkeleyyc.org and encinal.org are blocked here); the Port's crane colors, counts per terminal and
  sizes, the Richmond–San Rafael Bridge's paint and deck profile, and East Brother's house colors are unconfirmed
  (portofoakland.com, dot.ca.gov and eastbrother.org need allowing).
  East Bay landmarks you navigate by (owner, 13 November; with Bay East; 2–4 h): the **Berkeley Campanile** (Sather
  Tower, on the UC Berkeley campus) and the **Claremont Hotel** (the large white hotel in the Berkeley Hills). Both are
  sighted from across the Bay for bearings and transits, so their positions, heights and outlines need sourcing (OSM,
  the university's and the hotel's own figures) and they belong in the landmark set used for transits, like Coit
  Tower and the Transamerica Pyramid.
  **Sutro Tower, properly built** (owner, 13 November: "it's sort of decapitated at the moment"; accuracy; a navigation
  landmark already in the transit set, src/sim/transits.ts; 3–5 h). Today (render/landscape.ts) it's three banded legs
  to 298 m with crossarms at two levels and thin masts on top. Find why it reads as cut off: the masts too thin to
  see, the top lost to the far clipping plane or the fog, or the base sunk in the terrain. Build it to its real form,
  sourced: the three-legged frame with its two levels of crossarms, the antenna masts on top, its red and white bands,
  and its aircraft warning lights at night.
- **Accounts and logins:** other people play in their own instance, their boats, saves and histories kept from session to
  session. First: make your own saves durable (today a republish can lose race history and boat changes).

## Training tools (owner, 12 November; ranked by the owner: the wind indicator first, then the flow view)

Owner: "As part of the training tools suite, let's build a sort of midair wind indicator, like an arrow or series of
arrows floating in the air showing where the wind is. Ideally we could also build a second view showing how the wind is
traveling over the hull and sails to help players learn about sail shape and laminar flow."

- ~~**1. A midair wind indicator**~~ (done: true and apparent wind in the air beside her at three heights, key `, physics-reviewed) (2–4 h): arrows or streamers in the air around the boat showing the true and the apparent
  wind, direction and strength, switchable. At several heights, so the wind gradient and the apparent wind's twist up
  the rig (already in the physics) can be seen.
- ~~**2. A flow view**~~ (done: key \, two physics reviews; the labels say which is the sim's, and that the slot isn't modeled) (8–14 h): streamlines over the sails and hull showing attached and stalled flow, the slot between the
  jib and the main, and the telltales' story, driven by the sim's own apparent wind, angle of attack and sail-shape
  model. True to the physics, and labeled where it's illustrative.

- **3. The tack and gybe drill, made a real drill** (owner, 13 November; next; 4–6 h; UI & Experience to mock it up for
  the owner first). Built: every maneuver scored against a good crew's, with what to change (#218). The owner's feedback:
  "the coach info is too far away from the boat for me to see it and keep an eye on the boat at the same time. it's
  also too much copy to read in the moment. I need contextual cues to help me know when to tack, when to wait, etc.
  maybe even some on-water tracks or something. this doesn't feel different from regular cruise mode."
  - **Cues where you're looking, in a word or two:** beside or above the boat, not in the Coach card: "Build speed",
    "Tack now", "Hold", "Ease", "Trim". The full advice moves to after each rep.
  - **On-water guides:** a lane or track drawn on the water showing the line to sail, where to start the turn, and the
    new course after it; a target heading mark; and her wake shown against the ideal turn afterwards. All drawn from
    the sim's own polar and turn model.
  - **A drill's own shape,** so it doesn't feel like cruising: a set course in open water, numbered reps, a short
    score after each (speed lost, distance lost, the turn's rate and the tiller's), and a best-of summary.
  - On the screen rule: the cues live on the water and on the boat, not as new buttons.

- **4. A learn-to-sail mode** (owner, 13 November: the on-screen tiller instructions don't need to be there, "except maybe
  in a 'learn to sail' mode, which we haven't even roadmapped yet"; not ranked; a design to the owner first). For
  someone who has never sailed: the parts of the boat, steering with the tiller, the points of sail, trimming to the
  telltales, tacking and gybing, heaving to and docking, each as a short guided lesson on the water, with the
  instructions on screen there and nowhere else. It builds on the drills, the wind indicator, the flow view and the
  coach. The lessons' content should be checked against a recognized syllabus (US Sailing's Basic Keelboat, for one).

## Next up

- ~~Real SF Bay currents and tide timing~~ (done: NOAA stations, any date, offline). Later: eddies behind points, using NOAA's SFBOFS model output for the spatial detail between stations.
- ~~Afternoon westerly~~ (done: NOAA wind records by month and hour, the slot, shore effect, drifting puffs and lulls shown on the water). ~~Winter winds~~ (done: westerly, northerly, southerly and light days by their frequency in the records). ~~Real wind for a past race day~~ (done: observed every 6 minutes since 2021) and ~~the forecast~~ (done: NWS, refreshed daily). ~~The wind across the course~~ (done: the NWS grid for forecasts; station-nudged terrain model for past days). Later: the AI sailing to the pressure; a gridded observed analysis (NOAA's URMA) for past days.
- ~~**Wind shadows**~~ (done: boats' dirty air, ships, the committee boat, the lee of the land). Later: wakes laid down as markers and carried by the wind (so a wake stays where a boat tacked); the AI choosing a clear-air hole on the line; the wind bending round the islands and speeding up on their flanks.
- ~~**Race debrief**~~ (done: what cost you time, ranked, with tips). ~~Show each item on the replay~~ (done, v127). ~~Compare against the boat that won~~ (done by v147: the replay shows your race against the winner's, leg by leg,
  physics-reviewed).
- ~~**Remaining rules.**~~ (done: 18.2(c)/(d), 18.4, 19, 21.3, 23, 43.1(a), 44.1(a), touching the committee boat). Later: backing a sail. (Rule 19 and 20 now apply at the islands and the Marin shore too, and 20.2(e).)
- ~~**GGYC and StFYC, and the start line.**~~ (done: the GGYC clubhouse on OSM's footprint at 37.8077 N, the line's inner end on the seawall in front of it, about 410 m to X on 351°; StFYC was already right). Later: the race-deck marker's exact spot and the line's wording from GGYC's own current sailing instructions (only third-party summaries of past SIs were reachable: "an orange marker on the race deck" to X), and whether X is the YRA's position or NOAA's 66 m away.
- **Real shoreline.** ~~Make Marin, Angel Island and Alcatraz solid~~ (done, from the 50 m terrain). ~~Replace the hand-traced Cityfront outline with real coastline data~~ (done: OSM's coast from the Gate's south shore round Fort Point to Pier 27, with the open piers, breakwaters and Pier 39's docks; east of Pier 27 is still hand-traced). ~~The AI's and the tiller pilot's look-ahead stepping over piers~~ (done: geo/shore.ts landAlong tests the whole line exactly) and ~~Rule 20 hails at the islands~~ (done: at every obstruction, src/sim/obstruction.ts). Still to do at the Wharf: the sea lions' floats at Pier 39 aren't solid. Rule 20 still to finish (from the final review): 20.3, passing a hail on to a third boat on the same tack (a hailed boat tacks at once now, even with a boat to windward); 20.2(e) should keep 18.2 off until the hailer has tacked and kept clear (it lapses on a breach call or after 30 s); `fetchingIsland` should also require passing to windward of the island (not reachable today); and an AI boat pinned by a windward boat that could clear by bearing away 10° tacks instead of sailing round.
- **Your boat** (done: looks, flags, condition; the stern, transom, cabin, coamings, her name on the cabin side, the cockpit lip and the after-deck cleat, v71–v77). Later: rig tune (mast rake and the mast-heel position that sets pre-bend, forestay sag); a varied AI fleet (some boats with dirty bottoms and tired sails); hours on each sail instead of three ages; the US courtesy flag's placement checked against the club's own rules; flags hoisted again after you finish.
  Owner's requests, 12 November (unranked; the owner will rank them):
  1. Significantly more hull paint colors (Boat Detail).
  2. Color options for the sail numbers and the F class letter (Boat Detail).
  3. The interior and cockpit material, teak or fibreglass (Boat Detail).
  4. The drawn rigging lines in the colors chosen for the control panel (the Boat page's line colors), so each line
     wears its control's color (Rigging, with the rigging rendering).
  5. A tactical compass on the cabin top, as Josephine's Tacktick-style unit at the mast foot
     (reference/photos/josephine-cabin-top-forward-port.png): usable in the game, readable from the cockpit camera,
     showing heading, and used tack to tack to read lifts and headers like the real one (Boat Detail for the unit,
     UI & Experience for its readout).
  6. The deck less flat and static: texture and depth, the non-skid pattern and wear, as in the photos (Boat Detail).
- **The Seaweed Soup courses** (done: all 41). Done too: the race committee choosing the course from the wind and the tide, flown in numeral pennants. Later: postponement (AP) when there's no wind to race in; shortening course (S); laylines that clear Alcatraz's shore rather than its light; the wind's shadow behind Angel Island and the current around the islands (today the current is the open-water current everywhere but the Cityfront).

## Sea state, and reading the water (requested)

The principle: everything you see on the water comes from the same wind, current and wave fields that the boats sail in. A tideline is drawn where the current field really converges; a puff is dark because the wind really is stronger there. Reading the water should give you true information, as it does on the bay, and never decoration that lies.

### Sea state in the physics — done (see README, Sea state)

Done: wind chop from the wind over the water and the fetch on the real coastline (JONSWAP growth); swell from the SF Bar buoy record by month, dying away inside the Gate; wind against tide from wave–current physics; added resistance (footing pays in chop), wave yaw; flat-water or real, and a small/typical/big swell day. Later:
- ~~**Duration:** the chop takes time to build when the breeze fills in~~ (done: CEM's duration-limited growth, run up through the day's own wind from the calm morning; a set strength has been blowing for hours). Later: a sea that lingers as the wind drops.
- **Pitching in the physics** (today it's visual): hobby-horsing in a short chop, and steering harder through it.
- **Archived buoy data for a past race day** (with real past races), and the ocean wind sea through the Gate as its own component.
- **Shoaling** over Harding Rock, Point Blunt and the bar.

### What the water looks like (the cues sailors actually use)

- **Puffs and lulls:** darker, rougher patches where the wind is stronger, moving downwind across the water toward you; lighter, smoother patches in the lulls; cat's paws in light air. Whitecaps starting around 12 kt, foam streaks lined up with the wind in a strong breeze. Their shape and speed come from the wind field, so you can see a puff coming and judge when it will reach you.
- ~~**Tidelines and current lines:**~~ (done, from the current field's convergence; color change not yet) where currents of different speed or direction meet (along the edge of the Cityfront relief, off points like Fort Point and Blackaller), a line of foam, kelp and debris collects, the water texture changes across it, and sometimes the color (brown, silty Bay water against clearer ocean water). Drawn where the current field converges, so the line is where the current actually changes.
- ~~**Wind against tide on the surface:**~~ (done) visibly steeper, shorter, whiter chop where an ebb meets the westerly.
- **Eddies and boils** behind points and shoals: swirling, glassy patches.
- **Marks and moored boats:** ~~buoys lean and trail a wake downstream in the current~~ (done); ~~anchored and moored boats swing to point into the current (or the wind, when it wins)~~ (done, in the anchorages).
- ~~**The water texture moves with the current**~~ (done) (flow-mapped), so you can see the set over the bottom against the wind waves.
- **Rendering approach** (the waves and whitecaps are done; tidelines and eddies still to come): a sum of Gerstner waves (or an FFT ocean) built from the wave spectrum, with the wind sea and swell as separate components; a foam and whitecap layer driven by wave steepness; a current-convergence map for tidelines and debris; a puff map from the wind field darkening and roughening the surface. Phone-friendly fallbacks come later.

## Looks: the boats and the bay (requested)

Same principle as the water: realistic means *recognisably the real thing*, and the details a sailor uses (a transit on the shore, the committee boat's flags, a wake) should be there and correct. Rough order: most realism for the effort first.

### The boats
1. ~~**A real Folkboat hull**~~ (done, from class figures and estimated lines; refine against the official lines plan if we get it): the deep, narrow hull with its sweeping sheer, the long keel with the rudder hung on the transom, the doghouse-style cabin trunk with portlights, the cockpit well and coamings, the tiller. Wooden boats lapstrake (clinker), with the plank lands visible; yours smooth glassfibre with a boot stripe and antifouling that shows when she heels.
2. ~~**Materials and light:**~~ (done, but sail translucency) physically based materials (gloss gelcoat, varnished wood, anodised aluminum, Dacron sails with seams and a little translucency), shadows (sails shading the deck, boats shading the water), and reflections of the sky.
3. ~~**Crew:**~~ (done) helm and crew figures that hike out, move across on a tack, and sit where you'd sit.
4. ~~**Bow wave, wake and spray,**~~ (done) sized by boat speed; boats pitch and roll in the waves once sea state is in.
5. **Rigging detail:** (sail numbers and the class letter done) blocks, sheets and control lines (comes with the full sail controls), sail numbers and the class insignia.

### The bay
1. ~~**Sky and sun for the race day and time**~~ (done, with the Golden Gate Bridge modeled): the sun where it really is (we already know the date and time), glare and glitter on the water, and the summer fog bank pouring in through the Gate in the afternoon.
2. ~~**Real terrain:**~~ (done) elevation data for the Presidio, Marin Headlands, Angel Island, Alcatraz and the city hills, colored from land cover, instead of the hand-traced outline.
3. ~~**Landmarks you steer and sight by:**~~ (done, with transits for the start line and laylines) the Golden Gate Bridge, Alcatraz and its lighthouse, the Palace of Fine Arts, Fort Mason's piers, the yacht clubs, Coit Tower, the Transamerica Pyramid. They're also transits for the start line and laylines, as racers use them.
4. ~~**Marks and the committee boat:**~~ (done; no general recall yet) real buoy shapes swinging to the current, a committee boat flying the actual signals (class flag, P, I, Z, U, black flag, individual recall X) in sequence: teaches the flags.
4a. ~~**The Ferry Building, drawn properly**~~ (done by v147: from OpenStreetMap, the tower's stages to 75 m, the arcade on
   every long face, gates B–G, the Port of San Francisco sign on the Bay roofline across from the tower) (owner, November 2026: "a more complete drawing of the ferry building, with
   Port of San Francisco sign… Not urgent"; later; accuracy/polish; 4–6 h). Today (render/landscape.ts) it's a
   30 × 200 × 15 m cream box with a 60 m tower, a pyramid roof and four lit 6.7 m clock dials; no sign, arcade or slips.
   True to life (Wikipedia, Ferry Building (San Francisco)): A. Page Brown, Beaux-Arts, opened 1898; the clock tower is
   245 ft (75 m), so ours is 15 m short; the building is about 660 ft (200 m) long with an arched arcade along the
   whole base; four 22 ft (6.7 m) dials, the inner dial lit at night; ferry slips B–G behind it on the Bay side (B to
   the north, C–D the Golden Gate Ferry terminal at the center, E–G south); the plaza in front. The **PORT OF SAN
   FRANCISCO** sign has been on the Bay side since 1951, replacing "Welcome to San Francisco" (OpenSFHistory photo
   wnp25.2344). Still to find: its letter style and color, exact position, and whether it's lit at night (the Port's
   sign guidelines, sfport.com, have a Ferry Building section: that host needs allowing), the building's width and
   roof height, and its OSM footprint.
5. **The water itself:** see Sea state above (waves, sky reflection, foam, tidelines).
6. ~~**Moored boats**~~ (done: the anchorages; marinas need the real shoreline) **and marina life** in the harbor behind the line; traffic (see below).

## Ship traffic and wakes — done (see README, Ship traffic)

- Vessels passing through the race area on realistic routes: container ships and tankers in the Central Bay traffic lanes, Alcatraz and Sausalito ferries and Blue & Gold / Red and White tour boats from Piers 39–41, Coast Guard boats, pilot boats.
- **Wakes** with the real Kelvin pattern (about 19.5° each side of the track), arriving well after the ship has passed, and hitting the boat as a short burst of steep waves (slowing her and knocking her off course).
- **Rules:** these vessels aren't racing, so the Racing Rules don't apply to them: the collision regulations (IRPCAS) and the traffic scheme do. Keep out of the way of big ships in the lanes; five short blasts mean danger. A teaching moment in itself.

## Full sail controls (requested) — done (see README, Sails and trim)

Build every line on the boat as something you can see in 3D and work yourself, each with its effect on sail shape and speed. This extends the sail trim model (`src/boat/trim.ts`), which today has only the two sheets.

### Lines and where they're led (from the owner's boat)

The **piano** is the row of cam cleats on the aft face of the cabin top (the bridge deck bulkhead), one row each side of the companionway. Lines run forward along the cabin top to turning blocks at the mast.

| Piano | Inboard (by the companionway) → outboard |
|---|---|
| Starboard | Vang · Outhaul · Jib Cunningham (three cam cleats), with the jib halyard tail (uncleated) just outboard of the jib Cunningham (owner, 12 November) |
| Port | Vang · Outhaul · Jib Cunningham (three cam cleats, the other ends of the same dual-ended lines), plus a fixed clam cleat set ~2 in forward, between the outhaul and jib Cunningham cams, which holds the **main Cunningham** (thin line, stopper knot in the end). Also here: the main halyard's tail on its block and tackle, with its own cleat at the tackle's base (there is no main downhaul; owner, 12 November) |

| Control | Sail | Led to | Notes |
|---|---|---|---|
| Vang | Main | Piano, both sides, innermost | Dual-ended: pulling one tail pulls the other |
| Outhaul | Main | Piano, both sides, middle | Dual-ended; blue line, its middle crosses behind the companionway from one side to the other |
| Jib Cunningham | Jib | Piano, both sides, outermost | Dual-ended |
| Main Cunningham | Main | Port piano only, fixed clam cleat | Its own line through a ring in the luff above the boom. Fine luff tension under way |
| Main halyard (tackle) | Main | Port side: the halyard's tail on a block and tackle, with its own cleat at the base of the block | Pulled tight at the start of the sail (the last inches of hoist, and luff tension under load); rarely touched after. Coarse luff tension. In the sim it's the control named `downhaul` (controls.ts), which already sails this way: rename it in the UI (owner, 12 November) |
| Jib halyard | Jib | Starboard piano, outboard of the jib Cunningham, uncleated | Used under way: coarse jib luff tension, beside the jib Cunningham. The owner's crew uses it and the jib Cunningham rarely; top sailors who borrowed Josephine for the Internationals used the jib Cunningham. The sim needs a jib halyard control (owner, 12 November) |
| Mainsheet | Main | Boom end to the traveler car on a wooden thwart across the cockpit, in front of the helmsman | Purchase unknown: model 4:1 (typical for a keelboat this size) until counted |
| Traveler | Main | Wooden thwart across the cockpit | Dual-ended |
| Backstay | Rig | Each end of the cockpit thwart, where it meets the hull | Dual-ended; the bridle is on the transom |
| Jib sheets | Jib | Along the side decks to the winches | The only lines on the winches. Winches are **not** self-tailing: one hand cranks, the other tails, so trimming in a breeze is slow and takes crew |
| Jib cars | Jib | H-shaped track on each side of the cabin top | Moved by hand with pin stops, both fore–aft (twist) and athwartships (sheeting angle: inboard to point, outboard to foot). Set before a leg, not adjusted while loaded. Best guess until counted: 7 fore–aft positions and 5 athwartships, 25 mm apart (the usual hole spacing) |

### What each one does (the physics to model)

- **Backstay:** tightens the forestay (less sag, so a flatter jib that points higher) and bends the mast (flattens the main and opens its upper leech). Ease it for power in light air or chop.
- **Vang:** holds the boom down and controls main leech twist. It matters most off the wind, when the mainsheet no longer pulls the boom down.
- **Outhaul:** depth in the lower main. Ease for power, tighten to flatten.
- **Cunningham and halyards:** luff tension, which moves the draft forward and opens the leech. The fix when the draft blows aft as the breeze builds.
- **Traveler:** sets the boom's angle to the centerline without changing twist, which sheet tension controls.
- **Mainsheet:** angle and twist together. Trimming hard closes the leech.
- **Jib sheet and cars:** sheet tension sets the angle. Car fore–aft sets twist: forward makes a deeper jib with a tighter leech, aft a flatter jib with an open top. Car in–out sets the sheeting angle: inboard points higher in flat water, outboard gives more power and speed in chop or when reaching.
- **Halyard tackle vs. Cunningham:** both tension the main's luff. The main halyard's tackle does the heavy lifting; the Cunningham fine-tunes it. On the jib, the halyard and the jib Cunningham share the job the same way.
- **Winches:** the jib sheet needs a winch to trim in a breeze, so trimming takes time and effort, while easing is quick.

### How it should play

- See each line in 3D: the piano, the thwart controls, the winches, the cars on the cabin-top tracks. Dual-ended lines show both tails moving together.
- Settings per sail, with crew defaults for each wind strength, and the option to work every line yourself (like today's trim switch).
- Telltales, the leech, the draft position and the speed readout respond, so you learn by feel and by numbers.
- Keyboard controls (rebindable) and a trim panel that groups the lines as they are on the boat: piano, thwart, winches.

### Defaults until someone's aboard to check (easy to change later)

- Mainsheet purchase: 4:1.
- Jib car pin positions: 7 fore–aft and 5 across, 25 mm apart.
- Main halyard tackle: drawn as a gooseneck downhaul until redrawn; to be relabelled and led to port.

## Later

- **Desktop release** (owner, November 2026: "put a desktop release on the roadmap. it's not urgent, but if we're
  getting to a place where it no longer makes sense to keep building in-browser, say so."; later; 3–6 days for the
  technical port, plus the business setup):
  - Wrap the same TypeScript and three.js code as a Mac and Windows app: Tauri for a small download, or Electron for
    consistent graphics.
  - Sell it on Steam, itch.io, or direct through Paddle or Lemon Squeezy.
  - Move saves from the artifact's database and localStorage to local files, with Steam cloud sync.
  - Cache NOAA, NWS and chart data for offline use, and check the ENC chart data's terms for bundling.
  - Add a graphics-quality setting, an installer, and code-signing (Apple and Microsoft certificates, about $100 a year
    each).
  - Store page, trailer, privacy policy, price and refunds.
  - Keep real skippers' names out of the shipped product without permission.

  **Watch note:** move off the browser when any of these becomes true (the Coordinator flags it when one comes close):
  - the artifact's 16 MB size limit is in sight (3.5 MB today);
  - performance needs native threads or a GPU budget the browser can't give;
  - saves outgrow the artifact database;
  - we need things a page can't have: file access, game controllers, a full-screen app.

- Real past races with real wind and current (goal 4).
- More courses, and race-committee options (course changes, shortened courses).
- Phone and tablet layout (on hold: desktop first).
