import type { Vec } from '../core/math';
import { toLL } from '../geo/geo';
import bottom from './data/bottom.json';
import { tideHeightAt } from './tide';

/**
 * The bottom where a keel could touch it, and the water over it: for running aground on depth.
 *
 * The Bay's shoal water from NOAA's chart (data/bottom.json, scripts/make-bottom.mjs): each depth area's band, with the
 * chart's soundings in it interpolated, on a 50 m grid, read here bilinearly between the cells' centers so the depth
 * under her has no steps as she sails over it. Only where the chart's band starts shallower than 3 m: deeper water
 * no Folkboat touches at any tide, and it reads as null (as do land and water off the chart).
 *
 * The water over the bottom is its depth below MLLW (the chart's datum) plus the tide's height there (tide.ts
 * tideHeightAt: each bay's own station on its grid, San Francisco's elsewhere). A drying flat's bottom is above the
 * datum (a negative depth): dry until the tide rises over it.
 */
const J = bottom as unknown as { box: { south: number; north: number; west: number; east: number }; cell: number; tile: number; nx: number; ny: number; step: number; offset: number; tiles: [number, number, string][] };
const B = J.box, CELL = J.cell, TILE = J.tile, MLAT = 111320, MLON = 111320 * Math.cos((B.south + B.north) / 2 * Math.PI / 180);
/** Deeper than this (m below MLLW) the chart's water isn't kept: shoal cells next to it are read against it. */
const DEEP = 3;
const PACKED = new Map(J.tiles.map(([ti, tj, s]) => [ti * 4096 + tj, s]));
const TILES = new Map<number, Float32Array | null>();
/** A tile's cells (m below MLLW; NaN where not shoal), unpacked the first time it's asked for. */
function tile(ti: number, tj: number): Float32Array | null {
  const key = ti * 4096 + tj;
  let t = TILES.get(key);
  if (t === undefined) {
    const s = PACKED.get(key);
    if (!s) t = null;
    else {
      const raw = atob(s), g = new Float32Array(TILE * TILE).fill(NaN);
      for (let r = 0, k = 0; r < raw.length && k < g.length; r++) {
        const v = raw.charCodeAt(r);
        if (v === 0) { k += raw.charCodeAt(++r); continue; } // (a run of cells that aren't shoal)
        g[k++] = (v - 1) * J.step + J.offset;
      }
      t = g;
    }
    TILES.set(key, t);
  }
  return t;
}
/** One cell's bottom (m below MLLW), or NaN if it isn't shoal water. */
function cell(i: number, j: number): number {
  if (i < 0 || j < 0 || i >= J.nx || j >= J.ny) return NaN;
  const t = tile(Math.floor(i / TILE), Math.floor(j / TILE));
  return t ? t[(j % TILE) * TILE + (i % TILE)] : NaN;
}

/** The bottom's depth below MLLW at p (m; negative on a flat that dries that high), or null where the water's deep. */
export function bottomDepth(p: Vec): number | null {
  const { lat, lon } = toLL(p);
  const fx = (lon - B.west) * MLON / CELL - 0.5, fy = (B.north - lat) * MLAT / CELL - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const a = cell(i, j), b = cell(i + 1, j), c = cell(i, j + 1), d = cell(i + 1, j + 1);
  if (Number.isNaN(a) && Number.isNaN(b) && Number.isNaN(c) && Number.isNaN(d)) return null;
  // (a neighbor that isn't shoal is read as the deep water's edge: the depth runs smoothly out toward it)
  const k = (x: number) => Number.isNaN(x) ? DEEP : x;
  const z = (k(a) * (1 - u) + k(b) * u) * (1 - v) + (k(c) * (1 - u) + k(d) * u) * v;
  return z >= DEEP ? null : z;
}
/** The water's depth over the bottom at p at a time (ms UTC), m (0 on a dry flat), or null where it's deep water. */
export function waterOver(p: Vec, ms: number): number | null {
  const z = bottomDepth(p);
  return z === null ? null : Math.max(0, z + tideHeightAt(p, ms));
}
