import { byHand } from '../boat/physics';
import { poleMustCome } from '../ai/ai';
import { D2R, V, clamp, cross, dist, dot, sub, unit, wrap } from '../core/math';
import type { Boat } from '../boat/boat';
import { beatAngle, polar, runAngle } from '../boat/polar';
import { heelFactor } from '../boat/balance';
import { trimDrive } from '../boat/trim';
import { driveSpeed, tuneLoss } from '../boat/coach';
import { presetFor, tuneName, tuneWords, TUNE_PRESETS } from '../boat/rigTune';
import type { World } from './world';
import type { SimView } from './host';

/**
 * The tactics debrief: a log of your race as you sail it, and afterwards what cost you time, ranked, with what to do.
 *
 * Each item is an estimate of seconds lost, from the sim's own physics and the standard racing arithmetic:
 * - **Shifts:** sailing on a header of θ° when the other tack is lifted by θ°, your speed toward the windward mark is
 *   cos(β+θ)/cos(β−θ) of what it would be on the other tack (β the close-hauled angle): about 15% less at 5°. A tack
 *   costs a few seconds, so only headers held for more than ~15 s count.
 * - **Laylines:** past the layline by D metres, you sail roughly 0.6·D/v seconds extra (you reach back down to the mark).
 * - **Tacks and gybes:** the speed you lose against your target speed through each one, for 20 s.
 * - **Dirty air and the lee of the land:** boat speed goes roughly as the wind^0.7 in the Folkboat's range.
 * - **Downwind angles and the pole:** your speed made good downwind against the best angle; wing-on-wing against jib alone.
 * - **Heel, trim, penalties, wide roundings, the start.**
 */

export interface Finding { key: string; title: string; lost: number; detail: string; tip: string }
/**
 * One moment of your race the debrief points at, for the race replay: when it began and ended (race time, s), where
 * you were (when it began; for the start, a rounding or an incident, at its end), about how many seconds it cost, and
 * what happened, in a line. `key` is its finding's key. `ref` ties a rule incident to the app's replay clip of it.
 * The moments are where each finding's seconds were lost; spells costing under EP_MIN aren't shown, so a finding built
 * from many small losses can add up to more than its moments.
 */
export interface Moment { key: string; t0: number; t1: number; x: number; y: number; lost: number; text: string; ref?: number }
/** A spell of one kind of loss being built up: closed once it's been off for EP_GAP seconds. */
interface Spell { key: string; t0: number; t1: number; x: number; y: number; lost: number; peak: number; aux: number; who: Map<string, number>; leg?: number }
/** A spell off for this long is over (a brief let-up doesn't split it); one that cost less than EP_MIN isn't kept. */
const EP_GAP = 4, EP_MIN = 1;
/** A wind shift worth calling a header or a lift, deg: past the wind's own wobble (the debrief's and the replay's line). */
export const SHIFT_DEG = 4;
/** Dirty air with no boat to windward to blame. */
const SHIP = 'a ship or the committee boat';
interface MarkLog { name: string; leg: 'beat' | 'reach' | 'run'; overM: number; overT: number; wide: number | null; place: number | null; t: number | null }

