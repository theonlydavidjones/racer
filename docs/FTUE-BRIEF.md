# Folkboat Sim: First-Time User Experience (FTUE) Brief

The owner's brief, kept verbatim as the record (given to the FTUE session about 17 Nov 2026; restated to the Coordinator on 20 Nov 2026). The FTUE session's answer is docs/FTUE-PLAN.md on branch claude/busy-bohr-fc1mya.

Handoff for the coordinator agent. Product direction comes from David (the product owner). Wherever an item says "already built", check the current code first and extend it. Don't rebuild it.

## Guiding principles

- True-to-life, but fun wins. Where realism makes the game tedious, simplify it. Example: a real sailor would crew on other people's boats before buying one. We skip that and start with buying a boat.
- Get players on the water fast. Every FTUE step has to have sensible defaults, so a player can accept them all and be sailing within a minute or two.
- Teach sailing terms inline. A line or two of copy where each one first appears (slip, burgee, etc.). No separate glossary step.

Map scope (MVP): the whole Bay plus the ocean out through the Golden Gate to the Farallon Islands. The Farallones are in the MVP. The map is limited to water a Folkboat can actually sail (no non-navigable shallows or sloughs). How far up into the Delta it goes is still to be decided.

## 1. FTUE flow

1. Splash screen.
2. Account sign-in/creation. Required, because progress, boats, clubs and race history have to be saved. This will be a paid game, so how accounts work depends on the storefront it's sold through. See §6.
3. Sailing experience check. Offer a few answers, not just yes/no. Suggested levels: Never sailed / Sailed a little / Cruiser, never raced / Club racer. The answer only controls what we recommend afterward. Players can still open any lesson in the existing learn-to-sail interface whenever they like.
4. Choose your boat (boat editor, already built). Name, colors, etc. A player who wants to jump straight in can accept the default boat as-is. There's no in-game money in the MVP, so nothing is bought or sold. Copy should say "choose" or "set up," not "buy."
5. Choose a marina slip (new, see §2). Required. Trailering exists in real life but is out of scope.
6. Yacht club (optional). Join a default club, create one, or skip. The copy must say clearly that you need a club membership to enter races at the default clubs.
7. Start playing. Where they're sent depends on the answer in step 3:
   - Never sailed / a little: recommend the learn-to-sail lessons first, with cruise mode offered as the alternative.
   - Experienced: a short orientation covering how the game works, sail mechanics and controls, then cruise or race.
   - Cruise mode with automated sails is the fastest way onto the water. The player only steers the tiller.

## 2. Marina selection

- Replace the current marina dropdown in the boat editor with a map-based picker.
- Scope: every existing marina on San Francisco Bay. A full marina list doesn't exist yet. Compiling one (name, location, public or private owner) is a research task.
- Naming: publicly owned marinas (city, county, port district, park) use their real names. Privately owned marinas get parody names, following the same approach as the yacht clubs.
- Each marina gets an info panel: what a slip is (first time only), plus advantages and disadvantages based on what the Bay sailing community says about it (exposure, surge, current, distance to the main race areas, etc.).
- Effect on gameplay (MVP): small. It mainly sets where cruising starts and how far you'd sail to reach a race. Races also let you start at the starting line, so marina distance is never a blocker.
- Real-life wear on boats differs by marina. That depends on boat damage, which is not MVP (see §7).
- Players can change marinas later. No cost or waitlist for now.

## 3. Yacht clubs

Two kinds of club:

| | Default clubs | User-created clubs |
|---|---|---|
| What they are | Parody versions of the real Bay clubs that sponsor races: Tier 1 in yacht-club-parody-names.md only (27 clubs). Build them out in phases rather than all at once. | Created by any player |
| Name/burgee | Parody names (see §5) and parody burgees: each one nods to the real club's burgee without copying it. A separate agent is designing the 27 parody burgees. Not in scope for this handoff. | Player names it and designs a burgee |
| Seasons/races | Fixed by the game, following the real Bay racing calendar (midwinters etc.) and real courses. Race names are a later decision (real race names may be trademarks too). | Created and customized by the club owner |
| Race committee | AI-run; the committee picks courses | Club owner/moderators |
| Player editing | Not editable. Joinable only. | Fully editable by owner |
| Entry rules | Membership in the club required to race; some events gated (e.g. qualifying by winning other events) | Set by the club: membership in any or no club, boat type, skill level, etc. |

Required change to existing behavior:
- Right now, users can create races at the default clubs. Remove this. Default clubs' seasons, races and courses must be locked.
- Keep (and make clear): practice mode at default clubs. A player can pick any real course and any real race date, past or future, and sail it as a simulation for learning and practice. That's a single sailing, not sponsoring a race or editing a season. Players must never have to wait for the real date and time to race a race.

Membership:
- One club at a time. Players can switch clubs freely; default clubs have no switching penalty. (Being in several clubs at once is real but out of scope.)
- Clubs aren't tied to a marina, and clubhouses aren't in the game.
- Membership limits nothing except race entry as described above.

