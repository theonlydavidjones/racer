# Dock work: what it's like to play (r294; a plan for the owner, no build)

The owner (20 Nov 2026) asked what dock work's economy looks like, how its animations work, and how to make it fun.
They also said that cleaning is a broom from the dock and leaning over the side where there's no dock, or a diver
named Mike, never a haul-out.

The idea: **keeping her is part of sailing her.** A Folkboat sailor knows her bottom, her rig and her bilge. The game
should make that knowledge pay off on the water and feel good at the dock, not feel like a chore list.

## The economy: time, not money

There's no money in the game (FTUE brief), and dock work shouldn't add it. What it costs is **your time, or a favor**:
- **Do it yourself:** it takes time at the dock (real minutes, compressed), and it's the cheapest way, the satisfying
  one, and the one you learn from.
- **Hire Mike:** it costs no time of yours, but he comes on his schedule ("Tuesday"), not yours. A diver's real rates
  and rounds would be researched before anything like a price appears.
- **Your club's members** can help: one of your crew does the job (members already exist, club/members.ts), and does
  it as well as their skill. That's the community the owner wants: you can't keep a boat alone.

The return is **speed you can see**: the next race's setup shows "clean bottom" or "slime, 5 weeks". The coach can
name it after a slow beat ("her bottom's 6 weeks foul: about 0.1 kt upwind"), from the sim's own fouling drag.

## The jobs

| Job | Yourself | Someone else | What it changes |
|---|---|---|---|
| **The bottom** | At her slip: a long-handled brush from the dock along the side that lies against it. The other side needs you to lean out from her deck, or to turn her in the slip with her lines, a small seamanship puzzle. | **Mike** dives on her at the slip; his dive flag is up (Code flag A, the real diver-down signal); his bubbles come along her keel. Later a note: "Did your bottom. Zinc's half gone." | The fouling drag (fouling.ts, already sourced) |
| **The rig** | Count the turns on the turnbuckles, read a tension gauge, sight up the mast. The editor's tune, done with your hands. | A member who knows rigs, or the class's tuning guide's numbers (Heikkilä, already in rigTune.ts) | The rig tune, as now |
| **The bilge** | Sponge or hand pump: a stroke rhythm, the gauge falling. Underway, a crew member goes below and pumps, and is off the rail meanwhile. | A member, while you're away | Weight aboard, low and sloshing (after research) |
| **Repairs** | After damage: the yard has her for the days it takes, as now. | — | Laid up |

## Animations

- The crew bodies and poses already exist (render/crew.ts, crewBody.ts). Dock work adds a few poses:
  - kneeling on the dock with the brush;
  - leaning over the rail;
  - at the pump;
  - at the shrouds.
- These use the same figures the crew already are, so no new character art is needed beyond Mike in a wetsuit.
- **The hull shows her bottom.** A fouling texture grows at the waterline and below, from a green slime line to weed
  and barnacles, driven by the same numbers as the drag. The brush clears it where it passes.
  - You see the work done, stroke by stroke. That is the satisfying part.
- **Time compresses:** a job runs a few seconds of real play, sped up the way the race clock already speeds up.
  You can always hand it to the crew instead.
- Mike's visit plays as you arrive at the marina, or as the note on her page if you weren't there.

## What makes it fun

- **It's tactile:** brushing slime off and watching her paint come back. That is the same pleasure as a clean hull in
  real life.
- **It pays off where it counts:** a faster boat on Saturday, and the game says so, in knots, from the real physics.
- **Small puzzles:**
  - turning her in a tight slip to reach her far side;
  - judging whether there's time to clean before the race;
  - tuning for tomorrow's forecast.
- **People:**
  - Mike, with a voice and opinions ("Barnacles love this water in August.");
  - your crew, who help and get better at it;
  - a club work day.
- **The Bay's seasons:** she fouls faster in late summer's warm water (fouling.ts, by month), so care has a rhythm
  through the year, like real sailing.
- **Never punishing:** fouling grows visibly and slowly. One click hands the job to Mike or the crew. A player who
  doesn't care loses a little speed, never a race outright.

## Order of building (once approved)

1. The Care tab on her page, with fouling on your clock, visible (questions 1 and 2), and "Have Mike clean her".
2. The fouling texture on the hull.
3. Brushing it yourself at the dock: the poses and the brush, and the far side's puzzle.
4. The rig at the dock (r041), from the editor's tune.
5. The bilge, after the researcher has sourced the leak, rain and spray rates.

## To research before building

- How fast a Bay boat's bottom fouls in the real months. fouling.ts has a model; check it against what Bay divers say.
- How often Bay owners have a diver, and what a diver's visit involves (zinc checks, prop, through-hulls).
- The Folkboat's bilge: a glassfibre boat's against a wooden one's leaks, the cockpit's drainage, the bilge pump.
