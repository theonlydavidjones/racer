# Boat care: dock work (a proposal, r294; no build)

The owner, 20 Nov 2026 (with the editor changes, r293): hull cleaning isn't the boat editor's ("this feels like dock work to go along with certain kinds
of tuning or maintenance (maybe bilge pumping too, though that should also be doable underway)"). The editor is for how
she looks and is fitted; this is for how she's kept.

## What exists today (checked 20 Nov 2026)

| | What it is now | Where |
|---|---|---|
| Bottom | `perf.cleanedWeeks`, 0–26. It's set by hand and **never grows**: a boat stays "just cleaned" forever. The sim does use it: fouling.ts turns the weeks into slime and barnacles, faster in warm months (the Bay's water temperature by month), and condition.ts turns that into skin-friction drag. | Was in the editor (removed in 3c1a6160); shown on her page as "Bottom: …, cleaned N wk ago" |
| Rig tune | Set "at the dock" in the editor's Rig section: presets or your own forestay, shrouds and jumpers (rigTune.ts). The jumpers can also be set underway (r246). | The editor, Rig |
| Damage and repair | After a wreck or damage she's laid up for real days (`laidUpUntil`: 3 after a wreck, 1 after damage; WRECK-PROPOSAL.md). | Her page, "Laid up until …" |
| The crew at the dock | Pushing off, lines ready, letting go (the pushOff key). Nothing about maintenance. | Keys |
| Bilge water | None. No water aboard is modeled. | — |

## The proposal

**Where it lives: a "Care" tab on her page in the Yacht Club**, beside her particulars and logbook. It's reached the way
her page already is, so it adds no new on-surface button. It holds four tiles, each with its state and one action:

- **Bottom.** It shows the fouling as the sim has it (e.g. "slime · 5 weeks"), with a tile picture of the hull's
  underside. The action is *Have her cleaned* (a diver, done by the next sail).
  - New: the weeks **grow on your own clock**, between sails, as the ones that are laid up do already. Fouling is then
    real: leave her a summer and she'll be slow. The rates are fouling.ts's, already sourced.
- **Rig.** It shows the tune she's on, as a small rig diagram (rake and sag). The action is *Tune her*: the editor's rig
  tune fields, moved here.
  - The editor keeps mast and boom, since those are how she's built, not how she's set up.
  - This is where r041's dock tuning would land.
- **Bilge.** It shows how much water is aboard, as a gauge. The action is *Pump her*.
  - Underway, it's a crew job: asked from the Crew control that's already in the corner, or from a key in Keys. A
    crew member goes below and pumps, and is away from the rail while they do.
- **Repairs.** It shows laid up until the date, or "sound". This is the existing state, just moved here from her page's
  particulars.

## What bilge water needs before it's built (research first)

How water gets in, and how fast, has to be sourced before it's a number:
- a Folkboat's own leaks: a glassfibre one is nearly dry; a carvel or lapstrake wooden one weeps, more when she's just
  launched or driven hard;
- rain into the cockpit, and how the cockpit drains (Folkboats' cockpits are not self-draining);
- spray and green water when she's heeled far or swamped.

Water aboard is then weight: low and free to slosh, it moves to leeward and costs her stability and speed. It would go
through condition.ts's extra weight, the way gear and the outboard already do. A researcher run comes first; no
invented rates.

## The owner's answers (20 Nov 2026)

1. **A Care tab on her page.** Later, her slip on the marina chart opens the same tab.
2. **Fouling grows on your own clock, and is visible**, once Care is built. **Until then she doesn't foul while she
   sits**, which is how it already works: nothing advances `cleanedWeeks`.
3. **No haul-out for regular cleaning.** Sailors do it themselves: from the dock with a broom, leaning over the side
   where there's no dock, or they hire a diver, Mike. A haul-out for new paint is a separate, rare thing.
4. **Bilge: research first.** The other tiles don't wait on it.

The wider gameplay plan is in docs/DOCK-WORK-PLAN.md.
