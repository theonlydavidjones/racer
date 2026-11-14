/** Keyboard bindings: every action, its keys, and saving your changes in this browser. */
export type Action =
  | 'steerPort' | 'steerStbd' | 'centreTiller' | 'takeTiller' | 'lashTiller' | 'luff'
  | 'mainIn' | 'mainOut' | 'jibIn' | 'jibOut' | 'ctlPrev' | 'ctlNext' | 'ctlDown' | 'ctlUp' | 'pole' | 'sailBand' | 'navLights' | 'hail' | 'pushOff' | 'jibHalyard' | 'mainHalyard' | 'autopilot'
  | 'crewLee' | 'crewUp' | 'crewFwd' | 'crewAft' | 'paddle'
  | 'viewCockpit' | 'viewChase' | 'viewOverhead' | 'cycleView' | 'lookInstrument' | 'windLadder' | 'flowView' | 'perfMeter'
  | 'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown' | 'lookAhead'
  | 'orient' | 'zoomIn' | 'zoomOut' | 'recentre'
  | 'course' | 'log' | 'pause' | 'keys';

/** Actions that last while the key is held (the rest fire once per press). */
export const HELD: ReadonlySet<Action> = new Set<Action>(['steerPort', 'steerStbd', 'luff', 'mainIn', 'mainOut', 'jibIn', 'jibOut', 'lookLeft', 'lookRight', 'lookUp', 'lookDown', 'zoomIn', 'zoomOut', 'ctlDown', 'ctlUp']);

export const ACTIONS: { id: Action; label: string; group: string }[] = [
  { id: 'takeTiller', label: 'Take or let go of the tiller (then the cursor steers)', group: 'Helm' },
  { id: 'steerPort', label: 'Turn to port (push the tiller to starboard)', group: 'Helm' },
  { id: 'steerStbd', label: 'Turn to starboard (push the tiller to port)', group: 'Helm' },
  { id: 'centreTiller', label: 'Center the tiller', group: 'Helm' },
  { id: 'lashTiller', label: 'Lash the tiller where it is (heaving to) / unlash', group: 'Helm' },
  { id: 'luff', label: 'Luff (ease both sails, hold)', group: 'Sails' },
  { id: 'mainIn', label: 'Trim the main in', group: 'Sails' },
  { id: 'mainOut', label: 'Ease the main', group: 'Sails' },
  { id: 'jibIn', label: 'Trim the jib in', group: 'Sails' },
  { id: 'jibOut', label: 'Ease the jib', group: 'Sails' },
  { id: 'ctlPrev', label: 'Select the previous line (sail controls)', group: 'Sails' },
  { id: 'ctlNext', label: 'Select the next line', group: 'Sails' },
  { id: 'ctlDown', label: 'Selected line: less (ease the vang, outhaul…; trim a sheet in; car forward/in)', group: 'Sails' },
  { id: 'ctlUp', label: 'Selected line: more (tighten; ease a sheet; car aft/out)', group: 'Sails' },
  { id: 'pole', label: 'Whisker pole out / in', group: 'Sails' },
  { id: 'sailBand', label: 'Sail controls: show or put away', group: 'Sails' },
  { id: 'paddle', label: 'Paddle with the boom crutch: port, then starboard, then stop', group: 'Crew' },
  { id: 'crewLee', label: 'Crew weight a step to leeward (hike → up → middle → leeward)', group: 'Crew' },
  { id: 'crewUp', label: 'Crew weight a step to windward (leeward → middle → up → hike)', group: 'Crew' },
  { id: 'crewFwd', label: 'Crew weight forward a step', group: 'Crew' },
  { id: 'crewAft', label: 'Crew weight aft a step', group: 'Crew' },
  { id: 'autopilot', label: 'Autopilot on (Auto, holding her course) / standby (cruising only)', group: 'Helm' },
  { id: 'navLights', label: 'Navigation lights on (lit after dark) / off', group: 'Helm' },
  { id: 'pushOff', label: 'At the dock: push off from her berth (the crew walks her out; held head to wind, let her go); coming in, lines ready (again: stand down); lying to her lines, let go', group: 'Helm' },
  { id: 'jibHalyard', label: 'Hoist or strike the jib', group: 'Sails' },
  { id: 'mainHalyard', label: 'Hoist or strike the main', group: 'Sails' },
  { id: 'hail', label: 'Hail ("Room to tack!", "Starboard!", or reply "You tack")', group: 'Racing' },
  { id: 'course', label: 'Course and strategist (racing) · navigator (cruising)', group: 'Racing' },
  { id: 'viewCockpit', label: 'Cockpit view', group: 'Views' },
  { id: 'viewChase', label: 'Chase view', group: 'Views' },
  { id: 'viewOverhead', label: 'Overhead view', group: 'Views' },
  { id: 'cycleView', label: 'Next view', group: 'Views' },
  { id: 'lookInstrument', label: 'Look at the cabin-top instrument from the helm (press again to look back)', group: 'Views' },
  { id: 'windLadder', label: 'Wind indicator: the true and apparent wind in the air beside her, at three heights (on / off)', group: 'Views' },
  { id: 'flowView', label: 'Flow view: the air over the sails, at three heights (show / put away)', group: 'Views' },
  { id: 'lookLeft', label: 'Look left', group: 'Views' },
  { id: 'lookRight', label: 'Look right', group: 'Views' },
  { id: 'lookUp', label: 'Look up', group: 'Views' },
  { id: 'lookDown', label: 'Look down', group: 'Views' },
  { id: 'lookAhead', label: 'Look ahead again', group: 'Views' },
  { id: 'orient', label: 'Overhead: north up / bow up / wind up', group: 'Overhead' },
  { id: 'zoomIn', label: 'Zoom in (overhead, chase) · eye forward (cockpit)', group: 'Overhead' },
  { id: 'zoomOut', label: 'Zoom out (overhead, chase) · eye aft (cockpit)', group: 'Overhead' },
  { id: 'recentre', label: 'Overhead: back to your boat', group: 'Overhead' },
  { id: 'log', label: 'All messages', group: 'General' },
  { id: 'pause', label: 'Pause', group: 'General' },
  { id: 'keys', label: 'Keyboard settings', group: 'General' },
  { id: 'perfMeter', label: 'Frame-time readout: fps, the 95% frame time and long frames over the last 10 s (on / off)', group: 'General' },
];

