import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';

// The compass bar (z-index 4) was painting over the top of any dialog, the motor dialog's title among them. As the sail band
// does, it stands aside while a dialog is open.
const css = (readFileSync('src/styles/07-band.css', 'utf8') + readFileSync('src/styles/18-layout-d.css', 'utf8')) as string;
describe('the compass bar stands aside while a dialog is open', () => {
  it('hidden under an open overlay, as the sail band is', () => {
    expect(css).toMatch(/body:has\(\.overlay:not\(\[hidden\]\)\)[^{]*#compassBar[^{]*\{visibility:hidden\}/);
    expect(css).toMatch(/body:has\(\.overlay:not\(\[hidden\]\)\) \.sailband/);
  });
});
