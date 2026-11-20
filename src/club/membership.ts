import { CLUB_TABLE, clubInfo, type ClubInfo } from './clubs';
import type { BoatSpec } from '../boat/spec';

/**
 * Membership (r276; the owner, 20 Nov 2026): you belong to one yacht club at a time and can switch any time, free. A
 * season's races need membership of a yacht club, any one, not the sponsor's ("very few races that I know of require
 * people to be members of the sponsor club. you just have to be a member of a yacht club of any kind"). Practice is
 * open to everyone. (Events gated otherwise, such as qualifying by winning others, are a later rule.)
 */

/** The clubs you can join: the owner's racing clubs (tier 1). Clubs players start come later (r277). */
export const joinableClubs = (): ClubInfo[] => CLUB_TABLE.filter(c => c.tier === 1);

/** Your club, or undefined for none (an id we don't know counts as none). */
export const myClub = (S: { club?: string }): ClubInfo | undefined => {
  const c = clubInfo(S.club); return c && c.tier === 1 ? c : undefined;
};

/** A season's races are open to members of any yacht club. */
export const canEnterSeason = (S: { club?: string }): boolean => !!myClub(S);

/**
 * A save from before membership: you belong to the club your boats fly the burgee of (the one most of them fly; the
 * boat you sail breaks a tie), so a returning player's season stays open. None of them a racing club's: no club.
 */
export function clubFromBoats(boats: readonly Pick<BoatSpec, 'id' | 'club'>[], sailing?: string): string {
  const n = new Map<string, number>();
  for (const b of boats) if (clubInfo(b.club)?.tier === 1) n.set(b.club, (n.get(b.club) ?? 0) + 1);
  if (!n.size) return '';
  const top = Math.max(...n.values()), mine = boats.find(b => b.id === sailing)?.club;
  return mine && n.get(mine) === top ? mine : [...n].find(([, k]) => k === top)![0];
}

/**
 * Join (or switch to) a club, or leave ('' ): your boats fly its burgee, all of them, whoever skippers them (the owner,
 * 20 Nov 2026, r273: a boat flies her owner's club burgee; the club isn't set per boat). The club's own fleet, its stock
 * and generic boats, keep their clubs: they aren't yours.
 */
export function setClub<T extends { club?: string; boats: BoatSpec[]; boat: BoatSpec; boatId: string }>(S: T, id: string): void {
  S.club = id;
  S.boats = S.boats.map(b => b.club === id ? b : { ...b, club: id });
  S.boat = S.boats.find(b => b.id === S.boatId) ?? S.boats[0];
}
