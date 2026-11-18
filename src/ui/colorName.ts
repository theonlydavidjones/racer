/** A paint's name for a hex: the swatch's own name if it matches, else the nearest named swatch when it is close enough
 * to read as that color, else "Custom" (a color picked off the wheel must not leave a blank in the boat's particulars). */
export function colorName(list: readonly (readonly [string, string])[], hex: string): string {
  const rgb = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const c = rgb(hex); if (!c) return 'Custom';
  let best = '', bd = Infinity;
  for (const [name, h] of list) {
    const s = rgb(h); if (!s) continue;
    const d = Math.hypot(c[0] - s[0], c[1] - s[1], c[2] - s[2]);
    if (d < bd) { bd = d; best = name; }
  }
  return bd <= 40 ? best : 'Custom'; // (about a shade apart in sRGB; further reads as its own color)
}

/** The bottom's line: its paint, then how long since it was cleaned: only the parts that exist, joined with a comma. */
export function bottomLine(paint: string, cleanedWeeks: number): string {
  return [paint, cleanedWeeks ? `cleaned ${cleanedWeeks} wk ago` : 'just cleaned'].filter(Boolean).join(', ');
}
