import { V, brg, dist, dot, sub, unit, wrap, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import { onLand } from '../geo/shore';
import type { RulesMark } from '../rules/types';

/* ---------- file format (see course.schema.json) ---------- */
export interface MarkDef {
  name: string;
  lat?: number; lon?: number;
  from?: 'lineCenter'; bearing?: number; distance?: number;
  /** How it's drawn: a racing inflatable (sphere, cylinder), a yellow column, a lighted navigation buoy, or an island. */
  shape?: MarkShape;
  /** Colours of a column or lighted buoy, top to bottom: R, G, Y (e.g. "RGR": red with a green band). */
  look?: string;
}
export type MarkShape = 'cylinder' | 'sphere' | 'column' | 'lighted' | 'island' | 'beacon';
export interface LineEndDef { label: string; kind?: 'shore' | 'boat' | 'buoy'; lat?: number; lon?: number; mark?: string; verify?: string }
export interface StartLineDef {
  committee: LineEndDef;
  pin: LineEndDef;
  center?: { lat: number; lon: number };
  bearing?: number;
  length?: number | { base: number; perBoat: number };
  biasAdjustable?: boolean;
}
export interface LegDef { mark: string; type: 'round' | 'pass'; side: 'starboard' | 'port' }
export interface ObstructionDef { kind: 'startFinishLine'; when?: 'racing'; penalty?: 'twoTurns'; note?: string }
export interface CourseFile {
  id: string; order?: number; title: string; area?: string; source?: string; notes?: string;
  /** Heading in the course picker. */
  group?: string;
  distanceNm?: number;
  windBase: number;
  marks: Record<string, MarkDef>;
  startLine: StartLineDef;
  finish?: 'startLine';
  legs: LegDef[];
  obstructions?: ObstructionDef[];
}

/* ---------- runtime course ---------- */
export type Side = 's' | 'p';
export interface CourseMark extends RulesMark {
  key: string; // mark id in the file, e.g. "X"
  side: Side;
  shape: MarkShape;
  look: string;
  leg: 'beat' | 'reach' | 'run'; // point of sail on the leg to this mark, for the course's typical wind
  prev: Vec; next: Vec; // where boats come from / go to
  dir: Vec; // pass marks: direction of travel
  sv: Vec; // pass marks: unit vector from the mark toward the side boats pass on
  r: Vec; // rounding marks: unit vector pointing to the outside of the rounding
}

export interface Course {
  id: string; title: string; notes: string;
  base: number; // typical wind direction
  obstruction: boolean; // start/finish line is an obstruction once racing
  committee: Vec; pin: Vec;
  committeeLabel: string; pinLabel: string;
  committeeKind: 'shore' | 'boat' | 'buoy';
  pinKind: 'shore' | 'boat' | 'buoy' | 'mark';
  biasAdjustable: boolean;
  marks: CourseMark[];
  center: Vec;
  L: Vec; // unit vector along the line, pin → committee
  N: Vec; // unit normal pointing to the course side
  lineLen: number;
  finishSign: 1 | -1; // +1: finish by crossing toward the course side
}

/** `windFrom`: the day's wind (a course laid from the line is set to it; otherwise it only decides which legs are beats). */
export interface CourseOptions { bias: number; fleet: number; windFrom?: number }

const markPos = (m: MarkDef, center: Vec | null, turn = 0): Vec => {
  if (m.from === 'lineCenter') {
    if (!center) throw new Error(`Mark ${m.name}: lineCenter offsets need a centred start line`);
    const u = V((m.bearing ?? 0) + turn);
    return { x: center.x + u.x * (m.distance ?? 0), y: center.y + u.y * (m.distance ?? 0) };
  }
  if (m.lat == null || m.lon == null) throw new Error(`Mark ${m.name} needs lat/lon`);
  return LL(m.lat, m.lon);
};

/** How far an island's shore runs out from a point on it, in 36 ten-degree sectors (the widest of three rays each). */
function islandReach(p: Vec): number[] {
  const out: number[] = [];
  for (let i = 0; i < 36; i++) {
    let r = 0;
    for (const db of [-5, 0, 5]) {
      const u = V(i * 10 + db);
      for (let d = 0; d < 1500; d += 10) if (onLand({ x: p.x + u.x * d, y: p.y + u.y * d })) r = Math.max(r, d + 10);
    }
    out.push(r);
  }
  return out;
}

/** Turn a course file into the runtime course. `fleet` is the number of opponents; `bias` rotates an adjustable line. */
export function buildCourse(f: CourseFile, opt: CourseOptions): Course {
  const sl = f.startLine;
  let committee: Vec, pin: Vec, lineCenter: Vec | null = null;
  // a course laid from its line (the committee sets the line and the marks): turned to the day's wind
  const turn = sl.center && opt.windFrom != null ? wrap(opt.windFrom - f.windBase) : 0;
  if (sl.center) {
    lineCenter = LL(sl.center.lat, sl.center.lon);
    const Lv = V((sl.bearing ?? 0) + turn + (sl.biasAdjustable ? opt.bias : 0));
    const len = typeof sl.length === 'number' ? sl.length : (sl.length?.base ?? 100) + (sl.length?.perBoat ?? 0) * (opt.fleet + 1);
    committee = { x: lineCenter.x + Lv.x * len / 2, y: lineCenter.y + Lv.y * len / 2 };
    pin = { x: lineCenter.x - Lv.x * len / 2, y: lineCenter.y - Lv.y * len / 2 };
  } else {
    const end = (e: LineEndDef): Vec => {
      if (e.mark) { const m = f.marks[e.mark]; if (!m) throw new Error(`Unknown mark ${e.mark}`); return markPos(m, null); }
      if (e.lat == null || e.lon == null) throw new Error(`Line end ${e.label} needs lat/lon or a mark`);
      return LL(e.lat, e.lon);
    };
    committee = end(sl.committee); pin = end(sl.pin);
  }
  const posCache: Record<string, Vec> = {};
  const marks = f.legs.map((leg): CourseMark => {
    const def = f.marks[leg.mark];
    if (!def) throw new Error(`Leg refers to unknown mark ${leg.mark}`);
    const p = posCache[leg.mark] ??= markPos(def, lineCenter, turn);
    return {
      key: leg.mark, name: def.name, p, type: leg.type, side: leg.side === 'starboard' ? 's' : 'p',
      shape: def.shape ?? 'cylinder', look: def.look ?? 'Y', beat: false, leg: 'reach',
      ...(def.shape === 'island' ? { reach: islandReach(p) } : {}),
      prev: p, next: p, dir: { x: 0, y: 1 }, sv: { x: 0, y: 0 }, r: { x: 0, y: 0 }
    };
  });
  const C: Course = {
    id: f.id, title: f.title, notes: f.notes ?? '', base: opt.windFrom ?? f.windBase,
    obstruction: (f.obstructions ?? []).some(o => o.kind === 'startFinishLine'),
    committee, pin, committeeLabel: sl.committee.label, pinLabel: sl.pin.label,
    committeeKind: sl.committee.kind ?? 'boat', pinKind: sl.pin.mark ? 'mark' : (sl.pin.kind ?? 'buoy'),
    biasAdjustable: !!sl.biasAdjustable,
    marks, center: { x: 0, y: 0 }, L: { x: 1, y: 0 }, N: { x: 0, y: 1 }, lineLen: 0, finishSign: 1
  };
  return prepCourse(C);
}

/**
 * Which legs are beats, reaches and runs, in the wind from `from` (the course's own at the gun; mid-race, after a change of
 * conditions, the new wind's: whether two boats are on a beat to windward, for rule 18.1(a), is a matter of the wind they're
 * in, not the wind the course was laid for).
 */
export function classifyLegs(C: Course, from: number): void {
  C.marks.forEach(m => {
    const off = Math.abs(wrap(from - brg(m.p.x - m.prev.x, m.p.y - m.prev.y)));
    m.beat = off < 55;
    m.leg = off < 55 ? 'beat' : off > 125 ? 'run' : 'reach';
  });
}

/** Derived geometry: line frame, which legs are beats, pass-side and rounding vectors. */
function prepCourse(C: Course): Course {
  const center = { x: (C.committee.x + C.pin.x) / 2, y: (C.committee.y + C.pin.y) / 2 };
  const L = unit(sub(C.committee, C.pin));
  let N = { x: -L.y, y: L.x };
  if (dot(N, sub(C.marks[0].p, center)) < 0) N = { x: L.y, y: -L.x };
  C.center = center; C.L = L; C.N = N; C.lineLen = dist(C.committee, C.pin);
  const n = C.marks.length;
  C.marks.forEach((m, i) => {
    const prev = i === 0 ? center : C.marks[i - 1].p, next = i === n - 1 ? center : C.marks[i + 1].p;
    m.prev = prev; m.next = next;
    if (m.type === 'pass') {
      const d = unit(sub(next, prev)); m.dir = d;
      m.sv = m.side === 's' ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
    } else {
      const ui = unit(sub(prev, m.p)), uo = unit(sub(next, m.p)), s = { x: ui.x + uo.x, y: ui.y + uo.y };
      if (Math.hypot(s.x, s.y) < 0.2) { const t = { x: -ui.x, y: -ui.y }; m.r = m.side === 's' ? { x: -t.y, y: t.x } : { x: t.y, y: -t.x }; }
      else m.r = unit({ x: -s.x, y: -s.y });
    }
  });
  classifyLegs(C, C.base);
  const last = C.marks[n - 1].p;
  C.finishSign = dot(sub(last, center), N) < 0 ? 1 : -1;
  return C;
}
