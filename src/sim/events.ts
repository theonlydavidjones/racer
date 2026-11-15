import type { Boat } from '../boat/boat';
import type { Incident } from '../rules/types';
import type { Frame } from '../replay/recorder';

/** Things the simulation tells the UI about. The sim never touches the DOM or audio itself. */
export type SimEvent =
  | { type: 'toast'; msg: string; ms?: number }
  | { type: 'horn'; dur: number; delayMs?: number }
  | { type: 'incident'; a: Boat; b: Boat; incident: Incident<Boat>; frames: Frame[]; wind: number }
  | { type: 'finished' }
  /** Your boat is wrecked (docs/WRECK-PROPOSAL.md): the page says how and where, and offers ashore, a tow or carrying on. */
  | { type: 'wrecked'; how: string; where: string };

export type Emit = (e: SimEvent) => void;
