import { HULL_COLORS, BRIGHT_FINISH, fixSpec, type BoatSpec, type SailAge } from './spec';
import { makeRng } from '../core/rng';

/**
 * Generic club Folkboats: stock boats sailed by the AI, to fill out a race's fleet beside the five club boats and
 * your own. Each is the same boat every time (her name, number, colours and condition come from her number in the
 * list), so a fleet you set up races the same rivals each time. They are standard Nordic Folkboats; only their
 * upkeep differs a little, the way a club fleet's does (a bottom a few weeks from its last scrub, sails a season or
 * two old), which boat/condition.ts turns into speed.
 */

/** Opponent ids for generic boats: `gen:1`, `gen:2`, ... */
export const GENERIC_PREFIX = 'gen:';
export const isGeneric = (id: string): boolean => /^gen:[1-9]\d?$/.test(id);

/** Names in the Folkboat tradition: Scandinavian names, seabirds, weather and the sea. */
const NAMES = ['Freya', 'Kittiwake', 'Solveig', 'Tern', 'Saga', 'Skua', 'Ingrid', 'Vega', 'Fulmar', 'Marit', 'Havørn', 'Sea Smoke',
  'Linnea', 'Petrel', 'Aurora', 'Sjøblomst', 'Gannet', 'Astrid', 'Nordlys', 'Wren'];
/** Hull colours a club fleet shows: mostly white and cream glassfibre, some dark or bright, a few varnished wooden boats. */
const HULLS = ['Snow white', 'Pearl', 'Cream', 'Navy', 'Flag blue', 'Hunter green', 'Burgundy', 'Light grey', 'Signal red', 'Black', 'Sky blue', 'Buff'];
const BOTTOMS = ['#2a2d33', '#1f2a44', '#7a2420', '#2b4f8f', '#9a5a2e'];
const DECKS = ['#cdbb94', '#e8e3d6', '#c9ccd0', 'teak-silver', '#8e9f7c'];
/** Bay clubs with Folkboat sailors (render/burgees.ts ids). */
const CLUBS = ['stfyc', 'sfyc', 'ggyc', 'cyc', 'sbyc', 'tyc', 'ssyc'];
/** Sail numbers the five stock club boats carry (boat/boat.ts FLEET), so a generic boat never shares one. */
const STOCK_NUMBERS = new Set(['87', '104', '92', '120', '63', '110']);

/**
 * Generic boat number k (1, 2, ...). `taken`: sail numbers already in the fleet (your boats), which she avoids.
 */
export function genericBoat(k: number, taken: Iterable<string> = []): BoatSpec {
  // her number: clear of the club boats', of the generic boats before her and of yours
  const used = new Set([...STOCK_NUMBERS, ...taken]);
  for (let j = 1; j < k; j++) used.add(baseNumber(j, used));
  return makeGeneric(k, baseNumber(k, used));
}
/** Generic boat k's sail number: her own, or the next free one after it. */
function baseNumber(k: number, used: Set<string>): string {
  let no = 30 + Math.floor(makeRng((0x85ebca6b * (k + 3)) >>> 0)() * 120); while (used.has(String(no))) no++;
  return String(no);
}
function makeGeneric(k: number, no: string): BoatSpec {
  const r = makeRng((0x9e3779b1 * (k + 7)) >>> 0), pick = <T>(a: T[]) => a[Math.floor(r() * a.length) % a.length];
  const name = NAMES[(k - 1) % NAMES.length] + (k > NAMES.length ? ` ${Math.ceil(k / NAMES.length)}` : '');
  const wood = r() < 0.3; // the Bay fleet is mostly glassfibre, with some wooden boats still racing
  const hullName = pick(HULLS), upper = wood && r() < 0.5 ? BRIGHT_FINISH[1] : HULL_COLORS.find(c => c[0] === hullName)![1];
  // upkeep: a bottom scrubbed within the last month or two, sails new to a few seasons old
  const age = (): SailAge => { const x = r(); return x < 0.35 ? 'new' : x < 0.8 ? 'mid' : 'old'; };
  const mainAge = age();
  return fixSpec({
    id: GENERIC_PREFIX + k, name: name.toUpperCase(), skipper: 'ai', club: pick(CLUBS),
    hull: { material: wood ? 'wood' : 'fiberglass', upper, lower: pick(BOTTOMS), stripe: r() < 0.6 ? '#f2eee4' : '' },
    deck: wood ? pick(['#cdbb94', 'teak-silver', 'teak-polished']) : pick(DECKS),
    sails: { country: 'USA', number: no, color: 'white' },
    perf: {
      cleanedWeeks: Math.floor(r() * r() * 9), finish: r() < 0.4 ? 'race' : 'antifouling',
      mainAge, jibAge: mainAge === 'old' || r() < 0.3 ? mainAge : age(),
      mast: wood && r() < 0.7 ? 'wood' : 'aluminium', boom: wood && r() < 0.7 ? 'wood' : 'aluminium', mastStiffness: 'average',
      outboard: r() < 0.7 ? 'none' : 'stowed', gearKg: Math.round(r() * r() * 40)
    }
  });
}

/** The spec for a generic opponent id (`gen:k`), or undefined. */
export function genericSpec(id: string, taken: Iterable<string> = []): BoatSpec | undefined {
  return isGeneric(id) ? genericBoat(+id.slice(GENERIC_PREFIX.length), taken) : undefined;
}

/**
 * Fill a fleet to `n` opponents (at most `max`): keep the boats already chosen (club boats, your own boats, generic
 * boats), add generic boats until there are n, or drop generic boats (the last added first) if there are more.
 * For the setup screens: `opponents = fillFleet(opponents, n)`.
 */
export function fillFleet(opponents: string[], n: number, max: number): string[] {
  const want = Math.max(0, Math.min(max, Math.round(n)));
  const out = [...opponents];
  for (let i = out.length - 1; out.length > want && i >= 0; i--) if (isGeneric(out[i])) out.splice(i, 1);
  for (let k = 1; out.length < want; k++) if (!out.includes(GENERIC_PREFIX + k)) out.push(GENERIC_PREFIX + k);
  return out;
}
