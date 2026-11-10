import './three-setup';
import * as THREE from 'three';
import { D2R, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import { P3 } from './coords';

/**
 * The Bay's wildlife, in the numbers you'd see from a boat (visual only: none of it touches the sailing).
 *
 * - **Harbor porpoises** came back to the Bay around 2008 and feed in the tidal flow by the Golden Gate, along the
 *   Marin side (Lime Point, Horseshoe Bay, Yellow Bluff) and in Raccoon Strait: pairs and small groups. Shy: a few
 *   quick rolls showing a small dark triangular fin, then a dive of a minute or two. They keep away from boats.
 * - **Harbor seals:** a mottled head at the surface near the shores and Alcatraz, watching you; it sinks out of sight
 *   when you come close.
 * - **California sea lions:** the colony on the floats at Pier 39 (most in autumn and winter; fewest in early summer,
 *   when most have gone south to the Channel Islands to breed), and the odd one swimming, porpoising now and then.
 * - **Birds:** western gulls overhead and sitting on the water (they lift off as you sail up); lines of brown pelicans
 *   gliding just above the waves, plunging now and then (summer to late autumn, after they've bred in the south);
 *   double-crested cormorants flying fast and low.
 */

const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });

/* ---------- porpoises ---------- */

interface Porpoise { g: THREE.Group; home: Vec; p: Vec; h: number; t: number; rolls: number; dive: number; off: Vec }
const POD_ZONES: [number, number, number][] = [[37.8285, -122.4745, 350], [37.8320, -122.4640, 400], [37.8395, -122.4650, 350], [37.8655, -122.4420, 300], [37.8170, -122.4760, 300]];

/**
 * A harbor porpoise: a small, stocky, torpedo-shaped body about 1.5 m long, dark grey above, with a low triangular fin
 * a little behind the middle of the back. Head toward −z. Only the back ever shows as it rolls through the surface.
 */
function porpoiseMesh(): THREE.Group {
  const g = new THREE.Group(), dark = lam(0x2f343a);
  // the body, turned on a lathe: blunt head, deepest a third of the way back, tapering to the tail stock
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const f = i / 16, y = 0.75 - 1.5 * f; // head (+0.75) → tail (−0.75)
    const r = f < 0.08 ? 0.12 + 0.9 * f : f < 0.35 ? 0.19 + 0.06 * Math.sin((f - 0.08) / 0.27 * Math.PI / 2) : 0.25 * Math.pow(1 - (f - 0.35) / 0.65, 0.9) + 0.025;
    prof.push(new THREE.Vector2(i === 0 ? 0.001 : r, y));
  }
  prof.push(new THREE.Vector2(0.001, -0.76));
  const geo = new THREE.LatheGeometry(prof, 12); geo.rotateX(-Math.PI / 2); geo.scale(1, 0.85, 1); // a little flatter than round
  const body = new THREE.Mesh(geo, dark); g.add(body);
  // the dorsal fin: low and triangular, just behind the middle
  const fg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.17, -0.12), new THREE.Vector3(0, 0.33, 0.1), new THREE.Vector3(0, 0.17, 0.2)]);
  fg.computeVertexNormals(); g.add(new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: 0x262a2f, side: THREE.DoubleSide })));
  // the flukes (they rarely show; the tail stock arches as it goes down)
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.14), dark); fl.position.set(0, 0, 0.78); g.add(fl);
  return g;
}

/* ---------- harbor seals ---------- */

interface Seal { g: THREE.Group; p: Vec; up: number; down: number; t: number }
const SEAL_SPOTS: [number, number][] = [[37.8085, -122.4515], [37.8105, -122.4330], [37.8250, -122.4185], [37.8290, -122.4255], [37.8135, -122.3655], [37.8570, -122.4795], [37.8285, -122.4720]];

