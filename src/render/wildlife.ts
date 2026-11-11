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
  // dark grey back, paler speckled grey flanks, white belly (Wikipedia, "Harbour porpoise")
  const nrm = geo.attributes.normal, cols: number[] = [], back = new THREE.Color(0x2c3137), side = new THREE.Color(0x7d848a), belly = new THREE.Color(0xd9dbd8), c = new THREE.Color();
  for (let i = 0; i < nrm.count; i++) { const ny = nrm.getY(i); c.copy(ny > 0.25 ? back : ny > -0.45 ? side.clone().lerp(back, Math.max(0, ny + 0.2) * 1.6) : belly); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); g.add(body);
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

/**
 * A harbor seal at the surface: a round head about 22 cm across with a short dog-like muzzle and no ear flaps, grey
 * mottled with dark spots, and the top of the neck. It floats upright ("bottling"), nose tipped up, watching you.
 */
function sealHead(r: () => number): THREE.Group {
  const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt); g.userData.tilt = tilt;
  const geo = new THREE.SphereGeometry(0.11, 14, 10), cols: number[] = [], base = new THREE.Color([0x8a857c, 0x6f6a62, 0x9a958b][Math.floor(r() * 3)]), spot = new THREE.Color(0x3e3a35);
  const p = geo.attributes.position, spots = Array.from({ length: 9 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize(); const d = Math.max(...spots.map(sp => sp.dot(v))); const c = base.clone().lerp(spot, d > 0.93 ? 0.75 : 0); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const skin = new THREE.MeshLambertMaterial({ vertexColors: true });
  const head = new THREE.Mesh(geo, skin); head.scale.set(1, 0.95, 1.1); tilt.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.25, 10), new THREE.MeshLambertMaterial({ color: base })); neck.position.y = -0.14; tilt.add(neck);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lam(0x5d5850)); snout.scale.set(1, 0.8, 1.2); snout.position.set(0, -0.02, -0.11); tilt.add(snout);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), lam(0x0d0d0d)); eye.position.set(sx * 0.055, 0.035, -0.075); tilt.add(eye); }
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
/** A wing: the arm (shoulder to wrist) and the hand (wrist to tip), each hinged so the wing flexes as it beats. */
interface Wing { arm: THREE.Object3D; hand: THREE.Object3D }
interface Bird {
  kind: BirdKind; g: THREE.Group; wings: [Wing, Wing]; p: THREE.Vector3; v: THREE.Vector3; flap: number; sit: boolean;
  dive: number; t: number; bank: number; glide: number; neck?: THREE.Object3D;
}
/**
 * Sizes, colours, cruising speed (m/s) and wingbeat (Hz). Western gull: wingspan 1.30–1.44 m (Wikipedia), white with a
 * slate-grey back and wings, black wingtips with white spots, yellow bill; beats about 3 Hz, glides and soars a lot,
 * 10–13 m/s. Brown pelican: wingspan 2.0–2.3 m (Wikipedia), grey-brown with dark flight feathers, the head white
 * (non-breeding, as most are on the Bay in summer and autumn) with a yellowish crown, held back on the shoulders in
 * flight; a few slow beats (about 2 Hz) then a long glide, in lines, low over the waves. Double-crested cormorant:
 * wingspan about 1.2 m, all black with an orange throat, neck stretched out, fast steady beats (about 4–5 Hz), low and
 * straight. (Wingbeat rates are typical figures for these birds, not measured here.)
 */
