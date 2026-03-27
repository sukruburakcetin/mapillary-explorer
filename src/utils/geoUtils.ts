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

// Street Coverage Analysis
 
/**
  * Represents a single OSM road segment as a pair of [lon, lat] endpoints.
*/
export interface RoadSegment {
  start:        [number, number];
  end:          [number, number];
  lengthMeters: number;
  /** OSM highway tag value e.g. 'residential', 'primary'. Used for per-type threshold. */
  highwayType:  string;
  /**
    * True when the OSM way has oneway=yes/-1/true.
    * Oneway ways are always ONE half of a dual-carriageway pair ; the OSM
    * centreline is offset from the physical road centre by the lane/median
    * width. A boosted threshold is applied so coverage points driving in
    * either lane still match the opposing-direction way.
  */
  isOneway:     boolean;
}
 
/**
  * Parses raw Overpass API response into a flat array of RoadSegments.
  * Each OSM way is split into consecutive node pairs.
*/
export function parseOverpassRoads(overpassJson: any): RoadSegment[] {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
 
  const haversine = (a: [number, number], b: [number, number]) => {
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const sin2 =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
  };
 
  const segments: RoadSegment[] = [];
  for (const element of overpassJson?.elements ?? []) {
    if (element.type !== 'way' || !element.geometry) continue;
    const highwayType: string = element.tags?.highway ?? 'residential';
    const onewayTag = element.tags?.oneway;
    const isOneway  = onewayTag === 'yes' || onewayTag === '-1' || onewayTag === 'true' || onewayTag === '1';
    const nodes: [number, number][] = element.geometry.map((n: any) => [n.lon, n.lat]);
    for (let i = 0; i < nodes.length - 1; i++) {
      segments.push({
        start:        nodes[i],
        end:          nodes[i + 1],
        lengthMeters: haversine(nodes[i], nodes[i + 1]),
        highwayType,
        isOneway,
      });
    }
  }
  return segments;
}
 
/**
  * Returns the distance in metres between two [lon, lat] points.
  * Uses planar approximation ; accurate enough at street scale.
*/
function pointDistanceMeters(
  p: [number, number],
  q: [number, number]
): number {
  const R = 6_371_000;
  const mPerDegLat = (Math.PI / 180) * R;
  const mPerDegLon = mPerDegLat * Math.cos((p[1] + q[1]) / 2 * Math.PI / 180);
  const dx = (p[0] - q[0]) * mPerDegLon;
  const dy = (p[1] - q[1]) * mPerDegLat;
  return Math.sqrt(dx * dx + dy * dy);
}
 
