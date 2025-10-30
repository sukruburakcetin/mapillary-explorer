/** @jsx jsx */
import {React, AllWidgetProps, jsx} from "jimu-core";
import {JimuMapViewComponent, JimuMapView} from "jimu-arcgis";
import ReactDOM from "react-dom";
import * as webMercatorUtils from "esri/geometry/support/webMercatorUtils";
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
const {loadArcGISJSAPIModules} = require("jimu-arcgis");

interface WindowWithMapillary extends Window {
    mapillary: any;
    define?: any;
}

declare const window: WindowWithMapillary;

// --- React component state ---
// Holds current map view, image/sequence data, viewer state,
// and temporary interaction information like clicks or loading flags.
interface State {
    jimuMapView: JimuMapView | null;
    imageId: string | null;
    sequenceId: string | null;
    sequenceImages: { id: string; lat: number; lon: number }[];
    lon: number | null;
    lat: number | null;
    isFullscreen: boolean;
	address: string | null;
	state?: string; // e.g. 'OPENED' | 'CLOSED'
    visible?: boolean; // directly indicates visibility
    isLoading: boolean;
    availableSequences?: { sequenceId: string; images: { id: string; lon: number; lat: number }[] }[];
    selectedSequenceId?: string;
    clickLon?: number;
    clickLat?: number;
    tilesActive?: boolean;
    trafficSignsActive?: boolean;
    objectsActive?: boolean;
}

export default class Widget extends React.PureComponent<
    AllWidgetProps<any>,
    State
