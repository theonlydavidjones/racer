import { burgeePath, type Burgee } from './burgees';

/**
 * The parody burgees (the owner's brief, 17 Nov 2026: the Burgee style guide and each club's guidance; then "too many have
 * awkwardly overlapping elements, text or graphics that run too close to the edge, fine details that aren't legible from a
 * distance in wind"). So each is a flag, not a drawing: a field of one to three flat colors cut in broad bands, and one
 * bold charge built of a few big shapes, set clear of the edges and of everything else; no lettering at all; nothing a
 * masthead flag at 100 m, flogging in 15 kt, would lose. The classic clubs are the old-school dark blue and red. Shapes: a
 * pennant, or (rare, two of twenty-nine, the owner's at most one in ten) a swallowtail. They are not yet in BURGEES
 * (render/burgees.ts): they go in when the owner approves.
 */
type G = CanvasRenderingContext2D; type P = [number, number];
const WHITE = '#ffffff', GOLD = '#e7b52c', BLACK = '#15181d', NAVY = '#14285a', RED = '#bf2431', BLUE = '#2257a8';
const poly = (g: G, c: string, ...p: P[]) => { g.fillStyle = c; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const fill = (g: G, W: number, H: number, c: string) => rect(g, c, 0, 0, W, H);
const dot = (g: G, c: string, x: number, y: number, r: number) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const oval = (g: G, c: string, x: number, y: number, rx: number, ry: number, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
const stroke = (g: G, c: string, w: number, ...p: P[]) => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'butt'; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
const arc = (g: G, c: string, w: number, x: number, y: number, r: number, a0: number, a1: number) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };

/** A fish hook with its eye, traced from the owner's reference image (outline and eye hole as unit points, hook height 1, eye at the top right). */
const HOOK_W = 0.917275;
const HOOK_OUT: P[] = [[0.881, 0], [0.903, 0], [0.917, 0.022], [0.915, 0.073], [0.895, 0.129], [0.859, 0.187], [0.808, 0.234], [0.745, 0.382], [0.652, 0.567], [0.584, 0.684], [0.474, 0.835], [0.375, 0.934], [0.319, 0.971], [0.263, 0.993], [0.224, 1], [0.17, 1], [0.112, 0.985], [0.068, 0.961], [0.029, 0.92], [0.005, 0.866], [0, 0.779], [0.01, 0.727], [0.049, 0.635], [0.09, 0.557], [0.153, 0.45], [0.221, 0.35], [0.226, 0.345], [0.226, 0.358], [0.18, 0.718], [0.129, 0.635], [0.1, 0.611], [0.054, 0.72], [0.041, 0.779], [0.041, 0.822], [0.051, 0.864], [0.066, 0.891], [0.095, 0.922], [0.122, 0.939], [0.17, 0.954], [0.224, 0.954], [0.302, 0.927], [0.363, 0.883], [0.421, 0.825], [0.484, 0.747], [0.555, 0.642], [0.62, 0.528], [0.732, 0.297], [0.769, 0.209], [0.766, 0.178], [0.774, 0.144], [0.803, 0.078], [0.835, 0.034]];
const HOOK_EYE: P[] = [[0.881, 0.044], [0.876, 0.073], [0.854, 0.127], [0.83, 0.163], [0.805, 0.187], [0.81, 0.153], [0.83, 0.107], [0.852, 0.073]];
function hook(g: G, cx: number, cy: number, h: number, c: string, rot = 0, lw = 0.032): void {
  // The traced line is thin, so the outline is thickened to read from a distance; the eye is then cut clear through, so whatever lies under it shows.
  const t = document.createElement('canvas'); t.width = g.canvas.width; t.height = g.canvas.height; const k = t.getContext('2d')!;
  k.translate(cx, cy); k.rotate(rot); k.translate(-HOOK_W * h / 2, -h / 2); k.scale(h, h); k.fillStyle = c; k.strokeStyle = c; k.lineWidth = lw; k.lineJoin = 'round';
  k.beginPath(); HOOK_OUT.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))); k.closePath(); k.fill(); k.stroke();
  k.globalCompositeOperation = 'destination-out'; k.beginPath(); HOOK_EYE.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))); k.closePath(); k.fill();
  g.drawImage(t, 0, 0);
}

