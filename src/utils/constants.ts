/**
  * constants.ts
  * Single source of truth for every magic string, number, and URL
  * used across the Mapillary Explorer widget.
  * HOW TO USE
  *   import { LAYER_IDS, API, ZOOM, CACHE } from '../constants';
*/

// ArcGIS Layer IDs
// These strings are used with view.map.findLayerById() and as layer.id values.
// Changing one here changes it everywhere automatically.
export const LAYER_IDS = {
  /** Standard Mapillary vector tile coverage layer */
  COVERAGE_VT: 'mapillary-vector-tiles',

  /** Traffic signs vector tile coverage (icon symbols at all zooms) */
  TRAFFIC_SIGNS_VT: 'mapillary-traffic-signs-vt',

  /** Traffic signs feature layer (clickable popups, zoom ≥ 16 only) */
  TRAFFIC_SIGNS_FL: 'mapillary-traffic-signs-fl',

  /** Objects vector tile coverage (icon symbols at all zooms) */
  OBJECTS_VT: 'mapillary-objects-vt',

  /** Objects feature layer (clickable popups, zoom ≥ 16 only) */
  OBJECTS_FL: 'mapillary-objects-fl',

  /** Turbo mode coverage points feature layer */
  TURBO_COVERAGE: 'turboCoverage',

  /** Graphics layer inside the minimap for tracking dot + cone */
  MINIMAP_TRACKING: 'minimap-tracking',
} as const;


// MapGL style layer IDs (inside VectorTileLayer .style.layers[])
// Used when mutating the style JSON to apply filters.
export const STYLE_LAYER_IDS = {
  OVERVIEW: 'overview',
  SEQUENCE: 'sequence',
  IMAGE: 'image',
  TRAFFIC_SIGNS_ICONS: 'traffic-signs-icons',
  OBJECTS_ICONS: 'mapillary-objects-icons',
} as const;


// MapGL source names (inside VectorTileLayer .style.sources{})
export const STYLE_SOURCE_IDS = {
  MAPILLARY: 'mapillary',
  TRAFFIC_SIGNS: 'mapillary-traffic-signs',
  OBJECTS: 'mapillary-objects',
} as const;


// Mapillary Tile API base URLs (access token appended at runtime)
export const TILE_URLS = {
  /** Public imagery coverage - overview, sequence, image layers */
  COVERAGE: 'https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}',

  /** Traffic sign map features */
  TRAFFIC_SIGNS: 'https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/{z}/{x}/{y}',

  /** Point objects map features */
  OBJECTS: 'https://tiles.mapillary.com/maps/vtp/mly_map_feature_point/2/{z}/{x}/{y}',
} as const;


// Mapillary Graph API base URLs
export const GRAPH_API = {
  BASE: 'https://graph.mapillary.com',

  /** Single image fields: geometry, sequence, compass angles, etc. */
  image: (id: string) => `https://graph.mapillary.com/${id}`,

  /** All image IDs in a sequence */
  imageIds:     (sequenceId: string) => `https://graph.mapillary.com/image_ids?sequence_id=${sequenceId}`,

  /** Images search within a bounding box */
  imagesInBBox: (bbox: string) => `https://graph.mapillary.com/images?${bbox}`,

  /** Detections for an image */
  detections:   (imageId: string) => `https://graph.mapillary.com/${imageId}/detections`,

  /** Look up a user's numeric creator ID via username */
  creatorLookup:(username: string) => `https://graph.mapillary.com/images?creator_username=${username}&limit=1&fields=creator`,
} as const;


// Sprite sheet URLs (hosted on GitHub with CORS enabled)
export const SPRITE_URLS = {
  TRAFFIC_SIGNS: 'https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs',
  OBJECTS: 'https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects',
} as const;


// ArcGIS geocoding
export const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode';


