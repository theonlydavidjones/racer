import { describe, expect, it } from 'vitest';

const SRC = import.meta.glob(['../src/ui/*.ts', '../src/sim/world.ts', '../src/app.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// the owner (r256): "what does 'up here' mean?": a toast says where and why in the boat's own terms, not "up here"
describe('toasts and tips', () => {
  it('use no vague place words ("up here", "down here") in code lines (comments may)', () => {
    for (const [f, text] of Object.entries(SRC))
      for (const line of text.split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        const code = line.replace(/\/\/.*$/, '');
        expect(code, f).not.toMatch(/\b(up|down) here\b/i);
      }
  });
  it('the pole toast names the point of sail', () => {
    expect(SRC['../src/ui/hud.ts']).toContain('Poled out on a broad reach');
  });
});
