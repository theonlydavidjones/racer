#!/usr/bin/env python3
"""
Builds src/render/human.json, the crew's body mesh, from MakeHuman's base mesh.

Source: makehumancommunity/makehuman, makehuman/data/3dobjs/base.obj ("explicitly released as CC0 in September 2020",
Data Collection AB; see that repository's LICENSE.md, which lists "the base mesh and proxies" as CC0 1.0 Universal).

  python3 scripts/assets/build-human.py <base.obj> [target-verts]   → src/render/human.json

What it does:
  1. keeps the body (drops the helper geometry: eyelashes, teeth, tights...), and the joint markers' centres;
  2. decimates one half (quadric error, edge collapse into an endpoint, the midline kept on the midline) and mirrors it, so
     the figure stays exactly symmetric; the face keeps more of its detail than the hands (which wear gloves);
  3. skins it to the sim's 11-bone crew skeleton (render/crewBody.ts): weights from the distance to each bone's segment,
     smoothed over the surface;
  4. re-poses and fits it to that skeleton's bind pose (arms hanging straight down, legs straight, the joints where the
     skeleton has them), facing −z with +x to starboard as the boat frame has it.
"""
import sys, json, heapq, collections, math
import numpy as np

src = sys.argv[1]; target = int(sys.argv[2]) if len(sys.argv) > 2 else 2600
V = []; G = {}; cur = None
for l in open(src):
    if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
    elif l.startswith('g '): cur = l.split()[1]; G.setdefault(cur, [])
    elif l.startswith('f '): G[cur].append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(V)
J = {k[6:]: V[np.unique(np.concatenate([np.array(f) for f in G[k]]))].mean(0) for k in G if k.startswith('joint-')}

# ——— 1. the right half (x ≥ 0 is the figure's left in MakeHuman's frame; mirrored later), triangulated
F = [f for f in G['body'] if all(V[i][0] >= -1e-6 for i in f)]
used = sorted(set(i for f in F for i in f)); remap = {o: n for n, o in enumerate(used)}
P = V[used].copy(); P[np.abs(P[:, 0]) < 1e-6, 0] = 0
T = []
for f in F:
    a, b, c, d = [remap[i] for i in f]
    # split each quad along its shorter diagonal
    if np.linalg.norm(P[a] - P[c]) <= np.linalg.norm(P[b] - P[d]): T += [[a, b, c], [a, c, d]]
    else: T += [[a, b, d], [b, c, d]]
T = np.array(T); n = len(P); mid = np.abs(P[:, 0]) < 1e-6
print('half:', n, 'verts', len(T), 'tris', int(mid.sum()), 'on the midline', file=sys.stderr)

# ——— 2. decimate: quadric error metrics (Garland & Heckbert 1997), half-edge collapse u→v
def importance(p):  # (more error tolerated on the hands and feet; less on the face)
    y = p[1]
    if y > J['neck'][1] + 0.3 and p[2] > 0.2: return 6.0   # face
    if y > J['neck'][1]: return 2.5                        # the rest of the head
    if abs(p[0]) > J['l-elbow'][0] + 0.6 and y < J['l-elbow'][1]: return 0.25  # hands
    if y < J['l-ankle'][1] + 0.2: return 0.4               # feet
    return 1.0
Q = np.zeros((n, 4, 4)); faces_of = [set() for _ in range(n)]
alive = np.ones(len(T), bool)
def fplane(t):
    a, b, c = P[T[t]]; nn = np.cross(b - a, c - a); L = np.linalg.norm(nn)
    if L < 1e-12: return None
    nn /= L; return np.append(nn, -nn @ a), L
for t in range(len(T)):
    pl = fplane(t)
    if pl is None: continue
    pv, area = pl; K = np.outer(pv, pv) * area
    for v in T[t]: Q[v] += K * importance(P[v]); faces_of[v].add(t)
# (the midline is a seam on the half mesh: hold it with planes across it, so it isn't eaten away)
for t in range(len(T)):
    for k in range(3):
        a, b = T[t][k], T[t][(k + 1) % 3]
        if mid[a] and mid[b]:
            e = P[b] - P[a]; nn = np.array([1.0, 0, 0]); w = np.cross(e, nn); L = np.linalg.norm(w)
            if L > 0: w /= L; pv = np.append(w, -w @ P[a]); K = np.outer(pv, pv) * 10 * np.dot(e, e)
            Q[a] += K; Q[b] += K
