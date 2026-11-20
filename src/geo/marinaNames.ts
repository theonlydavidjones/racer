/**
 * The Bay's marinas as the player reads their names (r274; the owner's picks, 20 Nov 2026; docs/FTUE-BRIEF.md §2): a
 * marina owned by a city, county, port district or park keeps its real name; a privately owned one goes by a parody, a
 * nod to the place, never the real mark; one whose owner isn't confirmed goes by its parody until it is. Keyed by an
 * internal id that never changes (the game's own harbors by geo/marina.ts's ids). The real private names live only in
 * tests/marinaNames.test.ts and docs/marinas/ (not shipped). Owners and sources: docs/marinas/research-*.md.
 */
export interface MarinaName {
  /** What the player reads. */
  name: string;
  /** Who owns it, as sourced: 'public' (real name), 'private' (parody), 'unknown' (parody until confirmed). */
  owner: 'public' | 'private' | 'unknown';
  /** Beyond the Bay proper (the North Bay's rivers and the Carquinez Strait): how far the game goes there isn't decided. */
  edge?: true;
}
const P = (name: string, edge = false): MarinaName => ({ name, owner: 'private', ...(edge ? { edge: true as const } : {}) });
const U = (name: string): MarinaName => ({ name, owner: 'unknown' });
const R = (name: string, edge = false): MarinaName => ({ name, owner: 'public', ...(edge ? { edge: true as const } : {}) });

export const MARINA_NAMES: Record<string, MarinaName> = {
  // San Francisco
  'west-harbor': R('West Harbor, San Francisco Marina'), // (SF Recreation and Parks)
  'gashouse-cove': R('Gashouse Cove, San Francisco Marina'), // (SF Recreation and Parks)
  'south-beach': R('South Beach Harbor'), // (Port of San Francisco)
  'hyde-street': R('Hyde Street Harbor'), // (Port of San Francisco; commercial fishing first)
  'pier-39': P("Fisherman's Wharf Marina"), // (the owner: Fisherman's Wharf; labeled apart from Hyde Street Harbor)
  'treasure-isle': R('Treasure Isle Marina'), // (San Francisco's land, a private operator: the owner's rule, ownership)
  // Marin
  'horseshoe-bay': R('Travis Marina, Horseshoe Bay'), // (National Park Service land)
  'clipper-sausalito': P('Schooner Yacht Harbor'),
  'sausalito-yh': P('Little Willow Yacht Harbor'),
  'pelican-sausalito': P('Heron Harbor'), // (the owner's pick)
  'schoonmaker': U('Shipwright Point Marina'),
  'richardson-bay-marina': U('Houseboat Row Marina'),
  'blue-water-sausalito': U('Deep Water Yacht Harbor'),
  'paradise-cay': U('Eden Cay Yacht Harbor'),
  'san-rafael-yh': U('Archangel Yacht Harbor'), // (the real name once the city's ownership is confirmed)
  'loch-lomond': P('Loch Tay Marina'), // (the owner's pick)
  // Richmond
  'brickyard-marina': P('Kiln Cove Marina'),
  'marina-bay-richmond': R('Marina Bay Yacht Harbor'), // (City of Richmond's land, leased)
  // East Bay
  'berkeley': R('Berkeley Marina'), // (City of Berkeley)
  'emeryville-marina': U('Mudflat Marina'), // (listed public: the real name once its owner is confirmed)
  'emery-cove': P('Mudflat Cove Yacht Harbor'),
  'jack-london': R('Jack London Square Marina'), // (Port of Oakland)
  'marina-village': P('Harbor Town Yacht Harbor'),
  'fortmann': P('Fortitude Marina'), // (the owner's pick)
  'grand-marina': P('Great Street Marina'),
  'alameda-marina': R('Alameda Marina'), // (the owner: real; partly the City of Alameda's land)
  'ballena-isle': P('Humpback Isle Marina'),
  'san-leandro': R('San Leandro Marina'), // (City of San Leandro)
  // South Bay and the Peninsula
  'oyster-point': R('Oyster Point Marina'), // (San Mateo County Harbor District)
  'brisbane': U('Mountain Point Marina'), // (the real name once the city's ownership is confirmed)
  'coyote-point': R('Coyote Point Marina'), // (San Mateo County)
  'redwood-city': R('Redwood City Municipal Marina'), // (Port of Redwood City)
  'westpoint': P('Slough Point Harbor'),
  // The North Bay, beyond the Bay proper
  'vallejo': R('Vallejo Municipal Marina', true), // (City of Vallejo)
  'benicia': R('Benicia Marina', true), // (City of Benicia)
  'glen-cove': P('Glen Hollow Marina', true),
  'napa-valley': P('Napa Valley Marina', true) // (privately owned, its real name kept: the owner, "a place name; just use it")
};
