import { it } from 'vitest';
it('west harbor slips swell', async () => {
  const S = await import('../src/environment/sea');
  const { SLIPS } = await import('../src/geo/marina');
  const f = new S.SeaField({ hs: 2.0, tp: 13.3, from: 273 });
  for (const id of ['west-harbor', 'gashouse-cove', 'horseshoe-bay', 'corinthian']) {
    const hs = SLIPS.filter(s => s.marina === id).map(s => f.at(s.p, { from: 270, kt: 15 } as any, { x: 0, y: 0 }, () => ({ x: 0, y: 0 })).hsS);
    hs.sort((a, b) => a - b);
    console.log(id, 'slips', hs.length, 'swell Hs at slips: min', hs[0]?.toFixed(3), 'median', hs[hs.length >> 1]?.toFixed(3), 'max', hs[hs.length - 1]?.toFixed(3));
  }
}, 600000);
