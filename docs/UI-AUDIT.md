# UI audit: the screens around the sailing (13 Nov 2026)

The owner asked for a rigorous audit of the screens around the sailing:

- the start page
- Race
- race and cruise setup
- the conditions dialog
- the Yacht Club
- the logbook and past races
- Settings and Keys
- the pause menu and the results

It focuses on navigation, the amount of information each screen asks you to take in, and how the screens are arranged.
The owner's words: "Lots of '‹ Start page' stuff when I should have back buttons taking me to the previous state", and "The Everyone/Skippers/Crew/Yours toggle array in the Yacht Club makes no sense to me." Crew Model gave its intent for the Yacht Club; it is quoted where it applies.

**Nothing in this document is built.** It's a proposal for the owner to mark up. Screenshots, at 1440×900, are in [ui-audit/](ui-audit/).

## 1. What's there now

### 1.1 The screens and how you get between them

```
Start page ─┬─ Race ─┬─ Create a race ──────── (setup) ── Start the sequence ─▶ racing
            │        └─ Run a past race (opens in place) ─ Sail it ─▶ setup
            ├─ Cruise ───────────────────────── (setup) ── Cast off ─▶ cruising
            ├─ Fleet ─▶ "The Yacht Club" ─┬─ Boats ─ a boat's page ─┬─ Race her / Cruise her ─▶ setup
            │                             │                         └─ Edit ─▶ the boat editor (3D showroom)
            │                             └─ Members ─ a member's page
            └─ Settings (training aids + every key)

From setup: Your boats… ─▶ Yacht Club (Boats) · Who's aboard ─▶ crew rows ─▶ "the club" ─▶ Yacht Club (Members)
            Change the conditions… (dialog) · Course and strategist (dialog) · Practise the start ─▶ drill
Racing:     Esc ─▶ Paused: Resume · Change the conditions… · Restart · Back to setup · Settings · Exit to the start page
Finished:   Results: Watch your race · Race again · Back to setup
```

### 1.2 Every back or close control, and where it goes

| Screen | Control | Goes to | Problem |
|---|---|---|---|
| Race | ‹ Start page | Start page | None: it is the parent. |
| Create a race | ‹ Race | Race | Wrong when you came from a boat's page ("Race her") or a past race. |
| Cruise | ‹ Start page | Start page | Wrong when you came from a boat's page ("Cruise her"). |
| Yacht Club | ‹ Back | Setup if opened from setup, else the start page | Says "Back" with no place. Two of the ways in are remembered (`fleetFrom`); results and pause aren't ways in at all. |
| A boat's page | ‹ Yacht Club | Yacht Club | None. |
| A member's page | ‹ Members | Members | None. Inside the Yacht Club page, so it has two back links stacked (‹ Back, then ‹ Members): [12](ui-audit/12-club-member-page.jpg). |
| Conditions | DONE (top) and DONE (bottom) | Where it was opened | Two Done buttons. |
| Settings | DONE (top) and Done (bottom) | Where it was opened | Two Done buttons. It's 2,500 px tall, so the bottom one is far away: [13](ui-audit/13-settings-keys.jpg). |
| Paused | Back to setup · Exit to the start page | Setup · Start page | None. |
| Results | Back to setup · Race again | Setup · a new start | No way to the start page except via setup. |
| Drill debrief | Back to setup | Setup | None. |
| `#club` "Coming next" | ‹ Start page and Back | Start page | A dead screen: nothing opens it now that the Yacht Club is built. |

Most back links are hard-coded to a fixed parent. The router in `src/app.ts` keys `data-home` to `race`, `home`, `create`, `cruise` or `fleet`. Setup sets its own back link from the mode: cruise gives "‹ Start page", race gives "‹ Race". So "back" means "up to the parent I was written with", not "where I came from". That is the owner's complaint.

### 1.3 What each screen asks you to read

