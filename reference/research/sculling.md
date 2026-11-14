# Sculling with the rudder: what the sources give (researcher's report, 13 Nov 2026)

For the turning build (the owner: "does sculling currently work? I would think physics would have accounted for the
rudder movement"). No measured data on sculling a sailboat was found (no speeds, stroke rates, amplitudes or turn
rates): the force is from fluid mechanics, the stroke is an estimate.

## The rules (the gate)
- RRS 42.2(d): "sculling: repeated movement of the helm that is either forceful or that propels the boat forward or
  prevents her from moving astern" (US Sailing's commentary on 42.2; the RRS itself not fetched).
- RRS 42.3(d): "When a boat is above a close-hauled course and either stationary or moving slowly, she may scull to turn
  to a close-hauled course." (US Sailing, "Understanding the RRS Through 2028".)
- SCULL 1: "Provided the boat's course is above close-hauled and she clearly changes direction towards a close-hauled
  course, repeated forceful movements of the helm are permitted, even if the boat gains speed. She may turn to a
  close-hauled course on either tack." SCULL 2: "After a boat has sculled in one direction, further connected sculling
  to offset the first sculling action is prohibited." SCULL 3: "Sculling to offset steering of the boat caused by backing
  a sail is prohibited." (US Sailing Rule 42 Protest Log Book, "based on ISAF interpretations", undated.)
- No stroke-rate or speed threshold anywhere: the tests are "forceful", "propels", "prevents moving astern".

## The hydrodynamics
- A plate (span b, chord c) rotating about its leading edge at ω in still water, quasi-steady: normal force
  F = ρ·Cd·b·ω²·c³/6, hinge moment ρ·Cd·b·ω²·c⁴/8 (centre of pressure 0.75c); Cd about 1.2 at aspect ratio 4–5
  (Hoerner, Fluid-Dynamic Drag, from memory). A symmetric sinusoid nets nothing sideways or fore and aft from this term.
- Added mass (Sedov, in Floryan et al. 2017 §2.2, arxiv.org/pdf/1704.07478; 2D): integrates to zero over a cycle; at
  ±30° and 1 Hz its peak force (450–650 N) and hinge moment (about 134 N·m) are larger than the drag's (172 N, 48 N·m):
  about 150 N at the tiller, heavy, so real sculling is probably gentler.
- Pitching-foil thrust (Floryan, Van Buren, Rowley & Smits 2017, JFM, eqs 2.5, 2.7): C_T = 2.55·St² − 0.08, St = f·A/U,
  fitted for St 0.05–0.4. Extrapolated to a standstill: T = ½·2.55·ρ·(c·s)·(f·A)² ≈ 100 N for this blade at ±30°, 1 Hz;
  far outside the fitted range and far more than anyone's sculled speed implies (hull drag at 0.5 m/s is about 6 N).
- An asymmetric stroke (fast one way, slow back) nets a side force toward the fast stroke, since the force goes as ω²;
  a mean bias angle does too (Read, Hover & Triantafyllou 2003, abstract only: mean side-force coefficients up to 5.5).

## The class blade (c 0.37 m, b 1.53 m): F = 15.9·ω² N
- A 60° stroke once a second, twice as fast one way as back: 157 N on the fast stroke, 39 N on the slow; net 25 N at the
  stern, 65 N·m about the keel (2.6 m). Against the hull's cross-flow damping at rest (½ρ·Cd·(A/L)·L⁴/32·r² =
  12,450·r² N·m) the steady sculled turn is 4.1°/s (HANDLING.minTurnRate, the estimate it replaces, was 4°/s).

## Not found
Buchholz & Smits 2008 and Read et al. 2003 in full; any yuloh / stern-oar efficiency data; World Sailing's current
interpretations document (racingrulesofsailing.org is blocked).
