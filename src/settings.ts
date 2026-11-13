import { DEFAULT_BOAT, fixSpec, type BoatSpec } from './boat/spec';
import { isGeneric } from './boat/generic';
import type { Person } from './boat/crewPhys';
export interface Settings {
  mode: 'race' | 'drill' | 'sail' | 'manoeuvres'; // full race, start practice (from one minute to go), just sail (open water, no race), or the tack and gybe drill (open water, alone)
  /** The tack and gybe drill's bests: the fewest metres lost, by manoeuvre and wind band ('tack-medium'), with a good crew's then. */
  drillBest?: Record<string, { lostM: number; goodM: number }>;
  course: string; // course id, or 'rc': the race committee chooses (courses/committee.ts)
  raceLength?: 'short' | 'medium' | 'long'; // with the committee's choice: the target time for the leaders
  windKt: number; // open-water wind, kt; 0 = the afternoon westerly from the NOAA records for the race day and time
  windKind?: 'auto' | 'west' | 'north' | 'south' | 'light'; // the kind of wind: drawn from the records for the race day's month, or chosen
  windDir?: number | null; // (older saves and replays: the wind pinned to one direction; no longer set: windTurn replaced it)
  /** Turn the wind: the kind of day's own direction turned this far (deg, + clockwise), −30 … +30; 0 = as usual. */
  windTurn?: number;
  /** The sail controls band open (1, the default) or put away (0). */
  band?: 0 | 1;
  chop?: number; // conditions adjuster: the wind's chop × this (1 = real, 0 = glassy)
  swellHs?: number | null; // conditions adjuster: the ocean swell outside the Gate, m; null = real
  rain?: 0 | 1 | 2; // none, light, heavy
  fog?: 'real' | 0 | 1 | 2; // the real summer fog bank, or none, patchy, thick
  windDay: 0 | 1 | 2; // with the westerly: a light, typical or windy day (25th, 50th, 75th percentile)
  current: string; // 'real' (NOAA predictions for tideDate/tideTime) or a uniform preset id
  tideDate: string; // race day, YYYY-MM-DD, San Francisco local ('' = the coming Saturday)
  tideTime: string; // time of the start signal, HH:MM, San Francisco local
  bias: number; // deg, only for courses with an adjustable line
  fleet: number; // number of opponents (follows `opponents`)
  /** Who you race against: stock club boats ('stock:1' .. 'stock:5'), generic club Folkboats ('gen:1', 'gen:2'..., boat/generic.ts) and your own saved boats (their ids), all sailed by the AI. */
  opponents: string[];
  seq: number; // start sequence, minutes
  aids: 0 | 1; // line, zones and laylines drawn
  manualTrim: 0 | 1 | 2; // who trims: 0 the crew, 1 you trim the sheets (the crew does the rest), 2 you work every line
  penaltyTurns: 1 | 2;
  sea: 'real' | 'flat'; // waves: real (from the wind, the fetch, the current and the buoy swell) or flat water
  swellDay: 0 | 1 | 2;
  prepFlag: 'P' | 'I' | 'Z' | 'U' | 'black';
  traffic: 0 | 1; // ship traffic through the race area
  windDial: 0 | 1; // the wind-angle dial (a training aid: real boats don't have one)
  /** The wind indicator (render/windLadder.ts) showing: off unless you turn it on, and remembered. */
  windLadder?: boolean;
  camRide?: 0 | 1; // the chase camera rides up and down with her on the swell (smoothed; heave only); off: it holds still and she rises and falls in the frame
  chartPal?: 'day' | 'dusk'; // the map's NOAA chart: the paper chart's colours, or dark (ECDIS dusk)
  mapLayers?: Partial<Record<'wind' | 'current' | 'sea' | 'fog' | 'ships' | 'laylines' | 'shadows', boolean>>; // the map's layers, on or off (ui/layers.ts; unset: the default)
  sailFrom: string; // Just sail: where you start (a place id, sim/places.ts)
  sailTo: string; // Just sail: where you're heading ('' = nowhere in particular)
  realRace?: string; // a real past race being sailed (sim/realRaces.ts): its fleet raced as the real boats, your time set against theirs
  raceFrom?: 'water' | 'slip'; // Race: start on the water by the line, or in her slip in time to sail out to it
  burgee?: string; // (older saves: your burgee, now in boat.flags)
  /** Your boats (boat/spec.ts), and the one you're sailing. `boat` is that one (the same object as its entry in `boats`). */
  boats: BoatSpec[];
  boatId: string;
  boat: BoatSpec;
  /** Who's aboard your boat: you at the helm, and 0–2 crew. Heights in metres, weights in kg, skill 0 novice … 1 expert, and optionally each attribute on its own (boat/crewPhys.ts Person). */
  crew: { n: 0 | 1 | 2; helm: Person; people: Person[] }; // the race committee's preparatory flag (RRS 26, 30) // ocean swell outside the Gate: a small, typical or big day for the month (25th, 50th, 75th percentile) // penalty for a foul: two turns (RRS 44.1) or one turn (if the sailing instructions change it)
}

