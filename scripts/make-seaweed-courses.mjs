#!/usr/bin/env node
/**
 * Write a course file for every course on the GGYC Seaweed Soup 2026–27 course sheet (Addendum B: Courses and
 * Marks, Revision 1, 2026-11-05) into src/courses/data. Mark positions are the YRA's (github.com/nkiesel/YRA-Marks,
 * San_Francisco.csv). No network.
 *
 *   node scripts/make-seaweed-courses.mjs
 */
import { writeFile } from 'node:fs/promises';

// B2. Mark descriptions, with the YRA positions. `shape` and `look` are how the mark is drawn (colours top to bottom).
const MARKS = {
  A: { name: 'A', lat: 37.810767, lon: -122.446817, shape: 'sphere', desc: 'Yellow sphere "A", about 300 yd north of St Francis YC' },
  X: { name: 'X', lat: 37.811667, lon: -122.443333, shape: 'cylinder', desc: 'Yellow cylinder "X", about 300 yd north of Golden Gate YC. Not a rounding mark: it keeps boats off the start/finish line' },
  2: { name: '2 · Alcatraz', lat: 37.82623, lon: -122.42214, shape: 'island', desc: 'Alcatraz Island (the position is the light)' },
  4: { name: '4 · Knox', lat: 37.853333, lon: -122.441667, shape: 'lighted', look: 'R', desc: '"Knox": lighted red nun buoy near Pt Knox, Angel Island' },
  6: { name: '6 · Fort Mason', lat: 37.811667, lon: -122.43, shape: 'cylinder', desc: '"Fort Mason": yellow cylinder "M", about 200 yd north of the Fort Mason docks' },
  7: { name: '7 · R "2"', lat: 37.83332, lon: -122.39644, shape: 'lighted', look: 'R', desc: 'R "2" Fl R 6s, North Channel lighted buoy 2, about 1 nm NW of Treasure Island' },
  8: { name: '8 · R "4"', lat: 37.84704, lon: -122.39647, shape: 'lighted', look: 'R', desc: 'R "4" Fl R 2.5s, North Channel lighted buoy 4, about 1.7 nm NE of Alcatraz' },
  15: { name: '15 · Hank Easom', lat: 37.84, lon: -122.468333, shape: 'column', look: 'Y', desc: '"Hank Easom": lighted yellow column about 0.3 nm east of Yellow Bluff' },
  16: { name: '16 · Blackaller', lat: 37.81, lon: -122.465, shape: 'column', look: 'Y', desc: '"Blackaller": yellow column "C", about 0.5 nm east of Fort Point' },
  17: { name: '17 · Harding Rock', lat: 37.83824, lon: -122.44599, shape: 'lighted', look: 'RGR', desc: '"Harding Rock": RG Fl (2+1) R 6s, Harding Rock lighted buoy HR' },
  18: { name: '18 · Blossom Rock', lat: 37.81838, lon: -122.40345, shape: 'lighted', look: 'GRG', desc: '"Blossom Rock": green buoy "BR" Fl (2+1) G 6s, bell' },
  21: { name: '21 · G "1"', lat: 37.83202, lon: -122.40865, shape: 'lighted', look: 'G', desc: 'G "1" Fl G 6s, North Channel lighted buoy 1, about 0.7 nm NE of Alcatraz' }
};

// B1.2 and B1.3: course number, marks in order (suffix s: leave to starboard, p: to port), nominal distance (nm).
const WEST = `
1 As Xs 6s | 1.6
2 As Xs 6s Xp As Xs 6s | 3.2
3 As 2s 6s | 3.7
4 As Xs 18s | 3.9
5 As 17s 6s | 4.5
6 As 17s 2s | 4.7
7 As 17s 18s | 6.1
8 As 17s 6s Xp 15p Xs 6s | 8.9
9 As 17s 18s Xp 15p Xs 6s | 9.5
10 As 4p 15p 21p 4p 6s | 12.3
12 16s Xs 6s | 3.4
13 16s Xs 6s Xp As Xs 6s | 5.0
14 16s Xs 2s 6s | 5.2
15 16s 17s 6s | 5.5
16 16s Xs 18s | 6.1
17 16s Xs 2s 18s | 6.4
18 16s Xs 6s Xp 16s Xs 6s | 6.8
19 16s 17s 18s | 7.4
20 16s 18s Xp As Xs 6s | 7.5
21 16s 4p 15p Xp 6s | 8.2
23 16s 17s As 17s 6s | 8.5
24 16s 17s 6s 17s 6s | 8.7
25 16s 17s 18s Xp 16s Xs 6s | 8.9
26 16s Xs 18s Xp 16s Xs 6s | 9.4
27 16s 4p 15p 18s | 10.5
28 16s 7p 15p 6s | 11.2
29 16s 21p 15p 18s | 12.1
30 16s 17s 21p 15p 18s | 12.9
31 16s 7p 15p 18s | 13.3
32 16s 8p 15p 18s | 13.7
34 16s 17s 21p 15p 7s 6s | 13.7`;
const EAST = `
41 2s | 3.2
42 2s 18s 15p Xs 6s | 9.1
43 21p | 4.3
45 21p 15p 18s | 10.2
46 18s | 4.0
47 18s Xp As Xs 6s | 5.5
48 18s Xp 16s Xs 6s | 7.2
49 6s | 1.3
50 6s Xp As Xs 6s | 2.9
51 6s Xp 16s Xs 6s | 4.6`;