> {
    viewerContainer = React.createRef<HTMLDivElement>();
    mapillaryViewer: any = null;
    ArcGISModules: any = null;
    private currentGreenGraphic: __esri.Graphic | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private currentConeGraphic: __esri.Graphic | null = null;
	private accessToken: string = "";
    private coneSpreads = [60, 40, 30, 20];   // width in degrees
    private coneLengths = [10, 15, 20, 30];  // length in meters, tuned to 5m spacing
    private zoomStepIndex = 0;              // start zoomed out
    private mapillaryVTLayer: __esri.VectorTileLayer | null = null;
    private mapillaryTrafficSignsLayer: __esri.VectorTileLayer | null = null;
    private mapillaryObjectsLayer: __esri.VectorTileLayer | null = null;
    private objectsStationaryHandle: IHandle | null = null;

    /**
        * Human‑readable names for Mapillary object classification codes.
        *
        * Mapillary returns raw object `value` codes such as `"object--bench"` or `"marking--discrete--stop-line"`.
        * These codes are hierarchical (double‑dash separated) and not user‑friendly for display.
        *
        * This lookup table maps each known Mapillary object classification code to a
        * descriptive, human‑readable label for use in the UI, popups, and legends.
        *
        * Notes:
        * - Keys match `value` properties returned by Mapillary's vector tile/object API.
        * - Values are short descriptive labels optimized for end‑users.
        * - Any `value` not found here will fall back to displaying the raw code, unless further formatting is applied.
        *
        * This is used in {@link loadMapillaryObjectsFromTilesBBox} to set the `name` attribute
        * for each object feature before creating the ArcGIS FeatureLayer.
    */
    private objectNameMap: Record<string, string> = {
        "construction--barrier--temporary": "Temporary Barrier",
        "construction--flat--crosswalk-plain": "Crosswalk - Plain",
        "construction--flat--driveway": "Driveway",
        "marking--discrete--arrow--left": "Lane Marking - Arrow (Left)",
        "marking--discrete--arrow--right": "Lane Marking - Arrow (Right)",
        "marking--discrete--arrow--split-left-or-straight": "Lane Marking - Arrow (Split Left or Straight)",
        "marking--discrete--arrow--split-right-or-straight": "Lane Marking - Arrow (Split Right or Straight)",
        "marking--discrete--arrow--straight": "Lane Marking - Arrow (Straight)",
        "marking--discrete--crosswalk-zebra": "Lane Marking - Crosswalk",
        "marking--discrete--give-way-row": "Lane Marking - Give Way (Row)",
        "marking--discrete--give-way-single": "Lane Marking - Give Way (Single)",
        "marking--discrete--other-marking": "Lane Marking - Other",
        "marking--discrete--stop-line": "Lane Marking - Stop Line",
        "marking--discrete--symbol--bicycle": "Lane Marking - Symbol (Bicycle)",
        "marking--discrete--text": "Lane Marking - Text",
        "object--banner": "Banner",
        "object--bench": "Bench",
        "object--bike-rack": "Bike Rack",
        "object--catch-basin": "Catch Basin",
        "object--cctv-camera": "CCTV Camera",
        "object--fire-hydrant": "Fire Hydrant",
        "object--junction-box": "Junction Box",
        "object--mailbox": "Mailbox",
        "object--manhole": "Manhole",
        "object--parking-meter": "Parking Meter",
        "object--phone-booth": "Phone Booth",
        "object--sign--advertisement": "Signage - Advertisement",
        "object--sign--information": "Signage - Information",
        "object--sign--store": "Signage - Store",
        "object--street-light": "Street Light",
        "object--support--pole": "Pole",
        "object--support--traffic-sign-frame": "Traffic Sign Frame",
        "object--support--utility-pole": "Utility Pole",
        "object--traffic-cone": "Traffic Cone",
        "object--traffic-light--cyclists": "Traffic Light - Cyclists",
        "object--traffic-light--general-horizontal": "Traffic Light - General (Horizontal)",
        "object--traffic-light--general-single": "Traffic Light - General (Single)",
        "object--traffic-light--general-upright": "Traffic Light - General (Upright)",
        "object--traffic-light--other": "Traffic Light - Other",
        "object--traffic-light--pedestrians": "Traffic Light - Pedestrians",
        "object--trash-can": "Trash Can",
        "object--water-valve": "Water Valve"
    };

    /*
        * Default color palette for sequence overlays.
        * Each item is [R, G, B, A] with RGB 0–255 and Alpha 0–1.
        * This palette intentionally avoids pure blue for polylines so that blue markers 
        * (sequence images) remain visually distinct from sequence lines.
        * Order is chosen to maximize contrast between neighboring sequences 
        * and to match common cartographic color practices.
    */
    private sequenceColors = [
        [255, 0, 0, 1],   // red
        [0, 200, 0, 1],   // green
        [255, 165, 0, 1], // orange
        [160, 32, 240, 1], // purple
        [255, 192, 203, 1], // pink
        [128, 0, 128, 1], // dark purple
        [255, 255, 0, 1], // yellow
        [128, 128, 128, 1], // grey
        [0, 255, 255, 1], // cyan
    ];

    state: State = {
        jimuMapView: null,
        imageId: null,
        sequenceId: null,
        sequenceImages: [],
        lon: null,
        lat: null,
        isFullscreen: false,
		address: null,
        isLoading: false,
        availableSequences: [],
        selectedSequenceId: null,
        noImageMessageVisible: false,
        tilesActive: false,
        trafficSignsActive: false,
        objectsActive: false
    };

    constructor(props: AllWidgetProps<any>) {
        super(props);
		
		// Read accessToken from manifest.json properties - you should use your own token start with MLY
		this.accessToken = props.manifest?.properties?.mapillaryAccessToken || "";
		// console.log("Loaded Access Token:", this.accessToken);

        this.onActiveViewChange = this.onActiveViewChange.bind(this);
        this.handleMapClick = this.handleMapClick.bind(this);
    }

    /*
        * Returns a consistent but visually distinct color for a sequence index.
        * Repeats the base palette cyclically, darkening subsequent cycles by 10% 
        * to hint repeated usage without losing sequence distinction.
        * 
        * @param index Sequence order index from availableSequences array 
        *              (used for both polyline and dropdown background).
        * @returns Array [R, G, B, A] suitable for ArcGIS API symbol color.
    */
    private pickSequenceColor(index: number) {
        const baseColors = this.sequenceColors;
        // Pick color from palette in cyclic order
        const color = baseColors[index % baseColors.length];

        // If we've cycled through the palette more than once...
        const cycle = Math.floor(index / baseColors.length);
        if (cycle > 0 && Array.isArray(color)) {
            // Reduce RGB brightness progressively for each cycle
            const factor = 1 - (cycle * 0.1); // darken 10% each cycle
            return [
                Math.max(0, color[0] * factor),
                Math.max(0, color[1] * factor),
                Math.max(0, color[2] * factor),
                color[3] // keep alpha channel unchanged
            ];
        }
        return color;
    }
    /*
        * Draws full sequence overlays (Polyline or Dot Marker + Sequence Number Text)
        * for all items in this.state.availableSequences.
        * 
        * This method is called after state.availableSequences is updated,
        * ensuring users always see the entire route for selected/available sequences.
        * 
        * Design notes:
        * - Polyline drawn when ≥ 2 coords are available; fallback to point marker for single-image sequences.
        * - Graphic attributes.sequenceId are set so hitTest clicks can identify the sequence.
        * - Each sequence gets: 
        *     1) main polyline/dot in assigned color
        *     2) text label (sequence order number) at first image position for visual correlation with dropdown
    */
    private drawSequencesOverlay() {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const { Graphic } = this.ArcGISModules;

        // Clean up any existing sequence overlay graphics before redrawing
        const toRemove: __esri.Graphic[] = [];
        jimuMapView.view.graphics.forEach(g => {
            if ((g as any).__isSequenceOverlay) {
                toRemove.push(g);
            }
        });
        toRemove.forEach(g => jimuMapView.view.graphics.remove(g));

        // Iterate through all sequences in state (full routes already loaded)
        this.state.availableSequences?.forEach((seq, idx) => {
            const color = seq._color || this.pickSequenceColor(idx);
            const paths = seq.images.map(img => [img.lon, img.lat]);

            if (paths.length > 1) {
                // Draw multi-vertex route as polyline
                const polylineGraphic = new Graphic({
                    geometry: { type: "polyline", paths, spatialReference: { wkid: 4326 } },
                    symbol: { type: "simple-line", color, width: 2 },
                    attributes: { sequenceId: seq.sequenceId }
                });
                (polylineGraphic as any).__isSequenceOverlay = true;
                jimuMapView.view.graphics.add(polylineGraphic);
            } else {
                // Single-image sequence → draw a colored dot
                const pointGraphic = new Graphic({
                    geometry: { type: "point", longitude: paths[0][0], latitude: paths[0][1], spatialReference: { wkid: 4326 } },
                    symbol: { type: "simple-marker", color, size: "6px", outline: { color: "white", width: 3 } },
                    attributes: { sequenceId: seq.sequenceId }
                });
                (pointGraphic as any).__isSequenceOverlay = true;
                jimuMapView.view.graphics.add(pointGraphic);
            }

            // Draw sequence number label at first image location
            // This links visually to dropdown item number
            const firstImg = seq.images[0];
            const markerGraphic = new Graphic({
            geometry: {
                type: "point",
                longitude: firstImg.lon,
                latitude: firstImg.lat
            },
            symbol: {
                    type: "text",
                    text: String(idx + 1), // number matches dropdown order
                    color: color,
                    haloColor: "white",
                    haloSize: 2, // bigger halo for visibility
                    font: {
                        size: 20, // bigger number size
                        weight: "bold"
                    }
            },
            attributes: { sequenceId: seq.sequenceId }
            });
            (markerGraphic as any).__isSequenceOverlay = true;
            jimuMapView.view.graphics.add(markerGraphic);
        });
    }

    // --- Clean up everything when widget closes or reloads ---
    // Stops animation intervals, removes all map graphics,
    // destroys Mapillary viewer instance, clears DOM container,
    // and resets internal state if requested.
	private cleanupWidgetEnvironment(resetState: boolean = false, fullRemove: boolean = true) {
		// Stop pulsing point
		if (this.currentGreenGraphic && (this.currentGreenGraphic as any)._pulseInterval) {
			clearInterval((this.currentGreenGraphic as any)._pulseInterval);
			this.currentGreenGraphic = null;
		}

		// Remove all graphics from map
		if (this.state.jimuMapView) {
            const view = this.state.jimuMapView.view; // ✅ define view here
            // Remove any sequence overlay graphics
            const toRemove: __esri.Graphic[] = [];
            view.graphics.forEach(g => {
            if ((g as any).__isSequenceOverlay) {
                toRemove.push(g);
            }
            });
            toRemove.forEach(g => view.graphics.remove(g));

            try {
                view.graphics.removeAll();
            } catch (err) {
                console.warn("Error clearing graphics:", err);
            }
            // Only do hard layer removals if fullRemove = true
            if (fullRemove) {
                const layersToRemove: __esri.Layer[] = [];
                view.map.layers.forEach((layer) => {
                    if (
                        layer === this.mapillaryObjectsLayer ||
                        layer === this.mapillaryObjectsFeatureLayer ||
                        (
                            layer.type === "feature" &&
                            (layer as any).fields?.some((f: any) => f.name === "value") &&
                            (layer as any).fields?.some((f: any) => f.name === "name")
                        ) ||
                        (layer as any).title?.includes("Mapillary Objects") // ✅ Not generic
                    ) {
                        layersToRemove.push(layer);
                    }
                });
                layersToRemove.forEach(l => view.map.remove(l));
            }
		}

         // Null references so they can’t be re-added later
        this.mapillaryObjectsLayer = null;
        this.mapillaryObjectsFeatureLayer = null;
        this.mapillaryVTLayer = null;
        this.mapillaryTrafficSignsLayer = null;

        // Cancel any pending object feature fetch
        this._cancelObjectsFetch = true;

        // Remove stationary watch on object layer
        if (this.objectsStationaryHandle) {
            this.objectsStationaryHandle.remove();
            this.objectsStationaryHandle = null;
        }
        if (this.objectsZoomHandle) {
            this.objectsZoomHandle.remove();
            this.objectsZoomHandle = null;
        }

        //  Force remove Mapillary Vector Tile Layer when widget closes
        if (this.mapillaryVTLayer && this.state.jimuMapView.view.map.layers.includes(this.mapillaryVTLayer)) {
            try {
                this.state.jimuMapView.view.map.remove(this.mapillaryVTLayer);
                console.log("Mapillary layer removed on widget close");
            } catch (err) {
                console.warn("Error removing Mapillary layer:", err);
            }
        }

        // Force remove Traffic Signs layer too
        if (this.mapillaryTrafficSignsLayer && this.state.jimuMapView?.view.map.layers.includes(this.mapillaryTrafficSignsLayer)) {
            try {
                this.state.jimuMapView.view.map.remove(this.mapillaryTrafficSignsLayer);
                console.log("Mapillary traffic signs layer removed on widget close");
            } catch (err) {
                console.warn("Error removing Mapillary traffic signs layer:", err);
            }
        }
        

		// Destroy Mapillary viewer
		if (this.mapillaryViewer) {
			try {
				this.mapillaryViewer.remove();
			} catch (err) {
				console.warn("Error removing Mapillary viewer:", err);
			}
			this.mapillaryViewer = null;
		}

		// Clear container
		if (this.viewerContainer.current) {
			this.viewerContainer.current.innerHTML = '';
		}

		// Reset state to fresh opened widget if flagged
		if (resetState) {
			this.setState({
				imageId: null,
				sequenceId: null,
				sequenceImages: [],
				lon: null,
				lat: null,
				isFullscreen: false,
				address: null,
                tilesActive: false,
                trafficSignsActive: false,
                objectsActive: false // ✅ Reset toggles
			});
		}
	}
	
    // --- Reverse geocoding helper ---
    // Calls ArcGIS World Geocoding API to convert image lat/lon
    // into a readable address displayed in the info box.
	private fetchReverseGeocode = async (lat: number, lon: number) => {
    try {
        const response = await fetch(
            `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lon},${lat}&distance=100&f=json`
        );
        const data = await response.json();
        const fullAddress = data.address?.LongLabel || 'Address not found';
        const addressParts = fullAddress.split(', ').filter(part => part.trim());
        const secondPart = addressParts[1] || fullAddress;
        this.setState({ address: secondPart });
    } catch (error) {
        console.error('Reverse geocode error:', error);
        this.setState({ address: 'Failed to fetch address' });
    }

    // --- Toggle between embedded and fullscreen modes ---
    // Destroys/recreates Mapillary viewer in the appropriate container
    // because Mapillary viewer must rebind its WebGL canvas context.
    private toggleFullscreen = () => {
        const goingFullscreen = !this.state.isFullscreen;

        // If going fullscreen, destroy current viewer so we can bind to new container
        if (goingFullscreen && this.mapillaryViewer) {
            try {
                this.mapillaryViewer.remove();
            } catch (err) {
                console.warn("Error removing viewer before fullscreen:", err);
            }
            this.mapillaryViewer = null;
        }

        this.setState({isFullscreen: goingFullscreen}, () => {
            // When entering fullscreen, reinit viewer for new container
            if (this.state.isFullscreen && this.viewerContainer.current) {
                const {Viewer} = window.mapillary;
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: this.state.imageId
                });
            }

            // When exiting fullscreen, reinit viewer for widget container
            if (!this.state.isFullscreen && this.viewerContainer.current) {
                const {Viewer} = window.mapillary;
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: this.state.imageId
                });
            }
        });
    };

    /*
        --- Initializes the Mapillary Vector Tile Layer ---
        * - Creates a VectorTileLayer from the Mapillary tiles API
        * - Uses an inline `minimalStyle` object for symbology (sequence = green line, image = light cyan blue circle)
        * - Stores the layer in `this.mapillaryVTLayer` for later toggling
    */
    private initMapillaryLayer() {
        const { VectorTileLayer } = this.ArcGISModules

        // Base URL for Mapillary Vector Tiles API (image + sequence data)
        const vectorTileSourceUrl = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${this.accessToken}`

        // A minimal Mapbox GL style object describing how the layer should look
        const minimalStyle = {
            "version": 8,
            "sources": {
            "mapillary": {
                "type": "vector",
                "tiles": [vectorTileSourceUrl],
                "minzoom": 0,
                "maxzoom": 14
            }
            },
            "layers": [
                {
                    // Green lines = photo capture sequences
                    "id": "sequence",
                    "source": "mapillary",
                    "source-layer": "sequence",
                    "type": "line",
                    "paint": {
                        "line-opacity": 0.6,
                        "line-color": "#35AF6D",
                        "line-width": 2
                    }
                },
                {
                    // light cyan blue circles = individual images
                    "id": "image",
                    "source": "mapillary",
                    "source-layer": "image",
                    "type": "circle",
                    "paint": {
                        "circle-radius": 3,
                    //  "circle-color": "#3388ff",
                        "circle-color": "#33c2ffff",
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-width": 1
                    }
                }
            ]
        }

        // Store the VectorTileLayer instance so we can toggle it later
        this.mapillaryVTLayer = new VectorTileLayer({
            style: minimalStyle   // pass the object directly — no external style.json
        })
    }

    /*
        --- Initializes the Mapillary Traffic Signs Layer ---
        * - Creates a Traffic Signs Layer from the Mapillary tiles API
        * - Stores the layer in `this.mapillaryTrafficSignsLayer` for later toggling
    */
    private initMapillaryTrafficSignsLayer() {
        const { VectorTileLayer } = this.ArcGISModules;

        const vectorTileSourceUrl = `https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${this.accessToken}`;

        // raw.githubusercontent.com for direct asset access
        const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";

        // Minimal Mapbox GL style for traffic signs visualization using icons
        const minimalStyle = {
            version: 8,
            sprite: spriteBaseUrl, // Mapbox style expects: package_signs.png and package_signs.json
            sources: {
                "mapillary-traffic-signs": {
                    type: "vector",
                    tiles: [vectorTileSourceUrl],
                    minzoom: 0,
                    maxzoom: 14
                }
            },
            layers: [
                {
                    id: "traffic-signs-icons",
                    source: "mapillary-traffic-signs",
                    "source-layer": "traffic_sign", // underlying data layer name from Mapillary
                    type: "symbol", // symbol type for icons instead of circle
                    layout: {
                        // Assuming the Mapillary vector tile property for sign ID is called "value"
                        // This should match the keys in your package_signs.json (e.g., warning--yield-ahead--g3)
                        "icon-image": ["get", "value"],
                        "icon-size": 1 // adjust if needed
                    }
                }
            ]
        };

        this.mapillaryTrafficSignsLayer = new VectorTileLayer({
            style: minimalStyle
        });
    }

        /*
        --- Initializes the Mapillary Objects Layer Layer ---
        * - Creates a Object Layer from the Mapillary tiles API
        * - Stores the layer in `this.mapillaryObjectsLayer` for later toggling
    */
    private initMapillaryObjectsLayer() {
        const { VectorTileLayer } = this.ArcGISModules;

        const vectorTileSourceUrl = `https://tiles.mapillary.com/maps/vtp/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${this.accessToken}`;

        const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";

        const minimalStyle = {
            version: 8,
            sprite: spriteBaseUrl, // expects package_objects.png & package_objects.json
            sources: {
                "mapillary-objects": {
                    type: "vector",
                    tiles: [vectorTileSourceUrl],
                    minzoom: 0,
                    maxzoom: 14
                }
            },
            layers: [
                {
                    id: "mapillary-objects-icons",
                    source: "mapillary-objects",
                    "source-layer": "point", // from Mapillary docs
                    type: "symbol",
                    layout: {
                        "icon-image": ["get", "value"], // matches sprite keys
                        "icon-size": 1
                    }
                }
            ]
        };

        this.mapillaryObjectsLayer = new VectorTileLayer({
            style: minimalStyle
        });
    }

    /**
        * Fetches a specific icon from a Mapillary sprite sheet (PNG + JSON) and returns it as a base64 PNG Data URL.
        * This is used to extract individual traffic sign or object icons for rendering as ArcGIS picture markers.
        * The sprite data comes from Mapillary-hosted or custom-hosted sprite assets and provides position/size info in the JSON.
        * @param spriteJSONUrl URL to sprite JSON metadata (contains icon coordinates in the sprite PNG)
        * @param spritePNGUrl  URL to sprite PNG image containing all icons
        * @param iconName      Key name of the icon within the sprite JSON
        * @returns Promise<string> base64 encoded PNG of the specified icon
    */
    private async loadSpriteIconDataURL(
        spriteJSONUrl: string,
        spritePNGUrl: string,
        iconName: string
        ): Promise<string> {
        const jsonResp = await fetch(spriteJSONUrl);
        if (!jsonResp.ok) throw new Error(`Failed to fetch sprite JSON: ${jsonResp.status}`);
        const spriteData = await jsonResp.json();

        if (!spriteData[iconName]) throw new Error(`Icon '${iconName}' not found in sprite JSON`);
        const { x, y, width, height, pixelRatio } = spriteData[iconName];
        const ratio = pixelRatio || 1;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous'; // Ensure CORS works
            img.src = spritePNGUrl;

            img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width / ratio;
            canvas.height = height / ratio;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Canvas context not available"));
                return;
            }
            ctx.drawImage(
                img,
                x, y, width, height,       // source rect
                0, 0, width / ratio, height / ratio // dest rect
            );
            resolve(canvas.toDataURL('image/png'));
            };
        });
    }

    /**
        * Converts geographic longitude/latitude to XYZ map tile indices for a given zoom level.
        * This is used to map the current view extent into the required tile coordinate system
        * for requesting Mapillary vector tiles. Formula uses Web Mercator projection math.
        * @param lon  Longitude in decimal degrees
        * @param lat  Latitude in decimal degrees
        * @param zoom Map zoom level in tile schema (usually 14 for Mapillary feature points)
        * @returns Object {x, y} tile indices
    */
    private lngLatToTile(lon: number, lat: number, zoom: number) {
        const xTile = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
        const yTile = Math.floor(
            (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
        );
        return { x: xTile, y: yTile };
    }

    /**
        * Computes a list of XYZ tiles covering the given bounding box for a specified zoom.
        * This enumerates all vector tiles intersecting the bbox, enabling batch requests
        * to Mapillary's tile API for coverage or feature layers.
        * @param bbox [minLon, minLat, maxLon, maxLat] in WGS84 degrees
        * @param zoom Map zoom level
        * @returns Array of [x, y, zoom] tuples
    */
    private bboxToTileRange(bbox: number[], zoom: number) {
        const minTile = this.lngLatToTile(bbox[0], bbox[3], zoom); // top-left
        const maxTile = this.lngLatToTile(bbox[2], bbox[1], zoom); // bottom-right

        const tiles: Array<[number, number, number]> = [];
        for (let x = minTile.x; x <= maxTile.x; x++) {
            for (let y = minTile.y; y <= maxTile.y; y++) {
            tiles.push([x, y, zoom]);
            }
        }
        return tiles;
    }

    /**
        * Formats Mapillary traffic sign code strings into human-friendly names.
        * 
        * Mapillary encodes sign values with a double‑dash hierarchy (e.g., "warning--yield-ahead--g3").
        * This helper capitalizes and spaces each component for UI display.
        * 
        * @param code Raw Mapillary traffic sign code
        * @returns Human‑readable name
    */
    private formatTrafficSignName(code: string): string {
        if (!code) return "Unknown";
        return code
            .split("--")
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    /**
        * Fetches and builds an ArcGIS FeatureLayer containing traffic sign features within the current map view bounding box.
        * 
        * This method:
        *  - Calculates the tile set covering the current extent (zoom 14)
        *  - Requests traffic sign vector tiles from Mapillary
        *  - Decodes features with PBF VectorTile parser
        *  - Converts coordinates to Web Mercator points
        *  - Optionally matches sprite icons for display
        * The resulting FeatureLayer is stored in `this.mapillaryTrafficSignsFeatureLayer` for display with popups.
        * 
        * @param matchSpriteIcons Whether to match Mapillary traffic sign icons from sprite sheets in renderer
    */
    private async loadMapillaryTrafficSignsFromTilesBBox(matchSpriteIcons: boolean = true) {
        if (this._cancelTrafficSignsFetch) {
            console.log("Cancelled traffic signs tile fetch");
            return;
        }
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        if (jimuMapView.view.zoom < 18) {
            console.log("Not loading traffic signs — zoom below threshold");
            return;
        }

        const extent = jimuMapView.view.extent;
        if (!extent) {
            console.warn("Map extent not available yet");
            return;
        }

        const geoExtent = webMercatorUtils.webMercatorToGeographic(extent);
        const bbox = [geoExtent.xmin, geoExtent.ymin, geoExtent.xmax, geoExtent.ymax];
        const accessToken = this.accessToken;
        const zoom = 14;
        const tiles = this.bboxToTileRange(bbox, zoom);

        const features: any[] = [];

        for (const [x, y, z] of tiles) {
            const url = `https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/${z}/${x}/${y}?access_token=${accessToken}`;
            let resp;
            try {
                resp = await fetch(url);
            } catch (err) {
                console.error("Tile fetch error", err);
                continue;
            }
            if (!resp.ok) continue;

            const arrayBuffer = await resp.arrayBuffer();
            const pbfInstance = new Pbf(arrayBuffer);
            const tile = new VectorTile(pbfInstance);
            const layer = tile.layers['traffic_sign'];
            if (!layer) continue;

            for (let i = 0; i < layer.length; i++) {
                try {
                    const feat = layer.feature(i).toGeoJSON(x, y, z);
                    const [lon, lat] = feat.geometry.coordinates;
                    if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) {
                        const wmPoint = webMercatorUtils.geographicToWebMercator({
                            type: "point",
                            x: lon,
                            y: lat,
                            spatialReference: { wkid: 4326 }
                        });
                        features.push({
                        geometry: wmPoint,
                        attributes: {
                            id: feat.properties.id,
                            value: feat.properties.value,
                            name: this.formatTrafficSignName(feat.properties.value),
                            first_seen_at: feat.properties.first_seen_at,
                            last_seen_at: feat.properties.last_seen_at
                        }
        });
                    }
                } catch (err) {
                    console.warn("Feature parse error", err);
                }
            }
        }

        const [FeatureLayer] = await loadArcGISJSAPIModules(["esri/layers/FeatureLayer"]);

        const fields = [
            { name: "id", type: "string", alias: "ID" },
            { name: "value", type: "string", alias: "Sign Code" },
            { name: "name", type: "string", alias: "Sign Name" },
            { name: "first_seen_at", type: "date", alias: "First Seen" },
            { name: "last_seen_at", type: "date", alias: "Last Seen" }
        ];

        let renderer: __esri.Renderer;
        if (matchSpriteIcons) {
            const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";
            const uniqueValues = Array.from(new Set(features.map(f => f.attributes.value)));
            const iconCache: Record<string, string> = {};
            for (const val of uniqueValues) {
                try {
                    iconCache[val] = await this.loadSpriteIconDataURL(
                        `${spriteBaseUrl}.json`,
                        `${spriteBaseUrl}.png`,
                        val
                    );
                } catch (err) {
                    console.warn(`Could not load icon for ${val}`, err);
                }
            }
            renderer = {
                type: "unique-value",
                field: "value",
                uniqueValueInfos: uniqueValues.map(v => ({
                    value: v,
                    symbol: iconCache[v]
                        ? { type: "picture-marker", url: iconCache[v], width: 20, height: 20 }
                        : { type: "simple-marker", size: 6, color: "orange", outline: { color: "white", width: 1 } }
                })),
                defaultSymbol: { type: "simple-marker", size: 6, color: "orange", outline: { color: "white", width: 1 } }
            };
        } else {
            renderer = {
                type: "simple",
                symbol: { type: "simple-marker", size: 6, color: "orange", outline: { color: "white", width: 1 } }
            };
        }

        const layer = new FeatureLayer({
            source: features,
            fields,
            objectIdField: "id",
            spatialReference: { wkid: 3857 },
            geometryType: "point",
            renderer,
            popupTemplate: {
                title: `{name}`,
                content: `<b>ID:</b> {id}<br>
                <b>First Seen:</b> {first_seen_at}<br>
                <b>Value Code:</b> {value}<br>
                <b>Last Seen:</b> {last_seen_at}`
            }
        });
        this.mapillaryTrafficSignsFeatureLayer = layer;
    }

    /**
        * Fetches and builds an ArcGIS FeatureLayer containing Mapillary object features within the current map view bounding box.
        * This method:
        *  - Calculates tile set covering the current extent (zoom 14)
        *  - Requests object vector tiles from Mapillary
        *  - Decodes features with PBF VectorTile parser
        *  - Converts coordinates to Web Mercator points
        *  - Optionally matches sprite icons for display
        * The resulting FeatureLayer is stored in `this.mapillaryObjectsFeatureLayer` for display with popups.
        * @param matchSpriteIcons Whether to match Mapillary object icons from sprite sheets in renderer
    */
    private async loadMapillaryObjectsFromTilesBBox(matchSpriteIcons: boolean = true) {

        if (this._cancelObjectsFetch) {
            console.log("Cancelled object tile fetch — widget closed or toggle off");
            return;
        }
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        if (jimuMapView.view.zoom < 18) {
            console.log("Not loading objects — zoom below threshold");
            return;
        }

        const extent = jimuMapView.view.extent;
        if (!extent) {
            console.warn("Map extent not available yet");
            return;
        }

        // Convert extent to WGS84 lon/lat
        const geoExtent = webMercatorUtils.webMercatorToGeographic(extent);
        const bbox = [geoExtent.xmin, geoExtent.ymin, geoExtent.xmax, geoExtent.ymax];

        const accessToken = this.accessToken;
        const zoom = 14; // recommended zoom for points

        const tiles = this.bboxToTileRange(bbox, zoom);
        const features: any[] = [];

        for (const [x, y, z] of tiles) {
            const url = `https://tiles.mapillary.com/maps/vtp/mly_map_feature_point/2/${z}/${x}/${y}?access_token=${accessToken}`;

            let resp;
            try {
            resp = await fetch(url);
            } catch (err) {
            console.error("Tile fetch error", err);
            continue;
            }
            if (!resp.ok) continue;

            const arrayBuffer = await resp.arrayBuffer();
            const pbfInstance = new Pbf(arrayBuffer);
            const tile = new VectorTile(pbfInstance);
            const layer = tile.layers['point'];
            if (!layer) continue;

            for (let i = 0; i < layer.length; i++) {
            try {
                const feat = layer.feature(i).toGeoJSON(x, y, z);
                const [lon, lat] = feat.geometry.coordinates;

                if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) {
                const wmPoint = webMercatorUtils.geographicToWebMercator({
                    type: "point",
                    x: lon,
                    y: lat,
                    spatialReference: { wkid: 4326 }
                });

                features.push({
                geometry: wmPoint,
                    attributes: {
                                    id: feat.properties.id,
                                    value: feat.properties.value,
                                    name: this.objectNameMap[feat.properties.value] || feat.properties.value, // ✅ readable name
                                    first_seen_at: feat.properties.first_seen_at,
                                    last_seen_at: feat.properties.last_seen_at
                                }
                });
                }
            } catch (err) {
                console.warn("Feature parse error", err);
            }
            }
        }

        const [FeatureLayer] = await loadArcGISJSAPIModules(["esri/layers/FeatureLayer"]);

        const fields = [
            { name: 'id', type: 'string', alias: 'ID' },
            { name: 'value', type: 'string', alias: 'Object Type Code' },
            { name: 'name', type: 'string', alias: 'Object Type Name' },
            { name: 'first_seen_at', type: 'date', alias: 'First Seen' },
            { name: 'last_seen_at', type: 'date', alias: 'Last Seen' }
        ];

        let renderer: __esri.Renderer;
        if (matchSpriteIcons) {
            const spriteBaseUrl =
            "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects"; // Host PNG + JSON with CORS!

            // Cache icons for each value
            const uniqueValues = Array.from(new Set(features.map(f => f.attributes.value)));
            const iconCache: Record<string, string> = {};

            for (const val of uniqueValues) {
            try {
                iconCache[val] = await this.loadSpriteIconDataURL(
                `${spriteBaseUrl}.json`,
                `${spriteBaseUrl}.png`,
                val
                );
            } catch (err) {
                    console.warn(`Could not load icon for ${val}`, err);
                }
            }

            renderer = {
            type: "unique-value",
            field: "value",
            uniqueValueInfos: uniqueValues.map(v => ({
                value: v,
                symbol: iconCache[v]
                ? {
                    type: "picture-marker",
                    url: iconCache[v],
                    width: 20,
                    height: 20
                    }
                : {
                    type: "simple-marker",
                    size: 6,
                    color: "orange",
                    outline: { color: "white", width: 1 }
                    }
            })),
            defaultSymbol: {
                type: "simple-marker",
                size: 6,
                color: "orange",
                outline: { color: "white", width: 1 }
            }
            };
        } else {
            renderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                size: 6,
                color: "orange",
                outline: { color: "white", width: 1 }
            }
            };
        }

        const layer = new FeatureLayer({
            source: features,
            fields,
            objectIdField: "id",
            spatialReference: { wkid: 3857 },
            geometryType: "point",
            renderer,
            popupTemplate: {
                title: `{name}`,
                content: `
                    <b>ID:</b> {id}<br>
                    <b>First Seen:</b> {first_seen_at}<br>
                    <b>Value Code:</b> {value}<br>
                    <b>Last Seen:</b> {last_seen_at}
                `
            }
        });
        this.mapillaryObjectsFeatureLayer = layer;
    }

    /**
        * Returns a debounced version of the provided function.
        * Debounced functions delay invocation until after `wait` milliseconds have elapsed since
        * the last time they were called. Useful for rate‑limiting operations like API calls during
        * map zooming or panning, to avoid excessive requests.
        * @template T Function type
        * @param func Function to debounce
        * @param wait Milliseconds to delay execution after last call
        * @returns A new function with debouncing applied
    */
    private debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
        let timeout: any;
        return (...args: Parameters<T>) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    /*
        --- Toggles Mapillary Vector Tile Layer or Mapillary Traffic Signs on/off in the current map view --- 
        * - If layer is already in the map, remove it
        * - If layer is not in the map, add it
        * - Controlled by button in UI ("🗺️" icon)
        * - Uses `this.mapillaryVTLayer` created by initMapillaryLayer()
        * - Uses `this.mapillaryTrafficSignsLayer` created by initMapillaryTrafficSignsLayer()
    */
    private toggleMapillaryTiles = () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.mapillaryVTLayer) return;

        const layers = jimuMapView.view.map.layers;
        if (layers.includes(this.mapillaryVTLayer)) {
            jimuMapView.view.map.remove(this.mapillaryVTLayer);
            this.setState({ tilesActive: false }); // deactivate
        } else {
            jimuMapView.view.map.add(this.mapillaryVTLayer);
            this.setState({ tilesActive: true }); // activate
        }
    };

    /**
        * Toggles the Mapillary traffic signs overlay on/off in the map.
        * When ON:
        *  - Ensures the traffic sign VectorTileLayer (coverage layer) is always present when active
        *  - Dynamically loads/removes a FeatureLayer of traffic signs from the current bounding box if zoom >= 18
        *  - Uses watchers on zoom/stationary events to auto-remove features when zoomed out and refresh when zoomed in
        * When OFF:
        *  - Removes all traffic sign FeatureLayers from the map, leaves coverage layer intact
        *  - Cleans up event watchers and fetch cancellation flags
        * This separation allows fast coverage display at all zoom levels via VectorTileLayer,
        * and detailed, interactive popups via FeatureLayer only at close zoom.
    */
    private toggleMapillaryTrafficSigns = async () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // === Turn OFF ===
        if (this.state.trafficSignsActive) {
            if (this.trafficSignsStationaryHandle) {
                this.trafficSignsStationaryHandle.remove();
                this.trafficSignsStationaryHandle = null;
            }
            if (this.trafficSignsZoomHandle) {
                this.trafficSignsZoomHandle.remove();
                this.trafficSignsZoomHandle = null;
            }

            this._cancelTrafficSignsFetch = true;

            // Remove the VectorTileLayer (coverage) if present
            if (this.mapillaryTrafficSignsLayer && jimuMapView.view.map.layers.includes(this.mapillaryTrafficSignsLayer)) {
                jimuMapView.view.map.remove(this.mapillaryTrafficSignsLayer);
            }

            // Remove the FeatureLayer if present
            if (this.mapillaryTrafficSignsFeatureLayer && jimuMapView.view.map.layers.includes(this.mapillaryTrafficSignsFeatureLayer)) {
                jimuMapView.view.map.remove(this.mapillaryTrafficSignsFeatureLayer);
            }

            this.mapillaryTrafficSignsLayer = null;
            this.mapillaryTrafficSignsFeatureLayer = null;

            this.setState({ trafficSignsActive: false });
            return;
        }

        // === Turn ON ===
        this._cancelTrafficSignsFetch = false;
        if (!this.mapillaryTrafficSignsLayer) {
            this.initMapillaryTrafficSignsLayer();
            jimuMapView.view.map.add(this.mapillaryTrafficSignsLayer); // Ensure VT layer always on
        } else if (!jimuMapView.view.map.layers.includes(this.mapillaryTrafficSignsLayer)) {
            jimuMapView.view.map.add(this.mapillaryTrafficSignsLayer);
        }

        if (jimuMapView.view.zoom >= 18) {
            await this.loadMapillaryTrafficSignsFromTilesBBox(true);
            if (this.mapillaryTrafficSignsFeatureLayer) {
            jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
            }
        }

        // Zoom watcher
        const zoomHandle = jimuMapView.view.watch("zoom", (currentZoom) => {
            if (currentZoom < 18) {
            this._cancelTrafficSignsFetch = true;

            // Remove any FeatureLayer for traffic signs — KEEP VT layer
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });

            this.mapillaryTrafficSignsFeatureLayer = null;
            } else {
            this._cancelTrafficSignsFetch = false;
            // No need to re‑add VT layer — it was never removed
            }
        });

        // Debounced refresh for stationary event
        const debouncedRefresh = this.debounce(async () => {
            if (this._cancelTrafficSignsFetch || jimuMapView.view.zoom < 18) {
            // Force remove FeatureLayer if zoomed out
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });
            return;
            }

            // Fetch and add FeatureLayer if zoom >= 18
            await this.loadMapillaryTrafficSignsFromTilesBBox(true);
            if (this.mapillaryTrafficSignsFeatureLayer) {
            // Remove old FeatureLayer(s) and add fresh one
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });
            jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
            }
        }, 500);

        // Stationary watcher
        this.trafficSignsStationaryHandle = jimuMapView.view.watch("stationary", (isStationary) => {
            if (!isStationary) return;
            if (this._cancelTrafficSignsFetch) return;

            if (jimuMapView.view.zoom < 18) {
            // Remove only FeatureLayers — KEEP VT layer
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });
            return;
            }

            debouncedRefresh();
        });

        // Save zoom handle for cleanup
        this.trafficSignsZoomHandle = zoomHandle;
        this.setState({ trafficSignsActive: true });
    };

    /**
        * Toggles the Mapillary objects overlay on/off in the map.
        * When ON:
        *  - Ensures the objects VectorTileLayer (coverage layer) is always present when active
        *  - Dynamically loads/removes a FeatureLayer of objects from the current bounding box if zoom >= 18
        *  - Uses watchers on zoom/stationary events to auto-remove features when zoomed out and refresh when zoomed in
        * When OFF:
        *  - Removes all object-related FeatureLayers from the map, leaves coverage layer intact
        *  - Cleans up event watchers and fetch cancellation flags
        * This mirrors the logic for `toggleMapillaryTrafficSigns`, ensuring consistent behaviour
        * for both overlays while isolating heavy FeatureLayer rendering to close zoom levels only.
    */
    private toggleMapillaryObjects = async () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // === Turn OFF ===
        if (this.state.objectsActive) {
            if (this.objectsStationaryHandle) {
                this.objectsStationaryHandle.remove();
                this.objectsStationaryHandle = null;
            }
            if (this.objectsZoomHandle) {
                this.objectsZoomHandle.remove();
                this.objectsZoomHandle = null;
            }

            this._cancelObjectsFetch = true;

            // Remove the VectorTileLayer (coverage)
            if (this.mapillaryObjectsLayer && jimuMapView.view.map.layers.includes(this.mapillaryObjectsLayer)) {
                jimuMapView.view.map.remove(this.mapillaryObjectsLayer);
            }

            // Remove the FeatureLayer
            if (this.mapillaryObjectsFeatureLayer && jimuMapView.view.map.layers.includes(this.mapillaryObjectsFeatureLayer)) {
                jimuMapView.view.map.remove(this.mapillaryObjectsFeatureLayer);
            }

            this.mapillaryObjectsLayer = null;
            this.mapillaryObjectsFeatureLayer = null;

            this.setState({ objectsActive: false });
            return;
        }

        // === Turn ON ===
        this._cancelObjectsFetch = false;

        // Ensure vector tile coverage layer is present
        if (!this.mapillaryObjectsLayer) {
            this.initMapillaryObjectsLayer();
            jimuMapView.view.map.add(this.mapillaryObjectsLayer);
        } else if (!jimuMapView.view.map.layers.includes(this.mapillaryObjectsLayer)) {
            jimuMapView.view.map.add(this.mapillaryObjectsLayer);
        }

        if (jimuMapView.view.zoom >= 18) {
            await this.loadMapillaryObjectsFromTilesBBox(true);
            if (this.mapillaryObjectsFeatureLayer) {
            jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
            }
        }

        // Zoom watcher
        const zoomHandle = jimuMapView.view.watch("zoom", (currentZoom) => {
            if (currentZoom < 18) {
            this._cancelObjectsFetch = true;

            // Remove all object FeatureLayers — KEEP vector tile coverage layer
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });

            this.mapillaryObjectsFeatureLayer = null;
            } else {
            this._cancelObjectsFetch = false;
            // No need to re-add vector tile coverage — it's always present
            }
        });

        // Debounced refresh
        const debouncedRefresh = this.debounce(async () => {
            if (this._cancelObjectsFetch || jimuMapView.view.zoom < 18) {
            // Force remove FeatureLayer if zoomed out
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });
            return;
            }

            // Fetch and add bbox FeatureLayer if zoom >= 18
            await this.loadMapillaryObjectsFromTilesBBox(true);
            if (this.mapillaryObjectsFeatureLayer) {
            // Remove old FeatureLayers and add fresh
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });
            jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
            }
        }, 500);

        // Stationary watcher
        this.objectsStationaryHandle = jimuMapView.view.watch("stationary", (isStationary) => {
            if (!isStationary) return;
            if (this._cancelObjectsFetch) return;

            if (jimuMapView.view.zoom < 18) {
            // Remove any object FeatureLayers — KEEP vector tile coverage layer
            jimuMapView.view.map.layers.forEach((layer) => {
                if (
                layer.type === "feature" &&
                (layer as any).fields?.some((f: any) => f.name === "value") &&
                (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                jimuMapView.view.map.remove(layer);
                }
            });
            return;
            }

            debouncedRefresh();
        });

        this.objectsZoomHandle = zoomHandle;
        this.setState({ objectsActive: true });
    };

    // --- Local caching of last sequence ---
    // Stores minimal sequence info (IDs + coords) in localStorage
    // to reload previous sequence instantly on widget startup.
    private saveSequenceCache(sequenceId: string, sequenceImages: { id: string; lat: number; lon: number }[]) {
        try {
            localStorage.setItem("mapillary_sequence_cache", JSON.stringify({
                sequenceId,
                sequenceImages
            }));
            console.log("Sequence cached to localStorage");
        } catch (err) {
            console.warn("Failed to save cache", err);
        }
    }

    private restoreSequenceCache() {
        try {
            const cache = localStorage.getItem("mapillary_sequence_cache");
            if (cache) {
                const parsed = JSON.parse(cache);
                if (parsed.sequenceId && Array.isArray(parsed.sequenceImages)) {
                    // Only restore sequence images so blue dots appear
                    this.setState({
                        sequenceId: null,  // keep it hidden until user clicks
                        sequenceImages: parsed.sequenceImages
                    });
                    console.log("Sequence images restored from localStorage");
                }
            } else {
                this.setState({
                    sequenceId: null,
                    sequenceImages: []
                });
            }
        } catch (err) {
            console.warn("Failed to restore cache", err);
            this.setState({
                sequenceId: null,
                sequenceImages: []
            });
        }
    }
    
    // --- Load a specific sequence by ID and image ---
    // Fetches all image coordinates in the sequence,
    // updates the viewer, re-draws map markers,
    // and attaches Mapillary event listeners for bearing/image changes.
    private async loadSequenceById(sequenceId: string, startImageId: string) {
        this.clearGreenPulse();
        
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        this.setState({ isLoading: true });

        try {
            // Fetch all images (IDs + coords) for this sequence
            const updatedSequence = await this.getSequenceWithCoords(sequenceId, this.accessToken);

            // Update state so Mapillary viewer knows what to show
            this.setState({
                sequenceImages: updatedSequence,
                imageId: startImageId,
                sequenceId,
                selectedSequenceId: sequenceId
            });

            // Cache sequence locally in case user comes back later
            this.saveSequenceCache(sequenceId, updatedSequence);

            // Destroy old viewer if exists
            if (this.mapillaryViewer) {
                try { this.mapillaryViewer.remove(); } catch {}
                this.mapillaryViewer = null;
            }

            // Create new Mapillary viewer for this sequence
            const { Viewer } = window.mapillary;
            if (this.viewerContainer.current) {
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: startImageId,
                    components: [
                        'zoom', // zoom control in UI
                    ]
                });
                
                // Helper: redraws cone safely based on current zoomStepIndex
                this.redrawCone = () => {
                    const currentId = this.state.imageId;
                    if (!currentId) {
                        console.warn("No current image ID — cone not drawn");
                        return;
                    }

                    const img = this.state.sequenceImages.find(s => s.id === currentId);
                    if (!img) {
                        console.warn("Image data not found for ID:", currentId);
                        return;
                    }

                    const view = this.state.jimuMapView?.view;
                    if (!view) {
                        console.warn("Map view is not available");
                        return;
                    }

                    const bearing = this._lastBearing || 0;
                    const length = this.coneLengths[this.zoomStepIndex];
                    const spread = this.coneSpreads[this.zoomStepIndex];

                    // Validate parameters before drawing to avoid NaN path errors
                    if ([img.lon, img.lat, length, spread, bearing].some(v => typeof v !== "number" || isNaN(v))) {
                        console.warn("Invalid cone parameters, skipping draw", { lon: img.lon, lat: img.lat, length, spread, bearing });
                        return;
                    }

                    if (this.currentConeGraphic) {
                        view.graphics.remove(this.currentConeGraphic);
                    }

                    this.currentConeGraphic = this.drawCone(img.lon, img.lat, bearing, length, spread);
                };

                // Viewer load setup
                this.mapillaryViewer.on("load", () => {
                    // ---- Zoom subscription ----
                    const zoomComponent: any = this.mapillaryViewer.getComponent("zoom");
                    if (!zoomComponent || !zoomComponent._zoomDelta$) {
                        console.warn("Zoom component or _zoomDelta$ not found");
                        return;
                    }

                    const navigator: any = this.mapillaryViewer.getNavigator?.() || (this.mapillaryViewer as any)._navigator;
                    if (!navigator) {
                        console.warn("Navigator not found");
                        return;
                    }

                    // Listen for zoom changes (UI buttons, internal wheel, API calls)
                    zoomComponent._zoomDelta$.subscribe((delta: number) => {
                        if (delta > 0 && this.zoomStepIndex < this.coneSpreads.length - 1) {
                            this.zoomStepIndex++;
                        } else if (delta < 0 && this.zoomStepIndex > 0) {
                            this.zoomStepIndex--;
                        }
                        this.redrawCone();
                    });

                    // Disable Mapillary's internal +/- keyboard zoom
                    const keyboardComponent: any = this.mapillaryViewer.getComponent("keyboard");
                    if (keyboardComponent?.keyZoom) {
                        keyboardComponent.keyZoom.disable();
                        console.log("Keyboard zoom (+/-) disabled");
                    }

                    });


                    // Custom wheel handler for cone & zoomStepIndex update
                    this.viewerContainer.current.addEventListener(
                    "wheel",
                    (evt) => {
                        evt.preventDefault(); // prevent page scroll

                        if (evt.deltaY < 0) {
                        // Zoom in → narrow cone
                        this.zoomStepIndex = Math.min(this.zoomStepIndex + 1, this.coneSpreads.length - 1);
                        } else {
                        // Zoom out → wider cone
                        this.zoomStepIndex = Math.max(this.zoomStepIndex - 1, 0);
                        }

                        // Use the same helper for redraw
                        this.redrawCone();
                    },
                    { passive: false }
                );

                // Event: Bearing change → update cone
                this.mapillaryViewer.on("bearing", (event: any) => {
                    const newBearing = event.bearing;
                      this._lastBearing = newBearing; // store for wheel redraws
                    const currentId = this.state.imageId;
                    if (!currentId) return;
                    const img = this.state.sequenceImages.find(s => s.id === currentId);
                    if (!img) return;
                    const view = this.state.jimuMapView?.view;
                    if (!view) return;
                    if (this.currentConeGraphic) view.graphics.remove(this.currentConeGraphic);
                    this.currentConeGraphic = this.drawCone(
                        img.lon,
                        img.lat,
                        event.bearing,
                        this.coneLengths[this.zoomStepIndex],
                        this.coneSpreads[this.zoomStepIndex]
                    );
                });

                // Event: Image change → update active frame + cone + address
                this.mapillaryViewer.on("image", async (event: any) => {
                    const newId = event.image.id;
                    const img = this.state.sequenceImages.find(s => s.id === newId);
                    if (!img) return;
                    const view = this.state.jimuMapView?.view;
                    if (!view) return;

                    // Store old active point coords before switching
                    if (this.state.imageId) {
                        const prevImg = this.state.sequenceImages.find(s => s.id === this.state.imageId);
                        if (prevImg) {
                            // Turn previous active into static blue point
                            if (this.currentGreenGraphic) {
                                if ((this.currentGreenGraphic as any)._pulseInterval) {
                                    clearInterval((this.currentGreenGraphic as any)._pulseInterval);
                                }
                                view.graphics.remove(this.currentGreenGraphic);
                            }
                            // Draw as sequence blue point
                            this.drawPointWithoutRemoving(prevImg.lon, prevImg.lat, [0, 0, 255, 1]);
                        }
                    }

                    // Update active imageId
                    this.setState({ imageId: newId });

                    // Remove old cone graphics
                    view.graphics.forEach(g => {
                        if ((g as any).__isCone) {
                            view.graphics.remove(g);
                        }
                    });

                    // Draw new green pulsing point at current active image
                    this.currentGreenGraphic = this.drawPulsingPoint(img.lon, img.lat, [0, 255, 0, 1]);

                    // Reverse geocode for info panel
                    this.fetchReverseGeocode(img.lat, img.lon);

                    // Draw cone for current image
                    const currentBearing = await this.mapillaryViewer.getBearing();
                    if (currentBearing !== null) {
                        this._lastBearing = currentBearing;
                        this.currentConeGraphic = this.drawCone(
                            img.lon,
                            img.lat,
                            currentBearing,
                            this.coneLengths[this.zoomStepIndex],
                            this.coneSpreads[this.zoomStepIndex]
                        );
                    }
                });
                            }

            // Clear previous green pulse
            this.clearGreenPulse();

            // Clear old map graphics and draw new ones
            // remove only non-overlay graphics to keep sequence polylines visible
            const toRemove: __esri.Graphic[] = [];
            jimuMapView.view.graphics.forEach(g => {
            if (!(g as any).__isSequenceOverlay) {
                toRemove.push(g);
            }
            });
            toRemove.forEach(g => jimuMapView.view.graphics.remove(g));

            // Always draw red clicked location point at clickLon/clickLat saved in state
            const { clickLon, clickLat } = this.state;
            if (clickLon != null && clickLat != null) {
                this.drawPoint(clickLon, clickLat);
            }

            // Draw blue points for other images in the sequence
            updatedSequence.forEach(img => {
                if (img.id !== startImageId) {
                    this.drawPointWithoutRemoving(img.lon, img.lat, [0, 0, 255, 1]);
                }
            });

            // Draw green pulsing point for current image
            const currentImg = updatedSequence.find(img => img.id === startImageId);
            if (currentImg) {
                this.currentGreenGraphic = this.drawPulsingPoint(currentImg.lon, currentImg.lat, [0, 255, 0, 1]);
            }

        } catch (err) {
            console.error("Error loading sequence:", err);
        } finally {
            this.setState({ isLoading: false });
        }
    }

    // --- Initial setup lifecycle ---
    // Loads ArcGIS API modules dynamically (Graphic, Point, etc.),
    // restores cache, loads Mapillary JS/CSS via CDN,
    // and attaches resize/fullscreen event listeners.
    async componentDidMount() {
        try {
            const [Graphic, Point, SimpleMarkerSymbol, VectorTileLayer] =
                await loadArcGISJSAPIModules([
                    "esri/Graphic",
                    "esri/geometry/Point",
                    "esri/symbols/SimpleMarkerSymbol",
                    "esri/layers/VectorTileLayer"
                ]);
            this.ArcGISModules = {Graphic, Point, SimpleMarkerSymbol, VectorTileLayer};
            console.log("ArcGIS API modules loaded");
            // ✅ Initialize Mapillary Vector Tile Layer right after modules are ready
            this.initMapillaryLayer();
            this.initMapillaryTrafficSignsLayer();
            this.initMapillaryObjectsLayer(); 
        } catch (err) {
            console.error("ArcGIS modules failed to load:", err);
        }

        // Restore any cached sequence from previous session
        this.restoreSequenceCache();

        // Load Mapillary JS + CSS
        const link = document.createElement("link");
        link.rel = "stylesheet";
        // link.href = "https://localhost:3001/assets/mapillary.css";
        link.href = "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css";
        document.head.appendChild(link);

        await new Promise<void>((resolve, reject) => {
            const originalDefine = window.define;
            window.define = undefined;

            const script = document.createElement("script");
            // script.src = "https://localhost:3001/assets/mapillary.js";
            script.src = "https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js";
            script.async = true;
            script.onload = () => {
                console.log("Mapillary JS loaded", !!window.mapillary);
                window.define = originalDefine;
                resolve();
            };
            script.onerror = () => {
                console.error("Failed to load Mapillary JS");
                window.define = originalDefine;
                reject();
            };
            document.body.appendChild(script);
        });

        this.resizeObserver = new ResizeObserver(() => {
            if (this.mapillaryViewer?.resize) {
                this.mapillaryViewer.resize();
            }
        });
        if (this.viewerContainer.current) {
            this.resizeObserver.observe(this.viewerContainer.current);
        }

        // Listen for browser fullscreen events
        document.addEventListener('fullscreenchange', this.handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange); // Safari
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange); // old Firefox
        document.addEventListener('MSFullscreenChange', this.handleFullscreenChange);   // old IE
        // ... fullscreen listeners
        window.addEventListener('resize', this.handleWindowResize);
    }
	
	componentDidUpdate(prevProps: AllWidgetProps<any>) {
		// If widget was visible before but now hidden
		if (prevProps.visible && !this.props.visible) {
			console.log("Widget hidden - Clean and reset state");
			this.cleanupWidgetEnvironment(true);
		}

		// If using state prop from ArcGIS EB lifecycle
		if (prevProps.state === 'OPENED' && this.props.state === 'CLOSED') {
			console.log("Widget closed - Clean and reset state");
			this.cleanupWidgetEnvironment(true);
		}
	}

    // --- Cleanup lifecycle ---
    // Ensures all intervals, observers, and event listeners are removed
    // to prevent memory leaks when widget is closed or reloaded.
	componentWillUnmount() {
		this.cleanupWidgetEnvironment(true);

		// Stop resize observer
		if (this.resizeObserver && this.viewerContainer.current) {
			this.resizeObserver.unobserve(this.viewerContainer.current);
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		// Remove listeners
		document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
		document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
		document.removeEventListener('mozfullscreenchange', this.handleFullscreenChange);
		document.removeEventListener('MSFullscreenChange', this.handleFullscreenChange);
		window.removeEventListener('resize', this.handleWindowResize);
	}

    private handleFullscreenChange = () => {
        // When fullscreen mode changes, resize the Mapillary viewer
        if (this.mapillaryViewer?.resize) {
            this.mapillaryViewer.resize();
        }
    };
    private handleWindowResize = () => {
        if (this.mapillaryViewer?.resize) {
            this.mapillaryViewer.resize();
        }
    };

    onActiveViewChange(jmv: JimuMapView) {
        if (!jmv) return;

        console.log("Active MapView set");
        this.setState({ jimuMapView: jmv });

        jmv.view.on("click", async (evt) => {
            const { clickLon, clickLat, selectedSequenceId } = this.state;

            // Always record clicked location
            const point = jmv.view.toMap(evt) as __esri.Point;
            this.setState({ clickLon: point.longitude, clickLat: point.latitude });
            
            // Hit-test
            const hit = await jmv.view.hitTest(evt);
            // Check Mapillary object popup layer
            const objectHit = hit.results.find(r => r.graphic?.layer === this.mapillaryObjectsFeatureLayer);
            if (objectHit) {
                console.log("Clicked Mapillary object:", objectHit.graphic.attributes);
                return; // 🛑 stop — let ArcGIS popup handle it
            }

            // Check Mapillary traffic sign popup layer
            const trafficSignHit = hit.results.find(r => r.graphic?.layer === this.mapillaryTrafficSignsFeatureLayer);
            if (trafficSignHit) {
                console.log("Clicked traffic sign:", trafficSignHit.graphic.attributes);
                return; // 🛑 stop — let ArcGIS popup handle it
            }

            // Check Mapillary VectorTileLayer icons (optional) for objects or signs
            const vtHit = hit.results.find(r =>
                r.layer === this.mapillaryObjectsLayer ||
                r.layer === this.mapillaryTrafficSignsLayer
            );
            if (vtHit) {
                console.log("Clicked Mapillary vector tile icon");
                return; // 🛑 avoid running streetview logic
            }

            // 2️⃣ Check if clicked an overlay sequence polyline/text/dot
            const seqGraphic = hit.results.find(r => (r.graphic as any).__isSequenceOverlay);
            if (seqGraphic && seqGraphic.graphic.attributes?.sequenceId) {
                const seqId = seqGraphic.graphic.attributes.sequenceId;
                console.log("Sequence overlay clicked:", seqId);

                if (seqId !== selectedSequenceId) {
                    const updatedSequence = await this.getSequenceWithCoords(seqId, this.accessToken);
                    if (updatedSequence.length) {
                        const closestImg = updatedSequence.reduce((closest, img) => {
                            const dist = this.distanceMeters(img.lat, img.lon, point.latitude, point.longitude);
                            return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                        }, null as any);

                        if (closestImg) {
                            this.setState({ selectedSequenceId: seqId });
                            await this.loadSequenceById(seqId, closestImg.id);
                        }
                    }
                    return; // ✅ sequence overlay click handled — skip rest
                }
            }

            // 3️⃣ If not an overlay or object, run normal map click logic
            await this.handleMapClick(evt);
        });

        jmv.view.on("pointer-move", async (evt) => {
            const hit = await jmv.view.hitTest(evt);
            const obj = hit.results.find(r => r.graphic?.layer === this.mapillaryObjectsFeatureLayer);
            if (obj) {
                this.setState({
                    hoveredMapObject: {
                        x: evt.x,
                        y: evt.y,
                        objectName: obj.graphic.attributes.value,
                        firstSeen: new Date(obj.graphic.attributes.first_seen_at).toLocaleString(),
                        lastSeen: new Date(obj.graphic.attributes.last_seen_at).toLocaleString()
                    }
                });
            } else {
                if (this.state.hoveredMapObject) this.setState({ hoveredMapObject: null });
            }
        });
    }



    private showNoImageMessage() {
        this.setState({ noImageMessageVisible: true });

        // Automatically hide after fade (4 seconds)
        setTimeout(() => {
            this.setState({ noImageMessageVisible: false });
        }, 4000);
    }

    private clearNoImageMessage() {
        this.setState({ noImageMessageVisible: false });
    }

    // --- Map graphics drawing helpers ---
    // drawPulsingPoint → animates active image point (green).
    // drawClickRipple → shows short-lived red ripple at click.
    // drawPoint → draws static red point for clicked location.
    // drawCone → draws camera direction cone based on bearing.
    private drawPulsingPoint(
        lon: number,
        lat: number,
        baseColor: any = [0, 255, 0, 1]
    ) {
        const {jimuMapView} = this.state;
        if (!jimuMapView || !this.ArcGISModules) return null;

        const {Graphic} = this.ArcGISModules;

        const graphic = new Graphic({
            geometry: {
                type: "point",
                longitude: lon,
                latitude: lat,
                spatialReference: {wkid: 4326},
            },
            symbol: {
                type: "simple-marker",
                style: "circle",
                color: baseColor,
                size: 10,
                outline: {color: "white", width: 2},
            },
        });

        jimuMapView.view.graphics.add(graphic);

        let growing = true;
        let size = 10;

        const pulseInterval = setInterval(() => {
            size += growing ? 0.5 : -0.5;
            if (size >= 14) growing = false;
            if (size <= 10) growing = true;

            graphic.symbol = {
                type: "simple-marker",
                style: "circle",
                color: baseColor,
                size,
                outline: {color: "white", width: 2},
            };

            jimuMapView.view.graphics.remove(graphic);
            jimuMapView.view.graphics.add(graphic);
        }, 60);

        (graphic as any)._pulseInterval = pulseInterval;
        return graphic;
    }

    private drawClickRipple(lon: number, lat: number) {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const { Graphic } = this.ArcGISModules;

        let size = 0; // Start small
        let alpha = 0.4;

        const rippleGraphic = new Graphic({
            geometry: {
            type: "point",
            longitude: lon,
            latitude: lat,
            spatialReference: { wkid: 4326 }
            },
            symbol: {
            type: "simple-marker",
            style: "circle",
            color: [255, 0, 0, alpha], // red with opacity
            size: size,
            outline: { color: [255, 0, 0, alpha], width: 1 }
            }
        });

        jimuMapView.view.graphics.add(rippleGraphic);

        const rippleInterval = setInterval(() => {
            size += 2; // grow
            alpha -= 0.03; // fade out

            rippleGraphic.symbol = {
            type: "simple-marker",
            style: "circle",
            color: [255, 0, 0, Math.max(alpha, 0)],
            size: size,
            outline: { color: [255, 0, 0, Math.max(alpha, 0)], width: 1 }
            };

            // When invisible, cleanup
            if (alpha <= 0) {
            clearInterval(rippleInterval);
            jimuMapView.view.graphics.remove(rippleGraphic);
            }
        }, 30);
    }

    private drawPointWithoutRemoving(
        lon: number,
        lat: number,
        color: any = [0, 0, 255, 1]
    ) {
        const {jimuMapView} = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const {Graphic} = this.ArcGISModules;

        const graphic = new Graphic({
            geometry: {
                type: "point",
                longitude: lon,
                latitude: lat,
                spatialReference: {wkid: 4326},
            },
            symbol: {
                type: "simple-marker",
                style: "circle",
                color: color,
                size: 10,
                outline: {color: "white", width: 2},
            },
        });

        jimuMapView.view.graphics.add(graphic);
    }

    private drawPoint(lon: number, lat: number) {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const { Graphic } = this.ArcGISModules;

        const graphic = new Graphic({
            geometry: {
            type: "point",
            longitude: lon,
            latitude: lat,
            spatialReference: { wkid: 4326 },
            },
            symbol: {
            type: "simple-marker",
            style: "circle",
            color: "red",
            size: 14, // start bigger for pop effect
            outline: { color: "white", width: 2 },
            },
        });

        jimuMapView.view.graphics.add(graphic);

        // Animate shrink to normal size
        let size = 14;
        const shrink = setInterval(() => {
            size -= 1;
            graphic.symbol = {
            type: "simple-marker",
            style: "circle",
            color: "red",
            size,
            outline: { color: "white", width: 2 }
            };
            if (size <= 10) {
            clearInterval(shrink);
            }
        }, 30);
    }

    private drawCone(lon: number, lat: number, heading: number, radiusMeters = 5, spreadDeg = 60) {
        const {jimuMapView} = this.state;
        if (!jimuMapView || !this.ArcGISModules) return null;

        const {Graphic} = this.ArcGISModules;

        // Convert meters to degrees
		const metersToDegreesLat = (m: number) => m / 111320;
		const metersToDegreesLon = (m: number, lat: number) => m / (111320 * Math.cos(lat * Math.PI / 180));

		const radiusLatDeg = metersToDegreesLat(radiusMeters);
		const radiusLonDeg = metersToDegreesLon(radiusMeters, lat);
				const startAngle = heading - spreadDeg / 2;
				const endAngle = heading + spreadDeg / 2;

				const coords: [number, number][] = [];
				coords.push([lon, lat]);
		for (let angle = startAngle; angle <= endAngle; angle += 2) {
			const rad = angle * Math.PI / 180;
			coords.push([
				lon + radiusLonDeg * Math.sin(rad),
				lat + radiusLatDeg * Math.cos(rad)
			]);
		}
		coords.push([lon, lat]);

        const geometry = {
            type: 'polygon',
            rings: [coords],
            spatialReference: {wkid: 4326}
        };

        const symbol = {
            type: 'simple-fill',
            color: [255, 165, 0, 0.4],
            outline: {color: [255, 165, 0, 0.8], width: 1}
        };

        const coneGraphic: __esri.Graphic = new Graphic({geometry, symbol});
        (coneGraphic as any).__isCone = true; // Tag for cleanup
        jimuMapView.view.graphics.add(coneGraphic);
        return coneGraphic;
    }

    private clearGreenPulse() {
        if (this.currentGreenGraphic) {
            if ((this.currentGreenGraphic as any)._pulseInterval) {
                clearInterval((this.currentGreenGraphic as any)._pulseInterval);
            }
            const view = this.state.jimuMapView?.view;
            if (view) {
                view.graphics.remove(this.currentGreenGraphic);
            }
            this.currentGreenGraphic = null;
        }
    }

    // --- Haversine distance ---
    // Calculates precise distance (in meters) between two coordinates,
    // used to find nearest image to a click.
    private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371000; // Earth radius meters
        const toRad = (deg: number) => deg * Math.PI / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    // --- Main user interaction ---
    // 1) Gets clicked coordinates from map view
    // 2) Fetches nearby Mapillary sequences via Graph API
    // 3) Selects closest image
    // 4) Initializes Mapillary viewer at that image
    // 5) Draws sequence markers + active point + cone
    // 6) Displays spinner overlay during API fetch
    private async handleMapClick(event: __esri.ViewClickEvent) {
        const { jimuMapView, selectedSequenceId } = this.state;
        if (!jimuMapView) return;

            // Remove old overlays before new search
            const toRemove: __esri.Graphic[] = [];
            jimuMapView.view.graphics.forEach(g => {
                if ((g as any).__isSequenceOverlay) {
                toRemove.push(g);
                }
            });
        toRemove.forEach(g => jimuMapView.view.graphics.remove(g));

        // Step 0: Get clicked map location.
        const point = jimuMapView.view.toMap(event) as __esri.Point;
        const lon = point.longitude;
        const lat = point.latitude;

        this.setState({
            clickLon: lon,
            clickLat: lat
        });

        // Immediate visual feedback.
        this.drawClickRipple(lon, lat);

        // Show loading overlay.
        this.setState({ isLoading: true });

        try {
            if (!selectedSequenceId) {
                // -------------------------------------------------
                // FIRST CLICK – Start from scratch, fetch sequences
                // -------------------------------------------------
                const nearbySeqs = await this.getSequencesInBBox(lon, lat, this.accessToken);
                if (!nearbySeqs.length) {
                    this.showNoImageMessage();
                    return;
                }

                // Fetch full routes for each sequence found in bbox
                const fullSeqs = await Promise.all(
                    nearbySeqs.map(async (seq, idx) => {
                    const allImages = await this.getSequenceWithCoords(seq.sequenceId, this.accessToken);
                    return {
                        ...seq,
                        images: allImages,
                        _color: this.pickSequenceColor(idx)
                    };
                    })
                );

                this.setState({ availableSequences: fullSeqs }, () => {
                    this.drawSequencesOverlay();
                });

               // Pick closest image in the first sequence (full route)
                const firstSeq = fullSeqs[0];
                const closestImg = firstSeq.images.reduce((closest, img) => {
                    const dist = this.distanceMeters(img.lat, img.lon, lat, lon);
                    return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                }, null as (typeof firstSeq.images[0] & { dist: number }) | null);

                this.setState({ selectedSequenceId: firstSeq.sequenceId, lon, lat });
                this.clearNoImageMessage();
                await this.loadSequenceById(firstSeq.sequenceId, closestImg.id);

            } else {
                // ------------------------------------------------------
                // LATER CLICK – Keep current sequence or switch if far
                // ------------------------------------------------------

                // Use already loaded sequence data from state if present
                let updatedSequence = this.state.sequenceImages && this.state.sequenceImages.length
                    ? this.state.sequenceImages
                    : await this.getSequenceWithCoords(selectedSequenceId, this.accessToken);

                if (!updatedSequence.length) {
                    this.showNoImageMessage();
                    return;
                }

                // Find closest frame in this sequence to clicked point
                const closestImg = updatedSequence.reduce((closest, img) => {
                    const dist = this.distanceMeters(img.lat, img.lon, lat, lon);
                    return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                }, null as ({ id: string; lat: number; lon: number; dist: number }) | null);

                if (!closestImg) {
                    this.showNoImageMessage();
                    return;
                }
                
                // Within ≤ 5meters:
                // Uses this.state.sequenceImages from localStorage/state if available, so NO extra API call -fast and offline-friendly.
                // Calls loadSequenceById to reposition viewer to the nearest image.
                // Beyond 5 meters:
                // Calls getSequencesInBBox → new API request to discover sequences near clicked point.
                // Updates availableSequences and selectedSequenceId to the new sequence.
                // Calls loadSequenceById to load that new sequence and image.

                const DISTANCE_THRESHOLD_METERS = 5; // your chosen threshold

                // If clicked location is too far from any image in current sequence...
                if (closestImg.dist > DISTANCE_THRESHOLD_METERS) {
                    // ...search for new sequences near clicked point
                    const nearbySeqs = await this.getSequencesInBBox(lon, lat, this.accessToken);
                    if (!nearbySeqs.length) {
                    this.showNoImageMessage();
                    return;
                    }

                    // Option 2: fetch full routes for each nearby sequence
                    const fullSeqs = await Promise.all(
                    nearbySeqs.map(async (seq, idx) => {
                        const allImages = await this.getSequenceWithCoords(seq.sequenceId, this.accessToken);
                        return {
                        ...seq,
                        images: allImages,
                        _color: this.pickSequenceColor(idx)
                        };
                    })
                    );

                        this.setState({ availableSequences: fullSeqs }, () => {
                        this.drawSequencesOverlay();
                    });

                    // Pick closest in the first full sequence
                    const newSeq = fullSeqs[0];
                    const newClosest = newSeq.images.reduce((c, img) => {
                    const d = this.distanceMeters(img.lat, img.lon, lat, lon);
                    return (!c || d < c.dist) ? { ...img, dist: d } : c;
                    }, null as any);

                    this.setState({ selectedSequenceId: newSeq.sequenceId, lon, lat });
                    this.clearNoImageMessage();
                    await this.loadSequenceById(newSeq.sequenceId, newClosest.id);
                    return;
                }

                // Within threshold — stick with current sequence
                await this.loadSequenceById(selectedSequenceId, closestImg.id);
                  // Redraw overlays so polyline/full route is visible again
                this.drawSequencesOverlay();
            }
        } catch (err) {
            console.error("Error in handleMapClick:", err);
        } finally {
            // Hide spinner overlay.
            this.setState({ isLoading: false });
        }
    }

    // --- Fetch nearby sequences (single API call) ---
    // Queries Mapillary Graph API for images within ~55m bbox.
    // Groups them by sequence ID and keeps the earliest captured_at
    // date per sequence for UI dropdown display.
    private async getSequencesInBBox(lon: number, lat: number, accessToken: string) {
        const bboxSize = 0.0001; // ~10 meters
        const url = `https://graph.mapillary.com/images?fields=id,geometry,sequence,captured_at&bbox=${
            lon - bboxSize
        },${lat - bboxSize},${lon + bboxSize},${lat + bboxSize}&limit=100`;

        const response = await fetch(url, {
            headers: { Authorization: `OAuth ${accessToken}` }
        });
        const data = await response.json();
        if (!data.data?.length) return [];

        // Group images by sequence ID
        const grouped: Record<string, {
            sequenceId: string;
            images: { id: string; lon: number; lat: number; capturedAt?: string }[];
            capturedAt?: string;
        }> = {};

        for (const img of data.data) {
            const seqId = img.sequence;
            const coords = img.geometry?.coordinates;
            const capturedAt = img.captured_at;

            if (!seqId || !coords) continue;

            if (!grouped[seqId]) {
                grouped[seqId] = { sequenceId: seqId, images: [], capturedAt };
            }

            grouped[seqId].images.push({
                id: img.id,
                lon: coords[0],
                lat: coords[1],
                capturedAt
            });

            // keep the earliest capture date for this sequence
            if (!grouped[seqId].capturedAt || (capturedAt && capturedAt < grouped[seqId].capturedAt)) {
                grouped[seqId].capturedAt = capturedAt;
            }
        }

        // Return as array with capture dates
        return Object.values(grouped);
    }

    // --- Fetch full coordinate list of a sequence ---
    // Uses sequence_id → image_ids → geometry batch fetch
    // to get lat/lon for all frames in a sequence efficiently.
    private async getSequenceWithCoords(
        sequenceId: string,
        accessToken: string
    ): Promise<{ id: string; lat: number; lon: number }[]> {
        try {
            const url = `https://graph.mapillary.com/image_ids?sequence_id=${sequenceId}`;
            const response = await fetch(url, {
                headers: {Authorization: `OAuth ${accessToken}`},
            });
            const data = await response.json();
            if (!Array.isArray(data.data)) return [];

            const ids = data.data.map((d: any) => d.id);
            const coordUrl = `https://graph.mapillary.com/?ids=${ids.join(
                ","
            )}&fields=id,geometry`;
            const coordResp = await fetch(coordUrl, {
                headers: {Authorization: `OAuth ${accessToken}`},
            });
            const coordsData = await coordResp.json();

            return Object.entries(coordsData).map(([id, value]: [string, any]) => ({
                id,
                lon: value.geometry?.coordinates?.[0] || 0,
                lat: value.geometry?.coordinates?.[1] || 0,
            }));
        } catch {
            return [];
        }
    }
    
    // --- Main UI rendering logic ---
    // Contains 3 key zones:
    //   1. Map + Viewer area
    //   2. Overlay controls (sequence selector, info, legend)
    //   3. Fullscreen mode portal
    // Conditional rendering is used for:
    //   - Spinner overlay (isLoading)
    //   - Initial empty message
    //   - Sequence dropdown (availableSequences.length > 1)
    //   - Info box + legend (only when image loaded)
    render() {
        const mapWidgetId = this.props.useMapWidgetIds?.[0];

        // This is the viewer container. It will be placed either in normal widget or fullscreen portal.
        const viewerArea = (
            
            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    border: "1px solid #ccc",
                    position: "relative",
                    background: "#000"
                }}
            >
                {/* This empty div is controlled by Mapillary, React will never touch its internals */}
                <div
                    ref={this.viewerContainer}
                    style={{width: "100%", height: "100%"}}
                />

                {this.state.isLoading && (
                    <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column", // Stack spinner + text
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999
                    }}>
                        {/* Spinner Circle */}
                        <div style={{
                                border: "4px solid #f3f3f3",
                                borderTop: "4px solid #0275d8",
                                borderRadius: "50%",
                                width: "36px",
                                height: "36px",
                                animation: "spin 1s linear infinite",
                                marginBottom: "10px" // Space before text
                            }} 
                        />
                        {/* Loading Text */}
                        <div style={{
                                color: "white",
                                fontSize: "14px",
                                fontWeight: "500",
                                textAlign: "center"
                            }}>
                            Loading street imagery...
                        </div>
                        <style>{`
                            @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                    )}

                {!this.state.imageId && !this.state.isLoading && !this.state.noImageMessageVisible &&  (
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            color: "#fff",
                            fontSize: "16px",
                            background: "rgba(0,0,0,0.4)",
                            textAlign: "center",   // ensure text lines are centered
                            flexDirection: "column" // stack items vertically
                        }}
                    >
					    <span style={{fontSize: "12px", opacity: 0.9}}>
						    🛈 Click any point on the map to show imagery
					    </span>
					    <span style={{fontSize: "10px", opacity: 0.7}}>
						    (Mapillary street-level imagery will appear here)
				        </span>
                    </div>
                )}
                {this.state.noImageMessageVisible && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: "14px",
                        color: "#666",
                        background: "#f9f9f9",
                        textAlign: "center",
                        opacity: 1,
                        transition: "opacity 0.6s ease-in-out"
                    }}
                >
                    🚫 No nearby Mapillary image found at this location.
                </div>
                )}
            </div>
        );

        /**
         * NORMAL MODE BLOCK (inside widget bounds)
         */
        const normalMode = (
            <div
                className="widget-mapillary jimu-widget"
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column"
                }}
            >
                {mapWidgetId ? (
                    <JimuMapViewComponent
                        useMapWidgetId={mapWidgetId}
                        onActiveViewChange={this.onActiveViewChange}
                    />
                ) : (
                    <div style={{padding: "10px", color: "red"}}>
                        Please link a Map widget in Experience Builder settings
                    </div>
                )}

                {viewerArea}

                {/* Sequence picker overlay */}
                {this.state.availableSequences && this.state.availableSequences.length > 1 && (
                    <div style={{
                        position: "absolute",
                        top: "10px", // Below info box which is at 10px
                        left: "50px", // Hug top-right
                        background: "rgba(0,0,0,0.6)", // Semi-transparent dark
                        padding: "1px 1px 0px 2px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        zIndex: 10000,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                        color: "#fff"
                    }}>
                        <label style={{ marginRight: "2px", fontWeight: 300 }}>SeqID:</label>
                        <select
                            value={this.state.selectedSequenceId || ""}
                            onChange={async (e) => {
                                const seqId = e.target.value;

                                // Update selected sequence ID in state
                                this.setState({ selectedSequenceId: seqId });

                                // Clear old active frame pulse
                                this.clearGreenPulse();

                                // If we already have a click location, go to closest image for that point
                                const { clickLon, clickLat } = this.state;
                                if (clickLon != null && clickLat != null) {
                                const updatedSequence = await this.getSequenceWithCoords(seqId, this.accessToken);
                                    if (updatedSequence.length) {
                                            const closestImg = updatedSequence.reduce((closest, img) => {
                                            const dist = this.distanceMeters(img.lat, img.lon, clickLat, clickLon);
                                            return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                                        }, null as any);

                                        if (closestImg) {
                                            // This will handle viewer setup and drawing
                                            await this.loadSequenceById(seqId, closestImg.id);
                                        }
                                    }
                                }
                            }}
                            style={{ 
                                borderRadius:"10px",
                                background: "rgba(255,255,255,0.9)"
                             }}
                            >
                            {this.state.availableSequences.map((seq, idx) => {
                                const cssColor = Array.isArray(seq._color)
                                ? `rgba(${seq._color[0]}, ${seq._color[1]}, ${seq._color[2]}, ${seq._color[3] ?? 1})`
                                : seq._color;

                                const date = seq.capturedAt
                                ? new Date(seq.capturedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                : "Unknown date";

                                return (
                                <option
                                    key={seq.sequenceId}
                                    value={seq.sequenceId}
                                    style={{ backgroundColor: cssColor }}
                                    >
                                    {idx + 1}. {seq.sequenceId.slice(0, 3)}... ({seq.images.length} nearby) — {date}
                                </option>
                                );
                            })}
                        </select>
                    </div>
                )}

                {/* Legend — only show if user clicked & image loaded */}
                {this.state.imageId && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: "12px",
                            left: "12px",
                            background: "rgba(255,255,255,0.3)",
                            padding: "6px 10px",
                            borderRadius: "4px",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                            fontSize: "10px",
                        }}
                    >
                        <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
					  <span style={{
						  display: "inline-block", width: "12px", height: "12px",
						  borderRadius: "50%", backgroundColor: "red", marginRight: "6px",
						  border: "1px solid #ccc"
					  }}></span>
											Clicked location
										</div>
										<div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
					  <span style={{
						  display: "inline-block", width: "12px", height: "12px",
						  borderRadius: "50%", backgroundColor: "green", marginRight: "6px",
						  border: "1px solid #ccc"
					  }}></span>
											Active frame
										</div>
										<div style={{display: "flex", alignItems: "center", marginBottom: "8px"}}>
					  <span style={{
						  display: "inline-block", width: "12px", height: "12px",
						  borderRadius: "50%", backgroundColor: "blue", marginRight: "6px",
						  border: "1px solid #ccc"
					  }}></span>
                            Active sequence images
                        </div>

                        {/* Cache Clear Button */}
                        <button
                            onClick={() => {
                                localStorage.removeItem("mapillary_sequence_cache");
                                // Clear all bearings (scan keys or use a prefixed clear)
                                Object.keys(localStorage).forEach(key => {
                                    if (key.startsWith("mapillary_bearing_")) {
                                        localStorage.removeItem(key);
                                    }
                                });
                                window.location.reload();
                            }}
                            style={{
                                background: "#d9534f",
                                color: "#fff",
                                borderRadius: "3px",
                                cursor: "pointer"
                            }}
                        >
                            Clear Sequence Cache
                        </button>
                    </div>
                )}

                {/* Info box */}
                <div
                    style={{
                        padding: "4px",
                        fontSize: "9px",
                        color: "white",
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "rgba(2, 117, 216, 0.7)",
                        borderRadius: "4px",
						maxWidth: "200px" 
                    }}
                >
                    {this.state.imageId && <>Image ID: {this.state.imageId}<br/></>}
                    {this.state.sequenceId && <>Sequence ID: {this.state.sequenceId}<br/></>}
					 {this.state.address && <>📍 {this.state.address}</>}
                </div>

                {/* Unified control buttons container */}
                <div
                    style={{
                        position: 'absolute',
                        top: '2px',
                        left: '2px',
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        padding: '4px',
                        borderRadius: '8px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                    }}
                >
                    {[
                        { emoji: '🗖', onClick: this.toggleFullscreen, title: 'Maximize/Fullscreen', bg: 'rgba(2, 117, 216, 0.9)', active: this.state.isFullscreen },
                        { emoji: '🗺️', onClick: this.toggleMapillaryTiles, title: 'Toggle Mapillary Layer', bg: 'rgba(53, 175, 109, 0.9)', active: this.state.tilesActive },
                        { emoji: '🚦', onClick: this.toggleMapillaryTrafficSigns, title: 'Toggle Traffic Signs Coverage Layer', bg: 'rgba(255, 0, 0, 0.9)', active: this.state.trafficSignsActive },
                        { emoji: '📍', onClick: this.toggleMapillaryObjects, title: 'Toggle Mapillary Objects Layer', bg: 'rgba(255, 165, 0, 0.9)', active: this.state.objectsActive }
                    ].map((btn, i) => (
                        <button
                            key={i}
                            title={btn.title}
                            onClick={btn.onClick}
                            style={{
                                background: btn.active ? btn.bg : btn.bg.replace('0.9', '0.5'), // dim background if inactive
                                color: '#fff',
                                width: '25px',
                                height: '25px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: btn.active
                                    ? '0 0 6px rgba(255,255,255,0.8)' // glow when active
                                    : '0 2px 4px rgba(0,0,0,0.3)',
                                transform: btn.active ? 'scale(1.1)' : 'scale(1)',
                                transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                            onMouseLeave={e => e.currentTarget.style.transform = btn.active ? 'scale(1.1)' : 'scale(1)'}
                        >
                            {btn.emoji}
                        </button>
                    ))}
                </div>
            </div>
        );

        /**
         * FULLSCREEN MODE BLOCK (portal to body)
         */
        const fullscreenMode = ReactDOM.createPortal(
            <div
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column"
                }}
            >
                {viewerArea}
                <button
                    onClick={this.toggleFullscreen}
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        zIndex: 10000,
                        background: '#d9534f',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    🗕
                </button>
            </div>,
            document.body
        );

        /** Return either normal or fullscreen layout */
        return this.state.isFullscreen ? fullscreenMode : normalMode;
    }