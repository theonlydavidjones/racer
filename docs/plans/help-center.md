# Help Center: outline (r290; ROADMAP 8s13)

The owner, 20 Nov 2026: a Help Center "doesn't exist yet". This is a plan only; nothing is built.

## 1. One idea: an index, not a manual

Most of the help is already in the game, spread across screens a player can't find:

| Already built | What it explains | Where it opens today |
|---|---|---|
| Keys (`ui/keysView.ts`) | every key, rebindable | Settings |
| Tools tray (`ui/toolsTray.ts`) | every on-surface feature and its key | top bar |
| Map key (`ui/legend.ts`) | every line and symbol on the map | the inset map / chart |
| Flag index (`ui/flagIndex.ts`) | RRS race signals, word for word | the Flags tile |
| Trim Notes (`ui/trimNotes.ts`) | each line, what it's doing and why | coach note / Shift+T |
| Learn to sail (`ui/lessons.ts`) | 11 lessons, ASA 101 items on hover | Drill → Lessons |
| Rules trainer (`ui/rulesTrainer.ts`) | the Case Book, sailed | Drill → Cases |

The Help Center is one grid of tiles that opens these screens where they are. It writes as little as possible of its own.
Each topic is a tile:
- a picture;
- a name;
- at most one line;
- where it leads.

That follows the owner's rule: no blocks of copy, visuals over words.

## 2. Where it opens (no new button)

- **The pause screen:** a **Help** entry in the group that holds Settings (`#pause .mgrp`, beside `#bKeys2`).
- **Keys:** the Settings screen's Keys tab, and the **`?`** key (Shift+/: "?" is unbound, though "/" is taken; bindable like the rest).
- **The start page:** a "Help" link in the start page's footer, beside Settings. It's a link, not a mode card.

It opens paused, as Trim Notes does. **Esc** goes back (docs/UI-AUDIT.md rule 5).

## 3. The sections, and what each tile is

1. **Controls and keys**
   - A keyboard diagram: the bound keys lit and grouped by color (Helm, Sails, Crew, Views, Racing). Hover a key to see its action.
   - Built from `DEFAULT_KEYS`, so it follows rebinding.
   - Opens Keys to change one.
2. **The instruments and the top strip**
   - A labeled screenshot of the game surface: each pod (clock, BSP, Heading tape, TWS, tide), the START LINE card, the Coach card, the sail band and the inset map, with a numbered dot each.
   - Hover a dot: one line, the pod's own `title`. That text already exists on most pods.
   - This is also r289's onboarding answer: the same picture, stepped through once on a first race.
3. **Sail trim**
   - The sail band as a diagram, each control named.
   - Tiles to **Trim Notes** (live) and to the telltale and point-of-sail lessons (4, 5).
   - No trim theory here; the lessons and the coach own it.
4. **Racing rules**
   - Tiles: **Flag index**; **Rules trainer** (the Cases); the four rules a beginner meets first (10, 11, 12, 13), each a two-boat diagram with one line and a link to its Case.
   - Penalty turns: an animated two-turns diagram.
5. **The chart**
   - The map **key** (`legend.ts`) shown in full, not only what's on now.
   - The layer row's icons, each with its name.
   - A tile to the full chart.
6. **Marinas and clubs**
   - A small chart of the Bay's harbors in the game (from the marina data), each a tile: its clubs' burgees, slips, and how to sail from there.
   - Docking: the "Before you go" and "Home to the slip" lessons (2, 11) and the berth cues' words (Closer, Too fast, Step, Made fast).

## 4. Linking, not repeating, Learn to sail

- Each Help topic that a lesson teaches shows that lesson's **tile** (its picture, ✓ if passed) as its first item. Clicking it starts the lesson.
- The mapping lives in one table (topic → lesson ids) beside `LESSONS`. Lessons stay the one place their content is written.
- Lessons don't link back. The Help Center is the index; lessons stay uncluttered.

## 5. Visual, not copy

- **Tiles everywhere:** the lessons' style (`ui/lessons.ts`), a picture and a name.
- **Diagrams drawn from live data**, so they never go stale:
  - the keyboard from the key map;
  - the map key from `legend.ts`;
  - the flags from `flagIndex.ts`;
  - the surface screenshot's dots from the pods' positions on screen.
- **The only new words:** one line per tile and per surface dot. Methods and caveats stay behind a hover or are cut.

## 6. Build order (estimates)

1. The shell: the overlay, the pause entry, `?`, Esc, and the tile grid linking the screens in §1. About half a day.
2. The surface picture with hover dots. This also serves r289. About half a day.
3. The keyboard diagram. About 2–3 h.
4. The rules diagrams (10, 11, 12, 13, penalty turns). About a day; physics-reviewer checks the diagrams against the RRS.
5. Marinas and clubs. After the FTUE's club work (8s7); about half a day.

Each step: stills to the owner first; UI tier.
