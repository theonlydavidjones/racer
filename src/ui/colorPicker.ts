/**
 * The boat editor's one color picker (the owner, 8i: "a color picker for everything ideally, with ability to add hex
 * codes, and some smarts to save a few custom color chips (like in Google Docs)"; approved as design/boat-editor): a
 * hue-and-shade field, a hue strip, a hex field, the class's usual colors, and your own saved colors, which every
 * picker shares (Settings.myColors, kept with your account). Pure HTML and color math here; boatPanel.ts handles the
 * pointer and keeps the value.
 */
import { ROPES, type Rope } from '../boat/spec';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** #rrggbb → hue (0–360), saturation and value (0–1). */
export function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
/** Hue (0–360), saturation and value (0–1) → #rrggbb. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (k: number) => { const kk = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** The picker, open under a color's row: `key` names the color it sets. */
export function pickerHtml(key: string, hex: string, presets: [string, string][], mine: string[], clear?: string): string {
  const [h, s, v] = isHex(hex) ? hexToHsv(hex) : [0, 0, 1];
  const chip = (act: string, name: string, c: string) => `<button type="button" class="be-ps${c.toLowerCase() === hex.toLowerCase() ? ' on' : ''}" data-cp="${act}" data-v="${c}" style="background:${c}" title="${esc(name)}" aria-label="${esc(name)}"></button>`;
  return `<div class="be-picker" data-key="${key}">
    <div class="be-sv" data-cp="sv" style="background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${h.toFixed(0)},100%,50%))"><i style="left:${(s * 100).toFixed(1)}%;top:${((1 - v) * 100).toFixed(1)}%"></i></div>
    <div class="be-hue" data-cp="hue"><i style="left:${(h / 360 * 100).toFixed(1)}%"></i></div>
    <div class="be-hexrow"><input class="pick" data-cp="hex" value="${esc(isHex(hex) ? hex.toUpperCase() : '')}" placeholder="#RRGGBB" maxlength="7" spellcheck="false" aria-label="Hex color">${clear ? `<button type="button" class="ghost sm${isHex(hex) ? '' : ' on'}" data-cp="clear">${esc(clear)}</button>` : ''}</div>
    <div class="be-prow"><b>Folkboat colors</b>${presets.map(([n, c]) => chip('preset', n, c)).join('')}</div>
    <div class="be-prow"><b>Your colors</b>${mine.map(c => chip('preset', c.toUpperCase(), c)).join('')}<button type="button" class="be-ps add" data-cp="save" title="Save this color to your colors" aria-label="Save this color">+</button></div>
  </div>`;
}

/** A rope as drawn: its braid (the cover's crossing strands) and the colorway's fleck or tracers. */
export function ropeSvg(r: Pick<Rope, 'base' | 'kind' | 'mark'>, w = 46, h = 14): string {
  let s = `<svg class="be-rope" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect width="${w}" height="${h}" fill="${r.base}"/>`;
  for (let x = -h; x < w; x += 4) s += `<path d="M${x} 0L${x + h} ${h}" stroke="rgba(0,0,0,.13)" stroke-width="1.2"/><path d="M${x + h} 0L${x} ${h}" stroke="rgba(255,255,255,.10)" stroke-width="1"/>`;
  if (r.kind === 'fleck' && r.mark) { let q = 7; const rnd = () => (q = (q * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < w * 0.55; i++) { const x = rnd() * w, y = rnd() * h; s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l2.2 2.2" stroke="${r.mark}" stroke-width="1.6" stroke-linecap="round"/>`; } }
  if (r.kind === 'tracer' && r.mark) for (let x = -h; x < w; x += 12) s += `<path d="M${x} 0L${x + h} ${h}" stroke="${r.mark}" stroke-width="1.5"/>`;
  return s + `<rect width="${w}" height="${h}" fill="url(#beRopeShade)"/></svg>`;
}
/** The shading every rope shares (drawn once in the panel). */
export const ROPE_SHADE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="beRopeShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs></svg>`;

/** The colorways to choose from, open under a line's row. */
export function ropesHtml(line: string, cur: string | undefined): string {
  return `<div class="be-ropes" data-line="${line}">${ROPES.map(r => `<button type="button" class="${r.id === cur ? 'on' : ''}" data-act="rope" data-line="${line}" data-v="${r.id}">${ropeSvg(r, 40, 13)}${esc(r.name)}</button>`).join('')}</div>`;
}
