/**
 * Where her outboard sits, in her own frame (bow toward −z, starboard +x, y up from the waterline; m), for the physics
 * (the off-center thrust and the leg's drag act there) and the drawing (render/outboard.ts builds the motor and its
 * sliding bracket from MOUNT_X, and tests/outboard.test.ts checks its prop is drawn where OUTBOARD_PROP says).
 *
 * The bracket's on the after deck on the port quarter, clear of the rudder, the tiller and the ensign staff (the class
 * allows "the permanent part mounted on the aft deck": NFIA Technical Committee, March 2006, folkboat.com/clarifications);
 * its board slides down to put the anti-ventilation plate 0.1–0.15 m under. The offset and the travel are estimates: no
 * Folkboat bracket's dimensions were found.
 */
/** The motor's centerline: 0.42 m to port of hers. */
export const MOUNT_X = -0.42;
/**
 * The prop's hub with the motor let down to run, by motor: x on the mount's line, y below the water, z aft of her middle
 * (her transom's top is 3.82 m aft of it: the prop about 0.33 m further aft, hung off the bracket).
 */
export const OUTBOARD_PROP: Record<2.5 | 3.5 | 6, { x: number; y: number; z: number }> = {
  2.5: { x: MOUNT_X, y: -0.215, z: 4.153 },
  3.5: { x: MOUNT_X, y: -0.215, z: 4.153 },
  6: { x: MOUNT_X, y: -0.167, z: 4.176 }
};

/**
 * Whether her stern carries the bracket at all (owner: "just take the whole mount off if the motor is stowed ashore"):
 * fitted while the motor's on it, and while it's stowed below from it mid-sail (the bracket left on, empty and raised); with
 * no motor aboard (her spec has none, or it's left ashore, as for a race: spec 'stowed', no motor state), a clean transom.
 */
export function bracketFitted(b: { spec?: { perf: { outboard?: string } }; motor?: object }): boolean {
  if (b.spec?.perf.outboard === 'bracket') return true;
  const m = b.motor as { stowed?: boolean; shifting?: unknown } | undefined; // (stowed and shifting: Crew Controls' Stow / Ship)
  return !!m && (!m.stowed || !!m.shifting);
}
