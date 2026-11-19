import { passagePlanLater, type PassagePlan } from '../sim/navigator';
import type { SimView } from '../sim/host';
import { briefHtml } from './briefView';
import { $ } from './dom';

/**
 * The navigator's passage plan in words, cruising: when to leave, the current gates and when they turn, the wind, the
 * hazards. Its chart is the one chart's own layer now (ui/hud.ts drawNavLayer: the owner, 17 Nov 2026, "the navigator
 * as a layer on the single chart"), and this opens from the chart's one line about the passage, and before she leaves.
 */
export class NavView {
  private world: SimView | null = null;
  private stopPlan: (() => void) | null = null;

  get isOpen(): boolean { return !$('navView').hidden; }

  open(w: SimView): void {
    this.world = w;
    $('navView').hidden = false;
    $('navSub').textContent = '';
    if (!w.dest) {
      $('navTitle').textContent = 'No destination';
      $('navBrief').innerHTML = '<p class="lede">Choose where you\'re going; the navigator plans the passage.</p>';
      return;
    }
    $('navTitle').textContent = 'Working out the passage…';
    $('navBrief').innerHTML = '';
    this.stopPlan?.();
    this.stopPlan = passagePlanLater(w, plan => { // (worked out between frames)
      this.stopPlan = null;
      if (this.world !== w || !this.isOpen) return;
      this.show(plan);
    });
  }
  private show(plan: PassagePlan | null): void {
    if (!plan) { $('navTitle').textContent = 'No passage found'; return; }
    $('navTitle').textContent = plan.title; $('navSub').textContent = plan.sub; $('navBrief').innerHTML = briefHtml(plan);
  }
  close(): void { this.stopPlan?.(); this.stopPlan = null; $('navView').hidden = true; this.world = null; }
  toggle(w: SimView): void { if (this.isOpen) this.close(); else this.open(w); }
}
