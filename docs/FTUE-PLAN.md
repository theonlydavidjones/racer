# First-time user experience: the plan (FTUE agent, 17 Nov 2026)

For the owner's approval. Nothing is built yet. The parts marked **[DESIGN: approve]** are big design changes and wait for the
owner's yes. Screenshots of today's game, as a new player sees it, are in docs/ftue/.

## 1. What a new player meets today

I played it from an empty browser (headless Chromium, 1440×900). Where a newcomer gets stuck:

| # | Where | What happens | Still |
|---|---|---|---|
| 1 | Load | The start page draws in 0.5 s, but clicks on it are ignored until the app has loaded (10–25 s here with software graphics; a real GPU will be faster, still to measure). Nothing says it's still loading. | — |
| 2 | Start page | A live race start runs behind it: the 3:00 clock, the start line and rule-10 hails ("Blue is on port and must keep clear") pop up behind the menu. | [07](ftue/07-club.jpg) |
| 3 | Start page | Four equal cards (Race, Cruise, Drill, Yacht Club) and nothing to say where a beginner should start. | [01](ftue/01-home.jpg) |
| 4 | Learning | Learn to sail is three levels down: Start page → Drill → Learn to sail → Lessons. Someone who has never sailed won't look under "Drill". | [06](ftue/06-lessons.jpg) |
| 5 | Your boat | Every new player is given JOSEPHINE, USA 122, Bay View Boat Club: the owner's own boat, sail number and real club. | [08](ftue/08-boatpage.jpg) |
| 6 | Your boat | She has no marina or slip, so lessons 2 (Before you go) and 12 (Home to the slip) are grayed out. The only reason given is a hover tip. | [06](ftue/06-lessons.jpg) |
| 7 | Real names | The editor's club list and marina list show real names (St. Francis, Richmond YC and the rest); the brief says never ship these. The parody-names session is doing the club names. | [09](ftue/09-editor.jpg) |
| 8 | Cruise | One click on Cast off and she's sailing (good: under a minute). But she's on a beam reach in 21 kt, with all 16 sail controls open, and nothing says how to steer. Taking the tiller (click the water, or T) isn't shown anywhere. | [11](ftue/11-cruise-start.jpg) |
| 9 | Race | "Create a race" lets anyone host a race at a real club (GGYC's burgee and courses). The brief removes this. | [03](ftue/03-create.jpg) |
| 10 | Yacht Club | "The Yacht Club" is really your own fleet page (your boats, members, season). It isn't a club you join, so it will clash with the brief's clubs. | [07](ftue/07-club.jpg) |

## 2. The player's path, screen by screen

One rule throughout: **every step has a default already chosen and one Next.** If you accept every default, you go from
load to sailing in five clicks. Each step is one picture-led screen, using the existing start-page panel style, with one
short line of copy at most. A sailing term gets one line where it first appears.

0. **Splash (the start page, waiting).** The page you see now, but the boat behind it is cruising quietly: no start
   sequence and no hails. The cards are dimmed with a thin progress line under the title until the app can take a
   click. Once it can, they light up. This applies to everyone, not only new players.
1. **Account.** No screen of its own in this build: the claude.ai artifact already knows who you are (store/cloud.ts), and
   on Steam you'd be signed in by Steam. A screen would only appear if neither is there ("Sign in to keep your boats"). See §6.
   **[DESIGN: approve: no sign-in screen where the platform already signs you in.]**
2. **How much have you sailed?** Four tiles, each with a small picture: *Never sailed* · *A little* · *Cruiser, never
   raced* · *Club racer*. "A little" is the default. The answer only changes what's recommended at step 6. You can change
   it later in Settings.
3. **Choose your boat.** The existing boat editor (render/boatPanel) in a short first-run form: the boat turning in the
   showroom, with Name, Sail number and Colors open and the rest (rig tune, condition, lines, outboard) folded under
   *More*. One line: "Name her and choose her colors, or keep her as she is." The default boat is no longer JOSEPHINE:
   it's a new generic Folkboat with a free sail number, and the owner's own save keeps JOSEPHINE. The copy says
   "choose" and "set up", never "buy".
4. **Choose a slip** (new, §3). A chart of the Bay with the marinas pinned on it. A free slip in a sensible default
   marina is already chosen. Tapping a pin opens a small card: the marina's name, four rating tiles (shelter from the
   swell, surge, current at the entrance, distance to the race areas), and the slip she'd get. The first time, one line
   explains the term: "A slip is her own berth in a marina: you sail from it and come home to it."
