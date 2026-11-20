# Release notes

Player-visible changes per release, from git (the Coordinator's record; newest first).

## v212 (20 Nov, code 99fc7ce2)

- **AI in a dying breeze.** In 1–4 kt her close-hauled speed (0.4–1.2 m/s) is under the fixed 1.3 m/s tack threshold. On the layline she used to bear away to build speed the wind could not give, and every tack became a full 250–380° jibe taking about 100 s. She now tacks from 0.6 of her close-hauled speed in the wind she has. It is unchanged from about 9 kt. She judges that wind by the lighter of the wind now and her 20 s mean, so a fresh puff no longer makes her jibe round. (f6320b17, 2184d27f, 18053ef7)
- **Beat angle in chop.** The best upwind angle in a chop is steadier. It used to swing 5–7° on a quarter-knot puff, and now it is the middle of the top of the speed made good. (17e61b0c, 8e8e7c06, 1ab4819f, 09e514a1, 590c9242)
- **Router tracks.** Every rules track (the last board laid exactly, the stall's rescue, the rules' plan) is held to the router's own pier test. The clearance from a pier end no longer depends on her speed. (8b9e2837)
- **Nav and the Berkeley Pier.** The helm's corners and the passage jumps are no longer shortcuts across land or a too-narrow gap. A chord is taken only if it comes no nearer a structure than the track it stands for. She now passes 22 m off the tip. (b639a146, 1b735c72, a31fef95, 290e2ddc; Deep Physics' and Bay East's fixes)
- **Nav replans.** A routine replan keeps the plan she is on unless the new one is at least a minute quicker. Before, replanning at each corner turned her round and back south of the Berkeley Pier ruin, and she lost 20 minutes (45.1 min against 24 planned). Now she arrives in 22.3 min. (24e21740)
- **Weather.** One daily real-weather refresh. (3c84be05)
- Plus about 10 internal changes: ROADMAP rows, the approx.test sample raised to 96 seeds, a re-baselined router test.

## v211 (20 Nov, 4ed2cf3a; dd11517a is the same plus the ROADMAP row)

- **Jumpers set once.** A cruising boat is now tuned once at the dock for the forecast, as in racing. The jumper dial and the drawn mast no longer step with every puff near 8.5 and 14.5 kt. After that, only the crew's turns change the jumpers. (573f691d)
- **Which wind she is tuned for.**
  - A lesson or a Case is tuned for the wind it is sailed in. The breeze lesson set up at 6 kt used to be sailed in 15 kt on the light setting. (cc19ceb2)
  - A cruise uses the forecast mean where she actually sails, not the course's mean. (2cbc9afe)
  - On a cruise, the coach's tune lesson drops the racing-rules citation. A change of conditions keeps her tune. (0d11e1a8)
- **The crew's outhaul.** The crew no longer take the outhaul back and forth as the breeze wanders across the guide's steps. Before: five outhaul trips in fifteen minutes at 3.5–5.7 kt, and ten at 11.5 kt. A move that stays still now goes in one trip. (0fc591a9)
- **Coach and the crew's outhaul hold (`crewGuide`).** The hold is now kept on the boat itself, so the page's coach no longer says the crew are going to the guide's setting while they are in fact holding. (b5993aaa)
- **The mirror's stale keys (#484).** The page keeps a copy (the "mirror") of the race. If one entry was removed and another added in the same frame, the count looked unchanged and the old entry stayed on the page's copy forever. The crew's `lineWant` and `lineSlow` work this way. The page, and the coach reading it, therefore showed stale crew-line intentions. Crew Habits reported it on 19 Nov. The race itself was unaffected. (49412c59)
- Plus 9 internal changes: ROADMAP rows, a read-only shoreline survey test (5976fe30), US spelling.

## v210 (19 Nov, 08afb104)

- **The AI's penalty turns (#483).**
  - Dodging a boat doing her turns is no longer a foul. (Same Rule 23.2/16.1 fix as in v209.)
  - An AI boat with right of way steers around the circle a turning boat will sweep, with 4 m to spare. She looks 15 s ahead, up to 45° off course, on her own tack, and never toward shore or another boat.
  - The berth also covers a boat doing her turns slowly. (14acd989)
  - A late starter lying beyond an end of the line aims 18 m below the line, between the ends, instead of looping forever. (94b924c2, 3593cac5, d02b2465)
  - This answers the owner's "penalty pileups at the turns, unusable."
- **The soak.** A new headless stability run sails hour-long cruises from each marina and 20 races. It watches for NaN, stuck or spinning boats, land, heap growth and thrown errors. (8365a74e, f1343813, b54858e2.) It found these player-visible bugs, all fixed:
  - A boat laid onto a mark by the wind used to lie on it for five minutes in 22 kt. It now sails off, because the contact only takes her way as she sails into it. (28bf0d1f)
  - Contact with the committee boat uses the point she actually touches. A bow driven into its side near the end now loses way, while one brushing round the end does not. (b31b28a3, 91b27086)
  - Crew pose faults at the cabin sides, the cabin's after edge and the foredeck. See "the helm's foot" below. (90630180, 247ef43f)
  - Nav steering through the Berkeley Pier. (74aff609 and the Nav items below)
- **Letting a sheet go.**
  - At the dock, a main that is up is drawn let fly, out on the shroud, but its sheet stayed hauled in from when the main was down. The moment she was let go the crew hauled the boom from 70° to 5° in under a second. On a dead run that could throw a crash jibe within about 4 s, as reported from slip 572.
  - The sheet now eases out with the boom whenever the main is up at the dock or on her lines. A sheet you set yourself at the dock is kept, and the boom on its lines stops at the shroud. (806058c5, 520f1444)
- **Detours near boats (#480).**
  - Despite the name, the fix is for an AI boat reaching past a pier close beside her (6–48 m off). She used to find no way round and sail into it. She now finds one and keeps to that side as she replans.
  - When she is pinned close-hauled by a boat to windward, she hails (Rule 20) rather than bearing off round the shore. She does not hail when Rule 20.1 bars it near a mark. (a2dddf29; 69898034, 48f6b9d7, 882d784b, e5b22831)
- **The helm's foot.** After a tack, the helm used to sit down on the new side with a foot left up on the after deck and the knee folded to the chest for about a second. The foot now steps down at once, and the knee no longer swings through the deck. (959bea90, 247ef43f)
- **Headroom (#482).** `onLand`, the land check each boat runs several times a step, now skips straight to "open water" over a grid of squares proven to be water. It changes nothing in the race (identical results). It makes the sim step about 1.6% faster. (43072d71)
- **Nav beside a pier.** Engaged right beside a pier head, Nav used to wreck her on it. The pilot now first steers her off the structure, toward the plan, on a heading that never brings her nearer. With no way off she is handed over with an alarm. (f6a388b8, nav-beside branch)
  - It keeps its way round a long pier, and the side it chose, until the way is clear. Before, it swapped between the Berkeley Pier ruin's ends every 2 s. A pier she hits is named in the message. (74aff609)
  - The Berkeley Pier gap is navigable, since the owner has sailed it. A commit that closed the gap was reverted, so the net change is that Nav sails the 45 m gap. (fbdd3bf3, 671b522e, 0bad383a, 0b042b9a)
  - Plan corners keep 20 m off structures. (a3ad2a5c)
- **Jumpers.** The dial's click halves and scrolling are replaced by two curved arrows. The left one is a half turn on and the right one a half turn off, and each grays at 0 and 5. They show on the band by default. The readout shows the nearest half turn within 0–5, so it is no longer a long run of digits. Crew turns go mark to mark. (20817296, db6de6e1, 8bd0804d)
- **Hoist tabs.** No visible change. The owner's report ("I should always see those if sails are down") did not reproduce on main. The tab rule was just moved into one place (ui/hoistTab.ts) and tested. (691c1b9e)
- **Weather.** One daily real-weather refresh (NOAA/NDBC, NWS forecast, ASOS rain). (0f9a0e80)
- Plus about 20 internal changes: ROADMAP, docs figures, tests, US spelling in comments.

## v209 (19 Nov, c1e3b75a)

PR by PR:
- **#460, hull contact.** Boats that touch now react every step they touch, not once every 6 s. The first touch is no longer a fixed shove and a flat 65% speed cut. Closing speed along the hulls is taken out and shared by each boat's mass, and a held boat gets none of it. Boats pinned together or rubbing count as one Rule 44.1 incident. (8431886b, e760c28b, 31146260, 5c6fd7b6, 25e2d69f)
- **#467, AI helm in light air.** The AI's steering stopped flipping side to side in light air. She offers a tack only when she has the speed for one, and holds her last heading choice for 0.5 s if it is still about as good. (f3d0edbe)
- **#468, UI copy.** Each sail-band tip is now one line saying what to do and why, with no brand names. Click and scroll usage moved to Keys. The jib car in/out tip was cut, and a later commit restored it as fore-aft and in-out. The boat panel's groups say View/Hide or "N more · Change", and rope names sit beside their swatches. The fleet page's "Bottom: , just cleaned" blank is fixed. (8d6c37ef, d6ee5b94, 622906f2, 1c41cd70)
- **#469, tiller guide.** The two yellow lines now mark where the rudder stalls (40°). Since v206 they had sat at about 24.8°. (3274399b, 423283f1)
- **#470, readouts.** The cruise log line no longer ends in a stray "·" or reads "Cruise ·  to Alcatraz". The setup's boat summary no longer starts with a blank when the topsides were mixed in the picker. (37b1beb1, 3fa33cf1)
- **#471, start-up lag.** Shader error checks are off outside the dev server, so the page no longer waits on each program compiling. It cuts the stall when the boat editor opens or a cruise begins, but only on a real GPU. (662ab12f, 760813ce)
- **#472, #477, #478, #479:** internal. These are the Mile Rock test counted in CPU work, tide predicted once at load, perf views for the editor and cruise start, and perf-pair running twice.
- **#473, AI helm under steerage way.** Below about 1 knot the AI asks only for the turn the rudder's flow can give. A small error takes a little helm, so the tiller drawn matches the turn she makes. Sculling out of a stalled tack is unchanged. (8352b005)
- **#474, OpenStreetMap credit.** A small linked line "© OpenStreetMap contributors" sits under the inset map and in the big charts. (c6271aab)
- **#475, tiller pilot.** On Standby the ram stays on the pin and holds the tiller, as a real tiller pilot does. The pilot's chip and key read "Lift pilot off" while the ram is on the pin. The ram also comes off when you take the helm, lash the tiller, accept a turn, dock or are moved. Calling a tack below about 1.3 m/s toasts "Too slow to tack: bear away for way first." (52fef750; 589e5f3d, 86854958, fc31c170)
- **#476, Nav and the plotted course.** Nav now follows the navigator's plotted course corner by corner, including its tacks, instead of the straight line to the destination. A replan is asked for on events, such as a corner made, off the plan by 100 m, or a wind or tide change. (b2123f17, 184006ee)

Not part of a numbered PR:
- A small weather-helm chip, such as "4° weather" or "1° lee", sits at the foot of the tiller guide's dashed line. It is teal when balanced (2–5°) and amber past 8°. It is on by default and can be switched in Tools or with Shift+W. (f2a5cdce)
- **Coach, foul tide.** One coach line appears once a leg when staying inshore saves two minutes or more against a foul tide. It shows only when the best track is toward the nearer shore, and a hopeless rhumb line is capped as "over half an hour." (7b1d26cd, 5a82b64b, 7c335840)
- **Rules, dodging.** Dodging a boat that is doing her penalty turns is treated as avoiding action, not a Rule 23.2 or 16.1 foul. This was the owner's "called for a penalty because a boat doing turns forced me to change course." Later commits harden it against two-bite luffs, a seaway's yaw, and a one-meter apprehension margin. (9e81a73b, a4bdd5ed, b938cf9d, ae6719da, 3f0d8992)
- **AI berth.** An AI boat gives a boat doing penalty turns a berth. It was reverted from v209 after its test failed and shipped in v210 as #483. (17ed5ed6, cf636f0c)
- **Pole toast.** It names the point of sail instead of "up here." (a15f85b4)
- **Season.** A calendar race not yet published shows as "to come," not "race 1" again. The upcoming race's day is shown without the weekday so it fits one line. (889413e9, 9f3d8d67)
- **Debrief chart.** Boats off the scale by the same seconds share one label. The takes column wraps under the chart instead of being squeezed to 29 px. (dfb8d248, 6c9ac428)
- **Yacht Club header.** There is more room between the eyebrow and the title. (26fe53d2)
- **Passage panel.** It takes the live plan it waited on, not the next one begun as she sails. (496949ca)
- **Boat editor.** An unknown marina id reads None with no slip row. (e02d5e33)
- **Brand names.** They are out of everything the player reads, including rig tuning and sail condition text, with a test over src and index.html. (5e420444, d087c6a2)
- **Crew hands.**
  - Crew at the cabin-top lines now hold the line they are working, with both fists on its tail. The tail is drawn pulled to the fists. Before, they held an invisible line. (711f952a)
  - The tiller extension, held short, no longer runs up through the helm's arm and shoulder. (07edafe9)
- **Crew dock jobs.**
  - Once she is made fast in her slip, the jobs of sailing end. Before, the bow hand could be stuck posed at the jib car for good. (27711afc)
  - On her lines, the dock work now runs too. A half-set or half-stowed pole is stowed. Your call for a lazy jib car is worked once she is made fast. The helm no longer crosses the cockpit each time the wind wanders across her bow. (e9d06564)
  - The halyards wait until the bow hand is at the mast. "Hoisting the main off the wind" is said once instead of flooding the message log. A dropped car call now says "Jib car call dropped: that car is loaded now." (2b574dd0)
- **Crew poses.** These are the fixes from the crew soak, so figures no longer pass through the boat.
  - The forward hand called to the mast waits where they sit until they go, instead of kneeling with forearms through the cabin's after end. (5fe6ff55)
  - The main hand tacking the main holds the sheet low, so the elbows bend back and down instead of sticking out ahead. (dc2423e7)
  - Legs and forearms clear the cabin's after end between cabin-top lines. Knees clear the cockpit sole between cabin-top lines. (c404bbc1, 8f3de3ed)
  - The leg check now also looks along the shin, not just at its ends. (7ea7fd54)
- **AI helm slow-turn handling.** Below steerage way the AI's turn request is scaled to the flow, and her sculling toward close-hauled is not slowed. This is the AI-helm half of #473, in 41606970, b911de45, 3c30b16d.
- **AI steering.** An AI boat no longer picks a heading on the other tack unless she has way for it. (7ba4d44d, a76fd420, 1b05965b; #467)
- Plus about 28 internal changes: tests, docs, ROADMAP edits, tooling and CPU-only speedups.

## v208 (18 Nov, b4334c09)

- Waves in shallow water now use the water's depth for each wave's length and speed, and the chop crosses a fetch at the depth's group speed. It matters only over shallow flats, and the deep Central Bay is unchanged. (#454, returned as #466; b6b149db, 4ee3b78c)
- On Sail Home, the AI router gives up on a front that has lost the way, so the plan from Mile Rock no longer overruns its time limit. Later fixes made it ask more before giving up: no time to beat at all, the front falling back, the gaining way gone. (#464; Deep Physics' reviews; 742056eb, d054d4e5, 53bf103b)
- An AI boat lying to after racing is called off now watches her set and drift, so she no longer drifts onto a lee shore. She also keeps 40 m clear of land all round. (#463; 607e804a, 7dfc4a5b)
- The setup screen's chart no longer waits on the harbors' wind-shadow work. The idle warm-up runs in slices of at most 8 ms. (0d8a7e5c, 19083a27)
- The sea's fetch was made ready one ray per slice, so a cold start from Mile Rock no longer holds a frame for up to 46 ms. (dd68ae81)
- The first-run quiet cruise behind the start page (FTUE) was brought back and then taken out again, so there is no change for the player. (25e8727b, bc2720ab, 3dde1831)
- Plus about 34 internal changes: ROADMAP and docs edits, tests, tooling (#461 fouls-pair, #465 ten-race-mean budget), and bit-identical speedups (#462 headroom).

---

## Player-visible work merged to main, 8–17 Nov 2026

Main's history starts on 10 Nov, so nothing is dated 8 or 9 Nov. Dates are PR merge dates (UTC), so late-evening Pacific work lands on the next day. About 2,150 non-merge commits fell in this window, so each line is a PR or a feature, not a commit.

**10–11 Nov**
- The whole sim to date (v53, #1). The race strategist and cruising navigator arrive. (#2)
- The Bay in depth: bridges to the shore, Angel Island, Coit Tower and the skyline, visible puffs, natural waves, wildlife. (#3)
- Easier sail controls, one line at a time, and heaving to. (#4)
- New marinas: Gashouse Cove, South Beach Harbor, the Corinthian YC at Tiburon, and Travis Marina at Horseshoe Bay. (#6, #32)
- Real NOAA nautical charts on the inset map and full chart. (#8)
- Pier 39 and the Wharf piers become solid shoreline. Gashouse Cove's seawall shelters the cove. (#10, #12)
- The trim coach teaches one thing at a time. (#13)
- Cleaner start screens. (#16)
- AI leeward starts and generic AI Folkboats. (#18)
- Crew weight and timing, sourced stability and sail forces. (#19)
- Tiller pilot with its sourced ram time. (#20)
- Map layers and real fog. (#23)
- The Bay Bridge and the city at night. (#27)
- Boat built to class rules and ORC certificate, with her navigation lights at night. (#28)
- A big performance pass: 25–37% faster steps and a GPU leak fixed. (#30)
- Fewer lit windows in the city at night. (#31)
- Crew buttons hold until you tap Auto. Instruments show wind, tide and point of sail. (#33, #34)
- Controls in plain words and the map's key. (#36–#38)
- Boat detail: keel seam closed, companionway lit, bow spray. (#39)
- Crew with real seats and paths. (#40)
- Deep physics: induced drag and pinching (#41); AI sails like a sailor (#44); real wind shifts from Fort Point's record (#46); swell and chop (#47).
- The bridges' towers are solid, with wind shadow. (#48)

**12 Nov**
- Cabin lit by lamplight, and the cabin as a 3D room with molded berths and a keel-stepped mast. (#51, #56, #60, #100)
- Fog bank softened. (#52)
- Push-off done as without an engine. (#54, #65, #81)
- Crew hike on the rail and go forward for the pole. (#55, #58, #63)
- The Bay extends to Berkeley, Alameda and Richmond with land, currents, wind, marks and harbors. (#59)
- Berkeley and Oakland Estuary harbors. (#61, #62)
- Terrain shore fitted to NOAA's charted coast. (#68, #75)
- Leeway and gusts physics. (#66, #73)
- Heavy weather: the committee calls racing off over 23 kt. (#80, #90)
- Inset map north-up with a north arrow. (#83)
- Whitecaps and foam. (#84, #88)
- Rules work: Rule 20.2 finish, blanketing, 21.1, 20.2 hails, Rule 23 tactics. (#89, #108, #109, #140)
- The sail controls band. (#91)
- The debrief on the replay and "race against the boat that won." (#93, #133)
- Chase camera framing. (#95, #118)
- Moored boats drawn as real boats. (#96, #137)
- Deck hardware and spars as anodized metal. (#107, #134)
- Flag index of every RRS 2025–28 signal. (#114)
- Ferry Building, Lime Point and Moore Road Pier from OSM. (#64, #115, #136)
- Scoring by RRS 44.3(c). (#138)
- Boat card pictures at golden hour. (#141)
- Wildlife remade. (#143)
- In irons: sternway and sculling under 42.3(d). (#146)
- Cruising shows the navigator's route. (#149)
- Outboard motor. (#151)
- Rig tuning with rake, shrouds and jumpers, drawn on the mast. (#152, #154)
- Wind and current on the maps, Windy-style. (#155)
- Tiller pilot panel bottom left. (#157)
- Rigging drawn as on Josephine. (#159, #171, #173)
- Cabin-top Tacktick-style instrument. (#170)
- Wind indicator at three heights. (#172)
- AI boats sail home after racing is called off. (#169)

**13 Nov**
- Plan a cruise on one big chart. (#175)
- Rule 44.1 same-incident logic. (#176)
- Flow view of the air over the sails. (#177)
- Yacht Club with Members tab. (#178)
- Crew sailors modeled garment by garment. (#182)
- Passage planner prices tacks from the sim's own loss, and no passage runs ashore. (#184, #187)
- Race in a Web Worker. (#195)
- Ghost races against your own run. (#207)
- Real past races, with a replay against the real fleet. (#192, #198)
- Debrief against the winner. (#191)
- A calmer game surface. (#194)
- Start-line drill, tack-and-jibe drill and mark-rounding drill. (#210, #218, #237)
- The Season: GGYC Seaweed Soup, scored as a series. (#240)
- Back stack and Esc. (#230)
- Tactical debrief, visual first. (#233)
- Real docking. (#265)
- US spelling and "Jibe, not jibe." (#251; #277 on 14 Nov)
- Skippers anonymized in shipped data. (#249)
- Air temperature at Fort Point and round the Bay. (#235, #258)
- Hove to with the tiller lashed. (#238)
- Penalty cascade at marks. (#239)
- Crew back on the surface. (#242)
- Wind angle dial under the inset. (#244)
- Inch ticks on each rope. (#245)
- Berkeley Campanile and Claremont Hotel landmarks. (#246)
- Real race: Seaweed Soup 2026–27 race 1, 7 Nov. (#247, #252)
- Map layers with calmer streaks, and time-lapse of the real flow. (#205, #261, #266)
- One sim copy in the page, 9.4 MB down to 5.3 MB. (#253)
- Crew elbows bend the right way. (#262)
- Rule 43.1 for a mark touch. (#270)

**14 Nov**
- Learn to sail lessons and ASA 101 grid. (#282, #301; #327, #331 on 15 Nov)
- Protests: the "Protest!" hail and red flag. (#283)
- The Rules trainer: Cases on the water. (#288, #290, #314)
- Gashouse Cove exit, Fort Mason's piles and the NO WAKE board. (#292, #300, #421, #423)
- Real rain record and forecast. (#294)
- Finer current arrows. (#295)
- Season flow design built. (#305)
- Wrecks: damage grading, tow, laid up. (#307)
- Drill cues and guides on the water. (#309)
- Pilot refusals say why on their button. (#311)
- Frame readout on F9. (#315)
- Backed jib lies against the mast and shrouds. (#319)
- Traveler stays where set while you hold the mainsheet. (#321)
- Boat editor changes restyle her in place. (#323)
- Rig and windows placed to class rules. (#328)
- Triangles and programs trimmed back under budget. (#329, #313)
- The main hand tacks the main facing the sheet. (#344)
- No on-screen tiller instructions outside lessons. (#346)
- A better outboard on a lifting bracket. (#350, #353)
- Teak deck butt joints scattered. (#358)
- Jib lead from the car's geometry, and the vang as Josephine's tackle. (#236, #274)
- Pole button offered only where the crew set it. (#297)

**15 Nov**
- Paddle with the boom crutch. (#326, #390, #427)
- Crew stations and winch seats. (#347)
- Flag shapes hold. (#363)
- Rule 44.2 turns end at the last tack or jibe. (#387)
- Trim coach: one note at a time. (#393)
- Start practice improvements. (#397, #429)
- Sailing by the lee and the wind-made jibe. (#399)
- Cruise chart expand icon. (#400)
- Outboard turns her. (#402)
- Points of sail on the water. (#404)
- The Tools tray. (#405)
- HUD: DSQ/UFD/BFD/ZFP shown in red on the race pod. (#412)
- Conditions card swell where she starts. (#413)
- Boat shadows fixed. (#414)
- Protest flag readable at range. (#415)
- Land lee without seams. (#419)
- Astern shove tied to the wind. (#420)
- Jibe-ho on Space. (#424)
- Rushing water at the map's edge. (#425)
- Isochrone router for cruise plans. (#431)
- Frame cost cuts. (#369, #430, #433)

**16 Nov**
- The inset's route is worked out in the background, with no 60–200 ms freeze every 2 s. (#440)
- An AI boat going astern sheets in and bears away. (#441)
- Racing called off: no penalty left to take, and AI boats sail home. (#444)
- The route out of the Estuary round Alameda. (#445)
- Called turns warn the crew. (#434)
- Wakes at a lower cost. (#435)
- Heel ring over the windex. (#436)
- AI boats wait for crew on a called turn, as your helm does. (7ba9dfc3, 4dee50a6)
- The pole call has hysteresis for AI. (feef5f6f)
- The ensign staff is clear of the tiller's sweep. (ddc79736)

**17 Nov**
- Burgees: the owner's 20 approved club burgees fly, and clubs are renamed, for example Battery YC and St. Felix YC. (4b2b206d, ee2c7ce3, a29debcc)
- The navigator as a layer on the one chart. (869bcf16)
- The navigator card shows just a flag on open water. (64e4ee02)
- The pilot takes her home to her harbor's mouth. (bf9f965f)
- The destination tag follows the destination. (eda8070c)
- A quiet cruise behind the start page was brought in, then reverted. (d866528d)
- Hiking hands on every grip. (da751b95)
- 8 m stern-line walk-out from the slip. (3953e438)
- Sail Home is paced. (7d64ba82)
- v205 shipped these on 17–18 Nov:
  - The coach's heeled speed. (#449)
  - The wind to the second. (#451)
  - The committee's beat-start course. (#452)
  - Fewer first-mark pile-ups. (#453)
  - Crew stations. (#446)
  - Crew Habits. (#455)
  - The rounding note. (#447)
- Lines drawn as rope in their colorways on the 3D boat. (bba127de)
- Sternway starts in light air. (45a54c35)

---

## Method and caveats

- ROADMAP.md has no v207 row. The only mention is "shallow waves cleared for v207". I used 79fd2ae4 ("ROADMAP: v206 shipped", 18 Nov 17:02 UTC) as the base for v208, because everything after it up to b4334c09 is the v208 batch. So v208 covers all of v207, if v207 was ever published.
- v209 starts at b4334c09, v210 at c1e3b75a, v211 at 08afb104 and v212 at 4ed2cf3a (99fc7ce2).
- Session names appear only where a commit or PR names one (Deep Physics, Bay East, Marinas, Capacity, Crew Habits, and so on). Everything else is cited by PR number or short hash.
- I read PR bodies through the GitHub API. Commit dates are UTC.
- The "plus N internal changes" counts are approximate.
