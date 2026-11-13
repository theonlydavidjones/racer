/**
 * US spelling in everything the player reads (the owner, 13 Nov 2026: practice, maneuver, meters, color, favor…).
 * Flags UK spellings in the game's text: the string literals in src/**\/*.ts that read as prose (they hold a space: a
 * lone lowercase word is more likely a key, an id or a class name than something shown), the text of index.html, and the
 * owner-facing docs (README.md, ROADMAP.md, docs/*.md), outside code. Code comments and identifiers aren't checked:
 * they aren't read by the player.
 *   node scripts/check/spelling.cjs          # list what it finds; exits 1 if anything
 *   node scripts/check/spelling.cjs --fix    # and change them
 * Names the owner gave things are kept as they are: add a phrase to KEEP to leave it alone.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), FIX = process.argv.includes('--fix');

/** UK → US, by whole word (the case of the first letter, or of all of it, is kept). */
const WORDS = {
  // -our → -or
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring', colourful: 'colorful', colourless: 'colorless',
  favour: 'favor', favours: 'favors', favoured: 'favored', favouring: 'favoring', favourite: 'favorite', favourites: 'favorites', favourable: 'favorable', unfavourable: 'unfavorable', favourably: 'favorably',
  harbour: 'harbor', harbours: 'harbors', behaviour: 'behavior', behaviours: 'behaviors', neighbour: 'neighbor', neighbours: 'neighbors', neighbouring: 'neighboring',
  honour: 'honor', honours: 'honors', honoured: 'honored', labour: 'labor', rumour: 'rumor', vapour: 'vapor', armour: 'armor', odour: 'odor',
  endeavour: 'endeavor', flavour: 'flavor', humour: 'humor', vigour: 'vigor', rigour: 'rigor', splendour: 'splendor', candour: 'candor', clamour: 'clamor', parlour: 'parlor', fervour: 'fervor', saviour: 'savior',
  // -re → -er
  centre: 'center', centres: 'centers', centred: 'centered', centring: 'centering', centreline: 'centerline', centreboard: 'centerboard', centreboards: 'centerboards',
  metre: 'meter', metres: 'meters', kilometre: 'kilometer', kilometres: 'kilometers', centimetre: 'centimeter', centimetres: 'centimeters', millimetre: 'millimeter', millimetres: 'millimeters',
  litre: 'liter', litres: 'liters', fibre: 'fiber', fibres: 'fibers', theatre: 'theater', sombre: 'somber', calibre: 'caliber', spectre: 'specter', lustre: 'luster', meagre: 'meager',
  // manoeuvre
  manoeuvre: 'maneuver', manoeuvres: 'maneuvers', manoeuvred: 'maneuvered', manoeuvring: 'maneuvering', manoeuvrable: 'maneuverable', manoeuvrability: 'maneuverability',
  // practise (the verb) → practice
  practise: 'practice', practises: 'practices', practised: 'practiced', practising: 'practicing',
  // -ce → -se
  licence: 'license', licences: 'licenses', defence: 'defense', offence: 'offense', pretence: 'pretense',
  // doubled l
  travelled: 'traveled', travelling: 'traveling', traveller: 'traveler', travellers: 'travelers', cancelled: 'canceled', cancelling: 'canceling',
  modelled: 'modeled', modelling: 'modeling', labelled: 'labeled', labelling: 'labeling', signalled: 'signaled', signalling: 'signaling',
  levelled: 'leveled', levelling: 'leveling', fuelled: 'fueled', fuelling: 'fueling', marvellous: 'marvelous', jewellery: 'jewelry',
  totalled: 'totaled', channelled: 'channeled', tunnelled: 'tunneled', quarrelled: 'quarreled', counsellor: 'counselor', dialled: 'dialed', dialling: 'dialing',
  skilful: 'skillful', skilfully: 'skillfully', wilful: 'willful', fulfil: 'fulfill', fulfils: 'fulfills', enrol: 'enroll', instalment: 'installment',
  // assorted
  grey: 'gray', greys: 'grays', greyed: 'grayed', greyish: 'grayish', draught: 'draft', draughts: 'drafts', mould: 'mold', moulded: 'molded', moulding: 'molding',
  aluminium: 'aluminum', programme: 'program', programmes: 'programs', ageing: 'aging', judgement: 'judgment', judgements: 'judgments', catalogue: 'catalog',
  anticlockwise: 'counterclockwise', artefact: 'artifact', artefacts: 'artifacts', sulphur: 'sulfur', speciality: 'specialty', plough: 'plow', sceptical: 'skeptical',
  analyse: 'analyze', analysed: 'analyzed', analyses_verb: null, analysing: 'analyzing', paralyse: 'paralyze', paralysed: 'paralyzed', catalyse: 'catalyze',
  learnt: 'learned', spelt: 'spelled', whilst: 'while', amongst: 'among', tyre: 'tire', tyres: 'tires', kerb: 'curb', storey: 'story', cheque: 'check'
};
delete WORDS.analyses_verb; // ("analyses" is also the plural noun, as in the US)
/** -ise → -ize: the stems that take it (a general -ise rule would catch rise, wise, precise, cruise…). */
const ISE = ['real', 'recogn', 'organ', 'apolog', 'minim', 'maxim', 'optim', 'priorit', 'emphas', 'summar', 'standard', 'custom', 'visual', 'normal',
  'synchron', 'initial', 'final', 'util', 'categor', 'memor', 'stabil', 'neutral', 'critic', 'character', 'special', 'general', 'local', 'personal',
  'familiar', 'author', 'equal', 'harmon', 'ideal', 'jeopard', 'legal', 'modern', 'mobil', 'motor', 'random', 'scrutin', 'symbol', 'sympath', 'theor',
  'vapor', 'vandal', 'author', 'capital', 'central', 'civil', 'colon', 'econom', 'energ', 'fertil', 'formal', 'global', 'hospital', 'human', 'immun',
  'industrial', 'item', 'margin', 'material', 'maxim', 'mesmer', 'naturl', 'penal', 'polar', 'popular', 'rational', 'revital', 'romantic', 'sensit',
  'serial', 'social', 'steril', 'subsid', 'tantal', 'terror', 'trivial', 'vocal', 'western', 'agon', 'anglic', 'antagon', 'baptis', 'computer', 'digit',
  'dramat', 'emphas', 'galvan', 'hypothes', 'italic', 'magnet', 'polar', 'rubber', 'satir', 'scrutin', 'stigmat', 'summar', 'synthes', 'utopian'];
