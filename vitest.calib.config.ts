import { defineConfig } from 'vitest/config';

// The skipper model's calibration (docs/SKIPPER-MODEL-PROPOSAL.md): whole races on the real Seaweed Soup days, too
// slow for `npm test`. `npm run calibrate` races them (one file a day, in parallel), then summarises against the real
// fleet (CALIB_SUMMARY=1).
export default defineConfig({
  test: {
    include: process.env.CALIB_SUMMARY ? ['tests/calib/summary.calib.ts'] : ['tests/calib/day-*.calib.ts'],
    testTimeout: 3_600_000
  }
});
