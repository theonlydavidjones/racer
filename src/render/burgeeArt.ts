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

/** A raised fist, traced from the owner's reference image (unit points, fist height 1): the palm and each knuckle are separate pieces, so the creases between them stay open. */
const FIST_W = 0.567839;
const FIST: P[][] = [
  [[0.196, 0], [0.221, 0], [0.291, 0.04], [0.286, 0.08], [0.246, 0.166], [0.231, 0.176], [0.126, 0.136], [0.126, 0.116], [0.146, 0.075]],
  [[0.317, 0.07], [0.352, 0.08], [0.397, 0.116], [0.397, 0.131], [0.367, 0.191], [0.347, 0.216], [0.317, 0.211], [0.266, 0.186], [0.266, 0.166]],
  [[0.412, 0.151], [0.437, 0.151], [0.457, 0.161], [0.487, 0.186], [0.492, 0.216], [0.407, 0.342], [0.392, 0.357], [0.372, 0.362], [0.337, 0.352], [0.327, 0.342], [0.327, 0.317], [0.357, 0.276], [0.367, 0.256], [0.372, 0.216]],
  [[0.101, 0.161], [0.136, 0.161], [0.181, 0.176], [0.322, 0.231], [0.337, 0.246], [0.332, 0.281], [0.302, 0.312], [0.246, 0.312], [0.196, 0.302], [0.181, 0.302], [0.171, 0.312], [0.181, 0.322], [0.256, 0.332], [0.291, 0.352], [0.327, 0.417], [0.347, 0.508], [0.357, 0.497], [0.357, 0.457], [0.337, 0.377], [0.362, 0.387], [0.387, 0.382], [0.427, 0.412], [0.462, 0.427], [0.487, 0.422], [0.513, 0.407], [0.523, 0.412], [0.492, 0.548], [0.457, 0.608], [0.452, 0.633], [0.452, 0.965], [0.442, 0.99], [0.432, 0.995], [0.407, 1], [0.151, 1], [0.126, 0.99], [0.116, 0.97], [0.121, 0.593], [0, 0.382], [0.005, 0.322], [0.08, 0.176]],
  [[0.513, 0.236], [0.523, 0.236], [0.563, 0.276], [0.568, 0.312], [0.492, 0.397], [0.482, 0.402], [0.442, 0.397], [0.417, 0.377], [0.417, 0.357], [0.492, 0.251]],
];
/** A loose, wavy length of rope, traced from the owner's reference image (unit points, rope length 1): each strand's turn is its own piece. */
const ROPE_STRETCH = 2.6; // the strands are drawn fat, so they still read from a distance
const ROPE_H = 0.122007;
const ROPE: P[][] = [
  [[0.5051, 0], [0.5222, 0], [0.5314, 0.0046], [0.5336, 0.008], [0.5131, 0.0239], [0.5074, 0.0308], [0.4971, 0.0376], [0.4835, 0.0399], [0.4721, 0.0353], [0.4709, 0.0342], [0.4743, 0.0285], [0.4892, 0.0114]],
  [[0.4652, 0.0011], [0.48, 0.0023], [0.4857, 0.0057], [0.4846, 0.008], [0.4778, 0.0137], [0.4641, 0.0331], [0.455, 0.0422], [0.4436, 0.0468], [0.4344, 0.0468], [0.4299, 0.0445], [0.431, 0.0388], [0.4379, 0.0251], [0.4401, 0.0239], [0.4401, 0.0217], [0.447, 0.0114], [0.455, 0.0046]],
  [[0.9806, 0.0011], [0.9954, 0.0023], [1, 0.0068], [0.9909, 0.016], [0.9772, 0.0353], [0.9704, 0.0422], [0.959, 0.0468], [0.9498, 0.0468], [0.9453, 0.0445], [0.9441, 0.0433], [0.9464, 0.041], [0.9464, 0.0376], [0.9601, 0.0137], [0.9704, 0.0046]],
  [[0.5564, 0.0057], [0.5667, 0.0068], [0.5713, 0.0091], [0.5815, 0.0194], [0.561, 0.0285], [0.5428, 0.0399], [0.5348, 0.041], [0.5245, 0.0399], [0.5143, 0.0331], [0.5393, 0.0114], [0.5416, 0.0114], [0.5473, 0.0068]],
  [[0.0331, 0.0068], [0.0513, 0.0068], [0.0604, 0.0114], [0.065, 0.016], [0.0661, 0.0194], [0.0456, 0.0285], [0.0285, 0.0399], [0.0205, 0.041], [0.0091, 0.0399], [0, 0.0342], [0, 0.0319], [0.0125, 0.0205]],
  [[0.4219, 0.0114], [0.4344, 0.0114], [0.4367, 0.0125], [0.4367, 0.016], [0.4322, 0.0217], [0.4253, 0.0353], [0.4253, 0.0388], [0.423, 0.041], [0.423, 0.0445], [0.4196, 0.0513], [0.4139, 0.0582], [0.4071, 0.0627], [0.4036, 0.0627], [0.4002, 0.065], [0.3922, 0.065], [0.3911, 0.0627], [0.3922, 0.0559], [0.3945, 0.0525], [0.3945, 0.0468], [0.4036, 0.0228], [0.4151, 0.0137], [0.4185, 0.0137]],
  [[0.9361, 0.0114], [0.9498, 0.0114], [0.9521, 0.0137], [0.9407, 0.0342], [0.9361, 0.049], [0.9259, 0.0604], [0.9145, 0.065], [0.9065, 0.065], [0.9054, 0.0627], [0.9076, 0.0593], [0.9099, 0.0445], [0.9122, 0.0422], [0.9122, 0.0365], [0.9145, 0.0342], [0.9168, 0.0262], [0.9259, 0.016]],
  [[0.0753, 0.0228], [0.0901, 0.0228], [0.0924, 0.0251], [0.0958, 0.0251], [0.1049, 0.0319], [0.1095, 0.041], [0.1026, 0.0422], [0.0992, 0.0445], [0.0935, 0.0445], [0.0901, 0.0468], [0.0855, 0.0468], [0.0821, 0.049], [0.0775, 0.049], [0.0753, 0.0513], [0.0627, 0.0525], [0.0502, 0.049], [0.041, 0.0399], [0.0536, 0.0319]],
  [[0.5895, 0.0228], [0.6055, 0.0228], [0.61, 0.0251], [0.6203, 0.0331], [0.6237, 0.0376], [0.6237, 0.0422], [0.6169, 0.0422], [0.6146, 0.0445], [0.6078, 0.0445], [0.6055, 0.0468], [0.5998, 0.0468], [0.5895, 0.0513], [0.5815, 0.0525], [0.5701, 0.0513], [0.5656, 0.049], [0.5564, 0.0399], [0.5644, 0.0342], [0.5781, 0.0274], [0.5872, 0.0251]],
  [[0.3808, 0.0319], [0.3922, 0.0319], [0.3911, 0.0388], [0.3888, 0.0422], [0.3888, 0.0479], [0.3865, 0.0502], [0.3865, 0.057], [0.3843, 0.0604], [0.3843, 0.0673], [0.382, 0.0696], [0.382, 0.073], [0.3774, 0.0798], [0.3706, 0.0855], [0.366, 0.0878], [0.3535, 0.0901], [0.3512, 0.0889], [0.3512, 0.0867], [0.3535, 0.0844], [0.3535, 0.0787], [0.3558, 0.0764], [0.3558, 0.0696], [0.358, 0.0673], [0.3603, 0.0513], [0.3649, 0.0433], [0.3717, 0.0365]],
  [[0.8962, 0.0319], [0.9065, 0.0319], [0.9065, 0.0376], [0.9042, 0.0399], [0.8974, 0.0718], [0.8928, 0.0787], [0.8848, 0.0855], [0.8803, 0.0878], [0.8677, 0.0901], [0.8666, 0.0855], [0.8712, 0.0741], [0.8712, 0.0684], [0.8734, 0.065], [0.8734, 0.0582], [0.8757, 0.0502], [0.8837, 0.0388]],
  [[0.1209, 0.0456], [0.1368, 0.0502], [0.1471, 0.0616], [0.1482, 0.0639], [0.1471, 0.065], [0.1345, 0.0696], [0.1186, 0.0718], [0.1152, 0.0741], [0.1003, 0.0741], [0.0912, 0.0696], [0.0844, 0.0627], [0.081, 0.0559], [0.0867, 0.0547], [0.0889, 0.0525], [0.0946, 0.0525], [0.0981, 0.0502], [0.1038, 0.0502], [0.1083, 0.0479], [0.1152, 0.0479]],
  [[0.6306, 0.0468], [0.6408, 0.0468], [0.6511, 0.0502], [0.6591, 0.057], [0.6602, 0.0604], [0.6625, 0.0616], [0.6625, 0.065], [0.6499, 0.0696], [0.6431, 0.0696], [0.6408, 0.0718], [0.634, 0.0718], [0.6294, 0.0741], [0.6157, 0.0741], [0.61, 0.0718], [0.5998, 0.0639], [0.5952, 0.0559], [0.6043, 0.0525], [0.61, 0.0525], [0.6135, 0.0502], [0.6192, 0.0502], [0.6226, 0.0479]],
  [[0.3478, 0.0559], [0.3523, 0.057], [0.3523, 0.0616], [0.3501, 0.065], [0.3501, 0.0707], [0.3478, 0.0741], [0.3455, 0.0867], [0.3387, 0.0992], [0.3261, 0.1083], [0.3193, 0.1095], [0.3067, 0.1083], [0.3056, 0.1072], [0.3101, 0.1015], [0.325, 0.0684], [0.3341, 0.0593]],
  [[0.862, 0.0559], [0.8666, 0.0559], [0.8677, 0.0604], [0.8655, 0.0627], [0.8655, 0.0696], [0.8632, 0.0718], [0.8609, 0.0855], [0.854, 0.0992], [0.8404, 0.1083], [0.8335, 0.1095], [0.8221, 0.1083], [0.821, 0.106], [0.8301, 0.0924], [0.8324, 0.0844], [0.8347, 0.0821], [0.8347, 0.0787], [0.8369, 0.0764], [0.8369, 0.073], [0.8415, 0.0661], [0.8495, 0.0593]],
  [[0.1574, 0.0684], [0.1699, 0.0684], [0.1733, 0.0707], [0.1767, 0.0707], [0.187, 0.0798], [0.1813, 0.0855], [0.1631, 0.0946], [0.1505, 0.0981], [0.1368, 0.0969], [0.1311, 0.0946], [0.1209, 0.0844], [0.1197, 0.081], [0.1209, 0.0787], [0.1311, 0.0775], [0.1334, 0.0753], [0.1391, 0.0753]],
  [[0.6727, 0.0684], [0.6853, 0.0684], [0.691, 0.0707], [0.7013, 0.0787], [0.7013, 0.0821], [0.6716, 0.0969], [0.6659, 0.0981], [0.6511, 0.0969], [0.6431, 0.0924], [0.634, 0.081], [0.6397, 0.0775], [0.6545, 0.0753]],
  [[0.3033, 0.0741], [0.3124, 0.0753], [0.3136, 0.0798], [0.3044, 0.0981], [0.2976, 0.1083], [0.2908, 0.1152], [0.2805, 0.1197], [0.2668, 0.1197], [0.2588, 0.1152], [0.2759, 0.0946], [0.2805, 0.0867], [0.2873, 0.0798], [0.293, 0.0775], [0.2942, 0.0753]],
  [[0.8176, 0.0741], [0.8278, 0.0753], [0.829, 0.0787], [0.8198, 0.0969], [0.8084, 0.1129], [0.7959, 0.1197], [0.7822, 0.1197], [0.7731, 0.1152], [0.7891, 0.0969], [0.7993, 0.0821], [0.8039, 0.0798], [0.805, 0.0775]],
  [[0.2041, 0.0798], [0.2166, 0.0798], [0.2292, 0.0867], [0.2292, 0.0889], [0.2121, 0.1038], [0.1984, 0.1129], [0.195, 0.1129], [0.1916, 0.1152], [0.1824, 0.1152], [0.1688, 0.1095], [0.1631, 0.1038], [0.1619, 0.1015], [0.1631, 0.1003], [0.1665, 0.1003]],
  [[0.7195, 0.0798], [0.732, 0.0798], [0.7412, 0.0844], [0.7446, 0.0878], [0.7298, 0.1015], [0.7138, 0.1129], [0.7092, 0.1129], [0.7058, 0.1152], [0.6978, 0.1152], [0.6853, 0.1106], [0.6773, 0.1026], [0.6784, 0.1003], [0.6864, 0.0981], [0.7013, 0.0889], [0.7035, 0.0889], [0.7127, 0.0821], [0.7161, 0.0821]],
  [[0.2486, 0.0821], [0.2657, 0.0821], [0.2725, 0.0855], [0.2725, 0.0878], [0.2657, 0.0969], [0.2486, 0.1152], [0.2417, 0.1197], [0.2281, 0.122], [0.2189, 0.1197], [0.2098, 0.114], [0.2406, 0.0867]],
  [[0.764, 0.0821], [0.7811, 0.0821], [0.7879, 0.0867], [0.7765, 0.1015], [0.7628, 0.1152], [0.756, 0.1197], [0.7434, 0.122], [0.7332, 0.1197], [0.7252, 0.114], [0.7491, 0.0935], [0.7526, 0.0889]],
];
function pieces(g: G, rings: P[][], c: string, halo = 0): void {
  g.fillStyle = c; g.strokeStyle = c; g.lineJoin = 'round';
  for (const ring of rings) { g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); if (halo) { g.lineWidth = halo; g.stroke(); } }
}
function fist(g: G, cx: number, cy: number, h: number, c: string): void {
  g.save(); g.translate(cx - FIST_W * h / 2, cy - h / 2); g.scale(h, h); pieces(g, FIST, c); g.restore();
}
/** The rope, drawn first so the fist closes over it: it shows on both sides of the fist. */
function rope(g: G, cx: number, cy: number, len: number, rot: number, c: string): void {
  g.save(); g.translate(cx, cy); g.rotate(rot); g.translate(-len / 2, -ROPE_H * len * ROPE_STRETCH / 2); g.scale(len, len * ROPE_STRETCH); pieces(g, ROPE, c); g.restore();
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
  { id: 'sbyc', shape: 'pennant', ratio: 1.6, // modern urban: harbor blue and orange, one bridge span
    draw: (g, W, H) => { fill(g, W, H, '#0f5f99'); rect(g, '#f08a1c', W * 0.05, H * 0.62, W * 0.3, H * 0.09); arc(g, '#f08a1c', H * 0.1, W * 0.2, H * 0.62, H * 0.2, Math.PI, 0); } },
  { id: 'bvbc', shape: 'pennant', ratio: 1.5, // working waterfront: dark blue, rust, cream; a keel in its cradle
    draw: (g, W, H) => { fill(g, W, H, '#27415f'); rect(g, '#a4502d', 0, H * 0.7, W, H * 0.3); poly(g, '#efe3c6', [W * 0.08, H * 0.3], [W * 0.3, H * 0.3], [W * 0.24, H * 0.64], [W * 0.14, H * 0.64]); } },
  { id: 'mhpyc', shape: 'pennant', ratio: 1.6, // modern: orange and black, one butterfly
    draw: (g, W, H) => { fill(g, W, H, '#f08a1c'); poly(g, BLACK, [W * 0.55, H * 0.28], [W, H / 2], [W * 0.55, H * 0.72]); for (const s of [-1, 1]) { oval(g, BLACK, W * 0.15, H * 0.5 + s * H * 0.13, W * 0.09, H * 0.1, s * 0.55); oval(g, BLACK, W * 0.27, H * 0.5 + s * H * 0.09, W * 0.05, H * 0.06, -s * 0.3); } } },
  { id: 'tiyc', shape: 'pennant', ratio: 1.5, // small and friendly: blue and white, a clipper under sail, a gold hull
    draw: (g, W, H) => { fill(g, W, H, '#1f4f9a'); poly(g, WHITE, [W * 0.08, H * 0.58], [W * 0.08, H * 0.3], [W * 0.19, H * 0.56]); poly(g, WHITE, [W * 0.22, H * 0.56], [W * 0.22, H * 0.24], [W * 0.36, H * 0.54]); poly(g, GOLD, [W * 0.06, H * 0.62], [W * 0.38, H * 0.62], [W * 0.33, H * 0.72], [W * 0.11, H * 0.72]); } },
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
  { id: 'tyc', shape: 'pennant', ratio: 1.8, // mid-century: deep blue over gray water, one white fin
    draw: (g, W, H) => { rect(g, '#16386b', 0, 0, W, H * 0.64); rect(g, '#8d99a6', 0, H * 0.64, W, H * 0.36); poly(g, WHITE, [W * 0.09, H * 0.64], [W * 0.17, H * 0.22], [W * 0.27, H * 0.64]); } },
  { id: 'pyc', shape: 'pennant', ratio: 1.5, // modern-formal: navy, gold, a red band; one horseshoe, symmetrical
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, RED, W * 0.58, 0, W * 0.42, H); const x = W * 0.25, y = H * 0.42, r = H * 0.15; stroke(g, GOLD, H * 0.1, [x - r, y - H * 0.14], [x - r, y]); stroke(g, GOLD, H * 0.1, [x + r, y - H * 0.14], [x + r, y]); arc(g, GOLD, H * 0.1, x, y, r, 0, Math.PI); } },
  { id: 'ssyc', shape: 'pennant', ratio: 1.5, // artsy: cream, teal and willow green; one drooping branch
    draw: (g, W, H) => { fill(g, W, H, '#f0e9d0'); rect(g, '#1f8c8a', 0, 0, W * 0.07, H); stroke(g, '#3d7a35', H * 0.07, [W * 0.12, H * 0.3], [W * 0.3, H * 0.3]); for (const x of [0.15, 0.21, 0.27]) stroke(g, '#3d7a35', H * 0.06, [W * x, H * 0.3], [W * x, H * 0.62]); } },
  { id: 'myc', shape: 'pennant', ratio: 1.5, // established: blue, mountain green, a white cap
    draw: (g, W, H) => { fill(g, W, H, '#2a62b8'); poly(g, '#2f7d4a', [W * 0.05, H * 0.7], [W * 0.2, H * 0.28], [W * 0.35, H * 0.7]); poly(g, WHITE, [W * 0.155, H * 0.42], [W * 0.2, H * 0.28], [W * 0.245, H * 0.42]); } },
  { id: 'sryc', shape: 'pennant', ratio: 1.5, // quiet: deep blue and white, one sandstone bell
    draw: (g, W, H) => { fill(g, W, H, '#17386e'); rect(g, WHITE, W * 0.52, 0, W * 0.48, H); poly(g, '#d2a46e', [W * 0.07, H * 0.66], [W * 0.12, H * 0.58], [W * 0.13, H * 0.38], [W * 0.2, H * 0.25], [W * 0.27, H * 0.38], [W * 0.28, H * 0.58], [W * 0.33, H * 0.66]); } },
  // ---- East Bay
  { id: 'ryc', shape: 'pennant', ratio: 1.5, // DIY: brick red, black and white; one kiln chimney
    draw: (g, W, H) => { fill(g, W, H, '#b03a2a'); rect(g, WHITE, W * 0.5, 0, W * 0.14, H); rect(g, BLACK, W * 0.11, H * 0.34, W * 0.1, H * 0.34); poly(g, BLACK, [W * 0.09, H * 0.34], [W * 0.23, H * 0.34], [W * 0.21, H * 0.27], [W * 0.11, H * 0.27]); } },
  { id: 'byc', shape: 'pennant', ratio: 1.667, // Campanile YC (Berkeley, 1929), on the owner's template: five equal stripes to the point, Berkeley blue and California gold; no charge (the name does the work)
    draw: (g, W, H) => { fill(g, W, H, '#003262'); rect(g, '#fdb515', W * 0.2, 0, W * 0.2, H); rect(g, '#fdb515', W * 0.6, 0, W * 0.2, H); } },
  { id: 'csc', shape: 'pennant', ratio: 1.667, // People's: a co-op, so deep red and white; a raised fist on a white disc, gripping a loose rope (the boat's line) that shows on both sides of it
    draw: (g, W, H) => { fill(g, W, H, '#a81f2b'); dot(g, WHITE, W * 0.21, H * 0.5, H * 0.26); rope(g, W * 0.21, H * 0.5, H * 0.43, -0.1, '#15181c'); fist(g, W * 0.21, H * 0.5, H * 0.42, '#a81f2b'); } },
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
  { id: 'mbyc', shape: 'pennant', ratio: 2, // steel gray with a safety-yellow band
    draw: (g, W, H) => { fill(g, W, H, '#8a96a6'); rect(g, '#f2c200', 0, H * 0.4, W, H * 0.2); } },
  { id: 'slyc', shape: 'pennant', ratio: 1.67, // dark green with two cherries
    draw: (g, W, H) => { fill(g, W, H, '#124d33'); stroke(g, '#7fc050', H * 0.06, [W * 0.1, H * 0.58], [W * 0.17, H * 0.28], [W * 0.24, H * 0.58]); dot(g, '#c3122f', W * 0.1, H * 0.6, H * 0.13); dot(g, '#c3122f', W * 0.24, H * 0.6, H * 0.13); } }
];
