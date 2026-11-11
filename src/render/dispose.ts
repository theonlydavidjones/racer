import * as THREE from 'three';

type Res = THREE.BufferGeometry | THREE.Material | THREE.Texture;
/** The geometries, materials and textures (in the materials' maps and uniforms) the objects under these roots draw with. */
export function resourcesOf(roots: THREE.Object3D[]): Set<Res> {
  const out = new Set<Res>();
  const tex = (v: unknown) => { if (v && (v as THREE.Texture).isTexture) out.add(v as THREE.Texture); };
  const mat = (m: THREE.Material) => {
    if (out.has(m)) return; out.add(m);
    for (const v of Object.values(m)) tex(v);
    const u = (m as THREE.ShaderMaterial).uniforms; if (u) for (const k in u) tex(u[k]?.value);
  };
  for (const r of roots) r.traverse(o => {
    const g = (o as THREE.Mesh).geometry; if (g) out.add(g);
    const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach(mat);
  });
  return out;
}

/**
 * Free the GPU memory of objects taken out of the scene (the last race's boats and marks): everything they drew with
 * that nothing left under `live` still uses. three.js keeps a removed object's buffers, shaders' uniforms and textures
 * on the GPU until they're disposed, so without this every new race (and every change in the setup, which builds a
 * new one) left the old fleet's geometry and sail pictures behind.
 */
export function disposeUnused(removed: THREE.Object3D[], live: THREE.Object3D): void {
  if (!removed.length) return;
  const keep = resourcesOf([live]);
  for (const r of resourcesOf(removed)) if (!keep.has(r)) r.dispose();
}