| Screen | What's on it | Notes |
|---|---|---|
| Start page [01](ui-audit/01-start.jpg) | Race · Cruise · Fleet · Settings | The card says **Fleet**; the page it opens is titled **The Yacht Club**. Use one name. |
| Race [02](ui-audit/02-race.jpg), [03](ui-audit/03-race-past.jpg) | Create a race · Run a past race. The past list opens under the cards. | The real races carry an orange warning, "the published distance disagrees with the course sheet". That note is for us, not a sailor choosing a race. |
| Create a race [04](ui-audit/04-setup-race.jpg) | **About 30 controls on one screen:** host club, sailing instructions (folded), course choice, course picker, course legs, 5 club boats, + Add one, your boats, boat picker, Your boats…, boat line, crew line, Who's aboard, start by the line or from her slip, date, time. On the right: a conditions table, a tide and wind graph, its source line, More about the day, Change the conditions…, Course and strategist, Practice the start, Start. | The steps are numbered 1–5, but the right column isn't. "Your boats…" and "Who's aboard" both lead into the Yacht Club under different names. The game's own displays (start timer, Start line card, Flags, Coach, Messages, map, buttons) all show behind the panel and change as you click. |
| Conditions [07](ui-audit/07-conditions.jpg) | Kind of wind, 4 sliders with REAL/USUAL chips, 4 segmented rows, a paragraph, and 2 Done buttons plus "Put everything back to real". | "All real." appears twice: in the lede as a link, and as the bottom button. |
| Cruise [08](ui-audit/08-setup-cruise.jpg) | Where (Plan on the big chart, Start/Destination, the chart, Start from her slip), boat and crew, when; conditions on the right; Passage plan; Cast off. | Clear. "Plan on the big chart" and "Passage plan" are two ways into the same planning. |
| Yacht Club: Boats [09](ui-audit/09-club-boats.jpg) | Grid/List, New boat, Boats/Members tabs, "Club · Seasons: later". | "Seasons: later" is a promise in the UI. Grid/List is a choice nobody needs with one boat. |
| A boat's page [10](ui-audit/10-club-boat-page.jpg) | Race her · Cruise her · Edit; particulars, with the crew picked by seat; the boat; race record; crew history; time of day and Conditions… for the showroom. | Good, and Crew Model's intent: "the one place a boat's crew is set". "Skippers and crews come with the Yacht Club; until then…" is out of date: they have. |
| Yacht Club: Members [11](ui-audit/11-club-members.jpg) | **Everyone / Skippers / Crew / Yours**, New member, member cards with badges ("Your member · Skipper & crew") and every rating. | See §3.5. |
| A member's page [12](ui-audit/12-club-member-page.jpg) | Name, height, weight, skill; "As crew, when you crew" sliders; All as skill. | Two back links (‹ Back, ‹ Members). "You" appears three times (the card's name, the heading, the badge). |
| Settings [13](ui-audit/13-settings-keys.jpg) | 3 training aids, How to sail her, then **every key** (about 60 rows). | Opened from the start page, the start page shows half-hidden behind it. Training aids and key bindings are different jobs on one long page. |
| Paused [14](ui-audit/14-pause.jpg) | Resume, Change the conditions…, Restart, Back to setup, Settings, Exit. | Clear. |

### 1.4 Behind every menu: the live game

Every screen above is a panel over the running race or cruise: [04](ui-audit/04-setup-race.jpg) and [09](ui-audit/09-club-boats.jpg).

- The race clock, Start line card, Flags, Coach, Messages, inset chart and corner buttons all show through the dim, and they change as you click setup choices.
- That costs reading attention (two layers of information) and speed: each choice rebuilds the race and the 3D scene. That is the lag the owner reported, which the Coordinator's item 2 fixes.
- The Yacht Club is worse: its boat page opens a 3D showroom with time-of-day controls ([10](ui-audit/10-club-boat-page.jpg)), but its list and members pages show the race behind them ([09](ui-audit/09-club-boats.jpg), [11](ui-audit/11-club-members.jpg)).

## 2. Proposed site map

```
Start page
├── Race
│   ├── Create a race (setup) ──▶ racing ──▶ results
│   └── Past races: real races · your logbook ──▶ setup (filled in) ──▶ racing
├── Cruise (setup) ──▶ cruising
├── Yacht Club
│   ├── Boats ──▶ a boat ──┬─ Race her ──▶ setup
│   │                      ├─ Cruise her ──▶ setup
│   │                      └─ Edit
│   └── Members ──▶ a member
└── Settings
    ├── Training aids
    └── Keys

Layers (they open over the screen you're on and close back to it; nothing else):
Conditions · Course and strategist · Passage plan · Flag index · Messages · Settings (from pause) · How to sail her
```

The changes from now:

1. One name: **Yacht Club** on the start page card, not Fleet.
2. **Past races** become their own entry under Race, holding the real races and your logbook's races. They don't open inside the Race page.
3. **Settings** splits into two tabs, Training aids and Keys. It opens as a layer from anywhere, the start page included, with the screen behind it hidden, not half-showing.
4. **The dead `#club` "Coming next" screen goes.**

## 3. The back stack: rules

1. **One back control on every screen.** It sits top left and is named for the screen it returns to: "‹ Race", "‹ Josephine", "‹ Yacht Club", "‹ Members". Never a bare "‹ Back". It's worked out from where you came from, not written into the screen.
2. **A stack.** Opening a screen pushes the one you're on; back pops it.
   - Start page → Yacht Club → Josephine → Race her → setup: setup's back says "‹ Josephine".
   - Start page → Race → Create a race: setup's back says "‹ Race".
   - Setup → Your boats… → Yacht Club: the Yacht Club's back says "‹ Create a race".
3. **Going sailing keeps the setup on the stack, and only that.** Start the sequence or Cast off replaces the stack with [start page, setup]:
   - Paused → Back to setup, and Results → Back to setup, pop to the setup you sailed from.
   - "Exit to the start page" clears the stack to the start page. That's the only control that says "start page".