What a user-created club does in single-player (pre-multiplayer):
- Create its own seasons and tournaments.
- Populate races with AI boats, skippers and crews with adjustable skill levels (partially built). Use case: a real sailor recreates the boats and competitors they actually race against and simulates those races. Or it's just for fun.

Seasons and awards: both kinds of club have seasons and awards.

## 4. Burgee designer (new)

- Preset parts only. No freeform drawing. No image uploads either: the preset system makes uploads unnecessary and removes most of the moderation risk.
- Shapes: a large library based on burgees worldwide (pennant/triangle, swallowtail, etc.).
- Divisions/fields, colors, symbols: a large palette and symbol set. The aim is a huge number of possible combinations.
- Everything must stay within nautical tradition. No symbols or styles that would look wrong on a real burgee.
- Burgees already display on boats (already built). Designs must read clearly at the small sizes used there.
- Short inline copy explaining what a burgee is.

## 5. Real club names: trademark note

Decision (updated): use parody names and parody burgees for all real clubs. Parody burgees come from a separate agent. The mapping is in yacht-club-parody-names.md. Keep real→parody mappings in data/config only, and never ship real names, burgees or club abbreviations.

Context from a quick search (not legal advice):
- St. Francis Yacht Club holds active federal trademarks, including its name, its burgee design, and use for organizing and conducting sailing regattas. Other clubs (e.g. Nantucket YC) have registered burgee designs. Assume most major Bay clubs have protected marks.
- Relevant precedent: E.S.S. v. Rockstar (9th Cir. 2008). A modified/parody version of a real business in GTA was protected under the First Amendment. The court rejected the "nominative fair use" defense, because Rockstar used a variation of the mark rather than the real one. Parody versions are the safer route; real names and burgees carry more risk, especially for a commercial Steam release.
- Action: get a short consult with a games/IP attorney before any public or paid release. Asking clubs for permission or a license is an alternative; some may welcome it.

## 6. Platform and accounts (needs an engineering recommendation)

The product owner isn't technical and wants a recommendation. This is a paid game. The current build runs in a web browser. Steam is the preferred storefront. Mobile is out of scope (too complex). Accounts should follow from wherever the game is sold.

Questions for the coordinator/engineering agent to answer:
- Can the current browser build be packaged for Steam (e.g. Electron/Tauri wrapper), and what would that involve?
- Accounts: players need saved progress (boats, clubs, race history). Recommend an approach, e.g. our own backend account with optional "Sign in with Steam". Multiplayer and user clubs will need our own server-side identity anyway, so Steam's built-in saves alone won't be enough.
- Single-player saves should go to the same backend/data model as multiplayer later, to avoid a migration.

## 7. Future / not MVP (park these)

- Boat damage and repair. Destructible boats; learning about kinds of damage and how to repair them; marina-dependent wear (some marinas beat up boats faster). Considered important long-term.
- Multiplayer. User clubs become community spaces: user-created, user-run races, user-moderated.
- Moderation model (multiplayer). Similar to Reddit: platform-wide terms of service; each club has moderators who enforce them; the platform can sanction or remove clubs whose moderators don't. Use standard best practices for reporting and abuse handling. Not designed yet.
- Expanded geography. After the MVP: Half Moon Bay, Monterey, points up the coast, lighthouses.
- Cosmetics. No money in the MVP. Cosmetics that can be bought or won may come later.
- Race names. Decide later whether real race names (e.g. the big regattas) get parody names like the clubs did.
- Non-racing clubs. The 16 Tier 2 clubs (mostly cruising and social) aren't joinable in the MVP.
- Crewing mode. Crewing on someone else's boat. Rejected as an opening experience, but possible later.
- Trailering. Out of scope.

## The owner's decisions since the brief

- 20 Nov 2026: "Create a race" at the default clubs becomes **Practice**; in practice the committee's settings are locked to the club's.
- 20 Nov 2026: plan approvals 1 (no sign-in screen where the platform signs you in), 2 (the Drill card's line to Learn to sail), 3 (every marina pinned, the built ones choosable), 5 (the Yacht Club page leads with your club).
- 20 Nov 2026, **membership (overrides §3's entry rule):** "very few races that I know of require people to be members of the sponsor club. you just have to be a member of a yacht club of any kind." Season races at a default club need membership in any club; gated events stay a later rule; Practice is open to all.
- 20 Nov 2026, **burgee designer:** "we should only send someone to the burgee creator as part of a new-club creation flow."
- 20 Nov 2026, marina names: public owners keep real names (Alameda Marina, Marina Bay Yacht Harbor, Napa Valley real); private ones as approved in docs/marinas/PARODY-NAMES-DRAFT.md (Fisherman's Wharf, Heron Harbor, Loch Tay Marina, Fortitude Marina, the rest option 1).
- 20 Nov 2026, toggles: words in a toggle only for brief, obvious two-state choices (CLAUDE.md).
