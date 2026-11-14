# Learn to Sail as a training mode (mock-up for the owner)

The owner, 14 Nov 2026, on lesson 4 in v194: "it doesn't seem any different right now than regular cruising mode … I
didn't see any line at the top. need this all to be clearer and feel like a training mode for someone new."

The stills are drawn over the real page (`mock.cjs`, against the dev server with #359's top line in). Lesson 4, Points of
sail, is shown in detail. Every other lesson follows the same five moments.

The visual language is shared with the trim-coach revamp (UI & Experience, design/trim-coach):

| Mark | Means |
|---|---|
| amber | yours to do |
| teal ◆ | the target, and a dashed teal way to it |
| green ✓ | right |
| fill along the card's foot | progress |
| amber ring | the control to use |

Nothing new on screen. The marks go on what's already there:
- the top line (#359);
- the heading tape;
- the windex;
- the band;
- the pilot head;
- the inset map;
- the pause card.

## The five moments (lesson 4)

1. **Start** (`1-start.jpg`). The lesson opens paused on one card:
   - the lesson number and name;
   - what it teaches, in one line;
   - a picture: the five points round the wind, the first one teal;
   - Go (or Enter).

   It runs at ½× speed while you learn, and the Speed button takes it back to 1×.
2. **What to do now** (`2-do.jpg`). One short line at the top: "Head up to close-hauled". Under it, five dots for the five
   points: done ones green, this one amber.
   - The target is a teal band on the heading tape: the headings that put her on that point, from the real wind, ◆ at its
     middle.
   - The windex's point word is amber while she's off it.
3. **Holding it** (`3-hold.jpg`). In the band, the line says what to hold ("hold it, both telltales streaming"). The fill
   runs along its foot over the 15 s, and the windex word turns green.
4. **Stuck** (`4-stuck.jpg`). After 20 s with no progress, the help:
   - a dashed teal way from her heading to the band on the tape;
   - an amber ring on the control to use, with a few words: here the pilot head, "−10: up toward the wind".

   Steering by hand, the ring goes on the tiller guide. A trim step rings the sheet in the band, as the trim coach does.
   The help clears as soon as she's moving the right way.
5. **Passed** (`5-pass.jpg`). The line turns green with ✓, the fill is full and the dot goes green.
   - About 2 s later, the next point's line and band appear.
   - The last one ends on a green card: the lesson passed, and on to the next lesson.

## Every lesson, the same way

| # | Lesson | Start picture | What to do (the target) | Progress | Help when stuck (ringed) |
|---|---|---|---|---|---|
| 2 | Before you go | the boat at the dock, gear | the dock card's items, one at a time, ringed | items ticked | the next item |
| 3 | The tiller | push the tiller, she turns the other way | the buoy, teal ◆ on the inset map and the tape | fill as she holds for it | the tiller guide, which side |
| 4 | Points of sail | the five points round the wind | the point's band on the heading tape | fill over 15 s, 5 dots | the pilot head or tiller guide; the sheet if the telltales fail |
| 5 | Stop, go, irons | luffing to a stop by a buoy | ease both sheets, then sheet in and bear off | fill; dots for stop, go, out of irons | the sheets in the band; the tiller guide |
| 6 | Tacking | "Ready about … Hard alee" | the new close-hauled band on the other tack | 3 dots for 3 tacks | the tiller guide, push to leeward |
| 7 | Jibing | "Ready to jibe … Jibe-ho" | a run band, then the other jibe's | 3 dots for 3 jibes | the mainsheet (centered first), then the tiller |
| 8 | Heave to | jib backed, tiller to leeward | jib to windward, tiller to leeward | fill as she settles | the jib sheet; the tiller |
| 9 | Rules of the road | port/starboard, windward, stand-on | the other boat, ringed on the map; the way to keep clear dashed | 3 dots, then the buoys | your helm to bear away, or "hold course" |
| 10 | Crew overboard | the figure-eight to a close reach | the person, teal ◆ on the water and map | dots for each stage | the tiller; the sheets to slow |
| 11 | A breeze | depowering: sheet, traveler, backstay | heel under the target on the band's heel mark | fill | the line to ease, as the trim coach rings |
| 12 | Home to the slip | out, sail home, into the slip | the slip, teal ◆ on the map | dots: out, sailed, alongside | the motor or lines card |

## To build (after the owner's yes)

- **The start card:** reuse #lessonCard, with the picture per lesson as an SVG in ui/lessons.ts.
- **The dots** under the top line.
- **The target on the heading tape:** a band drawn by the tape itself, hud.ts, from the lesson's own bands. Each lesson
  gives `target()` in sim/lessons.ts: a heading band, a point, or a line.
- **The windex word in a lesson:** it uses the lesson's bands, not ui/pointOfSail's. In `3-hold.jpg` the two disagree
  ("Close reach" against the lesson's close-hauled), and they mustn't.
- **The stuck timer** and **the ring**, shared with the trim coach's ring.
- **½× by default** in lessons, through the existing speed setting.

Questions for the owner:
- the stuck delay (20 s?);
- ½× by default, or only offered;
- whether the start card shows on every attempt, or only the first.