4. **Layers aren't on the stack.** Conditions, Course and strategist, Passage plan, the flag index, Messages and Settings open over the screen and close back to it. Each has one Done at top right and Esc. No second Done at the bottom.
5. **Esc is back** on every screen, as it is in the pause menu now. On the start page it does nothing.
6. **Tabs aren't steps.** Boats ⇄ Members in the Yacht Club, and Training aids ⇄ Keys in Settings, change the view without pushing onto the stack. Back from Members goes where Boats would go.
7. **A sub-page inside a page replaces the page's own back link.** On a member's page there's one link, "‹ Members". The Yacht Club's "‹ …" shows only at the Yacht Club's top level.

To build it: a small `nav` module with `push`, `back`, `replace` and `label()`. The `data-home` click router and `fleetFrom` become calls on it. Each screen's back link reads `nav.label()`.

## 4. Per-screen simplifications

### 4.1 Start page
- Rename the Fleet card to **Yacht Club**: "Your boats, your crew, the club".
- Settings stays as the small button.

### 4.2 Race
- Two cards: **Create a race** and **Past races**.
- Past races opens its own screen, with the real races first and then your logbook's, each with "Sail it".
- Move "the published distance disagrees with the course sheet" into the race's details, or drop it. Show the course's real distance, and keep the note for the code and the docs.

### 4.3 Create a race
Make the left column four steps, each a one-line summary that opens when you click it. Today the sailing instructions and the crew already work this way.

1. **Club and course.** "Golden Gate YC · Seaweed Soup · Course 2 (3.2 nm) · 3-min sequence, P flag". Opening it shows today's host, course and SI controls.
2. **Fleet.** "Red, Blue, Green". Opening it shows the chips.
3. **Your boat and crew.** "Josephine · you + 2 (597 lb) · from the line". Opening it shows the boat picker and the seats. Change "Your boats…" to "Edit in the Yacht Club ›". It's one link, and its name says where it goes.
4. **When.** Date and start signal, always open.

- The right column stays as it is: the day's conditions, Change the conditions…, Course and strategist, Practice the start, Start the sequence.
- Drop the number on each step if all four fit without scrolling. They do at 1440×900, folded.
- Nothing behind the panel but a still of the Bay (item 2). The game's own displays go away while you set up.

### 4.4 Conditions
- One Done (top right).
- "Put everything back to real" stays as the only bottom button, and the lede's "All real." link goes.
- The paragraph about chop, swell, fog and ships moves into each row's hover text, where it answers the row you're looking at.

### 4.5 Cruise
- One planning entry: keep **Passage plan**, and let it open the big chart.
- "Plan on the big chart" goes.
- Otherwise it's already the shape §4.3 proposes for racing.

### 4.6 Yacht Club: Boats
- Drop Grid/List until there are enough boats for a list to help. The grid shows a picture of each, and that's the point.
- Drop "Club · Seasons: later".

### 4.7 A boat's page
- Keep it. It's the one place a boat's crew is set, by seat (Crew Model).
- Remove the out-of-date line "Skippers and crews come with the Yacht Club; until then…".
- Its back link is "‹ Yacht Club", or "‹ Create a race" if you came from setup.

### 4.8 Yacht Club: Members
The owner: "makes no sense to me". Crew Model: "The Everyone/Skippers/Crew/Yours filter was only for finding people once there are many members; today there are few, so it can go or become one filter of your choosing. Plain words, no badges."

- **Remove the filter row.** List everyone, you first, then your crew, then the club's members, under two plain headings: "You and your crew" and "The club". This gives the same information as the filter, with nothing to click.
- **No badges.** "Your member · Skipper & crew" goes. A card says, in one line, who they are and where they sail: "Middle crew on Josephine (the main) · 5'9", 172 lb".
- Each card shows **three ratings**, the ones for the seat they sail. All six or seven ratings are on their page.
- **When the roster grows** (the club's own members), add one search box at the top. A single filter of your choosing can come later; a set of four tabs shouldn't.

### 4.9 A member's page
- One back link, "‹ Members".
- One title: their name, with the one-line description under it.
- The ratings stay as Crew Model specifies: six crew ratings, "Also sails as a skipper", and the skipper half. Yours are editable and the club's members' are read-only.

### 4.10 Settings
- Two tabs: **Training aids** (the three toggles and How to sail her) and **Keys**.
- One Done, at top right.
- Keys gets the section headings it has now (Helm, Sails, …) as a short index at the top, so you jump to a section without scrolling 60 rows.

### 4.11 Paused and Results
- Paused: unchanged.
- Results: add "Exit to the start page" beside "Back to setup", the same words as in the pause menu.

## 5. Order of work, once the owner has marked this up

1. The back stack (§3). It's one module and fixes the owner's main complaint everywhere at once.
2. Members without the filter (§4.8), and the out-of-date lines (§4.6, §4.7).
3. Setup folded into four summaries (§4.3), after item 2 (no rebuilds while you set up), which it builds on.
4. Settings tabs (§4.10) and one Done everywhere (§3 rule 4).
5. Past races as their own screen, and Yacht Club as the start page's name (§2).

Questions for the owner:

- (a) Is the site map in §2 right?
- (b) Folding the setup into summaries: yes, or keep everything open?
- (c) Members: two headings and no filter, as in §4.8?
