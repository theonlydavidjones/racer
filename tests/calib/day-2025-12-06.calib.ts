import { it } from 'vitest';
import { REAL_DAYS, raceDay } from './harness';
it('the AI fleet on 2025-12-06', () => { raceDay(REAL_DAYS[1], [1, 2]); });
