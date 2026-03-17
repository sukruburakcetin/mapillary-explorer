/**
    * @file mapillaryDetections.ts
    * Pure utility functions for Mapillary AI detection processing.
    * No widget state, no ArcGIS dependencies; fully unit-testable.
*/

import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

// Geometry

/**
    * Decodes and normalizes Mapillary detection geometry.
    * Mapillary API returns geometries as Base64-encoded Vector Tiles (MVT/PBF).
    * Normalizes tile coordinates from the internal extent (e.g. 4096)
    * to the 0.0–1.0 range required by Mapillary-JS OutlineTag.
    * @param base64Str - Raw geometry string from the Mapillary API.
    * @returns Array of [x, y] coordinate pairs in 0–1 space, or [] on failure.
*/
export function decodeAndNormalizeGeometry(base64Str: string): number[][] {
    try {
        const buffer = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
        const tile = new VectorTile(new Pbf(buffer));
        const layer = tile.layers['mpy-or'];
        if (!layer) return [];

        const feature = layer.feature(0);
        const rawGeometry = feature.loadGeometry();
        const extent = layer.extent;

        // Mapillary-JS uses [x, y] where x is 0–1 (left→right) and y is 0–1 (top→bottom)
        return rawGeometry[0].map(p => [p.x / extent, p.y / extent]);
    } catch (e) {
        console.error('MVT Decoding failed:', e);
        return [];
    }
}

// Colors

/**
    * Returns a hex color for a Mapillary detection label.
    * Matches against known categories (traffic lights, signs, road markings, etc.).
    * Background/ignored classes return black (0x000000).
    * @param value - Detection label string from the Mapillary API (e.g. "object--traffic-light").
    * @returns Hex color number suitable for Mapillary-JS OutlineTag styling.
*/
export function getDetectionColor(value: string): number {
    const label = value.toLowerCase();

    if (
        [
            'unlabeled', 'sky', 'nature vegetation', 'marking continuous solid',
            'object vehicle car', 'nature terrain',
        ].includes(label)
        || ['void', 'construction', 'vehicle', 'vegetation', 'continuous--solid', 'human', 'wire']
            .some(k => label.includes(k))
    ) return 0x000000;

    if (label.includes('traffic-light'))                                    return 0xe74c3c;
    if (['traffic-sign', 'sign--store', 'sign--advertisement', 'banner']
        .some(k => label.includes(k)))                                      return 0xe67e22;
    if (['marking', 'crosswalk', 'stop-line', 'continuous--dashed']
        .some(k => label.includes(k)))                                      return 0x1abc9c;
    if (['support--pole', 'wire-group']
        .some(k => label.includes(k)))                                      return 0x674ea7;
    if (['manhole', 'trash-can']
        .some(k => label.includes(k)))                                      return 0x8e6e53;

    return 0x37d582; // default Mapillary green
}