/** A raised fist, traced from the owner's reference image (unit points, fist height 1): the palm and each finger are separate pieces, so the creases between them stay open. */
const FIST_W = 0.567839;
const FIST: P[][] = [
  [[0.196, 0], [0.221, 0], [0.291, 0.04], [0.286, 0.08], [0.246, 0.166], [0.231, 0.176], [0.126, 0.136], [0.126, 0.116], [0.146, 0.075]],
  [[0.317, 0.07], [0.352, 0.08], [0.397, 0.116], [0.397, 0.131], [0.367, 0.191], [0.347, 0.216], [0.317, 0.211], [0.266, 0.186], [0.266, 0.166]],
  [[0.412, 0.151], [0.437, 0.151], [0.457, 0.161], [0.487, 0.186], [0.492, 0.216], [0.407, 0.342], [0.392, 0.357], [0.372, 0.362], [0.337, 0.352], [0.327, 0.342], [0.327, 0.317], [0.357, 0.276], [0.367, 0.256], [0.372, 0.216]],
  [[0.101, 0.161], [0.136, 0.161], [0.181, 0.176], [0.322, 0.231], [0.337, 0.246], [0.332, 0.281], [0.302, 0.312], [0.246, 0.312], [0.196, 0.302], [0.181, 0.302], [0.171, 0.312], [0.181, 0.322], [0.256, 0.332], [0.291, 0.352], [0.327, 0.417], [0.347, 0.508], [0.357, 0.497], [0.357, 0.457], [0.337, 0.377], [0.362, 0.387], [0.387, 0.382], [0.427, 0.412], [0.462, 0.427], [0.487, 0.422], [0.513, 0.407], [0.523, 0.412], [0.492, 0.548], [0.457, 0.608], [0.452, 0.633], [0.452, 0.965], [0.442, 0.99], [0.432, 0.995], [0.407, 1], [0.151, 1], [0.126, 0.99], [0.116, 0.97], [0.121, 0.593], [0, 0.382], [0.005, 0.322], [0.08, 0.176]],
  [[0.513, 0.236], [0.523, 0.236], [0.563, 0.276], [0.568, 0.312], [0.492, 0.397], [0.482, 0.402], [0.442, 0.397], [0.417, 0.377], [0.417, 0.357], [0.492, 0.251]],
];
function fist(g: G, cx: number, cy: number, h: number, c: string): void {
  g.save(); g.translate(cx - FIST_W * h / 2, cy - h / 2); g.scale(h, h); g.fillStyle = c;
  for (const ring of FIST) { g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
  g.restore();
}

/** A mission bell, traced from the owner's reference image (unit points, bell height 1): the dome, and the band with the clapper below it, are separate pieces. */
const BELL_W = 0.894886;
const BELL: P[][] = [
  [[0.4318, 0], [0.4602, 0.0028], [0.4801, 0.0114], [0.5085, 0.0369], [0.5284, 0.0767], [0.5398, 0.0881], [0.6193, 0.1222], [0.6648, 0.1534], [0.7216, 0.2074], [0.7557, 0.2528], [0.7955, 0.3324], [0.821, 0.4261], [0.8267, 0.4744], [0.8267, 0.5511], [0.821, 0.5682], [0.8097, 0.5767], [0.6932, 0.608], [0.6222, 0.6193], [0.5142, 0.6278], [0.3835, 0.6278], [0.1989, 0.608], [0.0682, 0.5739], [0.0597, 0.5028], [0.0653, 0.4403], [0.0909, 0.3409], [0.125, 0.267], [0.1619, 0.2159], [0.2216, 0.1562], [0.267, 0.125], [0.3438, 0.0909], [0.3551, 0.0795], [0.375, 0.0426], [0.4034, 0.0142]],
  [[0.8125, 0.6619], [0.8295, 0.6619], [0.8949, 0.8267], [0.7955, 0.8523], [0.6932, 0.8608], [0.6307, 0.8722], [0.5824, 0.8722], [0.5795, 0.8807], [0.5852, 0.9091], [0.5682, 0.9489], [0.5398, 0.9744], [0.4943, 0.9943], [0.4602, 1], [0.4148, 1], [0.3835, 0.9915], [0.3466, 0.9716], [0.3182, 0.946], [0.3097, 0.9318], [0.3097, 0.8665], [0.2188, 0.8636], [0.1477, 0.8551], [0, 0.8267], [0.0426, 0.6705], [0.0909, 0.6733], [0.1619, 0.6903], [0.2869, 0.7017], [0.4006, 0.6989], [0.4432, 0.7045], [0.5653, 0.7074], [0.6932, 0.6932]],
];
function bell(g: G, cx: number, cy: number, h: number, rot: number, c: string): void {
  g.save(); g.translate(cx, cy); g.rotate(rot); g.translate(-BELL_W * h / 2, -h / 2); g.scale(h, h); g.fillStyle = c;
  for (const ring of BELL) { g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
  g.restore();
}

/** A shark, traced from the owner's reference image (unit points, shark height 1): the body, and the dorsal fin as its own piece; the eye, the gill slits and the mouth are holes, so the field shows through. */
const SHARK_W = 1.01083;
const SHARK: P[][][] = [
  [[[0.6955, 0], [0.7497, 0], [0.7846, 0.0036], [0.8532, 0.0156], [0.9037, 0.0289], [0.9422, 0.0433], [0.9964, 0.0734], [1.0108, 0.0915], [1.0096, 0.1023], [0.9904, 0.1239], [0.9615, 0.1372], [0.9182, 0.1637], [0.846, 0.2214], [0.8051, 0.1974], [0.7858, 0.1925], [0.6871, 0.1901], [0.6691, 0.1937], [0.7918, 0.2539], [0.7918, 0.2563], [0.7738, 0.2708], [0.6318, 0.3381], [0.6005, 0.3634], [0.5644, 0.3995], [0.562, 0.4055], [0.5656, 0.4224], [0.568, 0.4934], [0.5644, 0.5295], [0.5572, 0.5608], [0.5463, 0.5872], [0.5319, 0.6089], [0.5126, 0.6294], [0.4934, 0.6438], [0.4789, 0.651], [0.4585, 0.6558], [0.4561, 0.6414], [0.4537, 0.4681], [0.4477, 0.4489], [0.4392, 0.4344], [0.426, 0.4212], [0.4176, 0.4176], [0.4055, 0.4164], [0.3923, 0.4212], [0.3586, 0.4513], [0.3345, 0.4645], [0.2936, 0.4813], [0.2527, 0.4934], [0.231, 0.5042], [0.2022, 0.5271], [0.16, 0.5716], [0.1288, 0.6161], [0.1143, 0.6534], [0.1131, 0.6943], [0.13, 0.7461], [0.1131, 0.7437], [0.1035, 0.7533], [0.1095, 0.7677], [0.13, 0.7882], [0.1576, 0.8051], [0.1841, 0.8135], [0.2142, 0.8159], [0.2455, 0.8111], [0.278, 0.799], [0.3177, 0.7762], [0.3466, 0.7497], [0.367, 0.7208], [0.3887, 0.6727], [0.3959, 0.6643], [0.4055, 0.6883], [0.4067, 0.7425], [0.3971, 0.7882], [0.3899, 0.8026], [0.3755, 0.8207], [0.3105, 0.8821], [0.3141, 0.9218], [0.3093, 0.9495], [0.2984, 0.9747], [0.2792, 1], [0.2491, 0.9747], [0.2142, 0.9338], [0.1625, 0.8917], [0.0674, 0.8026], [0.0373, 0.7653], [0.0156, 0.7304], [0.0096, 0.7124], [0.0012, 0.6582], [0, 0.58], [0.0132, 0.4922], [0.0373, 0.414], [0.0782, 0.3333], [0.1288, 0.2647], [0.1998, 0.1961], [0.278, 0.1396], [0.3742, 0.0878], [0.4477, 0.0578], [0.4994, 0.0409], [0.5993, 0.0156]], [[0.7629, 0.0963], [0.7665, 0.0963], [0.775, 0.1059], [0.7665, 0.1131], [0.7569, 0.1083], [0.7569, 0.1023]], [[0.58, 0.2094], [0.5848, 0.2094], [0.5981, 0.2178], [0.6306, 0.2491], [0.6546, 0.2852], [0.6546, 0.2888], [0.651, 0.2924], [0.6462, 0.2924], [0.6438, 0.29], [0.6101, 0.2467], [0.5752, 0.2142]], [[0.5511, 0.2118], [0.5692, 0.2238], [0.5981, 0.2491], [0.6306, 0.2936], [0.6318, 0.3008], [0.6294, 0.3032], [0.6245, 0.3032], [0.6173, 0.296], [0.6089, 0.2804], [0.5897, 0.2575], [0.5487, 0.225], [0.5475, 0.2154]], [[0.5187, 0.219], [0.5343, 0.2286], [0.5788, 0.2671], [0.5897, 0.2816], [0.6029, 0.3069], [0.6029, 0.3177], [0.5969, 0.3165], [0.5933, 0.3129], [0.586, 0.2996], [0.5728, 0.2828], [0.5138, 0.2274], [0.5126, 0.2226]], [[0.4765, 0.2214], [0.485, 0.2226], [0.5379, 0.2671], [0.5608, 0.2972], [0.5764, 0.3285], [0.568, 0.3285], [0.5644, 0.3261], [0.5475, 0.2996], [0.5271, 0.2732], [0.4886, 0.2419], [0.4741, 0.2274], [0.4729, 0.2238]]],
  [[[0.1661, 0.1011], [0.1949, 0.1023], [0.2443, 0.1203], [0.272, 0.1215], [0.272, 0.1239], [0.2154, 0.1637], [0.1468, 0.2238], [0.1408, 0.2238], [0.1252, 0.1961], [0.0903, 0.1613], [0.0686, 0.1516], [0.0421, 0.1468], [0.0493, 0.1396], [0.089, 0.1215]]],
];
function shark(g: G, cx: number, cy: number, h: number, c: string): void {
  g.save(); g.translate(cx - SHARK_W * h / 2, cy - h / 2); g.scale(h, h); g.fillStyle = c;
  for (const rings of SHARK) { g.beginPath(); for (const ring of rings) { ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); } g.fill('evenodd'); }
  g.restore();
}

/** A ship's wheel: a rim, eight spokes ending in handles, a hub with a hole; r is the radius to the handles' ends. */
function wheel(g: G, cx: number, cy: number, r: number, c: string, ground: string): void {
  g.save(); g.translate(cx, cy); g.strokeStyle = c; g.fillStyle = c; g.lineCap = 'round';
  g.lineWidth = r * 0.13; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke(); dot(g, c, Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93, r * 0.12); }
  g.lineWidth = r * 0.17; g.beginPath(); g.arc(0, 0, r * 0.62, 0, 7); g.stroke();
  dot(g, c, 0, 0, r * 0.22); dot(g, ground, 0, 0, r * 0.09); g.restore();
}

