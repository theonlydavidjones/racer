import { it } from 'vitest';
import { CENSUS_DAYS, censusDay } from './census';
it('the foul census on 2026-03-07', () => { censusDay(...CENSUS_DAYS[2]); });
