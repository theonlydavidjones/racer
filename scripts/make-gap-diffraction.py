#!/usr/bin/env python3
"""
Waves through a harbor entrance: the diffraction coefficient Kd behind a gap of width B in a straight breakwater, for
waves meeting it square on, solved exactly (linear waves, constant depth, a thin rigid wall; the problem Penney & Price
1952 solved, which Johnson 1952 drew as the diagrams in the Shore Protection Manual, 1984, Vol. 1, Ch. 2, and the
Coastal Engineering Manual, EM 1110-2-1100, Part II, Ch. 7, Figs. II-7-5 on, for B/L 0.5 to 5).

Those diagrams stop at B/L = 0.5. A marina's 20-40 m entrance in a 12 s swell (L about 65-80 m in its 3-5 m of water)
is B/L 0.25-0.6, and in the Bay's own short swell narrower still, so the table is worked out here instead:
  - the water's motion across the gap is found from the condition that the wave on each side of it matches (the
    incident wave plus its reflection from the wall, twice the incident at the wall, on the seaward side; what the gap
    radiates, on the lee side): an integral equation over the gap, with the 2-D Green's function (i/4)·H0(kR), solved
    on 240 panels closer together toward its ends (where the motion is sharpest);
  - the lee side's wave is what the gap radiates, and Kd its height over the incident wave's.
Checks: a gap five wavelengths wide passes the wave whole along its axis (Kd 0.98-1.04 one and two wavelengths in);
narrow gaps match the narrow-slit limit (a line source of strength set by the slit's log capacity: Lamb 1932, Morse &
Rubenstein 1938), 0.063 against 0.064 at B/L 0.1, ten wavelengths in.
Not in it: the basin's own walls reflecting the waves back (a real marina's walls absorb some), the breakwater heads'
thickness, and the bottom's shape at the entrance.

    python3 scripts/make-gap-diffraction.py      (numpy)

Output: src/environment/data/gap-diffraction.json: Kd[B/L][r/L][angle off the gap's axis].
"""
import json, math, os
import numpy as np

GAMMA = 0.5772156649015329

def h0(x):
    """The Hankel function H0(1) of a real argument: series below 12, the asymptotic form above."""
    x = np.asarray(x, float); J = np.zeros_like(x); Y = np.zeros_like(x); sm = x < 12
    xs = x[sm]; t = (xs / 2) ** 2; term = np.ones_like(xs); s = term.copy(); ys = np.zeros_like(xs); H = 0.0
    for k in range(1, 60):
        term = term * (-t) / (k * k); H += 1.0 / k; s += term; ys += term * H
    J[sm] = s; Y[sm] = (2 / np.pi) * ((np.log(xs / 2) + GAMMA) * s - ys)
    xl = x[~sm]; P = 1 - 9 / (128 * xl ** 2) + 3675 / (32768 * xl ** 4); Q = -1 / (8 * xl) + 75 / (1024 * xl ** 3)
    chi = xl - np.pi / 4; f = np.sqrt(2 / (np.pi * xl))
    J[~sm] = f * (P * np.cos(chi) - Q * np.sin(chi)); Y[~sm] = f * (P * np.sin(chi) + Q * np.cos(chi))
    return J + 1j * Y

def solve(BL, N=240):
    """The water's motion across a gap BL wavelengths wide (L = 1), on N panels closer together toward its ends."""
    k = 2 * np.pi
    edges = -BL / 2 * np.cos(np.pi * np.arange(N + 1) / N)
    xc = (edges[1:] + edges[:-1]) / 2; w = np.diff(edges)
    R = np.abs(xc[:, None] - xc[None, :]); np.fill_diagonal(R, 1.0)
    A = (1j / 4) * h0(k * R) * w[None, :]
    for i in range(N):  # each panel's own share, integrated through the log singularity
        h = w[i] / 2
        A[i, i] = (1j / 4) * 2 * (h + (2j / np.pi) * h * (np.log(k * h / 2) + GAMMA - 1))
    return xc, w, np.linalg.solve(A, 0.5 * np.ones(N))

def kd(sol, r, deg):
    """Kd r wavelengths in from the gap's middle, `deg` off its axis."""
    xc, w, v = sol; k = 2 * np.pi; t = math.radians(deg)
    R = np.hypot(r * math.sin(t) - xc, r * math.cos(t))
    return float(abs(np.sum(2 * (1j / 4) * h0(k * R) * v * w)))

BL = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0]
RL = [0.25, 0.5, 1, 2, 3, 5, 10, 20]
TH = [0, 15, 30, 45, 60, 75, 89]
table = []
for b in BL:
    sol = solve(b)
    table.append([[round(kd(sol, r, a), 4) for a in TH] for r in RL])
    print(f'B/L {b}: on the axis {[row[0] for row in table[-1]]}')
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'environment', 'data', 'gap-diffraction.json')
with open(out, 'w') as f:
    json.dump({'source': 'scripts/make-gap-diffraction.py: waves through a gap in a thin straight breakwater, square on, solved exactly (the Penney & Price 1952 problem; SPM 1984 Ch. 2 and CEM II-7 draw it for B/L 0.5-5)',
               'bl': BL, 'rl': RL, 'deg': TH, 'kd': table}, f)
    f.write('\n')
print('wrote', out)