// Zoom level thresholds
export const ZOOM = {
  /** Minimum zoom to show traffic sign / object VT coverage icons */
  FEATURES_COVERAGE: 13,

  /** Minimum zoom to load and show clickable FeatureLayer popups */
  FEATURES_INTERACTIVE: 16,

  /** Minimum zoom for Turbo Mode coverage points */
  TURBO_MIN: 16,

  /** Tile zoom level used when fetching vector tiles from Mapillary */
  TILE_FETCH: 14,

  /** Default minimap zoom offset from the main map */
  MINIMAP_OFFSET: 3,

  /** Minimum minimap zoom floor (never go below street level) */
  MINIMAP_MIN: 15,
} as const;


// Bounding box search sizes (in decimal degrees)
export const BBOX = {
  /** Half-width used when searching for nearby sequences on click (~11 m) */
  SEQUENCE_SEARCH: 0.0001,

  /** Half-width used for Time Travel candidate search (~22 m) */
  TIME_TRAVEL: 0.0002,
} as const;


// API result limits
export const LIMITS = {
  /** Max images returned from bbox sequence search */
  SEQUENCE_SEARCH_IMAGES: 100,

  /** Max sequences kept after distance sort */
  SEQUENCE_SEARCH_RESULTS: 10,

  /** Max Time Travel candidate images */
  TIME_TRAVEL_CANDIDATES: 50,

  /** Max alternate detection images shown in panel */
  ALTERNATE_IMAGES: 3,
} as const;


// Time Travel validation thresholds
export const TIME_TRAVEL = {
  /** Max metres between two images to qualify as Time Travel */
  MAX_DISTANCE_M: 12,

  /** Max compass angle difference (degrees) */
  MAX_ANGLE_DEG: 22.5,

  /** Minimum time gap between images (one full day in ms) */
  MIN_GAP_MS: 86_400_000,
} as const;


// LocalStorage cache keys
export const CACHE_KEYS = {
  /** Key for the most recently loaded sequence (id + images array) */
  SEQUENCE: 'mapillary_sequence_cache',

  /** Prefix for per-sequence coordinate caches - key = mly_geo_<sequenceId> */
  GEO_PREFIX: 'mly_geo_',
} as const;


// URL query-parameter names used by the Share Link feature
export const SHARE_PARAMS = {
  IMAGE_ID: 'pKey',
  BEARING: 'b',
  PITCH: 'p',
  ZOOM: 'z',
  MAP_TYPE: 'mt',
  LAT: 'lat',
  LON: 'lng'
} as const;


// UI timing (milliseconds)
export const TIMING = {
  /** How long zoom / info warnings stay visible by default */
  WARNING_DEFAULT_MS: 4000,

  /** Debounce delay for turbo filter rebuilds */
  TURBO_DEBOUNCE_MS: 300,

  /** Debounce delay for traffic signs / objects stationary refresh */
  FEATURE_DEBOUNCE_MS: 500,

  /** Delay before setupDirectionHover runs after viewer creation */
  DIRECTION_HOVER_DELAY: 500,

  /** Delay before minimap is created after entering fullscreen */
  MINIMAP_CREATE_DELAY: 300,

  /** tryAddLayer polling interval */
  LAYER_POLL_INTERVAL: 200,

  /** tryAddLayer max attempts */
  LAYER_POLL_ATTEMPTS: 10,

  /** Splash screen fade-out delay after filters loaded */
  SPLASH_FADE_MS: 800,
} as const;


// Default filter option labels (used to detect "no filter selected")
export const DEFAULT_FILTER_LABELS = {
  TRAFFIC_SIGNS: 'All traffic signs',
  OBJECTS: 'All points',
} as const;

export const DETECTION_HIDDEN_RAW: ReadonlyArray<string> = [
  'unlabeled',
];

export const DETECTION_HIDDEN_CATEGORIES: ReadonlyArray<string> = [
  'marking continuous solid',
  'nature',
  'construction',
  'vehicle',
  'human',
  'wire',
  'void',
];