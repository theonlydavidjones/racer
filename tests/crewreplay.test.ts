import { describe, expect, it } from 'vitest';
import { mirrored, replayArmInTorso, replayDeepest, replayHelmKnee, type CrewRecording } from './helpers/crewReplay';
import HELM_TACK from './fixtures/crew-helm-tack-14kt.json';
import SIDE_DECK from './fixtures/crew-sidedeck-8kt.json';
import EDGE_1 from './fixtures/crew-cabinedge-20kt-1.json';
import EDGE_2 from './fixtures/crew-cabinedge-20kt-2.json';
import EDGE_3 from './fixtures/crew-cabinedge-20kt-3.json';
import FOREDECK from './fixtures/crew-foredeck-8kt.json';
import SITOUT from './fixtures/crew-sitout-arm-12kt.json';

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
  // (and seated after that tack, the foot still up on the after deck by the hip from crossing comes down to its place in
  // the cockpit as they sit, not slid there over most of a second with the knee folded up to the chest (the owner, 19 Nov
  // 2026: "fix it"). Once they're down on the deck (174.6 s on), the knees no higher than 0.9 m: sat there with both feet
  // in the cockpit they're at 0.75; with the foot left up by the hip, the knee was held at 1.0 to 1.13 until 175.2 s)
  // (on both tacks: the recording's own, onto starboard, and its mirror, onto port)
  for (const [tack, rec] of [['starboard', HELM_TACK as unknown as CrewRecording], ['port', mirrored(HELM_TACK as unknown as CrewRecording)]] as const) {
    it(`the helm sat down after the tack onto ${tack}, 14 kt: the foot off the after deck, the knee not up at the chest`, () => {
      expect(replayHelmKnee(rec, 174.6)).toBeLessThan(0.9);
    }, 120_000);
    it(`the helm sat down after the tack onto ${tack}, 14 kt: clear of the boat`, () => {
      expect(replayDeepest(rec, 173)).toBe('');
    }, 120_000);
  }
});

// The crew audit (21 Nov 2026, docs/crew/crew-audit.md item 7): the race at 12 kt, Green, 945 to 952 s, close-hauled. The
// main hand sat out on the side deck, leant a little out (lean 0.25: onDeck's sitting-out pose, short of hikeHold's), one
// hand on the coaming and the other "across the chest, on the sheet": 0.12 m in front of the hips at the chest's height,
// and leant back, inside the chest; the left hand always, from the aft shoulder across. An arm in the chest up to 12.7 cm.
// Out of the torso, but for an elbow's brush (crewarms' capsule is a jacketed chest's, 3 cm allowed).
describe('The crew audit, replayed: sat out, the arms in front of the chest (render/crew.ts onDeck)', () => {
  for (const [tack, rec] of [['as sailed', SITOUT], ['mirrored', mirrored(SITOUT as unknown as CrewRecording)]] as const)
    it(`the main hand sat out on the side deck, 12 kt, ${tack}`, () => {
      const r = replayArmInTorso(rec as unknown as CrewRecording, 946);
      expect(r.into, r.at).toBeLessThan(0.03);
    }, 120_000);
});