export class RaceLog {
  private gun: { d: number; kt: number; favored: string; favDeg: number; frac: number } | null = null;
  startDelay: number | null = null;
  dirty = { t: 0, lost: 0, by: new Map<string, number>() };
  lee = { t: 0, lost: 0 };
  header = { t: 0, lost: 0, streak: 0, worst: 0, liftTacks: 0 };
  tacks = { n: 0, gybes: 0, lost: 0, gybeLost: 0 };
  private turn: { t0: number; gybe: boolean; lost: number; x: number; y: number } | null = null;
  /**
   * A tack or gybe's 20 s are up (or another turn cut them short): a moment if it cost more than about 3 s, roughly a
   * boat length at a Folkboat's upwind speed, which a well-sailed tack loses anyway; shown from 3 s before the turn.
   */
  private endTurn(t: number, into: Moment[] = this.done): void {
    const T = this.turn!; if (into === this.done) this.turn = null;
    if (T.lost >= 3) into.push({ key: 'tacks', t0: T.t0 - 3, t1: Math.min(T.t0 + 20, t), x: T.x, y: T.y, lost: T.lost, text: `A ${T.gybe ? 'gybe' : 'tack'} that cost about ${Math.round(T.lost)} s against your target speed.` });
  }
  /** Each beat's worst spell past the layline, by leg: costed in moments() just as overstands() costs the finding. */
  private over = new Map<number, { t0: number; t1: number; x: number; y: number; peak: number; name: string }>();
  private lastTack = -999;
  private liftedAtTack = 0;
  down = { t: 0, lost: 0 };
  pole = { t: 0, lost: 0 };
  heel = { t: 0, lost: 0 };
  trim = { lost: 0 };
  /** The rig's tune against the guide's for the wind she met, upwind (sampled every 2 s: speedFactor twice is not free). */
  tune = { lost: 0, t: 0, every: 0, kt: 0, n: 0 };
  pen = { n: 0, t: 0 };
  private inPen = false;
  marks: MarkLog[] = [];
  private arrivals: number[] = []; // boats that have reached each mark (for places)
  /** When each boat reached each mark (race time, s), by boat id: for the race replay's comparison with the winner. */
  boatMarks: number[][] = [];
  /** The moments of your race the debrief points at, in the order they ended (see moments()). */
  private done: Moment[] = [];
  private open = new Map<string, Spell>();

  constructor(w: World) {
    this.marks = w.C.marks.map(m => ({ name: m.name, leg: m.leg, overM: 0, overT: 0, wide: null, place: null, t: null }));
    this.arrivals = w.C.marks.map(() => 0);
  }

  /** Any boat reaching a mark (for the places), and yours (how wide you went round). */
  onAdvance(w: World, b: Boat, idx: number): void {
    this.arrivals[idx]++;
    (this.boatMarks[b.id] ??= [])[idx] = w.t;
    if (!b.isUser) return;
    const m = w.C.marks[idx], L = this.marks[idx];
    L.place = this.arrivals[idx]; L.t = w.t;
    if (m.type === 'round' && !m.reach) {
      L.wide = dist(b, m.p);
      if (L.wide > 22) this.done.push({ key: 'roundings', t0: w.t - 15, t1: w.t, x: b.x, y: b.y, lost: 2 * (L.wide - 12) / Math.max(1, polar(w.wind.kt, 90)),
        text: `Wide round ${m.name}: ${Math.round(L.wide / 7.6)} boat length${Math.round(L.wide / 7.6) === 1 ? '' : 's'} off.` });
    }
  }

  /** A moment the app adds itself (a rule incident, with its replay clip's index as `ref`). */
  note(m: Moment): void { this.done.push(m); }

