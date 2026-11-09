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

let toastT = 0;
export function toast(msg: string, ms = 2500): void {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = window.setTimeout(() => el.classList.remove('show'), ms);
}
