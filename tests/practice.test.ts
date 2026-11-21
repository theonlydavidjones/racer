import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { RC_COURSE } from '../src/courses/committee';
import { seasons } from '../src/club/season';
import { CLUB_COMMITTEE, asTheClubRunsIt, coursePicker, hostOf, seasonRaceFor } from '../src/club/practice';

/** r275 (the owner, 20 Nov 2026): Practice, not Create a race. At a default club you sail it as the club runs it; anyone
 * may sail any course on any day, but a practice sailing never counts in a season. */
describe('Practice at a default club', () => {
  const clubCourse = COURSES.find(c => c.group)!.id, areaCourse = COURSES.find(c => !c.group)!.id;
  const mine: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: clubCourse, seq: 2, prepFlag: 'black', penaltyTurns: 1, judging: 'umpired', bias: 8 };

  it("the club's own committee settings, whatever yours were", () => {
    expect(hostOf(clubCourse)).toBe('ggyc'); expect(hostOf(RC_COURSE)).toBe('ggyc');
    const s = asTheClubRunsIt(mine);
    for (const [k, v] of Object.entries(CLUB_COMMITTEE.ggyc)) expect((s as unknown as Record<string, unknown>)[k], k).toBe(v);
    expect(s.course).toBe(clubCourse); // (the course is yours to choose)
    expect(mine.seq).toBe(2); // (your own settings left as they were)
  });

  it("the practice area (no club): its own committee's plain start, your sequence's length, 1 to 5 min", () => {
    expect(hostOf(areaCourse)).toBe('practice');
    const s = asTheClubRunsIt({ ...mine, course: areaCourse });
    expect([s.seq, s.prepFlag, s.penaltyTurns, s.bias]).toEqual([2, 'P', 2, 0]); // (rule 30's flags: the start drill's)
    expect(asTheClubRunsIt({ ...mine, course: areaCourse, seq: 9 }).seq).toBe(5);
    expect(asTheClubRunsIt({ ...mine, course: areaCourse, seq: 0.4 }).seq).toBe(5); // (nothing set: RRS 26's five)
    expect(asTheClubRunsIt({ ...mine, course: areaCourse, seq: 1 }).seq).toBe(1);
  });

  it('a cruise or a drill is untouched', () => {
    expect(asTheClubRunsIt({ ...mine, mode: 'sail' }).seq).toBe(2);
    expect(asTheClubRunsIt({ ...mine, mode: 'drill' }).prepFlag).toBe('black');
  });

  it("a practice sailing set up exactly as a season race never counts in the season; the same race from the Season page does", () => {
    const series = seasons().find(x => x.races.some(r => !r.abandoned && r.courseId))!, r = series.races.find(x => !x.abandoned && x.courseId)!;
    const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, windTurn: 0, windDir: null, current: 'real', opponents: [...series.fleet], fleet: series.fleet.length };
    expect(seasonRaceFor(S, null, false)).toBeNull(); // (Practice: entered from no season)
    expect(seasonRaceFor(S, { series, no: r.no }, false)).toEqual({ series, no: r.no });
    expect(seasonRaceFor({ ...S, windKt: 18 }, { series, no: r.no }, false)).toBeNull(); // (its conditions changed: not the season's race)
    expect(seasonRaceFor(S, { series, no: r.no }, true)).toBeNull(); // (the wind pinned for a race sailed again)
  });
});

describe("Practice's course picker (the host toggle replaced, choice A)", () => {
  const g = coursePicker(COURSES);
  it('groups every course by its host, each club\'s series under its name, the practice area last', () => {
    expect(g.flatMap(x => x.options.map(o => o.id)).filter(id => id !== RC_COURSE).sort()).toEqual(COURSES.map(c => c.id).sort());
    expect(g.at(-1)!.label).toBe('Practice area');
    expect(g.at(-1)!.options.every(o => hostOf(o.id) === 'practice')).toBe(true);
    for (const x of g.slice(0, -1)) { expect(x.label.startsWith('Dorado Yacht Club · ')).toBe(true); expect(x.options.every(o => hostOf(o.id) === 'ggyc')).toBe(true); }
  });
  it("the club's committee's choice heads its list, once", () => {
    expect(g[0].options[0]).toEqual({ id: RC_COURSE, label: "The committee's choice" });
    expect(g.flatMap(x => x.options).filter(o => o.id === RC_COURSE)).toHaveLength(1);
  });
});
