import * as THREE from 'three';

/**
 * A boat's small fittings (cleats, blocks, winches, tracks, shackles, the crew's hands...) drawn only while they cover
 * at least a pixel. Each is its own draw call, about 150 a boat, so a fleet across the course cost over a thousand
 * draw calls for parts too small to show: a 5 cm cleat is under a pixel beyond about 60 m, a 20 cm winch beyond 250 m.
 * Below a pixel a part either isn't drawn at all or lands on a pixel or two at random (it shimmers), so leaving it out
 * changes nothing you can see. The hull, the rig and the sails are never left out, and nor is anything with moving
 * geometry (sheets, telltales, flags: drawn whatever their bounds say). Parts are hidden by their render layer, not
 * `visible`, so the boat's own show-and-hide (the pole, the jib bag, the helm in the cockpit view) is untouched.
 */
export const SMALL = 0.5; // m: the largest part (its bounding sphere's radius) ever left out
const MIN_PX = 1; // the least it must cover on the screen (its diameter, in device pixels)
/** The parts (bounding radius, m) boatMesh merges into a set of their own, left out as its largest would be: cleats,
 *  blocks, shackles, the winches' handles. (Larger fittings are few triangles and seen from far off: merged with the hull's
 *  parts, drawn always; a set for each size costs more draw calls than it saves triangles.) */
export const PART_SMALL = 0.08;
interface Item { o: THREE.Mesh; r: number; c: THREE.Vector3; mask: number }
const v = new THREE.Vector3();
export class FittingCull {
  private items: Item[] = [];
  /** The boats now in the scene (their groups). */
  set(groups: THREE.Object3D[]): void {
    this.items = [];
    for (const g of groups) {
      g.updateMatrixWorld(true);
      const gs = g.matrixWorld.getMaxScaleOnAxis() || 1;
      g.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.frustumCulled === false || !m.geometry) return;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const s = m.geometry.boundingSphere!, r = s.radius * m.matrixWorld.getMaxScaleOnAxis() / gs;
        // (a set of parts merged into one mesh, or what's seen only through a small opening (the cabin's inside, through
        // its windows and companionway): left out as the part, or the opening, would be, wherever the whole spans)
        const cullR = m.userData.cullR as number | undefined;
        if (cullR !== undefined) this.items.push({ o: m, r: cullR / (m.matrixWorld.getMaxScaleOnAxis() / gs || 1), c: s.center.clone(), mask: m.layers.mask });
        else if (r <= SMALL) this.items.push({ o: m, r: s.radius, c: s.center.clone(), mask: m.layers.mask });
      });
    }
  }
  /** Before drawing: leave out the parts that would be under a pixel from this camera (`height`: the picture's, in device pixels). */
  update(camera: THREE.PerspectiveCamera, height: number): void {
    // a sphere of radius r at distance d covers 2r · height / (2 tan(fov/2) · d) pixels
    const k = height * (camera.zoom || 1) / Math.tan(camera.fov * Math.PI / 360), cp = camera.position;
    for (const it of this.items) {
      const mw = it.o.matrixWorld, d = v.copy(it.c).applyMatrix4(mw).distanceTo(cp), rw = it.r * mw.getMaxScaleOnAxis();
      const show = rw * k >= MIN_PX * Math.max(d, 1e-3);
      it.o.layers.mask = show ? it.mask : 0;
    }
  }
}

/** The least a boat's part must measure (its bounding sphere's radius, m) to cast a shadow worth drawing. */
const CAST_MIN = 0.25;
/**
 * A boat's shadows from the parts that show in them (the hull, keel, rudder, mast, boom, sails, crew: the shadows a
 * sailor sees on deck and on the water), not from her small fittings: a cleat's or a block's shadow is under a pixel of
 * the sun's shadow map (2048 texels over its patch of sea), but each was a draw call in the shadow pass, about 235 of a
 * start's 1,150 a frame. Every part still receives shadows.
 */
export function boatShadows(g: THREE.Object3D): void {
  g.updateMatrixWorld(true);
  const gs = g.matrixWorld.getMaxScaleOnAxis() || 1;
  g.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    m.receiveShadow = true;
    if (m.userData.cullR !== undefined) { m.castShadow = false; return; } // (a merged set of small parts: FittingCull's)
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    m.castShadow = m.geometry.boundingSphere!.radius * m.matrixWorld.getMaxScaleOnAxis() / gs >= CAST_MIN;
  });
}
