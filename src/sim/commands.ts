/**
 * Everything the page does to the race, as plain data (docs/CAPACITY.md, step 2).
 *
 * The page never writes to the World itself. What you do (the tiller, the sheets and lines, the crew's place, the pole,
 * the halyards, the motor, the pilot, a hail, pause and speed) goes as one of these commands, and `applyCommand` does it
 * to the World, exactly as the page used to do it directly. Commands are plain data, so later they can go to a World
 * running on its own thread (a Web Worker) and be applied there between its steps, in the order they were sent.
 *
 * Each case here is the page's old code moved, not rewritten: the race comes out the same to the last bit.
 */
import type { Controls } from '../boat/controls';
import type { LineKey, Boat } from '../boat/boat';
import type { PlaceAcross, PlaceFore } from '../boat/crewPhys';
import { allToCrew, moveLazyCar, takeLine } from '../boat/physics';
import { wantJumpers } from '../boat/condition';
import { guideTune } from '../boat/rigTune';
import { adjust as pilotAdjust, engage as pilotEngage, standby as pilotStandby, tack as pilotTack, type PilotMode } from '../boat/autopilot';
import type { Settings } from '../settings';
import type { Moment } from './debrief';
import type { Vec } from '../core/math';
import type { World } from './world';

/** A line you can work (the jib cars are moved apart: lazyCar). */
export type CtlKey = Exclude<keyof Controls, 'car'>;

export type Command =
  /** Your hands on the helm and lines, as held: the steering keys, luffing, and the lines being worked (−1 in … +1 out). */
  | { k: 'helm'; steer: number; luff: boolean; ctl: Partial<Record<CtlKey, number>> }
  /** Hands off (a pause, an incident, the chart opened): no steering, no luffing, the sheets left where they are. */
  | { k: 'handsOff' }
  /** The tiller's handle, −1 (pushed to port) … +1 (to starboard); a lashed tiller is lashed where it's put. */
  | { k: 'tiller'; v: number }
  /** Lash the tiller where it is, or take the lashing off. */
  | { k: 'lash'; on: boolean }
  /** Take a line yourself (it stays where it is until you work it), or give it back to the crew. */
  | { k: 'line'; key: LineKey; mine: boolean }
  /** Auto-trim: every line, both jib cars and the pole back to the crew. */
  | { k: 'allToCrew' }
  /** Move the lazy jib car (taking the cars): fore–aft and in–out steps. */
  | { k: 'lazyCar'; fore: number; ins: number }
  /** Set a line to a value (the sail controls band's drag), taking it. */
  | { k: 'ctlTarget'; key: CtlKey; v: number }
  /** Stop lines running to a value where they are (the band: another touch, a hold, a tack). */
  | { k: 'ctlTargetClear'; keys: CtlKey[] }
  /** The crew to turn the jumpers' turnbuckle to so many turns (the band's dials). */
  | { k: 'jumpers'; turns: number }
  /** A half turn more or less on the jumpers, from where they're going (or where they are): worked out with the race's own numbers. */
  | { k: 'jumpersBy'; d: number }
  /** The lazy jib car to a hole (taking the cars), from wherever it is or was going: the band's click on a hole. */
  | { k: 'lazyCarTo'; fore: number; ins: number }
  /** Where the crew sit: your choice across and fore and aft (null: theirs), or null to put them back on auto. */
  | { k: 'crewPlace'; place: { across: PlaceAcross | null; fore: PlaceFore | null } | null }
  /** Set or stow the whisker pole (it's yours until Auto-trim). */
  | { k: 'pole'; want: boolean }
  /** Strike or hoist the ensign. */
  | { k: 'ensign'; struck: boolean }
  /** Navigation lights off or on. */
  | { k: 'lights'; off: boolean }
  /** Hoist or strike a sail. */
  | { k: 'sail'; sail: 'main' | 'jib'; up: boolean }
  /** The tiller pilot. */
  | { k: 'pilot'; op: 'engage'; mode: Exclude<PilotMode, 'off'> }
  | { k: 'pilot'; op: 'standby' }
  | { k: 'pilot'; op: 'tack' }
  | { k: 'pilot'; op: 'adjust'; d: number }
  /** The outboard. */
  | { k: 'motor'; op: 'tilt' | 'stop' | 'swivel' }
  | { k: 'motor'; op: 'start'; retireFirst: boolean }
  | { k: 'motor'; op: 'gear'; gear: 'F' | 'N' | 'R' }
  | { k: 'motor'; op: 'throttle'; v: number }
  | { k: 'castOff' }
  | { k: 'pushOff' }
  | { k: 'hail' }
  | { k: 'sendHome' }
  | { k: 'moveHere'; p: Vec; name: string }
  | { k: 'dest'; p: Vec; name: string }
  | { k: 'retire'; why?: string }
  /** Take a penalty (by boat id): after an incident's replay. */
  | { k: 'penalty'; boat: number }
  /** New conditions for the sail that's running (the conditions panel from the pause menu). */
  | { k: 'conditions'; settings: Settings }
  /** The page's own settings the World keeps a copy of (the chart's colours, the map's layers): they don't touch the race. */
  | { k: 'settings'; patch: Pick<Partial<Settings>, 'chartPal' | 'mapLayers'> }
  /** A note in the race's log (a rule incident, for the debrief and the race replay). */
  | { k: 'logNote'; note: Moment }
  /** The clock: running, paused, and the speed of time. */
  | { k: 'running'; on: boolean }
  | { k: 'pause'; on: boolean }
  | { k: 'speed'; v: number }
  /** The page's bookkeeping kept on the World (the results shown, the race logged). */
  | { k: 'shown'; finishShown?: boolean; logged?: boolean };

