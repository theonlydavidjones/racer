// The tests sail umpired unless they say otherwise. On-the-water judging defaults to Protests for a club's race (the
// owner, 13 Nov 2026), where an AI boat may decline her penalty (ai/conduct.ts): the rule, AI and whole-race tests
// measure the races as the engine calls them, so they keep the umpired default. Protests have their own tests
// (tests/protests.test.ts, hearing.test.ts), which set it. (The race pool's threads, tests/helpers/races.ts, set it too.)
import { DEFAULT_SETTINGS } from '../../src/settings';
DEFAULT_SETTINGS.judging = 'umpired';
