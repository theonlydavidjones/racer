/**
 * A count up/down number picker (the owner, 21 Nov 2026: "not a slider, just a count up down number picker"): − and +
 * either side of the number. Used for a start sequence's minutes, in Practice and the start drill alike.
 */
export function numPickHtml(key: string, n: number, min: number, max: number, unit: string, label: string): string {
  return `<span class="numpick" data-np="${key}" role="group" aria-label="${label}"><button type="button" data-d="-1" aria-label="One less"${n <= min ? ' disabled' : ''}>−</button><b>${n}</b><small>${unit}</small><button type="button" data-d="1" aria-label="One more"${n >= max ? ' disabled' : ''}>+</button></span>`;
}
/** The picker's step from a click: its key and −1 or +1, or null for a click elsewhere. */
export function numPickStep(e: Event): { key: string; d: number } | null {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.numpick button[data-d]'), p = b?.closest<HTMLElement>('[data-np]');
  return b && p && !b.disabled ? { key: p.dataset.np!, d: +b.dataset.d! } : null;
}
/** A start sequence's minutes, kept to 1–5 (and at least `min`). */
export const seqMinutes = (n: number, min = 1): number => Math.max(min, Math.min(5, Math.round(n) || 5));