  /**
   * Build up a spell of `key` while `on`: `lost` is this step's seconds lost, `peak` the size to report (the worst wins),
   * `aux` the part of `lost` from a second cause (downwind: the pole), `who` whose doing it was.
   */
  private spell(w: World, key: string, on: boolean, lost: number, peak = 0, who?: string, aux = 0): void {
    let S = this.open.get(key);
    if (on) {
      if (!S) { S = { key, t0: w.t, t1: w.t, x: w.user.x, y: w.user.y, lost: 0, peak: 0, aux: 0, who: new Map(), leg: w.user.leg }; this.open.set(key, S); }
      S.t1 = w.t; S.lost += lost; S.aux += aux; S.peak = Math.max(S.peak, peak);
      if (who) S.who.set(who, (S.who.get(who) ?? 0) + 1);
    } else if (S && w.t - S.t1 > EP_GAP) this.close(S);
  }
  private close(S: Spell, into: Moment[] = this.done): void {
    if (into === this.done) this.open.delete(S.key);
    if (S.key === 'laylines') { this.keepOver(S, this.over); return; } // (costed in moments())
    if (S.lost < EP_MIN) return;
    const dur = S.t1 - S.t0, d = dur < 60 ? `${Math.round(dur)} s` : `${Math.floor(dur / 60)} min ${Math.round(dur % 60)} s`;
    const who = [...S.who].sort((a, b) => b[1] - a[1])[0]?.[0];
    const tacked = this.lastTack >= S.t1 - 1 && this.lastTack <= S.t1 + EP_GAP + 1;
    const text = {
      shifts: `Held a ${Math.round(S.peak)}° header for ${d}${tacked ? ' before tacking' : ''}.`,
      dirty: who === SHIP ? `${d} in the wind shadow of a ship or the committee boat.` : `${d} in ${who}'s dirty air.`,
      lee: `${d} in the lee of the land.`,
      downwind: `${d} sailing ${S.aux > S.lost / 2 ? 'deep without the pole set' : 'too high or too low for the best speed downwind'}.`,
      heel: `${d} heeled past her best (up to ${Math.round(S.peak)}°).`,
      trim: `${d} with your sheets off the best trim.`,
      penalty: `${d} doing penalty turns.`
    }[S.key] ?? '';
    into.push({ key: S.key, t0: S.t0, t1: S.t1, x: S.x, y: S.y, lost: S.lost, text });
  }

  /** The worst spell past the layline on each beat, as the finding counts it. */
  private keepOver(S: Spell, over: RaceLog['over']): void {
    const o = over.get(S.leg!);
    if (!o || S.peak > o.peak) over.set(S.leg!, { t0: S.t0, t1: S.t1, x: S.x, y: S.y, peak: S.peak, name: this.marks[S.leg!]?.name ?? 'the mark' });
  }

  /** Every moment so far, in time order (spells and a turn still going included, as far as they've got). */
  moments(w: SimView): Moment[] {
    const out = this.done.slice(), over = new Map(this.over);
    for (const S of this.open.values()) if (S.key === 'laylines') this.keepOver(S, over); else this.close(S, out);
    if (this.turn) this.endTurn(w.t, out);
    // past the layline: each beat's worst, costed as the finding is (0.6 × the distance over your upwind speed)
    const vBeat = Math.max(1, polar(w.wind.kt, beatAngle(w.wind.kt)));
    for (const o of over.values()) out.push({ key: 'laylines', t0: o.t0, t1: o.t1, x: o.x, y: o.y, lost: 0.6 * o.peak / vBeat,
      text: `Sailed ${Math.round(o.peak / 7.6)} boat length${Math.round(o.peak / 7.6) === 1 ? '' : 's'} past the layline for ${o.name}.` });
    return out.sort((a, b) => a.t0 - b.t0);
  }