5. **Yacht club** (optional). Three tiles: *Join a club* (the default clubs, each with its parody burgee) · *Start your own*
   (a name and the burgee designer, §5) · *Not now*. One line: "Only club members can enter that club's races." One line
   for the term: "A burgee is a club's flag, flown on members' boats."
6. **Off you go.** One card with one big button and one small one, depending on step 2:
   - *Never sailed / A little:* big **Lesson 1: The boat**, small *Cruise*.
   - *Cruiser:* big **Cruise with a short orientation**, small *Race*.
   - *Club racer:* big **Orientation, then a practice race**, small *Cruise*.

   **The orientation teaches by doing, not with a screen of text.** It runs in a cruise with the crew trimming every
   line. One prompt at a time sits beside the thing it means, and each clears itself once you've done it:
   take the tiller (a click on the water) → steer (move the mouse; the dashed line is straight ahead) → tack (Space) →
   the crew trims the sails (the band's *Auto-trim* tab, pointed at, not opened) → the chart (tap the map) → done.
   That's five prompts, about two minutes, and you can skip it with Esc.

**Returning players never see any of this.** A browser or account with saved boats skips straight to the start page, so
the owner's saves are untouched.

After the first run, Learn to sail is easier to find **without a new button**: the Drill card's small line becomes
"Learn to sail, the start, tacks and jibes". **[DESIGN: approve: that's a change to a line on a card the owner named.]**

## 3. Marina selection (map picker)

- **Replaces** the boat editor's *Home marina* dropdown and *Slip* dropdown (ui/boatPanel.ts) with the same chart picker
  as step 4. It opens over the editor, and you can change marinas any time. No cost and no waitlist.
- **Map:** reuse the setup's chart (ui/setupChart.ts on ui/encChart.ts) with marina pins on it. No new map code.
- **Data (a research task, then the Marinas agent's):** every Bay marina with its name, position and owner (public or
  private), plus what Bay sailors say about each (exposure, surge, current, distance to the race areas), all sourced. The
  researcher compiles it. Public marinas keep their real names; private ones get parody names, the same way as the clubs.
  Today the sim has 14 harbors with slips built (geo/marina.ts). **[DESIGN: approve]**
  - **(a)** Pin every marina on the chart, but only the 14 built ones can be chosen for now; the rest say "coming".
  - **(b)** Show only the built ones until the Marinas agent builds more.

  I'd go with (a): the Bay looks complete, and it's honest about what's built.
- **Effect on play:** where a cruise starts ("Start from her slip") and lessons 2 and 12. Races keep starting at the line.

## 4. Yacht clubs: what changes

**[DESIGN: approve: the whole section changes how racing is entered.]**

- **Remove "Create a race" at the default clubs.** The Race page becomes:
  - **Practice:** today's Create-a-race setup, but always "a sailing for practice". You choose any real course and any
    day, past or future, and sail it now. Nothing is hosted, no season changes, and anyone can do it.
  - **Season:** locked; you need to be a member to enter.
  - **Past races:** as today.

  Renaming "Create a race" to "Practice" is a relabel, so it needs the owner's say. The other option keeps the name and
  takes the host-club choice out of it.
- **Membership:** one club per player (a new `S.club` setting; your boats fly its burgee). You can switch any time, free.
  Joining shows on the Season card ("Members only: join in Yacht Club").
- **"The Yacht Club" page** is your boats, members and season. With real clubs coming, I'd suggest it shows the club
  you belong to at the top (its burgee, Join or Switch), and Boats and Members stay as tabs. Is that a relabel? The
  owner's call. **[DESIGN: approve]**
- **User-created clubs** (their own seasons, AI fleets with skill levels): phase 2, after the FTUE ships. The AI's skill
  levels are the Skipper Model agent's work. The clubs' calendars and courses are the Rules agent's.

## 5. Burgee designer (new)

**[DESIGN: approve: a mockup first, with stills of burgees on the boat from both sides on both tacks.]**

- **Preset parts only:** a shape (pennant, swallowtail, and others from burgees worldwide), a division (plain, a band, a
  border, a cross, quarters, per pale, per fess and so on), colors (a palette of the colors real flags use), and a charge
  (stars, anchors, a cross, a crown and so on). No drawing and no uploads.
- **Rules that keep it nautical:** the researcher sources burgee and flag tradition first. Then every combination is
  checked to stay legible when small, with a test that renders each at its size on the boat.
- **Code:** a new ui/burgeeDesigner.ts and a parts renderer next to render/burgees.ts (burgeeCanvas already draws
  BURGEES by id). It reaches the boat through the existing flag path.

## 6. Platform and accounts (my engineering recommendation)

- **Steam:** wrap the browser build in **Electron**, not Tauri. Electron ships its own Chromium, so WebGL, the Web Worker
  and our perf numbers behave exactly as they do in our headless Chromium tests. Tauri uses the system's web view
  (WebKit on Mac), where WebGL and timing differ. The work involved: an Electron shell, a Steamworks binding (an npm
  package: the owner's OK needed), Steam's build and upload tools, and code signing for Mac and Windows. That's roughly
  1–2 weeks.
- **Accounts:** our own backend account, with **Sign in with Steam** (Steam's web-API auth ticket checked on our
  server). Multiplayer and player clubs need our own identity anyway. Steam Cloud alone isn't enough.
- **Saves:** store/cloud.ts already saves each key/document to a per-user store. Keep that shape and put it behind one
  interface, so that moving from claude.ai's database to our backend is one file, not a migration. Single-player saves go
  there now and multiplayer uses the same store later.

## 7. What changes, file by file

| Area | Files | New? |
|---|---|---|
| First-run steps and their state | **src/app/firstRun.ts** (a `mountFirstRun(app)` part), its logic pure and testable in **src/ui/firstRunFlow.ts** | new |
| Its screens | index.html (one overlay, `#firstRun`), **src/styles/NN-firstrun.css** (at the end) | new |
| Settings | src/settings.ts: `experience`, `club` (membership), `firstRunDone`; the default boat no longer JOSEPHINE for new saves | change |
| Start page waiting, quiet scene behind it | src/app.ts (openHome, the scene behind), 0x-home css | change |
| Boat editor's first-run form, marina picker | src/ui/boatPanel.ts, **src/ui/marinaPicker.ts** | change + new |
| Marina list and ratings | src/geo/marina data (**Marinas agent**), researched by the researcher | data |
| Orientation prompts | **src/app/orientation.ts**, prompts pinned to existing elements (no new buttons) | new |
| Race page: Practice / Season / Past | index.html #raceChoose, src/app/setup.ts (host-club choice out), src/ui/season.ts (members only) | change |
| Burgee designer | **src/ui/burgeeDesigner.ts**, render/burgees.ts (parts renderer) | new |
| Drill card line | index.html | copy |

The FTUE doesn't touch the sim, the step or the worker; it only uses commands that already exist. So no perf-pair slot is needed.

## 8. What I'd remove or hide

- The live start sequence and its hails behind the start page (a quiet cruise instead).
- JOSEPHINE as every new player's boat.
- The marina and slip dropdowns (replaced by the chart).
- Hosting a race at a default club (Create a race → Practice).
- Real club and marina names wherever the player can see them (with the parody-names session).
- In the first-run boat editor: rig tune, condition, lines and outboard, folded under *More* (still there).

## 9. How each step is tested

Tests come first. Each of these fails on main before it's built.

- **Unit (vitest, in test:fast):** the first-run flow: next step, the defaults, Back; "accept everything" reaches *sail*;
  a save with boats skips the first run; each experience level gets the right recommendation; the new default boat's
  sail number is free and isn't 122; membership gates season entry and switching is free; Practice never writes to a
  season; every marina has a source and a public/private owner; no real private club or marina name in any string the
  player sees (checked against the mapping in data/config); every burgee-designer combination draws.
- **End to end (a new script, scripts/check/ftue.cjs, ~3 min):** an empty browser profile, every default accepted:
  sailing in at most 6 clicks and, once the page responds, within 60 s. A second run with a save: the start page
  directly. A run through each experience level. It takes a still of every screen for the owner.
- **The start page responding:** the script measures the time from the first draw until a click works, and the cards
  stay dimmed until then.
- **Before handing over:** spelling.cjs, smoke.cjs, `?simguard` on the orientation (it only sends commands), then the
  full `npm test`. The visual-checker covers anything shown on the boat (the burgee) from both sides on both tacks, and
  the owner gets those stills.

## 10. Order of work (once approved)

1. The start page waiting and the quiet scene behind it; the new default boat (small, no design change).
2. The first-run steps 2, 3 and 6 and the orientation (the slip step uses the existing dropdown until 3 lands).
3. The marina picker (after the researcher's list and the Marinas agent's data).
4. The clubs: membership, Practice, a locked Season (after approval, with the parody names).
5. The burgee designer (mockup → approval → build).
6. Player-created clubs (phase 2).

Research to start now with the researcher: the Bay's marinas (name, position, owner, sailors' views), burgee shapes and
heraldic conventions, and how a Folkboat's burgee is flown.
