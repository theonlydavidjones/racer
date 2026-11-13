import { it } from 'vitest';
import { REAL_DAYS, raceDay } from './harness';
it('the AI fleet on 2025-11-01', () => { raceDay(REAL_DAYS[0], [1, 2]); });
