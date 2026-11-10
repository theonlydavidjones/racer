/**
 * Your saves (your boats and settings, her logbook, your keys), kept with the published sim so they outlast every new
 * version of it. The app goes on saving to this browser as before; this copies each save to your own private place in
 * the artifact's database (`data/users/<your id>/<key>`, which nobody else can read, the owner included), and when the
 * page opens, brings back anything there that's newer than what this browser has, before the app starts.
 *
 * Safety first: nothing is written to the database until it has been read, so a browser that has lost its storage
 * never overwrites your saves with a fresh start. If the database can't be reached in time, this visit's saves stay in
 * this browser (and go up next time they change once it's reachable).
 */

const PREFIX = 'fbsim-';
/** When each save was last changed here (ms), so the newer copy wins. Not itself copied. */
const TIMES = 'fbsim-sync-times';
/** Wait this long, at most, for your saves before starting with what this browser has. */
const WAIT_MS = 8000;
/** A document holds at most 256 KiB; leave room for the wrapper. */
const MAX_CHARS = 240_000;

type Saved = { v: string | null; t: number };
type Ref = { set(d: Record<string, unknown>): Promise<void> };
type Db = { doc(p: string): Ref; collection(p: string): { get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }> } };

let db: Db | null = null, uid = '';
let state: 'local' | 'waiting' | 'synced' | 'unreachable' = 'local';
let onTrouble: ((msg: string) => void) | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>(), queue = new Map<string, Promise<void>>();
const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;

const ours = (s: Storage, k: string) => s === localStorage && k.startsWith(PREFIX) && k !== TIMES;
function times(): Record<string, number> { try { return JSON.parse(localStorage.getItem(TIMES) || '{}'); } catch { return {}; } }
function stamp(k: string): void { try { const m = times(); m[k] = Date.now(); rawSet.call(localStorage, TIMES, JSON.stringify(m)); } catch { /* storage unavailable */ } }

/** Where your saves are: in this browser only, or kept with the sim as well. For the start page. */
export function saveStatus(): string {
  return state === 'synced' ? 'Your boats, logbook and settings are saved to your account on this sim, and come back on any device.'
    : state === 'unreachable' ? 'Couldn\'t reach your saved boats just now: this visit\'s changes are kept in this browser.'
    : 'Your boats, logbook and settings are kept in this browser.';
}
/** Tell the player if a save couldn't be kept (too big, or the database is full). */
export function onSaveTrouble(f: (msg: string) => void): void { onTrouble = f; }

/** Bring back your saves, then let the app start. Call once, before the app's modules load. */
export async function hydrate(): Promise<void> {
  // every save of ours from here on is timestamped, and copied up once the database has been read
  Storage.prototype.setItem = function (this: Storage, k: string, v: string) { rawSet.call(this, k, v); if (ours(this, k)) { stamp(k); push(k); } };
  Storage.prototype.removeItem = function (this: Storage, k: string) { rawRemove.call(this, k); if (ours(this, k)) { stamp(k); push(k); } };
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!claude?.use) return; // not inside claude.ai (the dev server, a saved copy): this browser only
  state = 'waiting';
  let gaveUp = false;
  const load = (async () => {
    const [d, u] = await Promise.all([claude.use('db') as Promise<Db | null>, claude.use('user') as Promise<{ id(): Promise<string | null> } | null>]);
    const id = d && u ? await u.id() : null;
    if (!d || !id) { state = 'local'; return; } // signed out, or no database here
    const snap = await d.collection(`data/users/${id}`).get();
    if (gaveUp) return; // too late: the app has started with this browser's copy; leave both alone this visit
    const here = times(), there = new Map<string, Saved>();
    for (const doc of snap.docs) {
      const b = doc.data() as Saved | undefined;
      if (!b || typeof b.t !== 'number' || !doc.id.startsWith(PREFIX)) continue;
      there.set(doc.id, b);
      if ((here[doc.id] ?? 0) < b.t) { // newer there: bring it back
        if (b.v == null) rawRemove.call(localStorage, doc.id); else rawSet.call(localStorage, doc.id, b.v);
        here[doc.id] = b.t;
      }
    }
    rawSet.call(localStorage, TIMES, JSON.stringify(here));
    db = d; uid = id; state = 'synced';
    // and anything newer here (or never copied) goes up
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (ours(localStorage, k) && (here[k] ?? 0) >= (there.get(k)?.t ?? -1) && !(there.get(k)?.t === here[k])) push(k);
    }
  })().catch(() => { if (!gaveUp) state = 'unreachable'; });
  await Promise.race([load, new Promise<void>(r => setTimeout(() => { if (state === 'waiting') { gaveUp = true; state = 'unreachable'; } r(); }, WAIT_MS))]);
}

/** Copy one save up, a moment after it last changed (one write at a time per save). */
function push(k: string): void {
  if (!db) return;
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => {
    const prev = queue.get(k) ?? Promise.resolve();
    queue.set(k, prev.then(() => write(k)).catch(() => { /* reported in write */ }));
  }, 1200));
}
async function write(k: string, retry = true): Promise<void> {
  if (!db) return;
  const v = localStorage.getItem(k), t = times()[k] ?? Date.now();
  if (v != null && v.length > MAX_CHARS) { onTrouble?.('One of your saves is too big to keep with your account; it stays in this browser.'); return; }
  try { await db.doc(`data/users/${uid}/${k}`).set({ v, t }); }
  catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'unavailable' && retry) { await new Promise(r => setTimeout(r, 800 + Math.random() * 1200)); return write(k, false); }
    if (code === 'quota_exceeded') onTrouble?.('Your account\'s storage on this sim is full: this change stays in this browser.');
  }
}