  /** One step of your race (only while you're racing). */
  step(w: World, dt: number): void {
    const u = w.user, ww = u.ww;
    if (w.t >= 0 && !this.gun) {
      // the gun: where you were, how fast, and which end was favored
      const k = dot(sub(w.pin, w.committee), V(ww.from)) / w.lineLen, deg = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
      this.gun = { d: w.lineD(u), kt: u.v / 0.5144, favored: k > 0 ? w.C.pinLabel : w.C.committeeLabel, favDeg: deg, frac: (w.lineA(u) + w.lineLen / 2) / w.lineLen };
    }
    if (u.started && this.startDelay == null && w.startTimes[u.id] != null) {
      this.startDelay = w.startTimes[u.id]!;
      const g = this.gun, late = Math.max(0, this.startDelay - 2);
      this.done.push({ key: 'start', t0: -20, t1: this.startDelay, x: u.x, y: u.y, lost: late,
        text: `Crossed the line ${this.startDelay.toFixed(1)} s after the gun${g ? `, at ${g.kt.toFixed(1)} kt at the gun` : ''}.` });
    }
    if (!u.started || u.finished || u.retired || w.t < 0) return;
    const m = w.nextMark(u), leg = m?.leg ?? 'beat', beat = beatAngle(ww.kt);
    // penalties
    if (u.penalty > 0) {
      if (!this.inPen) {
        this.pen.n++; this.inPen = true;
        // the turns end every other spell (nothing is counted during them), and a tack or gybe just before
        for (const S of [...this.open.values()]) if (S.key !== 'penalty') this.close(S);
        if (this.turn) this.endTurn(w.t);
      }
      this.pen.t += dt; this.spell(w, 'penalty', true, dt); return;
    }
    if (this.inPen) { this.lastTack = u.lastTackT; this.turn = null; this.inPen = false; } // (the circles' tacks and gybes aren't tacks)
    this.spell(w, 'penalty', false, 0);
    // tacks and gybes: the speed lost against your target through each, for 20 s
    if (u.lastTackT !== this.lastTack && u.lastTackT > 0) {
      this.lastTack = u.lastTackT;
      const gybe = u.twa > 90;
      if (gybe) this.tacks.gybes++; else { this.tacks.n++; if (this.liftedAtTack > 4) this.header.liftTacks++; }
      if (this.turn) this.endTurn(w.t);
      this.turn = { t0: w.t, gybe, lost: 0, x: u.x, y: u.y };
    }
    if (this.turn) {
      const tgt = polar(ww.kt, this.turn.gybe ? Math.max(120, u.twa) : beat), loss = tgt > 0.3 ? clamp((tgt - u.v) / tgt, 0, 1) * dt : 0;
      if (this.turn.gybe) this.tacks.gybeLost += loss; else this.tacks.lost += loss;
      this.turn.lost += loss;
      if (w.t - this.turn.t0 > 20) this.endTurn(w.t);
    }
    // dirty air (other boats' and ships' wakes) and the lee of the land
    const lee = u.leeK ?? 1, dirtyK = (u.shadowK ?? 1) / lee;
    let dirtyWho: string | undefined;
    if (dirtyK < 0.97) {
      this.dirty.t += dt; this.dirty.lost += dt * (1 - dirtyK ** 0.7);
      let best: Boat | null = null, bd = 150; const up = V(ww.from);
      for (const o of w.boats) if (o !== u) { const r = sub(o, u), d = Math.hypot(r.x, r.y); if (d < bd && dot(r, up) > 0) { bd = d; best = o; } }
      const who = best ? best.name : SHIP;
      this.dirty.by.set(who, (this.dirty.by.get(who) ?? 0) + dt);
      dirtyWho = who;
    }
    this.spell(w, 'dirty', dirtyK < 0.97, dirtyK < 0.97 ? dt * (1 - dirtyK ** 0.7) : 0, 0, dirtyWho);
    if (lee < 0.97) { this.lee.t += dt; this.lee.lost += dt * (1 - lee ** 0.7); }
    this.spell(w, 'lee', lee < 0.97, lee < 0.97 ? dt * (1 - lee ** 0.7) : 0);
    // heel past her best, and your own trim (a spell while either costs anything, as the findings count them)
    const heelK = 1 - heelFactor(u.heelMag ?? 0);
    this.heel.lost += dt * heelK; if ((u.heelMag ?? 0) > 22) this.heel.t += dt;
    this.spell(w, 'heel', heelK > 0.001, dt * heelK, u.heelMag ?? 0);
    const byHandTrim = (byHand(u, 'mainsheet') || byHand(u, 'jibsheet')) && !u.luff && !u.hove;
    const trimK = byHandTrim ? 1 - driveSpeed(u, clamp(trimDrive(u.trim.main, u.trim.jib) * u.shape.eff, 0, 1)) : 0;
    this.trim.lost += dt * trimK;
    this.spell(w, 'trim', trimK > 0.001, dt * trimK);
    if (u.tune && u.twa < 70 && !u.tacking && !u.luff && (this.tune.every -= dt) <= 0) {
      this.tune.every = 2; const k = tuneLoss(u); this.tune.lost += 2 * k; this.tune.kt += ww.kt; this.tune.n++; if (k > 0.005) this.tune.t += 2;
    }
    // shifts, on a beat: on a header (against the mean wind), the other tack would be lifted
    const dev = wrap(ww.from - (u.avgFrom ?? w.avgFrom)), headed = u.tack === 'S' ? -dev : dev; // + headed
    this.liftedAtTack = -headed;
    if (leg === 'beat' && u.twa < 65 && !u.tacking) {
      if (headed > SHIFT_DEG) {
        this.header.streak += dt;
        // (the spell runs from the header's start; it costs only once held for 15 s, and one let go sooner isn't kept)
        if (this.header.streak > 15) {
          const f = 1 - Math.cos((beat + headed) * D2R) / Math.cos((beat - headed) * D2R);
          this.header.t += dt; this.header.lost += dt * clamp(f, 0, 0.5); this.header.worst = Math.max(this.header.worst, headed);
          this.spell(w, 'shifts', true, dt * clamp(f, 0, 0.5), headed);
        } else this.spell(w, 'shifts', true, 0, headed);
      } else { this.header.streak = 0; this.spell(w, 'shifts', false, 0); }
      // laylines: past the layline for the other tack (she'd lay the mark with room to spare if she tacked now)
      if (m && m.type === 'round') {
        const other = u.tack === 'S' ? 'P' : 'S', h = other === 'S' ? ww.from - beat : ww.from + beat;
        const g = unit({ x: V(h).x * Math.max(1, u.v) + u.cur.x, y: V(h).y * Math.max(1, u.v) + u.cur.y }), d = sub(m.p, u), lat = cross(g, d);
        const fetches = dot(g, d) > 0 && (other === 'S' ? lat > 0 : lat < 0), over = Math.abs(lat) - 10;
        const past = fetches && over > 5;
        if (past) { const L = this.marks[u.leg]; L.overM = Math.max(L.overM, over); L.overT += dt; }
        this.spell(w, 'laylines', past, 0, past ? over : 0);
      } else this.spell(w, 'laylines', false, 0);
    } else { this.header.streak = 0; this.spell(w, 'shifts', false, 0); this.spell(w, 'laylines', false, 0); }
    // downwind: your angle against the best, and the pole
    if (leg === 'run' && u.twa > 120 && !u.luff) {
      const best = runAngle(ww.kt), vmg = (a: number) => polar(ww.kt, a) * -Math.cos(a * D2R), r = vmg(best) > 0 ? vmg(u.twa) / vmg(best) : 1;
      let lost = 0, poleLost = 0;
      if (r < 0.97) { this.down.t += dt; this.down.lost += dt * clamp(1 - r, 0, 0.5); lost += dt * clamp(1 - r, 0, 0.5); }
      // (only while the pole could be out: not with the jib down, in penalty turns, in a harbor; ai.ts poleMustCome)
      if (u.twa > 156 && u.pole !== 'set' && u.poleMine && !poleMustCome(u)) {
        const jib = polar(ww.kt, u.twa, 'jib'), wing = polar(ww.kt, u.twa, 'wing');
        if (wing > jib * 1.02) { this.pole.t += dt; this.pole.lost += dt * (1 - jib / wing); lost += dt * (1 - jib / wing); poleLost = dt * (1 - jib / wing); }
      }
      this.spell(w, 'downwind', lost > 0, lost, 0, undefined, poleLost);
    } else this.spell(w, 'downwind', false, 0);
  }

