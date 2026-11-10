import type { BoatSpec } from './spec';
import type { Condition } from './condition';
import type { CrewState } from './crewPhys';
import type { SeaHere } from '../environment/sea';
import { HALF, V, type Vec } from '../core/math';
import type { Wind } from '../environment/wind';
import type { SailTrim } from './trim';
import type { Controls, CrewSettings, Shape } from './controls';

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
  /** How long she's been in another boat's dirty air on this beat, s. */
  dirtyT?: number;
  /** Land in the way of where she's going: the point she's steering for instead, refreshed 10 times a second. */
  detour?: Vec | null;
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
  /** In her slip, made fast, bow in (sim/world.ts pushOff casts her off). */
  docked?: { slip: string };
  /** Sternway, m/s: pushed off astern, she coasts back, slowing, and steers backwards. */
  astern?: number;
  /** Her sails: how far each is hoisted (0 down … 1 up) and whether the crew is hoisting (true) or striking (false) it. Absent: both up. */
  rig?: { main: number; jib: number; mainUp: boolean; jibUp: boolean };
  v: number; // speed through the water, m/s
  vx: number; vy: number; // velocity over the ground, m/s
  tack: Tack;
  tacking: boolean; // past head to wind, not yet close-hauled (Rule 13)
  lastTackT: number;
  // helm
  steer: number; // −1..1: turn to port .. starboard (keys, and the AI's helm)
  tiller: number; // −1..1: your tiller handle, port .. starboard (pushing it to starboard turns the boat to port)
  turnTarget: number | null;
  turnDir: number;
  luff: boolean;
  desired: number;
  // race state
  penalty: number; // degrees of penalty turn remaining
  penaltyTotal: number; // 360 or 720
  penaltyTurned: number; // signed degrees turned since the penalty started
  penaltyDir: number; // the direction she is turning her penalty (+1 starboard, −1 port, 0 not yet)
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
  markTouch: string | null; // the mark she is touching right now (Rule 31), if any
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
  trimAll: boolean; // you also work every other control (otherwise the crew does)
  /** Every line on the boat (see controls.ts), and what you're doing on each: +1 raises the value (eases a sheet; tightens the vang, outhaul, backstay…), −1 lowers it. */
  ctl: Controls;
  ctlCmd: Partial<Record<Exclude<keyof Controls, 'car'>, number>>;
  /** Where you've dragged a control to: the crew (or you) haul or ease it there at the usual pace. */
  ctlTarget?: Partial<Record<Exclude<keyof Controls, 'car'>, number>>;
  /** The sails' shape and how much drive it gives (1 = the best shape for the conditions). */
  shape: { main: Shape; jib: Shape | null; eff: number };
  /** The crew's current plan for the controls, and seconds until they reconsider it. */
  crewPlan?: CrewSettings | null; crewPlanT?: number;
  /** How far the crew has depowered her (0 full power … 1 everything on): they add more while she's heeling too far or carrying heavy weather helm upwind, and ease off as she comes back. */
  depower?: number;
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
  /** Helm: −1 hard over turning to port .. +1 hard over turning to starboard (the rudder and tiller follow it). */
  helm?: number;
  /** Heel (deg, magnitude), the rudder angle she needs to sail straight (+ weather helm), the weather helm actually held,
   * and the sails' heeling and driving forces (N). See balance.ts. */
  heelMag?: number; helmNeed?: number; weatherHeld?: number; forces?: { heel: number; drive: number };
  /** The people aboard and where their weight is (crewPhys.ts). */
  crew?: CrewState;
  /** Rule 30.1 (I flag): she was over in the last minute and must return around an end of the line. */
  roundEnd?: boolean;
  /** Rule 30.2–30.4: scoring penalty or disqualification for being in the triangle in the last minute. */
  scoring?: 'ZFP' | 'UFD' | 'BFD' | null;
  /** The sea where she is (refreshed twice a second). */
  sea: SeaHere;
  ai: AiState | null;
  /** The club burgee she flies (an id from render/burgees.ts), if any. */
  burgee?: string;
  /** Her ensign and a special flag (officer, owner absent...), if flown (render/flagArt.ts ids). */
  ensign?: string; special?: string;
  /** Her paint, when it isn't her fleet entry's (your own boat, as you've set her up). */
  paint?: Paint;
  /** How you've set her up (your boat only): looks and condition. */
  spec?: BoatSpec;
  /** Wind shadows on her (environment/shadows.ts): the lee of the land (cached) and everything together (1 = clear air). */
  leeK?: number; shadowK?: number;
  /** Her condition in physical terms, worked out from `spec` (boat/condition.ts). */
  cond?: Condition;
}

export type PoleState = 'down' | 'setting' | 'set' | 'stowing';

export const bow = (b: Vec & { h: number }): Vec => { const u = V(b.h); return { x: b.x + u.x * HALF, y: b.y + u.y * HALF }; };
export const stern = (b: Vec & { h: number }): Vec => { const u = V(b.h); return { x: b.x - u.x * HALF, y: b.y - u.y * HALF }; };

/** How a boat is built. Class rules give wooden and fiberglass Nordic Folkboats the same minimum
 * weight and they race on equal terms, so this changes looks, not speed. */
export interface Build { hull: 'fiberglass' | 'wood'; spars: 'aluminium' | 'wood'; boom?: 'aluminium' | 'wood' }
const WOOD: Build = { hull: 'wood', spars: 'wood' };

/** How a boat looks: hull topsides, boot stripe, bottom paint, deck, and the name on her quarters (if shown). */
export interface Paint { deck: string; boot: string; bottom: string; boatName?: string }
export interface FleetEntry { name: string; hull: string; sail: string; tag: string; no: string; build: Build; paint: Paint }
export const FLEET: FleetEntry[] = [
  // the playable boat, Josephine: pearl-white glassfibre hull, pale green non-skid deck, aluminium mast and boom
  { name: 'You', hull: '#f4f1e8', sail: '#fbfaf5', tag: '#ffb627', no: 'US 110', build: { hull: 'fiberglass', spars: 'aluminium' }, paint: { deck: '#8e9f7c', boot: '#24324f', bottom: '#2a2d33', boatName: 'JOSEPHINE' } },
  { name: 'Red', hull: '#b3302a', sail: '#f6f2ea', tag: '#ff6a5c', no: 'US 87', build: WOOD, paint: { deck: '#cdbb94', boot: '#f2eee4', bottom: '#5a1f1a' } },
  { name: 'Blue', hull: '#25579e', sail: '#f6f2ea', tag: '#6fa8ff', no: 'US 104', build: WOOD, paint: { deck: '#cdbb94', boot: '#f2eee4', bottom: '#2a2d33' } },
  { name: 'Green', hull: '#2b7349', sail: '#f6f2ea', tag: '#58d08a', no: 'US 92', build: WOOD, paint: { deck: '#cdbb94', boot: '#f2eee4', bottom: '#5a1f1a' } },
  { name: 'Black', hull: '#26272b', sail: '#efe9dc', tag: '#c9cdd4', no: 'US 120', build: WOOD, paint: { deck: '#cdbb94', boot: '#d4b05a', bottom: '#2a2d33' } },
  { name: 'Varnish', hull: '#9a6a36', sail: '#f3ecdc', tag: '#e2b071', no: 'US 63', build: WOOD, paint: { deck: '#cdbb94', boot: '#f2eee4', bottom: '#5a1f1a' } }
];
