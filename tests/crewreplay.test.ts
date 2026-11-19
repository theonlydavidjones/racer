import { describe, expect, it } from 'vitest';
import { replayDeepest, type CrewRecording } from './helpers/crewReplay';
import HELM_TACK from './fixtures/crew-helm-tack-14kt.json';
import SIDE_DECK from './fixtures/crew-sidedeck-8kt.json';
import EDGE_1 from './fixtures/crew-cabinedge-20kt-1.json';
import EDGE_2 from './fixtures/crew-cabinedge-20kt-2.json';
import EDGE_3 from './fixtures/crew-cabinedge-20kt-3.json';
import FOREDECK from './fixtures/crew-foredeck-8kt.json';

// The sprint's soak (19 Nov 2026, Crew Habits' harness, seed 3, west, real sea), replayed: stretches of its races recorded
// frame by frame from the harness (each person's place, pose, lean, goal and job, her heel, the windward side, tacking,
// the crew's clock), drawn again as the game draws them (syncCrew). No bone of any figure more than crewfig's 2.5 cm into
// the boat (true depth) in any frame, after half a second to settle from where the figures are built.
describe('The soak, replayed: the crew clear of the boat (render/crew.ts)', () => {
  // (the race at 14 kt, Red, 172.5 to 175.5 s: the helm crossed the after deck in a tack and sat down on the new side with
  // a foot still up on the deck by the hip; the knee swung round under it, through the deck, up to 18 cm at 174.68 s)
  it('the helm sat down after the tack, 14 kt', () => {
    expect(replayDeepest(HELM_TACK as unknown as CrewRecording, 173)).toBe('');
  }, 120_000);
  // (the race at 8 kt, Red, 146.5 to 149 s: the forward hand on the way forward along the port side deck beside the cabin;
  // a knee bent in toward the cabin's side, the shin 5 to 7 cm into it at 148.1 s)
  it('forward along the side deck beside the cabin, 8 kt', () => {
    expect(replayDeepest(SIDE_DECK as unknown as CrewRecording, 147)).toBe('');
  }, 120_000);
  // (the race at 20 kt, Red, running: the forward hand stepping in off the side deck at the cockpit's forward end to the
  // middle, a hand forward on the cabin top past its after edge; the forearm across the edge, 5 to 7 cm, at 425.7, 588.6
  // and 655.7 s)
  for (const [rec, at] of [[EDGE_1, 425], [EDGE_2, 588], [EDGE_3, 655]] as const) it(`in off the side deck past the cabin's after edge, 20 kt (${at} s)`, () => {
    expect(replayDeepest(rec as unknown as CrewRecording, at)).toBe('');
  }, 120_000);
  // (the race at 8 kt, Red, 552 to 558.6 s: the forward hand on the foredeck, turning to come aft to the main Cunningham,
  // getting up; a shin down through the deck, 5 to 9 cm, from 558.2 s)
  it('turning on the foredeck to come aft, 8 kt', () => {
    expect(replayDeepest(FOREDECK as unknown as CrewRecording, 553)).toBe('');
  }, 120_000);
});
