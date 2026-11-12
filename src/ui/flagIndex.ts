import { pennantCanvas, signalCanvas, type IndexSignal } from '../render/flags';
import { PREP_MEANING, type Flag, type PrepFlag } from '../sim/signals';

/**
 * The flag index (the chase-view layout's Flags tile, owner 12 Nov 2026): every signal on the Race Signals page of the
 * Racing Rules of Sailing 2025–2028, in the page's order, with its meaning word for word and its sounds, and which are
 * flying now. Source: World Sailing, "The Racing Rules of Sailing 2025–2028 with Changes and Corrections" (July 2025),
 * Race Signals (inside front cover), read by the researcher 12 Nov 2026; the rules they point to from the same book.
 * "The meanings of the visual and sound signals stated in Race Signals shall not be changed except under rule
 * 86.1(b)" (rule 25.2). Sounds as the page writes them: ↑ shown, ↓ removed, • a sound, — a long sound, – – – – –
 * repeated sounds.
 */
interface Row { flags: IndexSignal[]; name: string; sound: string; meaning: string; more?: string; pennants?: boolean }

const PREP_MORE = (p: PrepFlag) => { const t = PREP_MEANING[p].replace(/^[A-Za-z ]+?(?: \((Rule [^)]*)\))?: /, (_m, r?: string) => (r ? r + ': ' : '')); return t[0].toUpperCase() + t.slice(1); };
const SECTIONS: [string, Row[]][] = [
  // (the class flag isn't on the Race Signals page: rule 26's starting signals)
  ['The start (rule 26)', [
    { flags: ['class'], name: 'Class flag (F, Folkboats)', sound: '↑ • ↓ •', meaning: 'Warning signal: displayed with one sound five minutes before the starting signal (or as the notice of race or sailing instructions say: the sequence you chose in Setup); removed with one sound, the starting signal.', more: 'Rule 26: times are taken from the visual signals; the absence of a sound signal is disregarded. A minute after it, the preparatory flag below; at one minute, the preparatory flag comes down with one long sound.' }
  ]],
  ['Postponement signals', [
    { flags: ['AP'], name: 'AP (answering pennant)', sound: '↑ •• ↓ •', meaning: 'Races not started are postponed. The warning signal will be made 1 minute after removal unless at that time the race is postponed again or abandoned.' },
    { flags: ['AP', 'H'], name: 'AP over H', sound: '↑ ••', meaning: 'Races not started are postponed. Further signals ashore.' },
    { flags: ['AP', 'A'], name: 'AP over A', sound: '↑ ••', meaning: 'Races not started are postponed. No more racing today.' },
    { flags: ['AP'], pennants: true, name: 'AP over a numeral pennant 1–9', sound: '↑ •• ↓ •', meaning: 'Postponement of 1-9 hours from the scheduled starting time.' }
  ]],
  ['Abandonment signals', [
    { flags: ['N'], name: 'N', sound: '↑ ••• ↓ •', meaning: 'All races in progress are abandoned. Return to the starting area. The warning signal will be made 1 minute after removal unless at that time the race is abandoned again or postponed.' },
    { flags: ['N', 'H'], name: 'N over H', sound: '↑ •••', meaning: 'All races in progress are abandoned. Further signals ashore.' },
    { flags: ['N', 'A'], name: 'N over A', sound: '↑ •••', meaning: 'All races in progress are abandoned. No more racing today.' },
    { flags: ['V'], name: 'V', sound: '↑ —', meaning: 'Monitor communication channel for safety instructions (see rule 37).' }
  ]],
  ['Preparatory signals (↑ • ↓ —)', [
    { flags: ['P'], name: 'P', sound: '', meaning: 'Preparatory signal.', more: PREP_MORE('P') },
    { flags: ['I'], name: 'I', sound: '', meaning: 'Rule 30.1 is in effect.', more: PREP_MORE('I') },
    { flags: ['Z'], name: 'Z', sound: '', meaning: 'Rule 30.2 is in effect.', more: PREP_MORE('Z') },
    { flags: ['U'], name: 'U', sound: '', meaning: 'Rule 30.3 is in effect.', more: PREP_MORE('U') },
    { flags: ['black'], name: 'Black flag', sound: '', meaning: 'Rule 30.4 is in effect.', more: PREP_MORE('black') }
  ]],
  ['Recall signals', [
    { flags: ['X'], name: 'X', sound: '↑ •', meaning: 'Individual recall.', more: 'Rule 29.1: flown when, at the start, a boat is over (or must comply with rule 30.1), until each has come back completely below the line or its extensions, but no later than four minutes after the start. If you\'re over, go back and start.' },
    { flags: ['sub1'], name: 'First Substitute', sound: '↑ •• ↓ •', meaning: 'General recall. The warning signal will be made 1 minute after removal.', more: 'Rule 29.2: when the committee can\'t identify the boats over, or the starting procedure went wrong.' }
  ]],
  ['Shortened course', [
    { flags: ['S'], name: 'S', sound: '↑ ••', meaning: 'The course has been shortened. Rule 32.2 is in effect.', more: 'Rule 32.2: the finishing line is then, at a rounding mark, between the mark and a staff displaying flag S.' }
  ]],
  ['Changing the next leg', [
    { flags: ['C'], name: 'C', sound: '– – – – –', meaning: 'The position of the next mark has been changed: to starboard (a green triangle); to port (a red rectangle); to decrease the length of the leg (–); to increase the length of the leg (+).', more: 'Rule 33: signalled before boats begin the leg, with the new compass bearing or the triangle or rectangle.' }
  ]],
  ['Other signals', [
    { flags: ['L'], name: 'L', sound: '↑ •', meaning: 'Ashore: A notice to competitors has been posted. Afloat: Come within hail or follow this vessel.' },
    { flags: ['M'], name: 'M', sound: '– – – – –', meaning: 'The object displaying this signal replaces a missing mark.' },
    { flags: ['Y'], name: 'Y', sound: '↑ •', meaning: 'Wear a personal flotation device (see rule 40).' },
    { flags: ['orange'], name: 'Orange flag', sound: '', meaning: 'The staff displaying this flag is one end of the starting line.' },
    { flags: ['blue'], name: 'Blue flag', sound: '', meaning: 'The staff displaying this flag is one end of the finishing line.' }
  ]]
];