/** Two crossed cannon barrels, traced from the owner's reference image (unit points, height 1): every band and barrel section is its own piece, so the thin gaps between them stay open. */
const GUNS_W = 1;
const GUNS: P[][] = [
  [[0.1546, 0], [0.1609, 0], [0.183, 0.0221], [0.1798, 0.0315], [0.0252, 0.1861], [0.0189, 0.183], [0, 0.164], [0, 0.1546]],
  [[0.8391, 0], [0.8454, 0], [1, 0.1546], [1, 0.164], [0.9811, 0.183], [0.9748, 0.1861], [0.8202, 0.0315], [0.817, 0.0221]],
  [[0.1293, 0.0032], [0.1325, 0.0095], [0.0095, 0.1325], [0.0032, 0.1325], [0.0126, 0.0946], [0.0946, 0.0126]],
  [[0.8675, 0.0032], [0.9054, 0.0126], [0.9874, 0.0946], [0.9968, 0.1356], [0.8675, 0.0095]],
  [[0.183, 0.041], [0.2208, 0.1041], [0.2555, 0.1388], [0.1388, 0.2555], [0.0978, 0.2177], [0.041, 0.183]],
  [[0.8139, 0.041], [0.959, 0.183], [0.9022, 0.2177], [0.8612, 0.2555], [0.7445, 0.1388], [0.7792, 0.1041]],
  [[0.7256, 0.1388], [0.8612, 0.2713], [0.8423, 0.2934], [0.8328, 0.2902], [0.7161, 0.1735], [0.7066, 0.1609]],
  [[0.2681, 0.142], [0.2934, 0.1577], [0.2902, 0.1672], [0.1672, 0.2902], [0.1577, 0.2934], [0.1388, 0.2713]],
  [[0.2902, 0.1798], [0.3312, 0.2082], [0.4921, 0.3502], [0.4006, 0.4353], [0.3849, 0.4574], [0.5426, 0.6151], [0.5521, 0.6151], [0.6498, 0.5079], [0.6562, 0.5079], [0.7508, 0.6025], [0.7508, 0.6088], [0.6057, 0.7539], [0.5079, 0.6593], [0.5142, 0.6467], [0.3849, 0.5142], [0.3533, 0.4858], [0.3375, 0.4795], [0.1798, 0.2997], [0.1798, 0.2902]],
  [[0.7035, 0.1798], [0.7098, 0.1798], [0.8202, 0.2902], [0.8202, 0.2965], [0.6404, 0.5047], [0.5521, 0.5994], [0.5426, 0.5994], [0.4006, 0.4574], [0.4006, 0.4511]],
  [[0.3502, 0.5016], [0.3565, 0.5016], [0.4984, 0.6435], [0.4984, 0.653], [0.3975, 0.7539], [0.2492, 0.6088], [0.2492, 0.6025]],
  [[0.2271, 0.6025], [0.3975, 0.7697], [0.3975, 0.776], [0.3722, 0.8013], [0.3659, 0.8013], [0.1987, 0.6341]],
  [[0.7697, 0.6025], [0.7823, 0.6088], [0.8013, 0.6341], [0.6341, 0.8013], [0.6278, 0.8013], [0.6025, 0.776], [0.6025, 0.7697]],
  [[0.2019, 0.6498], [0.3502, 0.7981], [0.2461, 0.9054], [0.0946, 0.7571]],
  [[0.7981, 0.653], [0.9022, 0.7539], [0.9022, 0.7603], [0.7539, 0.9054], [0.6498, 0.7981]],
  [[0.0726, 0.7571], [0.0883, 0.7634], [0.2397, 0.9148], [0.2461, 0.9274], [0.2208, 0.9527], [0.2145, 0.9527], [0.0473, 0.7855]],
  [[0.9211, 0.7571], [0.9464, 0.7729], [0.9527, 0.7855], [0.7855, 0.9527], [0.7792, 0.9527], [0.7539, 0.9274], [0.7603, 0.9148]],
  [[0.041, 0.8044], [0.0536, 0.8044], [0.1987, 0.9495], [0.1924, 0.9748], [0.1798, 0.9937], [0.1546, 1], [0.123, 0.9874], [0.0946, 0.9653], [0.0189, 0.8864], [0.0032, 0.8517], [0.0063, 0.8233]],
  [[0.9464, 0.8044], [0.9779, 0.8107], [0.9937, 0.8233], [0.9968, 0.8517], [0.9874, 0.877], [0.9653, 0.9054], [0.8833, 0.9842], [0.8549, 0.9968], [0.8202, 0.9937], [0.8076, 0.9748], [0.8013, 0.9495]],
  [[0.0315, 0.9243], [0.0442, 0.9274], [0.0789, 0.9621], [0.0662, 0.9842], [0.0473, 0.9874], [0.0189, 0.9685], [0.0158, 0.9401]],
  [[0.9621, 0.9243], [0.9748, 0.9274], [0.9842, 0.9401], [0.9811, 0.9685], [0.9621, 0.9842], [0.9338, 0.9842], [0.9211, 0.9653]],
];
function crossedGuns(g: G, cx: number, cy: number, h: number, c: string, ground: string): void {
  g.save(); g.translate(cx - GUNS_W * h / 2, cy - h / 2); g.scale(h, h); g.fillStyle = c;
  for (const ring of GUNS) { g.beginPath(); ring.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); }
  // Where the barrels cross, the one in front (rising to the right) gets a gap down both long sides, so its white never runs into the white of the barrel behind it.
  g.strokeStyle = ground; g.lineWidth = 0.02; g.lineCap = 'butt';
  for (const [a, b] of [[[0.693, 0.451], [0.486, 0.668]], [[0.54, 0.305], [0.332, 0.522]]]) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // The four sharp corners where an arm of the barrel behind meets the sides of the front one are rounded a little.
  g.fillStyle = ground; const r = 0.03;
  for (const [x, y, ax, ay, bx, by] of [[0.6465, 0.5, 0.6905, 0.7234, -0.7234, 0.6905], [0.5, 0.6535, 0.6905, 0.7234, 0.7234, -0.6905], [0.5, 0.3465, -0.6905, -0.7234, -0.7234, 0.6905], [0.3535, 0.5, -0.6905, -0.7234, 0.7234, -0.6905]]) {
    const a0 = Math.atan2(-by, -bx); let d = Math.atan2(-ay, -ax) - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ax * r, y + ay * r); g.arc(x + (ax + bx) * r, y + (ay + by) * r, r, a0 + 0, a0 + d, d < 0); g.lineTo(x + bx * r, y + by * r); g.closePath(); g.fill();
  }
  g.restore();
}