def nbrs(v): return set(int(x) for t in faces_of[v] for x in T[t]) - {v}
def cost(u, v):
    h = np.append(P[v], 1); return float(h @ (Q[u] + Q[v]) @ h)
ver = np.zeros(n, int); heap = []
def push(u):
    for v in nbrs(u):
        if mid[u] and not mid[v]: continue  # (a midline vertex only moves along the midline)
        heapq.heappush(heap, (cost(u, v), u, v, ver[u], ver[v]))
for u in range(n): push(u)
live = n; dead = np.zeros(n, bool)
def ok(u, v):
    Nu, Nv = nbrs(u), nbrs(v); common = Nu & Nv
    shared = [t for t in faces_of[u] if v in T[t]]
    if len(common) != len(shared): return False  # (the link condition: stays a manifold)
    if mid[u] and mid[v] and len(shared) != 1: return False
    for t in faces_of[u]:
        if v in T[t]: continue
        a, b, c = P[T[t]]; n0 = np.cross(b - a, c - a)
        q = [P[v] if x == u else P[x] for x in T[t]]; n1 = np.cross(q[1] - q[0], q[2] - q[0])
        if n0 @ n1 <= 0.2 * np.linalg.norm(n0) * np.linalg.norm(n1): return False  # (no folded or sliver faces)
    return True
while live > target // 2 + 94 and heap:
    c, u, v, vu, vv = heapq.heappop(heap)
    if dead[u] or dead[v] or ver[u] != vu or ver[v] != vv: continue
    if not ok(u, v): continue
    for t in list(faces_of[u]):
        if v in T[t]: alive[t] = False; [faces_of[x].discard(t) for x in T[t]]
        else: T[t] = [v if x == u else x for x in T[t]]; faces_of[v].add(t)
    faces_of[u] = set(); dead[u] = True; Q[v] += Q[u]; live -= 1; ver[v] += 1
    for w in nbrs(v): ver[w] += 1
    push(v)
    for w in nbrs(v): push(w)
keep = np.where(~dead)[0]; nm = {o: i for i, o in enumerate(keep)}
P2 = P[keep]; T2 = np.array([[nm[x] for x in T[t]] for t in range(len(T)) if alive[t]]); m2 = mid[keep]
# mirror: the midline vertices shared, the other side flipped (and its winding reversed)
k = len(P2); mir = {}
P3 = list(P2)
for i in range(k):
    if m2[i]: mir[i] = i
    else: mir[i] = len(P3); P3.append(P2[i] * [-1, 1, 1])
P3 = np.array(P3); T3 = np.concatenate([T2, np.array([[mir[c], mir[b], mir[a]] for a, b, c in T2])])
print('decimated:', len(P3), 'verts', len(T3), 'tris', file=sys.stderr)

# ——— 2b. the hands closed to a loose grip (as round a sheet or the tiller): each finger turned toward the palm about
# its knuckles, more toward the tip; the thumb left as it is
for pre in ('l-', 'r-'):
    kn = [J[pre + 'finger-%d-1' % f] for f in (2, 3, 4, 5)]; axis = kn[-1] - kn[0]; axis /= np.linalg.norm(axis)
    fdir = J[pre + 'finger-3-4'] - J[pre + 'finger-3-1']; fdir /= np.linalg.norm(fdir)
    palm = np.cross(axis, fdir); palm /= np.linalg.norm(palm)
    if palm[1] > 0: palm = -palm; axis = -axis  # (palms face down in MakeHuman's A-pose)
    k0 = np.mean(kn, 0)
    for i in range(len(P3)):
        q = P3[i] - k0; d = q @ fdir
        if d <= 0 or np.linalg.norm(q - d * fdir - (q @ axis) * axis) > 0.6: continue
        if np.linalg.norm(P3[i] - J[pre + 'finger-1-4']) < np.linalg.norm(P3[i] - J[pre + 'finger-2-4']) * 0.8: continue  # the thumb
        a = 1.9 * min(1.0, d / 0.9)
        # the rotation about `axis` through the knuckles, tips toward the palm
        Kx = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]]); Rm = np.eye(3) + math.sin(a) * Kx + (1 - math.cos(a)) * Kx @ Kx
        r = Rm @ q
        if (r - q) @ palm < 0: Rm = np.eye(3) - math.sin(a) * Kx + (1 - math.cos(a)) * Kx @ Kx; r = Rm @ q
        P3[i] = k0 + r

