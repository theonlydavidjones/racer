import { it } from 'vitest';
import { CENSUS_DAYS, censusDay } from './census';
it('the foul census on 2025-12-06', () => { censusDay(...CENSUS_DAYS[3]); });
