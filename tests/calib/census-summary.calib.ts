// The foul census's report (tests/calib/census.ts): incidents by rule, by place, and per boat per race, against the
// real fleets' target (docs/SKIPPER-MODEL-PROPOSAL.md, "The foul-rate target": under about 0.1 a boat a race).
import { it } from 'vitest';
import { fs, OUT } from './harness';
import type { CensusIncident, CensusRace } from './census';

it('the foul census report', () => {
  const files = fs.readdirSync(OUT).filter((f: string) => /^census-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  const all = files.map((f: string) => JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8')) as { incidents: CensusIncident[]; races: CensusRace[] });
  const inc = all.flatMap(a => a.incidents), races = all.flatMap(a => a.races), pen = inc;
  const boatRaces = races.length * 5;
  const tally = (key: (i: CensusIncident) => string) => { const m = new Map<string, number>(); for (const i of pen) m.set(key(i), (m.get(key(i)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`); };
  const where = (i: CensusIncident) => i.prestart ? 'before the start' : i.markM != null && i.markM < 40 ? 'within 40 m of her next mark' : 'open water';
  const lines = [
    '# The foul census', '',
    `${races.length} races, ${boatRaces} boat-races. Rule incidents: **${inc.length}** (${(inc.length / boatRaces).toFixed(2)} a boat a race), of them penalties **${inc.filter(i => i.penalized).length}** (${(inc.filter(i => i.penalized).length / boatRaces).toFixed(2)} a boat a race; target under about 0.1: the rest came while the fouler already owed turns). Contacts ${inc.filter(i => i.kind === 'contact').length}. Mark touches ${races.reduce((s, r) => s + r.touches, 0)}. Boats not finishing ${races.reduce((s, r) => s + 5 - r.finished, 0)}.`, '',
    '| Rule | Incidents |', '|---|---|', ...tally(i => i.part ?? i.rule), '',
    '| Where | Incidents |', '|---|---|', ...tally(where), '',
    '| Boats within 30 m | Incidents |', '|---|---|', ...tally(i => String(i.crowd)), ''
  ];
  fs.writeFileSync(`${OUT}/census.md`, lines.join('\n'));
});
