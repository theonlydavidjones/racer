/**
 * The results' line on the rules: what you broke, and the penalties you took for it.
 *
 * RRS 2025–2028, rule 44.1: a boat "may take a Two-Turns Penalty when she may have broken one or more rules of Part 2
 * in an incident while racing", or a One-Turn Penalty for rule 31. Taking it doesn't undo the breach: it spares her a
 * further penalty for that incident (at a hearing, 60.5(c)(2): "no further penalty"). So the line counts every rule
 * broken, with the penalties taken beside it, and names any breach left without one: the one a protest can still cost
 * her (60.5(c)), or that an umpire's call already has (UF3.4).
 */
export interface Breach { rule: string; taken: boolean }

const list = (rs: string[]) => (rs.length > 1 ? `rules ${rs.slice(0, -1).join(', ')} and ${rs[rs.length - 1]}` : `rule ${rs[0]}`);

export function breachLine(bs: readonly Breach[], against: number): string {
  const n = bs.length, taken = bs.filter(b => b.taken).length, left = bs.filter(b => !b.taken).map(b => b.rule);
  const them = `Broken against you: ${against}.`;
  if (!n) return `Rules you broke: none. ${them}`;
  const head = `Rules you broke: ${n} (${list(bs.map(b => b.rule))}). Penalties taken: ${taken}.`;
  return `${head}${left.length ? ` No penalty taken for ${list(left)}.` : ''} ${them}`;
}

/**
 * Your breaches from the race (World.breaches) with the hearings' findings against you folded in: a protest the hearing
 * upholds is a breach found (60.5(c)), and its turns taken or not as the protest recorded them. One incident is one
 * breach (same time, same rule).
 */
export function withHearings(bs: readonly (Breach & { t: number })[], found: readonly { t: number; rule: string | null; taken: boolean }[]): Breach[] {
  const out = bs.map(b => ({ ...b }));
  for (const f of found) {
    if (f.rule == null) continue;
    const same = out.find(b => Math.abs(b.t - f.t) < 1 && (b.rule === f.rule || b.rule.startsWith(f.rule + '.') || b.rule.startsWith(f.rule + '(')));
    if (same) same.taken ||= f.taken; else out.push({ t: f.t, rule: f.rule, taken: f.taken });
  }
  return out.sort((a, b) => a.t - b.t);
}