function sealHead(): THREE.Group {
  const g = new THREE.Group(), skin = lam(0x6f6a62);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin); head.scale.set(1, 1.05, 1.15); head.position.y = 0.1; g.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lam(0x5d5850)); snout.position.set(0, 0.07, -0.15); g.add(snout);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), lam(0x111111)); eye.position.set(sx * 0.07, 0.15, -0.1); g.add(eye); }
  return g;
}

/* ---------- sea lions ---------- */

/** A sea lion hauled out: a long brown body, head up or down. */
function seaLion(r: () => number): THREE.Group {
  const g = new THREE.Group(), c = [0x5a4632, 0x6b5338, 0x4a3a2a, 0x7a6146][Math.floor(r() * 4)];
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam(c)); body.scale.set(0.9, 0.7, 2.6); body.position.y = 0.2; g.add(body);
  const neck = new THREE.Group(); neck.position.set(0, 0.28, -0.62); g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lam(c)); head.scale.set(1, 1, 1.4); head.position.set(0, 0.12, -0.08); neck.add(head);
  g.userData.neck = neck; neck.rotation.x = r() < 0.4 ? -0.7 : 0.3;
  return g;
}
const PIER39 = LL(37.80945, -122.41145); // the floats on the west side of Pier 39 (K-dock)
/** How many sea lions are on the Pier 39 floats, by month: most from autumn to spring, fewest in June and July. */
const PIER39_COUNT = [28, 26, 22, 18, 12, 6, 5, 9, 14, 20, 26, 30];

/* ---------- birds ---------- */

type BirdKind = 'gull' | 'pelican' | 'cormorant';
interface Bird { kind: BirdKind; g: THREE.Group; wings: [THREE.Object3D, THREE.Object3D]; p: THREE.Vector3; v: THREE.Vector3; flap: number; sit: boolean; dive: number; t: number }
const BIRD = {
  gull: { body: 0xf2f2ee, wing: 0x9aa1a8, tip: 0x22252a, span: 1.3, len: 0.6, speed: 8 },
  pelican: { body: 0x8b8378, wing: 0x6d665d, tip: 0x2a2724, span: 2.1, len: 1.1, speed: 11 },
  cormorant: { body: 0x1e1f22, wing: 0x26282b, tip: 0x1a1b1d, span: 1.2, len: 0.85, speed: 15 }
};
function birdMesh(kind: BirdKind): { g: THREE.Group; wings: [THREE.Object3D, THREE.Object3D] } {
  const k = BIRD[kind], g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lam(k.body)); body.scale.set(k.len * 0.28, k.len * 0.26, k.len); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), lam(k.body)); head.scale.setScalar(k.len * 0.22); head.position.set(0, k.len * 0.08, -k.len * 0.55); g.add(head);
  if (kind === 'pelican') { const bill = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45, 5), lam(0xb08c5a)); bill.rotation.x = -Math.PI / 2; bill.position.set(0, k.len * 0.04, -k.len * 0.85); g.add(bill); }
  const wings = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * k.len * 0.1, k.len * 0.05, -k.len * 0.05); g.add(pivot);
    const shape = new THREE.Shape(); const L = k.span / 2;
    shape.moveTo(0, -0.12 * L); shape.lineTo(L * 0.95, -0.02 * L); shape.lineTo(L, 0.1 * L); shape.lineTo(0, 0.22 * L); shape.closePath();
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: k.wing, side: THREE.DoubleSide }));
    w.rotation.x = -Math.PI / 2; w.scale.x = s; pivot.add(w);
    const tip = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(L * 0.78, -0.04 * L), new THREE.Vector2(L, 0.1 * L), new THREE.Vector2(L * 0.78, 0.08 * L)])), new THREE.MeshLambertMaterial({ color: k.tip, side: THREE.DoubleSide }));
    tip.rotation.x = -Math.PI / 2; tip.scale.x = s; tip.position.y = 0.002; pivot.add(tip);
    return pivot;
  }) as unknown as [THREE.Object3D, THREE.Object3D];
  return { g, wings };
}

