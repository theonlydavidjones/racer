import { n360, wrap } from '../core/math';

/**
 * The compass, top centre (r272, the owner, 20 Nov 2026, after six rounds of stills: G3 with the H2 tint): a tape on a
 * plain band with the pods' rounded corners, her heading in its middle (the ticks part round it, a small amber notch
 * above and below), numbers every 30° (N E S W at the cardinals) and small ones on the 10° ticks, the true wind's
 * direction (blue ▼) and the next mark or destination (amber ◆) on its top edge, or an arrow at its end when off it.
 * Close-hauled and settled, a soft tint from her tack's mean close-hauled heading (a small tick) to her heading: the HUD's
 * lifted colour, light, or its headed colour, dark (apart in lightness too, so it reads without colour); lifted or
 * headed, the heading's digits take that colour (headed, a lighter red that reads). The tape keeps 3.6 px a degree whatever its width: 75° each side at 560 px.
 */
const FONT = '"Saira Semi Condensed","Arial Narrow",system-ui,sans-serif';
export const LIFTED = '#8fe0bd', HEADED = '#b03e34', HEADED_TEXT = '#ff8c7e';
export function drawCompass(ctx: CanvasRenderingContext2D, W: number, H: number, h: number, from: number, markB: number | null,
  tint: { mean: number; lifted: boolean; alpha: number } | null, shift: 'lift' | 'head' | null): void {
  ctx.clearRect(0, 0, W, H);
  // the band: one even, slightly see-through fill, the pods' corners
  ctx.fillStyle = 'rgba(10,24,34,.62)'; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(150,196,218,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(0.5, 0.5, W - 1, H - 1, 5); ctx.stroke();
  const x0 = W / 2, half = W / 2 - 10, span = (75 * W) / 560, k = half / span, X = (a: number) => x0 + wrap(a - h) * k;
  const hdg = String(Math.round(n360(h)) % 360).padStart(3, '0') + '°';
  ctx.font = `700 21px ${FONT}`; const gap = ctx.measureText(hdg).width / 2 + 9;
  // the lift/header tint, behind the ticks; the mean a small tick
  if (tint) {
    const a = X(tint.mean), b = X(h);
    ctx.fillStyle = tint.lifted ? `rgba(143,224,189,${(0.16 * tint.alpha).toFixed(3)})` : `rgba(176,62,52,${(0.24 * tint.alpha).toFixed(3)})`;
    ctx.fillRect(Math.min(a, b), 13, Math.abs(b - a), 18);
    ctx.strokeStyle = `rgba(233,242,245,${(0.85 * tint.alpha).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a, H - 9); ctx.lineTo(a, H - 1); ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (let d = Math.ceil((h - span) / 5) * 5; d <= h + span; d += 5) {
    const x = X(d); if (Math.abs(x - x0) < gap) continue; // (the ticks part round the heading)
    const big = d % 30 === 0, mid = d % 10 === 0, len = big ? 12 : mid ? 8 : 5, n = n360(d);
    ctx.strokeStyle = big ? '#e9f2f5' : mid ? 'rgba(233,242,245,.75)' : 'rgba(233,242,245,.42)'; ctx.lineWidth = big ? 1.6 : 1;
    ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x, 15 + len); ctx.stroke();
    if (!big && mid && Math.abs(x - x0) > gap + 14) { ctx.fillStyle = 'rgba(169,188,198,.75)'; ctx.font = `600 8.5px ${FONT}`; ctx.fillText(String(n).padStart(3, '0'), x, H - 5); }
    if (big && Math.abs(x - x0) > Math.max(gap, 22)) {
      const t = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[n] ?? String(n).padStart(3, '0'), card = /^[NESW]$/.test(t);
      ctx.fillStyle = card ? '#ffffff' : '#a9bcc6'; ctx.font = `700 ${card ? 12 : 10.5}px ${FONT}`; ctx.fillText(t, x, H - 4);
    }
  }
  // the wind (blue ▼) and the mark (amber ◆) on the top edge, or an arrow at the end when off the tape
  const at = (b: number, col: string, wind: boolean) => {
    const d = wrap(b - h), off = Math.abs(d) > span, x = off ? x0 + Math.sign(d) * half : X(b), y = 8;
    if (!off && Math.abs(x - x0) < gap) return; // (not over the heading)
    ctx.fillStyle = col; ctx.strokeStyle = '#08141e'; ctx.lineWidth = 1.2; ctx.beginPath();
    if (off) { const s = Math.sign(d); ctx.moveTo(x, y - 6); ctx.lineTo(x + 8 * s, y); ctx.lineTo(x, y + 6); }
    else if (wind) { ctx.moveTo(x - 6, y - 5); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x, y + 5); }
    else { ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  at(from, '#5ab8ff', true); if (markB != null) at(markB, '#ffb627', false);
  // her heading, in the middle: lifted in the lifted color, headed in a red light enough to read on the band (the owner, 20 Nov)
  ctx.font = `700 21px ${FONT}`; ctx.fillStyle = shift === 'lift' ? LIFTED : shift === 'head' ? HEADED_TEXT : '#ffffff'; ctx.fillText(hdg, x0, 30);
  ctx.fillStyle = '#ffb627';
  ctx.beginPath(); ctx.moveTo(x0 - 5, 0); ctx.lineTo(x0 + 5, 0); ctx.lineTo(x0, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x0 - 5, H); ctx.lineTo(x0 + 5, H); ctx.lineTo(x0, H - 6); ctx.fill();
}
