# Proposal: the waves move her (ROADMAP "The waves move her only on average", waves 1)

_Bay East, 13 Nov 2026. For the Coordinator. No code until it's agreed._

## Where it stands

- **The physics** feels the sea only on average:
  - a mean added resistance (seaway.ts seaDrag: Gerritsma–Beukelman's form, calibrated to a judgment);
  - a yaw rate from a slender hull's Froude–Krylov moment, scaled to what the sim had (seaway.ts waveYaw).
- **No first-order motion:**
  - no surge, heave or pitch;
  - roll is a damped oscillator toward the heel balance (balance.ts rollStep, Klaka 2000), with no wave moment in it.
- **The drawn hull** rides a different sea: render/waves.ts has 12 wind-sea and 3 swell Gerstner components (JONSWAP heights, cos^2s spread).
  - boatOnWaves samples five points of the surface and sets heave, pitch and roll straight from it, with ad-hoc factors (0.8, 0.5).
  - The physics doesn't know about that motion. So sails, telltales, flags and heel can't answer it, and the race worker (src/sim/host.ts) and the page each have their own idea of the sea.

## The numbers that make it matter (measured from the drawn hull)

I sliced the hull's own sections (render/hull.ts) at the waterline:
- waterplane area 6.95 m²;
- LWL 6.0 m;
- BWL 2.04 m (hullTrim.ts estimated 1.85);
- longitudinal inertia I_L 14.2 m⁴ (hullTrim's estimate gives 16.0).

With her 2,000 kg sailing displacement:

| Mode | Restoring | Inertia | Natural period |
|---|---|---|---|
| Heave | ρg·Awp = 70 kN/m | m (1 + a33/m), a33/m ≈ 0–1 | 1.1–1.5 s |
| Pitch | ρg·I_L = 143 kN·m/rad | m·k_yy² (1 + A55/I55); k_yy ≈ 0.25 LOA, added ≈ 0–1 | 1.4–2.0 s |
| Roll | Δ·g·GM | already in rollStep (Klaka: about 3.5 s) | about 3.5 s |

The added-mass range and k_yy are typical figures; a source is still to be found (see Open). The Bay's afternoon chop is a 2–3 s sea. Close-hauled at 5 kt, a 2.5 s chop (9.8 m long) meets her every 1.5 s, which is right on her pitch period. That's the hobby-horsing the owner describes, and it should fall out of the physics rather than be drawn on.

## (a) One wave field, shared

- **New `src/environment/waveField.ts`** holds the components that are now render/waves.ts's data half:
  - the fixed wavelengths;
  - the directions from the cos^2s spread (Mitsuyasu 1975);
  - the JONSWAP heights (Hasselmann et al. 1973);
  - the phases.
  It's a pure function of the world: the course's sea reference, the mean wind and the race seed. The worker and the page then build the same field.
- **Amplitudes from the existing sea model** (environment/sea.ts):
  - the wind sea from the JONSWAP fetch-limited growth on the real coastline;
  - the swell from NDBC 46237 by month;
  - the current-wave steepening.
  Each boat's local sea scales the components, kW = b.sea.hsW / ref.hsW, as render does now.
- **Checking it against the Bay:** no wave buoy inside the Bay records spectra. NDBC's in-Bay stations are met and tide only. The checks there are:
  - **Corte Madera Bay** (USGS OFR 2011-1183): Hs over 0.5 m at about 3 s, 2–4 s whenever Hs > 0.3 m, nothing above 5 s.
  - **The sim's own formula:** for 20 kt over 10 km of fetch it gives Hs 0.6 m and Tp 2.9 s, the same order.
  - **The swell:** the realtime 46237, 46026 and 46214 .data_spec files give a measured spectrum offshore. 46026 has historical spectra from 1996 and directions from 2007; 46237 has heights and periods only. The three swell components could take their spread from the measured direction spectrum rather than a fixed one.
  - **The JONSWAP shape:** γ = 3.3 and s ≈ 8 stand unverified for a fetch-limited chop. Donelan et al. 1985 give γ by wave age, which is the better-documented choice; the paper wasn't reachable.
  - How much swell gets in past the Gate (sea.ts swellReach 0.55, 2.8 km) stays an estimate. Hanes & Erikson 2013 describe it qualitatively only.
- **Two render-only habits come out:**
  - the field turning about the camera's focus. It would be turned about the course origin with its phase correction, in sim time, by the world.
  - easing the heights toward the sea at the camera. Instead, the world eases the course reference, and both sides read it.
- **render/waves.ts keeps** the GLSL, the packing and the water mesh, and reads the components from the world mirror (sim/sync.ts).

## (b) The motions

Linear seakeeping in the time domain. Each wave component's force is worked out where the boat is, every step, so the encounter frequency comes for free as she sails through the field. The method is strip theory's Froude–Krylov excitation, as waveYaw already does for yaw: Faltinsen 1990 ch. 3; Newman §6.17; Journée & Massie, Offshore Hydromechanics, ch. 6.
- **Heave and pitch:** two damped oscillators, forced as follows.
  - The force is ρg∫ζ·b(x)dx and the moment ρg∫x·ζ·b(x)dx along her length.
  - The length integral is closed-form for a uniform section, like the yaw lever.
  - There is a beam average, sinc(k·B·sin β / 2), so short crests across her cancel.
  - The pressure decays as e^(−k·T_m), the Smith effect.
  - The restoring terms are measured from the hull, as above. Added mass and damping are flagged estimates until sourced.
  - First version: uncoupled. Heave–pitch coupling (her center of flotation is 0.36 m aft of the middle) is a second step.
- **Roll:** the same Froude–Krylov idea gives a roll moment ∝ Δ·g·GM × the effective wave slope across her beam.
  - The standard simplification: Journée & Massie; IMO's weather criterion uses the same r·s slope factor.
  - It enters rollStep through its heel target: heelEq + the slope's angle. rollStep's signature doesn't change.
- **Surge:** Froude–Krylov in surge, −ρg∇·∂ζ/∂x averaged along her, with the Smith factor.
  - It adds a periodic push to the force sum physics.ts already hands surgeAccel, so dynamics.ts doesn't change.
  - She can't surf the swell: a 12 s swell runs at 19 m/s against her 3.1 m/s hull speed.
  - Downwind in steep chop, whose crests run at about 4 m/s, the push carries her briefly past her target, as a Folkboat's short runs on a chop do. That falls out of the force, not a rule.
  - The mean added resistance (seaDrag) stays. It's the second-order drift force, which a linear model doesn't produce, so nothing is counted twice: first-order surge averages to zero.
- **Yaw:** waveYaw's synthetic sines go. The same per-component Froude–Krylov yaw moment is worked out in the time domain from the shared field, at the scale it has now.

## (c) Apparent wind

- **The rig moves through the air.** This is already done for roll (physics.ts rigSway: roll rate × height). Pitch adds the same along the boat: the speed at height z is pitch rate × (z − pitch axis).
  - That's about ±1 m/s at the masthead for ±2° at 2 s.
  - It goes into the sails' apparent wind (sailWind, at the center of effort) and the wind at each height (physics.ts:1047, for the windex, flags and telltales).
  - So sails, telltales and flags all answer the same pitching, as the standing rule asks.
- **Heave** moves the rig vertically. That doesn't change the wind across the sails, so it's left out.
- **The sails' response stays quasi-steady.**
  - Wind-tunnel and FSI work shows hysteresis in pitching (Fossati & Muggiasca; Augier et al.; Bot et al. 2012); it's not modeled here.
- **One state, drawn:** the worker carries heave, pitch and the wave roll in each boat's state.
  - The mirror sends them.
  - syncBoatMesh draws the hull at the physics' motion instead of boatOnWaves's own (which goes).
  - So the drawn heel, pitch, sails and flags answer one motion.
  - The water surface is the same field, so the hull sits right on it. A real hull doesn't follow 1.6 m ripples, and the response filters them out.

## (d) Cost

- **Per boat per step:** 15 components × (one sin/cos pair at the boat, plus the closed-form length factors), and three oscillator updates.
  - That's about 100 transcendental operations, against the thousands a step already does.
- **Expected:** under 2% of the step.
  - Main is over the 54.7 budget already (55–58).
  - To hold it flat, AI boats can work their wave forces at their 20 Hz thinking rate (AI_EVERY), and the user's boat every step.
- **Measured** with tests/perf.test.ts before and after each phase, and reported.

## (e) Files, and the seams

- **New:**
  - src/environment/waveField.ts;
  - tests/seakeeping.test.ts, covering:
    - natural periods against the hull's hydrostatics;
    - a single regular wave's response against the closed form;
    - encounter frequency;
    - the response falling to nothing in short waves and to following the surface in long swell;
    - replays bit-identical.
- **Changed:**
  - src/boat/seaway.ts: the excitation and the oscillators; waveYaw rebuilt;
  - src/boat/physics.ts: the call sites, the surge force into the existing sum, the roll target, pitch into the apparent wind;
  - src/sim/world.ts and sim/sync.ts: the wave field per world, the reference sea, and the new state mirrored;
  - render/waves.ts, render/scene.ts and render/boatMesh.ts: read the field, draw the physics' motion.
- **dynamics.ts (Deep Physics):** I don't expect to edit it.
  - The surge force goes into the force sum physics.ts already passes to surgeAccel, the way seaDrag does.
  - I'll confirm that seam with Deep Physics before starting.
- **render/ files:** owned by Render. I'd agree the waves.ts split with them.

## Phases (each published separately)

1. The shared field, and heave and pitch from the physics, drawn, with pitch into the apparent wind.
2. Roll forcing and surge.
3. Yaw from the field; waveYaw's synthetic terms go.

## Open

- **Sources for the added mass, the pitch radius of gyration and the damping ratios in heave and pitch.**
  - The researcher couldn't reach the Delft series seakeeping work (Gerritsma, Keuning & Onnink 1992; repository.tudelft.nl answered 503).
  - Until then they'd be flagged estimates, checked against the natural periods above.
  - Journée & Massie's open textbook is the fallback for strip-theory coefficients of Lewis-form sections, from which a33 and A55 can be computed for her own sections.
- **The Bay chop:** there is no in-Bay spectral record, so its shape rests on the sea model's growth laws and the Corte Madera check above.
  - A short deployment would settle it: a phone-sized accelerometer on a boat, or a small spotter buoy off the Cityfront.
  - That's an owner's question.
- **Hosts that would close the sourcing gaps:** cdip.ucsd.edu, thredds.cdip.ucsd.edu and data-ww3.ifremer.fr (which hosts the Donelan and Young & Verhagen PDFs), and repository.tudelft.nl, which answered 503 today.
