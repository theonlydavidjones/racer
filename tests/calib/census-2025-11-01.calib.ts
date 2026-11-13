import { it } from 'vitest';
import { CENSUS_DAYS, censusDay } from './census';
it('the foul census on 2025-11-01', () => { censusDay(...CENSUS_DAYS[0]); });