export class Wildlife {
  private root = new THREE.Group();
  private porpoises: Porpoise[] = [];
  private seals: Seal[] = [];
  private lions = new THREE.Group();
  private lionBodies: THREE.Group[] = [];
  private birds: Bird[] = [];
  private r = rng(2718);
  private month = 0;

  constructor(scene: THREE.Scene, private isWater: (p: Vec) => boolean) {
    scene.add(this.root);
    const r = this.r;
    // porpoise pods: one to three animals each
    POD_ZONES.forEach(([la, lo, rad], i) => {
      const home = LL(la, lo), n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const g = porpoiseMesh(); g.visible = false; this.root.add(g);
        this.porpoises.push({ g, home: { x: home.x + (r() - 0.5) * rad, y: home.y + (r() - 0.5) * rad }, p: { x: home.x, y: home.y }, h: r() * 360, t: -r() * 60 - i * 7, rolls: 0, dive: 40 + r() * 60, off: { x: (k - 1) * 3, y: (r() - 0.5) * 4 } });
      }
    });
    for (const [la, lo] of SEAL_SPOTS) { const g = sealHead(); g.visible = false; this.root.add(g); this.seals.push({ g, p: LL(la, lo), up: 30 + r() * 40, down: 90 + r() * 120, t: r() * 150 }); }
    // the Pier 39 floats, and the sea lions on them
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 6.5), lam(0x6d6a62)); f.position.set(i * 4.2 - 6, 0.15, 0); this.lions.add(f);
      for (let j = 0; j < 9; j++) { const s = seaLion(r); s.position.set(i * 4.2 - 6 + (r() - 0.5) * 2.6, 0.32, (r() - 0.5) * 5.6); s.rotation.y = r() * 6.28; this.lions.add(s); this.lionBodies.push(s); }
    }
    this.lions.position.copy(P3(PIER39.x, PIER39.y, 0)); this.lions.rotation.y = 12 * D2R; this.root.add(this.lions);
    // birds: gulls (some sitting on the water), a line of pelicans, a couple of cormorants
    const add = (kind: BirdKind, sit = false) => { const m = birdMesh(kind); this.root.add(m.g); this.birds.push({ kind, g: m.g, wings: m.wings, p: new THREE.Vector3(), v: new THREE.Vector3(), flap: r() * 6, sit, dive: 0, t: 0 }); };
    for (let i = 0; i < 5; i++) add('gull'); for (let i = 0; i < 4; i++) add('gull', true);
    for (let i = 0; i < 5; i++) add('pelican'); for (let i = 0; i < 2; i++) add('cormorant');
  }

  /** The month (1–12) sets the season: pelicans and sea lions come and go. */
  setMonth(month: number): void {
    if (month === this.month) return;
    this.month = month;
    const n = PIER39_COUNT[(month - 1 + 12) % 12];
    this.lionBodies.forEach((s, i) => { s.visible = i < n; });
  }
  private pelicansHere = () => this.month >= 5 && this.month <= 11 || this.month === 12 && this.r() < 0.3;

  /**
   * Move them. `focus`: the boat you're watching (birds stay around her); `boats`: everyone afloat (the animals keep
   * clear); `sea(x, y)`: the water's height; `t` the time (s).
   */
  update(dt: number, t: number, focus: Vec, boats: Vec[], sea: (x: number, y: number) => number): void {
    const r = this.r, near = (p: Vec, d: number) => boats.some(b => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < d * d);
    // porpoises: a bout of three or four quick rolls, ten seconds or so apart, then a long dive; keeping clear of boats
    for (const a of this.porpoises) {
      a.t += dt;
      if (a.t > 0 && near(a.p, 35)) { a.t = -a.dive; a.rolls = 0; a.h += 120 + r() * 120; } // spooked: down and away
      const u = { x: Math.sin(a.h * D2R), y: Math.cos(a.h * D2R) };
      const speed = a.t > 0 ? 2.4 : 1.6; // swimming: quicker in a breathing bout, slower down below
      a.p.x += u.x * speed * dt; a.p.y += u.y * speed * dt;
      if ((a.p.x - a.home.x) ** 2 + (a.p.y - a.home.y) ** 2 > 250 * 250) a.h = Math.atan2(a.home.x - a.p.x, a.home.y - a.p.y) / D2R + (r() - 0.5) * 40;
      else if (r() < dt * 0.05) a.h += (r() - 0.5) * 50; // wandering as it feeds
      // a breath every 7 s or so in a bout, each pod member a moment after the last (their offset)
      const T = 1.45, cyc = (a.t - a.off.y * 0.12 + 20) % 7;
      const rolling = a.t > 0 && cyc < T && this.isWater(a.p);
      a.g.visible = rolling;
      if (rolling) {
        // the roll: the body runs along an arc in the vertical plane, like a wheel turning over through the surface:
        // the head breaks first, the back and fin turn over, the tail stock slips under
        const ph = cyc / T, ang = (ph - 0.5) * 1.75, Rc = 1.15, depth = 1.15;
        const x = a.p.x + a.off.x * u.y + u.x * Rc * Math.sin(ang), y = a.p.y - a.off.x * u.x + u.y * Rc * Math.sin(ang);
        a.g.position.copy(P3(x, y, sea(x, y) - depth + Rc * Math.cos(ang)));
        a.g.rotation.set(0, -a.h * D2R, 0); a.g.rotateX(-ang); // nose up as it rises, down as it goes under
      }
      if (a.t > 0 && a.t > 7 * (3 + (a.rolls % 3))) { a.t = -(a.dive = 45 + r() * 75); a.rolls++; } // then a long dive
    }
    // harbor seals: a head up for half a minute or so, then down for a couple of minutes; down at once if you come close
    for (const s of this.seals) {
      s.t += dt; const cyc = s.t % (s.up + s.down);
      if (cyc < s.up && near(s.p, 25)) s.t += s.up - cyc; // into the dive
      const up = (s.t % (s.up + s.down)) < s.up;
      s.g.visible = up;
      if (up) { const bob = Math.sin(t * 1.3 + s.p.x) * 0.04; s.g.position.copy(P3(s.p.x, s.p.y, sea(s.p.x, s.p.y) + bob)); s.g.rotation.y = Math.sin(t * 0.2 + s.p.y) * 1.2; }
    }
    // sea lions on the floats: heads up and down now and then
    for (const s of this.lionBodies) if (s.visible && r() < dt * 0.05) (s.userData.neck as THREE.Group).rotation.x = r() < 0.5 ? -0.7 : 0.3;
    this.lions.position.y = sea(PIER39.x, PIER39.y) * 0.4;
    // birds, around the boat you're watching
    const F = P3(focus.x, focus.y, 0);
    let pel = 0;
    for (const b of this.birds) {
      const k = BIRD[b.kind];
      if (b.kind === 'pelican') {
        // a line of pelicans: in season, gliding just above the waves on a long straight track past the boat
        const on = this.pelicansHere(); b.g.visible = on; if (!on) continue;
        const i = pel++, lead = this.birds.find(x => x.kind === 'pelican')!;
        if (i === 0) {
          if (b.t <= 0 || b.p.distanceTo(F) > 700) { // a new pass
            const a = r() * 6.28, d = 450; b.p.set(F.x + Math.cos(a) * d, 2.5, F.z + Math.sin(a) * d);
            const aim = new THREE.Vector3(F.x + (r() - 0.5) * 120, 2.5, F.z + (r() - 0.5) * 120); b.v.copy(aim.sub(b.p).setY(0).normalize().multiplyScalar(k.speed)); b.t = 90;
          }
          b.t -= dt; b.p.addScaledVector(b.v, dt); b.p.y = 2.2 + Math.sin(t * 0.6) * 0.5;
        } else {
          const back = lead.v.clone().normalize();
          b.p.copy(lead.p).addScaledVector(back, -3.2 * i).add(new THREE.Vector3(back.z, 0, -back.x).multiplyScalar(1.2 * i)); b.p.y = lead.p.y + Math.sin(t * 0.7 + i) * 0.25;
          b.v.copy(lead.v);
          if (b.dive <= 0 && r() < dt * 0.01) b.dive = 2.5; // a plunge for a fish
        }
        if (b.dive > 0) { b.dive -= dt; const ph = 1 - b.dive / 2.5; b.p.y = Math.max(-0.5, b.p.y + 8 * (1 - ph) - 10 * ph); }
        b.flap += dt * (b.dive > 0 ? 0 : 1.6);
        this.pose(b, Math.sin(b.flap) * 0.08 + (b.dive > 0 ? 1.1 : 0.05));
        continue;
      }
      if (b.sit) {
        // a gull resting on the water: lifts off when a boat comes close, or when it drifts out of the picture
        if (b.t <= 0 || b.p.distanceTo(F) > 450) { const a = r() * 6.28, d = 60 + r() * 220; b.p.set(F.x + Math.cos(a) * d, 0, F.z + Math.sin(a) * d); b.t = 1; }
        const wp = { x: b.p.x, y: -b.p.z };
        if (!this.isWater(wp)) { b.t = 0; b.g.visible = false; continue; }
        b.g.visible = true; b.p.y = sea(wp.x, wp.y) + 0.12;
        if (near(wp, 22)) { b.sit = false; b.v.set((r() - 0.5) * 8, 3, (r() - 0.5) * 8); b.t = 20; }
        this.pose(b, -0.15, true);
        continue;
      }
      // flying: gulls wheel round the boat; cormorants fly fast and straight, just above the water
      b.g.visible = true;
      if (b.t <= 0 || b.p.distanceTo(F) > 600) {
        const a = r() * 6.28, d = b.kind === 'cormorant' ? 400 : 80 + r() * 200;
        b.p.set(F.x + Math.cos(a) * d, b.kind === 'cormorant' ? 1.5 : 10 + r() * 20, F.z + Math.sin(a) * d);
        const head = b.kind === 'cormorant' ? Math.atan2(F.z - b.p.z, F.x - b.p.x) + (r() - 0.5) * 0.6 : r() * 6.28;
        b.v.set(Math.cos(head) * k.speed, 0, Math.sin(head) * k.speed); b.t = b.kind === 'cormorant' ? 60 : 30 + r() * 30;
      }
      b.t -= dt;
      if (b.kind === 'gull') {
        // wheeling: turning slowly, sometimes dropping to the water to sit
        b.v.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.25 * Math.sin(t * 0.1 + b.flap)); b.v.y = (15 - b.p.y) * 0.1 + Math.sin(t * 0.5 + b.flap) * 0.6;
        if (b.t < 2 && b.t > 0 && r() < dt * 0.3) { b.sit = true; b.t = 1; }
      } else b.v.y = (1.6 - b.p.y) * 0.8;
      b.p.addScaledVector(b.v, dt);
      b.flap += dt * (b.kind === 'cormorant' ? 9 : 3.2);
      this.pose(b, b.kind === 'cormorant' ? Math.sin(b.flap) * 0.55 : Math.max(-0.1, Math.sin(b.flap)) * 0.45 * (Math.sin(t * 0.3 + b.flap * 0.1) > 0 ? 1 : 0.2));
    }
  }

  private pose(b: Bird, wing: number, folded = false): void {
    b.g.position.copy(b.p);
    const h = Math.atan2(b.v.x, b.v.z); if (b.v.lengthSq() > 0.01) b.g.rotation.set(0, h + Math.PI, 0);
    b.wings[0].rotation.z = folded ? 1.3 : wing; b.wings[1].rotation.z = folded ? -1.3 : -wing;
    b.wings[0].scale.setScalar(folded ? 0.45 : 1); b.wings[1].scale.setScalar(folded ? 0.45 : 1);
  }
}
