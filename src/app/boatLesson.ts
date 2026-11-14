/**
 * Lesson 1, The boat (design/LEARN-TO-SAIL-PLAN.md; ASA 101's knowledge items 1–3, design/ASA-101-CHECK.md): your boat on
 * show in the showroom, sailing a close reach in the real wind, and one line at a time "Find the boom": click it on her.
 * Found, the line says what it's for; a click on another part names that one instead. Drag to look round her, the wheel
 * to come closer. Every part found passes it. Nothing new on the screen: the line is the showroom's own bar.
 * (A part of src/app.ts: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { ALSO, HIT_PX, PARTS, TWIN, screenArea, screenDist, type PartId, type PartKey } from '../render/boatParts';
import { saveSettings } from '../settings';
import { $ } from '../ui/dom';
import type { AppCtx } from '../app';

/** How long a found part's line stays before the next cue (ms). */
const NOTE_MS = 2600;
/** How far off her the camera starts (m): far enough to see her whole, the masthead to the waterline; the wheel brings it in. */
const CHASE = 15;

export function mountBoatLesson(app: AppCtx) {
  let on = false, i = 0, note = '', noteUntil = 0, done = false, down: { x: number; y: number } | null = null;
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  const nameOf = (k: PartKey) => PARTS.find(p => p.key === k)!.name;
  /**
   * Whether a click at (x, y) is on the part (or one that counts as it), and nearer it than any other line or fitting:
   * where the small ones crowd together (the vang, the outhaul, the Cunningham at the mast's foot) you come in close and
   * point at the one you mean.
   */
  function onPart(k: PartKey, x: number, y: number): boolean {
    const mine = new Set<PartId>([k, ...(ALSO[k] ?? [])]), twins = new Set<PartId>(TWIN[k] ?? []), tack = app.w.user.tack;
    let d = Infinity, area = false;
    for (const q of mine) {
      const sp = app.view.projectPart(q, tack); if (!sp) continue;
      const e = screenDist(sp, x, y); if (e > HIT_PX[sp.kind]) continue;
      if (sp.kind === 'area') area = true; else d = Math.min(d, e);
    }
    if (d === Infinity) return area; // (an area: the lines drawn over it don't take it from it)
    return !PARTS.some(p => {
      if (mine.has(p.key) || twins.has(p.key)) return false;
      const sp = app.view.projectPart(p.key, tack); return !!sp && sp.kind !== 'area' && screenDist(sp, x, y) < d - 2;
    });
  }
  /** The part a click is on, if any: a point or line before an area it lies over, and of two areas the smaller. */
  function partAt(x: number, y: number): PartKey | null {
    let best: { k: PartKey; line: boolean; d: number; a: number } | null = null;
    for (const p of PARTS) {
      const sp = app.view.projectPart(p.key, app.w.user.tack); if (!sp) continue;
      const d = screenDist(sp, x, y); if (d > HIT_PX[sp.kind]) continue;
      const c = { k: p.key, line: sp.kind !== 'area', d, a: screenArea(sp) };
      if (!best || (c.line && !best.line) || (c.line === best.line && (c.line ? c.d < best.d : c.a < best.a))) best = c;
    }
    return best?.k ?? null;
  }
  function paint(): void {
    const el = $('showCue');
    if (performance.now() < noteUntil) el.textContent = note;
    else el.textContent = done ? 'You know her ✓' : `Find the ${nameOf(PARTS[i].key)} · ${i + 1} of ${PARTS.length}`;
    el.className = performance.now() < noteUntil || done ? 'ok' : '';
  }
  function click(x: number, y: number): void {
    if (done) return;
    const want = PARTS[i];
    if (onPart(want.key, x, y)) {
      note = `${cap(want.name)} ✓ · ${want.what}`; noteUntil = performance.now() + NOTE_MS; i++;
      if (i === PARTS.length) {
        done = true;
        if (!(app.S.lessonsPassed ?? []).includes('boat')) { app.S.lessonsPassed = [...(app.S.lessonsPassed ?? []), 'boat']; saveSettings(app.S); }
        setTimeout(() => { if (on && done) close(true); }, NOTE_MS + 1500);
      }
    } else {
      const k = partAt(x, y); if (!k) return;
      note = `That's the ${nameOf(k)}`; noteUntil = performance.now() + 1600;
    }
    paint();
  }
  function open(): void {
    on = true; i = 0; done = false; noteUntil = 0;
    for (const id of ['home', 'drillView', 'lessons', 'setup']) $(id).hidden = true;
    document.body.classList.add('partsLesson'); app.showroom(true); app.look.spin = true; app.look.chase = CHASE; app.newGame();
    paint();
  }
  /** Leave it (Esc, or passed): back to the lessons. */
  function close(back = true): void {
    if (!on) return;
    on = false; document.body.classList.remove('partsLesson'); app.look.spin = true; app.showroom(false);
    if (back) app.openLessons();
  }
  const gl = app.view.renderer.domElement;
  gl.addEventListener('pointerdown', e => { if (on) down = { x: e.clientX, y: e.clientY }; });
  gl.addEventListener('pointerup', e => {
    if (!on || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved < 6) click(e.clientX, e.clientY); else app.look.spin = false; // (looked round her: she stays where you put her)
  });
  return {
    open, close, click,
    get on() { return on; },
    /** Each frame: the line (a found part's note gives way to the next cue). */
    tick(): void { if (on) { app.look.chase = Math.min(24, Math.max(5, app.look.chase ?? CHASE)); paint(); } },
    /** For the checks: the part being looked for. */
    get want(): PartKey | null { return on && !done ? PARTS[i].key : null; }
  };
}
