import './three-setup';
import * as THREE from 'three';
import { dist } from '../core/math';
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
  // Golden Gate Bridge
  {
    const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const st = LL(37.8116, -122.4777), nt = LL(37.8256, -122.4790);
    [st, nt].forEach(p => { const t = new THREE.Mesh(new THREE.BoxGeometry(22, 227, 14), red); t.position.copy(P3(p.x, p.y, 113)); scene.add(t); });
    const mid = { x: (st.x + nt.x) / 2, y: (st.y + nt.y) / 2 }, len = dist(st, nt), ang = Math.atan2(nt.x - st.x, nt.y - st.y);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(27, 6, len + 1400), red); deck.position.copy(P3(mid.x, mid.y, 67)); deck.rotation.y = -ang; scene.add(deck);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 2, len), red); cab.position.copy(P3(mid.x, mid.y, 160)); cab.rotation.y = -ang; scene.add(cab);
  }
}