/** A border just inside the cut (a fimbriation, as classic burgees have): d is its width as a share of the hoist. */
const border = (g: G, W: number, H: number, shape: 'pennant' | 'swallow', c: string, d: number) => { burgeePath(g, W, H, shape); g.strokeStyle = c; g.lineWidth = H * d * 2; g.lineJoin = 'miter'; g.stroke(); };


/**
 * An oak leaf's silhouette, as one outline (about 70 points: its lobes, notches and long thin stem), traced from the
 * owner's reference picture, x across from the leaf's middle and y down from its tip, both in units of the whole leaf's
 * length (stem included).
 */
const OAK_LEAF: P[] = [[-0.004, 0.0], [0.018, 0.007], [0.047, 0.036], [0.047, 0.073], [0.055, 0.08], [0.069, 0.073], [0.091, 0.08], [0.091, 0.131], [0.084, 0.139], [0.091, 0.168], [0.164, 0.139], [0.193, 0.168], [0.193, 0.241], [0.142, 0.336], [0.142, 0.35], [0.164, 0.372], [0.179, 0.372], [0.281, 0.321], [0.347, 0.321], [0.361, 0.336], [0.354, 0.409], [0.318, 0.474], [0.274, 0.518], [0.281, 0.54], [0.318, 0.547], [0.354, 0.577], [0.347, 0.599], [0.303, 0.642], [0.179, 0.693], [0.223, 0.737], [0.201, 0.766], [0.128, 0.796], [0.069, 0.796], [0.018, 0.839], [0.011, 0.854], [0.011, 1.0], [0.004, 1.0], [-0.011, 1.0], [-0.011, 0.854], [-0.018, 0.839], [-0.069, 0.796], [-0.128, 0.796], [-0.201, 0.766], [-0.223, 0.745], [-0.223, 0.73], [-0.193, 0.715], [-0.179, 0.693], [-0.303, 0.642], [-0.347, 0.599], [-0.354, 0.577], [-0.332, 0.555], [-0.281, 0.54], [-0.274, 0.518], [-0.332, 0.453], [-0.361, 0.387], [-0.361, 0.336], [-0.339, 0.321], [-0.281, 0.321], [-0.172, 0.372], [-0.142, 0.35], [-0.142, 0.336], [-0.172, 0.299], [-0.193, 0.241], [-0.193, 0.168], [-0.172, 0.139], [-0.091, 0.168], [-0.084, 0.161], [-0.091, 0.08], [-0.084, 0.073], [-0.055, 0.08], [-0.047, 0.073], [-0.047, 0.036]];
/** The leaf drawn with its middle at (x, y), `len` long from tip to stem's end, leaning `ang` radians clockwise from upright. */
function oakLeaf(g: G, x: number, y: number, len: number, ang: number, c: string): void {
  g.save(); g.translate(x, y); g.rotate(ang); g.translate(0, -len / 2);
  g.fillStyle = c; g.strokeStyle = c; g.lineJoin = 'round'; g.lineWidth = len * 0.01;
  g.beginPath(); OAK_LEAF.forEach(([a, b], i) => i ? g.lineTo(a * len, b * len) : g.moveTo(a * len, b * len)); g.closePath(); g.fill(); g.stroke(); g.restore();
}

