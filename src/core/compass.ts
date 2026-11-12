/** A direction (deg true) as one of the 16 compass points a sailor says: 355° is "N", 22° "NNE", 270° "W". */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
export const compassPoint = (deg: number): string => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
/** "355° (N)": the degrees and the point together. */
export const degAndPoint = (deg: number): string => `${String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0')}° (${compassPoint(deg)})`;
