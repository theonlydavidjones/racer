import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
import { DEFAULT_KEYS, ACTIONS } from '../src/ui/keys';

const html = readFileSync('index.html', 'utf8') as string;
const ids = (chunk: string) => [...chunk.matchAll(/<button[^>]* id="(b[A-Za-z]+)"/g)].map(m => m[1]);

describe('the game surface (r271, owner game surface, 20 Nov)', () => {
  it('bottom right, from the left: pause, speed, sound, tools, the view, exit (exit in the corner)', () => {
    const bar = html.slice(html.indexOf('id="viewBar"'), html.indexOf('id="crewPop"'));
    const order = ids(bar).filter(i => ['bPause', 'bFast', 'bSound', 'bTools', 'bView', 'bExit'].includes(i));
    expect(order).toEqual(['bPause', 'bFast', 'bSound', 'bTools', 'bView', 'bExit']);
    expect(html).not.toContain('id="appBar"');
  });
  it('the crew button is with the autopilot, bottom left', () => {
    const helm = html.slice(html.indexOf('id="helmBar"'), html.indexOf('class="row2"'));
    expect(ids(helm)).toContain('bCrew');
    expect(ids(helm).indexOf('bCrew')).toBe(ids(helm).indexOf('bPilot') + 1);
  });
  it('speed is one button with a key, and has left Tools', () => {
    expect(html).toMatch(/id="bFast" type="button" ><svg/);
    expect(DEFAULT_KEYS.speed).toEqual(['Shift+Y']);
    expect(ACTIONS.some(a => a.id === 'speed')).toBe(true);
    // no other action takes the key
    for (const [a, ks] of Object.entries(DEFAULT_KEYS)) if (a !== 'speed') expect(ks).not.toContain('Shift+Y');
    expect(readFileSync('src/ui/toolsTray.ts', 'utf8')).not.toContain('data-speed');
  });
});
