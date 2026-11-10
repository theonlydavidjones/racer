import type { Boat } from './boat';
import { IDEAL_HELM, heelFactor, rudderDrag } from './balance';
import { CAR_FORE_PINS, CAR_IN_PINS, loadedCar, targetShape, type Shape } from './controls';
import { hullResistance } from './dynamics';
import { sailPlan } from './physics';
import { SAILS } from './trim';

/**
 * The trim coach: what the sails and the boat are doing, and why, line by line. When you trim, it says what's right
 * and what to change; when the crew trims, it explains the choices they made. Everything comes from the same
 * model the boat sails by (trim.ts, controls.ts, balance.ts), so the advice and the speed agree.
 */

export interface CoachItem { head: string; text: string; ok: boolean }
export interface CoachReport { summary: string; items: CoachItem[] }

const pct = (x: number) => `${Math.round(x * 100)}%`;
const deg = (x: number) => `${Math.round(x)}°`;

function regime(tws: number, awa: number): { name: string; why: string } {
  const a = Math.abs(awa);
  if (a > 120) return { name: 'running', why: 'Running, the sails work by presenting area to the wind: eased right out, full, with the vang holding the boom down so the main doesn\'t twist away up high.' };
  if (a > 60) return { name: 'reaching', why: 'Reaching, the sails want to be full and eased to the wind, with moderate twist; the vang keeps the leech from falling off as the sheet comes out.' };
  if (tws < 7) return { name: 'light air', why: `In light air (${Math.round(tws)} kt) the flow attaches easily to a full sail but separates off a tight leech: full sails with some twist, controls mostly eased.` };
  if (tws < 13) return { name: 'medium air', why: `In medium air (${Math.round(tws)} kt) you want full power: deep sails, the leech closed as much as the top telltales allow, the boat heeling 12–18°.` };
  return { name: 'heavy air', why: `In a breeze (${Math.round(tws)} kt) the boat has more power than she can use: flatten the sails, pull the draft forward and open the leech to spill the top, so she stands up and points.` };
}

/** What to do about a shape difference, by the lines that change it. */
function shapeAdvice(sail: 'main' | 'jib', s: Shape, t: Shape, mineToFix: boolean, upwind: boolean, heavy: boolean): { text: string; ok: boolean }[] {
  const out: { text: string; ok: boolean }[] = [];
  const verb = (a: string, b: string) => (mineToFix ? a : b);
  const dd = s.depth - t.depth, dr = s.draft - t.draft, dt = s.twist - t.twist;
  const depthTxt = `depth ${pct(s.depth)} of the chord (best ${pct(t.depth)})`;
  if (dd > 0.012) out.push({ ok: false, text: `Too full: ${depthTxt}. ${sail === 'main' ? verb('Pull the outhaul and the backstay on (the backstay bends the mast and flattens the main; it also tightens the forestay and flattens the jib).', 'The crew would flatten it with outhaul and backstay.') : verb('Pull the backstay on (less forestay sag, flatter jib) or move the car aft.', 'The crew would add backstay.')}` });
  else if (dd < -0.012) out.push({ ok: false, text: `Too flat: ${depthTxt}. ${sail === 'main' ? verb('Ease the outhaul and the backstay for power.', 'The crew would ease outhaul and backstay.') : verb('Ease the backstay (more sag, fuller jib), or move the car forward.', 'The crew would ease the backstay.')}` });
  else out.push({ ok: true, text: `Depth is right: ${depthTxt}.` });
  const draftTxt = `draft at ${pct(s.draft)} of the chord (best ${pct(t.draft)})`;
  if (dr > 0.04) out.push({ ok: false, text: `Draft too far aft: ${draftTxt}. The breeze blows the draft back; ${verb(sail === 'main' ? 'pull the Cunningham (and the downhaul for big changes) to bring it forward.' : 'pull the jib Cunningham on.', 'the crew pulls luff tension on to bring it forward.')}` });
  else if (dr < -0.04) out.push({ ok: false, text: `Draft too far forward: ${draftTxt}. ${verb(sail === 'main' ? 'Ease the Cunningham and downhaul.' : 'Ease the jib Cunningham.', 'The crew eases luff tension.')}` });
  else out.push({ ok: true, text: `Draft position is right: ${draftTxt}.` });
  const twTxt = `twist ${deg(s.twist)} (best ${deg(t.twist)})`;
  if (dt > 3) out.push({ ok: false, text: `Too much twist: ${twTxt}; the top of the sail is spilling wind you could use. ${sail === 'main' ? verb(upwind ? 'Trim the mainsheet harder (and bring the traveller up to keep the boom angle), or put the vang on.' : 'Put the vang on: off the wind it\'s the vang, not the sheet, that holds the leech.', 'The crew closes the leech with sheet tension or vang.') : verb('Move the jib car forward a pin.', 'The crew moves the car forward.')}` });
  else if (dt < -3) out.push({ ok: false, text: `Leech too tight: ${twTxt}; the top telltales stall. ${sail === 'main' ? verb(upwind ? (heavy ? 'Ease the mainsheet to open the leech, and drop the traveller rather than pull it up: in a breeze the twist and the lower boom both help.' : 'Ease the mainsheet a touch and pull the traveller up to keep the boom where it was, or ease the vang.') : 'Ease the vang.', 'The crew eases the sheet or vang.') : verb('Move the jib car aft a pin.', 'The crew moves the car aft.')}` });
  else out.push({ ok: true, text: `Twist is right: ${twTxt}.` });
  return out;
}

