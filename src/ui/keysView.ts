import { $ } from './dom';
import { ACTIONS, keyLabel, type Action, type KeyMap } from './keys';

/** Keyboard settings: see every binding; click a key to change it (then press the new key); reset to defaults. */
export class KeysView {
  private listening: Action | null = null;
  constructor(private map: KeyMap, private onChange: () => void) {
    $('bKeysClose').onclick = () => this.close();
    $('bKeysDone').onclick = () => this.close();
    $('bKeysReset').onclick = () => { this.map.reset(); this.note('Keys reset to the defaults.'); this.render(); this.onChange(); };
    $('keysList').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button[data-a]') as HTMLButtonElement | null;
      if (!b) return;
      this.listening = b.dataset.a as Action;
      this.note(`Press the key for "${ACTIONS.find(a => a.id === this.listening)!.label}". Esc cancels.`);
      this.render();
    });
    // capture phase, so the game never sees a key you're assigning
    addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (this.listening) { this.listening = null; this.note(''); this.render(); } else this.close(); return; }
      if (!this.listening) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      const a = this.listening; this.listening = null;
      const stolen = this.map.bind(a, e.key);
      this.note(stolen ? `${keyLabel(e.key)} now does "${ACTIONS.find(x => x.id === a)!.label}". It no longer does "${ACTIONS.find(x => x.id === stolen)!.label}".` : `${keyLabel(e.key)} now does "${ACTIONS.find(x => x.id === a)!.label}".`);
      this.render(); this.onChange();
    }, true);
  }
  get isOpen(): boolean { return !$('keysView').hidden; }
  open(): void { $('keysView').hidden = false; this.listening = null; this.note(''); this.render(); }
  close(): void { $('keysView').hidden = true; this.listening = null; }
  private note(t: string): void { $('keysNote').textContent = t; }
  private render(): void {
    const groups = [...new Set(ACTIONS.map(a => a.group))];
    $('keysList').innerHTML = groups.map(g => `<div class="kgroup"><div class="eyebrow">${g}</div>` + ACTIONS.filter(a => a.group === g).map(a =>
      `<div class="krow${this.listening === a.id ? ' listening' : ''}"><span class="klab">${a.label}</span>` +
      `<button class="kkeys" type="button" data-a="${a.id}" title="Click, then press the new key">${this.listening === a.id ? '<span class="knone">Press a key…</span>' : this.map.keys[a.id].map(k => `<kbd>${keyLabel(k)}</kbd>`).join('') || '<span class="knone">none</span>'}</button></div>`).join('') + '</div>').join('');
  }
}
