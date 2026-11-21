/**
 * Start-up: bring back your saves (kept with your account on the published sim: store/cloud.ts) before the app reads
 * them, then start the app.
 */
import { hydrate } from './store/cloud';
// the page's styles first, so the start page is drawn as itself (marked loading) while your saves come back and the app
// loads (the published page has them inline already: scripts/make-artifact.mjs)
import './styles.css';

// WebKit on a touch screen (an iPad) shows a button's pressed look (:active) only when the page listens for touches;
// this empty listener turns that on. Desktop Safari and Chrome press buttons the same with or without it.
document.addEventListener('touchstart', () => {}, { passive: true });

await hydrate();
await import('./app');
