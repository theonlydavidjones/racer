/**
 * Hover text is one short line (the owner's rule on copy, 13 Nov 2026; the in-race audit's item 10, 21 Nov): a long one is
 * cut at the last sentence or clause that fits, else at a word. What matters is in the page itself, or behind a Why?.
 */
export const TIP_MAX = 110;
export function shortTip(t: string, max = TIP_MAX): string {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  // the last place a sentence or a clause ends (not a ";" : it ends an entity too)
  let cut = -1;
  for (const m of head.matchAll(/(\.\s|\s·\s|:\s)/g)) if (m.index! >= 40 && m.index! <= max) cut = m.index!;
  if (cut > 0) return head.slice(0, cut).replace(/[.:\s·]+$/, '');
  let w = head.lastIndexOf(' ', max - 1); if (w < 20) w = max - 1;
  let out = head.slice(0, w).replace(/[\s,;:·]+$/, '');
  const amp = out.lastIndexOf('&'); if (amp > out.length - 8 && !out.slice(amp).includes(';')) out = out.slice(0, amp).trimEnd(); // (never half an entity)
  return out + '…';
}

/** The preparatory flags' hovers by hand (RRS 30): the penalty and the rule number are what a plain cut dropped. */
export const PREP_TIP: Record<string, string> = {
  P: 'P: the usual start. Over at the gun, return and start (Rule 29.1)',
  I: 'I (30.1): on the course side in the last minute, go round an end to start',
  Z: 'Z (30.2): in the triangle in the last minute, a 20% scoring penalty',
  U: 'U (30.3): in the triangle in the last minute, disqualified',
  black: 'Black (30.4): in the triangle in the last minute, disqualified, even after a general recall'
};

/** The past-race caveats' hovers by hand (the Coordinator's rulings, 21 Nov): the figures stay, the explanation goes. A string
 *  in a shape not seen here falls back to the plain cut. */
export function uncertainTip(s: string): string {
  const m = s.match(/course (\d+) as the sheet draws it, a perfect boat in the wind observed at [^(]*\((\d+) kt[^)]*\)[^.]*?takes about (\d+) min, slower than every real finisher \((\d+–\d+) min\)/);
  return m ? `Course ${m[1]} as drawn: a perfect boat takes ${m[3]} min in ${m[2]} kt, slower than every finisher (${m[4]} min)` : shortTip(s);
}
export function doubtTip(s: string): string {
  const m = s.match(/course (\d+) as ([\d.]+) nm; the [^,]*sheet, drawn here, has it as ([\d.]+) nm/);
  return m ? `Results say ${m[2]} nm; the sheet, drawn here, says ${m[3]} nm` : shortTip(s);
}
export function courseFromTip(s: string): string {
  const q = s.match(/"([^"]+?)[."]?"?(?:\s*\(|$)/);
  return q ? `A sailor who raced it: "${q[1].replace(/\.\s.*$/, '')}"` : shortTip('The course from ' + s);
}
