/**
 * Tools: everything that shows on the game surface, one press away (the owner, 15 Nov 2026: "a lot of really cool
 * shit we've built, like wind-in-air and wind-over-sails, but it's hard to find these things"; built from
 * design/features-tray with the owner's changes: labeled Tools, compact, Hail left at the top level). A button in the top
 * bar opens a small tray of icon tiles: each does what its key does, shows its key, and is lit while its feature is on;
 * a dashed tile is an action, not a switch. Time's speed is the tray's last row.
 */
export interface Tool {
  id: string; label: string; icon: string;
  /** Its key's label, as Keys has it now (rebindable). */
  key: () => string;
  /** Whether it's on (a switch); none for an action. */
  on?: () => boolean;
  act: () => void;
  /** Left out when there's nothing to show (a boat with no cabin-top instrument). */
  hidden?: () => boolean;
}
const svg = (d: string) => `<svg viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;
/** 20×20 line icons, as the top bar's. */
export const TOOL_ICONS = {
  wind: '<path d="M3 7h9a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 11h12a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 15h6"/>',
  flow: '<path d="M4 4c5 1 8 5 9 12"/><path d="M8 3c4 2 6 6 7 12"/><path d="M3 9c3 1 5 3 6 7"/>',
  band: '<path d="M5 3v14M10 3v14M15 3v14"/><path d="M3.5 7h3M8.5 12h3M13.5 9h3"/>',
  chart: '<path d="M3 5l4-2 6 2 4-2v12l-4 2-6-2-4 2Z"/><path d="M7 3v12M13 5v12"/>',
  inst: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M7 12l2-4 2 3 2-2"/>',
  lights: '<path d="M7 15h6"/><path d="M8 17h4"/><path d="M10 3a5 5 0 0 0-3 9v1h6v-1a5 5 0 0 0-3-9Z"/>',
  paddle: '<path d="M4 16 13 7"/><path d="M12 4l4 4-3 3-4-4Z"/>',
  log: '<path d="M6 5h10M6 10h10M6 15h10"/><path d="M3 5h.5M3 10h.5M3 15h.5"/>',
  perf: '<path d="M4 16V9M8 16V5M12 16v-8M16 16v-5"/>',
  helm: '<path d="M10 17V6"/><path d="M10 6l4-3"/><path d="M4 15a8 8 0 0 1 12 0"/>',
  speed: '<path d="M3 5l6 5-6 5Z"/><path d="M10 5l6 5-6 5Z"/>',
  tools: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>',
};

export class ToolsTray {
  constructor(private btn: HTMLElement, private el: HTMLElement, private tools: Tool[], private speed: { get: () => number; set: (v: number) => void }) {
    btn.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });
    el.addEventListener('click', e => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]'), s = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]');
      if (t) { this.tools.find(x => x.id === t.dataset.tool)?.act(); this.refresh(); }
      if (s) { this.speed.set(+s.dataset.speed!); this.refresh(); }
    });
    // (a click anywhere else closes it, as the other small overlays do)
    addEventListener('pointerdown', e => { if (this.open && !el.contains(e.target as Node) && !btn.contains(e.target as Node)) this.close(); });
  }
  get open(): boolean { return !this.el.hidden; }
  toggle(): void { if (this.open) this.close(); else { this.render(); this.el.hidden = false; this.btn.classList.add('on'); } }
  close(): void { this.el.hidden = true; this.btn.classList.remove('on'); }
  private render(): void {
    this.el.innerHTML = this.tools.filter(t => !t.hidden?.()).map(t => `<button type="button" class="tt${t.on ? '' : ' act'}" data-tool="${t.id}" title="${t.label} (${t.key()})"><kbd>${t.key()}</kbd>${svg(TOOL_ICONS[t.icon as keyof typeof TOOL_ICONS] ?? '')}<span>${t.label}</span></button>`).join('')
      + `<div class="tt-speed">${svg(TOOL_ICONS.speed)}<span>Speed</span><span class="seg">${[1, 2, 4].map(v => `<button type="button" data-speed="${v}">${v}×</button>`).join('')}</span></div>`;
    this.refresh();
  }
  /** The tiles lit for what's on now (on open, after a press, and each frame while it's open). */
  refresh(): void {
    if (!this.open && this.el.childElementCount === 0) return;
    for (const t of this.tools) { const b = this.el.querySelector(`[data-tool="${t.id}"]`); if (b && t.on) b.classList.toggle('on', t.on()); }
    const v = this.speed.get();
    this.el.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed! === v));
  }
}
