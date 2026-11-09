export interface Settings {
  mode: 'race' | 'drill'; // full race, or start practice (from one minute to go)
  course: string; // course id
  windKt: number;
  current: string; // current preset id
  bias: number; // deg, only for courses with an adjustable line
  fleet: number; // number of opponents
  seq: number; // start sequence, minutes
  aids: 0 | 1; // line, zones and laylines drawn
}

export const DEFAULT_SETTINGS: Settings = { mode: 'race', course: 'ss2', windKt: 12, current: 'ebb', bias: 0, fleet: 3, seq: 3, aids: 1 };

const KEY = 'fbsim-settings-v2';

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) Object.assign(s, saved); } catch { /* private mode etc. */ }
  return s;
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
