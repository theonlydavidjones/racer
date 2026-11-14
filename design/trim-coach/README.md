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

## 2. Pause: Trim Notes (`2-pause.jpg`)

Opened from the pause menu, where Trim Notes sits first beside Change Conditions. It also opens by clicking the band's
windex, which pauses her. No new on-screen button.

## 3. Trim Notes: the band, line by line (`3-notes.jpg`)

- **The band's own layout, enlarged.** Its top row is port to starboard: jib car, jib sheet, main halyard, jib
  Cunningham, main Cunningham, outhaul, vang, (the windex: point of sail, angle, how many to fix), jib halyard. Its bottom
  row: backstay, mainsheet, traveler. The dual-ended lines appear once.
- **Each line's track**, with where it is now (white) and, if it's not right, the target (teal ◆) and the way to it.
- **Lines to fix are numbered by what they're worth** (amber). Each has three short parts:
  - **NOW:** what it's doing to her ("Off: the top of the main twists away");
  - **SHOULD:** the step to take, in the band's own words ("Vang on, a good pull");
  - **WHY:** one reason ("With the sheet eased, only the vang holds the leech.").
- **Lines that are right get a green ✓** and a few words ("Foot right for 6 kt").
- **The header gives the situation and her speed against the polar's** (2.2 of 3.8 kt). Back, or Esc, returns to the pause menu.

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
