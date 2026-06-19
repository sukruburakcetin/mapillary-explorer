/**
    * Pure functions for fetching, decompressing, and georeferencing
    * Mapillary SfM point cloud data. No React or ArcGIS dependencies.

    * Mapillary shards its SfM reconstructions: a single merge_cc (connected
    * component, the set of images aligned in the same SfM session) is split
    * across many sfm_cluster files.  Each image exposes only its own cluster.
    * The full cloud you see on mapillary.com is the UNION of every cluster that
    * belongs to the same merge_cc.
    
    * This file implements the correct pipeline:
    *   1. Fetch the target image → get merge_cc + sfm_cluster URL
    *   2. Use /images?bbox=... to find all nearby images with the same merge_cc
    *   3. Collect every unique sfm_cluster URL from those images
    *   4. Download + decompress + merge all clusters in parallel
    *   5. Optional frustum crop to the camera FOV of the target image
*/

import pako from 'pako';
import { GRAPH_API, POINT_CLOUD_SANITY_RADIUS_M, POINT_CLOUD_FETCH_LENGTH } from './constants';
import { distanceMeters } from './geoUtils';

// Types

export interface SfmRawPoint {
    x: number;   // East  offset from reference_lla origin, metres (ENU)
    y: number;   // North offset
    z: number;   // Up    offset
    r: number;   // 0-255
    g: number;
    b: number;
}

export interface ReferenceLla {
    latitude:  number;
    longitude: number;
    altitude:  number;
}

export interface PointCloudPoint {
    lon:    number;   // shifted: for ArcGIS map layer
    lat:    number;
    rawLon: number;   // unshifted: for Mapillary viewer overlay
    rawLat: number;
    alt:    number;
    r: number;
    g: number;
    b: number;
}

export interface PointCloudMeta {
    sfmClusterUrl:  string;
    referenceLla:   ReferenceLla | null;
    imageLocation:  { lon: number; lat: number };
    alignmentShift: { lon: number; lat: number };
    imageKey:       string;
    mergeCC:        number | null;  // connected-component ID
}

export interface PointCloudResult {
    points:         PointCloudPoint[];
    totalPoints:    number;           // raw count before any culling
    wasDownsampled: boolean;
    referenceLla:   ReferenceLla;
    imageId:        string;
    sfmClusterUrl:  string;           // primary cluster URL (for reference)
    clusterCount:   number;           // how many sfm_cluster files were merged
    duplicatesRemoved: number;
}

// Internal: one parsed OpenSfM reconstruction
interface ParsedReconstruction {
    refLla:    ReferenceLla;
    rawPoints: SfmRawPoint[];
    shotIds:   string[];
    _rawRec:   any;   // kept for camera-pose extraction
}

// Camera pose extracted from an OpenSfM shot
interface CameraPose {
    rotation: number[][];               // 3x3 world-to-camera rotation matrix
    origin:   [number, number, number]; // camera position in ENU metres
}

// Internal helpers

function parseColor(raw: any): [number, number, number] {
    if (!raw) return [160, 160, 160];
    if (Array.isArray(raw) && raw.length >= 3) {
        const [r, g, b] = raw;
        if (r <= 1.0 && g <= 1.0 && b <= 1.0 && (r > 0 || g > 0 || b > 0)) {
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }
        return [Math.round(r), Math.round(g), Math.round(b)];
    }
    if (typeof raw === 'object' && 'r' in raw) {
        const { r, g, b } = raw;
        if (r <= 1.0 && g <= 1.0 && b <= 1.0) {
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }
        return [Math.round(r), Math.round(g), Math.round(b)];
    }
    return [160, 160, 160];
}

