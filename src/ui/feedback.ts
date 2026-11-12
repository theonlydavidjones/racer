import { $ } from './dom';

let AC: AudioContext | null = null;
export const sound = { on: true };

/** Committee-boat horn: two detuned sawtooths through a low-pass. */
export function horn(dur: number): void {
  if (!sound.on) return;
  try {
    AC = AC || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const t0 = AC.currentTime, g = AC.createGain(), f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1100;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.04); g.gain.setValueAtTime(0.16, t0 + dur); g.gain.linearRampToValueAtTime(0, t0 + dur + 0.12);
    [233, 236.5].forEach(fr => { const o = AC!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(t0); o.stop(t0 + dur + 0.2); });
    f.connect(g); g.connect(AC.destination);
  } catch { /* no audio */ }
}

/**
 * A message's headline, for the one line it gets on screen (the owner, 12 Nov 2026: one-line messages, the full text in
 * the log). The words before a colon when they say something on their own ("Sight the line: from the…" → "Sight the
 * line"); otherwise the first sentence, or its first clause before a bracket or a semicolon. An abbreviation's full stop
 * ("St. Francis", "Pt. Bonita") isn't a sentence's end. `cut`: whether there's more in the log.
 */
export function headline(msg: string): { head: string; cut: boolean } {
  const s = msg.trim();
  const stop = (t: string): string => {
    for (let i = 0; i < t.length - 1; i++) {
      const c = t[i], n = t[i + 1];
      if ((c === '.' || c === '!' || c === '?') && n === ' ') {
        if (c === '.' && /\b(St|Pt|Mt|Ft|No|vs|approx|e\.g|i\.e)$/i.test(t.slice(0, i))) continue; // (an abbreviation)
        return t.slice(0, c === '.' ? i : i + 1);
      }
      if ((c === ' ' && n === '(') || c === ';') return t.slice(0, i);
    }
    return t.replace(/\.$/, '');
  };
  const colon = s.indexOf(': ');
  // (a colon early on: what comes before it is the headline if it's more than a word or two, "Weather helm"; "Crew"
  // alone says nothing, so then the clause runs on past the colon)
  let head = colon > 0 && colon < 40 && colon >= 12 && !/\(/.test(s.slice(0, colon)) ? s.slice(0, colon) : stop(s);
  head = head.replace(/[,.:]$/, '').trim();
  if (head.length > 70) { const cut = head.lastIndexOf(' ', 68); head = head.slice(0, cut > 30 ? cut : 68).replace(/[,.:;]$/, '') + '…'; }
  return { head, cut: head !== s && head + '.' !== s };
}

/** Everything the game has told you, with race time, so nothing is lost when a message fades. */
export interface LogEntry { t: number | null; msg: string }
export const messageLog: LogEntry[] = [];
let clock: () => number | null = () => null;
let onLog: () => void = () => {};
export function setLogClock(f: () => number | null, changed: () => void): void { clock = f; onLog = changed; }
export function logMessage(msg: string): void {
  messageLog.push({ t: clock(), msg });
  if (messageLog.length > 300) messageLog.shift();
  onLog();
}

/**
 * Tell the player something: it goes into the log, and so becomes the Messages card's newest line, lit for a moment (the
 * chase-view layout, 12 Nov: no box floating over the view). `ms`: how long it matters, for callers; the flash is 2 s.
 */
export function toast(msg: string, _ms = 2500): void {
  logMessage(msg);
  const li = $('msgRecent').firstElementChild as HTMLElement | null;
  if (li) { li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); }
}