const BIRD = {
  gull: { body: 0xf4f4f0, back: 0x8a939c, tip: 0x1d1f22, bill: 0xe8c33a, span: 1.37, len: 0.6, speed: 11, hz: 3 },
  pelican: { body: 0x8d857a, back: 0x7b7266, tip: 0x2b2824, bill: 0xb89466, span: 2.15, len: 1.15, speed: 11, hz: 2 },
  cormorant: { body: 0x1f2023, back: 0x2b2c2e, tip: 0x17181a, bill: 0x3a3530, span: 1.2, len: 0.8, speed: 15, hz: 4.5 }
};
function birdMesh(kind: BirdKind): { g: THREE.Group; wings: [Wing, Wing]; neck?: THREE.Object3D } {
  const k = BIRD[kind], g = new THREE.Group(), L = k.len;
  // the body: a spindle, deepest at the breast (head toward −z)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7), lam(k.body)); body.scale.set(L * 0.27, L * 0.25, L); g.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), lam(k.back)); back.scale.set(L * 0.26, L * 0.2, L * 0.85); back.position.y = 0.01; g.add(back);
  // the tail: a short fan
  const tail = new THREE.Mesh(new THREE.ConeGeometry(L * 0.12, L * 0.32, 4), lam(kind === 'gull' ? k.body : k.back)); tail.rotation.x = -Math.PI / 2; tail.scale.set(1, 1, 0.25); // the fan at the back tail.position.z = L * 0.58; g.add(tail);
  // the head and bill (a pelican's head rests back on its shoulders; a cormorant's neck reaches forward)
  let neck: THREE.Object3D | undefined;
  if (kind === 'pelican') {
    const head = new THREE.Mesh(new THREE.SphereGeometry(L * 0.1, 8, 6), lam(0xf1ece0)); head.position.set(0, L * 0.16, -L * 0.36); g.add(head);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(L * 0.075, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xe9d58a)); crown.position.set(0, L * 0.19, -L * 0.36); g.add(crown);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(L * 0.045, L * 0.5, 5), lam(k.bill)); bill.rotation.x = -Math.PI / 2 - 0.12; bill.position.set(0, L * 0.12, -L * 0.62); g.add(bill);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), lam(0x6f6252)); pouch.scale.set(L * 0.06, L * 0.06, L * 0.36); pouch.position.set(0, L * 0.07, -L * 0.56); g.add(pouch);
  } else {
    neck = new THREE.Group(); neck.position.set(0, L * 0.05, -L * 0.42); g.add(neck);
    const nl = kind === 'cormorant' ? L * 0.34 : L * 0.12;
    const nk = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.06, L * 0.09, nl, 6), lam(k.body)); nk.rotation.x = Math.PI / 2; nk.position.z = -nl / 2; neck.add(nk);
    const head = new THREE.Mesh(new THREE.SphereGeometry(L * (kind === 'gull' ? 0.12 : 0.08), 8, 6), lam(k.body)); head.scale.z = 1.25; head.position.set(0, L * 0.02, -nl); neck.add(head);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(L * 0.025, L * (kind === 'gull' ? 0.15 : 0.13), 4), lam(k.bill)); bill.rotation.x = -Math.PI / 2; bill.position.set(0, L * 0.01, -nl - L * 0.16); neck.add(bill);
    if (kind === 'cormorant') { const thr = new THREE.Mesh(new THREE.SphereGeometry(L * 0.04, 6, 4), lam(0xd9822b)); thr.position.set(0, -L * 0.03, -nl - L * 0.05); neck.add(thr); }
  }
  // the wings: arm and hand, each a flat panel; the hand is narrower and pointed, the gull's tip black with a spot
  const half = k.span / 2 - L * 0.12, armL = half * 0.45, handL = half * 0.55, chord = k.span * (kind === 'pelican' ? 0.17 : 0.14);
  const panel = (len: number, c0: number, c1: number, color: number, sweep: number) => {
    const sh = new THREE.Shape(); sh.moveTo(0, -c0 * 0.35); sh.lineTo(len, -c1 * 0.35 + sweep); sh.lineTo(len, c1 * 0.65 + sweep); sh.lineTo(0, c0 * 0.65); sh.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })); m.rotation.x = Math.PI / 2; return m;
  };
  const wings = [-1, 1].map(sx => {
    const arm = new THREE.Group(); arm.position.set(sx * L * 0.1, L * 0.06, -L * 0.08); g.add(arm);
    const am = panel(armL, chord, chord * 0.95, k.back, 0); am.scale.x = sx; arm.add(am);
    const hand = new THREE.Group(); hand.position.x = sx * armL; arm.add(hand);
    const hm = panel(handL, chord * 0.95, chord * 0.35, k.back, chord * 0.25); hm.scale.x = sx; hand.add(hm);
    const tip = panel(handL * 0.4, chord * 0.62, chord * 0.33, k.tip, chord * 0.12); tip.scale.x = sx; tip.position.set(sx * handL * 0.6, 0.002, chord * 0.06); hand.add(tip);
    if (kind === 'gull') { const spot = new THREE.Mesh(new THREE.CircleGeometry(chord * 0.08, 6), lam(0xffffff)); spot.rotation.x = -Math.PI / 2; spot.position.set(sx * handL * 0.9, 0.004, chord * 0.2); hand.add(spot); }
    return { arm, hand };
  }) as unknown as [Wing, Wing];
  return { g, wings, neck };
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
    // a minute or so at the surface, then a dive of 3–7 minutes (typical harbor seal dives)
    for (const [la, lo] of SEAL_SPOTS) { const g = sealHead(r); g.visible = false; this.root.add(g); this.seals.push({ g, p: LL(la, lo), up: 40 + r() * 60, down: 180 + r() * 240, t: r() * 300 }); }
    // the Pier 39 floats, and the sea lions on them
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 6.5), lam(0x6d6a62)); f.position.set(i * 4.2 - 6, 0.15, 0); this.lions.add(f);
      for (let j = 0; j < 9; j++) { const s = seaLion(r); s.position.set(i * 4.2 - 6 + (r() - 0.5) * 2.6, 0.32, (r() - 0.5) * 5.6); s.rotation.y = r() * 6.28; this.lions.add(s); this.lionBodies.push(s); }
    }
    this.lions.position.copy(P3(PIER39.x, PIER39.y, 0)); this.lions.rotation.y = 12 * D2R; this.root.add(this.lions);
    // birds: gulls (some sitting on the water), a line of pelicans, a couple of cormorants
    const add = (kind: BirdKind, sit = false) => { const m = birdMesh(kind); this.root.add(m.g); this.birds.push({ kind, g: m.g, wings: m.wings, neck: m.neck, p: new THREE.Vector3(), v: new THREE.Vector3(), flap: r() * 6, sit, dive: 0, t: 0, bank: 0, glide: 0 }); };
    for (let i = 0; i < 5; i++) add('gull'); for (let i = 0; i < 4; i++) add('gull', true);
    for (let i = 0; i < 5; i++) add('pelican'); for (let i = 0; i < 2; i++) add('cormorant');
  }

  /** The month (1–12) sets the season: pelicans and sea lions come and go. */
  setMonth(month: number): void {
    if (month === this.month) return;
    this.month = month;
    const n = PIER39_COUNT[(month - 1 + 12) % 12];
    this.lionBodies.forEach((s, i) => { s.visible = i < n; });
    // brown pelicans are on the Bay from about June to November, after nesting in the south; a few linger into winter
    this.pelicans = month >= 6 && month <= 11 || (month === 5 || month === 12) && this.r() < 0.4;
  }
  private pelicans = false;

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
      if (a.t > 0 && a.t > 7 * (2 + (a.rolls % 3))) { a.t = -(a.dive = 30 + r() * 90); a.rolls++; } // two to four rolls, then a dive of half a minute to two
    }
    // harbor seals: a head up for half a minute or so, then down for a couple of minutes; down at once if you come close
    for (const s of this.seals) {
      s.t += dt; const cyc = s.t % (s.up + s.down);
      if (cyc < s.up && near(s.p, 25)) s.t += s.up - cyc; // into the dive
      const up = (s.t % (s.up + s.down)) < s.up;
      s.g.visible = up;
      if (up) {
        // bobbing with the waves, the nose tipped up, turning slowly to look about (toward the nearest boat, when one's about)
        const bob = Math.sin(t * 1.3 + s.p.x) * 0.03; s.g.position.copy(P3(s.p.x, s.p.y, sea(s.p.x, s.p.y) + 0.06 + bob));
        const b0 = boats.reduce((m, b) => (b.x - s.p.x) ** 2 + (b.y - s.p.y) ** 2 < (m.x - s.p.x) ** 2 + (m.y - s.p.y) ** 2 ? b : m, boats[0] ?? s.p);
        const look = (b0.x - s.p.x) ** 2 + (b0.y - s.p.y) ** 2 < 150 * 150 ? Math.atan2(b0.x - s.p.x, b0.y - s.p.y) : Math.sin(t * 0.15 + s.p.y) * 2;
        s.g.rotation.y += ((((-look - s.g.rotation.y) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 0.5);
        (s.g.userData.tilt as THREE.Group).rotation.x = 0.45 + Math.sin(t * 0.3 + s.p.x) * 0.15;
      }
    }
    // sea lions on the floats: heads up and down now and then
    for (const s of this.lionBodies) if (s.visible && r() < dt * 0.05) (s.userData.neck as THREE.Group).rotation.x = r() < 0.5 ? -0.7 : 0.3;
    this.lions.position.y = sea(PIER39.x, PIER39.y) * 0.4;
    // birds, around the boat you're watching
    const F = P3(focus.x, focus.y, 0), sea3 = (v: THREE.Vector3) => sea(v.x, -v.z);
    let pel = 0;
    const lead = this.birds.find(x => x.kind === 'pelican')!;
    for (const b of this.birds) {
      const k = BIRD[b.kind], w0 = b.v.clone();
      if (b.kind === 'pelican') {
        // a line of pelicans: in season, low over the waves (about a metre: ground effect) on a long straight pass
        b.g.visible = this.pelicans; if (!this.pelicans) continue;
        const i = pel++;
        if (i === 0) {
          if (b.t <= 0 || b.p.distanceTo(F) > 700) { // a new pass
            const a = r() * 6.28, d = 450; b.p.set(F.x + Math.cos(a) * d, 1.2, F.z + Math.sin(a) * d);
            const aim = new THREE.Vector3(F.x + (r() - 0.5) * 120, 0, F.z + (r() - 0.5) * 120); b.v.copy(aim.sub(b.p).setY(0).normalize().multiplyScalar(k.speed)); b.t = 90;
          }
          b.t -= dt; b.p.addScaledVector(b.v, dt); b.p.y = sea3(b.p) + 1.1 + Math.sin(t * 0.5) * 0.25;
        } else if (b.dive > 0) {
          // a plunge for a fish: up to 10–15 m, a twisting fall bill-first into the water, a few seconds sitting on the
          // surface swallowing, then a run back up to the line
          b.dive -= dt; const T = 9 - b.dive;
          if (T < 2.5) { b.p.addScaledVector(b.v, dt * 0.6); b.p.y += (12 - b.p.y) * dt * 1.2; }
          else if (T < 3.6) { b.p.addScaledVector(b.v, dt * 0.3); b.p.y = Math.max(sea3(b.p) - 0.3, b.p.y - 16 * dt); }
          else if (T < 7) { b.p.y = sea3(b.p) + 0.15; }
          else { b.p.y += (sea3(b.p) + 1.1 - b.p.y) * dt * 2; b.p.addScaledVector(b.v, dt * 1.2); }
          if (b.dive <= 0) b.t = -1; // rejoin
        } else {
          const back = lead.v.clone().normalize(), slot = lead.p.clone().addScaledVector(back, -3.4 * i).add(new THREE.Vector3(back.z, 0, -back.x).multiplyScalar(1.1 * i));
          // fly to its place in the line (a bird that has just been fishing catches up)
          const to = slot.sub(b.p).setY(0); b.v.copy(lead.v).addScaledVector(to, Math.min(1.5, b.t < 0 ? 0.6 : 2));
          if (to.length() < 2) b.t = 1;
          b.p.addScaledVector(b.v, dt); b.p.y = sea3(b.p) + 1.1 + Math.sin(t * 0.7 + i) * 0.2;
          if (r() < dt * 0.008) b.dive = 9;
        }
        // a few slow beats, then a long glide (followers take the rhythm from the leader, a beat behind each)
        const diving = b.dive > 0 && 9 - b.dive < 3.6 && 9 - b.dive > 2.5, sitting = b.dive > 0 && 9 - b.dive >= 3.6 && 9 - b.dive < 7;
        b.glide = (t - i * 0.4) % 7; const beating = b.glide < 1.6 || (b.dive > 0 && !sitting && !diving);
        if (beating) b.flap += dt * k.hz * Math.PI * 2;
        this.pose(b, w0, dt, sitting ? 'sit' : diving ? 'dive' : beating ? Math.sin(b.flap) * 0.5 : 0.02);
        continue;
      }
      if (b.sit) {
        // a gull resting on the water: lifts off when a boat comes close, or when it drifts out of the picture
        if (b.t <= 0 || b.p.distanceTo(F) > 450) { const a = r() * 6.28, d = 60 + r() * 220; b.p.set(F.x + Math.cos(a) * d, 0, F.z + Math.sin(a) * d); b.t = 1; b.v.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.01); }
        const wp = { x: b.p.x, y: -b.p.z };
        if (!this.isWater(wp)) { b.t = 0; b.g.visible = false; continue; }
        b.g.visible = true; b.p.y = sea(wp.x, wp.y) + 0.05;
        if (near(wp, 22)) { b.sit = false; b.v.set((r() - 0.5) * 8, 3, (r() - 0.5) * 8); b.t = 20; }
        this.pose(b, w0, dt, 'sit');
        continue;
      }
      // flying: gulls wheel round the boat, gliding and soaring with spells of flapping; cormorants fly fast and
      // straight, a metre or two above the water, beating all the way
      b.g.visible = true;
      if (b.t <= 0 || b.p.distanceTo(F) > 600) {
        const a = r() * 6.28, d = b.kind === 'cormorant' ? 400 : 80 + r() * 200;
        b.p.set(F.x + Math.cos(a) * d, b.kind === 'cormorant' ? 1.5 : 10 + r() * 20, F.z + Math.sin(a) * d);
        const head = b.kind === 'cormorant' ? Math.atan2(F.z - b.p.z, F.x - b.p.x) + (r() - 0.5) * 0.6 : r() * 6.28;
        b.v.set(Math.cos(head) * k.speed, 0, Math.sin(head) * k.speed); b.t = b.kind === 'cormorant' ? 60 : 30 + r() * 30;
      }
      b.t -= dt;
      let wing: number;
      if (b.kind === 'gull') {
        // wheeling: turning slowly one way then the other, rising and sinking; sometimes dropping to sit on the water
        b.v.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.3 * Math.sin(t * 0.1 + b.flap * 0.01));
        b.v.y = (15 - b.p.y) * 0.1 + Math.sin(t * 0.5 + b.p.x) * 0.6;
        if (b.t < 2 && b.t > 0 && r() < dt * 0.3) { b.sit = true; b.t = 1; }
        // spells of flapping (a few seconds) between glides, more when climbing
        b.glide += dt; const flapping = (b.glide % 9) < 2.5 + Math.max(0, b.v.y) * 2;
        if (flapping) b.flap += dt * k.hz * Math.PI * 2;
        wing = flapping ? Math.sin(b.flap) * 0.55 : 0.12 + 0.04 * Math.sin(t * 2 + b.p.z); // gliding: wings level, a slight lift
      } else {
        b.v.y = (sea3(b.p) + 1.6 - b.p.y) * 0.8;
        b.flap += dt * k.hz * Math.PI * 2; wing = Math.sin(b.flap) * 0.6;
      }
      b.p.addScaledVector(b.v, dt);
      this.pose(b, w0, dt, wing);
    }
  }

  /**
   * Place a bird and set its wings. `wing`: the beat angle (rad, + up), or a posture. It banks into its turns as a
   * flying bird must: tan(bank) = v·ω / g, from how fast its heading is turning.
   */
  private pose(b: Bird, vPrev: THREE.Vector3, dt: number, wing: number | 'sit' | 'dive'): void {
    b.g.position.copy(b.p);
    const sp = Math.hypot(b.v.x, b.v.z);
    if (sp > 0.05) {
      const h = Math.atan2(b.v.x, b.v.z), hp = Math.atan2(vPrev.x, vPrev.z), om = dt > 0 ? (((h - hp + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) / dt : 0;
      const bank = typeof wing === 'number' ? Math.atan(sp * om / 9.81) : 0;
      b.bank += (Math.max(-0.8, Math.min(0.8, bank)) - b.bank) * Math.min(1, dt * 4);
      b.g.rotation.set(0, h + Math.PI, 0, 'YXZ');
      b.g.rotation.x = wing === 'dive' ? -1.3 : Math.atan2(b.v.y, sp) * 0.5; // nose down in a plunge, a little with the climb
      b.g.rotation.z = b.bank; // + rolls the right wing up: a left turn
    }
    const [L, R] = b.wings;
    if (wing === 'sit' || wing === 'dive') {
      // folded: the arm back along the body, the hand tucked over it (in a plunge, swept right back)
      for (const [w, sx] of [[L, -1], [R, 1]] as const) { w.arm.rotation.set(0, -sx * 1.4, -sx * 0.12); w.hand.rotation.set(0, -sx * 0.15, 0); }
      if (b.neck) b.neck.rotation.x = wing === 'sit' ? 0.5 : 0;
      return;
    }
    // the beat: the arm swings through the angle, the hand follows a moment later (it lags, and flexes up on the
    // upstroke), the wing sweeping back a little at the top
    const lag = Math.sin(b.flap - 0.6) * 0.35 * Math.min(1, Math.abs(wing) * 3);
    for (const [w, sx] of [[L, -1], [R, 1]] as const) {
      w.arm.rotation.set(0, -sx * 0.08 * Math.max(0, wing), sx * wing); // (+ about z lifts the right wing)
      w.hand.rotation.set(0, 0, sx * (lag + (b.kind === 'gull' ? -0.12 : 0))); // a gull's hand droops a little: the gull-wing bend
    }
    if (b.neck) b.neck.rotation.x = 0;
  }
}
