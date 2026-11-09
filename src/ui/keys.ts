/** Keyboard bindings: every action, its keys, and saving your changes in this browser. */
export type Action =
  | 'steerPort' | 'steerStbd' | 'centreTiller' | 'takeTiller' | 'luff'
  | 'mainIn' | 'mainOut' | 'jibIn' | 'jibOut' | 'pole' | 'hail'
  | 'viewCockpit' | 'viewChase' | 'viewOverhead' | 'cycleView'
  | 'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown' | 'lookAhead'
  | 'orient' | 'zoomIn' | 'zoomOut' | 'recentre'
  | 'course' | 'log' | 'pause' | 'keys';

/** Actions that last while the key is held (the rest fire once per press). */
export const HELD: ReadonlySet<Action> = new Set<Action>(['steerPort', 'steerStbd', 'luff', 'mainIn', 'mainOut', 'jibIn', 'jibOut', 'lookLeft', 'lookRight', 'lookUp', 'lookDown', 'zoomIn', 'zoomOut']);

export const ACTIONS: { id: Action; label: string; group: string }[] = [
  { id: 'takeTiller', label: 'Take the tiller (trackpad / mouse)', group: 'Helm' },
  { id: 'steerPort', label: 'Turn to port (push the tiller to starboard)', group: 'Helm' },
  { id: 'steerStbd', label: 'Turn to starboard (push the tiller to port)', group: 'Helm' },
  { id: 'centreTiller', label: 'Centre the tiller', group: 'Helm' },
  { id: 'luff', label: 'Luff (ease both sails, hold)', group: 'Sails' },
  { id: 'mainIn', label: 'Trim the main in', group: 'Sails' },
  { id: 'mainOut', label: 'Ease the main', group: 'Sails' },
  { id: 'jibIn', label: 'Trim the jib in', group: 'Sails' },
  { id: 'jibOut', label: 'Ease the jib', group: 'Sails' },
  { id: 'pole', label: 'Whisker pole out / in', group: 'Sails' },
  { id: 'hail', label: 'Hail ("Room to tack!" / "Starboard!")', group: 'Racing' },
  { id: 'course', label: 'Course view', group: 'Racing' },
  { id: 'viewCockpit', label: 'Cockpit view', group: 'Views' },
  { id: 'viewChase', label: 'Chase view', group: 'Views' },
  { id: 'viewOverhead', label: 'Overhead view', group: 'Views' },
  { id: 'cycleView', label: 'Next view', group: 'Views' },
  { id: 'lookLeft', label: 'Look left', group: 'Views' },
  { id: 'lookRight', label: 'Look right', group: 'Views' },
  { id: 'lookUp', label: 'Look up', group: 'Views' },
  { id: 'lookDown', label: 'Look down', group: 'Views' },
  { id: 'lookAhead', label: 'Look ahead again', group: 'Views' },
  { id: 'orient', label: 'Overhead: north up / bow up / wind up', group: 'Overhead' },
  { id: 'zoomIn', label: 'Overhead: zoom in', group: 'Overhead' },
  { id: 'zoomOut', label: 'Overhead: zoom out', group: 'Overhead' },
  { id: 'recentre', label: 'Overhead: back to your boat', group: 'Overhead' },
  { id: 'log', label: 'All messages', group: 'General' },
  { id: 'pause', label: 'Pause', group: 'General' },
  { id: 'keys', label: 'Keyboard settings', group: 'General' },
];

export const DEFAULT_KEYS: Record<Action, string[]> = {
  takeTiller: ['t'], steerPort: ['a'], steerStbd: ['d'], centreTiller: ['c'],
  luff: ['s'], mainIn: ['z'], mainOut: ['x'], jibIn: [','], jibOut: ['.'], pole: ['o'],
  hail: ['h'], course: ['m'],
  viewCockpit: ['1'], viewChase: ['2'], viewOverhead: ['3'], cycleView: ['v'],
  lookLeft: ['ArrowLeft', 'q'], lookRight: ['ArrowRight', 'e'], lookUp: ['ArrowUp', 'r'], lookDown: ['ArrowDown', 'f'], lookAhead: ['w'],
  orient: ['n'], zoomIn: ['=', '+'], zoomOut: ['-'], recentre: ['b'],
  log: ['l'], pause: ['p'], keys: ['k'],
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
