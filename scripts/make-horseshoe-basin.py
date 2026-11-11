#!/usr/bin/env python3
"""
Horseshoe Bay's basin (Travis Marina, Fort Baker), for scripts/make-marinas.mjs.

OSM's Travis Marina outline (leisure=marina) takes in land: Marina Road's lot and the buildings along the north shore.
The basin is the water inside it:
  1. the outline, less the stone breakwaters and revetments (OSM areas, man_made=breakwater; NOAA ENC US5CA13M charts the
     same breakwater and riprap), less an 8 m strip on the land side of every coastline way (OSM coastlines run with the
     land on their left);
  2. the connected piece that holds the docks;
  3. grown 1 m into the breakwaters (so no sliver of water lies between the basin's edge and the rock) and simplified to
     0.3 m.
The basin's edge where it is the coastline itself (not a breakwater) is the shore: solid.

    pip install shapely          (a throwaway virtualenv is fine: it isn't a dependency of the sim)
    python3 scripts/make-horseshoe-basin.py   → scripts/data/horseshoe-basin.json

Source: OpenStreetMap contributors (ODbL), api.openstreetmap.org.
"""
import json, os, re, urllib.request
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

BBOX = (-122.4810, 37.8300, -122.4700, 37.8360)  # W S E N
LAND_STRIP, GROW, SIMPLIFY = 8.0, 1.0, 0.3        # m

req = urllib.request.Request('https://api.openstreetmap.org/api/0.6/map?bbox=%f,%f,%f,%f' % BBOX, headers={'User-Agent': 'folkboat-racing-sim (personal project)'})
xml = urllib.request.urlopen(req, timeout=60).read().decode()
nodes = {m[0]: (float(m[2]), float(m[1])) for m in re.findall(r'<node id="(\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"', xml)}
ways = []
for m in re.finditer(r'<way id="(\d+)"[^>]*>([\s\S]*?)</way>', xml):
    tags = dict(re.findall(r'<tag k="([^"]+)" v="([^"]*)"/>', m[2]))
    ways.append(([nodes[n] for n in re.findall(r'<nd ref="(\d+)"/>', m[2]) if n in nodes], tags))

L0, K = 37.833, 111320.0
KX = K * 0.7903  # cos(37.833°)
xy = lambda p: ((p[0] + 122.476) * KX, (p[1] - L0) * K)
ll = lambda q: [round(q[1] / K + L0, 7), round(q[0] / KX - 122.476, 7)]

outline = Polygon([xy(p) for p in next(w for w, t in ways if t.get('leisure') == 'marina')])
rock = unary_union([Polygon([xy(p) for p in w]) for w, t in ways if t.get('man_made') == 'breakwater' and t.get('area') == 'yes' and len(w) > 3])
coast = [LineString([xy(p) for p in w]) for w, t in ways if t.get('natural') == 'coastline' and len(w) > 1]
land = unary_union([c.buffer(LAND_STRIP, single_sided=True) for c in coast])  # (left of the way: the land side)
water = outline.difference(rock).difference(land)
pieces = list(water.geoms) if water.geom_type == 'MultiPolygon' else [water]
docks = [LineString([xy(p) for p in w]).interpolate(0.5, normalized=True) for w, t in ways if t.get('man_made') == 'pier' and t.get('area') != 'yes' and len(w) > 1]
basin = max(pieces, key=lambda pc: sum(pc.contains(d) for d in docks)).buffer(GROW, join_style=2).simplify(SIMPLIFY)

# the shore: runs of the basin's edge that lie on the coastline, away from the rock
coast_u, ring, runs, cur = unary_union(coast), list(basin.exterior.coords), [], []
for a, b in zip(ring[:-1], ring[1:]):
    m = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    if coast_u.distance(m) < 1.5 and rock.distance(m) > 1.0:
        cur = cur or [a]; cur.append(b)
    elif cur:
        runs.append(cur); cur = []
if cur: runs.append(cur)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'horseshoe-basin.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({'source': 'OpenStreetMap contributors (ODbL); scripts/make-horseshoe-basin.py', 'basin': [ll(q) for q in ring[:-1]],
           'shore': [[ll(q) for q in r] for r in runs if len(r) > 1]}, open(out, 'w'))
print('%d points, %.0f m2; shore runs %s' % (len(ring) - 1, basin.area, [round(LineString(r).length) for r in runs]))
