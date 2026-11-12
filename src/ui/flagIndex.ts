import { flagCanvas, pennantCanvas } from '../render/flags';
import { FLAG_NAME, PREP_MEANING, type Flag, type PrepFlag } from '../sim/signals';

/**
 * The flag index (the chase-view layout's Flags tile, owner 12 Nov 2026): every flag the race committee can fly in this
 * sim, what it means under the Racing Rules of Sailing 2025–2028, and which are flying now. For learning the flags:
 * the tile shows what's up, the index says what each one means.
 */
const MEANING: Record<Flag, string> = {
  class: 'The warning signal (Rule 26): up with one sound at the start of the sequence, down with one sound at the start. Your class is next.',
  ...PREP_MEANING,
  X: 'Individual recall (Rule 29.1): flown at the start, with one sound, when boats are over early. If you\'re over, go back and start.',
  // the postponement and abandonment signals (RRS 2025–2028, Race Signals; signals.ts cancelSignal flies them over A)
  AP: 'Postponement (Race Signals): races not started are postponed, with two sounds. The warning signal is made 1 minute after it comes down (one sound), unless the race is postponed again or abandoned then. Over A: all races not started are postponed; no more racing today.',
  N: 'Abandonment (Race Signals): all races that have started are abandoned, with three sounds. Return to the starting area; the warning signal is made 1 minute after it comes down. Over A: all races are abandoned; no more racing today.',
  A: 'Flown under AP or N (Race Signals): no more racing today.'
};
const PREPS: PrepFlag[] = ['P', 'I', 'Z', 'U', 'black'];

const canvasOf = (src: HTMLCanvasElement, w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(src, 0, 0, w, h); return c; };

/** Fill the index: the flags in this race's sequence first, the others after; the course number in numeral pennants. */
export function fillFlagIndex(el: HTMLElement, o: { flying: Flag[]; prep: PrepFlag; course: number | null }): void {
  el.innerHTML = '';
  const h4 = (t: string) => { const h = document.createElement('h4'); h.textContent = t; el.appendChild(h); };
  const row = (f: Flag, note = '') => {
    const r = document.createElement('div'), now = o.flying.includes(f); r.className = 'fi-row' + (now ? ' now' : '');
    r.appendChild(canvasOf(flagCanvas(f), 108, 72));
    const d = document.createElement('div'), name = FLAG_NAME[f];
    d.innerHTML = `<b>${name[0].toUpperCase() + name.slice(1)}${note}</b>${now ? '<span class="fi-now">Flying</span>' : ''}<br>`;
    // (the preparatory flags' meanings start with their own name, "I (Rule 30.1): …": the name's in bold already)
    const text = f === 'class' || f === 'X' ? MEANING[f] : MEANING[f].replace(/^[A-Za-z ]+?(?: \((Rule [^)]*)\))?: /, (_m, r?: string) => (r ? r + ': ' : ''));
    d.appendChild(document.createTextNode(text[0].toUpperCase() + text.slice(1)));
    r.appendChild(d); el.appendChild(r);
  };
  h4('This race\'s start sequence'); row('class'); row(o.prep, ' (preparatory)');
  h4('After the start'); row('X');
  h4('The other preparatory flags'); for (const p of PREPS) if (p !== o.prep) row(p);
  h4('Calling it off'); row('AP'); row('N'); row('A');
  h4('Numeral pennants: the course number');
  const intro = document.createElement('div'); intro.style.marginBottom = '8px';
  intro.textContent = `Flown with the warning signal, read top to bottom.${o.course != null ? ` Flying now: course ${o.course}.` : ''}`;
  el.appendChild(intro);
  const pens = document.createElement('div'); pens.className = 'fi-pens';
  for (let d = 0; d <= 9; d++) { const p = document.createElement('div'); p.appendChild(canvasOf(pennantCanvas(String(d)), 88, 44)); p.appendChild(document.createTextNode(String(d))); pens.appendChild(p); }
  el.appendChild(pens);
}