export const DEFAULT_KEYS: Record<Action, string[]> = {
  takeTiller: ['t'], steerPort: ['a'], steerStbd: ['d'], centreTiller: ['c'], lashTiller: ['i'],
  luff: ['s'], mainIn: ['z'], mainOut: ['x'], jibIn: [','], jibOut: ['.'], ctlPrev: ['['], ctlNext: [']'], ctlDown: [';'], ctlUp: ["'"], pole: ['o'], sailBand: ['4'], crewLee: ['7'], crewUp: ['8'], crewFwd: ['9'], crewAft: ['0'], pushOff: ['g'], paddle: ['/'], navLights: ['5'], autopilot: ['y'], jibHalyard: ['j'], mainHalyard: ['u'],
  hail: ['h'], course: ['m'],
  viewCockpit: ['1'], viewChase: ['2'], viewOverhead: ['3'], cycleView: ['v'], lookInstrument: ['6'], windLadder: ['`'], flowView: ['\\'],
  lookLeft: ['ArrowLeft', 'q'], lookRight: ['ArrowRight', 'e'], lookUp: ['ArrowUp', 'r'], lookDown: ['ArrowDown', 'f'], lookAhead: ['w'],
  orient: ['n'], zoomIn: ['=', '+'], zoomOut: ['-'], recentre: ['b'],
  log: ['l'], pause: ['p'], keys: ['k'], perfMeter: ['F9'],
};

/** Keys you can't rebind (Esc cancels things; Tab moves focus). */
const RESERVED = new Set(['Escape', 'Tab']);
const STORE = 'fbsim-keys-v1';

/** A key as we store it: letters lower-case, space spelled out. */
export function normKey(k: string): string { return k === ' ' ? 'Space' : k.length === 1 ? k.toLowerCase() : k; }
/** A key as people read it. */
export function keyLabel(k: string): string {
  const names: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', Backspace: '⌫' };
  return names[k] ?? (k.length === 1 ? k.toUpperCase() : k);
}

export class KeyMap {
  keys: Record<Action, string[]> = structuredClone(DEFAULT_KEYS);
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved) for (const a of Object.keys(DEFAULT_KEYS) as Action[]) if (Array.isArray(saved[a])) this.keys[a] = saved[a].map(String);
    } catch { /* private mode etc. */ }
  }
  private save(): void { try { localStorage.setItem(STORE, JSON.stringify(this.keys)); } catch { /* ignore */ } }
  /** The action a key triggers, if any. */
  actionFor(key: string): Action | null {
    const k = normKey(key);
    for (const a of Object.keys(this.keys) as Action[]) if (this.keys[a].includes(k)) return a;
    return null;
  }
  /** Bind `key` to `action` (replacing its first key). Takes the key off any other action. Returns that action, if any. */
  bind(action: Action, key: string): Action | null {
    const k = normKey(key);
    if (RESERVED.has(k)) return null;
    let stolen: Action | null = null;
    for (const a of Object.keys(this.keys) as Action[]) {
      if (a !== action && this.keys[a].includes(k)) { this.keys[a] = this.keys[a].filter(x => x !== k); stolen = a; }
    }
    const rest = this.keys[action].slice(1).filter(x => x !== k);
    this.keys[action] = [k, ...rest];
    this.save();
    return stolen;
  }
  reset(): void { this.keys = structuredClone(DEFAULT_KEYS); this.save(); }
  label(action: Action): string { return this.keys[action].map(keyLabel).join(' / ') || 'none'; }
}
