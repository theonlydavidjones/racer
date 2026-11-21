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
