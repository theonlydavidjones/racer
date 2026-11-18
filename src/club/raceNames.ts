import data from './data/real-race-names.json';

/**
 * A branded race's name as the player reads it: the owner's parody of the real name in the published results
 * (club/data/real-race-names.json; the real names live only there). A name with no parody comes back as it is.
 */
const RULES = (data as unknown as { replace: [string, string][] }).replace.map(([re, to]) => [new RegExp(re), to] as const);
export const raceDisplayName = (name: string): string => RULES.reduce((s, [re, to]) => s.replace(re, to), name).trim();
