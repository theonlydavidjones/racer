import { HALF, V, type Vec } from '../core/math';
import type { Wind } from '../environment/wind';

export type Tack = 'S' | 'P';

export interface AiState {
  mode: 'hold' | 'approach' | 'race';
  wp: 0 | 1; // which end of the holding pattern
  f: number; // target fraction along the line (0 pin, 1 committee)
  depth: number; // holding depth below the line, m
  aggr: number; // seconds of extra margin taken on the approach
  width: number; // how far off the rhumb line before tacking back, m
  aware: boolean; // accounts for current on the approach
}

export interface Boat {
  id: number;
  isUser: boolean;
  name: string;
  no: string;
  color: string;
  hullColor: string;
  sailColor: string;
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
  // environment at the boat
  cur: Vec;
  ww: Wind;
  rel: number; // signed true wind angle (+ = wind from starboard)
  twa: number;
  awa: number;
  // trim / visuals
  heel: number; boom: number; jib: number;
  ai: AiState | null;
}

export const bow = (b: Vec & { h: number }): Vec => { const u = V(b.h); return { x: b.x + u.x * HALF, y: b.y + u.y * HALF }; };
export const stern = (b: Vec & { h: number }): Vec => { const u = V(b.h); return { x: b.x - u.x * HALF, y: b.y - u.y * HALF }; };

export interface FleetEntry { name: string; hull: string; sail: string; tag: string; no: string }
export const FLEET: FleetEntry[] = [
  { name: 'You', hull: '#f2eee4', sail: '#fbfaf5', tag: '#ffb627', no: 'US 110' },
  { name: 'Red', hull: '#b3302a', sail: '#f6f2ea', tag: '#ff6a5c', no: 'US 87' },
  { name: 'Blue', hull: '#25579e', sail: '#f6f2ea', tag: '#6fa8ff', no: 'US 104' },
  { name: 'Green', hull: '#2b7349', sail: '#f6f2ea', tag: '#58d08a', no: 'US 92' },
  { name: 'Black', hull: '#26272b', sail: '#efe9dc', tag: '#c9cdd4', no: 'US 120' },
  { name: 'Varnish', hull: '#9a6a36', sail: '#f3ecdc', tag: '#e2b071', no: 'US 63' }
];
