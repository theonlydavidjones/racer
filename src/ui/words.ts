/** A count and its word, plural past one: "1 tack", "2 tacks". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
/**
 * A passage's turns in one wording wherever it's shown (w034: the navigator's readout and the plan chart said them two
 * ways): "2 tacks and 1 jibe", "3 tacks", "1 jibe", or '' for none.
 */
export const turnsWord = (tacks: number, jibes: number): string =>
  [tacks ? plural(tacks, 'tack') : '', jibes ? plural(jibes, 'jibe') : ''].filter(Boolean).join(' and ');
