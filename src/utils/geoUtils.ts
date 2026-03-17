/**
  * geoUtils.ts
  * Pure geographic / math helpers with no React or ArcGIS dependency.
  * Every function here is a plain input → output transformation.
*/

// Haversine distance

/**
  * Returns the great-circle distance in metres between two WGS-84 coordinates.
  * Used to find the nearest sequence image to a map click.
*/
export function distanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}


// Bearing

/**
  * Returns the initial compass bearing (0–360°) from point 1 to point 2.
  * Used when auto-rotating the ArcGIS camera toward a detected object.
*/
export function calculateBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

// Tile math

/**
  * Converts a WGS-84 longitude/latitude pair to XYZ map tile indices
  * for the given zoom level (Web Mercator / TMS scheme).
*/
export function lngLatToTile(
  lon: number,
  lat: number,
  zoom: number
): { x: number; y: number } {
  const xTile = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const yTile = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) +
          1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  return { x: xTile, y: yTile };
}

/**
  * Returns every XYZ tile that intersects the given bounding box
  * at the requested zoom level.
  * @param bbox  [minLon, minLat, maxLon, maxLat] in WGS-84 (number[] or 4-tuple)
  * @param zoom  Tile zoom level (Mapillary typically uses 14)
  * @returns     Array of [x, y, zoom] tuples
*/
export function bboxToTileRange(
  bbox: number[],
  zoom: number
): Array<[number, number, number]> {
  const minTile = lngLatToTile(bbox[0], bbox[3], zoom); // top-left
  const maxTile = lngLatToTile(bbox[2], bbox[1], zoom); // bottom-right

  const tiles: Array<[number, number, number]> = [];
  for (let x = minTile.x; x <= maxTile.x; x++) {
    for (let y = minTile.y; y <= maxTile.y; y++) {
      tiles.push([x, y, zoom]);
    }
  }
  return tiles;
}

// Cone geometry (for minimap - no ArcGIS import needed, returns plain object)

/**
  * Builds a plain-object polygon geometry (ArcGIS-compatible shape literal)
  * representing a camera view cone centred at (lon, lat) pointing at `heading`.
  * Used by updateMinimapTracking() to draw the orange cone on the minimap.
  * Returns a plain object, the caller is responsible for wrapping it in a
  * `new Graphic({ geometry: ... })` call with the ArcGIS SDK.
*/
export function createConeGeometry(
  lon: number,
  lat: number,
  heading: number,
  radiusMeters: number,
  spreadDeg: number
): { type: string; rings: [number, number][][]; spatialReference: { wkid: number } } {
  const metersToDegreesLat = (m: number) => m / 111_320;
  const metersToDegreesLon = (m: number, refLat: number) =>
    m / (111_320 * Math.cos((refLat * Math.PI) / 180));

  const rLat = metersToDegreesLat(radiusMeters);
  const rLon = metersToDegreesLon(radiusMeters, lat);

  const startAngle = heading - spreadDeg / 2;
  const endAngle   = heading + spreadDeg / 2;

  const coords: [number, number][] = [[lon, lat]];

  for (let angle = startAngle; angle <= endAngle; angle += 5) {
    const rad = (angle * Math.PI) / 180;
    coords.push([lon + rLon * Math.sin(rad), lat + rLat * Math.cos(rad)]);
  }
  coords.push([lon, lat]);

  return {
    type: 'polygon',
    rings: [coords],
    spatialReference: { wkid: 4326 },
  };
}

// Misc

/**
  * Generic debounce. Returns a debounced version of `func` that fires only
  * after `wait` ms of silence.
  * Optionally exposes a `cancel()` method on the returned function.
*/
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };

  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced as T & { cancel: () => void };
}

/**
  * Formats a Mapillary traffic sign code (e.g. "warning--yield-ahead--g3")
  * into a human-readable label ("Warning Yield Ahead G3").
*/
export function formatTrafficSignName(code: string): string {
  if (!code) return 'Unknown';
  return code
    .split('--')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
  * Default color palette for sequence overlays.
  * Each item is [R, G, B, A] with RGB 0–255 and Alpha 0–1.
  * Intentionally avoids pure blue so blue sequence markers remain visually
  * distinct from sequence polylines. Order maximises contrast between
  * neighbouring sequences and follows common cartographic practices.
*/
export const SEQUENCE_COLORS: ReadonlyArray<[number, number, number, number]> = [
  [255,   0,   0, 1], // red
  [  0, 200,   0, 1], // green
  [255, 165,   0, 1], // orange
  [160,  32, 240, 1], // purple
  [255, 192, 203, 1], // pink
  [128,   0, 128, 1], // dark purple
  [255, 255,   0, 1], // yellow
  [128, 128, 128, 1], // grey
  [  0, 255, 255, 1], // cyan
];
 
/**
  * Returns a visually distinct [R, G, B, A] color for a given sequence index.
  * Cycles through SEQUENCE_COLORS, darkening by 10 % on each full cycle so
  * later sequences remain distinguishable without repeating exactly.
  * @param index; Zero-based sequence index from availableSequences.
  * @returns [R, G, B, A] array suitable for ArcGIS symbol color.
*/
export function pickSequenceColor(index: number): number[] {
  const color = [...SEQUENCE_COLORS[index % SEQUENCE_COLORS.length]];
  const cycle = Math.floor(index / SEQUENCE_COLORS.length);
  if (cycle > 0) {
    const factor = 1 - cycle * 0.1;
    color[0] = Math.max(0, color[0] * factor);
    color[1] = Math.max(0, color[1] * factor);
    color[2] = Math.max(0, color[2] * factor);
    // alpha unchanged
  }
  return color;
}