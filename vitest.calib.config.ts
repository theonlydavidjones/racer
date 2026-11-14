import { defineConfig } from 'vitest/config';

// The skipper model's calibration (docs/SKIPPER-MODEL-PROPOSAL.md): whole races on the real Seaweed Soup days, too
// slow for `npm test`. `npm run calibrate` races them (one file a day, in parallel), then summarises against the real
// fleet (CALIB_SUMMARY=1).
export default defineConfig({
  test: {
    // (CALIB_MODE=census: the foul census, tests/calib/census.ts; census-summary: its report)
    include: process.env.CALIB_MODE === 'census' ? ['tests/calib/census-2*.calib.ts'] : process.env.CALIB_MODE === 'census-summary' ? ['tests/calib/census-summary.calib.ts']
      : process.env.CALIB_SUMMARY ? ['tests/calib/summary.calib.ts'] : ['tests/calib/day-*.calib.ts'],
    testTimeout: 3_600_000
  }
});
