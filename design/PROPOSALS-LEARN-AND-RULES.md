# Two proposals for the owner (Debrief, 13 Nov 2026)

Pictures, not builds. Both would live in the Drill section, as tiles beside the start, rounding and tack drills.

## Learn to sail — `learn-to-sail-mockup.png`

There are twelve lessons, one tile each. A tile shows what you do and how the sim checks it.

- The lessons follow US Sailing's Basic Keelboat standard: its skill groups and its 5–15 kt wind range.
  Source: https://www.ussailing.org/education/adult/certification-courses-endorsements/basic-keelboat/ (fetched 13 Nov 2026).
- On the water the only text is one cue line, such as "▲ Back the jib to port". This is the one place step-by-step instruction belongs.
- A lesson ends with ✓, or with "try again" and its replay.
- Passing all twelve puts a badge on your skipper.

The standard's knowledge items aren't on-water skills: its four knots (stopper, bowline, cleat hitch, square knot),
distress signals, hypothermia, and anchoring, which the standard lists as knowledge only. Reefing has no Folkboat
source yet, so lesson 11 depowers instead.

For the owner:
1. The knowledge items: a short card between lessons, or left to a real course?
2. The badge's name. It is never an official US Sailing certificate.
3. The pass thresholds (10°, 30 s, 25°, under a knot…) are proposals, to tune on the water.

## Rules trainer — `rules-trainer-mockup.png`

The picture shows World Sailing Case 7, as summarized in docs/RULES-CASES.md: "L overlapped from astern within 2 lengths, not above her
proper course: W broke 11". Rules 11, 15, 16.1, 17; the Case Book 2025–2028, p. 85.

- The two boats are placed from the Case's diagram, sailed up to the moment, and paused.
- You answer: W, L, or Neither.
- The answer is one line, with the rules it turns on.
- Buttons: "Watch again", "Sail it yourself" (you helm one boat) and "Next Case".
- Sets follow the rulebook's parts. Only Cases the rules engine covers are used (docs/RULES-CASES.md marks which), so the sim's own judgment
  agrees with the Case Book.

The HTML files render with `node design/<name>.gen.cjs`.