/**
  * Returns an interpolated point along segment AB at fraction t (0=A, 1=B).
*/
function interpolate(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
 
 
/**
  * Computes an inset bounding box in WGS84 degrees by shrinking each edge
  * inward by `insetMeters`. Used to exclude segments near the bbox edge whose
  * coverage point neighbourhood may be incomplete due to tile truncation.

  * @param bbox        [west, south, east, north] in WGS84 degrees
  * @param insetMeters Margin to strip from each edge
  * @returns           [west, south, east, north] of the inner bbox
*/
export function insetBbox(
  bbox:        [number, number, number, number],
  insetMeters: number
): [number, number, number, number] {
  const [west, south, east, north] = bbox;
  const R          = 6_371_000;
  const midLat     = (south + north) / 2;
  const degPerMLat = 180 / (Math.PI * R);
  const degPerMLon = degPerMLat / Math.cos(midLat * Math.PI / 180);
 
  const dLat = insetMeters * degPerMLat;
  const dLon = insetMeters * degPerMLon;
 
  return [west + dLon, south + dLat, east - dLon, north - dLat];
}
 
/**
  * Returns true if the midpoint of segment [start, end] falls inside bbox.
  * Used to exclude edge segments from analysis.
*/
export function segmentMidpointInBbox(
  seg:  { start: [number, number]; end: [number, number] },
  bbox: [number, number, number, number]
): boolean {
  const midLon = (seg.start[0] + seg.end[0]) / 2;
  const midLat = (seg.start[1] + seg.end[1]) / 2;
  const [west, south, east, north] = bbox;
  return midLon >= west && midLon <= east && midLat >= south && midLat <= north;
}
 
/**
  * Determines which road segments are covered by Mapillary coverage points
  * using a hybrid multi-probe strategy that eliminates both intersection
  * false-positives AND short-segment false-negatives.
  
  * THE PROBLEM WITH PURE MIDPOINT MATCHING:
  *  OSM splits roads at every node ; bus stops, fire hydrant tags, kerb lines.
  *  A photographed block of 60m may have 8 segments of 5-10m each. Midpoint
  *  matching on a 5m segment has its midpoint only 2.5m from each end, so
  *  coverage points clustered at one end (common at intersections) still miss
  *  the midpoint and the segment is falsely marked red.
  *
  * THE HYBRID SOLUTION ; three probe points + length-aware rules:

  *  SHORT segments (< SHORT_SEGMENT_M, typically 20m):
  *    → Check the MIDPOINT only, require just 1 point.
  *    → These tiny segments are almost entirely intersection geometry.
  *      One point anywhere near the middle is sufficient evidence of coverage.
  *      Endpoint-only hits are still rejected because the midpoint is far
  *      from the corner even on a 10m segment.

  *  LONG segments (≥ SHORT_SEGMENT_M):
  *    → Check THREE probes at 25%, 50%, 75% along the segment.
  *    → The segment is covered if at least ONE probe has ≥ minPoints
  *      coverage points within the threshold.
  *    → Three probes means a well-photographed long street is always caught
  *      even if coverage is uneven. The 25%/75% probes are far enough from
  *      the endpoints that pure intersection-corner points cannot reach them,
  *      preserving the false-positive rejection that motivated midpoint matching.

  * @param points          Array of [lon, lat] Mapillary coverage points
  * @param segments        Road segments from parseOverpassRoads()
  * @param thresholdMeters Max distance from probe point (use COVERAGE_SNAP_THRESHOLD_METERS)
  * @param minPoints       Min coverage points required per probe (use COVERAGE_MIN_POINTS_PER_SEGMENT)
  * @returns               Covered and total segment counts and lengths in km
*/
export function snapPointsToSegments(
  points:            [number, number][],
  segments:          RoadSegment[],
  thresholdMeters:   number,
  minPoints:         number = 2,
  highwayThresholds: Record<string, number> = {},
  /** Optional captured_at timestamps (ms since epoch) parallel to `points` array */
  pointTimestamps:   (number | null)[] = []
): {
  coveredCount:     number;
  totalCount:       number;
  coveredKm:        number;
  remainingKm:      number;
  percentCovered:   number;
  /** Most-recent captured_at (ms) per segment, null if uncovered */
  segmentDates:     (number | null)[];
  /** Per-segment tier: 'fresh' | 'aging' | 'stale' | 'none' */
  segmentTiers:     Array<'fresh' | 'aging' | 'stale' | 'none'>;
  freshCount:   number;  freshKm:   number;
  agingCount:   number;  agingKm:   number;
  staleCount:   number;  staleKm:   number;
  noneCount:    number;  noneKm:    number;
} {
  // Freshness thresholds in ms (2yr and 4yr)
  const FRESH_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;
  const AGING_MS = 4 * 365.25 * 24 * 60 * 60 * 1000;
  const now      = Date.now();
 
  if (!segments.length) {
    return {
      coveredCount: 0, totalCount: 0, coveredKm: 0, remainingKm: 0, percentCovered: 0,
      segmentDates: [], segmentTiers: [],
      freshCount: 0, freshKm: 0, agingCount: 0, agingKm: 0,
      staleCount: 0, staleKm: 0, noneCount: 0, noneKm: 0,
    };
  }
 
  // Segments shorter than this use midpoint-only with 1 point minimum
  const SHORT_SEGMENT_M = 20;
 
  let coveredCount = 0;
  let coveredKm    = 0;
  let remainingKm  = 0;
  let freshCount   = 0, freshKm   = 0;
  let agingCount   = 0, agingKm   = 0;
  let staleCount   = 0, staleKm   = 0;
  let noneCount    = 0, noneKm    = 0;
 
  const segmentDates: (number | null)[]                      = [];
  const segmentTiers: Array<'fresh'|'aging'|'stale'|'none'>  = [];
 
  for (const seg of segments) {
    const baseT = highwayThresholds[seg.highwayType] ?? thresholdMeters;
    const T     = seg.isOneway ? Math.round(baseT * 1.25) : baseT;
    let covered        = false;
    let mostRecentDate: number | null = null;
    // Collect timestamps of ALL matching points for majority-vote tier classification.
    // Using a Set of point indices avoids double-counting the same point across probes.
    const matchedIndices = new Set<number>();
 
    if (seg.lengthMeters < SHORT_SEGMENT_M) {
      const mid = interpolate(seg.start, seg.end, 0.5);
      for (let i = 0; i < points.length; i++) {
        if (pointDistanceMeters(points[i], mid) <= T) {
          covered = true;
          matchedIndices.add(i);
          const ts = pointTimestamps[i] ?? null;
          if (ts !== null && (mostRecentDate === null || ts > mostRecentDate)) mostRecentDate = ts;
        }
      }
    } else {
      const probes = [
        interpolate(seg.start, seg.end, 0.25),
        interpolate(seg.start, seg.end, 0.50),
        interpolate(seg.start, seg.end, 0.75),
      ];
      for (const probe of probes) {
        let nearCount = 0;
        for (let i = 0; i < points.length; i++) {
          if (pointDistanceMeters(points[i], probe) <= T) {
            nearCount++;
            matchedIndices.add(i);
            const ts = pointTimestamps[i] ?? null;
            if (ts !== null && (mostRecentDate === null || ts > mostRecentDate)) mostRecentDate = ts;
            if (nearCount >= minPoints) covered = true;
          }
        }
      }
    }
 
    // Build flat timestamp array from deduplicated matched indices for tier voting
    const tierMatchTimestamps = Array.from(matchedIndices).map(i => pointTimestamps[i] ?? null);
 
    segmentDates.push(covered ? mostRecentDate : null);
 
    const km = seg.lengthMeters / 1000;
    if (!covered) {
      noneCount++; noneKm += km; remainingKm += km;
      segmentTiers.push('none');
    } else {
      coveredCount++; coveredKm += km;
 
      // TIER CLASSIFICATION ; Option 5: majority vote among all matching points.
      // "Most recent wins" causes a single stray fresh point to override hundreds
      // of stale points, making a poorly-documented street look green.
      // Instead we count how many matching points fall into each tier and let the
      // plurality decide. The covered/uncovered decision above is still generous
      // (any match = covered), only the color tier uses the majority.
      const tierVotes = { fresh: 0, aging: 0, stale: 0 };
      for (let i = 0; i < tierMatchTimestamps.length; i++) {
        const ts = tierMatchTimestamps[i];
        const age = ts !== null ? now - ts : Infinity;
        if (age <= FRESH_MS)       tierVotes.fresh++;
        else if (age <= AGING_MS)  tierVotes.aging++;
        else                       tierVotes.stale++;
      }
      // Pick tier with the most votes; ties broken in favour of worse tier
      // (stale > aging > fresh) so we don't over-report coverage quality.
      let dominantTier: 'fresh' | 'aging' | 'stale';
      if (tierVotes.stale >= tierVotes.aging && tierVotes.stale >= tierVotes.fresh) {
        dominantTier = 'stale';
      } else if (tierVotes.aging >= tierVotes.fresh) {
        dominantTier = 'aging';
      } else {
        dominantTier = 'fresh';
      }
 
      if (dominantTier === 'fresh') {
        freshCount++; freshKm += km; segmentTiers.push('fresh');
      } else if (dominantTier === 'aging') {
        agingCount++; agingKm += km; segmentTiers.push('aging');
      } else {
        staleCount++; staleKm += km; segmentTiers.push('stale');
      }
    }
  }
 
  const totalCount     = segments.length;
  const percentCovered = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;
 
  return {
    coveredCount, totalCount,
    coveredKm:   Math.round(coveredKm   * 100) / 100,
    remainingKm: Math.round(remainingKm * 100) / 100,
    percentCovered,
    segmentDates,
    segmentTiers,
    freshCount, freshKm:  Math.round(freshKm  * 100) / 100,
    agingCount,  agingKm: Math.round(agingKm  * 100) / 100,
    staleCount,  staleKm: Math.round(staleKm  * 100) / 100,
    noneCount,   noneKm:  Math.round(noneKm   * 100) / 100,
  };
}