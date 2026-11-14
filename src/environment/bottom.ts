import type { Vec } from '../core/math';
import { toLL } from '../geo/geo';
import bottom from './data/bottom.json';
import { tideHeightAt } from './tide';
import { hazardNear } from './hazards';

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
/** A cell with no depth area (land, or water the chart doesn't sound): left out of the read, not taken as deep. */
const LAND = 255;
/** The tiles, densely by (ti, tj): each its packed cells, or none where there's no shoal water (most of the Bay). */
const TNX = Math.ceil(J.nx / TILE), TNY = Math.ceil(J.ny / TILE), PACKED: (string | null)[] = new Array(TNX * TNY).fill(null);
for (const [ti, tj, s] of J.tiles) PACKED[tj * TNX + ti] = s;
const TILES: (Float32Array | null | undefined)[] = new Array(TNX * TNY).fill(undefined);
/** A tile's cells (m below MLLW; NaN where not shoal), unpacked the first time it's asked for. (Every boat asks, every step.) */
function tile(ti: number, tj: number): Float32Array | null {
  const key = tj * TNX + ti;
  let t = TILES[key];
  if (t === undefined) {
    const s = PACKED[key];
    if (!s) t = null;
    else {
      const raw = atob(s), g = new Float32Array(TILE * TILE).fill(NaN);
      for (let r = 0, k = 0; r < raw.length && k < g.length; r++) {
        const v = raw.charCodeAt(r);
        if (v === 0) { k += raw.charCodeAt(++r); continue; } // (a run of known deep cells: NaN)
        if (v === LAND) { const n = raw.charCodeAt(++r); g.fill(Infinity, k, k + n); k += n; continue; } // (a run with no depth area: land, or unsounded)
        g[k++] = (v - 1) * J.step + J.offset;
      }
      t = g;
    }
    TILES[key] = t;
  }
  return t;
}
/** One cell's bottom (m below MLLW); NaN if it's known deep (or in a tile with no shoal water); Infinity if it has no depth area. */
function cell(i: number, j: number): number {
  if (i < 0 || j < 0 || i >= J.nx || j >= J.ny) return NaN;
  const ti = (i / TILE) | 0, tj = (j / TILE) | 0, s = TILES[tj * TNX + ti];
  const t = s === undefined ? tile(ti, tj) : s;
  return t ? t[(j % TILE) * TILE + (i % TILE)] : NaN;
}

/** The bottom's depth below MLLW at p (m; negative on a flat that dries that high), or null where the water's deep. */
export function bottomDepth(p: Vec): number | null {
  const { lat, lon } = toLL(p);
  const fx = (lon - B.west) * MLON / CELL - 0.5, fy = (B.north - lat) * MLAT / CELL - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  // (the quick no: the four cells round p all in tiles with no shoal water, as almost everywhere a boat sails)
  if (i >= 0 && j >= 0 && i + 1 < J.nx && j + 1 < J.ny && !PACKED[((j / TILE) | 0) * TNX + ((i / TILE) | 0)] && !PACKED[(((j + 1) / TILE) | 0) * TNX + (((i + 1) / TILE) | 0)] && !PACKED[((j / TILE) | 0) * TNX + (((i + 1) / TILE) | 0)] && !PACKED[(((j + 1) / TILE) | 0) * TNX + ((i / TILE) | 0)]) return null;
  const a = cell(i, j), b = cell(i + 1, j), c = cell(i, j + 1), d = cell(i + 1, j + 1);
  if (Number.isNaN(a) && Number.isNaN(b) && Number.isNaN(c) && Number.isNaN(d)) return null;
  // (a known deep neighbor is read as the deep water's edge, so the depth runs smoothly out toward it; one with no depth
  // area, land, is left out and the others weighed up: the flat runs on to the shore as it is, not deepening at the beach)
  let s = 0, w = 0;
  const add = (x: number, k: number) => { if (x === Infinity || k <= 0) return; s += k * (Number.isNaN(x) ? DEEP : x); w += k; };
  add(a, (1 - u) * (1 - v)); add(b, u * (1 - v)); add(c, (1 - u) * v); add(d, u * v);
  if (w <= 0) return null; // (land all round: the sim's own shore decides there)
  const z = s / w;
  return z >= DEEP ? null : z;
}
/** The water's depth over the bottom at p at a time (ms UTC), m (0 on a dry flat), or null where it's deep water. */
export function waterOver(p: Vec, ms: number): number | null {
  const z = bottomDepth(p);
  return z === null ? null : Math.max(0, z + tideHeightAt(p, ms));
}
/** The water a boat's planner keeps under her keel (m): the chart's bands smoothed into 50 m cells, and the waves' troughs. */
export const SHOAL_MARGIN = 0.3;
/**
 * Too shallow for her at p at a time (ms UTC): less water than `draft` (m: her keel upright, boat/ground.ts GROUND.draft)
 * and SHOAL_MARGIN, over the bottom there, or over a charted rock, wreck or obstruction within `clear` m of p
 * (environment/hazards.ts: a route sampled every so many meters would step over a rock a few meters across). For the
 * AI's routes, as onLand is for the shore. False in deep water (and off the chart).
 */
export function shoal(p: Vec, ms: number, draft: number, clear = 0): boolean {
  const w = waterOver(p, ms);
  if (w !== null && w < draft + SHOAL_MARGIN) return true;
  const H = hazardNear(p, clear);
  return H !== null && H.top + tideHeightAt(p, ms) < draft + SHOAL_MARGIN;
}
