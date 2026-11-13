import type { BoatSpec } from './spec';
import type { Condition } from './condition';
import type { CrewState } from './crewPhys';
import type { SeaHere } from '../environment/sea';
import { HALF, V, type Vec } from '../core/math';
import type { Wind } from '../environment/wind';
import type { SailTrim } from './trim';
import type { Controls, CrewSettings, SailRig, Shape } from './controls';
import type { RigTune } from './rigTune';
import type { SkipperKnobs } from '../ai/skipper';

/** A line you can work: every control, plus the lazy jib car's pins. */
export type LineKey = Exclude<keyof Controls, 'car'> | 'car';

export type Tack = 'S' | 'P';

export interface AiState {
  mode: 'hold' | 'approach' | 'race';
  wp: 0 | 1; // which end of the holding pattern
  f: number; // target fraction along the line (0 pin, 1 committee)
  depth: number; // holding depth below the line, m
  aggr: number; // seconds of extra margin taken on the approach
  width: number; // how far off the rhumb line before tacking back, m
  aware: boolean; // accounts for current on the approach
  /** The numbers her decisions are made by: her skipper's (ai/skipper.ts). */
  kn: SkipperKnobs;
  clearing: boolean; // owes a penalty but is first sailing into clear water
  /** After the gun, not yet started and on the course side of the line (round outside an end): going back below it first. */
  below?: boolean;
  /** Expensive start-timing predictions, refreshed 10 times a second. */
  plan: { leave: number; tReach: number; coast: number; back: boolean };
  /** Direction (+1 right, −1 left) committed to for a big turn, 0 when none. */
  turnCommit: number;
  /** Tacking to answer a hail for room to tack (Rule 20.2(c), or (d) once her own hail is answered): she goes through the
   * wind however slow she is, as the rule asks, rather than gybing round (physics.ts SLOW_TACK). */
  tackNow?: boolean;
  /** About to touch another boat, avoiding her (Rule 14): that comes before finishing a tack (physics.ts midTack). */
  urgent?: boolean;
  /** Racing called off for the day: her way home round the land (ai.ts homeCourse), the leg she's on, her spot off the
   *  harbour, and whether she's lying to there (and on which tack) */
  home?: { route: Vec[]; i: number; at: Vec; lying: boolean; tack?: 'S' | 'P' };
  /** The world's step on which she last thought (world.ts AI_EVERY) */
  thought?: number;
  /** The tack she began to answer a hail (or after hers was answered), kept until she's close-hauled on it: through the
   * wind and slow, a passing change of plan mustn't turn her back. */
  hailTack?: { to: 'S' | 'P'; at: number; with: number } | null;
  /** The turn committed to (turnCommit) is that tack. */
  commitHail?: boolean;
  /** How long she's been in another boat's dirty air on this beat, s. */
  dirtyT?: number;
  /** Land in the way of where she's going: the point she's steering for instead, refreshed 10 times a second. */
  detour?: Vec | null;
  commitFor: number; // the desired heading that commitment was for
  duckUntil: number; // hailed "Starboard!": give that boat extra room until this time
  lastHail: number; // when she last hailed for room to tack
  /** A tack she's decided on and is carrying out: the tack she's going onto, and when she decided (held until she's round). */
  goTack?: { to: 'S' | 'P'; at: number; mode: 'beat' | 'run' | 'reach'; leg: number } | null;
  /** A mark she's keeping clear of, and the side she's passing it on (+1: it to starboard), so she doesn't swap sides each second. */
  passing?: { key: string; side: number } | null;
  /** Running for a mark deeper than her best downwind angle (held with some hysteresis). */
  running?: boolean;
  /** Her aim point (the mark, a detour round the land, or the line) upwind of her: within 44° of the wind, let go past
   *  48° (ai.ts); and the leg it was decided on, as each leg decides afresh */
  upwind?: boolean;
  upwindLeg?: number;
  /** About a minute's running mean of the wind direction where she is (deg): her compass's average, for lifts and headers. */
  avgFrom?: number;
  /** How long she's been headed (s), by her compass. */
  headedT?: number;
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
  /** At anchor or on a mooring (she shows the all-round anchor light after dark; render/navLights.ts). */
  atAnchor?: boolean;
  /** Her navigation lights switched off by her skipper (the owner's switch: the lights key). */
  lightsOff?: boolean;
  /** Sternway, m/s: pushed off astern, she coasts back, slowing, and steers backwards. */
  astern?: number;
  /** her outboard, when she has one on the transom bracket (boat/motor.ts) */
  motor?: import('./motor').MotorState;
  /**
   * Being pushed off: a crew member on the finger walks her back by the shrouds, then jumps aboard as her bow comes
   * level with the end of it. `side` is where the finger is (+1 starboard, −1 port) and `lat` how far out (m);
   * `moved` how far she's gone back, `clear` how far before the finger ends; `jump` the jump's progress (0 not yet … 1 aboard).
   */
  pushing?: { side: number; lat: number; moved: number; clear: number; jump: number };
  /**
   * Being handled out of her berth by the crew (geo/marina.ts pushOffPlan): walked back out of a slip and swung about her
   * bow (`s` m walked, `a` deg swung so far), or pushed off an end tie (`s` 0…1 of the way out), from her berth
   * (`from`, heading `h0`). The crew moves her by hand, so the physics waits until they let her go with a shove.
   */
  handled?: { plan: import('../geo/marina').PushOff; from: { x: number; y: number }; h0: number; s: number; a: number; /** held head to wind on the bow line (true), or told to let go (false) */ held?: boolean; releasing?: number; /** deg she's followed the wind round while held */ follow?: number; /** deg the tiller's yawed her, walked out */ yaw?: number; /** her berth's id */ slip?: string };
  /** Her sails: how far each is hoisted (0 down … 1 up) and whether the crew is hoisting (true) or striking (false) it. Absent: both up. */
  rig?: { main: number; jib: number; mainUp: boolean; jibUp: boolean };
  v: number; // speed through the water, m/s
  vx: number; vy: number; // velocity over the ground, m/s
  tack: Tack;
  tacking: boolean; // past head to wind, not yet close-hauled (Rule 13)
  lastTackT: number;
  /** When she last passed head to wind (a tack; a gybe passes the wind astern): rules 18.2(b), 18.3. */
  headToWindT?: number;
  // helm
  steer: number; // −1..1: turn to port .. starboard (keys, and the AI's helm)
  tiller: number; // −1..1: your tiller handle, port .. starboard (pushing it to starboard turns the boat to port)
  /** Sculling (rule 42.3(d)): the way she's being sculled round (+ to starboard), held until she's close-hauled (SCULL 2). */
  scullDir?: number;
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
  returning?: boolean; // Rule 21.1: after her start signal, not started, sailing back toward the pre-start side to start; kept by the World
  leg: number; // index of the next mark
  finished: boolean;
  /** retired from the race (RRS A5.1 RET): no longer racing, as if finished, but scored RET */
  retired?: boolean;
  finishT: number | null;
  prevD: number | null;
  prevAng: number | null;
  prevPass: number | null;
  nearMin: number;
  forced14: number | null; // id of the boat this right-of-way boat had to swerve for
  markTouch: string | null; // the mark she is touching right now (Rule 31), if any
  headingAgo?: number; // heading RULE16_WINDOW seconds ago (Rule 16.1), kept by the World
  aboveProper?: boolean; // sailing above her proper course (Rule 17), kept by the World
  cleared?: boolean; // finished and cleared the finishing line and marks: no longer racing (Definitions, Racing), kept by the World
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
  manualTrim: boolean; // you trim the sheets (otherwise the crew does): the starting state, until you touch a line (`hand`)
  trimAll: boolean; // you also work every other control (otherwise the crew does): likewise
  /**
   * Who has each line, once you've touched it (true: you; false: back with the crew). Adjusting a line takes only that
   * line off the crew; one tap gives it back. Lines not listed follow `manualTrim` (sheets) and `trimAll` (the rest).
   * The windward jib sheet is only ever yours once you've worked it.
   */
  hand?: Partial<Record<LineKey, boolean>>;
  /** The tiller lashed at this position (−1..1, as `tiller`): it stays there, hands off, until you take it again. */
  lashed?: number | null;
  /** Sideways speed through the water, m/s, + to starboard: slipping to leeward when hove to (physics.ts heaveTo). In the boat's own frame, so it doesn't flip when the wind crosses the bow. */
  sway?: number;
  /** Turn rate, deg/s, + turning to starboard (clockwise): kept every step, so a turn carries on across a change of model. */
  yawRate?: number;
  /** Her turn rate answering the helm, deg/s (yawRate is it with the sea's knocks): it lags the helm (physics.ts yawLag). */
  turnRate?: number;
  /** You've hauled the windward jib sheet in since taking it (easing it right off again then hands it back to the crew). */
  wHauled?: boolean;
  /** Moving by the forces on her (the jib aback) rather than by the polar; it takes a little backing to start and none to end. */
  hove?: boolean;
  /** How far the jib is backed (aback): 0 drawing normally … 1 clew held well to windward. */
  jibBacked?: number;
  /** Every line on the boat (see controls.ts), and what you're doing on each: +1 raises the value (eases a sheet; tightens the vang, outhaul, backstay…), −1 lowers it. */
  ctl: Controls;
  ctlCmd: Partial<Record<Exclude<keyof Controls, 'car'>, number>>;
  /** Where you've dragged a control to: the crew (or you) haul or ease it there at the usual pace. */
  ctlTarget?: Partial<Record<Exclude<keyof Controls, 'car'>, number>>;
  /** The sails' shape and how much drive it gives (1 = the best shape for the conditions). */
  shape: { main: Shape; jib: Shape | null; eff: number };
  /** The crew's current plan for the controls, and seconds until they reconsider it. */
  crewPlan?: CrewSettings | null; crewPlanT?: number;
  /** What moving each line to the plan is worth (share of drive; 1: the depowering steps need it): controls.ts planWorth. */
  crewWorth?: Partial<Record<keyof CrewSettings, number>>;
  /** Which lines you held when the crew last planned (they re-plan at once when it changes). */
  crewFixed?: string;
  /**
   * (Yours, for the sail controls band) where the crew would set every line if they had them all: their plan without your
   * lines fixed (the same as crewPlan when you hold none), and the sheets for the angles they'd trim to. Display only.
   */
  crewIdeal?: CrewSettings & { mainsheet: number; jibsheet: number } | null;
  /** How far the crew has depowered her (0 full power … 1 everything on): they add more while she's heeling too far or carrying heavy weather helm upwind, and ease off as she comes back. */
  depower?: number;
  sheetCmd: { main: number; jib: number }; // while you hold a trim button: −1 trim in, +1 ease
  trim: { main: SailTrim; jib: SailTrim | null };
  awaSlow: number; // apparent wind angle as the crew perceives it (they react with a short lag)
  /** The apparent wind angle as the main's and the jib's trimmers see it, each after their own lag (physics.ts trimmerLag). */
  awaMain?: number; awaJib?: number;
  /** Her steady leeway (deg, a few seconds' mean, at her polar speed here): her course through the water is this much further off the wind than her heading. */
  leeway?: number;
  /** The sails' frame's turn from her heading (deg, + to starboard: physics.ts sailFrame). */
  sailRot?: number;
  /** The true wind's speed (kt) over the last 20 s or so: the breeze the crew set their depowering for. */
  twsSlow?: number;
  // whisker pole (wing-on-wing): the crew sets it on command and gybes it end-for-end
  poleWant: boolean;
  /** Your boat: the pole is yours to call (you've worked it), not the crew's (ai.ts crewPoleCall). */
  poleMine?: boolean;
  pole: PoleState;
  poleT: number; // seconds left in the current crew job
  /** Seconds left of the forward hand's trip to the mast before they start setting the pole (the jib drawing meanwhile). */
  poleWalk?: number;
  /** Until when (the crew's clock, s) the forward hand stays up at the mast, ready to set the pole after the bear-away (ai.ts crewPoleCall renews it). */
  polePrepUntil?: number;
  /** Since when (race clock, s) she's been deep enough for the pole, and since when up past where it pays (ai.ts crewPoleCall). */
  poleDeepT?: number; poleHighT?: number;
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
  /** The crew has set her up (the first time they trim, their lines start where they want them). */
  crewReady?: boolean;
  /** The lazy jib car you've asked the crew to move to (pins), until it's done (crewWork.ts). */
  carCmd?: { fore: number; ins: number } | null;
  /** The lazy jib car the crew's own plan wants, and how long (s) the car has been off it. */
  carPlan?: { fore: number; ins: number } | null; carOff?: number;
  /** Heel rate (deg/s, + rolling to port) and the boat's roll: heel follows its equilibrium as a damped oscillator (balance.ts rollStep). */
  heelRate?: number;
  /** The waves' added resistance as a share of the calm-water resistance (for the trim), and seconds until it's worked out again. */
  seaShare?: number; seaShareT?: number;
  /** Her push against the polar crew's, a share of the drive (physics.ts powerFactor), and seconds until it's worked out again. */
  powerK?: number; powerT?: number;
  /** heelFactor at the polar crew's heel in this wind (physics.ts powerFactor): the polar has it in it. */
  powerRefHeel?: number;
  /** The depowering step (0..1) that's fastest for her crew now (physics.ts powerFactor): what the crew works toward. */
  depowerBest?: number;
  /** The heel the moments balanced at last step (deg), to start the next solve from (balance.ts heelWithCrew). */
  heelEqLast?: number;
  /** The tiller pilot is steering her this step (sim/world.ts). */
  pilotSteers?: boolean;
  /** The drive share from the sheet angles against where they should be (physics.ts trimSails). */
  trimDriveK?: number;
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
  /** The ensign struck: taken down off its staff and the staff unshipped, as a crew does in a blow (it flogs to rags). */
  ensignStruck?: boolean;
  /** Her paint, when it isn't her fleet entry's (your own boat, as you've set her up). */
  paint?: Paint;
  /** How you've set her up (your boat only): looks and condition. */
  spec?: BoatSpec;
  /** Wind shadows on her (environment/shadows.ts): the lee of the land (cached) and everything together (1 = clear air). */
  leeK?: number; shadowK?: number;
  /** About a minute's running mean of the wind she's in (deg): her compass's average, for lifts and headers. */
  avgFrom?: number;
  /** Her condition in physical terms, worked out from `spec` (boat/condition.ts). */
  /** Her rig's tune this outing (rigTune.ts): absent, she's on the guide's tune for whatever wind she meets. */
  tune?: RigTune;
  /** The jumpers' setting you've asked the crew for (turns), while they work toward it, and the time on this half turn (s). */
  jumperTarget?: number; jumperT?: number;
  /** Her main's rig with the tune worked in (condition.ts mainRig): cleared when the tune changes. */
  rigMain?: SailRig;
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
export interface Paint { /** the sail numbers' and the class insignia's colours, when chosen (spec.ts) */ numberColor?: string; insigniaColor?: string; deck: string; boot: string; bottom: string; boatName?: string; /** the cabin top, when not like the deck */ cabinTop?: string; /** where the whisker pole is stowed */ poleSide?: 'port' | 'starboard'; /** her navigation lights under sail */ navLights?: 'deck' | 'tricolour'; /** the forehatch's make */ hatch?: 'teak' | 'acrylic'; /** the companionway open or shut */ companionway?: 'open' | 'closed'; /** the colour her name is lettered in (else one that stands out on the cabin side) */ nameColor?: string }
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