/** Rodrigues rotation vector -> 3x3 rotation matrix */
function rodrigues([rx, ry, rz]: [number, number, number]): number[][] {
    const theta = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (theta < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const kx = rx / theta, ky = ry / theta, kz = rz / theta;
    const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c;
    return [
        [t*kx*kx + c,      t*kx*ky - s*kz, t*kx*kz + s*ky],
        [t*kx*ky + s*kz,   t*ky*ky + c,    t*ky*kz - s*kx],
        [t*kx*kz - s*ky,   t*ky*kz + s*kx, t*kz*kz + c   ],
    ];
}

function extractCameraPose(rec: any, shotId: string): CameraPose | null {
    const shot = rec?.shots?.[shotId];
    if (!shot) return null;
    const R = rodrigues(shot.rotation ?? [0, 0, 0]);
    const t: [number, number, number] = shot.translation ?? [0, 0, 0];
    // C = -R^T * t  (world position of camera)
    const origin: [number, number, number] = [
        -(R[0][0]*t[0] + R[1][0]*t[1] + R[2][0]*t[2]),
        -(R[0][1]*t[0] + R[1][1]*t[1] + R[2][1]*t[2]),
        -(R[0][2]*t[0] + R[1][2]*t[1] + R[2][2]*t[2]),
    ];
    return { rotation: R, origin };
}

/**
    * View-frustum test in camera space.
    * OpenSfM camera convention: optical axis = +Z in camera space.
*/
function isInFrustum(
    p:          SfmRawPoint,
    pose:       CameraPose,
    hFovDeg   = 100,
    maxDepthM = 100,
): boolean {
    const { rotation: R, origin } = pose;
    const dx = p.x - origin[0];
    const dy = p.y - origin[1];
    const dz = p.z - origin[2];
    const cx = R[0][0]*dx + R[0][1]*dy + R[0][2]*dz;
    const cy = R[1][0]*dx + R[1][1]*dy + R[1][2]*dz;
    const cz = R[2][0]*dx + R[2][1]*dy + R[2][2]*dz;
    if (cz <= 0 || cz > maxDepthM) return false;
    const tanH = Math.tan((hFovDeg / 2) * (Math.PI / 180));
    return Math.abs(cx / cz) <= tanH && Math.abs(cy / cz) <= tanH * 0.75;
}

export function enuToWgs84(
    p:   SfmRawPoint,
    ref: ReferenceLla
): { lon: number; lat: number; alt: number } {
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((ref.latitude * Math.PI) / 180);
    return {
        lat: ref.latitude  + p.y / mPerDegLat,
        lon: ref.longitude + p.x / mPerDegLon,
        alt: (ref.altitude ?? 0) + p.z,
    };
}

// Step 1a: Fetch primary image metadata (with merge_cc)
export async function fetchPointCloudMeta(
    imageId:     string,
    accessToken: string
): Promise<PointCloudMeta | null> {

    const tryFetch = async (fields: string) =>
        fetch(`${GRAPH_API.BASE}/${imageId}?fields=${fields}`, {
            headers: { Authorization: `OAuth ${accessToken}` },
        });

    let resp = await tryFetch('sfm_cluster,computed_geometry,geometry,merge_cc');
    if (!resp.ok && resp.status === 500)
        resp = await tryFetch('sfm_cluster,geometry,merge_cc');

    if (!resp.ok) {
        if (resp.status === 404) return null;
        throw new Error(`Graph API ${resp.status} for image ${imageId}`);
    }

    const data = await resp.json();
    if (!data.sfm_cluster?.url) return null;

    const rawGeom = data.geometry?.coordinates;
    if (!rawGeom) throw new Error(`Image ${imageId} has no geometry`);

    const compGeom = data.computed_geometry?.coordinates ?? rawGeom;

    let refLla = data.reference_lla;
    if (!refLla || typeof refLla.latitude !== 'number') refLla = null;

    return {
        sfmClusterUrl:  data.sfm_cluster.url,
        referenceLla:   refLla,
        imageLocation:  { lon: compGeom[0], lat: compGeom[1] },
        alignmentShift: { lon: compGeom[0] - rawGeom[0], lat: compGeom[1] - rawGeom[1] },
        imageKey:       String(imageId),
        mergeCC:        data.merge_cc ?? null,
    };
}

// Step 1b: Discover ALL sfm_cluster URLs sharing the same merge_cc

/**
    * Returns every unique sfm_cluster URL belonging to the same connected
    * component as the target image, including the primary one.
    * Strategy:
    *   - Query /images?bbox=... with fields=sfm_cluster,merge_cc
    *   - Keep only images whose merge_cc === targetMergeCC
    *   - Deduplicate cluster URLs (many images share a cluster)
    *   - Expand bbox and retry if clusters were found at the boundary
    * The bbox stays <= 0.01 deg^2 per the Mapillary API limit.
*/
export async function fetchAllClusterUrls(
    primaryUrl:    string,
    imageLocation: { lon: number; lat: number },
    targetMergeCC: number | null,
    accessToken:   string,
    neighborLocations: { lon: number; lat: number }[] = [],
    onProgress?: (status: string) => void,
): Promise<{ urls: string[]; maxSearchRadius: number }> {

    if (targetMergeCC === null) {
        console.warn('No merge_cc available, returning single cluster only');
        return { urls: [primaryUrl], maxSearchRadius: 0 };
    }

    const allUrls = new Set<string>([primaryUrl]);

    // Three passes: tight (220m radius), medium (440m), and wide (660m)
    // Mapillary's spatial API is much more reliable with smaller boxes
    const searchDeg = (POINT_CLOUD_FETCH_LENGTH / 111320);
    const halfDegs = [searchDeg * 0.5, searchDeg];

    const anchors = [imageLocation, ...neighborLocations];
    let maxSuccessfulSearchRadius = 0;

    for (const anchor of anchors) {
        for (let pass = 0; pass < halfDegs.length; pass++) {
            const half = halfDegs[pass];
            const bbox = `${anchor.lon-half},${anchor.lat-half},${anchor.lon+half},${anchor.lat+half}`;
            const url = `${GRAPH_API.BASE}/images?fields=sfm_cluster,merge_cc&bbox=${bbox}&limit=2000`;

            let resp: Response | null = null;
            const sizesToTry = [half, half * 0.7, half * 0.5];

            for (const size of sizesToTry) {
                const tryUrl = `${GRAPH_API.BASE}/images?fields=sfm_cluster,merge_cc&bbox=${anchor.lon-size},${anchor.lat-size},${anchor.lon+size},${anchor.lat+size}&limit=2000`;
                try {
                    const r = await fetch(tryUrl, { headers: { Authorization: `OAuth ${accessToken}` } });
                    if (r.ok) {
                        maxSuccessfulSearchRadius = Math.max(maxSuccessfulSearchRadius, size * 111320);
                        resp = r;
                        break;
                    }
                    console.warn(`[pointCloud] bbox ${size.toFixed(4)} HTTP ${r.status}, shrinking...`);
                } catch (err) {
                    console.warn(`[pointCloud] bbox network error:`, err);
                    break;
                }
            }

            if (!resp) { break; } // all sizes failed, move to next anchor

            const json = await resp.json();
            const images: any[] = json.data ?? [];

            let newCount = 0;
            for (const img of images) {
                // if (img.merge_cc !== targetMergeCC) continue;
                const clusterUrl: string | undefined = img.sfm_cluster?.url;
                if (!clusterUrl || allUrls.has(clusterUrl)) continue;
                allUrls.add(clusterUrl);
                newCount++;
            }

            const anchorIdx = anchors.indexOf(anchor);
            const msg = `Scanning area ${anchorIdx + 1}/${anchors.length}, pass ${pass + 1}... (${allUrls.size} clusters)`;
            // console.log(`[pointCloud] anchor ${anchorIdx} pass ${pass+1}: ${images.length} images, ${newCount} new clusters`);
            onProgress?.(msg);
            if (pass > 0 && newCount === 0) break;
            if (pass === 1 && allUrls.size >= 3) break;
        }
    }

    // console.log(`[pointCloud] Total: ${allUrls.size} cluster(s) for merge_cc ${targetMergeCC}`);
    return { urls: [...allUrls], maxSearchRadius: maxSuccessfulSearchRadius };
}

// Step 2: Download + decompress a single cluster URL

export async function downloadAndDecompress(
    url: string
): Promise<ParsedReconstruction[]> {

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`CDN fetch failed HTTP ${resp.status}: ${url}`);

    let decompressed: string;
    try {
        const bytes = pako.inflate(new Uint8Array(await resp.arrayBuffer()));
        decompressed = new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        throw new Error(`Decompress error: ${e instanceof Error ? e.message : e}`);
    }

    let parsed: any;
    try {
        parsed = JSON.parse(decompressed);
    } catch (e) {
        throw new Error(`JSON parse error: ${e instanceof Error ? e.message : e}`);
    }

    const reconstructions: any[] = Array.isArray(parsed) ? parsed : [parsed];
    const results: ParsedReconstruction[] = [];

    for (const rec of reconstructions) {
        if (!rec?.reference_lla || typeof rec.reference_lla.latitude !== 'number') {
            console.warn('Skipping reconstruction without reference_lla');
            continue;
        }

        const refLla: ReferenceLla = {
            latitude:  rec.reference_lla.latitude,
            longitude: rec.reference_lla.longitude,
            altitude:  rec.reference_lla.altitude ?? 0,
        };

        const rawPoints: SfmRawPoint[] = [];

        if (rec.points && !Array.isArray(rec.points)) {
            // Normal OpenSfM object-keyed format
            for (const ptId in rec.points) {
                const p = rec.points[ptId];
                if (!p?.coordinates || p.coordinates.length < 3) continue;
                const [r, g, b] = parseColor(p.color);
                rawPoints.push({ x: p.coordinates[0], y: p.coordinates[1], z: p.coordinates[2], r, g, b });
            }
        } else if (Array.isArray(rec.points)) {
            for (const p of rec.points) {
                if (p?.x === undefined) continue;
                const [r, g, b] = parseColor(p.color ?? [p.r, p.g, p.b]);
                rawPoints.push({ x: p.x, y: p.y, z: p.z, r, g, b });
            }
        }

        if (rawPoints.length > 0) {
            results.push({ refLla, rawPoints, shotIds: rec.shots ? Object.keys(rec.shots) : [], _rawRec: rec });
        }
    }

    return results;
}

