#!/usr/bin/env node
/**
 * Pull current ORC certificates for a class and write an averaged polar for the sim.
 *
 *   node scripts/fetch-orc-polar.mjs                       # Nordic Folkboat, default countries
 *   node scripts/fetch-orc-polar.mjs --class folkboat --countries NED,EST,DEN,GER,SWE,FIN
 *
 * Behind an HTTPS proxy (e.g. cloud sessions), run with NODE_USE_ENV_PROXY=1 so fetch uses it.
 *
 * Source: ORC's public certificate feed (data.orc.org, DownRMS JSON). ORC publishes
 * time allowances in seconds per nautical mile; speed in knots = 3600 / allowance.
 * Output: src/boat/data/nordic-folkboat-orc.json
 */
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const CLASS = (args.class ?? 'folkboat').toLowerCase();
const COUNTRIES = (args.countries ?? 'NED,EST,DEN,GER,SWE,FIN,GBR,USA').split(',');
const OUT = args.out ?? new URL('../src/boat/data/nordic-folkboat-orc.json', import.meta.url);

const ROWS = ['R52', 'R60', 'R75', 'R90', 'R110', 'R120', 'R135', 'R150'];
const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

const certs = [];
for (const c of COUNTRIES) {
  const url = `https://data.orc.org/public/WPub.dll?action=DownRMS&ext=json&CountryId=${c}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn(`${c}: HTTP ${res.status}`); continue; }
    const json = JSON.parse((await res.text()).replace(/^﻿/, ''));
    const hits = (json.rms ?? []).filter(r => String(r.Class ?? '').toLowerCase().includes(CLASS));
    console.log(`${c}: ${json.rms?.length ?? 0} certificates, ${hits.length} match "${CLASS}"`);
    certs.push(...hits);
  } catch (e) { console.warn(`${c}: ${e.message}`); }
}
if (!certs.length) { console.error('No certificates found.'); process.exit(1); }

const tws = certs[0].Allowances.WindSpeeds;
const twa = certs[0].Allowances.WindAngles;
for (const r of certs) if (String(r.Allowances.WindSpeeds) !== String(tws)) throw new Error(`${r.RefNo}: different wind speeds`);

// average speeds (not allowances) across certificates
const avgSpeed = key => tws.map((_, j) => round(mean(certs.map(r => 3600 / r.Allowances[key][j]))));
const avgAngle = key => tws.map((_, j) => round(mean(certs.map(r => r.Allowances[key][j])), 2));
const beatAngle = avgAngle('BeatAngle'), gybeAngle = avgAngle('GybeAngle');
const beatVmg = avgSpeed('Beat'), runVmg = avgSpeed('Run');

const out = {
  source: {
    description: `Average of ${certs.length} current ORC certificates for class matching "${CLASS}". ORC VPP output; downwind figures assume the symmetric spinnaker listed on the certificates.`,
    feed: 'https://data.orc.org/public/WPub.dll?action=DownRMS&ext=json&CountryId=<country>',
    fetched: new Date().toISOString().slice(0, 10),
    certificates: certs.map(r => ({ refNo: r.RefNo, sailNo: r.SailNo, name: r.YachtName, class: r.Class, issued: String(r.IssueDate).slice(0, 10) }))
  },
  boat: {
    loa: round(mean(certs.map(r => r.LOA)), 2),
    imsL: round(mean(certs.map(r => r.IMSL)), 3), // ORC sailing length, m
    beam: round(mean(certs.map(r => r.MB)), 2),
    draft: round(mean(certs.map(r => r.Draft)), 3),
    displacementSailing: Math.round(mean(certs.map(r => r.Dspl_Sailing))), // kg, incl. crew and gear
    wettedSurface: round(mean(certs.map(r => r.WSS)), 2), // m²
    mainArea: round(mean(certs.map(r => r.Area_Main)), 2),
    jibArea: round(mean(certs.map(r => r.Area_Jib)), 2),
    spinnakerArea: round(mean(certs.map(r => r.Area_Sym ?? 0)), 2),
    gph: round(mean(certs.map(r => r.GPH)), 1)
  },
  units: 'knots and degrees true',
  tws,
  twa,
  speed: Object.fromEntries(ROWS.map((k, i) => [String(twa[i]), avgSpeed(k)])),
  beat: { angle: beatAngle, vmg: beatVmg, speed: tws.map((_, j) => round(beatVmg[j] / Math.cos(beatAngle[j] * Math.PI / 180))) },
  run: { angle: gybeAngle, vmg: runVmg, speed: tws.map((_, j) => round(runVmg[j] / Math.abs(Math.cos(gybeAngle[j] * Math.PI / 180)))) },
  deadRun: avgSpeed('DW180')
};
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${certs.length} certificates → ${OUT}`);
