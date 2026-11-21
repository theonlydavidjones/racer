/**
 * The setup's one picture for a boat or a person (the owner OK'd design/setup-tight, 13 Nov 2026): a tile in the boat's
 * hull colour with her sail number big and her country small over it, her name under it (sailors in a fleet go by sail
 * numbers: CLAUDE.md); a person, the same tile round, in the club's colour, with their initials. As a button it's a
 * choice (lit when chosen, dim when someone else has it); as a span, a picture in a summary.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The club's colour for its members' tiles. */
export const CLUB_TILE = '#24467a';
/** Black or white, whichever reads on the colour (#rrggbb). */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return '#fff';
  const n = parseInt(m[1], 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#13202b' : '#fff';
}
/** A sail number split for the tile: "USA 87" → ['USA', '87']; "87" → ['', '87']. */
export function splitNo(no: string): [string, string] {
  const m = /^([A-Z]{2,3})\s+(.+)$/.exec(no.trim()); return m ? [m[1], m[2]] : ['', no.trim()];
}
/** Initials for a person's tile: "You" stays YOU; "Sam Okafor" → SO; "Crew 1" → C1. */
export function initials(name: string): string {
  if (name === 'You') return 'YOU';
  return name.trim().split(/\s+/).map(x => /^\d+$/.test(x) ? x : x[0]).join('').slice(0, 3).toUpperCase();
}
export interface TileOpts {
  /** The country, small over the number (a boat). */
  country?: string;
  /** Round (a person). */
  round?: boolean;
  /** A ring of the boat's tag colour, inside the edge. */
  ring?: string;
  /** Chosen (lit). */
  on?: boolean;
  /** Someone else's (dim). */
  dim?: boolean;
  /** As a button: its data attributes (key → value), and its hover text. */
  data?: Record<string, string>;
  title?: string;
  disabled?: boolean;
}
/** A tile: `big` inside (a sail number, initials), `name` under it, on `colour`. */
export function tile(big: string, name: string, colour: string, o: TileOpts = {}): string {
  const cls = `t-av${o.round ? ' round' : ''}${o.on ? ' on' : ''}${o.dim ? ' dim' : ''}`;
  const face = `<span class="t-tile" style="background:${esc(colour)};color:${inkOn(colour)}${o.ring ? `;box-shadow:inset 0 0 0 3px ${esc(o.ring)}` : ''}">${o.country ? `<i class="t-ctry">${esc(o.country)}</i>` : ''}${esc(big)}</span><small>${esc(name)}</small>`;
  if (!o.data) return `<span class="${cls}"${o.title ? ` title="${esc(o.title)}"` : ''}>${face}</span>`;
  const attrs = Object.entries(o.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button type="button" class="${cls}"${attrs}${o.on != null ? ` aria-pressed="${!!o.on}"` : ''}${o.title ? ` title="${esc(o.title)}"` : ''}${o.disabled ? ' disabled' : ''}>${face}</button>`;
}
/** An empty place, dashed: "+" to add (`add`), or "–" for nobody. */
export function emptyTile(label: string, add: boolean, o: { round?: boolean; on?: boolean; data?: Record<string, string>; title?: string } = {}): string {
  const cls = `t-av${o.round ? ' round' : ''}${o.on ? ' on' : ''}`, face = `<span class="t-tile t-add">${add ? '+' : '–'}</span><small>${esc(label)}</small>`;
  if (!o.data) return `<span class="${cls}">${face}</span>`;
  const attrs = Object.entries(o.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button type="button" class="${cls}"${attrs}${o.on != null ? ` aria-pressed="${!!o.on}"` : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${face}</button>`;
}