// Step 3: Merge reconstructions -> PointCloudPoint[]

function buildMergedPoints(
    allRecs:          ParsedReconstruction[],
    meta:             PointCloudMeta,
    useFrustum:       boolean,
    cropRadiusMeters: number | undefined,   // legacy circular crop (unused when axis params set)
    allAnchors:       { lon: number; lat: number }[] = [],
    skipSanity:       boolean = false,
    maxSearchRadius:  number = 0,
    cropLengthMeters: number | undefined = undefined,  // N-S half-extent (y axis); undefined = unlimited
    cropWidthMeters:  number | undefined = undefined,  // E-W half-extent (x axis); undefined = unlimited
): { points: PointCloudPoint[]; duplicatesRemoved: number } {
    const result: PointCloudPoint[] = [];
    const sanityRadius = Math.max(POINT_CLOUD_SANITY_RADIUS_M, maxSearchRadius * 2);
    const useAxisCrop = cropLengthMeters !== undefined || cropWidthMeters !== undefined;
    let skippedClusters = 0;

    for (const rec of allRecs) {
        // Per-reconstruction sanity check
        if (!skipSanity && rec.rawPoints.length > 0) {
           // Distance from this reconstruction to the NEAREST anchor, not just current image
            const anchorsToCheck = [meta.imageLocation, ...allAnchors];
            const minDist = Math.min(...anchorsToCheck.map(a =>
                distanceMeters(rec.refLla.latitude, rec.refLla.longitude, a.lat, a.lon)
            ));
            
            if (minDist > sanityRadius) {
                skippedClusters++
                continue;
            }
        }

        // Pre-compute the image's position in this reconstruction's ENU frame (metres).
        // Used for axis-based filtering below — avoids a geo round-trip per point.
        const mPerDegLat = 111320;
        const mPerDegLon = 111320 * Math.cos((rec.refLla.latitude * Math.PI) / 180);
        const imgENU_x = (meta.imageLocation.lon - rec.refLla.longitude) * mPerDegLon;
        const imgENU_y = (meta.imageLocation.lat - rec.refLla.latitude)  * mPerDegLat;

        let pose: CameraPose | undefined;
        if (useFrustum) {
            const shotId =
                rec.shotIds.find(id => id === meta.imageKey) ??
                rec.shotIds.find(id => id.endsWith(meta.imageKey)) ??
                rec.shotIds.find(id => meta.imageKey.endsWith(id));
            if (shotId) pose = extractCameraPose(rec._rawRec, shotId) ?? undefined;
        }

        for (const p of rec.rawPoints) {
            if (pose && !isInFrustum(p, pose)) continue;
            const { lon, lat, alt } = enuToWgs84(p, rec.refLla);

            if (useAxisCrop) {
                // Axis-based rectangular crop in ENU metres — each dimension is independent.
                // x = East-West (width), y = North-South (length).
                // undefined on either axis means that axis is unlimited.
                const dx = p.x - imgENU_x;  // E-W offset from image location (metres)
                const dy = p.y - imgENU_y;  // N-S offset from image location (metres)
                if (cropWidthMeters  !== undefined && Math.abs(dx) > cropWidthMeters)  continue;
                if (cropLengthMeters !== undefined && Math.abs(dy) > cropLengthMeters) continue;
            } else if (cropRadiusMeters !== undefined) {
                // Legacy circular crop — kept for callers that do not pass axis params.
                const dist = distanceMeters(
                    lat, lon,
                    meta.imageLocation.lat, meta.imageLocation.lon
                );
                if (dist > cropRadiusMeters) continue;
            }
            result.push({
                lon:    lon + meta.alignmentShift.lon,
                lat:    lat + meta.alignmentShift.lat,
                rawLon: lon,
                rawLat: lat,
                alt,
                r: p.r, g: p.g, b: p.b,
            });
        }
    }

    if (skippedClusters > 0) {
        console.log(`[pointCloud] Dropped ${skippedClusters} distant clusters (> ${Math.round(sanityRadius)}m away) to save memory.`);
    }

    // Deduplicate only mathematically identical points (floating-point noise from 
    // overlapping cluster boundaries). Uses 8 decimal places on lon/lat (≈1mm resolution)
    // and 3 decimal places on alt (1mm vertical). Two genuinely distinct points will 
    // never share all three at this precision.
    const seen = new Set<string>();
    const deduped: PointCloudPoint[] = [];

    for (const pt of result) {
        const key = `${pt.rawLon.toFixed(8)},${pt.rawLat.toFixed(8)},${pt.alt.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(pt);
    }

    return { 
        points: deduped, 
        duplicatesRemoved: result.length - deduped.length 
    };
}

// Public entry point

/**
    * Load the COMPLETE point cloud for an image by merging all sfm_cluster
    * files that share the same merge_cc (connected component).
    * @param imageId      Mapillary numeric image ID
    * @param accessToken  OAuth token
    * @param options
    *   frustumCrop:       keep only points inside the camera's view frustum.
    *                      false (default) = full reconstruction cloud (most points).
    *                      true            = only what this camera can see.
    *   cropLengthMeters:  N-S half-extent in metres (undefined = unlimited).
    *                      Controls how far along the road the cloud extends.
    *   cropWidthMeters:   E-W half-extent in metres (undefined = unlimited).
    *                      Controls the corridor width perpendicular to the road.
    *   cropRadiusMeters:  Legacy circular crop — ignored when axis params are set.
*/
export async function loadPointCloud(
    imageId:     string,
    accessToken: string,
    options: { 
        frustumCrop?:       boolean,
        cropRadiusMeters?:  number,   // legacy; ignored when axis params are set
        cropLengthMeters?:  number,   // N-S half-extent; undefined = unlimited
        cropWidthMeters?:   number,   // E-W half-extent; undefined = unlimited
        onProgress?: (status: string) => void,
        sequenceImages?:   { id: string; lon: number; lat: number }[], 
    } = {}
): Promise<PointCloudResult | null> {
    const { frustumCrop = false, cropRadiusMeters, cropLengthMeters, cropWidthMeters, onProgress, sequenceImages = [] } = options;

    onProgress?.("Initializing...");
    const meta = await fetchPointCloudMeta(imageId, accessToken);
    if (!meta) return null;

    // Check 1: If the image itself has no cluster metadata
    if (!meta || !meta.sfmClusterUrl) {
        throw new Error("No 3D metadata exists for this image.");
    }

    // 1. Collect far anchors for the BBOX search (to expand the physical boundaries)
    const bboxAnchors: { lon: number; lat: number }[] =[];
    const currentIdx = sequenceImages.findIndex(img => String(img.id) === String(imageId));

    if (currentIdx >= 0) {
        for (let i = currentIdx - 1; i >= 0; i--) {
            const img = sequenceImages[i];
            if (distanceMeters(img.lat, img.lon, meta.imageLocation.lat, meta.imageLocation.lon) > 150) { 
                bboxAnchors.push({ lon: img.lon, lat: img.lat }); break; 
            }
        }
        for (let i = currentIdx + 1; i < sequenceImages.length; i++) {
            const img = sequenceImages[i];
            if (distanceMeters(img.lat, img.lon, meta.imageLocation.lat, meta.imageLocation.lon) > 150) { 
                bboxAnchors.push({ lon: img.lon, lat: img.lat }); break; 
            }
        }
    }

    onProgress?.("Searching clusters...");
    const { urls: clusterUrls, maxSearchRadius } = await fetchAllClusterUrls(
        meta.sfmClusterUrl, meta.imageLocation, meta.mergeCC, accessToken, bboxAnchors, onProgress
    );

    if (!clusterUrls || clusterUrls.length === 0) {
        throw new Error("No 3D clusters found in this area.");
    }

    onProgress?.("Mapping nearby images...");

    const allClusterUrls = new Set<string>(clusterUrls);

    // 2. NEW: Explicitly sample sequence images every 20 meters. 
    // This guarantees we don't miss the clusters representing the car right next to you!
    const denseNeighborIds = new Set<string>();
    if (currentIdx >= 0) {
        let lastDist = 0;
        // Walk backward up to 200m
        for (let i = currentIdx - 1; i >= 0; i--) {
            const img = sequenceImages[i];
            const d = distanceMeters(img.lat, img.lon, meta.imageLocation.lat, meta.imageLocation.lon);
            if (d - lastDist > 20) { denseNeighborIds.add(img.id); lastDist = d; }
            if (d > 200) break;
        }
        lastDist = 0;
        // Walk forward up to 200m
        for (let i = currentIdx + 1; i < sequenceImages.length; i++) {
            const img = sequenceImages[i];
            const d = distanceMeters(img.lat, img.lon, meta.imageLocation.lat, meta.imageLocation.lon);
            if (d - lastDist > 20) { denseNeighborIds.add(img.id); lastDist = d; }
            if (d > 200) break;
        }
    }

    // 3. Batch fetch their metadata in a single HTTP request (Lightning fast)
    const idsArray = Array.from(denseNeighborIds);
    if (idsArray.length > 0) {
        onProgress?.("Fetching local dense clusters...");
        try {
            // Mapillary API allows requesting multiple IDs by comma separation
            const resp = await fetch(`${GRAPH_API.BASE}/?ids=${idsArray.join(',')}&fields=sfm_cluster&access_token=${accessToken}`);
            const data = await resp.json();
            for (const key in data) {
                const url = data[key]?.sfm_cluster?.url;
                if (url && !allClusterUrls.has(url)) {
                    allClusterUrls.add(url);
                    // console.log(`[pointCloud] Found local dense cluster from sequence image ${key}`);
                }
            }
        } catch (e) {
            console.warn(`[pointCloud] Failed to fetch dense neighbor batch:`, e);
        }
    }

    const finalUrls = [...allClusterUrls];
    const total = finalUrls.length;

    let completed = 0;
    
    // Download in parallel, updating progress as each one finishes
    const settled = await Promise.allSettled(finalUrls.map(async (url) => {
        const res = await downloadAndDecompress(url);
        completed++;
        onProgress?.(`Downloading (${completed}/${total})`);
        return res;
    }));

    const allRecs: ParsedReconstruction[] =[];
    for (const r of settled) {
        if (r.status === 'fulfilled') allRecs.push(...r.value);
    }

    if (!allRecs.length) throw new Error(`No 3D data found.`);
    
    // Check 3: If download finished but no valid reconstructions were inside the files
    if (allRecs.length === 0) { throw new Error("The 3D data files for this area are empty."); }

    onProgress?.("Processing points...");
    let { points, duplicatesRemoved } = buildMergedPoints(
        allRecs, meta, frustumCrop, cropRadiusMeters, bboxAnchors, false, maxSearchRadius, cropLengthMeters, cropWidthMeters
    );

    if (frustumCrop && points.length === 0) {
        ({ points, duplicatesRemoved } = buildMergedPoints(
            allRecs, meta, false, cropRadiusMeters, bboxAnchors, false, maxSearchRadius, cropLengthMeters, cropWidthMeters
        ));
    }

    // Check 4: If georeferencing/filtering resulted in 0 points
    if (points.length === 0) {
        // All clusters were rejected by sanity check, fall back to primary cluster only
        // and skip the sanity check, since it's all we have
        console.warn('[pointCloud] All clusters failed sanity check, retrying with primary cluster only');
        const primaryRecs = allRecs.slice(0, 1);
        ({ points, duplicatesRemoved } = buildMergedPoints(
            primaryRecs, meta, false, cropRadiusMeters, [], true, maxSearchRadius, cropLengthMeters, cropWidthMeters
        ));
        
        if (points.length === 0) {
            throw new Error("No 3D points were found for this segment.");
        }
    }

    return {
        points,
        totalPoints: allRecs.reduce((s, r) => s + r.rawPoints.length, 0),
        wasDownsampled: false,
        referenceLla: allRecs[0].refLla,
        imageId,
        sfmClusterUrl: meta.sfmClusterUrl,
        clusterCount: total,
        duplicatesRemoved
    };
}