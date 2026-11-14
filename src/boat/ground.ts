import { V, n360, type Vec } from '../core/math';
import type { Emit } from '../sim/events';
import { waterOver } from '../environment/bottom';
import { displacement, newCrew, DEFAULT_CREW } from './crewPhys';
import { KNOCK } from './physics';
import { TRIM } from './hullTrim';
import type { Boat } from './boat';
import orc from './data/nordic-folkboat-orc.json';

/**
 * Running aground on the Bay's mud: her keel on the bottom where the chart's depth and the tide's height leave less
 * water than she draws (environment/bottom.ts: NOAA's chart, the shoal water only).
 *
 * Her draft is her own, the ORC certificate's (1.141 m, measured: the same figure the rest of her physics uses; the
 * class rules' nominal is 1.20 m), less as she heels: a long keel's bottom comes up about as the cosine of the heel.
 *
 * The Bay's shallows are soft: mostly silt and clay (USGS, the bottom sediment in the South Bay and the Bay's shallow
 * water). So no damage (boat/damage.ts grades mud as none): with the keel in it, the bottom carries the weight her lost
 * buoyancy no longer does, ρ·g·A_wp·d for a keel d into it (A_wp her waterplane, about LWL × BWL × 0.7), and the mud
 * holds her by friction on that weight. Driving on, she ploughs in deeper as the bottom shoals and stops; the friction
 * holds her until the tide lifts her, she's heeled to lift the keel, or she's driven or hauled off harder than it holds.
 *
 * ESTIMATES, not measured (no published figure was found for a keel on mud: the researcher, 14 Nov 2026): MU, the
 * friction of a keel's iron on wet silt and clay, and the waterplane's coefficient. The charted rocks, wrecks and
 * obstructions aren't here: on rock it's damage, by damage.ts, once that's merged (WRECK-PROPOSAL §1).
 */
export const GROUND = {
  /** Her draft (m): the ORC certificate's, measured. */
  draft: orc.boat.draft,
  /** Her waterplane area (m²): LWL × BWL (hullTrim.ts) × 0.7, the waterplane coefficient of a long-keeled hull (an estimate). */
  awp: TRIM.lwl * TRIM.bwl * 0.7,
  /** The mud's friction on the keel (an estimate). */
  mu: 0.3,
  /** Sea water's density (kg/m³) and gravity (m/s²). */
  rho: 1025, g: 9.81
};
const STD_MASS = displacement(newCrew(DEFAULT_CREW, 'S').spec);

/** Her keel's depth below the water (m): her draft, less as she heels. */
export const keelDepth = (b: Boat): number => GROUND.draft * Math.cos((b.heel ?? 0) * Math.PI / 180);

/**
 * After she's moved this step (physics.ts travel, her motion over the ground in b.vx, b.vy): if her keel is on the
 * bottom, the mud's friction against that motion, and she's stopped short of where she'd have got to. `ms`: the time
 * (UTC, ms), for the tide.
 */
export function groundStep(b: Boat, ms: number, dt: number, emit: Emit, toast: { t: number }, t: number, h0 = b.h): void {
  const p: Vec = { x: b.x, y: b.y }, w = waterOver(p, ms);
  const into = w === null ? 0 : keelDepth(b) - w; // (how far the keel would be below the bottom, afloat)
  if (into <= 0) { b.aground = undefined; return; }
  const mass = b.crew ? displacement(b.crew.spec) : STD_MASS;
  // (the weight the bottom carries: her buoyancy lost to the keel's depth in it, no more than all of her)
  const load = Math.min(mass * GROUND.g, GROUND.rho * GROUND.g * GROUND.awp * into);
  const dv = GROUND.mu * load / mass * dt; // (how much of her speed over the ground the friction takes this step)
  // (her motion over the ground as travel left her: rebuilt from her speed through the water and the stream, as travel
  // works it out, since a knock against the shore there stops her speed through the water but not b.vx, b.vy)
  const u0 = V(b.h), s0 = V(b.h + 90), ahead0 = b.v - (b.astern ?? 0), side0 = b.sway ?? 0;
  const vx = u0.x * ahead0 + s0.x * side0 + b.cur.x, vy = u0.y * ahead0 + s0.y * side0 + b.cur.y, g = Math.hypot(vx, vy);
  const mx = b.vx, my = b.vy; // (what travel moved her by this step)
  const was = b.aground;
  b.aground = into;
  // (her keel in the mud holds her heading too: the turn she made this step, and her rate of turn, kept only by the
  // share of her weight the water still carries; with all of it on the bottom she pivots no more than she slides. An
  // estimate, as the friction is: the mud's moment on a keel of her length against the helm's and the sails')
  const free = 1 - load / (mass * GROUND.g);
  if (free < 1) {
    let dh = b.h - h0; dh -= 360 * Math.round(dh / 360);
    b.h = n360(h0 + dh * free);
    if (b.yawRate != null) b.yawRate *= free;
    if (b.turnRate != null) b.turnRate *= free;
  }
  // her motion over the ground, slowed (stopped, if the friction takes all of it), and where that leaves her this step
  const k = g > dv ? (g - dv) / g : 0, nx = vx * k, ny = vy * k;
  // (knocked against the shore this step, travel has already put her where she ends it: only her motion is the mud's)
  const knocked = KNOCK.on; // (travel says so: inferring it from her speeds read every step astern as a knock)
  if (!knocked) { b.x += (nx - mx) * dt; b.y += (ny - my) * dt; }
  b.vx = nx; b.vy = ny;
  // through the water: her motion over the ground less the stream's (held fast, the water runs past her)
  const u = u0, s = s0, rx = nx - b.cur.x, ry = ny - b.cur.y, ahead = rx * u.x + ry * u.y;
  b.v = Math.max(0, ahead); b.astern = Math.max(0, -ahead); b.sway = rx * s.x + ry * s.y;
  if (b.isUser && was === undefined && t - toast.t > 4) { toast.t = t; emit({ type: 'toast', msg: `Aground on the mud: ${w!.toFixed(1)} m of water, and she draws ${keelDepth(b).toFixed(2)} m.` }); }
}
