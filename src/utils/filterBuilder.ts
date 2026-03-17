/**
  * filterBuilder.ts
  * Pure functions that build Mapbox GL filter expressions for Mapillary
  * vector tile layers. No React, no ArcGIS, no side effects - input in,
  * filter array out.
  * BACKGROUND
  *   Mapillary's public vector tile endpoint (mly1_public) exposes three
  *   source-layers with these filterable properties:
  *   overview, sequence, and image.
  *   The `sequence` source-layer does NOT carry `captured_at` or `is_pano`,
  *   so date / panorama filters must be omitted for it.
*/

// Types

/** All optional inputs that can be used to filter Mapillary coverage */
export interface CoverageFilterParams {
  /** Numeric Mapillary creator ID (not the username string) */
  creatorId?:  number;
  /** ISO date string "yyyy-mm-dd" - inclusive start */
  startDate?:  string;
  /** ISO date string "yyyy-mm-dd" - inclusive end (set to 23:59:59.999) */
  endDate?:    string;
  /**
    * true  = panoramas only
    * false = non-panoramas only
    * undefined / null = no panorama filter
  */
  isPano?:     boolean | null;
}

// Internal helpers

/**
  * Builds the shared "base conditions" from creator + date filters.
  * These are safe to apply to ALL source-layers that carry the properties.
*/
function buildBaseConditions(params: CoverageFilterParams): any[] {
  const conditions: any[] = [];

  if (params.creatorId) {
    conditions.push(['==', 'creator_id', params.creatorId]);
  }

  if (params.startDate) {
    conditions.push(['>=', 'captured_at', new Date(params.startDate).getTime()]);
  }

  if (params.endDate) {
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(['<=', 'captured_at', end.getTime()]);
  }

  return conditions;
}

/**
  * Collapses an array of GL filter expressions into a single expression.
  *  - 0 conditions → null  (no filter needed)
  *  - 1 condition  → the condition itself  (no redundant ["all", ...] wrapper)
  *  - 2+ conditions → ["all", cond1, cond2, ...]
*/
function collapseConditions(conditions: any[]): any | null {
  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0];
  return ['all', ...conditions];
}

// Public API

/**
  * Builds a GL filter for the `overview` source-layer.
  * The overview layer carries `creator_id` and `captured_at` but NOT `is_pano`.
  * When a pano filter is active we suppress the overview layer entirely by
  * returning the string `'hide'` - the caller should omit that layer from the
  * style definition when this value is returned.
  * @returns  A GL filter expression, null (no filter), or 'hide' (omit layer).
*/
export function buildOverviewFilter(
  params: CoverageFilterParams
): any | null | 'hide' {
  const hasPanoFilter = params.isPano !== undefined && params.isPano !== null;

  // overview has no is_pano - hide it when a pano filter is active so the
  // user only sees correctly-filtered image-layer dots.
  if (hasPanoFilter) return 'hide';

  // Only creator + date filters are safe here (no captured_at on overview
  // but creator_id IS available).
  const conditions = buildBaseConditions({ creatorId: params.creatorId });
  return collapseConditions(conditions);
}

/**
  * Builds a GL filter for the `sequence` source-layer.
  * The sequence layer only carries `creator_id` - no dates, no is_pano.
  * When a pano filter is active we hide this layer for the same reason
  * as the overview layer.
  * @returns  A GL filter expression, null (no filter), or 'hide' (omit layer).
*/
export function buildSequenceFilter(
  params: CoverageFilterParams
): any | null | 'hide' {
  const hasPanoFilter = params.isPano !== undefined && params.isPano !== null;
  if (hasPanoFilter) return 'hide';

  const conditions = buildBaseConditions({ creatorId: params.creatorId });
  return collapseConditions(conditions);
}

/**
  * Builds a GL filter for the `image` source-layer.
  * The image layer carries `creator_id`, `captured_at`, AND `is_pano`,
  * so all filter types are supported.
  * @returns  A GL filter expression or null (no filter needed).
*/
export function buildImageFilter(params: CoverageFilterParams): any | null {
  const conditions = buildBaseConditions(params);

  if (params.isPano === true) {
    // Both boolean and integer representations exist across different tile versions
    conditions.push(['any', ['==', 'is_pano', true], ['==', 'is_pano', 1]]);
  } else if (params.isPano === false) {
    conditions.push(['any', ['==', 'is_pano', false], ['==', 'is_pano', 0]]);
  }

  return collapseConditions(conditions);
}

/**
  * Convenience: returns all three filters in one call.
  * Usage:
  *   const { overviewFilter, sequenceFilter, imageFilter } = buildAllFilters(params);
  * Each value is either:
  *   - null    → no GL filter attribute needed on that layer
  *   - 'hide'  → omit the layer from the style definition entirely
  *   - any[]   → a valid GL filter expression
*/
export function buildAllFilters(params: CoverageFilterParams): {
  overviewFilter:  any | null | 'hide';
  sequenceFilter:  any | null | 'hide';
  imageFilter:     any | null;
  hasPanoFilter:   boolean;
} {
  return {
    overviewFilter: buildOverviewFilter(params),
    sequenceFilter: buildSequenceFilter(params),
    imageFilter:    buildImageFilter(params),
    hasPanoFilter:  params.isPano !== undefined && params.isPano !== null,
  };
}