const ISE_RE = new RegExp(`\\b(${[...new Set(ISE)].join('|')})is(e|es|ed|ing|ation|ations|er|ers|able)\\b`, 'gi');
/** Phrases left alone: names the owner gave, and proper names spelled the UK way (add here, with why). */
const KEEP = [/Royal\s+\w+\s+Yacht\s+Squadron/gi, /\bGreyhound\b/g,
  // file names and paths (src/boat/colours.ts is a file, whatever its spelling), and ids with an underscore
  /[\w.-]*\/[\w./-]+|\b[\w-]+\.(ts|cjs|js|mjs|md|png|html|json|css)\b/g, /\b\w+_\w+\b/g,
  // HTML attributes that are code, not text (class, id, data-…; the title, aria-label and placeholder are read, so not these)
  /\b(?:class|id|for|name|type|value|href|src|role|data-[\w-]+)=("[^"]*"|'[^']*')/g];

const WORD_RE = new RegExp(`\\b(${Object.keys(WORDS).join('|')})\\b`, 'gi');
const caseLike = (from, to) => from === from.toUpperCase() && from.length > 1 ? to.toUpperCase() : from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
/** Fix a piece of text; `hits` collects what changed. */
function usText(t, hits) {
  const kept = []; let s = t;
  KEEP.forEach(re => { s = s.replace(re, m => { kept.push(m); return `\u0000${kept.length - 1}\u0000`; }); });
  s = s.replace(WORD_RE, m => { const to = caseLike(m, WORDS[m.toLowerCase()]); hits.push(`${m} → ${to}`); return to; });
  s = s.replace(ISE_RE, (m, stem, end) => { const to = `${stem}iz${end}`; hits.push(`${m} → ${to}`); return to; });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[+i]);
}

/**
 * The prose spans of a TypeScript file: its string and template literals (the text parts, not the ${…} inside) that
 * hold a space. A small scanner of its own (the repo's TypeScript is the native compiler, with no JS API): it skips
 * comments and regular expressions, and follows templates nested in templates.
 */
