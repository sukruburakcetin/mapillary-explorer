/** @jsx jsx */
import {React, AllWidgetProps, jsx} from "jimu-core";
import {JimuMapViewComponent, JimuMapView} from "jimu-arcgis";
import ReactDOM from "react-dom";
import * as webMercatorUtils from "esri/geometry/support/webMercatorUtils";
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
const {loadArcGISJSAPIModules} = require("jimu-arcgis");
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { objectNameMap } from "../helpers/mapillaryObjectNameMap";
import { legendCircleStyle, legendRowStyle, mobileOverrideStyles} from "../helpers/styles";

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
    sequenceOffset?: number;
    turboModeActive?: boolean;
    turboLoading?: boolean;
    turboFilterStartDate?: string; // ISO yyyy-mm-dd
    turboFilterEndDate?: string;   // ISO yyyy-mm-dd
    turboFilterIsPano?: boolean; // true = only panoramas, false = only non-panos, undefined/empty = no filter
    turboColorByDate?: boolean;
    turboYearLegend?: { year: string, color: string }[];
    zoomWarningMessage?: string;
    trafficSignsFilterValue: { value: "All traffic signs", label: "All traffic signs", iconUrl: null },
    objectsFilterValue: { value: "All points", label: "All points", iconUrl: null },
    filtersLoaded: boolean;
    showIntro: boolean;
    minimapView?: __esri.MapView;
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
    private mapClickHandle: IHandle | null = null;
    private pointerMoveHandle: IHandle | null = null;
    private turboCoverageLayer: __esri.FeatureLayer;
    private turboSequenceLayer: __esri.FeatureLayer | null = null; 
    private turboStationaryHandle: IHandle | null = null;
    private tooltipDiv: HTMLDivElement | null = null;
    private debouncedTurboFilter: () => void;
    private clickedLocationGraphic: __esri.Graphic | null = null;
    private sequenceCoordsCache: Record<string, {id: string, lat: number, lon: number}[]> = {};
    private _lastBearing: number = 0; 
    viewerContainer = React.createRef<HTMLDivElement>();
    minimapContainer = React.createRef<HTMLDivElement>(); // Add this
    private minimapView: __esri.MapView | null = null;
    private minimapGraphicsLayer: __esri.GraphicsLayer | null = null;
    private minimapWatchHandle: __esri.WatchHandle | null = null;
    private _hoverTimeout: any = null;
    private _zoomWarningTimeout: any = null;
    private _currentHoveredFeatureId: string | null = null;

    /**
        * Human‑readable names for Mapillary object classification codes.
        * Mapillary returns raw object `value` codes such as `"object--bench"` or `"marking--discrete--stop-line"`.
        * These codes are hierarchical (double‑dash separated) and not user‑friendly for display.
        * This lookup table maps each known Mapillary object classification code to a
        * descriptive, human‑readable label for use in the UI, popups, and legends.
        * Notes:
        * - Keys match `value` properties returned by Mapillary's vector tile/object API.
        * - Values are short descriptive labels optimized for end‑users.
        * - Any `value` not found here will fall back to displaying the raw code, unless further formatting is applied.
        * This is used in {@link loadMapillaryObjectsFromTilesBBox} to set the `name` attribute
        * for each object feature before creating the ArcGIS FeatureLayer.
    */
    private objectNameMap = objectNameMap;

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
        objectsActive: false,
        sequenceOffset: 0,
        turboLoading: false,
        turboFilterUsername: "",
        turboFilterStartDate: "",
        turboFilterEndDate: "",
        turboFilterIsPano: undefined,   // null means no filter, otherwise boolean
        showTurboFilterBox: false,
        turboYearLegend: [],
        showTrafficSignsFilterBox: false,
        trafficSignsFilterValue: { value: "All traffic signs", label: "All traffic signs", iconUrl: null },
        trafficSignsOptions: [],
        showObjectsFilterBox: false,
        objectsFilterValue: { value: "All points", label: "All points", iconUrl: null },
        objectsOptions: [],
        filtersLoaded: false,
        showIntro: true
    };

    constructor(props: AllWidgetProps<any>) {
        super(props);
		
		// Read accessToken from manifest.json properties - you should use your own token start with MLY
		this.accessToken = props.manifest?.properties?.mapillaryAccessToken || "";
		// console.log("Loaded Access Token:", this.accessToken);
        
        // Wrap the layer reload logic in debounce (700ms delay after typing stops)
        this.debouncedTurboFilter = this.debounce(async () => {
        if (this.state.jimuMapView && this.state.turboModeActive) {
                await this.enableTurboCoverageLayer();
            }
        }, 700);

        this.onActiveViewChange = this.onActiveViewChange.bind(this);
        this.handleMapClick = this.handleMapClick.bind(this);
    }

    // --- NEW HELPER METHOD ---
    // Binds events (cone drawing, zoom, image changes) to the current viewer instance.
    private bindMapillaryEvents() {
        if (!this.mapillaryViewer) return;

        // Clear any existing green pulse before binding new events
        this.clearGreenPulse();
        
        // Also clear any existing cone graphics
        if (this.currentConeGraphic && this.state.jimuMapView?.view) {
            this.state.jimuMapView.view.graphics.remove(this.currentConeGraphic);
            this.currentConeGraphic = null;
        }

        // Define local redraw helper - pass specific coordinates
        const redrawCone = async (lon?: number, lat?: number) => {
            const view = this.state.jimuMapView?.view;
            if (!view) return;

            // If no coordinates provided, get from current image
            if (lon === undefined || lat === undefined) {
                const currentId = this.state.imageId;
                if (!currentId) return;
                const img = this.state.sequenceImages.find(s => s.id === currentId);
                if (!img) return;
                lon = img.lon;
                lat = img.lat;
            }

            // Get bearing from viewer or fallback
            let bearing = this._lastBearing || 0;
            try {
                const b = await this.mapillaryViewer.getBearing();
                if (typeof b === 'number') {
                    bearing = b;
                    this._lastBearing = bearing;
                }
            } catch (e) { /* ignore */ }

            const length = this.coneLengths[this.zoomStepIndex];
            const spread = this.coneSpreads[this.zoomStepIndex];

            // Remove old cone
            if (this.currentConeGraphic) {
                view.graphics.remove(this.currentConeGraphic);
            }
            // Draw new cone at specified coordinates
            this.currentConeGraphic = this.drawCone(lon, lat, bearing, length, spread);
        };

        // 1. Viewer Load Event
        this.mapillaryViewer.on("load", () => {
            // Zoom component logic
            const zoomComponent: any = this.mapillaryViewer.getComponent("zoom");
            if (zoomComponent && zoomComponent._zoomDelta$) {
                zoomComponent._zoomDelta$.subscribe((delta: number) => {
                    if (delta > 0 && this.zoomStepIndex < this.coneSpreads.length - 1) {
                        this.zoomStepIndex++;
                    } else if (delta < 0 && this.zoomStepIndex > 0) {
                        this.zoomStepIndex--;
                    }
                    redrawCone();
                });
            }

            // Disable Keyboard Zoom
            const keyboardComponent: any = this.mapillaryViewer.getComponent("keyboard");
            if (keyboardComponent?.keyZoom) {
                keyboardComponent.keyZoom.disable();
            }

            // Custom Wheel Logic
            if (this.viewerContainer.current) {
                this.viewerContainer.current.onwheel = (evt: WheelEvent) => {
                    evt.preventDefault();
                    if (evt.deltaY < 0) {
                        this.zoomStepIndex = Math.min(this.zoomStepIndex + 1, this.coneSpreads.length - 1);
                    } else {
                        this.zoomStepIndex = Math.max(this.zoomStepIndex - 1, 0);
                    }
                    redrawCone();
                };
            }
            
            // Set initial bearing and draw cone
            this.mapillaryViewer.getBearing().then((b: number) => {
                if (typeof b === 'number') {
                    this._lastBearing = b;
                    redrawCone();
                }
            }).catch(() => {
                redrawCone();
            });
        });

        // 2. Bearing Change Event
        this.mapillaryViewer.on("bearing", (event: any) => {
            this._lastBearing = event.bearing;
            redrawCone();
            // Update minimap tracking to show new bearing
            this.updateMinimapTracking();
        });

        // 3. Image Change Event
        this.mapillaryViewer.on("image", async (event: any) => {
            const newId = event.image.id;
            const newImg = this.state.sequenceImages.find(s => s.id === newId);
            if (!newImg) return;
            const view = this.state.jimuMapView?.view;
            if (!view) return;

            // Turn previous active into static blue point ONLY if it's different
            if (this.state.imageId && this.state.imageId !== newId) {
                const prevImg = this.state.sequenceImages.find(s => s.id === this.state.imageId);
                if (prevImg) {
                    this.clearGreenPulse();
                    this.drawPointWithoutRemoving(prevImg.lon, prevImg.lat, [0, 0, 255, 1]);
                }
            }

            // Update active imageId BEFORE drawing new graphics
            this.setState({ imageId: newId }, () => {
                // Clear any existing green pulse
                this.clearGreenPulse();

                // Draw new green pulsing point at NEW location
                this.currentGreenGraphic = this.drawPulsingPoint(newImg.lon, newImg.lat, [0, 255, 0, 1]);

                // Get bearing and draw cone at NEW location
                this.mapillaryViewer.getBearing().then((b: number) => {
                    if (typeof b === 'number') {
                        this._lastBearing = b;
                    }
                    // Draw cone at the NEW image location
                    redrawCone(newImg.lon, newImg.lat);
                }).catch(() => {
                    // Draw cone even if bearing fetch fails
                    redrawCone(newImg.lon, newImg.lat);
                });
            });

            // Reverse geocode
            this.fetchReverseGeocode(newImg.lat, newImg.lon);
            // Update minimap tracking
            this.updateMinimapTracking();
        });
    }

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

    /*
        * Returns a consistent but visually distinct color for a sequence index.
        * Repeats the base palette cyclically, darkening subsequent cycles by 10% 
        * to hint repeated usage without losing sequence distinction.
        * @param index Sequence order index from availableSequences array (used for both polyline and dropdown background).
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
        * This method is called after state.availableSequences is updated,
        * ensuring users always see the entire route for selected/available sequences.
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

            // Draw multi-vertex route as polyline
            if (paths.length > 1) {
                const polylineGraphic = new Graphic({
                    geometry: { type: "polyline", paths, spatialReference: { wkid: 4326 } },
                    symbol: { type: "simple-line", color, width: 2 },
                    attributes: { sequenceId: seq.sequenceId }
                });
                (polylineGraphic as any).__isSequenceOverlay = true;
                jimuMapView.view.graphics.add(polylineGraphic);
            }

            // Draw a **point for every image** in this sequence
            seq.images.forEach(img => {
                const pointGraphic = new Graphic({
                    geometry: { 
                        type: "point", 
                        longitude: img.lon, 
                        latitude: img.lat, 
                        spatialReference: { wkid: 4326 }
                    },
                    symbol: { 
                        type: "simple-marker", 
                        color: color,     // use sequence color
                        size: "10px", 
                        outline: { color: "white", width: 1 } 
                    },
                    attributes: { sequenceId: seq.sequenceId }
                });
                (pointGraphic as any).__isSequenceOverlay = true;
                jimuMapView.view.graphics.add(pointGraphic);
            });

            // Draw sequence number label at first image location
            const firstImg = seq.images[0];
            const labelGraphic = new Graphic({
                geometry: { 
                    type: "point", 
                    longitude: firstImg.lon, 
                    latitude: firstImg.lat 
                },
                symbol: {
                    type: "text",
                    text: String(idx + 1),
                    color: color,
                    haloColor: "white",
                    haloSize: 2,
                    font: { size: 14, weight: "bold" }
                },
                attributes: { sequenceId: seq.sequenceId }
            });
            (labelGraphic as any).__isSequenceOverlay = true;
            jimuMapView.view.graphics.add(labelGraphic);
        });
    }

    /** 
        * Removes all sequence overlay and cone graphics from the map, 
        * and clears the active pulsing point. 
    */
    private clearSequenceGraphics() {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        const { view } = jimuMapView;

        const toRemove: __esri.Graphic[] = [];
        view.graphics.forEach(g => {
            if ((g as any).__isSequenceOverlay || (g as any).__isCone) {
            toRemove.push(g);
            }
        });
        toRemove.forEach(g => view.graphics.remove(g));

        // Also remove green pulsing active point
        this.clearGreenPulse();
    }

    /** 
        * Removes cone graphics and point markers for the given sequence ID 
        * (keeps polylines/text), and clears the pulsing point. 
    */
    private clearActiveSequenceGraphics(sequenceId: string) {
        const { jimuMapView, availableSequences } = this.state;
        if (!jimuMapView) return;
        const { view } = jimuMapView;

        // Remove cones & blue active sequence markers
        const toRemove: __esri.Graphic[] = [];
        view.graphics.forEach(g => {
            if ((g as any).__isCone) {
                toRemove.push(g);
            }
            if ((g as any).__isSequenceOverlay && g.attributes?.sequenceId === sequenceId) {
                if (g.geometry.type !== "polyline" && g.symbol?.type !== "text") {
                    toRemove.push(g);
                }
            }
        });
        toRemove.forEach(g => view.graphics.remove(g));

        if (this.clickedLocationGraphic) {
            this.state.jimuMapView?.view.graphics.remove(this.clickedLocationGraphic);
            this.clickedLocationGraphic = null;
        }

        // Restore original colored markers for that sequence
        const seq = availableSequences?.find(s => s.sequenceId === sequenceId);
        if (seq) {
            const color = seq._color || this.pickSequenceColor(availableSequences.indexOf(seq));
            seq.images.forEach(img => {
                const pointGraphic = new this.ArcGISModules.Graphic({
                    geometry: { 
                        type: "point", 
                        longitude: img.lon, 
                        latitude: img.lat, 
                        spatialReference: { wkid: 4326 }
                    },
                    symbol: { 
                        type: "simple-marker", 
                        color: color,
                        size: "10px", 
                        outline: { color: "white", width: 1 } 
                    },
                    attributes: { sequenceId: seq.sequenceId }
                });
                (pointGraphic as any).__isSequenceOverlay = true;
                view.graphics.add(pointGraphic);
            });
        }

        // Clear pulsing green point
        this.clearGreenPulse();
    }

    /** 
        * Clears all sequence graphics and resets related state values. 
    */
    private clearSequenceUI() {
        this.clearSequenceGraphics();
        this.setState({
            availableSequences: [],
            selectedSequenceId: null,
            clickLon: null,
            clickLat: null
        });
    }
    /**
        * Clears the locally saved Mapillary sequence cache and resets the widget UI
        * so there is no active sequence or markers remaining.
        *
        * Triggered by the "Clear Sequence Cache" button in the legend UI.
        * - Removes cache from localStorage
        * - Stops & removes the pulsing green active image marker
        * - Removes clicked location red marker
        * - Clears all map graphics
        * - Resets relevant widget state
    */
    private clearSequenceCache = () => {
        try {
            localStorage.removeItem("mapillary_sequence_cache");
            console.log("Sequence cache cleared from localStorage");

            // Stop and remove green pulsing marker
            this.clearGreenPulse();

            // Remove red clicked location marker
            if (this.clickedLocationGraphic && this.state.jimuMapView) {
                this.state.jimuMapView.view.graphics.remove(this.clickedLocationGraphic);
                this.clickedLocationGraphic = null;
            }

            // Clear all map graphics
            if (this.state.jimuMapView) {
                this.state.jimuMapView.view.graphics.removeAll();
            }

            // Destroy the Mapillary viewer completely
            if (this.mapillaryViewer) {
                try {
                    this.mapillaryViewer.remove();
                } catch (err) {
                    console.warn("Failed to remove Mapillary viewer", err);
                }
                this.mapillaryViewer = null;
            }

            // Reset widget state so UI fully refreshes
            this.setState({
                availableSequences: [],
                selectedSequenceId: null,
                sequenceId: null,
                sequenceImages: [],
                imageId: null,
                clickLon: null,
                clickLat: null,
                address: null,
                isLoading: false
            });

        } catch (err) {
            console.warn("Failed to clear sequence cache", err);
        }
    };

    // --- Clean up everything when widget closes or reloads ---
    // Stops animation intervals, removes all map graphics,
    // destroys Mapillary viewer instance, clears DOM container,
    // and resets internal state if requested.
	private cleanupWidgetEnvironment(resetState: boolean = false, fullRemove: boolean = true) {
        // ... (Keep existing green pulse cleanup) ...
		if (this.currentGreenGraphic && (this.currentGreenGraphic as any)._pulseInterval) {
			clearInterval((this.currentGreenGraphic as any)._pulseInterval);
			this.currentGreenGraphic = null;
		}

        // ... (Keep graphics cleanup) ...
        if (fullRemove && this.state.jimuMapView) {
            const { view } = this.state.jimuMapView;
            view.graphics.removeAll();
        }

        if (fullRemove) {
            // ... (Keep listener removals) ...
            if (this.mapClickHandle) { this.mapClickHandle.remove(); this.mapClickHandle = null; }
            if (this.pointerMoveHandle) { this.pointerMoveHandle.remove(); this.pointerMoveHandle = null; }

            this._cancelObjectsFetch = true;
            this._cancelTrafficSignsFetch = true;
            
            // ... (Keep watcher removals) ...
            if (this.trafficSignsStationaryHandle) { this.trafficSignsStationaryHandle.remove(); this.trafficSignsStationaryHandle = null; }
            if (this.trafficSignsZoomHandle) { this.trafficSignsZoomHandle.remove(); this.trafficSignsZoomHandle = null; }
            if (this.objectsStationaryHandle) { this.objectsStationaryHandle.remove(); this.objectsStationaryHandle = null; }
            if (this.objectsZoomHandle) { this.objectsZoomHandle.remove(); this.objectsZoomHandle = null; }

            this.setState({
                trafficSignsActive: false,
                objectsActive: false,
                tilesActive: false,
            });
        }

        if (this.state.jimuMapView && fullRemove) {
            const { view } = this.state.jimuMapView;

            // === ROBUST REMOVAL BY ID ===
            const layersToRemoveById = [
                "mapillary-vector-tiles",       // General Tiles
                "mapillary-traffic-signs-vt",   // Traffic Signs Coverage
                "mapillary-traffic-signs-fl",   // Traffic Signs Popup Points
                "mapillary-objects-vt",         // Objects Coverage
                "mapillary-objects-fl",         // Objects Popup Points
                "turboCoverage",                // Turbo Points
                "turboSequence"                 // Turbo Lines
            ];

            layersToRemoveById.forEach(id => {
                const layer = view.map.findLayerById(id);
                if (layer) {
                    view.map.remove(layer);
                    console.log(`Removed layer by ID: ${id}`);
                }
            });

            // Nullify References
            this.mapillaryVTLayer = null;
            this.mapillaryTrafficSignsLayer = null;
            this.mapillaryTrafficSignsFeatureLayer = null;
            this.mapillaryObjectsLayer = null;
            this.mapillaryObjectsFeatureLayer = null;
            this.turboCoverageLayer = null;
            this.turboSequenceLayer = null;
            this.turboCoverageLayerView = null;
            
            // Fallback sweep (optional, but good for safety)
            view.map.layers.forEach(layer => {
                if (
                    layer.type === "feature" &&
                    (layer as any).fields?.some((f: any) => f.name === "value") &&
                    (layer as any).fields?.some((f: any) => f.name === "name")
                ) {
                    view.map.remove(layer);
                }
            });
            
            this.setState({ turboModeActive: false });
        }

        // ... (Keep viewer destruction and rest of the method) ...
		if (this.mapillaryViewer) {
			try { this.mapillaryViewer.remove(); } catch (err) {}
			this.mapillaryViewer = null;
		}
		if (this.viewerContainer.current) {
			this.viewerContainer.current.innerHTML = '';
		}

        if (resetState) {
            // ... (Keep state reset logic) ...
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
                objectsActive: false,
                availableSequences: [],
                selectedSequenceId: null,
                noImageMessageVisible: false,
                turboModeActive: false,
                turboFilterUsername: "",
                turboFilterStartDate: "",
                turboFilterEndDate: "",
                turboFilterIsPano: undefined,
                showTurboFilterBox: false
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
    }

    /*
        * Initializes the minimap view within the fullscreen portal.
        * It replicates the main map's basemap and specific Vector Tile layers (safely re-creating them to avoid cloning errors),
        * and binds click events to allow users to jump to different frames within the sequence.
    */
    private async createMinimap() {
        if (!this.minimapContainer.current || !this.state.jimuMapView || !this.ArcGISModules) return;
        
        this.destroyMinimap();

        try {
            // 1. Load 'esri/Basemap' in addition to others
            const [MapView, Map, GraphicsLayer, Basemap] = await loadArcGISJSAPIModules([
                "esri/views/MapView",
                "esri/Map",
                "esri/layers/GraphicsLayer",
                "esri/Basemap" 
            ]);
            
            const { VectorTileLayer } = this.ArcGISModules; 

            this.minimapGraphicsLayer = new GraphicsLayer({
                id: "minimap-tracking"
            });

            // --- 2. Advanced Basemap Duplication Strategy ---
            let basemapConfig: any = "topo-vector"; // Fallback

            try {
                const mainBasemap = this.state.jimuMapView.view.map.basemap;
                if (mainBasemap) {
                    const standardIds = [
                        "satellite", "hybrid", "oceans", "osm", "terrain",
                        "dark-gray", "dark-gray-vector", "gray", "gray-vector",
                        "streets", "streets-vector", "streets-night-vector",
                        "streets-relief-vector", "streets-navigation-vector",
                        "topo", "topo-vector"
                    ];

                    if (mainBasemap.id && standardIds.includes(mainBasemap.id)) {
                        // A. Simple String ID (Fastest)
                        basemapConfig = mainBasemap.id;
                    } else {
                        // B. Custom Basemap: JSON Serialization (Safe Deep Copy)
                        // Using .clone() shares resources and breaks the main map on destroy.
                        // Using .toJSON() -> .fromJSON() forces a completely new, independent instance.
                        try {
                            const basemapJson = mainBasemap.toJSON();
                            // Rehydrate a new Basemap instance from the JSON definition
                            basemapConfig = Basemap.fromJSON(basemapJson);
                        } catch (jsonErr) {
                            console.warn("Failed to serialize custom basemap via JSON, falling back to clone (risky) or default.", jsonErr);
                            // Last resort fallback if JSON fails
                            basemapConfig = mainBasemap.clone(); 
                        }
                    }
                }
            } catch (err) {
                console.warn("Could not determine basemap, using default");
            }

            // Create minimap map instance
            const minimap = new Map({
                basemap: basemapConfig,
                layers: [this.minimapGraphicsLayer]
            });

            // ... (Rest of the function remains exactly the same as previous steps) ...
            
            // Determine initial center
            let initialCenter = this.state.jimuMapView.view.center;
            if (this.state.imageId && this.state.sequenceImages.length > 0) {
                const currentImg = this.state.sequenceImages.find(img => img.id === this.state.imageId);
                if (currentImg) {
                    initialCenter = [currentImg.lon, currentImg.lat];
                }
            }

            this.minimapView = new MapView({
                container: this.minimapContainer.current,
                map: minimap,
                center: initialCenter,
                zoom: this.state.jimuMapView.view.zoom - 3,
                ui: { components: [] },
                constraints: { rotationEnabled: true, snapToZoom: true, minZoom: 0, maxZoom: 20 },
                navigation: { mouseWheelZoomEnabled: true, browserTouchPanEnabled: true }
            });

            await this.minimapView.when();

            // --- Safe Layer Transfer (Same as before) ---
            const layersToAdd: __esri.Layer[] = [];
            const mainLayers = this.state.jimuMapView.view.map.layers;
            const isLayerActive = (layer: any) => layer && mainLayers.includes(layer);

            // A. Mapillary VT
            if (isLayerActive(this.mapillaryVTLayer)) {
                try {
                    const styleCopy = JSON.parse(JSON.stringify(this.mapillaryVTLayer.style));
                    layersToAdd.push(new VectorTileLayer({ style: styleCopy, opacity: 0.6 }));
                } catch(e) {}
            }
            // B. Traffic Signs
            if (isLayerActive(this.mapillaryTrafficSignsLayer)) {
                try {
                    const styleCopy = JSON.parse(JSON.stringify(this.mapillaryTrafficSignsLayer.style));
                    layersToAdd.push(new VectorTileLayer({ style: styleCopy, opacity: 0.6 }));
                } catch(e) {}
            }
            // C. Objects
            if (isLayerActive(this.mapillaryObjectsLayer)) {
                try {
                    const styleCopy = JSON.parse(JSON.stringify(this.mapillaryObjectsLayer.style));
                    layersToAdd.push(new VectorTileLayer({ style: styleCopy, opacity: 0.6 }));
                } catch(e) {}
            }

            minimap.addMany(layersToAdd);
            this.updateMinimapTracking();

            this.minimapView.on("click", async (evt) => {
                if (!this.state.sequenceImages || this.state.sequenceImages.length === 0) return;
                const hit = await this.minimapView!.hitTest(evt);
                const trackingHit = hit.results.find(r => r.layer === this.minimapGraphicsLayer);

                if (trackingHit) {
                    const clickPoint = evt.mapPoint;
                    let closestImg = null;
                    let minDist = Infinity;
                    this.state.sequenceImages.forEach(img => {
                        const dist = this.distanceMeters(img.lat, img.lon, clickPoint.latitude, clickPoint.longitude);
                        if (dist < minDist) {
                            minDist = dist;
                            closestImg = img;
                        }
                    });
                    if (closestImg && closestImg.id !== this.state.imageId) {
                        await this.loadSequenceById(this.state.sequenceId!, closestImg.id);
                    }
                }
            });

            this.setState({ minimapView: this.minimapView });
        } catch (err) {
            console.error("Error creating minimap:", err);
            this.destroyMinimap();
        }
    }

    /*
        * Fully disposes of the minimap view, map instance, and associated graphics layers.
        * This ensures WebGL contexts are released and prevents memory leaks when the user exits fullscreen mode.
    */
    private destroyMinimap() {
        console.log("Destroying minimap...");
        
        // Remove watch handle first
        if (this.minimapWatchHandle) {
            try {
                this.minimapWatchHandle.remove();
            } catch (err) {
                console.warn("Error removing minimap watch handle:", err);
            }
            this.minimapWatchHandle = null;
        }

        // Clear and destroy graphics layer
        if (this.minimapGraphicsLayer) {
            try {
                this.minimapGraphicsLayer.removeAll();
                this.minimapGraphicsLayer.destroy();
            } catch (err) {
                console.warn("Error destroying minimap graphics layer:", err);
            }
            this.minimapGraphicsLayer = null;
        }

        // Destroy the minimap's map object first
        if (this.minimapView && this.minimapView.map) {
            try {
                // Remove all layers from the minimap
                this.minimapView.map.layers.removeAll();
                // Destroy the map
                this.minimapView.map.destroy();
            } catch (err) {
                console.warn("Error destroying minimap map:", err);
            }
        }

        // Destroy the view
        if (this.minimapView) {
            try {
                // Set container to null first
                this.minimapView.container = null;
                // Then destroy the view
                this.minimapView.destroy();
            } catch (err) {
                console.warn("Error destroying minimap view:", err);
            }
            this.minimapView = null;
        }

        // Clear the container HTML
        if (this.minimapContainer.current) {
            this.minimapContainer.current.innerHTML = '';
        }

        this.setState({ minimapView: null });
        console.log("Minimap destroyed");
    }

    /*
        * Synchronizes the minimap with the active Mapillary image.
        * It centers the view on the current coordinates and redraws tracking graphics: 
        * a pulsing location dot, a camera direction cone, and the sequence polyline.
    */
    private updateMinimapTracking() {
        if (!this.minimapGraphicsLayer || !this.state.imageId || !this.ArcGISModules || !this.minimapView) return;

        const currentImg = this.state.sequenceImages.find(img => img.id === this.state.imageId);
        if (!currentImg) return;

        const { Graphic } = this.ArcGISModules;

        // Clear previous tracking graphics
        this.minimapGraphicsLayer.removeAll();

        // Center the minimap on the current frame
        this.minimapView.goTo({
            center: [currentImg.lon, currentImg.lat],
            zoom: this.minimapView.zoom // Keep current zoom level
        }, { animate: false });

        // Add pulsing tracking dot
        const trackingDot = new Graphic({
            geometry: {
                type: "point",
                longitude: currentImg.lon,
                latitude: currentImg.lat,
                spatialReference: { wkid: 4326 }
            },
            symbol: {
                type: "simple-marker",
                color: [255, 0, 0, 1],
                size: 12,
                outline: {
                    color: [255, 255, 255],
                    width: 2
                }
            }
        });

        this.minimapGraphicsLayer.add(trackingDot);

        // Add direction cone on minimap
        if (this._lastBearing !== undefined) {
            const coneMini = new Graphic({
                geometry: this.createConeGeometry(currentImg.lon, currentImg.lat, this._lastBearing, 50, 60),
                symbol: {
                    type: "simple-fill",
                    color: [255, 165, 0, 0.6],
                    outline: {
                        color: [255, 165, 0, 1],
                        width: 1
                    }
                }
            });
            this.minimapGraphicsLayer.add(coneMini);
        }

        // Optionally, add the sequence polyline
        if (this.state.sequenceImages.length > 1) {
            const paths = this.state.sequenceImages.map(img => [img.lon, img.lat]);
            const sequenceLine = new Graphic({
                geometry: {
                    type: "polyline",
                    paths: [paths],
                    spatialReference: { wkid: 4326 }
                },
                symbol: {
                    type: "simple-line",
                    color: [0, 0, 255, 0.8],
                    width: 2
                }
            });
            this.minimapGraphicsLayer.add(sequenceLine);
        }
    }

    // Helper method to create cone geometry
    private createConeGeometry(lon: number, lat: number, heading: number, radiusMeters: number, spreadDeg: number) {
        const metersToDegreesLat = (m: number) => m / 111320;
        const metersToDegreesLon = (m: number, lat: number) => m / (111320 * Math.cos(lat * Math.PI / 180));

        const radiusLatDeg = metersToDegreesLat(radiusMeters);
        const radiusLonDeg = metersToDegreesLon(radiusMeters, lat);
        const startAngle = heading - spreadDeg / 2;
        const endAngle = heading + spreadDeg / 2;

        const coords: [number, number][] = [];
        coords.push([lon, lat]);
        
        for (let angle = startAngle; angle <= endAngle; angle += 5) {
            const rad = angle * Math.PI / 180;
            coords.push([
                lon + radiusLonDeg * Math.sin(rad),
                lat + radiusLatDeg * Math.cos(rad)
            ]);
        }
        coords.push([lon, lat]);

        return {
            type: 'polygon',
            rings: [coords],
            spatialReference: { wkid: 4326 }
        };
    }

    // --- Toggle between embedded and fullscreen modes ---
    // Destroys/recreates Mapillary viewer in the appropriate container
    // because Mapillary viewer must rebind its WebGL canvas context.
    private toggleFullscreen = async () => {
        const goingFullscreen = !this.state.isFullscreen;
        
        // Store the current state
        let currentBearing = this._lastBearing || 0;
        let currentImageId = this.state.imageId;
        let currentImageCoords: { lon: number; lat: number } | null = null;
        
        if (currentImageId) {
            const img = this.state.sequenceImages.find(s => s.id === currentImageId);
            if (img) {
                currentImageCoords = { lon: img.lon, lat: img.lat };
            }
        }

        // Clear graphics before state change
        this.clearGreenPulse();
        if (this.currentConeGraphic && this.state.jimuMapView?.view) {
            this.state.jimuMapView.view.graphics.remove(this.currentConeGraphic);
            this.currentConeGraphic = null;
        }

        // Destroy minimap when exiting fullscreen
        if (!goingFullscreen && this.minimapView) {
            this.destroyMinimap();
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Destroy current viewer
        if (this.mapillaryViewer) {
            try {
                await this.mapillaryViewer.getBearing().then((b: number) => {
                    if (typeof b === 'number') {
                        currentBearing = b;
                        this._lastBearing = b;
                    }
                }).catch(() => {});
                
                this.mapillaryViewer.remove();
                // Wait for WebGL context to be released
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                console.warn("Error removing viewer:", err);
            }
            this.mapillaryViewer = null;
        }

        this.setState({isFullscreen: goingFullscreen}, async () => {
            // Small delay to ensure state is settled
            await new Promise(resolve => setTimeout(resolve, 50));

            if (this.viewerContainer.current && currentImageId) {
                const {Viewer} = window.mapillary;
                
                // Create new viewer
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: currentImageId,
                    component: {
                        zoom: true,       
                        direction: false,  
                        cover: false
                    }
                });
                
                // Restore bearing
                this._lastBearing = currentBearing;
                
                // Redraw graphics
                if (currentImageCoords) {
                    this.currentGreenGraphic = this.drawPulsingPoint(
                        currentImageCoords.lon, 
                        currentImageCoords.lat, 
                        [0, 255, 0, 1]
                    );
                    
                    const length = this.coneLengths[this.zoomStepIndex];
                    const spread = this.coneSpreads[this.zoomStepIndex];
                    this.currentConeGraphic = this.drawCone(
                        currentImageCoords.lon, 
                        currentImageCoords.lat, 
                        currentBearing, 
                        length, 
                        spread
                    );
                }
                
                // Bind events
                this.bindMapillaryEvents();
                
                // Create minimap only in fullscreen
                if (this.state.isFullscreen) {
                    setTimeout(() => {
                        this.createMinimap();
                    }, 300);
                }
                
                // Center map on current frame when exiting fullscreen
                if (!this.state.isFullscreen && this.state.jimuMapView?.view && currentImageCoords) {
                    const view = this.state.jimuMapView.view;
                    
                    // Wait a bit for the view to stabilize
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Center the map on the current active frame location
                    await view.goTo({
                        center: [currentImageCoords.lon, currentImageCoords.lat],
                        zoom: view.zoom // Keep the current zoom level
                    }, { 
                        animate: true,
                        duration: 1000 // Smooth 1-second animation
                    });
                    
                    console.log("Centered map on active frame:", currentImageCoords);
                }
            }
        });
    };

    // Helper to load image
    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous'; // required for canvas on GitHub raw URLs
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    // Helper to crop and get data URL
    private cropSpriteImage(spriteImg: HTMLImageElement, meta: any): string {
        const canvas = document.createElement('canvas');
        canvas.width = meta.width;
        canvas.height = meta.height;
        const ctx = canvas.getContext('2d');
        ctx!.drawImage(
            spriteImg,
            meta.x, meta.y, meta.width, meta.height, // source rect
            0, 0, meta.width, meta.height            // destination rect
        );
        return canvas.toDataURL(); // base64 PNG
    }

    // Helper: Processes an array in chunks to avoid freezing the UI
    private async processInChunks<T, R>(
        items: T[], 
        chunkSize: number, 
        iterator: (item: T) => Promise<R> | R,
        onComplete: (results: R[]) => void
    ) {
        let index = 0;
        const results: R[] = [];

        const nextChunk = async () => {
            const end = Math.min(index + chunkSize, items.length);
            for (let i = index; i < end; i++) {
                const res = await iterator(items[i]);
                if (res) results.push(res);
            }
            index = end;

            if (index < items.length) {
                // Yield to main thread (allows UI to render/animate), then continue
                setTimeout(nextChunk, 0);
            } else {
                onComplete(results);
            }
        };
        
        nextChunk();
    }

    /**
        * Loads traffic sign filter options with icons from Mapillary sprite repository.
        * Sets up dropdown options and initializes filter state to "All traffic signs".
    */
    private async preloadTrafficSignOptions() {
        try {
            const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";
            
            const [jsonResp, img] = await Promise.all([
                fetch(`${spriteBaseUrl}.json`).then(r => r.json()),
                this.loadImage(`${spriteBaseUrl}.png`)
            ]);

            const codes = Object.keys(jsonResp);

            this.processInChunks(
                codes, 
                20, 
                (code) => {
                    const friendlyName = this.formatTrafficSignName(code);
                    const meta = jsonResp[code];
                    
                    // 1. Define the variable
                    const iconUrl = this.cropSpriteImage(img, meta);
                    
                    // 2. Check if it is valid (Must be done AFTER definition)
                    if (!iconUrl) return null; 

                    return { value: friendlyName, label: friendlyName, iconUrl };
                },
                (results) => {
                    const allOption = { value: "All traffic signs", label: "All traffic signs", iconUrl: null };
                    // Store full list
                    const fullList = [allOption, ...results];
                    this._fullTrafficSignsOptions = fullList;

                    this.setState({
                        trafficSignsOptions: fullList,
                        trafficSignsFilterValue: allOption
                    }, () => this.checkFiltersLoaded()); 
                }
            );
        } catch (err) {
            console.warn("Failed to preload traffic sign options", err);
        }
    }

    /**
        * Loads object detection filter options with icons from Mapillary sprite repository.
        * Sets up dropdown options and initializes filter state to "All points".
    */
    private async preloadObjectOptions() {
        try {
            const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";

            const [jsonResp, img] = await Promise.all([
                fetch(`${spriteBaseUrl}.json`).then(r => r.json()),
                this.loadImage(`${spriteBaseUrl}.png`)
            ]);

            const codes = Object.keys(jsonResp);

            this.processInChunks(
                codes, 
                20, 
                (code) => {
                    const friendlyName = this.objectNameMap[code] || code;
                    const meta = jsonResp[code];
                    
                    // 1. Define
                    const iconUrl = this.cropSpriteImage(img, meta);

                    // 2. Check
                    if (!iconUrl) return null;

                    return { value: friendlyName, label: friendlyName, iconUrl };
                },
                (results) => {
                    const allOption = { value: "All points", label: "All points", iconUrl: null };
                    // Store full list
                    const fullList = [allOption, ...results];
                    this._fullObjectsOptions = fullList;

                    this.setState({
                        objectsOptions: fullList,
                        objectsFilterValue: allOption
                    }, () => this.checkFiltersLoaded());
                }
            );
        } catch (err) {
            console.warn("Failed to preload object options", err);
        }
    }

    // Helper to set loaded flag
    private checkFiltersLoaded() {
        // Check if both drop-downs have been populated (length > 1 means data added to default "All" option)
        if (this.state.trafficSignsOptions.length > 1 && this.state.objectsOptions.length > 1) {
            
            // 1. Mark logic as ready (Triggers CSS fade-out via opacity)
            this.setState({ filtersLoaded: true });

            // 2. Wait for the fade-out animation to finish, then remove from DOM
            setTimeout(() => {
                this.setState({ showIntro: false });
            }, 800); // 800ms delay (matches CSS transition)
        }
    }

    /**
        * Filters the traffic signs VectorTileLayer so only icons matching `selectedValue` show.
        * Works at all zoom levels because VTL renders coverage regardless of FeatureLayer zoom threshold.
        * @param selectedValue trafficSignsOptions dropdown value ("all" or code)
    */
    private filterTrafficSignsVTLayer(selectedValue: string) {
        if (!this.mapillaryTrafficSignsLayer) return;

        const styleJson = this.mapillaryTrafficSignsLayer.style;
        const newStyle = JSON.parse(JSON.stringify(styleJson));

        const targetLayer = newStyle.layers.find((ly: any) => ly.id === "traffic-signs-icons");
        if (targetLayer) {
            if (!selectedValue || selectedValue === "All traffic signs") {
                delete targetLayer.filter;
            } else {
                // Ensure proper filter format
                targetLayer.filter = ["==", ["get", "value"], selectedValue];
            }
        }

        try {
            const { VectorTileLayer } = this.ArcGISModules;
            const filteredLayer = new VectorTileLayer({ style: newStyle });

            const { view } = this.state.jimuMapView;
            if (this.mapillaryTrafficSignsLayer && view.map.layers.includes(this.mapillaryTrafficSignsLayer)) {
                view.map.remove(this.mapillaryTrafficSignsLayer);
            }
            this.mapillaryTrafficSignsLayer = filteredLayer;
            view.map.add(this.mapillaryTrafficSignsLayer);
        } catch (err) {
            console.error("Error applying traffic signs filter:", err);
        }
    }

    /**
        * Filters the objects/points VectorTileLayer so only icons matching `selectedValue` show.
        * Works at all zoom levels because VTL renders coverage regardless of FeatureLayer zoom threshold.
        * @param selectedValue objectOptions dropdown value ("all" or code)
    */
    private filterObjectsVTLayer(selectedValue?: string) {
        if (!this.mapillaryObjectsLayer) return;

        const styleJson = this.mapillaryObjectsLayer.style;
        const newStyle = JSON.parse(JSON.stringify(styleJson));
        const targetLayer = newStyle.layers.find((ly: any) => ly.id === "mapillary-objects-icons");

        if (targetLayer) {
            if (!selectedValue || selectedValue === "All points") {
                delete targetLayer.filter;
            } else {
                targetLayer.filter = ["==", ["get", "value"], selectedValue];
            }
        }

        try {
            const { VectorTileLayer } = this.ArcGISModules;
            const filteredLayer = new VectorTileLayer({ style: newStyle });

            const { view } = this.state.jimuMapView;
            if (this.mapillaryObjectsLayer && view.map.layers.includes(this.mapillaryObjectsLayer)) {
                view.map.remove(this.mapillaryObjectsLayer);
            }
            this.mapillaryObjectsLayer = filteredLayer;
            view.map.add(this.mapillaryObjectsLayer);
        } catch (err) {
            console.error("Error applying objects filter:", err);
        }
    }

    /*
        --- Initializes the Mapillary Vector Tile Layer ---
        * Creates a VectorTileLayer from the Mapillary tiles API
        * Uses an inline `minimalStyle` object for symbology (sequence = green line, image = light cyan blue circle)
        * Stores the layer in `this.mapillaryVTLayer` for later toggling
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
            id: "mapillary-vector-tiles", // <--- ADD THIS FIXED ID
            style: minimalStyle
        })
    }

    /*
        --- Initializes the Mapillary Traffic Signs Layer ---
        * Creates a Traffic Signs Layer from the Mapillary tiles API
        * Stores the layer in `this.mapillaryTrafficSignsLayer` for later toggling
    */
     private initMapillaryTrafficSignsLayer() {
        const { VectorTileLayer } = this.ArcGISModules;

        const vectorTileSourceUrl = `https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${this.accessToken}`;
        const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";

        const minimalStyle = {
            version: 8,
            sprite: spriteBaseUrl,
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
                    "source-layer": "traffic_sign",
                    type: "symbol",
                    layout: {
                        "icon-image": ["get", "value"],
                        "icon-size": 0.8 
                    }
                }
            ]
        };

        this.mapillaryTrafficSignsLayer = new VectorTileLayer({
            id: "mapillary-traffic-signs-vt", // <--- ADDED ID
            style: minimalStyle
        });
    }

    /*
        --- Initializes the Mapillary Objects Layer Layer ---
        * Creates a Object Layer from the Mapillary tiles API
        * Stores the layer in `this.mapillaryObjectsLayer` for later toggling
    */
    private initMapillaryObjectsLayer() {
        const { VectorTileLayer } = this.ArcGISModules;

        const vectorTileSourceUrl = `https://tiles.mapillary.com/maps/vtp/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${this.accessToken}`;
        const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";

        const minimalStyle = {
            version: 8,
            sprite: spriteBaseUrl,
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
                    "source-layer": "point",
                    type: "symbol",
                    layout: {
                        "icon-image": ["get", "value"],
                        "icon-size": 0.8
                    }
                }
            ]
        };

        this.mapillaryObjectsLayer = new VectorTileLayer({
            id: "mapillary-objects-vt", // <--- ADDED ID
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
        * Mapillary encodes sign values with a double‑dash hierarchy (e.g., "warning--yield-ahead--g3").
        * This helper capitalizes and spaces each component for UI display.
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
        * This method:
        *  - Calculates the tile set covering the current extent (zoom 14)
        *  - Requests traffic sign vector tiles from Mapillary
        *  - Decodes features with PBF VectorTile parser
        *  - Converts coordinates to Web Mercator points
        *  - Optionally matches sprite icons for display
        * The resulting FeatureLayer is stored in `this.mapillaryTrafficSignsFeatureLayer` for display with popups.
        * @param matchSpriteIcons Whether to match Mapillary traffic sign icons from sprite sheets in renderer
    */
    private async loadMapillaryTrafficSignsFromTilesBBox(matchSpriteIcons: boolean = true) {
        if (this._cancelTrafficSignsFetch) {
            console.log("Cancelled traffic signs tile fetch");
            return;
        }
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        if (jimuMapView.view.zoom < 16) {
            console.log("Not loading traffic signs, zoom below threshold");
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

        let features: any[] = [];

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

        // Collect unique values from all features and load their icons
        const uniqueValuesMap = new Map<string, string>(); // value -> name
        features.forEach(f => {
            uniqueValuesMap.set(f.attributes.value, f.attributes.name);
        });

        // Load icons for the unique values
        const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";
        const optionsWithIcons: Array<{value: string, label: string, iconUrl: string | null}> = [];

        try {
            const img = await this.loadImage(`${spriteBaseUrl}.png`);
            const jsonResp = await fetch(`${spriteBaseUrl}.json`);
            const spriteData = await jsonResp.json();
            
            for (const [value, name] of uniqueValuesMap.entries()) {
                let iconUrl = null;
                if (spriteData[value]) {
                    try {
                        const meta = spriteData[value];
                        iconUrl = this.cropSpriteImage(img, meta);
                    } catch (err) {
                        console.warn(`Failed to crop icon for ${value}`, err);
                    }
                }
                // STRICT CHECK - Only add if iconUrl exists
                if (iconUrl) {
                    optionsWithIcons.push({ value: name, label: name, iconUrl });
                }
            }
        } catch (err) {
            console.warn("Failed to load traffic sign icons for dropdown", err);
            // Fallback: create options without icons
            // for (const [value, name] of uniqueValuesMap.entries()) {
            //     optionsWithIcons.push({ value: name, label: name, iconUrl: null });
            // }
        }

        const allOption = { value: "All traffic signs", label: "All traffic signs", iconUrl: null };
        this.setState({ trafficSignsOptions: [allOption, ...optionsWithIcons] });

        // Apply current filter from state
        const currentFilterValue = this.state.trafficSignsFilterValue?.value || "All traffic signs";
        // console.log("Applying traffic signs filter:", currentFilterValue);  

        if (currentFilterValue !== "All traffic signs") {
            // Get the raw code for this friendly name
            const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";
            try {
                const jsonResp = await fetch(`${spriteBaseUrl}.json`);
                const spriteData = await jsonResp.json();
                const rawCode = Object.keys(spriteData).find(
                    c => this.formatTrafficSignName(c) === currentFilterValue
                );
                
                if (rawCode) {
                    features = features.filter(f => f.attributes.value === rawCode);
                    console.log(`Filtered to ${features.length} features with code: ${rawCode}`);
                }
            } catch (err) {
                console.warn("Failed to get sprite data for filtering", err);
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
                    // console.warn(`Could not load icon for ${val}`, err);
                }
            }

            features = features.filter(f => {
                const v = f.attributes.value;
                return !!iconCache[v]; // keep only those with an icon
            });

            renderer = {
                type: "unique-value",
                field: "value",
                uniqueValueInfos: Object.keys(iconCache).map(v => ({
                        value: v,
                        symbol: {
                        type: "picture-marker",
                        url: iconCache[v],
                        width: 20,
                        height: 20
                    }
                }))
            };
        } else {
            renderer = {
                type: "simple",
                symbol: { type: "simple-marker", size: 6, color: "orange", outline: { color: "white", width: 1 } }
            };
        }

        const layer = new FeatureLayer({
            id: "mapillary-traffic-signs-fl", // <--- 1. Explicit ID
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

                // 2. "Last Second" Check: Before adding, ensure we are still allowed to 
        if (this._cancelTrafficSignsFetch || jimuMapView.view.zoom < 16) {
            console.log("Fetch finished, but zoom too low or cancelled. Discarding layer.");
            return;
        }

        // Remove any existing layer with this ID first to prevent duplicates
        const existingLayer = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
        if (existingLayer) {
            jimuMapView.view.map.remove(existingLayer);
        }

        this.mapillaryTrafficSignsFeatureLayer = layer;
        // Only add if we are still active
        if(this.state.trafficSignsActive) {
            jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
        }
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
            console.log("Cancelled object tile fetch, widget closed or toggle off");
            return;
        }
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        if (jimuMapView.view.zoom < 16) {
            console.log("Not loading objects, zoom below threshold");
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
        let features: any[] = [];

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
                                            name: this.objectNameMap[feat.properties.value] || feat.properties.value, // readable name
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

        // Collect unique values and load their icons
        const uniqueValuesMap = new Map<string, string>(); // value -> name
        features.forEach(f => {
            uniqueValuesMap.set(f.attributes.value, f.attributes.name);
        });

        // Load icons for the unique values
        const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";
        const optionsWithIcons: Array<{value: string, label: string, iconUrl: string | null}> = [];

        try {
            const img = await this.loadImage(`${spriteBaseUrl}.png`);
            const jsonResp = await fetch(`${spriteBaseUrl}.json`);
            const spriteData = await jsonResp.json();
            
            for (const [value, name] of uniqueValuesMap.entries()) {
                let iconUrl = null;
                if (spriteData[value]) {
                    try {
                        const meta = spriteData[value];
                        iconUrl = this.cropSpriteImage(img, meta);
                    } catch (err) {
                        console.warn(`Failed to crop icon for ${value}`, err);
                    }
                }
                // STRICT CHECK - Only add if iconUrl exists
                if (iconUrl) {
                    optionsWithIcons.push({ value: name, label: name, iconUrl });
                }
            }
        } catch (err) {
            console.warn("Failed to load object icons for dropdown", err);
            // Fallback: create options without icons
            // for (const [value, name] of uniqueValuesMap.entries()) {
            //     optionsWithIcons.push({ value: name, label: name, iconUrl: null });
            // }
        }

        const allOption = { value: "All points", label: "All points", iconUrl: null };
        this.setState({ objectsOptions: [allOption, ...optionsWithIcons] });

        // Apply current filter from state
        const currentFilterValue = this.state.objectsFilterValue?.value || "All points";
        // console.log("Applying objects filter:", currentFilterValue); 

        if (currentFilterValue !== "All points") {
            // Get the raw code for this friendly name
            const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";
            try {
                const jsonResp = await fetch(`${spriteBaseUrl}.json`);
                const spriteData = await jsonResp.json();
                const rawCode = Object.keys(spriteData).find(
                    c => (this.objectNameMap[c] || c) === currentFilterValue
                );
                
                if (rawCode) {
                    features = features.filter(f => f.attributes.value === rawCode);
                    console.log(`Filtered to ${features.length} features with code: ${rawCode}`);
                }
            } catch (err) {
                console.warn("Failed to get sprite data for filtering", err);
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
                    // console.warn(`Could not load icon for ${val}`, err);
                }
            }
            features = features.filter(f => {
                const v = f.attributes.value;
                return !!iconCache[v]; // keep only those with an icon
            });

            renderer = {
                type: "unique-value",
                field: "value",
                uniqueValueInfos: Object.keys(iconCache).map(v => ({
                        value: v,
                        symbol: {
                            type: "picture-marker",
                            url: iconCache[v],
                            width: 20,
                            height: 20
                        }
                }))
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
            id: "mapillary-objects-fl", // <--- Explicit ID
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
        // "Last Second" Check
        if (this._cancelObjectsFetch || jimuMapView.view.zoom < 16) {
            return;
        }

        // Remove existing by ID
        const existingLayer = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
        if (existingLayer) {
            jimuMapView.view.map.remove(existingLayer);
        }

        this.mapillaryObjectsFeatureLayer = layer;
        if(this.state.objectsActive) {
            jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
        }
    }

    /*
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
        * If layer is already in the map, remove it
        * If layer is not in the map, add it
        * Controlled by button in UI ("🗺️" icon)
        * Uses `this.mapillaryVTLayer` created by initMapillaryLayer()
        * Uses `this.mapillaryTrafficSignsLayer` created by initMapillaryTrafficSignsLayer()
    */
    private toggleMapillaryTiles = () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // Check if layer exists by ID
        const existingLayer = jimuMapView.view.map.findLayerById("mapillary-vector-tiles");

        if (existingLayer) {
            // If exists, remove it
            jimuMapView.view.map.remove(existingLayer);
            this.setState({ tilesActive: false });
        } else {
            // Recreate if missing (or references lost)
            this.initMapillaryLayer();
            
            // Add new layer
            jimuMapView.view.map.add(this.mapillaryVTLayer);
            this.setState({ tilesActive: true });

            const layers = jimuMapView.view.map.layers;
            // Ensure Turbo Coverage layer stays on top
            if (this.turboCoverageLayer && layers.includes(this.turboCoverageLayer)) {
                jimuMapView.view.map.reorder(this.turboCoverageLayer, layers.length - 1);
            }

            // (Optional) Also re-raise interactive feature layers for Objects/Signs if they are active
            if (this.mapillaryObjectsFeatureLayer && layers.includes(this.mapillaryObjectsFeatureLayer)) {
                jimuMapView.view.map.reorder(this.mapillaryObjectsFeatureLayer, layers.length - 1);
            }
            if (this.mapillaryTrafficSignsFeatureLayer && layers.includes(this.mapillaryTrafficSignsFeatureLayer)) {
                jimuMapView.view.map.reorder(this.mapillaryTrafficSignsFeatureLayer, layers.length - 1);
            }
        }
    };

    /**
        * Toggles the Mapillary traffic signs overlay on/off in the map.
        * When ON:
        *  - Ensures the traffic sign VectorTileLayer (coverage layer) is always present when active
        *  - Dynamically loads/removes a FeatureLayer of traffic signs from the current bounding box if zoom >= 16
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
        if (!this.state.trafficSignsActive && jimuMapView.view.zoom < 16) {
            this.showZoomWarning("Zoom in closer (≥ 16) to view clickable traffic sign features.");
        }

        // === Turn OFF ===
        if (this.state.trafficSignsActive) {
            // 1. Remove event watchers first
            if (this.trafficSignsStationaryHandle) {
                this.trafficSignsStationaryHandle.remove();
                this.trafficSignsStationaryHandle = null;
            }
            if (this.trafficSignsZoomHandle) {
                this.trafficSignsZoomHandle.remove();
                this.trafficSignsZoomHandle = null;
            }

            // 2. Cancel any ongoing fetch operations
            this._cancelTrafficSignsFetch = true;

            // 3. Remove VectorTileLayer (coverage) by ID
            const existingVTLayer = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-vt");
            if (existingVTLayer) {
                jimuMapView.view.map.remove(existingVTLayer);
                console.log("Removed traffic signs VectorTileLayer");
            }

            // 4. Remove FeatureLayer (interactive features) by ID
            const existingFL = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
            if (existingFL) {
                jimuMapView.view.map.remove(existingFL);
                console.log("Removed traffic signs FeatureLayer");
            }

            // 5. Destroy layer instances to release resources
            if (this.mapillaryTrafficSignsLayer) {
                try {
                    this.mapillaryTrafficSignsLayer.destroy();
                } catch (err) {
                    console.warn("Error destroying traffic signs VT layer:", err);
                }
            }
            
            if (this.mapillaryTrafficSignsFeatureLayer) {
                try {
                    this.mapillaryTrafficSignsFeatureLayer.destroy();
                } catch (err) {
                    console.warn("Error destroying traffic signs feature layer:", err);
                }
            }

            // 6. Nullify all references
            this.mapillaryTrafficSignsLayer = null;
            this.mapillaryTrafficSignsFeatureLayer = null;

            // 7. Reset filter to default and update state
            const defaultTrafficSignsFilter = { 
                value: "All traffic signs", 
                label: "All traffic signs", 
                iconUrl: null 
            };
            
            this.setState({ 
                trafficSignsActive: false, 
                showTrafficSignsFilterBox: false,
                trafficSignsFilterValue: defaultTrafficSignsFilter
            });
            
            console.log("Traffic signs layers completely removed and filter reset");
            return;
        }

        // === Turn ON ===
        this._cancelTrafficSignsFetch = false;
        
        // Check if VT layer exists by ID
        const existingVTLayer = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-vt");
        
        // Ensure VT layer is present
        if (!existingVTLayer) {
            this.initMapillaryTrafficSignsLayer();
            jimuMapView.view.map.add(this.mapillaryTrafficSignsLayer); 
        }

        if (jimuMapView.view.zoom >= 16) {
            await this.loadMapillaryTrafficSignsFromTilesBBox(true);
            if (this.mapillaryTrafficSignsFeatureLayer) {
                jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
            }
        }

        // Set up zoom watcher
        const zoomHandle = jimuMapView.view.watch("zoom", async (currentZoom) => {
            if (currentZoom < 16) {
                this._cancelTrafficSignsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
            } else {
                this._cancelTrafficSignsFetch = false;
            }
        });
        
        // Set up debounced refresh on stationary
        const debouncedRefresh = this.debounce(async () => { 
            await this.loadMapillaryTrafficSignsFromTilesBBox(true);
            if (this.mapillaryTrafficSignsFeatureLayer) {
                const oldFL = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
                if (oldFL) jimuMapView.view.map.remove(oldFL);
                jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
            }
        }, 500);

        this.trafficSignsStationaryHandle = jimuMapView.view.watch("stationary", (isStationary) => {
            if (!isStationary) return;
            if (jimuMapView.view.zoom < 16) return;
            if (!this._cancelTrafficSignsFetch) debouncedRefresh();
        });

        this.trafficSignsZoomHandle = zoomHandle;
        this.setState({ trafficSignsActive: true });
    };

    /**
        * Toggles the Mapillary objects overlay on/off in the map.
        * When ON:
        *  - Ensures the objects VectorTileLayer (coverage layer) is always present when active
        *  - Dynamically loads/removes a FeatureLayer of objects from the current bounding box if zoom >= 16
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
        if (!this.state.objectsActive && jimuMapView.view.zoom < 16) {
            this.showZoomWarning("Zoom in closer (≥ 16) to view clickable object features.");
        }

        // === Turn OFF ===
        if (this.state.objectsActive) {
            // 1. Remove event watchers first
            if (this.objectsStationaryHandle) {
                this.objectsStationaryHandle.remove();
                this.objectsStationaryHandle = null;
            }
            if (this.objectsZoomHandle) {
                this.objectsZoomHandle.remove();
                this.objectsZoomHandle = null;
            }

            // 2. Cancel any ongoing fetch operations
            this._cancelObjectsFetch = true;

            // 3. Remove VectorTileLayer (coverage) by ID
            const existingVTLayer = jimuMapView.view.map.findLayerById("mapillary-objects-vt");
            if (existingVTLayer) {
                jimuMapView.view.map.remove(existingVTLayer);
                console.log("Removed objects VectorTileLayer");
            }

            // 4. Remove FeatureLayer (interactive features) by ID
            const existingFL = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
            if (existingFL) {
                jimuMapView.view.map.remove(existingFL);
                console.log("Removed objects FeatureLayer");
            }

            // 5. Destroy layer instances to release resources
            if (this.mapillaryObjectsLayer) {
                try {
                    this.mapillaryObjectsLayer.destroy();
                } catch (err) {
                    console.warn("Error destroying objects VT layer:", err);
                }
            }
            
            if (this.mapillaryObjectsFeatureLayer) {
                try {
                    this.mapillaryObjectsFeatureLayer.destroy();
                } catch (err) {
                    console.warn("Error destroying objects feature layer:", err);
                }
            }

            // 6. Nullify all references
            this.mapillaryObjectsLayer = null;
            this.mapillaryObjectsFeatureLayer = null;

            // 7. Reset filter to default and update state
            const defaultObjectsFilter = { 
                value: "All points", 
                label: "All points", 
                iconUrl: null 
            };
            
            this.setState({ 
                objectsActive: false, 
                showObjectsFilterBox: false,
                objectsFilterValue: defaultObjectsFilter
            });
            
            console.log("Objects layers completely removed and filter reset");
            return;
        }

        // === Turn ON ===
        this._cancelObjectsFetch = false;

        const existingVTLayer = jimuMapView.view.map.findLayerById("mapillary-objects-vt");

        if (!existingVTLayer) {
            this.initMapillaryObjectsLayer();
            jimuMapView.view.map.add(this.mapillaryObjectsLayer);
        }

        if (jimuMapView.view.zoom >= 16) {
            await this.loadMapillaryObjectsFromTilesBBox(true);
            if (this.mapillaryObjectsFeatureLayer) {
                jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
            }
        }

        // Set up zoom watcher
        const zoomHandle = jimuMapView.view.watch("zoom", async (currentZoom) => {
            if (currentZoom < 16) {
                this._cancelObjectsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
            } else {
                this._cancelObjectsFetch = false;
            }
        });

        const debouncedRefresh = this.debounce(async () => {
            await this.loadMapillaryObjectsFromTilesBBox(true);
            if (this.mapillaryObjectsFeatureLayer) {
                const oldFL = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
                if (oldFL) jimuMapView.view.map.remove(oldFL);
                jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
            }
        }, 500);

        this.objectsStationaryHandle = jimuMapView.view.watch("stationary", (isStationary) => {
            if (!isStationary) return;
            if (jimuMapView.view.zoom < 16) return;
            if (!this._cancelObjectsFetch) debouncedRefresh();
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

    // Restores minimal sequence info (IDs + coords) in localStorage
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

    /*
        * Displays a zoom warning.
        * @param message Text to display
        * @param duration Time in ms. If 0, the message stays indefinitely until cleared manually.
    */
    private showZoomWarning(message: string, duration: number = 4000) {
        // 1. Clear previous timer to prevent conflicts
        if (this._zoomWarningTimeout) {
            clearTimeout(this._zoomWarningTimeout);
            this._zoomWarningTimeout = null;
        }

        // 2. Set the message
        this.setState({ zoomWarningMessage: message });
        
        // 3. If duration > 0, set a timer to auto-hide. 
        // If duration is 0, do nothing (it stays visible).
        if (duration > 0) {
            this._zoomWarningTimeout = setTimeout(() => {
                this.setState({ zoomWarningMessage: undefined });
                this._zoomWarningTimeout = null;
            }, duration); 
        }
    }

    // Helper to manually clear the warning
    private clearZoomWarning() {
        if (this._zoomWarningTimeout) {
            clearTimeout(this._zoomWarningTimeout);
            this._zoomWarningTimeout = null;
        }
        this.setState({ zoomWarningMessage: undefined });
    }

    /*
        * Categorizes a date string into predefined time periods
    */
    private getDateCategory(dateString: string): string {
        if (!dateString) return "unknown";
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return "unknown";
        return String(d.getFullYear()); // precise year as category
    }

    /*
        * Creates a renderer that colors points based on date categories
    */
    private createYearBasedRenderer(years: string[]): __esri.UniqueValueRenderer {
        // Distinct color palette
        const palette = [
            [46, 204, 113],  // green
            [52, 152, 219],  // blue
            [241, 196, 15],  // yellow
            [231, 76, 60],   // red
            [155, 89, 182],  // purple
            [26, 188, 156],  // turquoise
            [230, 126, 34],  // orange
            [149, 165, 166]  // gray
        ];
        
        return {
            type: "unique-value",
            field: "date_category",
            uniqueValueInfos: years.map((year, idx) => ({
                value: year,
                symbol: {
                    type: "simple-marker",
                    color: [...palette[idx % palette.length], 0.9], // cycle palette if >8 years
                    size: 6,
                    outline: { color: [255, 255, 255], width: 1 }
                }
            })),
            defaultSymbol: {
                type: "simple-marker",
                color: [255, 255, 255, 0.5],
                size: 6,
                outline: { color: [0, 0, 0], width: 1 }
            }
        };
    }

    /*
        * Loads Mapillary "Turbo Mode" coverage points into the map view.
        * - Requires zoom >= minTurboZoom (default 16) or it skips loading.
        * - Shows spinner via `turboLoading` state while running.
        * - Removes any existing "turboCoverage" FeatureLayer.
        * - Fetches image points from Mapillary vector tiles for current extent.
        * - If `filterUsername` given:
        *     • Queries Mapillary Graph API in batches for creator info + sequence IDs.
        *     • Filters points to only those by that creator & enables popups.
        *   Else:
        *     • Skips API calls, disables popups for speed.
        * - Adds the FeatureLayer with simple marker renderer to the map.
        * - Stores LayerView for later highlighting.
        * - Ends by setting `turboLoading` false to hide the spinner.
        * Called when Turbo Mode starts or reloads (stationary/zoom watchers).
    */
     private async enableTurboCoverageLayer() {
        if (!this.state.turboModeActive) {
            console.log("Turbo Mode is OFF, ignoring enableTurboCoverageLayer call.");
            return;
        }

        const {
            jimuMapView,
            turboFilterUsername,
            turboFilterStartDate,
            turboFilterEndDate,
            turboFilterIsPano,
            turboColorByDate
        } = this.state;

        if (!jimuMapView) return;

        const minTurboZoom = 16;
        if (jimuMapView.view.zoom < minTurboZoom) {
            console.log(`Turbo Mode disabled - zoom level ${jimuMapView.view.zoom} is below ${minTurboZoom}`);
            return;
        }

        this.setState({ turboLoading: true });

        // Remove old Turbo layers if exists
        this.disableTurboCoverageLayer();

        let wgs84Extent: __esri.Extent;
        try {
            const projected = webMercatorUtils.webMercatorToGeographic(jimuMapView.view.extent);
            if (!projected) {
                throw new Error("webMercatorToGeographic returned null");
            }
            wgs84Extent = projected as __esri.Extent;
        } catch (err) {
            console.error("Extent conversion to WGS84 failed:", err);
            this.setState({ turboLoading: false });
            return; 
        }

        const bbox = [wgs84Extent.xmin, wgs84Extent.ymin, wgs84Extent.xmax, wgs84Extent.ymax];
        const zoom = 14;
        const tiles = this.bboxToTileRange(bbox, zoom);

        const seenIds = new Set<string>();
        const baseFeatureList: { id: string; lon: number; lat: number }[] = [];

        for (const [x, y, z] of tiles) {
            const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${this.accessToken}`;
            try {
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const ab = await resp.arrayBuffer();
                const tile = new VectorTile(new Pbf(ab));

                // --- 1. Process Images (Points) ---
                const imgLayer = tile.layers["image"];
                if (imgLayer) {
                    for (let i = 0; i < imgLayer.length; i++) {
                        const feat = imgLayer.feature(i).toGeoJSON(x, y, z);
                        const [lon, lat] = feat.geometry.coordinates;
                        const id = feat.properties.id;

                        if (
                            !seenIds.has(id) &&
                            lon >= bbox[0] && lon <= bbox[2] &&
                            lat >= bbox[1] && lat <= bbox[3]
                        ) {
                            seenIds.add(id);
                            baseFeatureList.push({ id, lon, lat });
                        }
                    }
                }
            } catch (err) {
                console.warn("Turbo tile fetch error", err);
            }
        }

        // Decide if details are needed
        const needDetails =
            turboColorByDate ||
            Boolean(turboFilterUsername?.trim()) ||
            Boolean(turboFilterStartDate) ||
            Boolean(turboFilterEndDate) ||
            turboFilterIsPano !== undefined;

        let features: any[] = [];
        const allYears: Set<string> = new Set();
        
        // This set will hold sequence IDs that passed the filter (or all if no filter)
        const validSequenceIds = new Set<string>();

        if (!needDetails) {
            // --- FAST MODE (No API calls) ---
            
            // Points
            features = baseFeatureList.map(base => ({
                geometry: webMercatorUtils.geographicToWebMercator({
                    type: "point",
                    x: base.lon,
                    y: base.lat,
                    spatialReference: { wkid: 4326 }
                }),
                attributes: { id: base.id }
            }));
        } else {
            // --- DETAIL MODE (API Filter calls) ---
            const idToUser: Record<string, string> = {};
            const idToSequence: Record<string, string> = {};
            const idToCapturedAt: Record<string, string> = {};
            const idToIsPano: Record<string, boolean | null> = {};

            const chunkSize = 50;
            const chunks: string[][] = [];
            for (let i = 0; i < baseFeatureList.length; i += chunkSize) {
                chunks.push(baseFeatureList.slice(i, i + chunkSize).map(f => f.id));
            }

            // Fetch details in parallel
            await Promise.all(
                chunks.map(async chunk => {
                    try {
                    const fields = "id,creator.username,sequence,captured_at,is_pano";
                    const apiUrl = `https://graph.mapillary.com/?ids=${chunk.join(",")}&fields=${fields}`;
                    const resp = await fetch(apiUrl, {
                        headers: { Authorization: `OAuth ${this.accessToken}` }
                    });
                    if (!resp.ok) return;
                    const json = await resp.json();
                    for (const [id, obj] of Object.entries(json)) {
                        idToUser[id] = (obj as any).creator?.username || "Unknown";
                        idToSequence[id] = (obj as any).sequence || null;
                        idToCapturedAt[id] = (obj as any).captured_at || null;
                        idToIsPano[id] = (obj as any).is_pano ?? null;
                    }
                    } catch (err) {
                        console.warn("Graph API chunk error", err);
                    }
                })
            );

            const startTime = turboFilterStartDate ? new Date(turboFilterStartDate).getTime() : null;
            const endTime = turboFilterEndDate ? new Date(turboFilterEndDate).getTime() : null;

            // Filter Points
            features = baseFeatureList
            .filter(base => {
                const userOk = turboFilterUsername?.trim()
                ? idToUser[base.id] === turboFilterUsername.trim()
                : true;

                const dateStr = idToCapturedAt[base.id];
                let dateOk = true;
                if (dateStr) {
                    const t = new Date(dateStr).getTime();
                    if (startTime && t < startTime) dateOk = false;
                    if (endTime && t > endTime) dateOk = false;
                }

                let panoOk = true;
                if (turboFilterIsPano !== undefined) {
                    panoOk = idToIsPano[base.id] === turboFilterIsPano;
                }

                return userOk && dateOk && panoOk;
            })
            .map(base => {
                // Collect valid sequence IDs from the images that passed the filter
                const seqId = idToSequence[base.id];
                if (seqId) validSequenceIds.add(seqId);

                let yearCat: string | null = null;
                if (turboColorByDate) {
                    yearCat = this.getDateCategory(idToCapturedAt[base.id]);
                    if (yearCat && yearCat !== "unknown") {
                        allYears.add(yearCat);
                    }
                }
                return {
                    geometry: webMercatorUtils.geographicToWebMercator({
                        type: "point",
                        x: base.lon,
                        y: base.lat,
                        spatialReference: { wkid: 4326 }
                    }),
                    attributes: {
                        id: base.id,
                        creator_username: idToUser[base.id],
                        sequence_id: seqId,
                        captured_at: idToCapturedAt[base.id],
                        is_pano: idToIsPano[base.id],
                        date_category: yearCat
                    }
                };
            });
        }

        if (!features.length) {
            console.warn("No Turbo coverage matches for filters or date coloring");
            this.setState({ turboLoading: false });
            return;
        }

        // --- 2. Create Point Layer ---
        let renderer: __esri.Renderer;
        if (turboColorByDate && needDetails) {
            const yearList = Array.from(allYears);
            const yearRenderer = this.createYearBasedRenderer(yearList);

            const palette = [
                [46, 204, 113], [52, 152, 219], [241, 196, 15], [231, 76, 60],
                [155, 89, 182], [26, 188, 156], [230, 126, 34], [149, 165, 166]
            ];
            const legendMap = yearList.map((year, idx) => ({
                year: year,
                color: `rgb(${palette[idx % palette.length].join(",")})`
            }));

            this.setState({ turboYearLegend: legendMap });
            renderer = yearRenderer;
        } else {
            renderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                color: [165, 42, 42, 0.9],
                size: 6,
                outline: { color: [255, 255, 255], width: 1 }
            }
            };
            this.setState({ turboYearLegend: [] });
        }

        let enablePopups = needDetails;
        const onlyPanoOrColor =
            (!turboFilterUsername?.trim() &&
            !turboFilterStartDate &&
            !turboFilterEndDate &&
            (turboFilterIsPano !== undefined || turboColorByDate));
        if (onlyPanoOrColor) enablePopups = false;

        this.turboCoverageLayer = new FeatureLayer({
            id: "turboCoverage",
            source: features,
            objectIdField: "id",
            fields: [
                { name: "id", type: "string" },
                { name: "creator_username", type: "string" },
                { name: "sequence_id", type: "string" },
                { name: "captured_at", type: "string" },
                { name: "date_category", type: "string" }
            ],
            geometryType: "point",
            spatialReference: { wkid: 3857 },
            renderer,
            popupEnabled: enablePopups,
            popupTemplate: enablePopups
            ? {
                title: `{creator_username}`,
                content: `
                    <b>Image ID:</b> {id}<br>
                    <b>Creator:</b> {creator_username}<br>
                    <b>Captured At:</b> {captured_at}<br>
                    <b>Panorama:</b> {is_pano}<br>
                    ${turboColorByDate ? "<b>Year:</b> {date_category}<br>" : ""}
                `
                }
            : undefined
        });

        jimuMapView.view.map.add(this.turboCoverageLayer);
        jimuMapView.view.whenLayerView(this.turboCoverageLayer).then(lv => {
            this.turboCoverageLayerView = lv;
        });

        this.setState({ turboLoading: false });
    }

    /**
        * Removes the "turboCoverage" FeatureLayer from the map
        * and clears its reference.
    */
    private disableTurboCoverageLayer() {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // Remove Points Layer
        const layer = jimuMapView.view.map.findLayerById("turboCoverage");
        if (layer) {
            jimuMapView.view.map.remove(layer);
        }
        this.turboCoverageLayer = null;

        // Remove Lines Layer
        const seqLayer = jimuMapView.view.map.findLayerById("turboSequence");
        if (seqLayer) {
            jimuMapView.view.map.remove(seqLayer);
        }
        this.turboSequenceLayer = null;
        
        console.log("Turbo coverage layers removed");
    }
    
    // --- Load a specific sequence by ID and image ---
    // Fetches all image coordinates in the sequence,
    // updates the viewer, re-draws map markers,
    // and attaches Mapillary event listeners for bearing/image changes.
    // --- Load a specific sequence by ID and image ---
    private async loadSequenceById(sequenceId: string, startImageId: string) {
        this.clearGreenPulse();
        
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // If the new sequence is not the same as the existing selectedSequenceId, clear markers
        if (this.state.selectedSequenceId && this.state.selectedSequenceId !== sequenceId) {
            this.clearActiveSequenceGraphics(this.state.selectedSequenceId);
        }

        this.setState({ isLoading: true });

        try {
            // Fetch all images (IDs + coords)
            const updatedSequence = await this.getSequenceWithCoords(sequenceId, this.accessToken);

            // Update state
            this.setState({
                sequenceImages: updatedSequence,
                imageId: startImageId,
                sequenceId,
                selectedSequenceId: sequenceId
            });

            // Cache sequence
            this.saveSequenceCache(sequenceId, updatedSequence);

            // Destroy old viewer if exists
            if (this.mapillaryViewer) {
                try { this.mapillaryViewer.remove(); } catch {}
                this.mapillaryViewer = null;
            }

            // Create new Mapillary viewer
            const { Viewer } = window.mapillary;
            if (this.viewerContainer.current) {
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: startImageId,
                    component: {
                        zoom: true,       
                        direction: false,  
                        cover: false
                    }
                });
                
                // <--- REPLACED THE HUGE BLOCK OF EVENT LISTENERS WITH THIS:
                this.bindMapillaryEvents();
            }

            // Clear previous green pulse
            this.clearGreenPulse();

            // Clear old map graphics and draw new ones...
            // (Rest of the drawing logic remains exactly the same as your original code)
            const toRemove: __esri.Graphic[] = [];
            jimuMapView.view.graphics.forEach(g => {
                if (!(g as any).__isSequenceOverlay) {
                    toRemove.push(g);
                }
            });
            toRemove.forEach(g => jimuMapView.view.graphics.remove(g));

            const hasPolyline = jimuMapView.view.graphics.some(g => 
                (g as any).__isSequenceOverlay && 
                g.geometry.type === "polyline" && 
                g.attributes?.sequenceId === sequenceId
            );

            if (!hasPolyline && updatedSequence.length > 1) {
                 const { Graphic } = this.ArcGISModules;
                 const paths = updatedSequence.map(img => [img.lon, img.lat]);
                 
                 const polylineGraphic = new Graphic({
                    geometry: { type: "polyline", paths: [paths], spatialReference: { wkid: 4326 } },
                    symbol: { type: "simple-line", color: [0, 0, 255, 0.8], width: 3 }, 
                    attributes: { sequenceId: sequenceId }
                });
                (polylineGraphic as any).__isSequenceOverlay = true;
                jimuMapView.view.graphics.add(polylineGraphic);
            }

            const { clickLon, clickLat } = this.state;
            if (clickLon != null && clickLat != null) {
                this.drawPoint(clickLon, clickLat);
            }

            updatedSequence.forEach(img => {
                if (img.id !== startImageId) {
                    this.drawPointWithoutRemoving(img.lon, img.lat, [0, 0, 255, 1]);
                }
            });

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
            this.ArcGISModules = {
                Graphic, 
                Point, 
                SimpleMarkerSymbol, 
                VectorTileLayer
            };
            console.log("ArcGIS API modules loaded");

            // Initialize Mapillary Vector Tile Layer right after modules are ready
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

        this.tooltipDiv = document.createElement("div");
        Object.assign(this.tooltipDiv.style, {
            position: "fixed",
            pointerEvents: "none",       // so mouse can pass through
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "4px 8px",
            borderRadius: "4px",
            zIndex: 999,
            fontSize: "11px",
            display: "none",
            maxWidth: "250px"
        });
        document.body.appendChild(this.tooltipDiv);

        // Defer the heavy processing by 500ms to let the Map widget render first
        setTimeout(() => {
            this.preloadTrafficSignOptions();
            this.preloadObjectOptions();
        }, 500);
        
        const styleSheet = document.createElement("style");
        styleSheet.innerText = mobileOverrideStyles;
        document.head.appendChild(styleSheet);

        // Check if Turbo Mode Only is enabled in config
        // Just set the state here. The watchers will be attached 
        // as soon as the map loads via onActiveViewChange.
        if (this.props.config.turboModeOnly) {
            this.setState({ turboModeActive: true });
        }
    }
	
	componentDidUpdate(prevProps: AllWidgetProps<any>) {
        // Minimizing → don't remove listeners
        if (prevProps.visible && !this.props.visible) {
            console.log("Widget minimized - keeping listeners, skipping cleanup of handles");
            // Just clear state if you want to hide Mapillary viewer
            this.cleanupWidgetEnvironment(true, false);
        }

        // Closed → remove everything
        if (prevProps.state === 'OPENED' && this.props.state === 'CLOSED') {
            console.log("Widget closed - cleaning up completely");
            this.cleanupWidgetEnvironment(true, true);
        }

        // Reopened after closed → reattach listeners
        if (prevProps.state === 'CLOSED' && this.props.state === 'OPENED' && this.state.jimuMapView) {
            console.log("Widget reopened - reattaching event handles");
            // Always ensure TurboMode is OFF and filter cleared
            this.setState({
                turboModeActive: false,
                turboFilterUsername: "",
                turboFilterStartDate: "",
                turboFilterEndDate: "",
                turboFilterIsPano: undefined,
                turboColorByDate: false,
                turboYearLegend: [],
                showTurboFilterBox: false
            });

            // Also remove any leftover Turbo coverage layer from the map
            this.disableTurboCoverageLayer();
            this.onActiveViewChange(this.state.jimuMapView);
        }

        // 1. Handle Traffic Signs Setting Change
        if (prevProps.config.enableTrafficSigns !== this.props.config.enableTrafficSigns) {
            if (this.props.config.enableTrafficSigns === false) {
                // User disabled it: Force turn off if active, then destroy layer
                if (this.state.trafficSignsActive) this.toggleMapillaryTrafficSigns();
                this.mapillaryTrafficSignsLayer = null;
            } else {
                // User enabled it: Initialize layer
                this.initMapillaryTrafficSignsLayer();
            }
        }

        // 2. Handle Objects Setting Change
        if (prevProps.config.enableMapillaryObjects !== this.props.config.enableMapillaryObjects) {
            if (this.props.config.enableMapillaryObjects === false) {
                // User disabled it: Force turn off if active, then destroy layer
                if (this.state.objectsActive) this.toggleMapillaryObjects();
                this.mapillaryObjectsLayer = null;
            } else {
                // User enabled it: Initialize layer
                this.initMapillaryObjectsLayer();
            }
        }

        // 3. Handle Turbo Mode Only config change
        if (prevProps.config.turboModeOnly !== this.props.config.turboModeOnly) {
            const isTurboOnly = this.props.config.turboModeOnly;
            if (isTurboOnly) {
                // Turned ON: Force activate
                this.setState({ turboModeActive: true }, () => {
                    this.enableTurboCoverageLayer();
                });
            } else {
                // Turned OFF: Just disable the flag, let user toggle manually.
                // We don't necessarily have to turn off the layer, just allow the button to appear again.
                // Optionally: this.disableTurboCoverageLayer(); this.setState({ turboModeActive: false });
            }
        }
	}

    // --- Cleanup lifecycle ---
    // Ensures all intervals, observers, and event listeners are removed
    // to prevent memory leaks when widget is closed or reloaded.
	componentWillUnmount() {
		this.cleanupWidgetEnvironment(true, true);

		// Stop resize observer
		if (this.resizeObserver && this.viewerContainer.current) {
			this.resizeObserver.unobserve(this.viewerContainer.current);
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

        if (this.tooltipDiv && this.tooltipDiv.parentNode) {
            this.tooltipDiv.parentNode.removeChild(this.tooltipDiv);
            this.tooltipDiv = null;
        }

		// Remove listeners
		document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
		document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
		document.removeEventListener('mozfullscreenchange', this.handleFullscreenChange);
		document.removeEventListener('MSFullscreenChange', this.handleFullscreenChange);
		window.removeEventListener('resize', this.handleWindowResize);

        // Clear warning timeout
        if (this._zoomWarningTimeout) {
            clearTimeout(this._zoomWarningTimeout);
            this._zoomWarningTimeout = null;
        }
	}

    /**
        * Handles fullscreen mode changes by resizing the Mapillary viewer.
        * Ensures viewer adapts to fullscreen dimensions.
    */
    private handleFullscreenChange = () => {
        // When fullscreen mode changes, resize the Mapillary viewer
        if (this.mapillaryViewer?.resize) {
            this.mapillaryViewer.resize();
        }
    };

    /**
        * Handles window resize events by resizing the Mapillary viewer.
        * Ensures viewer adapts to window dimension changes.
    */
    private handleWindowResize = () => {
        if (this.mapillaryViewer?.resize) {
            this.mapillaryViewer.resize();
        }
    };

    /**
        * Handles map view changes and sets up click/hover event handlers.
        * Manages interactions for both normal and turbo mode, including object/traffic sign layers.
    */
    onActiveViewChange(jmv: JimuMapView) {
        if (!jmv) return;

        console.log("Active MapView set");
        this.setState({ jimuMapView: jmv });

        // Remove old handles if reassigning view
        if (this.mapClickHandle) {
            this.mapClickHandle.remove();
        }
        if (this.pointerMoveHandle) {
            this.pointerMoveHandle.remove();
        }

        this.mapClickHandle = jmv.view.on("click", async (evt) => {
            // Guard: do nothing if widget is not visible/closed
            if (this.props.state !== 'OPENED') return;

            // 1. Always calculate map point and hitTest first
            const point = jmv.view.toMap(evt) as __esri.Point;
            this.setState({ clickLon: point.longitude, clickLat: point.latitude });
            
            const hit = await jmv.view.hitTest(evt);

            // --- PRIORITY 1: Check for Sequence Overlay (Blue Dots/Lines) ---
            // This ensures we can navigate within the active sequence in BOTH Turbo and Normal modes.
            const seqGraphic = hit.results.find(r => (r.graphic as any).__isSequenceOverlay);
            
            if (seqGraphic && seqGraphic.graphic.attributes?.sequenceId) {
                const seqId = seqGraphic.graphic.attributes.sequenceId;
                
                // Get the sequence data (use cache if available and matching)
                let currentSeqData = this.state.sequenceImages;
                
                // If the clicked overlay is not the currently loaded data, fetch it
                if (this.state.selectedSequenceId !== seqId || !currentSeqData.length) {
                    currentSeqData = await this.getSequenceWithCoords(seqId, this.accessToken);
                }

                if (currentSeqData.length) {
                    // Find the closest image in the sequence to the click
                    const closestImg = currentSeqData.reduce((closest, img) => {
                        const dist = this.distanceMeters(img.lat, img.lon, point.latitude, point.longitude);
                        return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                    }, null as any);

                    if (closestImg) {
                        // If it's a new sequence, update ID
                        if (this.state.selectedSequenceId !== seqId) {
                            this.setState({ selectedSequenceId: seqId });
                        }
                        
                        // Load the specific frame
                        // We use skipInactiveMarkers logic implicitly by how loadSequenceById works, 
                        // but calling it directly here ensures the viewer jumps.
                        await this.loadSequenceById(seqId, closestImg.id);
                        
                        // Visual feedback for click
                        this.drawPoint(point.longitude, point.latitude);
                    }
                }
                // Stop processing (don't fire Turbo logic or Normal background logic)
                return;
            }

            // --- PRIORITY 2: Mapillary Objects/Signs (Popups) ---
            const objectHit = hit.results.find(r => r.graphic?.layer === this.mapillaryObjectsFeatureLayer);
            if (this.mapillaryObjectsFeatureLayer && objectHit && objectHit.graphic?.layer === this.mapillaryObjectsFeatureLayer) {
                return; // let ArcGIS popup handle it
            }

            const trafficSignHit = hit.results.find(r => r.graphic?.layer === this.mapillaryTrafficSignsFeatureLayer);
            if (this.mapillaryTrafficSignsFeatureLayer && trafficSignHit && trafficSignHit.graphic?.layer === this.mapillaryTrafficSignsFeatureLayer) {
                return; // let ArcGIS popup handle it
            }

            // --- PRIORITY 3: Turbo Mode Logic (Loading NEW Sequence) ---
            if (this.state.turboModeActive) {
                const imageHit = hit.results.find(r => r.layer?.id === "turboCoverage");
                
                // If Turbo Only mode is ON, and we didn't hit a point, STOP.
                if (this.props.config.turboModeOnly && !imageHit) {
                    return; 
                }

                if (imageHit) {
                    if (this.turboCoverageLayerView) {
                        if (this.highlightHandle) this.highlightHandle.remove();
                        this.highlightHandle = this.turboCoverageLayerView.highlight(imageHit.graphic);
                    }
                    const attrs = imageHit.graphic.attributes;
                    const imageId = attrs.id;
                    let seqId = attrs.sequence_id;

                    if (!seqId) {
                        try {
                            const resp = await fetch(`https://graph.mapillary.com/${imageId}?fields=sequence`, {
                                headers: { Authorization: `OAuth ${this.accessToken}` }
                            });
                            if (resp.ok) {
                                const data = await resp.json();
                                seqId = data.sequence;
                                imageHit.graphic.attributes.sequence_id = seqId; 
                            }
                        } catch (err) { console.error(err); return; }
                    }

                    if (!seqId) return;

                    this.drawClickRipple(point.longitude, point.latitude);
                    this.setState({ selectedSequenceId: seqId });
                    this.clearSequenceGraphics();
                    await this.loadSequenceById(seqId, imageId);
                    return; 
                }
                else {
                    // Block background clicks in Turbo Mode =====
                    // User clicked on empty map space in Turbo Mode - NOT ALLOWED
                    // In Turbo Mode, only direct clicks on coverage points are allowed
                    // User clicked on empty map space - show ripple and warning

                    // 1. Draw orange warning ripple at click location
                    this.drawWarningRipple(point.longitude, point.latitude);
                    
                    // 2. Show warning message
                    this.showZoomWarning(
                        "Turbo Mode: Please click directly on a brown coverage point to load imagery.", 
                        3000 // Show for 3 seconds
                    );
                    
                    console.log("Turbo Mode: Background clicks disabled. Click on a coverage point (brown dot).");
                    return; // Stop processing - do NOT call handleMapClick

                }
            }

            // --- PRIORITY 4: Normal Mode Background Click (API Search) ---
            // Only runs if not Turbo, not Overlay, not Object
            await this.handleMapClick(evt);
        });

        this.pointerMoveHandle = jmv.view.on("pointer-move", async (evt) => {
            const hit = await jmv.view.hitTest(evt);

            // Guard: Check if tooltipDiv is valid
            if (!this.tooltipDiv) return;

            // === TURBO MODE HOVER (FIXED) ===
            const turboHit = hit.results.find(r =>
                r.graphic?.layer?.id === "turboCoverage"
            );

            if (turboHit) {
                const attrs = turboHit.graphic.attributes;
                const featureId = attrs.id;

                // Check if we're hovering over a DIFFERENT feature
                if (this._currentHoveredFeatureId !== featureId) {
                    // NEW FEATURE - Clear old timeout and start fresh
                    if (this._hoverTimeout) {
                        clearTimeout(this._hoverTimeout);
                        this._hoverTimeout = null;
                    }

                    // Update the tracked feature ID
                    this._currentHoveredFeatureId = featureId;

                    // Start new timer (Debounce)
                    this._hoverTimeout = setTimeout(async () => {
                        if (!this.tooltipDiv) return;

                        // A. If we have detailed attributes already → show immediately
                        if (attrs.creator_username) {
                            const dateStr = attrs.captured_at ? new Date(attrs.captured_at).toLocaleString() : "Unknown date";
                            const thumbHtml = attrs.thumb_url
                                ? `<img src="${attrs.thumb_url}" style="max-width:150px;border-radius:3px;margin-top:4px" />`
                                : "";

                            this.tooltipDiv.innerHTML = `
                                <div><b>${attrs.creator_username}</b></div>
                                <div>${dateStr}</div>
                                ${thumbHtml}
                            `;
                            this.tooltipDiv.style.left = `${evt.x + 15}px`;
                            this.tooltipDiv.style.top = `${evt.y + 15}px`;
                            this.tooltipDiv.style.display = "block";
                        } 
                        // B. If missing details → Fetch from API
                        else {
                            this.tooltipDiv.innerHTML = `<div>Loading details…</div>`;
                            this.tooltipDiv.style.left = `${evt.x + 15}px`;
                            this.tooltipDiv.style.top = `${evt.y + 15}px`;
                            this.tooltipDiv.style.display = "block";

                            try {
                                const imgId = attrs.id;
                                const url = `https://graph.mapillary.com/${imgId}?fields=id,sequence,creator.username,captured_at,thumb_256_url`;
                                const resp = await fetch(url, {
                                    headers: { Authorization: `OAuth ${this.accessToken}` }
                                });

                                if (!this.tooltipDiv) return;
                                
                                if (resp.ok) {
                                    const data = await resp.json();
                                    if (!this.tooltipDiv) return;

                                    // Update the feature's attributes in the layer cache
                                    const updatedAttrs = {
                                        ...attrs,
                                        sequence_id: data.sequence || null,
                                        captured_at: data.captured_at ? new Date(data.captured_at).getTime() : null,
                                        creator_username: data.creator?.username || null,
                                        thumb_url: data.thumb_256_url || null
                                    };
                                    turboHit.graphic.attributes = updatedAttrs;

                                    const dateStr = updatedAttrs.captured_at
                                        ? new Date(updatedAttrs.captured_at).toLocaleString()
                                        : "Unknown date";
                                    const thumbHtml = updatedAttrs.thumb_url
                                        ? `<img src="${updatedAttrs.thumb_url}" style="max-width:150px;border-radius:3px;margin-top:4px" />`
                                        : "";

                                    this.tooltipDiv.innerHTML = `
                                        <div><b>${updatedAttrs.creator_username || "Unknown User"}</b></div>
                                        <div>${dateStr}</div>
                                        ${thumbHtml}
                                    `;
                                } else {
                                    this.tooltipDiv.innerHTML = `<div>Failed to load details</div>`;
                                }
                            } catch (err) {
                                console.warn("Turbo hover fetch error", err);
                                if (this.tooltipDiv) this.tooltipDiv.innerHTML = `<div>Error loading details</div>`;
                            }
                        }
                    }, 100); // Wait 100ms before showing tooltip
                } else {
                    // SAME FEATURE - Just update tooltip position without restarting timer
                    if (this.tooltipDiv.style.display === "block") {
                        this.tooltipDiv.style.left = `${evt.x + 15}px`;
                        this.tooltipDiv.style.top = `${evt.y + 15}px`;
                    }
                }
            } else {
                // No turbo hit - clear everything
                if (this._hoverTimeout) {
                    clearTimeout(this._hoverTimeout);
                    this._hoverTimeout = null;
                }
                this._currentHoveredFeatureId = null;
                this.tooltipDiv.style.display = "none";
            }

            // === Standard Object Hover (Keep existing logic) ===
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

        // 3. Auto-Initialize Turbo Watchers if Config is ON ---
        if (this.props.config.turboModeOnly) {
            // 1. Set State Active
            this.setState({ turboModeActive: true });

            // 2. Attach Watchers immediately (Crucial Step!)
            if (this.turboStationaryHandle) { this.turboStationaryHandle.remove(); }
            this.turboStationaryHandle = jmv.view.watch(
                "stationary",
                this.debounce(async (isStationary) => {
                    if (isStationary && this.state.turboModeActive) {
                        if (jmv.view.zoom < 16) return;
                        // Use filter if entered
                        const filter = this.state.turboFilterUsername.trim();
                        if (filter) {
                            await this.enableTurboCoverageLayer(); // Note: updated logic handles filter from state inside enable function usually
                        } else {
                            await this.enableTurboCoverageLayer();
                        }
                    }
                }, 500)
            );

            if (this.turboZoomHandle) { this.turboZoomHandle.remove(); }

            this.turboZoomHandle = jmv.view.watch("zoom", (z) => {
                const minTurboZoom = 16;
                
                if (this.state.turboModeActive) {
                    if (z < minTurboZoom) {
                        // 1. Zoomed OUT too far: Disable layer AND Show persistent warning
                        this.disableTurboCoverageLayer();
                        this.showZoomWarning("Turbo Mode active: Zoom in closer (≥ 16) to view data.", 0); // 0 = Infinite
                    } else {
                        // 2. Zoomed IN enough: Clear warning
                        this.clearZoomWarning();
                        // (The stationary watcher will handle loading the data once zooming stops)
                    }
                }
            });

            // --- UPDATED INITIAL CHECK ---
            if (jmv.view.zoom >= 16) {
                this.enableTurboCoverageLayer();
                this.clearZoomWarning(); // Ensure no leftover warnings
            } else {
                // Start with persistent warning if initial view is too far out
                this.showZoomWarning("Turbo Mode active: Zoom in closer (≥ 16) to view data.", 0);
            }
        }
    }

    /**
        * Displays a temporary "no image available" message to the user.
        * Message auto-dismisses after 4 seconds.
    */
    private showNoImageMessage() {
        this.setState({ noImageMessageVisible: true });
        // Automatically hide after fade (4 seconds)
        setTimeout(() => {
            this.setState({ noImageMessageVisible: false });
        }, 4000);
    }

    /**
        * Immediately hides the "no image available" message.
    */
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

    /**
        * Draws a temporary red ripple animation at the given coordinates
        * to provide visual click feedback, then removes it when faded.
    */
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

    /**
        * Draws an orange warning ripple animation at the given coordinates
        * to indicate an invalid click action in Turbo Mode.
    */
    private drawWarningRipple(lon: number, lat: number) {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const { Graphic } = this.ArcGISModules;

        let size = 0; // Start small
        let alpha = 0.6; // Start more opaque than normal ripple

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
                color: [255, 140, 0, alpha], // Orange color for warning
                size: size,
                outline: { color: [255, 140, 0, alpha], width: 2 }
            }
        });

        jimuMapView.view.graphics.add(rippleGraphic);

        const rippleInterval = setInterval(() => {
            size += 3; // Grow faster for more noticeable effect
            alpha -= 0.04; // Fade out

            rippleGraphic.symbol = {
                type: "simple-marker",
                style: "circle",
                color: [255, 140, 0, Math.max(alpha, 0)], // Orange
                size: size,
                outline: { color: [255, 140, 0, Math.max(alpha, 0)], width: 2 }
            };

            // When invisible, cleanup
            if (alpha <= 0) {
                clearInterval(rippleInterval);
                jimuMapView.view.graphics.remove(rippleGraphic);
            }
        }, 30);
    }

    /**
        * Draws a static colored point (default blue) on the map without
        * clearing other graphics. Tagged as sequence overlay for cleanup.
    */
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

    /**
        * Draws a red point at the given coordinates with a pop effect
        * (starts larger then shrinks) and tags it for Turbo/sequence cleanup.
    */
    private drawPoint(lon: number, lat: number) {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const { Graphic } = this.ArcGISModules;

        // Remove existing clicked location marker
        if (this.clickedLocationGraphic) {
            jimuMapView.view.graphics.remove(this.clickedLocationGraphic);
            this.clickedLocationGraphic = null;
        }

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
                size: 14, // pop effect start size
                outline: { color: "white", width: 2 },
            },
            attributes: { isClickedLocation: true }
        });

        (graphic as any).__isSequenceOverlay = true;

        jimuMapView.view.graphics.add(graphic);
        this.clickedLocationGraphic = graphic;

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
            if (size <= 10) clearInterval(shrink);
        }, 30);
    }
    
    /**
        * Draws a camera view cone polygon at the given location and bearing,
        * using radius/spread parameters. Tagged as cone graphic for cleanup.
    */
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

    /**
        * Removes the current pulsing green graphic from the map and clears
        * its animation interval.
    */
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
        // Do nothing if closed or no map view yet
        if (this.props.state !== 'OPENED' || !this.state.jimuMapView) return;

        const { jimuMapView, selectedSequenceId } = this.state;

        // Immediately remove active sequence markers (blue points + green pulse) before starting load
        this.clearGreenPulse();

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
                // --- FIRST CLICK LOGIC ---
                const nearbySeqs = await this.getSequencesInBBox(lon, lat, this.accessToken);
                if (!nearbySeqs.length) {
                    this.showNoImageMessage();
                    return; // finally block will turn off loading
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

                // Update state and draw in strict order:
                // 1. setState availableSequences
                // 2. Callback: drawSequencesOverlay (Background Layer)
                // 3. Callback: loadSequenceById (Foreground Layer)
                this.setState({ availableSequences: fullSeqs }, async () => {
                    this.drawSequencesOverlay();

                    // Find the nearest image in ANY sequence
                    let globalClosest: { seqId: string; imgId: string; dist: number } | null = null;

                    fullSeqs.forEach(seq => {
                        seq.images.forEach(img => {
                            const dist = this.distanceMeters(img.lat, img.lon, lat, lon);
                            if (!globalClosest || dist < globalClosest.dist) {
                                globalClosest = { seqId: seq.sequenceId, imgId: img.id, dist };
                            }
                        });
                    });

                    if (!globalClosest) {
                        this.showNoImageMessage();
                        this.setState({ isLoading: false });
                        return;
                    }

                    // Use the closest sequence & image
                    this.setState({
                        selectedSequenceId: globalClosest.seqId,
                        lon,
                        lat
                    });
                    this.clearNoImageMessage();
                    
                    // Draw Blue Dots ON TOP of Colored Dots
                    await this.loadSequenceById(globalClosest.seqId, globalClosest.imgId);
                    
                    // Explicitly turn off loading here since we are in a callback
                    this.setState({ isLoading: false });
                });

            } else {
                // --- LATER CLICK LOGIC ---
                // Try to use cached sequenceImages; fetch if missing
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
                    return (!closest || dist < closest.dist) 
                        ? { ...img, dist } 
                        : closest;
                }, null as ({ id: string; lat: number; lon: number; dist: number }) | null);

                if (!closestImg) {
                    this.showNoImageMessage();
                    return;
                }
                
                const DISTANCE_THRESHOLD_METERS = 0.5;

                // === CASE A: Click is far -> New Search ===
                if (closestImg.dist > DISTANCE_THRESHOLD_METERS) {
                    const nearbySeqs = await this.getSequencesInBBox(lon, lat, this.accessToken);
                    if (!nearbySeqs.length) {
                        this.showNoImageMessage();
                        return; 
                    }

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

                    // FIXED: Moved loadSequenceById INSIDE the callback to guarantee layering order
                    this.setState({ availableSequences: fullSeqs }, async () => {
                        // 1. Draw Background (Colored Dots)
                        this.drawSequencesOverlay();

                        // 2. Find globally closest image across all returned sequences
                        let globalClosest2: { seqId: string; imgId: string; dist: number } | null = null;

                        fullSeqs.forEach(seq => {
                            seq.images.forEach(img => {
                                const dist = this.distanceMeters(img.lat, img.lon, lat, lon);
                                if (!globalClosest2 || dist < globalClosest2.dist) {
                                    globalClosest2 = { seqId: seq.sequenceId, imgId: img.id, dist };
                                }
                            });
                        });

                        if (!globalClosest2) {
                            this.showNoImageMessage();
                            this.setState({ isLoading: false });
                            return;
                        }

                        this.setState({ selectedSequenceId: globalClosest2.seqId, lon, lat });
                        this.clearNoImageMessage();
                        
                        // 3. Draw Foreground (Blue Dots) - Runs AFTER drawSequencesOverlay
                        await this.loadSequenceById(globalClosest2.seqId, globalClosest2.imgId);
                        
                        this.setState({ isLoading: false });
                    });
                    return; // Exit here, let callback handle the rest
                }

                // === CASE B: Click is NEAR an image in current sequence ===
                console.log("Same sequence within threshold, reusing cached overlay");

                await this.loadSequenceById(selectedSequenceId, closestImg.id, { skipInactiveMarkers: true } as any);

                // Optional: mark “off-point” clicks with a red marker
                const toleranceMeters = 0.5;
                const onSequencePoint = updatedSequence.some(img =>
                    this.distanceMeters(img.lat, img.lon, lat, lon) <= toleranceMeters
                );
                if (!onSequencePoint) {
                    this.drawPoint(lon, lat);
                }
                return;
            }
        } catch (err) {
            console.error("Error in handleMapClick:", err);
        } finally {
            // Note: If we returned early (Case A), this might run before the callback finishes.
            // That is why we added this.setState({ isLoading: false }) inside the callbacks above.
            // This ensures logic that doesn't use callbacks still cleans up.
            if (!this.state.availableSequences || this.state.availableSequences.length === 0) {
                 this.setState({ isLoading: false });
            }
        }
    }

    // --- Fetch nearby sequences (single API call) ---
    // Queries Mapillary Graph API for images within ~5m bbox.
    // Groups them by sequence ID and keeps the earliest captured_at
    // date per sequence for UI dropdown display.
    private async getSequencesInBBox(lon: number, lat: number, accessToken: string) {
        // Increased from 0.00005 (5 meters) 
        const bboxSize = 0.00005;
        const maxDistanceMeters = 50; // Only include sequences within 50m of click
        
        const url = `https://graph.mapillary.com/images?fields=id,geometry,sequence,captured_at&bbox=${
            lon - bboxSize
        },${lat - bboxSize},${lon + bboxSize},${lat + bboxSize}&limit=500`;

        const response = await fetch(url, {
            headers: { Authorization: `OAuth ${accessToken}` }
        });
        const data = await response.json();
        if (!data.data?.length) return [];

        // Group images by sequence ID
        const grouped: Record<string, {
            sequenceId: string;
            images: { id: string; lon: number; lat: number; capturedAt?: string; dist: number }[];
            capturedAt?: string;
            minDistance: number; // Track closest point in this sequence
        }> = {};

        for (const img of data.data) {
            const seqId = img.sequence;
            const coords = img.geometry?.coordinates;
            const capturedAt = img.captured_at;

            if (!seqId || !coords) continue;

            // Calculate distance from clicked point
            const distance = this.distanceMeters(lat, lon, coords[1], coords[0]);
            
            // Skip images too far away
            if (distance > maxDistanceMeters) continue;

            if (!grouped[seqId]) {
                grouped[seqId] = { 
                    sequenceId: seqId, 
                    images: [], 
                    capturedAt,
                    minDistance: distance 
                };
            }

            grouped[seqId].images.push({
                id: img.id,
                lon: coords[0],
                lat: coords[1],
                capturedAt,
                dist: distance
            });

            // Track minimum distance for this sequence
            if (distance < grouped[seqId].minDistance) {
                grouped[seqId].minDistance = distance;
            }

            // keep the earliest capture date for this sequence
            if (!grouped[seqId].capturedAt || (capturedAt && capturedAt < grouped[seqId].capturedAt)) {
                grouped[seqId].capturedAt = capturedAt;
            }
        }

        // Convert to array and sort by distance (closest sequences first)
        return Object.values(grouped).sort((a, b) => a.minDistance - b.minDistance);
    }

    // --- Fetch full coordinate list of a sequence ---
    // Uses sequence_id → image_ids → geometry batch fetch
    // to get lat/lon for all frames in a sequence efficiently.
    private async getSequenceWithCoords(
            sequenceId: string,
            accessToken: string
        ): Promise<{ id: string; lat: number; lon: number }[]> {
            if (this.sequenceCoordsCache[sequenceId]) {
                return this.sequenceCoordsCache[sequenceId];
            }
            try {
                // 1. Get ordered list of IDs
                const url = `https://graph.mapillary.com/image_ids?sequence_id=${sequenceId}`;
                const response = await fetch(url, {
                    headers: { Authorization: `OAuth ${accessToken}` },
                });
                const data = await response.json();
                if (!Array.isArray(data.data)) return [];

                const ids = data.data.map((d: any) => d.id);

                // 2. Batch fetch geometry for these IDs (returns unordered object)
                // Graph API limit is usually high, but for very long sequences we might need chunking. 
                // Assuming sequence length < 2000 images for now.
                const coordUrl = `https://graph.mapillary.com/?ids=${ids.join(",")}&fields=id,geometry`;
                const coordResp = await fetch(coordUrl, {
                    headers: { Authorization: `OAuth ${accessToken}` },
                });
                const coordsData = await coordResp.json();

                // 3. Map original ordered IDs to the fetched geometry
                const coords = ids
                    .map((id: string) => {
                        const value = coordsData[id];
                        if (!value) return null;
                        return {
                            id,
                            lon: value.geometry?.coordinates?.[0] || 0,
                            lat: value.geometry?.coordinates?.[1] || 0,
                        };
                    })
                    .filter((item) => item !== null && item.lon !== 0); // Filter valid

                this.sequenceCoordsCache[sequenceId] = coords; // Cache for session
                return coords;
            } catch (err) {
                console.warn("Error fetching sequence coords:", err);
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
                }}>
                {/* This empty div is controlled by Mapillary, React will never touch its internals */}
                <div
                    ref={this.viewerContainer}
                    style={{width: "100%", height: "100%", position: "relative"}}
                />
                {/* Legend only show if user clicked & image loaded */}
                {this.state.imageId && (
                    <div className="legend-container" style={{
                                position: "absolute",
                                bottom: "10px",
                                left: "6px",
                                background: "rgba(255,255,255,0.3)",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                                fontSize: "9px",
                                fontWeight: "500",
                                display: "flex",
                                flexDirection: "column",  
                                gap: "4px",
                                maxWidth: "160px"
                            }}>
                        {this.state.turboModeActive ? (
                            // Turbo Mode Legend
                            <div className="legend-container-turbo-inner" style={{marginBottom: "4px"}}>
                                <div className="legend-container-turbo-inner-cell">
                                    <span style={legendCircleStyle('green')}></span>
                                    Active frame
                                </div>
                                <div className="legend-container-turbo-inner-cell">
                                    <span style={legendCircleStyle('blue')}></span>
                                    Active sequence images
                                </div>
                                <div className="legend-container-turbo-inner-cell">
                                    <span style={legendCircleStyle('brown')}></span>
                                    All Mapillary coverage
                                </div>
                                <div className="legend-container-turbo-inner-cell">
                                    <span style={{
                                        ...legendCircleStyle('transparent'),
                                        border: '2px solid cyan'
                                    }}></span>
                                    Highlighted feature
                                </div>
                            </div>
                        ) : (
                            // Normal Mode Legend
                            <div className="legend-container-normal-inner">
                                <div style={legendRowStyle}>
                                    <span style={legendCircleStyle('red')}></span>
                                    Clicked location
                                </div>
                                <div style={legendRowStyle}>
                                    <span style={legendCircleStyle('green')}></span>
                                    Active frame
                                </div>
                                <div style={legendRowStyle}>
                                    <span style={legendCircleStyle('blue')}></span>
                                    Active sequence
                                </div>
                                {/* Cache Clear Button */}
                                {!this.state.turboModeActive && (
                                    <button className="legend-container-normal-button" style={{
                                            background: "#d9534f",
                                            color: "#fff",
                                            borderRadius: "3px",
                                            cursor: "pointer",
                                            fontSize: "10px",
                                            padding: "2px 4px",
                                            height: "fit-content"
                                        }} 
                                        onClick={this.clearSequenceCache}>
                                            <span style={{display:"inline"}} className="desktop-text">Clear Sequence Cache</span>
                                            <span style={{display:"none"}} className="mobile-text">Clear</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {this.state.turboLoading && (
                    <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999,
                        color: "#fff",
                        fontSize: "14px"
                    }}>
                        {/* Spinner */}
                        <div style={{
                            border: "4px solid #f3f3f3",
                            borderTop: "4px solid #ffcc00",
                            borderRadius: "50%",
                            width: "36px",
                            height: "36px",
                            animation: "spin 1s linear infinite",
                            marginBottom: "8px"
                        }} />
                        Turbo Mode is loading coverage points…
                        <style>{`
                            @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}

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

                {!this.state.imageId && !this.state.isLoading && !this.state.turboLoading && !this.state.noImageMessageVisible &&  (
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
                     <span style={{fontSize: "11px", fontWeight: "bold"}}>
                          🚫 No nearby Mapillary image found at this location.
                     </span>
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
                {this.state.zoomWarningMessage && (
                    <div style={{
                        position: "absolute",
                        top: "25px",
                        left: "50px",
                        background: "rgba(255,165,0,0.95)",
                        color: "#fff",
                        padding: "6px 10px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                        zIndex: 9999,
                        animation: "fadeIn 0.3s",
                        maxWidth:"100px"
                    }}>
                        ⚠️ {this.state.zoomWarningMessage}
                    </div>
                )}

                {/* Revolver-style sequence picker */}
                {this.state.availableSequences && this.state.availableSequences.length > 1 && (
                <div
                    style={{
                        background: "rgba(7,111,229)",
                        padding: "2px",
                        zIndex: 10000,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        justifyContent: "center"
                    }}
                >
                    {/* Prev arrow, only show if more than 3 sequences */}
                    {this.state.availableSequences.length > 3 && (
                        <button
                            onClick={() => {
                                this.setState(prev => ({
                                    sequenceOffset:
                                    (prev.sequenceOffset! - 1 + this.state.availableSequences!.length) %
                                    this.state.availableSequences!.length
                                }));
                            }}
                            style={{
                                background: "rgba(255,255,255,0.2)",
                                border: "none",
                                color: "#fff",
                                fontSize: "10px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                padding: "2px 6px"
                            }}
                        >
                            ◀
                        </button>
                    )}

                    {/* Sequence slots at most #available, max 3 */}
                    {Array.from({ length: Math.min(3, this.state.availableSequences!.length) }).map((_, slotIdx) => {
                        const seqIndex = (this.state.sequenceOffset! + slotIdx) % this.state.availableSequences!.length;
                        const seq = this.state.availableSequences![seqIndex];
                        const colorArr = seq._color || this.pickSequenceColor(seqIndex);
                        const cssColor = `rgba(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]}, ${colorArr[3] ?? 1})`;
                        const date = seq.capturedAt
                            ? new Date(seq.capturedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                            : "Unknown date";
                        const isActive = this.state.selectedSequenceId === seq.sequenceId;

                        return (
                            <div
                            key={seq.sequenceId}
                            onClick={async () => {
                                this.setState({ selectedSequenceId: seq.sequenceId });
                                this.clearGreenPulse();
                                const { clickLon, clickLat } = this.state;
                                if (clickLon != null && clickLat != null) {
                                    const updatedSequence = await this.getSequenceWithCoords(seq.sequenceId, this.accessToken);
                                    if (updatedSequence.length) {
                                        const closestImg = updatedSequence.reduce((closest, img) => {
                                            const dist = this.distanceMeters(img.lat, img.lon, clickLat, clickLon);
                                            return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                                        }, null as any);
                                        if (closestImg) {
                                            await this.loadSequenceById(seq.sequenceId, closestImg.id);
                                        }
                                    }
                                }
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                background: isActive ? "rgba(255,255,255,0.2)" : "transparent",
                                padding: "4px 6px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                minWidth: "60px"
                            }}
                            >
                            {/* Color swatch */}
                            <span
                                style={{
                                    display: "inline-block",
                                    width: "12px",
                                    height: "12px",
                                    borderRadius: "50%",
                                    backgroundColor: cssColor,
                                    border: "1px solid #fff"
                                }}
                            />
                            {/* Label */}
                            <span style={{ whiteSpace: "nowrap", fontSize:"10px" }}>
                                {seqIndex + 1}. ({date})
                            </span>
                            </div>
                        );
                    })}

                    {/* Next arrow only show if more than 3 sequences */}
                    {this.state.availableSequences.length > 3 && (
                    <button
                        onClick={() => {
                            this.setState(prev => ({
                                sequenceOffset: (prev.sequenceOffset! + 1) % this.state.availableSequences!.length
                            }));
                        }}
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            color: "#fff",
                            fontSize: "10px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            padding: "2px 6px"
                        }}
                    >
                        ▶
                    </button>
                    )}
                </div>
                )}

                {/* Info box */}
                <div className= "info-box"
                    style={{
                        padding: "4px",
                        fontSize: "9px",
                        color: "white",
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "rgba(2, 117, 216, 0.3)",
                        borderRadius: "4px",
						maxWidth: "80px",
                        textAlign: "center"
                    }}
                >
                    {/* {this.state.imageId && <>Image ID: {this.state.imageId}<br/></>}
                    {this.state.sequenceId && <>Sequence ID: {this.state.sequenceId}<br/></>} */}
                    {/* Lat/Lon */}
                    {(() => {
                        if (this.state.imageId && this.state.sequenceImages.length > 0) {
                            const currentImg = this.state.sequenceImages.find(
                                img => img.id === this.state.imageId
                            );
                            if (currentImg) {
                                return (
                                    <div>
                                        📍{" "}Lat: {currentImg.lat.toFixed(6)}<br/>📍{" "}Lon: {currentImg.lon.toFixed(6)}
                                        {this.state.address && <><br/>🌎{" "}{this.state.address}</>}
                                    </div>
                                );
                            }
                        }
                        return null;
                    })()}					

                    {/*TURBO YEAR LEGEND*/}
                    {this.state.turboColorByDate && this.state.turboYearLegend?.length > 0 && (
                        <div style={{ marginTop: "4px", textAlign: "center" }}>
                            <div className="turbo-legend-cbd-title" style={{ fontWeight: "bold", fontSize: "10px", marginBottom: "2px" }}>
                                Date Legend:
                            </div>
                            {this.state.turboYearLegend.map(item => (
                                <div key={item.year} style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2px" }}>
                                    <span className="turbo-legend-cbd-circles" style={{
                                        display: "inline-block",
                                        width: "10px",
                                        height: "10px",
                                        borderRadius: "50%",
                                        backgroundColor: item.color,
                                        marginRight: "4px",
                                        border: "1px solid white"
                                    }}></span>
                                    <span className="turbo-legend-cbd-date-title" style={{ fontSize: "9px" }}>{item.year}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Filter button + optional aux */}
                {/* Show textbox + date + is_pano info when filter mode active */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: 'gold', borderRadius: '5px' }}>
                    {this.state.showTurboFilterBox && (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                        <input
                            type="text"
                            placeholder="Creator username…"
                            value={this.state.turboFilterUsername}
                            onChange={(e) => {
                                const val = e.target.value;
                                this.setState({ turboFilterUsername: val }, () => {
                                    this.debouncedTurboFilter();
                                });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    this.debouncedTurboFilter.cancel?.();
                                    const val = this.state.turboFilterUsername.trim();
                                    if (this.state.jimuMapView && this.state.turboModeActive) {
                                        if (val) {
                                            this.enableTurboCoverageLayer(val);
                                        } else {
                                            this.enableTurboCoverageLayer();
                                        }
                                    }
                                }
                            }}
                            style={{
                                background: 'rgba(255,255,255,0.95)',
                                border: '1px solid #ccc',
                                borderRadius: '999px',
                                padding: '4px 15px 4px 10px', // space for X button
                                marginTop:'2px',
                                fontSize: '8px',
                                width: '100px',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                                transition: 'all 0.2s ease-in-out',
                                boxSizing: 'border-box'
                            }}
                            autoFocus
                            title="Enter a Mapillary creator username to filter coverage points"
                        />

                        {/* Date range filter */}
                        <div style={{ position: 'relative', display: 'inline-block', zIndex: 1000}}>
                            <label style={{ fontSize: '9px', color: 'black', marginLeft:'5px', fontWeight:'500'}}>From:</label>
                            <DatePicker
                                selected={this.state.turboFilterStartDate ? new Date(this.state.turboFilterStartDate) : null}
                                onChange={(date) => {
                                    const dateString = date ? date.toISOString().split('T')[0] : '';
                                    this.setState({ turboFilterStartDate: dateString }, () => {
                                        this.debouncedTurboFilter();
                                    });
                                }}
                                isClearable
                                dateFormat="yyyy-MM-dd"
                                placeholderText="Select start date"
                                popperPlacement="top"
                                showYearDropdown
                                showMonthDropdown
                                dropdownMode="select"
                                yearDropdownItemNumber={50}
                                scrollableYearDropdown
                                popperModifiers={{
                                    preventOverflow: {
                                        enabled: true,
                                        boundariesElement: 'viewport'
                                    }
                                }}
                                customInput={
                                    <button
                                        type="button"
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            padding: '4px',
                                            cursor: 'pointer',
                                            fontSize: '10px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '24px',
                                            height: '20px',
                                            marginLeft: '2px'
                                        }}
                                    >
                                        📅
                                    </button>
                                }
                            />
                        </div>

                        <div style={{ position: 'relative', display: 'inline-block', zIndex: 1000 }}>
                            <label style={{ fontSize: '9px', color: 'black', marginLeft:'5px', fontWeight:'500'}}>To:</label>
                            <DatePicker
                                selected={this.state.turboFilterEndDate ? new Date(this.state.turboFilterEndDate) : null}
                                onChange={(date) => {
                                    const dateString = date ? date.toISOString().split('T')[0] : '';
                                    this.setState({ turboFilterEndDate: dateString }, () => {
                                        this.debouncedTurboFilter();
                                    });
                                }}
                                isClearable
                                dateFormat="yyyy-MM-dd"
                                placeholderText="Select end date"
                                popperPlacement="top"
                                showYearDropdown
                                showMonthDropdown
                                dropdownMode="select"
                                yearDropdownItemNumber={50}
                                scrollableYearDropdown
                                popperModifiers={{
                                    preventOverflow: {
                                        enabled: true,
                                        boundariesElement: 'viewport'
                                    }
                                }}
                                customInput={
                                    <button
                                        type="button"
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            padding: '4px',
                                            cursor: 'pointer',
                                            fontSize: '10px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '24px',
                                            height: '20px',
                                            marginLeft: '2px'
                                        }}
                                    >
                                        📅
                                    </button>
                                }
                            />    
                        </div>

                        {/* Panorama filter - switch style */}
                        <span className="show-panorama-only-filter" style={{ fontSize: '9px', color: 'black', marginLeft:'5px', fontWeight:'500'}}>Show panoramas only: </span>
                        
                        <label style={{ position: 'relative', display: 'inline-block', width: '34px', height: '18px' }}>
                            <input
                                type="checkbox"
                                checked={this.state.turboFilterIsPano === true}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    const val = checked ? true : undefined; // undefined = show all
                                    this.setState({ turboFilterIsPano: val }, () => {
                                        this.debouncedTurboFilter();
                                    });
                                }}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            {/* Slider look */}
                            <span
                                style={{
                                    position: 'absolute',
                                    cursor: 'pointer',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundColor: this.state.turboFilterIsPano ? '#4CAF50' : '#ccc',
                                    transition: '0.4s',
                                    borderRadius: '34px'
                                }}
                            >
                            <span
                                style={{
                                    position: 'absolute',
                                    height: '14px',
                                    width: '14px',
                                    left: this.state.turboFilterIsPano ? '18px' : '4px',
                                    bottom: '2px',
                                    backgroundColor: 'white',
                                    transition: '0.4s',
                                    borderRadius: '50%'
                                }}
                            />
                            </span>
                        </label>

                        {this.state.turboFilterUsername && (
                            <button
                            onClick={() => {
                                this.setState({ turboFilterUsername: "" }, () => {
                                    this.enableTurboCoverageLayer();
                                });
                            }}
                            style={{
                                    position: 'absolute',
                                    left: '80px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    cursor: 'pointer',
                                    border: 'none',
                                    padding: 0,
                                    fontSize: '14px',
                                    color: '#888',
                                    background: 'transparent',
                                    lineHeight: 1,
                                    height: '16px',
                                    width: '16px'
                                }}
                            title="Clear filter"
                            >
                            ×
                            </button>
                        )}
                        {/* Date-based coloring toggle */}
                        <span className="show-color-by-date-filter" style={{ fontSize: '9px', color: 'black', marginLeft:'5px', fontWeight:'500'}}> Color by date: </span>
                        
                        <label style={{ position: 'relative', display: 'inline-block', width: '34px', height: '18px' }}>
                            <input
                                type="checkbox"
                                checked={this.state.turboColorByDate === true}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    this.setState({ turboColorByDate: checked }, () => {
                                        this.debouncedTurboFilter();
                                    });
                                }}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            {/* Slider look */}
                            <span
                                style={{
                                    position: 'absolute',
                                    cursor: 'pointer',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundColor: this.state.turboColorByDate ? '#4CAF50' : '#ccc',
                                    transition: '0.4s',
                                    borderRadius: '34px'
                                }}
                            >
                                <span
                                    style={{
                                        position: 'absolute',
                                        height: '14px',
                                        width: '14px',
                                        left: this.state.turboColorByDate ? '18px' : '4px',
                                        bottom: '2px',
                                        backgroundColor: 'white',
                                        transition: '0.4s',
                                        borderRadius: '50%'
                                    }}
                                />
                            </span>
                        </label>
                        </div>
                    )}
                    {/* Traffic Signs Filter Box */}
                    {this.state.showTrafficSignsFilterBox && (
                    <div style={{
                            position: 'relative',
                            display: 'inline-block',
                            background: 'orange',
                            padding: '3px',
                            borderRadius: '4px',
                            overflow: 'visible' // allow drop-up menu to show
                        }}>
                        <Select
                        value={this.state.trafficSignsFilterValue} 
                        onChange={async (selected) => {
                            this.setState({ trafficSignsFilterValue: selected }, async () => {
                                if (!this.state.jimuMapView) return;

                                const newName = selected.value; // use .value from the object
                                let filterCode: string;
                                
                                if (newName === "All traffic signs") {
                                    filterCode = "All traffic signs";
                                } else {
                                    const spriteBaseUrl =
                                    "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";
                                    const jsonResp = await fetch(`${spriteBaseUrl}.json`);
                                    const spriteData = await jsonResp.json();
                                    const code = Object.keys(spriteData).find(c => this.formatTrafficSignName(c) === newName);
                                    filterCode = code || newName;
                                }

                                this.filterTrafficSignsVTLayer(filterCode);

                                // Remove stale FeatureLayer immediately when filter changes
                                if (this.mapillaryTrafficSignsFeatureLayer && this.state.jimuMapView.view.map.layers.includes(this.mapillaryTrafficSignsFeatureLayer)) {
                                    this.state.jimuMapView.view.map.remove(this.mapillaryTrafficSignsFeatureLayer);
                                }
                                this.mapillaryTrafficSignsFeatureLayer = null;

                                // If we're zoomed in >= 16 AND layer active → fetch immediately
                                if (
                                    this.state.trafficSignsActive && this.state.jimuMapView.view.zoom >= 16
                                ) {
                                    this._cancelTrafficSignsFetch = false;
                                    await this.loadMapillaryTrafficSignsFromTilesBBox(true);
                                    if (this.mapillaryTrafficSignsFeatureLayer) {
                                        this.state.jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
                                    }
                                }

                                // Simulate a minimal pan to trigger stationary watcher refresh
                                const view = this.state.jimuMapView.view;
                                if (view) {
                                    const currentCenter = view.center.clone();
                                    const newCenter = currentCenter.offset(0.0005, 0); // tiny shift east
                                    view.goTo(
                                        {
                                            center: newCenter,
                                            zoom: view.zoom
                                        },
                                        { animate: false }
                                    );
                                }
                            });
                        }}
                        options={this.state.trafficSignsOptions}
                        formatOptionLabel={(option) => (
                            <div style={{ display: 'flex', alignItems: 'center' }}
                                title={option.label}>
                                {option.iconUrl && (
                                    <img
                                        src={option.iconUrl}
                                        alt=""
                                        style={{width: 20, height: 20, marginRight: 8, objectFit: 'contain'}}
                                    />
                                )}
                                <span
                                    style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: 120
                                    }}
                                    title={option.label} // show full name on hover
                                >
                                    {option.label}
                                </span>
                            </div>
                        )}
                        menuPlacement="top"  // force drop-up for mobile
                        styles={{
                            container: base => ({...base, width: '150px', fontSize: '10px'}),
                            control: base => ({...base, minHeight: '34px', height: '34px', fontSize: '10px'}),
                            menu: base => ({...base, zIndex: 10005}),
                            menuList: base => ({
                                ...base, 
                                maxHeight: '250px', 
                                // Mobile override
                                '@media only screen and (max-width: 768px)': {
                                    maxHeight: '180px' 
                                }
                            })
                        }}
                        />
                    </div>
                    )}

                    {/* Objects Filter Box */}
                    {this.state.showObjectsFilterBox && (
                    <div style={{
                            position: 'relative',
                            display: 'inline-block',
                            background: 'red',
                            padding: '3px',
                            borderRadius: '4px',
                            overflow: 'visible'
                        }}>
                        <Select
                        value={this.state.objectsFilterValue}      // object, not string
                        onChange={async (selected) => {
                            this.setState({ objectsFilterValue: selected }, async () => {
                                if (!this.state.jimuMapView) return;

                                const newName = selected.value; // safe: from object
                                let filterCode: string;
                                if (newName === "All points") {
                                    filterCode = "All points";
                                } else {
                                    const spriteBaseUrl =
                                    "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";
                                    const jsonResp = await fetch(`${spriteBaseUrl}.json`);
                                    const spriteData = await jsonResp.json();
                                    const code = Object.keys(spriteData).find(c => (this.objectNameMap[c] || c) === newName);
                                    filterCode = code || newName;
                                }

                                this.filterObjectsVTLayer(filterCode);

                                if (
                                    this.state.objectsActive &&
                                    this.state.jimuMapView.view.zoom >= 16
                                ) {
                                    if (this.mapillaryObjectsFeatureLayer && this.state.jimuMapView.view.map.layers.includes(this.mapillaryObjectsFeatureLayer)) {
                                        this.state.jimuMapView.view.map.remove(this.mapillaryObjectsFeatureLayer);
                                    }
                                    await this.loadMapillaryObjectsFromTilesBBox(true);
                                    if (this.mapillaryObjectsFeatureLayer) {
                                        this.state.jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
                                    }
                                }

                                const view = this.state.jimuMapView.view;
                                if (view) {
                                    const currentCenter = view.center.clone();
                                    const newCenter = currentCenter.offset(0.0005, 0);
                                    view.goTo({ center: newCenter, zoom: view.zoom }, { animate: false });
                                }
                            });
                        }}
                        options={this.state.objectsOptions}  // array of objects
                        formatOptionLabel={(option) => (
                            <div style={{ display: 'flex', alignItems: 'center' }}
                            title={option.label}>
                            {option.iconUrl && (
                                <img
                                src={option.iconUrl}
                                alt=""
                                style={{ width: 20, height: 20, marginRight: 8, objectFit: 'contain'}}
                                />
                            )}
                            <span
                                style={{
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: 120
                                }}
                                title={option.label}
                            >
                                {option.label}
                            </span>
                            </div>
                        )}
                        menuPlacement="top"
                        styles={{
                            container: base => ({...base, width: '150px', fontSize: '10px'}),
                            control: base => ({...base, minHeight: '34px', height: '34px', fontSize: '10px'}),
                            menu: base => ({...base, zIndex: 10005}),
                            menuList: base => ({
                                ...base,
                                maxHeight: '250px', 
                                '@media only screen and (max-width: 768px)': {
                                    maxHeight: '180px' 
                                }
                            })
                        }}
                        />
                    </div>
                    )}
                </div>

                {/* Splash(Intro) Screen */}
                {this.state.showIntro && (
                    <div style={{
                        position: "absolute",
                        top: 0, left: 0, width: "100%", height: "100%",
                        background: "rgba(0,0,0,0.9)", 
                        zIndex: 20000,
                        display: "flex",
                        flexDirection: "column", // Stacks Logo -> Spinner -> Text
                        justifyContent: "center", // Centers vertically
                        alignItems: "center",     // Centers horizontally
                        color: "white",
                        backdropFilter: "blur(5px)",
                        opacity: this.state.filtersLoaded ? 0 : 1, 
                        transition: "opacity 0.8s ease-in-out", 
                        pointerEvents: "none" 
                    }}>
                        {/* --- LOGO --- */}
                        <img className="splash-screen-logo"
                            src="https://images2.imgbox.com/ec/73/iwr0gH9D_o.gif" 
                            alt="Logo"
                            style={{
                                width: "120px",       // Adjust size as needed
                                height: "auto",       // Maintains aspect ratio
                                marginBottom: "30px", // Space between logo and spinner
                                objectFit: "contain",  // Prevents stretching
                                borderRadius: "50%"
                            }}
                        />

                        {/* Spinner */}
                        <div className="splash-screen-spinner" style={{
                            width: "50px", height: "50px",
                            border: "4px solid rgba(255,255,255,0.2)",
                            borderTop: "4px solid #35AF6D", 
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            marginBottom: "20px"
                        }} />
                        
                        {/* Text */}
                        <div className="splash-screen-text" style={{ 
                            fontWeight: "700", 
                            fontSize: "18px", 
                            letterSpacing: "1px",
                        }}>
                            MAPILLARY EXPLORER
                        </div>
                        <div style={{ 
                            fontSize: "11px", 
                            opacity: 0.7, 
                            marginTop: "6px", 
                            fontStyle: "italic" 
                        }}>
                            Preparing assets...
                        </div>

                        <style>{`
                            @keyframes spin { 
                                0% { transform: rotate(0deg); } 
                                100% { transform: rotate(360deg); } 
                            }
                        `}</style>
                    </div>
                )}

                {/* Unified control buttons container */}
                <div
                    style={{
                        position: 'absolute',
                        top: '2px',
                        left: '2px',
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        padding: '4px',
                        borderRadius: '8px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                    }}
                    >
                    {/* Individual buttons (no grouping) */}
                    {[
                        {
                            emoji: '🗖', 
                            onClick: this.toggleFullscreen, 
                            title: 'Maximize/Fullscreen', 
                            bg: 'rgba(2, 117, 216, 0.9)', 
                            active: this.state.isFullscreen
                        },
                        {
                            emoji: '🗺️', 
                            onClick: this.toggleMapillaryTiles, 
                            title: 'Toggle Mapillary Layer', 
                            bg: 'rgba(53, 175, 109, 0.9)', 
                            active: this.state.tilesActive
                        }
                    ].map((btn, i) => (
                            <button className="unified-control-buttons-mapped"
                                key={i}
                                title={btn.title}
                                onClick={btn.onClick}
                                style={{
                                    background: btn.active ? btn.bg : btn.bg.replace('0.9', '0.5'),
                                    color: '#fff',
                                    width: '26px',
                                    height: '26px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '18px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: btn.active
                                        ? '0 0 6px rgba(255,255,255,0.8)'
                                        : '0 2px 4px rgba(0,0,0,0.3)',
                                    transform: btn.active ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = btn.active ? 'scale(1.1)' : 'scale(1)')}
                            >
                                {btn.emoji}
                            </button>
                        ))
                    }

                    {/* Turbo Mode Group */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        borderRadius: '6px',
                        background: this.state.turboModeActive ? 'rgba(255,215,0,0.2)' : 'rgba(100,100,100,0.1)',
                        border: this.state.turboModeActive ? '1px solid rgba(255,215,0,0.4)' : '1px solid transparent'
                    }}>
                        {/* Main Turbo Button */}
                        {!this.props.config.turboModeOnly && (
                            <button className="unified-control-buttons"
                                title="Turbo Mode - Click coverage features directly"
                                onClick={async () => {
                                    const next = !this.state.turboModeActive;
                                    this.setState({ turboModeActive: next });

                                    if (next) {
                                        const view = this.state.jimuMapView?.view;
                                        if (this.state.jimuMapView?.view.zoom! < 16) {
                                            this.showZoomWarning("Zoom in closer (≥ 16) to view Mapillary coverage point features in Turbo Mode.");
                                        }
                                        this.clearSequenceUI();
                                        if (view) {
                                            // wait until view is stable (critical for correct tile fetching)
                                            await view.when();
                                            await view.when(() => view.stationary === true);
                                        }
                                        // now extent is correct, first coverage load will be immediate
                                        this.enableTurboCoverageLayer();

                                        if (this.state.jimuMapView) {
                                            if (this.turboStationaryHandle) {
                                                this.turboStationaryHandle.remove();
                                                this.turboStationaryHandle = null;
                                            }
                                            this.turboStationaryHandle = this.state.jimuMapView.view.watch(
                                                "stationary",
                                                this.debounce(async (isStationary) => {
                                                    if (isStationary && this.state.turboModeActive) {
                                                        if (this.state.jimuMapView.view.zoom < 16) return;
                                                        // use filter if entered
                                                        const filter = this.state.turboFilterUsername.trim();
                                                        if (filter) {
                                                            await this.enableTurboCoverageLayer(filter);
                                                        } else {
                                                            await this.enableTurboCoverageLayer();
                                                        }
                                                    }
                                                }, 500)
                                            );

                                            if (this.turboZoomHandle) {
                                                this.turboZoomHandle.remove();
                                                this.turboZoomHandle = null;
                                            }

                                            this.turboZoomHandle = this.state.jimuMapView.view.watch("zoom", (z) => {
                                                const minTurboZoom = 16;
                                                if (this.state.turboModeActive && z < minTurboZoom) {
                                                    this.disableTurboCoverageLayer();
                                                }
                                            });
                                        }
                                    } else {
                                        this.disableTurboCoverageLayer();
                                        // Remove any watchers
                                        if (this.turboStationaryHandle) {
                                            this.turboStationaryHandle.remove();
                                            this.turboStationaryHandle = null;
                                        }
                                        if (this.turboZoomHandle) {
                                            this.turboZoomHandle.remove();
                                            this.turboZoomHandle = null;
                                        }
                                        
                                        // This completely resets the viewer, graphics, and local storage
                                        this.clearSequenceCache(); 

                                        // Reset ALL Turbo-related state values
                                        this.setState({
                                            turboFilterUsername: "",
                                            turboFilterStartDate: "",
                                            turboFilterEndDate: "",
                                            turboFilterIsPano: undefined,
                                            turboColorByDate: false,
                                            turboYearLegend: [],
                                            showTurboFilterBox: false
                                        });
                                    }
                                }}
                                style={{
                                    background: this.state.turboModeActive ? 'rgba(255,215,0,0.9)' : 'rgba(255,215,0,0.5)',
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
                                    boxShadow: this.state.turboModeActive
                                        ? '0 0 6px rgba(255,255,255,0.8)'
                                        : '0 2px 4px rgba(0,0,0,0.3)',
                                    transform: this.state.turboModeActive ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = this.state.turboModeActive ? 'scale(1.1)' : 'scale(1)')}
                            >
                                ⚡
                            </button>
                        )}  

                        {/* Turbo Filter Button */}
                        <button className="unified-control-buttons-filters"
                            title="Filter Turbo Coverage by Username"
                            onClick={() => {
                                if (!this.state.turboModeActive) return;
                                this.setState(prev => ({ showTurboFilterBox: !prev.showTurboFilterBox }));
                            }}
                            style={{
                                background: this.state.turboModeActive 
                                    ? (this.state.showTurboFilterBox ? 'rgba(255,215,0,0.9)' : 'rgba(255,215,0,0.3)')
                                    : 'rgba(200,200,200,0.3)',
                                color: '#fff',
                                height: this.props.config.turboModeOnly ? '25px' : '20px',
                                width: this.props.config.turboModeOnly ? '25px' : '20px', 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: this.props.config.turboModeOnly ? '6px' : '4px',
                                border: 'none',
                                cursor: this.state.turboModeActive ? 'pointer' : 'not-allowed',
                                opacity: this.state.turboModeActive ? 1 : 0.5,
                                boxShadow: this.state.showTurboFilterBox
                                    ? '0 0 4px rgba(255,255,255,0.6)'
                                    : '0 1px 2px rgba(0,0,0,0.2)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <img
                                src={`data:image/svg+xml;utf8,
                                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                                    <path d='M3 4h18L14 12v7l-4 2v-9L3 4z' fill='%23fff'/>
                                </svg>`}
                                style={{ width: 14, height: 14 }}
                            />
                        </button>
                    </div>

                    {/* Traffic Signs Group */}
                    {this.props.config.enableTrafficSigns !== false && (
                        <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                borderRadius: '6px',
                                background: this.state.trafficSignsActive ? 'rgba(255,165,0,0.2)' : 'rgba(100,100,100,0.1)',
                                border: this.state.trafficSignsActive ? '1px solid rgba(255,165,0,0.4)' : '1px solid transparent'
                            }}>
                            {/* Main Traffic Signs Button */}
                            <button className="unified-control-buttons"
                                title="Toggle Traffic Signs Coverage Layer"
                                onClick={this.toggleMapillaryTrafficSigns}
                                style={{
                                    background: this.state.trafficSignsActive ? 'rgba(255, 165, 0, 0.9)' : 'rgba(255, 165, 0, 0.5)',
                                    color: '#fff',
                                    width: '25px',
                                    height: '25px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: this.state.trafficSignsActive
                                        ? '0 0 6px rgba(255,255,255,0.8)'
                                        : '0 2px 4px rgba(0,0,0,0.3)',
                                    transform: this.state.trafficSignsActive ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = this.state.trafficSignsActive ? 'scale(1.1)' : 'scale(1)')}
                            >
                                <img className="unified-button-controls-svg-icons"
                                    src={`data:image/svg+xml;charset=utf-8,%3Csvg width='16' height='16' 
                                        viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E 
                                        %3Crect width='5' height='7' fill='%23FFC01B'/%3E %3Crect x='4' y='9' 
                                        width='7' height='7' rx='3.5' fill='white'/%3E %3Cpath d='M12.5 0L15.5311 
                                        1.75V5.25L12.5 7L9.46891 5.25V1.75L12.5 0Z' fill='%23FF6D1B'/%3E %3C/svg%3E`}
                                    alt="Traffic Sign Icon"
                                    style={{ width: '16px', height: '16px' }}
                                />
                            </button>

                            {/* Traffic Signs Filter Button */}
                            <button className="unified-control-buttons-filters"
                                title="Filter Traffic Signs"
                                onClick={() => {
                                    if (!this.state.trafficSignsActive) return;
                                    this.setState(prev => ({ showTrafficSignsFilterBox: !prev.showTrafficSignsFilterBox }));
                                }}
                                style={{
                                    background: this.state.trafficSignsActive 
                                        ? (this.state.showTrafficSignsFilterBox ? 'rgba(255,165,0,0.9)' : 'rgba(255,165,0,0.3)')
                                        : 'rgba(200,200,200,0.3)',
                                    color: '#fff',
                                    width: '20px',
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    cursor: this.state.trafficSignsActive ? 'pointer' : 'not-allowed',
                                    opacity: this.state.trafficSignsActive ? 1 : 0.5,
                                    boxShadow: this.state.showTrafficSignsFilterBox
                                        ? '0 0 4px rgba(255,255,255,0.6)'
                                        : '0 1px 2px rgba(0,0,0,0.2)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                🔍
                            </button>
                        </div>
                    )}

                    {/* Objects Group */}
                    {this.props.config.enableMapillaryObjects !== false && (
                        <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                borderRadius: '6px',
                                background: this.state.objectsActive ? 'rgba(255,0,0,0.2)' : 'rgba(100,100,100,0.1)',
                                border: this.state.objectsActive ? '1px solid rgba(255,0,0,0.4)' : '1px solid transparent'
                            }}>
                            {/* Main Objects Button */}
                            <button className="unified-control-buttons"
                                title="Toggle Mapillary Objects Layer"
                                onClick={this.toggleMapillaryObjects}
                                style={{
                                    background: this.state.objectsActive ? 'rgba(255, 0, 0, 0.9)' : 'rgba(255, 0, 0, 0.5)',
                                    color: '#fff',
                                    width: '25px',
                                    height: '25px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: this.state.objectsActive
                                        ? '0 0 6px rgba(255,255,255,0.8)'
                                        : '0 2px 4px rgba(0,0,0,0.3)',
                                    transform: this.state.objectsActive ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = this.state.objectsActive ? 'scale(1.1)' : 'scale(1)')}
                            >
                                <img className="unified-button-controls-svg-icons"
                                    src={`data:image/svg+xml;charset=utf-8,%3Csvg width='16' height='16' 
                                        viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E 
                                        %3Ccircle cx='3' cy='3' r='3' fill='%2346CDFA'/%3E %3Ccircle cx='13' cy='3
                                        ' r='3' fill='%23FFB81A'/%3E %3Ccircle cx='3' cy='13' r='3'
                                        fill='%23F35700'/%3E %3Ccircle cx='13' cy='13' r='3' fill='%23D99AB9'/%3E
                                        %3Ccircle cx='8' cy='8' r='3' fill='%23D2DCE0'/%3E %3C/svg%3E`}
                                    alt="Map Objects Icon"
                                    style={{ width: '16px', height: '16px' }}
                                />
                            </button>

                            {/* Objects Filter Button */}
                            <button className="unified-control-buttons-filters"
                                title="Filter Objects"
                                onClick={() => {
                                    if (!this.state.objectsActive) return;
                                    this.setState(prev => ({ showObjectsFilterBox: !prev.showObjectsFilterBox }));
                                }}
                                style={{
                                    background: this.state.objectsActive 
                                        ? (this.state.showObjectsFilterBox ? 'rgba(255,0,0,0.9)' : 'rgba(255,0,0,0.3)')
                                        : 'rgba(200,200,200,0.3)',
                                    color: '#fff',
                                    width: '20px',
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    cursor: this.state.objectsActive ? 'pointer' : 'not-allowed',
                                    opacity: this.state.objectsActive ? 1 : 0.5,
                                    boxShadow: this.state.showObjectsFilterBox
                                        ? '0 0 4px rgba(255,255,255,0.6)'
                                        : '0 1px 2px rgba(0,0,0,0.2)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                🔍
                            </button>
                        </div>
                    )}
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
                
                {/* Minimap Container */}
                <div
                    ref={this.minimapContainer}
                    className="minimap-container"
                    style={{
                        position: 'absolute',
                        bottom: '40px',
                        right: '60px',
                        width: '250px',
                        height: '200px',
                        border: '2px solid #fff',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                        zIndex: 10001
                    }}
                />
            </div>,
            document.body
        );
        /** Return either normal or fullscreen layout */
        return this.state.isFullscreen ? fullscreenMode : normalMode;
    }