/** An acorn, in one color: a stem, a domed cap, a gap, a round nut. (x, y) is its middle, `len` its height, `ang` its lean. */
function acorn(g: G, x: number, y: number, len: number, ang: number, c: string): void {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(len, len); g.fillStyle = c;
  g.fillRect(-0.03, -0.5, 0.06, 0.14); // the stem
  g.beginPath(); g.moveTo(-0.32, -0.12); g.ellipse(0, -0.12, 0.32, 0.27, 0, Math.PI, 2 * Math.PI); g.quadraticCurveTo(0, -0.04, -0.32, -0.12); g.closePath(); g.fill(); // the cap
  g.fillStyle = c; g.beginPath(); g.moveTo(-0.27, -0.03); g.bezierCurveTo(-0.34, 0.2, -0.17, 0.42, 0, 0.5); g.bezierCurveTo(0.17, 0.42, 0.34, 0.2, 0.27, -0.03); g.quadraticCurveTo(0, -0.09, -0.27, -0.03); g.closePath(); g.fill(); // the nut
  g.restore();
}

export const PARODY_BURGEES: Burgee[] = [
  // ---- Tier 1 · San Francisco city front
  { id: 'stfyc', shape: 'swallow', ratio: 1.6, // classic, prestige: very dark blue and red per pale, a white fimbriation; one gold phoenix, the city's own emblem, rising from red flames
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.57, 0, W * 0.035, H); rect(g, RED, W * 0.605, 0, W * 0.395, H);
      const x = W * 0.295, y = H * 0.47, u = H, q = (a: number, b: number): P => [x + a * u, y + b * u];
      for (const s of [-1, 1]) poly(g, GOLD, q(s * 0.04, -0.05), q(s * 0.32, -0.29), q(s * 0.23, -0.1), q(s * 0.36, -0.12), q(s * 0.26, 0.02), q(s * 0.33, 0.08), q(s * 0.18, 0.08), q(s * 0.04, 0.09)); // the wings, swept up
      poly(g, GOLD, q(-0.035, -0.14), q(0.035, -0.14), q(0.075, -0.01), q(0.045, 0.12), q(-0.045, 0.12), q(-0.075, -0.01)); // the body, neck to waist
      dot(g, GOLD, x, y - u * 0.19, u * 0.06); poly(g, GOLD, q(0.03, -0.225), q(0.15, -0.19), q(0.04, -0.155)); // the head, the beak (its base inside the head, so no corner shows)
      poly(g, GOLD, q(-0.045, 0.1), q(-0.11, 0.31), q(-0.04, 0.23), q(0, 0.33), q(0.04, 0.23), q(0.11, 0.31), q(0.045, 0.1)); // the tail
      poly(g, RED, q(-0.2, 0.33), q(-0.13, 0.2), q(-0.07, 0.28), q(0, 0.15), q(0.07, 0.28), q(0.13, 0.2), q(0.2, 0.33)); // rising from the flames
      border(g, W, H, 'swallow', WHITE, 0.035); } },
  { id: 'ggyc', shape: 'pennant', ratio: 1.5, // scrappy fishermen's club (Puerto d'Oro), from the owner's second template: the bridge's orange cut by a slanting white band, one dark-blue hook in it (to flag for IP review: the template is a real layout)
    draw: (g, W, H) => { fill(g, W, H, '#c0362c'); poly(g, WHITE, [0, 0], [W * 0.222, 0], [W * 0.8, H * 1.2], [W * 0.555, H * 1.2]);
      hook(g, W * 0.356, H * 0.5, H * 0.36, '#1b2285'); } },
  { id: 'sbyc', shape: 'swallow', ratio: 1.64, // China Basin, from the owner's reference (to flag for IP review: the layout is a real club's): navy swallowtail, one white star between the letters C and B
    draw: (g, W, H) => { fill(g, W, H, '#14195c');
      const cx = W * 0.41, cy = H * 0.5, R = H * 0.23, r = R * 0.42, pts: P[] = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R; pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]); }
      poly(g, WHITE, ...pts);
      g.fillStyle = WHITE; g.font = `bold ${Math.round(H * 0.24)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('C', W * 0.165, H * 0.5 + H * 0.01); g.fillText('B', W * 0.655, H * 0.5 + H * 0.01); } },
  { id: 'bvbc', shape: 'pennant', ratio: 1.6, // Dry Dock: working waterfront, so a yellow field and one dark-blue ship's wheel toward the hoist
    draw: (g, W, H) => { fill(g, W, H, '#f2c200'); wheel(g, W * 0.27, H * 0.5, H * 0.29, '#14295c', '#f2c200'); } },
  { id: 'mhpyc', shape: 'pennant', ratio: 1.6, // Monarch Point: three equal bands, one for each club that merged in 1974: monarch orange, sunflower yellow, harbor teal
    draw: (g, W, H) => { rect(g, '#e8590c', 0, 0, W, H / 3); rect(g, '#f6c026', 0, H / 3, W, H / 3); rect(g, '#0f5d6b', 0, H * 2 / 3, W, H / 3); } },
  { id: 'tiyc', shape: 'pennant', ratio: 1.6, // Clipper Cove, from the owner's reference (to flag for IP review: the layout is a real club's): a dark-blue hoist panel bearing the gold letters CCYC on a diagonal, then red and white stripes to the point
    draw: (g, W, H) => { fill(g, W, H, WHITE); rect(g, '#14196b', 0, 0, W * 0.41, H);
      // red and white stripes: six of one width, then the last red one runs the rest of the way, so the stripe at the point has width
      for (let i = 0; i < 7; i += 2) rect(g, '#d8312b', W * (0.41 + i * 0.075), 0, i === 6 ? W : W * 0.075, H);
      g.fillStyle = '#f4c542'; g.font = `bold ${Math.round(H * 0.19)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      'CCYC'.split('').forEach((ch, i) => g.fillText(ch, W * (0.075 + i * 0.08), H * (0.3 + i * 0.13))); } },
  // ---- Marin
  { id: 'sfyc', shape: 'swallow', ratio: 1.67, // the reference classic, the oldest club: strict red, white and dark blue; a white field under a double border, one dark-blue anchor (the first to drop one on this coast)
    draw: (g, W, H) => { fill(g, W, H, WHITE); border(g, W, H, 'swallow', RED, 0.075); border(g, W, H, 'swallow', NAVY, 0.045);
      const x = W * 0.27, y = H * 0.52, u = H, S = NAVY;
      rect(g, S, x - u * 0.025, y - u * 0.2, u * 0.05, u * 0.42); rect(g, S, x - u * 0.12, y - u * 0.13, u * 0.24, u * 0.045); // the shank and the stock
      g.strokeStyle = S; g.lineWidth = u * 0.04; g.beginPath(); g.arc(x, y - u * 0.26, u * 0.05, 0, 7); g.stroke(); // the ring
      arc(g, S, u * 0.05, x, y + u * 0.02, u * 0.2, 0.12 * Math.PI, 0.88 * Math.PI); // the arms
      for (const s of [-1, 1]) poly(g, S, [x + s * u * 0.14, y + u * 0.2 - u * 0.03], [x + s * u * 0.27, y + u * 0.05], [x + s * u * 0.14, y + u * 0.08]); } },
  { id: 'cyc', shape: 'pennant', ratio: 1.6, // classic, the amateur's club (the owner's layout): a red hoist panel coming to a single point, a white middle, a dark-blue tip with a chevron notch; one gold laurel wreath (the Greek games) on the red
    draw: (g, W, H) => { fill(g, W, H, WHITE);
      poly(g, RED, [0, 0], [W * 0.25, H * 0.125], [W * 0.355, H * 0.5], [W * 0.25, H * 0.875], [0, H]);
      poly(g, NAVY, [W * 0.5, H * 0.25], [W, H * 0.5], [W * 0.5, H * 0.75], [W * 0.605, H * 0.5]); // (the white between them is a third shorter than the first draft's, along the edges and the middle)
      const x = W * 0.165, y = H * 0.485, r = H * 0.13, d = Math.PI / 180; // (a hair below the middle for balance: the wreath is open at the top and weighted low)
      const leaf = (px: number, py: number, dir: number, len: number, wid: number) => { g.save(); g.translate(px, py); g.rotate(dir); g.fillStyle = GOLD; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.4, -wid, len, 0); g.quadraticCurveTo(len * 0.4, wid, 0, 0); g.fill(); g.restore(); };
      for (const s of [-1, 1]) { // two branches from the bottom: a stem, six pairs of leaves growing up it (smaller toward the tip), a leaf at the end
        const a0 = (s > 0 ? 80 : 100) * d, a1 = (s > 0 ? -34 : 214) * d; arc(g, GOLD, H * 0.022, x, y, r, Math.min(a0, a1), Math.max(a0, a1));
        for (let i = 0; i < 6; i++) { const a = (s > 0 ? 72 - i * 21 : 108 + i * 21) * d, grow = a + s * -Math.PI / 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, k = 1 - i * 0.07;
          for (const t of [-1, 1]) leaf(px, py, grow + t * 0.8, H * 0.085 * k, H * 0.028 * k); }
        const e = (s > 0 ? -34 : 214) * d; leaf(x + Math.cos(e) * r, y + Math.sin(e) * r, e + s * -Math.PI / 2, H * 0.07, H * 0.022); } } },
  { id: 'tyc', shape: 'pennant', ratio: 1.6, // Shark Point (to flag for IP review: the layout is the real club's, the shark the Town of Tiburon seal's): navy field, a thin red border, one white shark at the hoist
    draw: (g, W, H) => { fill(g, W, H, '#14295c'); border(g, W, H, 'pennant', '#c8102e', 0.025);
      shark(g, W * 0.255, H * 0.53, H * 0.5, WHITE); } },
  { id: 'pyc', shape: 'pennant', ratio: 1.6, // Battery Yacht Club (the Army's old coast-defense post): a light-blue field and two white crossed cannon barrels toward the hoist
    draw: (g, W, H) => { fill(g, W, H, '#8fc4ea'); crossedGuns(g, W * 0.2, H * 0.5, H * 0.5, WHITE, '#8fc4ea'); } },
  { id: 'ssyc', shape: 'pennant', ratio: 1.7, // Willow Grove, traced from the owner's reference: stripes of one width leaning 0.56 across for each 1 down, pitch 0.27 of the length, the first teal stripe's right edge at 0.042 of the length along the top
    draw: (g, W, H) => { fill(g, W, H, '#efe6c8'); const pitch = W * 0.27, wid = W * 0.135, lean = H * 0.56, off = -W * 0.093;
      for (let i = -2; i < 5; i++) poly(g, '#0f5b63', [off + i * pitch, 0], [off + i * pitch + wid, 0], [off + i * pitch + wid + lean, H], [off + i * pitch + lean, H]); } },
  { id: 'myc', shape: 'pennant', ratio: 1.46, // Tamalpais, from the owner's reference (to flag for IP review: the layout is a real club's): a navy hoist field bearing a white T, then a slanting cream band and a red fly, the two slants parallel
    draw: (g, W, H) => { fill(g, W, H, '#d4504a');
      poly(g, '#f5f0e2', [W * 0.484, H * 0.242], [W * 0.654, H * 0.327], [W * 0.113, H * 1.2], [-W * 0.11, H * 1.2]); // the cream band, from the top edge down and to the left
      poly(g, '#1b3558', [-W * 0.1, -H * 0.05], [W * 0.484, H * 0.242], [-W * 0.11, H * 1.2], [-W * 0.1, H * 1.2]); // the navy hoist field, its edge parallel to the band's other edge
      g.fillStyle = WHITE; g.font = `bold ${Math.round(H * 0.3)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('T', W * 0.14, H * 0.34); } },
  { id: 'sryc', shape: 'pennant', ratio: 1.5, // Mission Canal: one mission bell (the owner's drawing) at the top-left, its axis pointing straight at the corner, cream on mission-tile red, a plain field
    draw: (g, W, H) => { fill(g, W, H, '#8f3b2b'); bell(g, H * 0.2, H * 0.27, H * 0.269, -Math.atan2(0.2, 0.27), '#f1e3c6'); } },
  { id: 'ryc', shape: 'pennant', ratio: 2.3, // Brickyard (Richmond YC), on the owner's template (IP flag): white hoist with six dark-orange squares stood on a corner, then a solid dark-blue fly to the point
    draw: (g, W, H) => { fill(g, W, H, WHITE); rect(g, '#14295c', W * 0.456, 0, W, H);
      for (const [x, y] of [[0.124, 0.22], [0.236, 0.36], [0.124, 0.5], [0.357, 0.5], [0.236, 0.64], [0.124, 0.78]]) { const r = H * 0.085; poly(g, '#cc5500', [W * x, H * y - r], [W * x + r, H * y], [W * x, H * y + r], [W * x - r, H * y]); } } },
  { id: 'byc', shape: 'pennant', ratio: 1.667, // Campanile YC (Berkeley, 1929), on the owner's template: five equal stripes to the point, Berkeley blue and California gold; no charge (the name does the work)
    draw: (g, W, H) => { fill(g, W, H, '#003262'); rect(g, '#fdb515', W * 0.2, 0, W * 0.2, H); rect(g, '#fdb515', W * 0.6, 0, W * 0.2, H); } },
  { id: 'csc', shape: 'pennant', ratio: 1.667, // People's: a co-op, so deep red and white; one raised fist on a white disc
    draw: (g, W, H) => { fill(g, W, H, '#a81f2b'); dot(g, WHITE, W * 0.21, H * 0.5, H * 0.26); fist(g, W * 0.21, H * 0.5, H * 0.39, '#a81f2b'); } },
  { id: 'emyc', shape: 'pennant', ratio: 1.5, // small and informal: sky, reed green, mud; a tide line
    draw: (g, W, H) => { fill(g, W, H, '#8ec7e8'); rect(g, '#6b5338', 0, H * 0.62, W, H * 0.38); rect(g, '#4c7a3a', 0, H * 0.5, W, H * 0.12); } },
  { id: 'eyc', shape: 'pennant', ratio: 1.6, // classic, 1890 (the owner's template): a dark-blue hoist panel bearing one white oak leaf, then red and white stripes to the point, a gold border, a white hoist band
    draw: (g, W, H) => { const X0 = W * 0.215, BORDER = '#f0b323';
      fill(g, W, H, WHITE);
      rect(g, NAVY, 0, 0, W * 0.4, H); // the hoist panel
      for (let k = 0; W * (0.4 + (2 * k + 1) * 0.0625) < W; k++) rect(g, RED, W * (0.4 + (2 * k + 1) * 0.0625), 0, W * 0.0625, H); // the stripes, red and white
      oakLeaf(g, X0, H * 0.515, H * 0.58, 0.3, WHITE); // one white oak leaf, leaning a little toward the fly, well inside the panel
      border(g, W, H, 'pennant', BORDER, 0.045); rect(g, WHITE, 0, 0, W * 0.04, H); } },
  { id: 'oyc', shape: 'pennant', ratio: 1.667, // Oaktown YC, after the City of Oakland's flag (the owner's): its green for the field, its yellow for one acorn
    draw: (g, W, H) => { fill(g, W, H, '#005e00'); acorn(g, W * 0.225, H * 0.5, H * 0.54, -0.2, '#f5dc0e'); } },
  { id: 'iyc', shape: 'pennant', ratio: 2, // modern, thrifty: sand, white and teal stripes
    draw: (g, W, H) => { rect(g, '#e6cf99', 0, 0, W, H / 3); rect(g, WHITE, 0, H / 3, W, H / 3); rect(g, '#16a0a6', 0, H * 2 / 3, W, H / 3); oval(g, '#e6cf99', W * 0.16, H / 2, W * 0.1, H * 0.08); } },
  { id: 'aeyc', shape: 'pennant', ratio: 1.6, // mid-century: sky blue and white, one wind swirl
    draw: (g, W, H) => { fill(g, W, H, '#7cc0ec'); const pts: P[] = []; for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 2.6, r = H * (0.05 + 0.17 * (1 - i / 30)); pts.push([W * 0.2 + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r]); } stroke(g, WHITE, H * 0.09, ...pts); } },
  { id: 'bbyc', shape: 'pennant', ratio: 1.6, // modern: ocean blue, black and white; one orca
    draw: (g, W, H) => { fill(g, W, H, '#0e63a8'); g.save(); g.translate(W * 0.2, H * 0.5); g.rotate(-0.4); oval(g, BLACK, 0, 0, W * 0.13, H * 0.15); poly(g, BLACK, [W * 0.1, 0], [W * 0.18, -H * 0.15], [W * 0.18, H * 0.15]); poly(g, BLACK, [-W * 0.03, -H * 0.12], [W * 0.02, -H * 0.3], [W * 0.05, -H * 0.1]); oval(g, WHITE, -W * 0.01, H * 0.09, W * 0.07, H * 0.045); g.restore(); } },
  // ---- North Bay / Peninsula
  { id: 'vyc', shape: 'pennant', ratio: 1.5, // naval flavor: dark blue, white and red; one anchor
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, RED, W * 0.56, 0, W * 0.44, H); const x = W * 0.2; stroke(g, WHITE, H * 0.08, [x, H * 0.26], [x, H * 0.7]); stroke(g, WHITE, H * 0.08, [x - H * 0.14, H * 0.36], [x + H * 0.14, H * 0.36]); arc(g, WHITE, H * 0.08, x, H * 0.52, H * 0.2, 0.15, Math.PI - 0.15); } },
  { id: 'bnyc', shape: 'pennant', ratio: 1.6, // history-minded: navy, white and gold; one capitol dome
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.06, H * 0.64, W * 0.3, H * 0.08); g.fillStyle = GOLD; g.beginPath(); g.arc(W * 0.21, H * 0.64, W * 0.11, Math.PI, 0); g.fill(); rect(g, GOLD, W * 0.2, H * 0.22, W * 0.02, H * 0.1); } },
  { id: 'seqyc', shape: 'pennant', ratio: 1.5, // established: green, white and blue; one pine cone
    draw: (g, W, H) => { fill(g, W, H, '#1d6b3a'); rect(g, BLUE, W * 0.55, 0, W * 0.45, H); poly(g, WHITE, [W * 0.2, H * 0.22], [W * 0.31, H * 0.42], [W * 0.27, H * 0.7], [W * 0.2, H * 0.78], [W * 0.13, H * 0.7], [W * 0.09, H * 0.42]); stroke(g, '#1d6b3a', H * 0.06, [W * 0.1, H * 0.46], [W * 0.3, H * 0.46]); stroke(g, '#1d6b3a', H * 0.06, [W * 0.11, H * 0.6], [W * 0.29, H * 0.6]); } },
  { id: 'cpyc', shape: 'pennant', ratio: 1.5, // mid-century: steel gray, blue and white; one wolf's head
    draw: (g, W, H) => { fill(g, W, H, '#6c7886'); rect(g, BLUE, W * 0.56, 0, W * 0.44, H); poly(g, WHITE, [W * 0.08, H * 0.26], [W * 0.15, H * 0.4], [W * 0.25, H * 0.4], [W * 0.32, H * 0.26], [W * 0.33, H * 0.5], [W * 0.2, H * 0.74], [W * 0.07, H * 0.5]); } },
  { id: 'spyc', shape: 'pennant', ratio: 1.6, // modern, minimal: mountain gray and blue; one white ridge
    draw: (g, W, H) => { fill(g, W, H, '#6e7a85'); rect(g, '#2f6fb5', 0, 0, W, H * 0.38); poly(g, WHITE, [W * 0.06, H * 0.7], [W * 0.15, H * 0.4], [W * 0.22, H * 0.56], [W * 0.31, H * 0.34], [W * 0.42, H * 0.7]); } },
  // ---- Tier 2 (no guidance in the file)
  { id: 'mbyc', shape: 'pennant', ratio: 2, // Riveter Bay: dark blue with a safety-yellow band, and a row of rivets the whole way along the band
    draw: (g, W, H) => { fill(g, W, H, '#14295c'); rect(g, '#f2c200', 0, H * 0.4, W, H * 0.2);
      for (let i = 0; i < 10; i++) dot(g, '#2c3238', W * (0.06 + i * 0.08), H * 0.5, H * 0.042); } },
  { id: 'slyc', shape: 'pennant', ratio: 1.5, // Cherry Harbor: quartered in cherry red and cream, in the old signal-flag manner; the cherry is in the color alone
    draw: (g, W, H) => { fill(g, W, H, '#f6ecd4'); rect(g, '#e0242e', 0, 0, W * 0.45, H / 2); rect(g, '#e0242e', W * 0.45, H / 2, W * 0.55, H / 2); } }
];
