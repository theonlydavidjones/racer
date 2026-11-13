/**
 * Each boat's logbook: her races (place, time, the course and conditions) and her cruises, and who sailed her each
 * time. Kept in this browser. Until the Yacht Club has skippers and crews, an AI-sailed boat's crew is "generic AI".
 */

export interface LogEntry {
  boatId: string;
  /** When it was sailed (your clock), ISO. */
  at: string;
  /** The day on the water (the sim's race day), YYYY-MM-DD, and the start time, HH:MM. */
  day: string; time: string;
  kind: 'race' | 'cruise';
  /** The course (races), or where from and to (cruises). */
  title: string;
  /** Races: her place among the boats racing, out of how many; or a scoring code (DSQ, RET, ZFP) or 'unfinished'. */
  place?: number; of?: number; code?: string;
  /** Races: she shared her place with another boat on equal points (RRS 44.3(c), A7). */
  tied?: boolean;
  /** Elapsed time, s (races: from the gun to her finish; cruises: under way). */
  elapsed?: number;
  /** Cruises: how far she sailed, nm, and whether she got where she was going. */
  nm?: number; arrived?: boolean;
  /** Wrecked, and where (the pier she was set in under): the outing ended there. */
  wreck?: string;
  /** Who skippered her, and who crewed. */
  skipper: 'you' | 'ai';
  crew: string;
  /** The day's wind, in words ("W 14 kt"). */
  wind: string;
  /** Races you sailed: what's needed to sail the same race again (Race → Run a past race). Older entries have none. */
  setup?: RaceSetup;
}
/** A race's setup: the seed (the same boats, wind and positions), the course sailed, and the settings it was raced in. */
export interface RaceSetup { seed: number; course: string; s: Record<string, unknown> }

const KEY = 'fbsim-logbook-v1', MAX = 600;

export function loadLog(): LogEntry[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function addLog(entries: LogEntry[]): void {
  if (!entries.length) return;
  const all = [...loadLog(), ...entries].slice(-MAX);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or unavailable */ }
}
/** A boat's entries, newest first. */
export const logFor = (boatId: string, all = loadLog()) => all.filter(e => e.boatId === boatId).sort((a, b) => b.at.localeCompare(a.at));
/** Forget a boat's log (when she's deleted). */
export function dropLog(boatId: string): void {
  try { localStorage.setItem(KEY, JSON.stringify(loadLog().filter(e => e.boatId !== boatId))); } catch { /* ignore */ }
}

/** Her race record in a line: races, wins, podiums, average place. */
export function record(entries: LogEntry[]): { races: number; wins: number; podiums: number; avg: number | null } {
  const r = entries.filter(e => e.kind === 'race' && e.code !== 'CXL'), placed = r.filter(e => e.place != null);
  return {
    races: r.length, wins: placed.filter(e => e.place === 1).length, podiums: placed.filter(e => e.place! <= 3).length,
    avg: placed.length ? placed.reduce((a, e) => a + e.place!, 0) / placed.length : null
  };
}
