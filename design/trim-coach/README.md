# The trim coach, revamped (mock-up for the owner)

The owner, 14 Nov 2026: "info is flying by way too fast. too hard to follow. I'd also like a way to pause and get notes on
my trim. basically have it tell (in a format that mimics the current sail control array) what each line is currently
doing to the boat, what it should be doing (if not optimized already), and why."

The stills are drawn over the real page (`mock.cjs`, against the dev server). Every line's target and its order come from the
coach's own model (`src/boat/coach.ts` `lessons()`: each line's best setting found in the boat's own equations, ranked by
the speed it's worth), for a boat close-hauled in about 6 kt with the jib eased and the vang off.

## 1. Live: one note, held (`1-live.jpg`)

- **One note at a time**, the biggest first: what to do in a few words, then *now* and *why* in one short line. "1 of 2"
  says more are waiting.
- **The line it's about is ringed in the band**, with a teal ◆ on its track where it should go. The note points at the
  thing to touch.
- **Held long enough to act on.** A note stays at least 12 s; the bar along its foot runs out over that time. It changes
  only when:
  - **you fixed it:** "That's it: jib drawing, 2.2 → 3.1 kt" for 4 s, then the next;
  - **something worth at least twice as much turns up**, and at least 1% of her speed;
  - **the situation changes** (a tack, a jibe, a rounding): the coach waits until she's settled for 5 s.
- **Nothing while she's tacking, jibing or rounding.** The card's other small print (main/jib states, heel, helm) goes:
  the band shows those already.
- This is a change to `CoachMemory` (`coach.ts`), which already holds a lesson against small changes; it gets the
  12 s hold, the 2× rule and the settle wait.

## 2. Where Trim Notes lives (the owner: "Trim notes in the menu doesn't make sense")

The pause-menu entry is gone. Two options follow; Option 1 is the pick.

### Option 1 (the pick): in the band, where the lines are (`4-opt1-closed.jpg`, `5-opt1-open.jpg`)

- **Ways in:**
  - a **Notes** tab in the band's own tab row, beside Hand back;
  - **All notes ›** in the live coach note;
  - a key (N, rebindable in Keys).

  No new on-screen button: both doors are in elements that are already there.
- **The notes grow up out of the band.** One card per line, in the band's own order. A leader runs from each card
  down to its line's column, amber for the lines to fix. The fix's teal ◆ sits on its track.
- **The band stays live underneath.** You work the line right under its note, and the card turns green when it's right.
- **Time slows to ¼ rather than stopping,** so a change has an effect you can see (the telltales, the speed). Space
  pauses fully if you want, and Notes or Esc closes it.
- **Why this one:**
  - **Proximity:** each note sits over the control it's about, joined by a line, so there's nothing to map in your head.
  - **Direct manipulation with immediate feedback:** you fix a line under its note and watch the note go green.
  - **Progressive disclosure:** the live note gives one thing; All notes gives everything, from the same card.
  - **No modal for a task you'll do often:** the boat stays in view and the race carries on, slowly.
  - **Consistency:** Notes sits in the same tab row as Hand back, the band's other whole-band action.

### Option 2: the coach note opens a sheet (`6-opt2-sheet.jpg`)

- **The way in:** All notes › in the live coach note (and the key) opens the sheet from the first mock-up, the band
  laid out large, and pauses.
- **Clearer to read at length, but weaker on three counts:**
  - it's modal and covers the boat;
  - the notes are away from the controls, which is the mapping the owner asked to see;
  - you can't work a line and watch its note change.

## The words come from the physics

- **SHOULD and the target** are the coach's own (`lineLesson`, `bestFor`).
- **NOW and WHY** will be new fields on each `Lesson` (`now`, a short `why`), written beside the existing longer `why`
  in `lineLesson`, from the same state it reads: the sails' flow, the boom angle, the line's direction.
- **The physics-reviewer checks every phrase** against the model and the North Sails Folkboat guide before it's built.
  One to check: the model asks for vang on upwind in light air here, with the main eased. Usual practice in light air is a
  slack vang with the mainsheet holding the leech; whether the model's ask is right for an eased main is the reviewer's call.

## Shared with Debrief

Learn to Sail's training mode (Debrief) is being redesigned at the same time. The proposal is one visual language for
both:
- amber = yours to fix, numbered;
- teal ◆ = the target on a line's track;
- green ✓ = right.