const SOURCE = 'GGYC Manuel Fagundes Seaweed Soup Regatta 2026–27, Addendum B: Courses and Marks, Revision 1 (2026-11-05). Mark positions from the YRA (github.com/nkiesel/YRA-Marks). Main sailing instructions not available.';
const side = s => (s === 's' ? 'starboard' : 'port');
const name = k => MARKS[k].name;

async function write(line, dir) {
  const [lhs, nm] = line.split('|').map(s => s.trim());
  const [num, ...seq] = lhs.split(/\s+/);
  const legs = seq.map(t => { const k = t.slice(0, -1), s = t.slice(-1); if (!MARKS[k]) throw new Error(`course ${num}: mark ${k}?`); return { mark: k, type: k === 'X' ? 'pass' : 'round', side: side(s) }; });
  const used = [...new Set(['X', ...legs.map(l => l.mark)])];
  const marks = Object.fromEntries(used.map(k => { const { desc, ...m } = MARKS[k]; return [k, m]; }));
  const route = legs.map(l => `${l.type === 'pass' ? 'pass ' : ''}${name(l.mark).split(' · ').pop()} to ${l.side}`).join(', ');
  const usesX = legs.some(l => l.mark === 'X');
  const island = legs.some(l => l.mark === '2');
  const notes = [
    `GGYC Seaweed Soup 2026–27, course ${num}. About ${nm} nm. Start heading ${dir}: ${route}, then finish.`,
    'The start line runs from the flagpole on the GGYC deck out to X.',
    usesX ? 'X is not a rounding mark: just pass it on the side shown, which keeps you off the line.' : '',
    island ? 'Alcatraz is a mark: round the island on the side shown (it is land, so give it a good berth).' : '',
    'Crossing the start/finish line in the middle of the race costs a two-turn penalty.'
  ].filter(Boolean).join(' ');
  const file = {
    $schema: '../course.schema.json',
    id: `ss${num}`,
    order: Number(num),
    title: `Seaweed Soup · Course ${num}`,
    area: 'San Francisco Central Bay',
    group: dir === 'west' ? 'Seaweed Soup · starting west' : 'Seaweed Soup · starting east',
    distanceNm: Number(nm),
    source: SOURCE,
    notes,
    windBase: 275,
    marks,
    startLine: {
      committee: { label: 'GGYC flagpole', kind: 'shore', lat: 37.80925, lon: -122.44325, verify: "Flagpole on the GGYC deck to X. The addendum doesn't define the line; X is ~300 yd north of GGYC and exists to keep boats off the line mid-race, so it is the outer end." },
      pin: { label: 'X', mark: 'X' }
    },
    finish: 'startLine',
    legs,
    obstructions: [{ kind: 'startFinishLine', when: 'racing', penalty: 'twoTurns', note: 'Addendum B1.1: the start/finish line is an obstruction for boats not in their starting sequence or on their first or last leg; crossing it is a two-turn penalty (SI 7.x).' }]
  };
  await writeFile(new URL(`../src/courses/data/seaweed-soup-2026-course${num}.json`, import.meta.url), JSON.stringify(file, null, 2) + '\n');
}

let n = 0;
for (const l of WEST.trim().split('\n')) { await write(l, 'west'); n++; }
for (const l of EAST.trim().split('\n')) { await write(l, 'east'); n++; }
console.log(`${n} courses written`);
