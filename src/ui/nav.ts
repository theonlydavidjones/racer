/**
 * Where you've come from, among the screens around the sailing (docs/UI-AUDIT.md §3, the owner's "yes", 13 Nov 2026):
 * a stack of places. Opening a screen from the one you're on puts it on top; back takes it off and shows the one under
 * it, and every back link is named for that place ("‹ Race", "‹ JOSEPHINE", "‹ Yacht Club"), not written into the
 * screen. Going to a place already on the stack goes back to it (no loops). Going sailing leaves [start page, setup],
 * so the pause menu's and the results' "Back to setup" return to the setup you sailed from; the start page clears it.
 * Layers (conditions, settings, the course, the flag index) open over a screen and aren't on the stack.
 */
export type Place =
  | { k: 'home' }
  | { k: 'race' }
  | { k: 'setup' }
  | { k: 'club'; tab?: 'boats' | 'members' }
  | { k: 'boat'; id: string };

const same = (a: Place, b: Place) => a.k === b.k && (a.k !== 'boat' || a.id === (b as { id: string }).id);

export class Nav {
  private stack: Place[] = [{ k: 'home' }];
  /** Shows a place (the page's own screens: app.ts), and names one for a back link. */
  constructor(private show: (p: Place) => void, private name: (p: Place) => string) {}
  get here(): Place { return this.stack[this.stack.length - 1]; }
  /** Open `p` from where you are (or go back to it, if it's under you). */
  go(p: Place): void {
    const i = this.stack.findIndex(q => same(q, p));
    if (i >= 0) { this.stack.length = i + 1; this.stack[i] = p; } else this.stack.push(p);
    this.show(p);
  }
  /** Back to the place under this one; at the start page, nothing. */
  back(): void {
    if (this.stack.length < 2) return;
    this.stack.pop(); this.show(this.here);
  }
  /** The stack set outright (going sailing: [home, setup]; the start page: [home]), nothing shown. */
  reset(...ps: Place[]): void { this.stack = [{ k: 'home' }, ...ps.filter(p => p.k !== 'home')]; }
  /** The back link for where you are: "‹ " and the name of the place under it. */
  backLabel(): string { return this.stack.length < 2 ? '' : '‹ ' + this.name(this.stack[this.stack.length - 2]); }
  /** For the checks: the stack's places, bottom first. */
  get trail(): string { return this.stack.map(p => p.k + (p.k === 'boat' ? ':' + p.id : '')).join(' › '); }
}