const canvasOf = (src: HTMLCanvasElement, w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(src, 0, 0, w, h); return c; };

/** Fill the index: what's flying now first, then every signal on the page; the course number in numeral pennants. */
export function fillFlagIndex(el: HTMLElement, o: { flying: Flag[]; prep: PrepFlag; course: number | null }): void {
  el.innerHTML = '';
  const h4 = (t: string) => { const h = document.createElement('h4'); h.textContent = t; el.appendChild(h); };
  const flying = (r: Row) => r.flags.every(f => (o.flying as string[]).includes(f)) && !(r.flags.length === 1 && (r.flags[0] === 'AP' || r.flags[0] === 'N') && o.flying.includes('A'));
  const row = (r: Row, note = '') => {
    const d = document.createElement('div'), now = !r.pennants && flying(r); d.className = 'fi-row' + (now ? ' now' : '');
    const pic = document.createElement('div'); pic.className = 'fi-pic';
    r.flags.forEach((f, i) => pic.appendChild(canvasOf(signalCanvas(f), 108, 72 - (i ? 12 : 0)))); // ("over": the second flag under the first)
    if (r.pennants) pic.appendChild(canvasOf(pennantCanvas('1'), 108, 54));
    const t = document.createElement('div');
    t.innerHTML = `<b></b>${now ? '<span class="fi-now">Flying</span>' : ''}${note ? `<span class="fi-now fi-race">${note}</span>` : ''}${r.sound ? ` <span class="fi-snd"></span>` : ''}<br>`;
    t.querySelector('b')!.textContent = r.name; const snd = t.querySelector('.fi-snd'); if (snd) snd.textContent = r.sound;
    t.appendChild(document.createTextNode(r.meaning));
    if (r.more) { const m = document.createElement('div'); m.className = 'fi-more'; m.textContent = r.more; t.appendChild(m); }
    d.append(pic, t); el.appendChild(d);
  };
  const intro = document.createElement('p'); intro.className = 'fi-intro';
  intro.textContent = 'The Racing Rules of Sailing 2025–2028, Race Signals. ↑ shown, ↓ removed, • one sound, — a long sound, – – – – – repeated sounds. Over a class flag, a signal applies only to that class.';
  el.appendChild(intro);
  for (const [title, rows] of SECTIONS) { h4(title); for (const r of rows) row(r, r.flags[0] === o.prep && r.flags.length === 1 ? 'This race' : ''); }
  h4('Numeral pennants: the course number');
  const pin = document.createElement('div'); pin.style.marginBottom = '8px';
  pin.textContent = `The Seaweed Soup sailing instructions fly the course number in these with the warning signal, read top to bottom; over AP, a pennant is a postponement of that many hours.${o.course != null ? ` Flying now: course ${o.course}.` : ''}`;
  el.appendChild(pin);
  const pens = document.createElement('div'); pens.className = 'fi-pens';
  for (let d = 0; d <= 9; d++) { const p = document.createElement('div'); p.appendChild(canvasOf(pennantCanvas(String(d)), 88, 44)); p.appendChild(document.createTextNode(String(d))); pens.appendChild(p); }
  el.appendChild(pens);
}