export const DEFAULT_SETTINGS: Settings = { mode: 'race', course: 'ss2', windKt: 0, windTurn: 0, windDay: 1, current: 'real', tideDate: '', tideTime: '12:00', bias: 0, fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'], seq: 3, aids: 1, manualTrim: 0, penaltyTurns: 2, sea: 'real', swellDay: 1, prepFlag: 'P', traffic: 1, windDial: 0, camRide: 0, sailFrom: 'cityfront', sailTo: '', boats: [DEFAULT_BOAT], boatId: DEFAULT_BOAT.id, boat: DEFAULT_BOAT, crew: { n: 2, helm: { h: 1.78, w: 80 }, people: [{ h: 1.75, w: 78 }, { h: 1.72, w: 72 }] } };

const KEY = 'fbsim-settings-v2';
/** The most boats you can race against. */
export const MAX_OPPONENTS = 7;

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) Object.assign(s, saved); } catch { /* private mode etc. */ }
  s.crew = structuredClone(s.crew ?? DEFAULT_SETTINGS.crew); // a copy: editing your crew mustn't change the defaults
  // your boats: older saves had one boat (and before that, only a burgee)
  let boats = s.boats !== DEFAULT_SETTINGS.boats && s.boats?.length ? s.boats
    : [s.boat === DEFAULT_BOAT ? { ...DEFAULT_BOAT, club: s.burgee ?? DEFAULT_BOAT.club } : s.boat];
  // (older saves had no skipper: the boat you were sailing is yours to skipper, the rest have the AI's)
  boats = structuredClone(boats).map(b => fixSpec({ ...b, skipper: b.skipper ?? (b.id === s.boatId ? 'you' : 'ai') }));
  const seen = new Set<string>(); for (const b of boats) { if (seen.has(b.id)) b.id += '-' + seen.size; seen.add(b.id); }
  s.boats = boats; s.boat = boats.find(b => b.id === s.boatId) ?? boats[0]; s.boatId = s.boat.id; delete s.burgee;
  // your opponents: older saves had only a number of stock boats
  const ids = new Set(boats.map(b => b.id));
  const opp = Array.isArray(s.opponents) && s.opponents !== DEFAULT_SETTINGS.opponents ? s.opponents : Array.from({ length: Math.max(0, Math.min(5, s.fleet ?? 3)) }, (_, i) => `stock:${i + 1}`);
  s.opponents = opp.filter((o, i, a) => a.indexOf(o) === i && (/^stock:[1-5]$/.test(o) || isGeneric(o) || (ids.has(o) && o !== s.boatId))).slice(0, MAX_OPPONENTS);
  s.fleet = s.opponents.length;
  // (a 'Wind from' saved before Turn the wind replaced it would pin the wind with nothing on screen to show it: drop it)
  s.windDir = null;
  return s;
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/**
 * Choosing a kind of wind (the real day, westerly, northerly, …) takes its own direction, unturned (owner, Nov 2026:
 * one clear way to set the wind; Turn the wind then nudges that kind up to 30° either way).
 */
export function chooseWindKind(s: Settings, kind: Settings['windKind']): void { s.windKind = kind; s.windDir = null; s.windTurn = 0; }
