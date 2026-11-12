// The calibration's summary: the sim's races (calib-out/, from the day-*.calib.ts runs) beside the real fleet's, in
// the same measures (src/ai/fleetStats.ts). Report only for now: the bands come with the skipper model's calibration
// (docs/SKIPPER-MODEL-PROPOSAL.md, phase 5).
import { it } from 'vitest';
import results from '../../src/boat/data/sf-folkboat-results.json';
import { summarise, type FleetSummary, type RaceResult } from '../../src/ai/fleetStats';
import { OUT, fs } from './harness';

interface RealBoat { key: string; place: number | null; elapsedS: number | null }
interface RealRace { date: string; boats: RealBoat[]; realDay?: { fortPoint?: { meanKt: number } } }
const data = results as unknown as { events: { source: string; races: RealRace[] }[]; calibration: { consistency: { tau: { otherEvents: { meanTau: number } } } } };

it('the sim fleet beside the real one', () => {
  const real: RaceResult[] = data.events.filter(e => e.source === 'jibeset').flatMap(e => e.races).map(r => ({
    finishers: r.boats.filter(b => b.place && b.elapsedS != null).map(b => ({ key: b.key, elapsedS: b.elapsedS! })), windKt: r.realDay?.fortPoint?.meanKt, label: r.date
  })).filter(r => r.finishers.length >= 2);
  type SimRace = RaceResult & { course: number; dnf: number; meanKt: number; abandoned?: boolean };
  const sim: SimRace[] = fs.readdirSync(OUT).filter((f: string) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().flatMap((f: string) => JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8')) as SimRace[]);
  const R = summarise(real), S = summarise(sim.filter(r => !r.abandoned));
  const row = (name: string, f: (s: FleetSummary) => string) => `| ${name} | ${f(R)} | ${f(S)} |`;
  const lines = [
    `# Skipper model calibration: the sim's AI fleet against the real SF Folkboat fleet`, '',
    `Real: GGYC Seaweed Soup, ${R.races} timed races (sf-folkboat-results.json). Sim: ${S.races} races on the same days, real wind and tide, the committee's course.`, '',
    `| Measure | Real | Sim |`, `|---|---|---|`,
    row('Last finisher, % behind (median, IQR)', s => `${s.lastPct.median} (${s.lastPct.p25}–${s.lastPct.p75})`),
    row('Median boat, % behind', s => `${s.medianBoatPct}`),
    row('By quarter after the winner, %', s => s.quarters.join(' / ')),
    row("Race-to-race Kendall's tau", s => `${s.tau ?? '—'}`),
    row('Last % against wind (slope %/kt, r)', s => s.windSlope ? `${s.windSlope.slope.toFixed(1)}, r ${s.windSlope.r.toFixed(2)}` : '—'),
    '', `(Real tau over all 55 races, places included, other events: ${data.calibration.consistency.tau.otherEvents.meanTau}.)`, '',
    `| Sim race | Course | Wind (sim mean) | Gaps % | DNF |`, `|---|---|---|---|---|`,
    ...sim.map(r => { const t = r.finishers.map(f => f.elapsedS).sort((a, b) => a - b); return `| ${r.label} | ${r.course} | ${r.meanKt} kt | ${t.map(x => ((x / t[0] - 1) * 100).toFixed(1)).join(', ')} | ${r.abandoned ? 'abandoned' : r.dnf} |`; })
  ];
  fs.writeFileSync(`${OUT}/report.md`, lines.join('\n') + '\n');
});
