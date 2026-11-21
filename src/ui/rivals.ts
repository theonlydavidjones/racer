/**
 * The boats her rule notes can be about (#19 of the first-hour audit): the others in the race, never herself, however
 * she's sailed (on the AI's skipper she isn't marked as the user's, and was once compared with herself: "You're windward
 * of USA 000", her own number). A ghost isn't one: it's drawn on the page, not in the race (replay/ghost.ts), so it's
 * never among the race's boats.
 */
export const rivals = <B extends { isUser?: boolean }>(boats: readonly B[], her: B): B[] => boats.filter(o => o !== her && !o.isUser);
