import { HALF, V, type Vec } from '../core/math';
import type { Wind } from '../environment/wind';
import type { SailTrim } from './trim';

export type Tack = 'S' | 'P';

export interface AiState {
  mode: 'hold' | 'approach' | 'race';
  wp: 0 | 1; // which end of the holding pattern
  f: number; // target fraction along the line (0 pin, 1 committee)
  depth: number; // holding depth below the line, m
  aggr: number; // seconds of extra margin taken on the approach
  width: number; // how far off the rhumb line before tacking back, m
  aware: boolean; // accounts for current on the approach
  clearing: boolean; // owes a penalty but is first sailing into clear water
  /** Expensive start-timing predictions, refreshed 10 times a second. */
  plan: { leave: number; tReach: number; coast: number; back: boolean };
  /** Direction (+1 right, −1 left) committed to for a big turn, 0 when none. */
  turnCommit: number;
  commitFor: number; // the desired heading that commitment was for
  duckUntil: number; // hailed "Starboard!": give that boat extra room until this time
  lastHail: number; // when she last hailed for room to tack
}

export interface Boat {
  id: number;
  isUser: boolean;
  name: string;
  no: string;
  color: string;
  hullColor: string;
  sailColor: string;
  build: Build;
  // kinematics
  x: number; y: number; h: number; // position (m) and heading (deg)
  v: number; // speed through the water, m/s
  vx: number; vy: number; // velocity over the ground, m/s
  tack: Tack;
  tacking: boolean; // past head to wind, not yet close-hauled (Rule 13)
  lastTackT: number;
  // helm
  steer: -1 | 0 | 1;
  turnTarget: number | null;
  turnDir: number;
  luff: boolean;
  desired: number;
  // race state
  penalty: number; // degrees of penalty turn remaining
  started: boolean;
  ocs: boolean;
  leg: number; // index of the next mark
  finished: boolean;
  finishT: number | null;
  prevD: number | null;
  prevAng: number | null;
  prevPass: number | null;
  nearMin: number;
  forced14: number | null; // id of the boat this right-of-way boat had to swerve for
  headingAgo?: number; // heading RULE16_WINDOW seconds ago (Rule 16.1), kept by the World
  aboveProper?: boolean; // sailing above her proper course (Rule 17), kept by the World
  // environment at the boat
  cur: Vec;
  ww: Wind;
  rel: number; // signed true wind angle (+ = wind from starboard)
  twa: number;
  awa: number;
  arel: number; // signed apparent wind angle (+ = from starboard), for the shroud ribbons
  aws: number; // apparent wind speed, m/s
  // sail trim: sheet angles (deg from centreline), who trims, and how each sail is drawing
  sheets: { main: number; jib: number };
  manualTrim: boolean; // you trim the sheets (otherwise the crew does)
  sheetCmd: { main: number; jib: number }; // while you hold a trim button: −1 trim in, +1 ease
  trim: { main: SailTrim; jib: SailTrim | null };
  awaSlow: number; // apparent wind angle as the crew perceives it (they react with a short lag)
  // whisker pole (wing-on-wing): the crew sets it on command and gybes it end-for-end
  poleWant: boolean;
  pole: PoleState;
  poleT: number; // seconds left in the current crew job
  poleTack: Tack; // tack the pole was set on (it goes on the windward side)
  // trim / visuals
  heel: number; boom: number; jib: number;
  ai: AiState | null;
}

export type PoleState = 'down' | 'setting' | 'set' | 'stowing';

export const bow = (b: Vec & { h: number }): Vec => { const u = V(b.h); return { x: b.x + u.x * HALF, y: b.y + u.y * HALF }; };
export const stern = (b: Vec & { h: number }): Vec => { const u = V(b.h); return { x: b.x - u.x * HALF, y: b.y - u.y * HALF }; };

/** How a boat is built. Class rules give wooden and fiberglass Nordic Folkboats the same minimum
 * weight and they race on equal terms, so this changes looks, not speed. */
export interface Build { hull: 'fiberglass' | 'wood'; spars: 'aluminium' | 'wood' }
const WOOD: Build = { hull: 'wood', spars: 'wood' };

export interface FleetEntry { name: string; hull: string; sail: string; tag: string; no: string; build: Build }
export const FLEET: FleetEntry[] = [
  // the playable boat: fiberglass hull, aluminium mast and boom
  { name: 'You', hull: '#f2eee4', sail: '#fbfaf5', tag: '#ffb627', no: 'US 110', build: { hull: 'fiberglass', spars: 'aluminium' } },
  { name: 'Red', hull: '#b3302a', sail: '#f6f2ea', tag: '#ff6a5c', no: 'US 87', build: WOOD },
  { name: 'Blue', hull: '#25579e', sail: '#f6f2ea', tag: '#6fa8ff', no: 'US 104', build: WOOD },
  { name: 'Green', hull: '#2b7349', sail: '#f6f2ea', tag: '#58d08a', no: 'US 92', build: WOOD },
  { name: 'Black', hull: '#26272b', sail: '#efe9dc', tag: '#c9cdd4', no: 'US 120', build: WOOD },
  { name: 'Varnish', hull: '#9a6a36', sail: '#f3ecdc', tag: '#e2b071', no: 'US 63', build: WOOD }
];
