export interface Settings {
  mode: 'race' | 'drill' | 'sail'; // full race, start practice (from one minute to go), or just sail (open water, no race)
  course: string; // course id
  windKt: number; // open-water wind, kt; 0 = the afternoon westerly from the NOAA records for the race day and time
  windDay: 0 | 1 | 2; // with the westerly: a light, typical or windy day (25th, 50th, 75th percentile)
  current: string; // 'real' (NOAA predictions for tideDate/tideTime) or a uniform preset id
  tideDate: string; // race day, YYYY-MM-DD, San Francisco local ('' = the coming Saturday)
  tideTime: string; // time of the start signal, HH:MM, San Francisco local
  bias: number; // deg, only for courses with an adjustable line
  fleet: number; // number of opponents
  seq: number; // start sequence, minutes
  aids: 0 | 1; // line, zones and laylines drawn
  manualTrim: 0 | 1; // you trim the sheets (otherwise the crew does)
  penaltyTurns: 1 | 2; // penalty for a foul: two turns (RRS 44.1) or one turn (if the sailing instructions change it)
}

export const DEFAULT_SETTINGS: Settings = { mode: 'race', course: 'ss2', windKt: 0, windDay: 1, current: 'real', tideDate: '', tideTime: '12:00', bias: 0, fleet: 3, seq: 3, aids: 1, manualTrim: 0, penaltyTurns: 2 };

const KEY = 'fbsim-settings-v2';

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) Object.assign(s, saved); } catch { /* private mode etc. */ }
  return s;
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
