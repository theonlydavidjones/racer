// The stability soak (scripts/soak/soak.ts), run under vitest for its module loading. Skipped unless SOAK_OUT is set.
import { it } from 'vitest';
it.skipIf(!(globalThis as any).process.env.SOAK_OUT)('soak', async () => { (await import('../scripts/soak/soak')).soak(); }, 6 * 3_600_000);
