import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { LAND, onLand } from '../geo/shore';
import { P3 } from './coords';

/** Stylized visual references: Cityfront land, Marin, Angel Island, Alcatraz, the city, Coit Tower,
 * the yacht clubs, Fort Mason piers and the Golden Gate Bridge. Visual only. */
export function addLandscape(scene: THREE.Scene): void {
  // Cityfront land
  const s = new THREE.Shape();
  LAND.forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
  const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8c9a76 })));

  const hillLL = (lat: number, lon: number, w: number, hgt: number, col: number) => {
    const p = LL(lat, lon), m = new THREE.Mesh(new THREE.ConeGeometry(w, hgt, 8, 1), new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
    m.position.copy(P3(p.x, p.y, hgt / 2)); m.scale.z = 0.7; m.rotation.y = Math.random() * 3; scene.add(m); return m;
  };
  const boxLL = (lat: number, lon: number, w: number, d: number, hgt: number, col: number, rot = 0) => {
    const p = LL(lat, lon), m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshLambertMaterial({ color: col }));
    m.position.copy(P3(p.x, p.y, hgt / 2 + 2)); m.rotation.y = rot; scene.add(m); return m;
  };
  // Marin, Angel Island, Alcatraz
  [[37.832, -122.492, 900, 260], [37.840, -122.505, 900, 300], [37.850, -122.485, 800, 240], [37.858, -122.495, 900, 280], [37.872, -122.470, 700, 180], [37.880, -122.455, 600, 150]]
    .forEach(h => hillLL(h[0], h[1], h[2], h[3], 0x5b7560));
  hillLL(37.8609, -122.4326, 1000, 240, 0x587259);
  {
    const p = LL(37.82623, -122.42214);
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(120, 170, 40, 9), new THREE.MeshLambertMaterial({ color: 0x8a8670, flatShading: true }));
    isl.position.copy(P3(p.x, p.y, 16)); scene.add(isl);
    boxLL(37.8267, -122.4225, 120, 30, 30, 0xd8d2c0);
  }
  // city: Presidio, Pacific Heights, Russian & Telegraph Hills (with Coit Tower)
  hillLL(37.7960, -122.4600, 900, 110, 0x667a5c);
  for (let lon = -122.452; lon <= -122.424; lon += 0.006) hillLL(37.7915, lon, 450, 110, 0x9c9a8e);
  hillLL(37.8010, -122.4190, 380, 90, 0xa29e90);
  hillLL(37.8024, -122.4058, 300, 85, 0xa29e90);
  {
    const p = LL(37.8024, -122.4058), t = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 64, 10), new THREE.MeshLambertMaterial({ color: 0xece4d2 }));
    t.position.copy(P3(p.x, p.y, 85 + 32)); scene.add(t);
  }
  for (let i = 0; i < 90; i++) {
    const lat = 37.7985 + Math.random() * 0.0055, lon = -122.448 + Math.random() * 0.022;
    if (!onLand(LL(lat, lon))) continue;
    boxLL(lat, lon, 18 + Math.random() * 14, 18 + Math.random() * 14, 8 + Math.random() * 10, 0xe2ddd2);
  }
  for (let i = 0; i < 40; i++) { const lat = 37.789 + Math.random() * 0.008, lon = -122.405 + Math.random() * 0.012; boxLL(lat, lon, 30, 30, 40 + Math.random() * 160, 0xcfd2d2); }
  // waterfront: St. Francis YC, Golden Gate YC (with its race-deck flagpole), Fort Mason piers
  boxLL(37.8079, -122.4466, 40, 18, 9, 0xf1ede2);
  boxLL(37.8090, -122.4433, 16, 12, 6, 0xf4f1ea);
  {
    const p = LL(37.80925, -122.44325), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    pole.position.copy(P3(p.x, p.y, 9)); scene.add(pole);
  }
  [-122.43185, -122.43025, -122.42875].forEach(lon => boxLL(37.8091, lon, 26, 150, 14, 0xd9cfb8));
  buildBridge(scene);
}

/* ---------- the Golden Gate Bridge ---------- */

/** Lights that come on at dusk: the towers' red aviation lights and the roadway lamps. */
export const bridgeLights: THREE.Object3D[] = [];

/**
 * The Golden Gate Bridge from its published dimensions: a 1,280 m main span between towers 227 m above the
 * water, 343 m side spans to the anchorages, the roadway about 67 m up at mid-span on a deep stiffening
 * truss, two main cables (0.92 m thick) sagging about 143 m, vertical suspenders every 15 m, and the towers'
 * stepped legs tied by art-deco portal struts above the roadway and X-bracing below it. International Orange.
 * The centre point is the published one (37.8197° N, 122.4786° W); the axis runs a little west of north.
 */