export function coach(b: Boat): CoachReport {
  const items: CoachItem[] = [], you = b.manualTrim, all = b.trimAll && you, tws = b.ww.kt, awa = b.awa, upwind = b.twa < 70;
  const R = regime(tws, awa), plan = sailPlan(b);
  const who = (mine: boolean) => (mine ? 'You' : 'The crew');
  items.push({ head: `Conditions: ${R.name}`, text: `${Math.round(tws)} kt over the water, apparent wind ${Math.round(Math.abs(awa))}° ${awa >= 0 ? 'to starboard' : 'to port'}, ${Math.round(b.aws / 0.5144)} kt across the deck. ${R.why}`, ok: true });

  // sheets: angle of attack
  for (const [name, t, sheet] of [['main', b.trim.main, b.sheets.main], ['jib', b.trim.jib, b.sheets.jib]] as const) {
    if (!t) { items.push({ head: 'Jib', text: plan === 'wing' ? 'Poled out to windward, wing-on-wing: no telltales to read; keep it full and steady.' : 'The jib is down while the crew works the pole.', ok: true }); continue; }
    const aoa = Math.abs(awa) - sheet, best = SAILS[name].aoa, cap = name === 'main' ? 'Main' : 'Jib';
    const mine = you;
    let text = `${cap} sheeted at ${deg(sheet)} off the centreline: angle of attack ${deg(aoa)} (best about ${deg(best)}). `;
    if (b.luff) text += 'Eased right out to slow down: no drive.';
    else if (Math.abs(awa) > 115) text += `Downwind: ${mine ? 'ease until the leech just stays steady and the boom is near the shroud.' : 'the crew has it eased right out, presenting as much sail as they can to the wind.'}`;
    else if (t.flow === 'luffing') text += `Luffing: the windward telltales lift. ${mine ? 'Trim in, or bear away a few degrees.' : 'The crew is catching up: they trim at a human pace, a second or so behind a change of course.'} Costing ${pct(1 - t.eff)} of this sail's drive.`;
    else if (t.flow === 'stalled') text += `Stalled: the leeward telltales droop and stream backwards. ${mine ? 'Ease the sheet until they fly, or head up.' : 'The crew will ease shortly.'} Costing ${pct(1 - t.eff)}.`;
    else text += `Both sides of the telltales streaming: ${mine ? 'well trimmed.' : 'the crew has it right.'}`;
    items.push({ head: `${cap}: the sheet (${who(mine)})`, text, ok: b.luff || t.flow === 'good' || Math.abs(awa) > 115 });
  }

  // shape
  const tm = targetShape('main', tws, awa);
  const ms = shapeAdvice('main', b.shape.main, tm, all, upwind, tws >= 13);
  items.push({ head: `Main: shape (${all ? 'your lines' : 'the crew\'s lines'})`, text: ms.map(x => x.text).join(' ') + (all ? '' : ` ${crewWhy('main', b)}`), ok: ms.every(x => x.ok) });
  if (b.shape.jib) {
    const tj = targetShape('jib', tws, awa), js = shapeAdvice('jib', b.shape.jib, tj, all, upwind, tws >= 13), car = loadedCar(b.ctl, b.tack);
    items.push({ head: `Jib: shape (${all ? 'your lines' : 'the crew\'s lines'})`, text: js.map(x => x.text).join(' ') + ` The loaded car is on fore–aft pin ${car.fore + 1} of ${CAR_FORE_PINS} and in–out pin ${car.ins + 1} of ${CAR_IN_PINS}: ${car.ins <= 1 ? 'well inboard, to point high in flat water' : car.ins >= 3 ? 'outboard, for power and speed in chop or on a reach' : 'in the middle'}.`, ok: js.every(x => x.ok) });
  }
  items.push({ head: 'What the shape costs', text: `Shape efficiency ${pct(b.shape.eff)} of the best shape's drive${b.shape.eff > 0.985 ? ': as good as it gets.' : '.'}`, ok: b.shape.eff > 0.97 });

  // heel and helm
  const heel = b.heelMag ?? 0, hn = b.helmNeed ?? 0, v = Math.max(0.5, b.v);
  const helmCost = rudderDrag(Math.min(12, hn), v) / Math.max(1, hullResistance(v)), heelCost = 1 - heelFactor(heel);
  let ht = `Heeling ${deg(heel)}${upwind ? ' (a Folkboat is happiest at 12–20° upwind)' : ''}. `;
  ht += `The sails push sideways with about ${Math.round((b.forces?.heel ?? 0) / 9.81)} kgf, high up the mast; the keel and three crew on the rail hold her up. `;
  if (upwind && heel > 22) ht += `Too much heel: she slips sideways and the rudder fights. Costing about ${pct(heelCost)}. Depower: backstay on first (flattens both sails and opens the main's leech), then Cunningham and outhaul, then the traveller down; ease the main last, since it costs pointing.`;
  else if (upwind && heel < 8 && tws > 9) ht += 'Quite upright for this breeze: you could use more power (fuller sails, traveller up) if the boat feels sluggish.';
  items.push({ head: 'Heel', text: ht, ok: !(upwind && heel > 22) });
  let ft = `The test: let go of the tiller. If she rounds up into the wind, she has weather helm; if she bears away, lee helm. Right now she needs ${Math.abs(hn) < 0.8 ? 'almost no helm: neutral' : hn > 0 ? `${deg(hn)} of weather helm (the tiller held to windward)` : `${deg(-hn)} of lee helm (the tiller held to leeward)`}. `;
  ft += `A couple of degrees of weather helm (about ${IDEAL_HELM}°) is what you want: you can feel the boat, and the rudder adds a little lift to windward. More than that, the rudder angled across the flow is a brake${hn > IDEAL_HELM ? `: costing about ${pct(helmCost)} of her drag budget now` : ''}. `;
  if (hn > 5) ft += `Too much weather helm. Fix it with the controls that don't cost pointing first: backstay on (flatter main, more twist up high), traveller down (the boom goes out without twisting the leech). Ease the main only if that isn't enough. Weather helm builds with heel, so anything that stands her up helps.`;
  else if (hn < -1.5) ft += 'Lee helm, which makes her slip to leeward and feel dead. Power the main up and move the force aft: traveller up, ease the backstay, fuller main; or ease the jib a touch.';
  else ft += 'Balanced well.';
  items.push({ head: 'Helm balance', text: ft, ok: hn <= 5 && hn >= -1.5 });

  const bad = items.filter(i => !i.ok).length;
  const summary = bad === 0 ? `${you ? 'Your trim' : 'The crew\'s trim'} is right for ${R.name}.` : `${bad} thing${bad > 1 ? 's' : ''} to look at.`;
  return { summary, items };
}

/** Why the crew chose their settings for this sail, in a sentence. */
function crewWhy(sail: 'main' | 'jib', b: Boat): string {
  const c = b.ctl, tws = b.ww.kt;
  if (sail !== 'main') return '';
  const parts: string[] = [];
  parts.push(`outhaul ${pct(c.outhaul)}`, `backstay ${pct(c.backstay)}`, `Cunningham ${pct(c.cunningham)}`, `vang ${pct(c.vang)}`, `traveller ${c.traveller < -0.05 ? 'to windward' : c.traveller > 0.05 ? 'to leeward' : 'centred'}`);
  const why = tws < 7 ? 'kept the lines eased for a full, twisted sail' : tws < 13 ? 'set for full power with the leech closed' : 'flattened and opened the leech to depower';
  return `The crew ${why}: ${parts.join(', ')}.`;
}
