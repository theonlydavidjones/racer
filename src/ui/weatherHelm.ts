/**
 * The weather-helm chip at the foot of the tiller guide's dashed line (r035; the owner, 18 Nov 2026: "to help players
 * learn about and judge weather helm"): what it says and how it's colored, from the rudder she's held on with to windward
 * (boat/physics.ts weatherHeld), averaged over the last few seconds (app.ts showWeatherHelm). Teal for 2–5° of weather
 * helm, the balanced helm sailors cite (Good Old Boat, "the rest of the ratios on helm balance": "between 2 and 4
 * degrees of weather helm for optimal performance upwind"; a sailing forum gives 3–5: rules of thumb, an ESTIMATE);
 * amber past 8° ("above 8 degrees ... too much weather helm", the same article); light otherwise.
 */
export const WH_BALANCED: [number, number] = [2, 5], WH_TOO_MUCH = 8;
/** The chip for an average of `avg` degrees of weather helm (negative: lee helm). */
export function weatherHelmChip(avg: number): { text: string; tone: 'ok' | 'over' | '' } {
  const d = Math.round(Math.abs(avg)), lee = avg < -0.5;
  const text = d === 0 ? '0°' : `${d}° ${lee ? 'lee' : 'weather'}`;
  const tone = !lee && d >= WH_BALANCED[0] && d <= WH_BALANCED[1] ? 'ok' : d > WH_TOO_MUCH ? 'over' : '';
  return { text, tone };
}