function buildBridge(scene: THREE.Scene): void {
  const ORANGE = new THREE.MeshPhongMaterial({ color: 0xc0362c, specular: 0x331a10, shininess: 12 });
  const DARK = new THREE.MeshPhongMaterial({ color: 0x8e2a22, shininess: 6 }); // recesses and shade
  const CONCRETE = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  const centre = LL(37.81972, -122.47861), bearing = 351.8;
  const g = new THREE.Group();
  const b = bearing * Math.PI / 180, ax = Math.sin(b), ay = Math.cos(b);
  g.position.set(centre.x, 0, -centre.y); g.rotation.y = Math.atan2(ax, -ay); // local z runs along the bridge (south → north), x across, y up
  scene.add(g);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = ORANGE) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const HALF_SPAN = 640, SIDE = 343, LEG_X = 14.5, TOP = 227, SADDLE = 224, MID_CABLE = 81;
  const deckY = (z: number) => 67 - 6 * Math.min(1, (z / HALF_SPAN) ** 2) - (Math.abs(z) > HALF_SPAN ? 4 * (Math.abs(z) - HALF_SPAN) / SIDE : 0);
  for (const tz of [-HALF_SPAN, HALF_SPAN]) {
    // the pier and its fender at the waterline
    box(64, 12, 34, 0, 4, tz, CONCRETE);
    // two legs, stepping in as they rise
    const steps: [number, number, number, number][] = [[0, 82, 11, 17], [82, 128, 10, 15], [128, 172, 9, 13], [172, TOP, 8, 11]];
    for (const sx of [-1, 1]) for (const [y0, y1, wx, dz] of steps) box(wx, y1 - y0, dz, sx * LEG_X, (y0 + y1) / 2, tz);
    // portal struts above the roadway, each with darker recessed panels (the art-deco look)
    for (const [y, h] of [[96, 9], [134, 8], [170, 8], [205, 7], [TOP - 3, 6]] as const) {
      box(LEG_X * 2 - 6, h, 9, 0, y, tz);
      for (const px of [-7, 0, 7]) box(3.2, h * 0.6, 0.6, px, y, tz + 4.6, DARK), box(3.2, h * 0.6, 0.6, px, y, tz - 4.6, DARK);
    }
    // X-bracing between the legs below the roadway
    for (const sgn of [-1, 1]) { const br = box(2.6, 70, 3, 0, 32, tz); br.rotation.z = sgn * Math.atan2(LEG_X * 2, 60); }
    // red aviation lights on the tower tops
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); l.position.set(sx * LEG_X, TOP + 2, tz); l.visible = false; g.add(l); bridgeLights.push(l); }
  }
  // anchorages at each end
  for (const z of [-(HALF_SPAN + SIDE), HALF_SPAN + SIDE]) box(50, 40, 45, 0, 20, z, CONCRETE);
  // the roadway on its stiffening truss: a deck slab, and truss sides drawn on transparent panels
  const LEN = 2 * (HALF_SPAN + SIDE) + 120, N = 120;
  const deckGeo = (yOff: number, h: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) { const z = -LEN / 2 + LEN * i / N, y = deckY(z) + yOff; pos.push(0, y - h / 2, z, 0, y + h / 2, z); uv.push(z / 15.2, 0, z / 15.2, 1); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  };
  const tc = document.createElement('canvas'); tc.width = 128; tc.height = 64; const t2 = tc.getContext('2d')!;
  t2.strokeStyle = '#c0362c'; t2.lineWidth = 7; t2.beginPath(); t2.moveTo(0, 4); t2.lineTo(128, 4); t2.moveTo(0, 60); t2.lineTo(128, 60); t2.moveTo(0, 60); t2.lineTo(64, 4); t2.lineTo(128, 60); t2.moveTo(64, 4); t2.lineTo(64, 60); t2.stroke();
  const trussTex = new THREE.CanvasTexture(tc); trussTex.wrapS = THREE.RepeatWrapping; trussTex.anisotropy = 4;
  const trussMat = new THREE.MeshLambertMaterial({ map: trussTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) { const side = new THREE.Mesh(deckGeo(-3.8, 7.6), trussMat); side.position.x = sx * 13.7; g.add(side); }
  { // the roadway: a flat strip 27 m wide on top of the truss
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) { const z = -LEN / 2 + LEN * i / N, y = deckY(z) + 1; pos.push(-13.7, y, z, 13.7, y, z); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0x55504c, side: THREE.DoubleSide })));
  }
  // main cables: a parabola across the main span, nearly straight down to the anchorages; suspenders every 15.2 m
  const cableY = (z: number) => {
    const a = Math.abs(z);
    if (a <= HALF_SPAN) return MID_CABLE + (SADDLE - MID_CABLE) * (z / HALF_SPAN) ** 2;
    const f = (a - HALF_SPAN) / SIDE; return SADDLE + (deckY(HALF_SPAN + SIDE) + 8 - SADDLE) * f - 14 * f * (1 - f);
  };
  const susp: number[] = [];
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) { const z = -(HALF_SPAN + SIDE) + 2 * (HALF_SPAN + SIDE) * i / 160; pts.push(new THREE.Vector3(sx * LEG_X, cableY(z), z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.95, 6, false), ORANGE));
    for (let z = -(HALF_SPAN + SIDE) + 8; z < HALF_SPAN + SIDE - 8; z += 15.2) {
      if (Math.abs(Math.abs(z) - HALF_SPAN) < 6) continue;
      const top = cableY(z), bot = deckY(z) + 1; if (top - bot > 2) susp.push(sx * LEG_X, top, z, sx * LEG_X, bot, z);
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(susp, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xa8382c })));
  // roadway lamps, lit at dusk
  const lamps: number[] = [];
  for (let z = -LEN / 2 + 20; z < LEN / 2 - 20; z += 50) for (const sx of [-1, 1]) lamps.push(sx * 12.5, deckY(z) + 9, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lp = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffc56a, size: 2.2, sizeAttenuation: false, fog: false })); lp.visible = false; g.add(lp); bridgeLights.push(lp);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}