  /** Seconds lost on the laylines, mark by mark. */
  private overstands(w: SimView): { lost: number; worst: MarkLog | null } {
    let lost = 0, worst: MarkLog | null = null;
    const vBeat = Math.max(1, polar(w.wind.kt, beatAngle(w.wind.kt)));
    for (const L of this.marks) if (L.overM > 0) { lost += 0.6 * L.overM / vBeat; if (!worst || L.overM > worst.overM) worst = L; }
    return { lost, worst };
  }

  /** What cost you time, most first: only what cost a couple of seconds or more. */
  findings(w: SimView): Finding[] {
    const out: Finding[] = [], mmss = (x: number) => x < 60 ? `${Math.round(x)} s` : `${Math.floor(x / 60)} min ${Math.round(x % 60)} s`;
    const bl = (m: number) => `${Math.round(m / 7.6)} boat length${Math.round(m / 7.6) === 1 ? '' : 's'}`;
    // the start
    if (this.gun) {
      const late = Math.max(0, (this.startDelay ?? 60) - 2), g = this.gun;
      const atFav = (g.favored === w.C.pinLabel ? g.frac < 0.33 : g.frac > 0.67);
      out.push({ key: 'start', title: 'The start', lost: late,
        detail: this.startDelay == null ? 'No clean start.' : `You crossed ${this.startDelay.toFixed(1)} s after the gun${g.d < -1 ? `, ${Math.round(-g.d)} m back from the line at the gun` : ''}, going ${g.kt.toFixed(1)} kt at the gun.${g.favDeg >= 3 ? ` The ${g.favored} end was favored by ${Math.round(g.favDeg)}°${atFav ? ', and you started there.' : '; you started away from it.'}` : ' The line was about square.'}`,
        tip: late > 6 ? 'Time your run in: know how long it takes to reach the line from your spot, and leave with a few seconds to spare, building speed. Be on the line at full speed at the gun.' : g.favDeg >= 3 && !atFav ? `Start nearer the favored end: ${Math.round(g.favDeg)}° of bias is worth a boat length or more in a short line.` : 'A good start.' });
    }
    if (this.header.lost > 0.5 || this.header.liftTacks > 0) out.push({ key: 'shifts', title: 'Wind shifts', lost: this.header.lost + this.header.liftTacks * 3,
      detail: `${mmss(this.header.t)} on headers you held for more than 15 s (up to ${Math.round(this.header.worst)}°)${this.header.liftTacks ? `; ${this.header.liftTacks} tack${this.header.liftTacks > 1 ? 's' : ''} onto a header (you tacked when you were lifted)` : ''}.`,
      tip: 'On a beat, watch your heading (the compass says "headed"): when the wind heads you a few degrees for more than a few seconds, tack onto the lift. Don\'t tack on a lift.' });
    const ov = this.overstands(w);
    if (ov.lost > 1 && ov.worst) out.push({ key: 'laylines', title: 'Laylines', lost: ov.lost,
      detail: `You sailed past the layline before tacking for the mark: by up to ${bl(ov.worst.overM)} at ${ov.worst.name}.`,
      tip: 'Tack when the mark is just abaft your beam on the other tack\'s side (or on the laylines drawn on the water, or the transit): every length past it is sailed twice.' });
    if (this.tacks.n + this.tacks.gybes > 0) {
      const per = this.tacks.n ? this.tacks.lost / this.tacks.n : 0;
      out.push({ key: 'tacks', title: 'Tacks and gybes', lost: this.tacks.lost + this.tacks.gybeLost,
        detail: `${this.tacks.n} tack${this.tacks.n === 1 ? '' : 's'}${this.tacks.n ? `, each costing about ${per.toFixed(1)} s` : ''}; ${this.tacks.gybes} gybe${this.tacks.gybes === 1 ? '' : 's'}.`,
        tip: per > 6 ? 'Smooth tacks: turn steadily (not too fast in a chop), let the jib come across as you pass head to wind, and bear off a few degrees to build speed before pointing.' : 'Tack only when it pays (a header, a layline, clear air): each one costs a few seconds.' });
    }
    if (this.dirty.lost > 0.5) {
      const top = [...this.dirty.by].sort((a, b) => b[1] - a[1])[0];
      out.push({ key: 'dirty', title: 'Dirty air', lost: this.dirty.lost,
        detail: `${mmss(this.dirty.t)} in other boats' wind shadows${top ? `, mostly ${top[0]}'s` : ''}.`,
        tip: 'Get out of another boat\'s shadow fast: it lies along her apparent wind (look at her masthead fly). Tack away, or foot off to leeward to clear it; don\'t sit behind and to leeward of a boat on a beat.' });
    }
    if (this.lee.lost > 0.5) out.push({ key: 'lee', title: 'The lee of the land', lost: this.lee.lost,
      detail: `${mmss(this.lee.t)} in the wind shadow of an island or headland.`,
      tip: 'Keep out of the lee of Angel Island, Alcatraz and the Marin hills when you can: the wind there is a fraction of the breeze outside it.' });
    if (this.down.lost + this.pole.lost > 0.5) out.push({ key: 'downwind', title: 'Downwind', lost: this.down.lost + this.pole.lost,
      detail: `${mmss(this.down.t)} sailing too high or too low for the best speed downwind${this.pole.t > 1 ? `; ${mmss(this.pole.t)} sailing deep without the pole set` : ''}.`,
      tip: 'Downwind, sail the best angle for the wind (the downwind laylines show it): heat up a little in the lulls, sail lower in the puffs. Running deep, pole the jib out to windward.' });
    if (this.heel.lost > 0.5) out.push({ key: 'heel', title: 'Heel', lost: this.heel.lost,
      detail: `${mmss(this.heel.t)} heeled past about 22°.`,
      tip: 'In the puffs, depower before she lays over: backstay on, traveller down, ease the main a little. A Folkboat is fastest at about 15–20° of heel.' });
    if (this.trim.lost > 1) out.push({ key: 'trim', title: 'Sail trim', lost: this.trim.lost,
      detail: 'Your sheets and controls, against the best trim for the conditions.',
      tip: 'Watch the telltales, and open the Trim coach for what to change.' });
    const u = w.user;
    if (u.tune && this.tune.lost > 1 && this.tune.n) {
      const kt = this.tune.kt / this.tune.n, want = presetFor(kt);
      out.push({ key: 'tune', title: 'Rig tune', lost: this.tune.lost,
        detail: `${mmss(this.tune.t)} upwind on ${tuneWords(u.tune)} in about ${Math.round(kt)} kt, where ${tuneName(u.tune) === want ? 'it was right only part of the time' : `${tuneWords(TUNE_PRESETS[want])} would have fitted`}.`,
        tip: 'Tune the rig at the dock for the forecast: the forestay and shrouds can\'t be touched once racing (CR 7.40), nor the mast foot (CR 6.1.5). (The time is what her sails gave up; heel and the rest add to it.) If the wind is forecast to cross a setting, tune for the part of the race that matters most, and use the backstay for the rest.' });
    }
    if (this.pen.n) out.push({ key: 'penalty', title: 'Penalties', lost: this.pen.t,
      detail: `${this.pen.n} penalt${this.pen.n === 1 ? 'y' : 'ies'}: ${mmss(this.pen.t)} doing turns.`,
      tip: 'Know who has right of way before you get close: port gives way to starboard, windward to leeward, and give room at marks. The replay of each foul shows the rule.' });
    const wide = this.marks.filter(L => L.wide != null && L.wide > 22);
    if (wide.length) {
      const v = Math.max(1, polar(w.wind.kt, 90)), lost = wide.reduce((a, L) => a + 2 * (L.wide! - 12) / v, 0);
      out.push({ key: 'roundings', title: 'Mark roundings', lost,
        detail: `Wide round ${wide.map(L => `${L.name} (${bl(L.wide!)} off)`).join(', ')}.`,
        tip: 'Come in wide and go out tight: start the turn early so you leave the mark close aboard on your new course.' });
    }
    return out.filter(f => f.key === 'start' || f.lost >= 2).sort((a, b) => b.lost - a.lost).map(f => ({ ...f, title: f.title, detail: f.detail, tip: f.tip, lost: Math.round(f.lost) }));
  }

  /** Your place as you reached each mark. */
  places(): { name: string; place: number | null; t: number | null }[] { return this.marks.map(L => ({ name: L.name, place: L.place, t: L.t })); }
}
