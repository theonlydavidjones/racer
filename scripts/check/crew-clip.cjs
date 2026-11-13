#!/usr/bin/env node
/**
 * Clips of the crew over half a minute each (scripts/check/crewclip): a cruise on the tiller pilot close-hauled in a
 * breeze, on a run in a breeze and on a reach in light air, and an AI boat racing, in the Bay's westerly and its sea.
 * Needs the dev server. Writes out-dir/<case>.mp4 (15 fps, drawn every 1/60 s of the race).
 *   node scripts/check/crew-clip.cjs <out-dir> [port] [seconds]
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const CASES = [
  ['cruise-beat-14kt', { mode: 'cruise', windKt: 14, twa: 45 }, [70, 20, 6.5]],
  ['cruise-run-14kt', { mode: 'cruise', windKt: 14, twa: 170 }, [35, 30, 6]],
  ['cruise-reach-6kt', { mode: 'cruise', windKt: 6, twa: 90 }, [60, 25, 6.5]],
  ['race-ai-12kt', { mode: 'race', windKt: 12 }, [70, 22, 6.5]],
];
(async () => {
  const out = process.argv[2] || '.', port = process.argv[3] || '5173', secs = Number(process.argv[4] || 30);
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 640, height: 400 } });
  let errors = 0; p.on('pageerror', e => { errors++; console.log('page error:', e.message); });
  await p.goto(`http://localhost:${port}/scripts/check/crewclip/`); await p.waitForFunction(() => window.clip, null, { timeout: 120000 });
  for (const [name, setup, [yaw, pitch, dist]] of CASES) {
    const dir = `${out}/${name}`; fs.mkdirSync(dir, { recursive: true });
    // (racing: from a couple of minutes after the start, sailing her own race; cruising: settled for 40 s first)
    await p.evaluate(([s, c]) => { clip.setup(s); clip.run(s.mode === 'race' ? 420 : 40); clip.frames(2); clip.cam(...c); }, [setup, [yaw, pitch, dist]]);
    for (let i = 0; i < secs * 15; i++) {
      await p.evaluate(() => clip.frames(1 / 15));
      await p.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png` });
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', `${dir}/%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', `${out}/${name}.mp4`]);
    console.log(name, await p.evaluate(() => clip.info()));
  }
  await b.close();
  if (errors) process.exit(1);
})();