# ——— 3. skin weights. The sim's bones: 0 hips, 1 spine, 2 head, 3/4 left upper arm/forearm, 5/6 right, 7/8 left
# thigh/shin, 9/10 right. ("left" = MakeHuman's l- side = −x in the boat frame after the turn to face −z; the sim's
# arm 0 / leg 0 are its −x ones.)
def seg(a, b): return (np.array(a, float), np.array(b, float))
L, R = 'l-', 'r-'
segs = {
  0: [seg(J['pelvis'], J['spine-3']), seg(J['pelvis'], J[L + 'upper-leg'] * [0.4, 1, 1]), seg(J['pelvis'], J[R + 'upper-leg'] * [0.4, 1, 1])],
  1: [seg(J['spine-3'], J['neck']), seg(J['spine-1'], J[L + 'clavicle']), seg(J['spine-1'], J[R + 'clavicle']),
      seg(J[L + 'clavicle'], J[L + 'shoulder'] * [0.75, 1, 1]), seg(J[R + 'clavicle'], J[R + 'shoulder'] * [0.75, 1, 1])],
  2: [seg(J['neck'] + [0, 0.35, 0], J['head-2'])],
  3: [seg(J[L + 'shoulder'], J[L + 'elbow'])], 4: [seg(J[L + 'elbow'], J[L + 'hand']), seg(J[L + 'hand'], J[L + 'finger-3-4'])],
  5: [seg(J[R + 'shoulder'], J[R + 'elbow'])], 6: [seg(J[R + 'elbow'], J[R + 'hand']), seg(J[R + 'hand'], J[R + 'finger-3-4'])],
  7: [seg(J[L + 'upper-leg'], J[L + 'knee'])], 8: [seg(J[L + 'knee'], J[L + 'ankle']), seg(J[L + 'ankle'], J[L + 'foot-2'])],
  9: [seg(J[R + 'upper-leg'], J[R + 'knee'])], 10: [seg(J[R + 'knee'], J[R + 'ankle']), seg(J[R + 'ankle'], J[R + 'foot-2'])],
}
def dseg(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + np.outer(t, ab)) if p.ndim > 1 else p - (a + t * ab), axis=-1)
D = np.stack([np.min([dseg(P3, a, b) for a, b in segs[bn]], axis=0) for bn in range(11)], 1)
# (a limb never takes the other side's flesh; the head only above the neck)
side = np.sign(P3[:, 0])
for bn in (3, 4, 7, 8): D[side < 0, bn] = 1e9
for bn in (5, 6, 9, 10): D[side > 0, bn] = 1e9
D[P3[:, 1] < J['neck'][1] - 0.2, 2] = 1e9
W = 1 / np.maximum(D, 1e-3) ** 6; W /= W.sum(1, keepdims=True)
# smooth over the surface (a few passes of the neighbours' mean), so the joints bend as flesh and not as a crease
adj = [set() for _ in range(len(P3))]
for a, b, c in T3: adj[a] |= {b, c}; adj[b] |= {a, c}; adj[c] |= {a, b}
for _ in range(10):
    W = 0.5 * W + 0.5 * np.array([W[list(s)].mean(0) for s in adj])
# the head is one bone above the jaw (the eyes, set into it, are on it alone): blended into the spine only across the neck
yk = (P3[:, 1] - J['l-upper-leg'][1]) * (0.47 / (J[L + 'shoulder'][1] - J[L + 'upper-leg'][1]))
th = np.clip((yk - 0.515) / (0.575 - 0.515), 0, 1); th = th * th * (3 - 2 * th)
neckish = yk > 0.47
W[neckish] *= (1 - th[neckish])[:, None]; W[neckish, 2] += th[neckish]
W[neckish] = np.where(np.arange(11)[None, :] < 3, W[neckish], W[neckish] * (1 - th[neckish])[:, None])
W /= W.sum(1, keepdims=True)
top = np.argsort(-W, 1)[:, :2]; tw = np.take_along_axis(W, top, 1); tw /= tw.sum(1, keepdims=True)

# ——— 4. re-pose and fit to the sim's skeleton (metres; the hips' joint at the origin, y up), then turn to face −z
k = 0.47 / (J[L + 'shoulder'][1] - J[L + 'upper-leg'][1])  # (scaled so the shoulders sit 0.47 m over the hips)
hipC = (J[L + 'upper-leg'] + J[R + 'upper-leg']) / 2
BONE = dict(thigh=0.43, shin=0.43, upper=0.30, fore=0.255, shoulderY=0.47, hipX=0.095, shoulderX=0.2, headY=0.57)
def rot(a, b):  # the rotation taking direction a onto b
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)
def M(p):  # MakeHuman point → the sim's frame, before the turn (same handedness; x still to MakeHuman's left)
    return (p - hipC) * k
