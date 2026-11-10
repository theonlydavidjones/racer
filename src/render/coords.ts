import * as THREE from 'three';

/** Sim (x east, y north, z up) → three.js (x right, y up, z toward the viewer = south). */
export const P3 = (x: number, y: number, z = 0): THREE.Vector3 => new THREE.Vector3(x, z, -y);
