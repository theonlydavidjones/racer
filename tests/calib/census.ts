// The foul census: how often the AI fleet fouls, and where, in whole races on real days (the skipper model's foul-rate
// work, docs/SKIPPER-MODEL-PROPOSAL.md, "The foul-rate target"). Five AI boats, your boat out of the fleet, each real
// day raced with four seeds, every rule incident between any two boats logged as it's judged (World.onIncident) with
// where it happened. `npm run census` runs the days in parallel and writes calib-out/census.md.
//
// Measure before and after a change with the same 16 races: six were too few (the same change read 23→14 fouls on one
// branch and 24→27 on another; a change reshuffles who meets whom).
import { chooseCourse } from '../../src/courses/committee';
import { COURSES } from '../../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import { DT, World } from '../../src/sim/world';
import { markDist } from '../../src/core/math';
import { fs, OUT } from './harness';

export const CENSUS_DAYS = [['2025-11-01', '12:03'], ['2026-11-07', '13:35'], ['2026-03-07', '12:03'], ['2025-12-06', '12:06']] as const;
export const CENSUS_SEEDS = [1, 2, 3, 4];

export interface CensusIncident { date: string; seed: number; t: number; fouler: string; other: string; rule: string; part?: string; kind: string; penalized: boolean; crowd: number; markM: number | null; prestart: boolean; legs: string }
export interface CensusRace { date: string; seed: number; touches: number; finished: number; abandoned: boolean }

/** Race one day with each seed: its incidents and races, written to calib-out/census-<date>.json. */
export function censusDay(date: string, time: string, seeds = CENSUS_SEEDS): { incidents: CensusIncident[]; races: CensusRace[] } {
  const incidents: CensusIncident[] = [], races: CensusRace[] = [];
  for (const seed of seeds) {
    const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', windKind: 'auto', windKt: 0, current: 'real', tideDate: date, tideTime: time, raceLength: 'medium', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], fleet: 5 };
    const w = new World(chooseCourse(COURSES, S)!.est.file, S, seed);
    { const u = w.boats[0]; u.x += 1e5; u.y += 1e5; u.v = 0; u.vx = 0; u.vy = 0; } // (a real fleet has no boat lying idle at the line)
    w.onIncident = (A, B, inc) => {
      const f = inc.fouler, o = f === A ? B : A, m = w.nextMark(f);
      incidents.push({
        date, seed, t: Math.round(w.t), fouler: f.name, other: o.name, rule: inc.rule, part: inc.part, kind: inc.kind,
        // (penalized as world.ts does it: a boat already owing turns takes no second penalty for it)
        penalized: inc.exoneratedBy == null && !inc.notRacing && inc.part !== '23.1' && !(f.penalty > 0),
        crowd: w.boats.filter(x => x !== f && !x.isUser && Math.hypot(x.x - f.x, x.y - f.y) < 30).length,
        markM: m ? Math.round(markDist(f, m)) : null, prestart: w.t < 0, legs: `${f.leg}/${o.leg}`
      });
    };
    let touches = 0;
    while (w.t < 5400 && !w.boats.slice(1).every(b => b.finished) && !w.cancelled) {
      w.step(DT);
      for (const e of w.events) if (e.type === 'toast' && /touched/.test(e.msg)) touches++;
      w.events.length = 0;
    }
    races.push({ date, seed, touches, finished: w.boats.slice(1).filter(b => b.finished).length, abandoned: !!w.cancelled });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/census-${date}.json`, JSON.stringify({ incidents, races }, null, 1));
  return { incidents, races };
}
