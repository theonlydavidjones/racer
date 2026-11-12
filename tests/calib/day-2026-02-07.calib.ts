import { it } from 'vitest';
import { REAL_DAYS, raceDay } from './harness';
it('the AI fleet on 2026-02-07', () => { raceDay(REAL_DAYS[2], [1, 2]); });
