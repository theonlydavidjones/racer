# Proposal: lines to both sides of a slip (marina audit item 1)

For the physics reviewer. No code yet; `inBerth`'s tolerance stays as it is.

## What happens now
At Richmond YC's slips that face about 209° (D6, D44, C34), the westerly comes about 70° on her starboard bow. Brought in at a slow walk with her lines ready, she's made fast, but never reads "In her berth".

A trace of D6 at 8 and 14 kt (the sim's own run, 120 s):
- **Her lines are all on one side.** Bow (forward 3.4 m, led 1.2 m forward), stern (aft 3.4 m, led 1.2 m aft) and spring (amidships, led 3 m aft) all go to the port finger (`world.ts` `addLine`, `m.side`).
- **The wind presses her onto that finger:** the gap there is 0.00–0.05 m. She lies 0.55–0.72 m to port of the slip's centerline and 0.3–0.9 m aft of her place.
- **The lines go slack.** Each line's goal length (`goalLen`, `world.ts:2222`) is worked out for her lying on the slip's centerline. Pressed 0.6 m nearer the finger, every finger-side line is longer than it needs to be: bow, stern and spring read 0 N, with one gust's 322 N on the bow line at 14 kt.
- **So nothing holds her fore and aft, or in yaw,** against the finger's fender. She works aft and yaws 5–15° to and fro (the trace swings between −2.6° and −15.4°) and never settles within 0.6 m and 6°.
- **When the wind comes from the open side** (the slips facing 29°), the same three lines hold her: the wind sets her away from the finger, onto them. That's why only one facing fails.

## What a real crew does
In a slip with a finger on one side and a finger or pile on the other, the crew doesn't lie on one side's lines. The bow and stern lines go to both sides, crossed or straight, and the springs go on the finger. That way she's held in the middle of the slip whichever side the wind comes from, off both fingers.

This is the standard slip tie-up. BoatUS, "Tying up at the dock" (https://www.boatus.com/expert-advice/expert-advice-archive/2014/january/tying-up-at-the-dock):

> Tying up in a slip typically works best with four docklines: two bow lines, and two stern lines.

It adds springs for boats over 35 ft, or in strong wind or current.

**This is from a search snippet only, not yet checked on the page:**
- boatus.com, westmarine.com and boatingmag.com don't resolve from this session.
- The search tool may have paraphrased the quote.
- Chapman wasn't reached.

No source was found on how a boat lies with lines on the finger side only, pressed onto the finger by the wind. The diagnosis above is the sim's own trace.

The DOCKING-PROPOSAL's three lines are the alongside-a-dock set. In a slip they're half of it.

**So it's the lines that are wrong, not the tolerance:** the boat is missing the windward bow and stern lines.

## The change
1. **Two more lines,** after the spring (crewed; alone, after the stern line). The bow and stern lines go to the other side of the slip, made fast to its goal length with her on the slip's centerline (`addLine` as it is, on `-m.side`, roles `bow` and `stern`).
2. **Only where there's dock to reach:** `dockPointAbeam` finds a dock edge within 3 m of her centerline pose on that side. Where none is in reach (an open side with no finger or pile), no line is taken and nothing changes.
3. **No change to `inBerth`, `goalLen`, the line physics** (`boat/dockLines.ts`), **or the docked lie** (`dockStep` settles her on the slip's centerline, as now).
4. **Timing:** each line is about 4 s more of the crew's time, the same as the others: `phase: 'springs' → 'cross' → 'fast'`, with the "Made fast" cue once all are on.

## Its effect, measured with a prototype
The prototype was not committed. It ran 16 slips × 2, 8 and 14 kt westerly, straight in from 9 m at 0.4 m/s, as `docking.test.ts` does, for 120 s each:

| Lines | In her berth | Not |
|---|---|---|
| Today (3 lines, one side) | 42 / 48 | Richmond D6 at 8 and 14, D44 at 8 and 14, C34 at 14 (all 0.84–1.03 m off); South Beach D48 at 14 |
| + a stern line to the other side | 42 / 48 | the same six |
| **+ bow and stern lines to the other side** | **47 / 48** | South Beach D48 at 14 |

The 16 slips:
- Richmond: D6, D44, C34, D31, B3.
- One each in West Harbor (405), Gashouse Cove (406), South Beach (D48), the Olympian YC (B22) and Horseshoe Bay (B6).
- Six more in West Harbor.

Both facings are in the set: Richmond 209° and 29°, West Harbor and Gashouse about 170°, South Beach 355° and Horseshoe Bay 263°.

**The tests:**
- `docking.test.ts` and `crewdock.test.ts` count lines only as "any line ashore" (`lines.length > 0`), so the extra lines don't break them.
- `crewdock`'s "your car call waits while they're ashore with the line" will wait about 8 s longer, inside its 60 s.
- A new test should run the Richmond 209° slips at 8 and 14 kt and expect "In her berth" in 120 s.

## Separately: South Beach D48 at 14 kt
She ends 4.8 m off, made fast, so this isn't the same failure: the lines were made where she lay, short of her berth. Her slip faces 355° with the westerly on the beam at 14 kt. She's blown down before the first line is ashore, and the crew's 250 N per hand can't warp her up to windward (`HAND_N`, `world.ts:2176`). This may be right: a Folkboat's windage at 14 kt abeam is more than two hands can haul. It needs its own look before it's called a bug. It's listed here so it isn't lost.