function tsSpans(src) {
  const out = [], n = src.length;
  // (prose holds a space; a lone word is a label if it's capitalized, 'Traveller', else likely a key, 'traveller')
  const push = (a, b) => { const t = src.slice(a, b); if (/\s/.test(t) || /^[A-Z][a-z]/.test(t)) out.push([a, b]); };
  let i = 0, prev = ''; // prev: the last significant character, to tell a regex's / from a division
  const stack = []; // for each open ${ … }: the brace depth inside it
  let depth = 0;
  const template = () => { // at the character after ` or after the } that closes a ${
    const a = i;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { push(a, i); i++; prev = '`'; return; }
      if (c === '$' && src[i + 1] === '{') { push(a, i); i += 2; stack.push(depth); depth = 0; prev = '{'; return; }
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const a = i + 1; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      // (an import's path isn't prose)
      if (!/\b(import|from)\s*$/.test(src.slice(Math.max(0, a - 12), a - 1))) push(a, i);
      i++; prev = c; continue;
    }
    if (c === '`') { i++; template(); continue; }
    if (c === '{') { depth++; i++; prev = c; continue; }
    if (c === '}') {
      if (stack.length && depth === 0) { depth = stack.pop(); i++; template(); continue; }
      depth--; i++; prev = c; continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\b(return|typeof|case|of|in)\s*$/.test(src.slice(Math.max(0, i - 8), i)))) {
      i++; let cls = false;
      while (i < n && src[i] !== '\n') { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; i++; }
      i++; while (i < n && /[a-z]/i.test(src[i])) i++; prev = 'r'; continue;
    }
    prev = c; i++;
  }
  return out;
}
/** The text of HTML: everything outside tags, scripts and styles, and the attributes a player reads. */
function htmlSpans(src) {
  const out = [], skip = [];
  for (const m of src.matchAll(/<(script|style)\b[\s\S]*?<\/\1>/gi)) skip.push([m.index, m.index + m[0].length]);
  const inSkip = i => skip.some(([a, b]) => i >= a && i < b);
  let i = 0;
  for (const m of src.matchAll(/<[^>]*>/g)) {
    if (m.index > i && !inSkip(i)) out.push([i, m.index]);
    for (const a of m[0].matchAll(/\b(title|aria-label|placeholder|alt|data-tip)="([^"]*)"/g)) { const s = m.index + a.index + a[0].indexOf('"') + 1; if (!inSkip(s)) out.push([s, s + a[2].length]); }
    i = m.index + m[0].length;
  }
  if (i < src.length) out.push([i, src.length]);
  return out;
}
/** Markdown outside fenced code and inline code. */
function mdSpans(src) {
  const out = []; let i = 0;
  for (const m of src.matchAll(/```[\s\S]*?```|`[^`\n]*`/g)) { if (m.index > i) out.push([i, m.index]); i = m.index + m[0].length; }
  if (i < src.length) out.push([i, src.length]);
  return out;
}

const walk = (d, re) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), re) : re.test(e.name) ? [path.join(d, e.name)] : []);
const files = [
  ...walk(path.join(ROOT, 'src'), /\.ts$/).map(f => [f, tsSpans]),
  [path.join(ROOT, 'index.html'), htmlSpans],
  ...['README.md', 'ROADMAP.md'].map(f => [path.join(ROOT, f), mdSpans]),
  ...walk(path.join(ROOT, 'docs'), /\.md$/).map(f => [f, mdSpans])
].filter(([f]) => fs.existsSync(f));

let total = 0;
for (const [f, spans] of files) {
  const src = fs.readFileSync(f, 'utf8'), sp = spans(src, f).sort((a, b) => a[0] - b[0]);
  let out = '', at = 0; const found = [];
  for (const [a, b] of sp) {
    if (a < at) continue;
    const hits = [], fixed = usText(src.slice(a, b), hits);
    if (hits.length) { const line = src.slice(0, a).split('\n').length; found.push(...hits.map(h => `${path.relative(ROOT, f)}:${line}  ${h}`)); }
    out += src.slice(at, a) + fixed; at = b;
  }
  out += src.slice(at);
  if (found.length) { total += found.length; console.log(found.join('\n')); if (FIX) fs.writeFileSync(f, out); }
}
console.log(total ? `${total} UK spelling${total === 1 ? '' : 's'}${FIX ? ' changed' : ' (node scripts/check/spelling.cjs --fix)'}` : 'US spelling throughout');
process.exit(total && !FIX ? 1 : 0);
