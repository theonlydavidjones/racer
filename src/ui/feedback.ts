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