/** What a command answers (the outboard's start, and the moves that can be refused), else undefined. */
export type CommandResult = ReturnType<World['motorStart']> | boolean | undefined;

/** Do a command to the World: the page's own code for it, moved here unchanged. */
export function applyCommand(w: World, c: Command): CommandResult {
  const u: Boat = w.user;
  switch (c.k) {
    case 'helm':
      u.steer = c.steer; u.luff = c.luff;
      u.ctlCmd = c.ctl; u.sheetCmd.main = c.ctl.mainsheet ?? 0; u.sheetCmd.jib = c.ctl.jibsheet ?? 0;
      return;
    case 'handsOff': u.steer = 0; u.luff = false; u.sheetCmd.main = u.sheetCmd.jib = 0; return;
    case 'tiller': u.tiller = Math.max(-1, Math.min(1, c.v)); if (u.lashed != null) u.lashed = u.tiller; return;
    case 'lash': u.lashed = c.on ? u.tiller : null; return;
    case 'line': takeLine(u, c.key, c.mine); return;
    case 'allToCrew': allToCrew(u); return;
    case 'lazyCar': takeLine(u, 'car'); moveLazyCar(u, c.fore, c.ins); return;
    case 'ctlTarget': (u.ctlTarget ??= {})[c.key] = c.v; takeLine(u, c.key); return;
    case 'ctlTargetClear': if (u.ctlTarget) for (const key of c.keys) delete u.ctlTarget[key]; return;
    case 'jumpers': wantJumpers(u, c.turns); return;
    case 'jumpersBy': wantJumpers(u, (u.jumperTarget ?? (u.tune ?? guideTune(u.ww.kt)).jumperTurns) + c.d); return;
    case 'lazyCarTo': {
      // (as the band did it: from where she'd been asked to put the car, or where the lazy car is; moveLazyCar works from the same)
      const lazy = u.ctl.car[u.tack], from = u.carCmd ?? { fore: lazy.fore, ins: lazy.ins };
      takeLine(u, 'car'); moveLazyCar(u, c.fore - from.fore, c.ins - from.ins); return;
    }
    case 'crewPlace': if (u.crew) u.crew.place = c.place ? { across: c.place.across, fore: c.place.fore } : undefined; return;
    case 'pole': u.poleWant = c.want; u.poleMine = true; return;
    case 'ensign': u.ensignStruck = c.struck; return;
    case 'lights': u.lightsOff = c.off; return;
    case 'sail': w.setSail(c.sail, c.up); return;
    case 'pilot':
      if (c.op === 'engage') pilotEngage(u, w.pilot, c.mode);
      else if (c.op === 'standby') pilotStandby(w.pilot);
      else if (c.op === 'tack') pilotTack(u, w.pilot);
      else pilotAdjust(u, w.pilot, c.d);
      return;
    case 'motor':
      if (c.op === 'tilt') w.motorTilt();
      else if (c.op === 'stop') w.motorStop();
      else if (c.op === 'swivel') w.motorSwivel();
      else if (c.op === 'start') return w.motorStart(c.retireFirst);
      else if (c.op === 'gear') w.motorGear(c.gear);
      else if (c.op === 'throttle') w.motorThrottle(c.v);
      return;
    case 'castOff': return w.castOff();
    case 'pushOff': return w.pushOff();
    case 'hail': w.userHail(); return;
    case 'sendHome': return w.sendHome();
    case 'moveHere': return w.moveHere(c.p, c.name);
    case 'dest': w.setDest(c.p, c.name); return;
    case 'retire': return w.retire(c.why);
    case 'penalty': w.assignPenalty(w.boats[c.boat]); return;
    case 'conditions': w.applyConditions(c.settings); return;
    case 'settings': Object.assign(w.settings, c.patch); return;
    case 'logNote': w.log?.note(c.note); return;
    case 'running': w.running = c.on; return;
    case 'pause': w.paused = c.on; return;
    case 'speed': w.speed = c.v; return;
    case 'shown': if (c.finishShown != null) w.finishShown = c.finishShown; if (c.logged != null) w.logged = c.logged; return;
  }
}