down = np.array([0, -1.0, 0])
def limb(j0, j1, at, length):  # a similarity map: the segment j0→j1 laid straight down from `at`, `length` long
    a, b = M(J[j0]), M(J[j1]); d0 = (b - a) / np.linalg.norm(b - a); s = length / np.linalg.norm(b - a)
    ax = np.cross(d0, down); sa = np.linalg.norm(ax); ang = math.atan2(sa, d0 @ down); ax = ax / sa if sa > 1e-9 else np.array([1.0, 0, 0])
    Rfull = rot(d0, down)
    def f(p):  # (stretched along the bone, its girth as is; the turn eased in over the first third of the bone, so the
        # flesh over the joint follows only partway, as a deltoid does over a lowering arm)
        q = p - a; t = (q @ d0) / np.linalg.norm(b - a); e = np.clip((t + 0.15) / 0.5, 0, 1); e = e * e * (3 - 2 * e)
        th = ang * e; K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
        Rm = np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
        r = Rm @ q; along = r @ down; return at + r + down * along * (s - 1) * max(0.0, min(1.0, t * 4))
    return f
# (the base mesh's shoulders are narrower than the skeleton's: the chest widens from the waist up to meet them, as a
# broader build does, so the arms hang from their own joints and not from a shelf)
wide = BONE['shoulderX'] / abs(M(J[L + 'shoulder'])[0])
def chest(p):
    t = np.clip((p[1] - 0.22) / 0.22, 0, 1); t = t * t * (3 - 2 * t); return p * [1 + (wide - 1) * t, 1, 1]
maps = {0: lambda p: p, 1: chest, 2: lambda p: p}
sx = {3: 1, 4: 1, 7: 1, 8: 1, 5: -1, 6: -1, 9: -1, 10: -1}
for (u, f), sgn, pre in [((3, 4), 1, L), ((5, 6), -1, R)]:
    sh = np.array([sgn * BONE['shoulderX'], BONE['shoulderY'], M(J[pre + 'shoulder'])[2]])
    maps[u] = limb(pre + 'shoulder', pre + 'elbow', sh, BONE['upper'])
    maps[f] = limb(pre + 'elbow', pre + 'hand', sh + [0, -BONE['upper'], 0], BONE['fore'] - 0.03)
for (u, f), sgn, pre in [((7, 8), 1, L), ((9, 10), -1, R)]:
    hp = np.array([sgn * BONE['hipX'], 0, M(J[pre + 'upper-leg'])[2]])
    maps[u] = limb(pre + 'upper-leg', pre + 'knee', hp, BONE['thigh'])
    maps[f] = limb(pre + 'knee', pre + 'ankle', hp + [0, -BONE['thigh'], 0], BONE['shin'])
Pm = np.array([M(p) for p in P3])
out = np.zeros_like(Pm)
for i in range(len(Pm)):
    out[i] = sum(tw[i, j] * maps[top[i, j]](Pm[i]) for j in range(2))
# the turn to face −z (x → −x, z → −z): MakeHuman's left lands on −x, the sim's arm/leg 0
out *= [-1, 1, -1]; T3 = T3  # (a turn, not a mirror: the winding stands)
jm = {k2: (M(v) * [-1, 1, -1]).round(4).tolist() for k2, v in J.items() if not any(s in k2 for s in ('finger', 'toe', 'tongue'))}
# the bones' joints in the sim's bind pose, for the record (the skeleton is built by crewBody.ts)
json.dump({
  'source': 'MakeHuman base.obj (CC0 1.0, makehumancommunity/makehuman), decimated, re-posed and skinned by scripts/assets/build-human.py',
  'pos': out.round(4).flatten().tolist(), 'orig': (Pm * [-1, 1, -1]).round(4).flatten().tolist(),
  'idx': T3.flatten().tolist(), 'bone': top.flatten().tolist(), 'w': tw[:, 1].round(3).tolist(), 'joints': jm,
}, open(sys.argv[3] if len(sys.argv) > 3 else 'src/render/human.json', 'w'), separators=(',', ':'))
print('weights done', file=sys.stderr)
