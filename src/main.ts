/**
 * Start-up: bring back your saves (kept with your account on the published sim: store/cloud.ts) before the app reads
 * them, then start the app.
 */
import { hydrate } from './store/cloud';

await hydrate();
await import('./app');
