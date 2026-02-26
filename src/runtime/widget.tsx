/** @jsx jsx */
import { React, AllWidgetProps, jsx } from "jimu-core";
import { JimuMapViewComponent, JimuMapView, loadArcGISJSAPIModules, MapViewManager } from "jimu-arcgis";
import ReactDOM from "react-dom";
import * as webMercatorUtils from "esri/geometry/support/webMercatorUtils";
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { objectNameMap } from "../helpers/mapillaryObjectNameMap";
import * as Icons from './components/icons'
import { legendCircleStyle, glassStyles, getGlassSelectStyles, mobileOverrideStyles } from "../helpers/styles";
import { Viewer, OutlineTag, PolygonGeometry } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';


// --- React component state ---
// Holds current map view, image/sequence data, viewer state,
// and temporary interaction information like clicks or loading flags.
interface State {
    jimuMapView: JimuMapView | null;
    imageId: string | null;
    sequenceId: string | null;
    sequenceImages: { id: string; lat: number; lon: number; captured_at?: number }[];
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
    noImageMessageVisible: boolean;
    turboFilterUsername: string;
    showTurboFilterBox: boolean;
    trafficSignsOptions: Array<{ value: string; label: string; iconUrl: string | null }>;
    showTrafficSignsFilterBox: boolean;
    objectsOptions: Array<{ value: string; label: string; iconUrl: string | null }>;
    showObjectsFilterBox: boolean;
    hoveredMapObject?: {
        x: number;
        y: number;
        objectName: string;
        firstSeen: string;
        lastSeen: string;
    } | null;
    currentZoom?: number;
    hasTimeTravel: boolean; 
    isDownloading?: boolean;
    selectedTurboYear?: string | null;
    showMinimap: boolean;
    detectionsActive: boolean;
    showAiTags: boolean;
    isSharedState: boolean;
    alternateImages: Array<{
        id: string;
        detectionId: string;
        thumbUrl: string;
        capturedAt: number;
        geometry: { type: "Point"; coordinates: [number, number] };
    }>;
    selectedFeatureLocation: { lat: number; lon: number } | null;
    isFetchingAlternates: boolean;
    targetDetectionId: string | null;
    syncHeading: boolean;
}

export default class Widget extends React.PureComponent<
    AllWidgetProps<any>,
    State
> {
    viewerContainer = React.createRef<HTMLDivElement>();
    minimapContainer = React.createRef<HTMLDivElement>();
    
    mapillaryViewer: any = null;
    ArcGISModules: any = null;
    
    // Graphics references
    private currentGreenGraphic: __esri.Graphic | null = null;
    private currentConeGraphic: __esri.Graphic | null = null;
    private clickedLocationGraphic: __esri.Graphic | null = null;
    private _directionHoverGraphic: __esri.Graphic | null = null;
    
    // Observers and handles
    private resizeObserver: ResizeObserver | null = null;
    private mapClickHandle: IHandle | null = null;
    private pointerMoveHandle: IHandle | null = null;
    private minimapWatchHandle: __esri.WatchHandle | null = null;
    
    // Missing layer handles
    private objectsStationaryHandle: IHandle | null = null;
    private trafficSignsStationaryHandle: IHandle | null = null;
    private trafficSignsZoomHandle: __esri.WatchHandle | null = null;
    private objectsZoomHandle: __esri.WatchHandle | null = null;
    private turboStationaryHandle: IHandle | null = null;
    private turboZoomHandle: __esri.WatchHandle | null = null;
    private highlightHandle: any = null;
    
    // Cancellation flags
    private _cancelTrafficSignsFetch: boolean = false;
    private _cancelObjectsFetch: boolean = false;
    
    // Layers
    private accessToken: string = "";
    private mapillaryVTLayer: __esri.VectorTileLayer | null = null;
    private mapillaryTrafficSignsLayer: __esri.VectorTileLayer | null = null;
    private mapillaryObjectsLayer: __esri.VectorTileLayer | null = null;
    
    // Missing layer properties
    private mapillaryTrafficSignsFeatureLayer: __esri.FeatureLayer | null = null;
    private mapillaryObjectsFeatureLayer: __esri.FeatureLayer | null = null;
    private turboCoverageLayer: __esri.FeatureLayer | null = null;
    private turboCoverageLayerView: __esri.LayerView | null = null;
    
    // UI elements
    private tooltipDiv: HTMLDivElement | null = null;
    private minimapView: __esri.MapView | null = null;
    private minimapGraphicsLayer: __esri.GraphicsLayer | null = null;
    
    // Caches and timeouts
    private sequenceCoordsCache: Record<string, {id: string, lat: number, lon: number}[]> = {};
    private directionImageCache: Record<string, { lon: number; lat: number }> = {};
    private _hoverTimeout: any = null;
    private _zoomWarningTimeout: any = null;
    private _currentHoveredFeatureId: string | null = null;
    private _currentDirectionHoverId: string | null = null;
    private _directionUnsubscribe: (() => void) | null = null;
    private detectionTagMap: Map<string, string> = new Map();

    // Backup arrays to reset filter dropdowns to their initial state
    private _fullTrafficSignsOptions: Array<{ value: string; label: string; iconUrl: string | null }> = [];
    private _fullObjectsOptions: Array<{ value: string; label: string; iconUrl: string | null }> = [];
    
    // Camera settings
    private coneSpreads = [60, 40, 30, 20];
    private coneLengths = [10, 15, 20, 30];
    private zoomStepIndex = 0;
    private _lastBearing: number = 0;
    
    // Debounced function
    private debouncedTurboFilter: (() => void) & { cancel?: () => void };
    private zoomDisplayHandle: __esri.WatchHandle | null = null;

    // Request tracking
    private _turboRequestCount: number = 0;
    private _hasCheckedSharedState: boolean = false;
    private _isFlyInActive: boolean = false;
    private _hasAttemptedMapSwitch: boolean = false;

    private _turboHoverGraphic: __esri.Graphic | null = null;
    private _turboHoverInterval: any = null;
    private _lastHoveredTurboOid: number | null = null;

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
        turboFilterIsPano: undefined,
        showTurboFilterBox: false,
        turboYearLegend: [],
        showTrafficSignsFilterBox: false,
        trafficSignsFilterValue: { value: "All traffic signs", label: "All traffic signs", iconUrl: null },
        trafficSignsOptions: [{ value: "All traffic signs", label: "All traffic signs", iconUrl: null }],
        showObjectsFilterBox: false,
        objectsFilterValue: { value: "All points", label: "All points", iconUrl: null },
        objectsOptions: [{ value: "All points", label: "All points", iconUrl: null }],
        filtersLoaded: false,
        showIntro: true,
        hoveredMapObject: null,
        hasTimeTravel: false,
        showMinimap: true,
        detectionsActive: false,
        showAiTags: true,
        isSharedState: false,
        alternateImages: [],
        selectedFeatureLocation: null,
        isFetchingAlternates: false,
        targetDetectionId: null,
        syncHeading: false
    };

    constructor(props: AllWidgetProps<any>) {
        super(props);
		
		// Read accessToken from manifest.json properties - you should use your own token start with MLY
		this.accessToken = props.manifest?.properties?.mapillaryAccessToken || "";
		this.log("Loaded Access Token:", this.accessToken);
        
        // Wrap the layer reload logic in debounce (700ms delay after typing stops)
        this.debouncedTurboFilter = this.debounce(async () => {
        if (this.state.jimuMapView && this.state.turboModeActive) {
                await this.enableTurboCoverageLayer();
            }
        }, 700);

        this.onActiveViewChange = this.onActiveViewChange.bind(this);
        this.handleMapClick = this.handleMapClick.bind(this);
    }

    // Binds events (cone drawing, zoom, image changes) to the current viewer instance.
    private bindMapillaryEvents() {
        if (!this.mapillaryViewer) return;

        // Clear any existing green pulse before binding new events
        this.clearGreenPulse();
        
        // Also clear any existing cone graphics
        this.clearConeGraphics();

        // Define local redraw helper - pass specific coordinates
        const redrawCone = async (lon?: number, lat?: number) => {
            const view = this.state.jimuMapView?.view;
            if (!view) return;

            // If Turbo Mode is active and no specific sequence is selected,
            // we should not draw the camera cone.
            if (this.state.turboModeActive && !this.state.selectedSequenceId) {
                this.clearConeGraphics(); // ← was: view.graphics.remove(this.currentConeGraphic)
                return;
            }

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

            // remove ALL cone faces, not just the sentinel
            this.clearConeGraphics();

            // Draw fresh cone
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

        // Setup Direction Component Hover with delay
        setTimeout(() => {
            this.setupDirectionHover();
        }, 500); // 500ms delay to ensure component is loaded

        // 2. Bearing Change Event
        this.mapillaryViewer.on("bearing", (event: any) => {
            this._lastBearing = event.bearing;
            redrawCone();
            // Update minimap tracking to show new bearing
            this.updateMinimapTracking();

            const view = this.state.jimuMapView?.view;
            if (view && view.type === "3d" && 
                this.props.config.syncMapWithImage === true && 
                !this._isFlyInActive && 
                this.state.syncHeading) {
                
                view.goTo({ heading: event.bearing }, { animate: false });
            }
        });

        // 3. Image Change Event
        this.mapillaryViewer.on("image", async (event: any) => {
            // Apply custom angle if set in config
            this.applyCustomCameraAngle();
            const newId = event.image.id;
            const view = this.state.jimuMapView?.view;
            if (!view) return;

            // Check if this image is in our current sequence
            let newImg = this.state.sequenceImages.find(s => s.id === newId);
            let didLateralJump = false; // Track if we jumped to a new sequence
            
            // If not found (lateral movement to different sequence), fetch the new sequence
            if (!newImg) {
                this.log("Image not in current sequence, fetching new sequence data...");
                didLateralJump = true; // Mark that we're doing a lateral jump
                
                try {
                    // Fetch the sequence ID for this image
                    const resp = await fetch(`https://graph.mapillary.com/${newId}?fields=sequence,geometry`, {
                        headers: { Authorization: `OAuth ${this.accessToken}` }
                    });
                    
                    if (resp.ok) {
                        const data = await resp.json();
                        const newSeqId = data.sequence;
                        const coords = data.geometry?.coordinates;
                        
                        if (newSeqId && coords) {
                            // Fetch full sequence coordinates
                            const newSequenceImages = await this.getSequenceWithCoords(newSeqId, this.accessToken);
                            
                            // Update state with new sequence
                            this.setState({
                                sequenceId: newSeqId,
                                selectedSequenceId: newSeqId,
                                sequenceImages: newSequenceImages
                            });
                            
                            // Save to cache
                            this.saveSequenceCache(newSeqId, newSequenceImages);
                            
                            // Find the new image in the updated sequence
                            newImg = newSequenceImages.find(s => s.id === newId);
                            
                            // Redraw sequence graphics
                            if (newImg) {
                                // Clear green pulse first
                                this.clearGreenPulse();
                                
                                // Clear ALL old graphics (including old sequence overlay)
                                const toRemove: __esri.Graphic[] = [];
                                view.graphics.forEach(g => {
                                    toRemove.push(g);
                                });
                                toRemove.forEach(g => view.graphics.remove(g));
                                
                                // Draw new sequence polyline
                                if (newSequenceImages.length > 1) {
                                    const { Graphic } = this.ArcGISModules;
                                    const paths = newSequenceImages.map(img => [img.lon, img.lat]);
                                    
                                    const polylineGraphic = new Graphic({
                                        geometry: { type: "polyline", paths: [paths], spatialReference: { wkid: 4326 } },
                                        symbol: { type: "simple-line", color: [0, 0, 255, 0.8], width: 3 },
                                        attributes: { sequenceId: newSeqId }
                                    });
                                    (polylineGraphic as any).__isSequenceOverlay = true;
                                    view.graphics.add(polylineGraphic);
                                }
                                
                                // Draw new sequence points
                                newSequenceImages.forEach(img => {
                                    if (img.id !== newId) {
                                        this.drawPointWithoutRemoving(img.lon, img.lat, [0, 0, 255, 1], newSeqId);
                                    }
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch lateral sequence:", err);
                    return; // Exit if we can't load the new sequence
                }
            }
            
            if (!newImg) {
                console.warn("Could not locate image coordinates");
                return;
            }

            // Turn previous active into static blue point ONLY if staying in same sequence
            if (this.state.imageId && this.state.imageId !== newId && !didLateralJump) {
                const prevImg = this.state.sequenceImages.find(s => s.id === this.state.imageId);
                if (prevImg) {
                    this.clearGreenPulse();
                    this.drawPointWithoutRemoving(prevImg.lon, prevImg.lat, [0, 0, 255, 1], this.state.sequenceId!);
                }
            }

            // Update State with New ID
            this.setState({ imageId: newId }, () => {
                
                // 1. FRESH LOOKUP: Ensure we have the exact coordinates for the active ID
                // This guarantees the graphics are drawn exactly where the new image is.
                const activeImg = this.state.sequenceImages.find(s => s.id === newId);
                
                if (activeImg) {
                    // 2. Draw Graphics at New Location
                    this.clearGreenPulse();
                    this.currentGreenGraphic = this.drawPulsingPoint(activeImg.lon, activeImg.lat, [0, 255, 0, 1]);
                    
                    this.checkForTimeTravel(newId);
                    
                    this.mapillaryViewer.getBearing().then((b: number) => {
                        if (typeof b === 'number') { this._lastBearing = b; }
                        redrawCone(activeImg.lon, activeImg.lat);
                    }).catch(() => {
                        redrawCone(activeImg.lon, activeImg.lat);
                    });

                    // 3. Map Synchronization Logic (With Offset)
                    if (this.props.config.syncMapWithImage === true && !this._isFlyInActive) {
                        const position = this.props.config.syncMapPosition || 'center';
                        
                        const targetPoint = new this.ArcGISModules.Point({
                            longitude: activeImg.lon,
                            latitude: activeImg.lat
                        });
                        
                        // === 3D SCENE: GPS NAVIGATION MODE ===
                        if (view.type === "3d") {
                            view.goTo({
                                center: [activeImg.lon, activeImg.lat],
                                // heading: this._lastBearing 
                            }, { animate: true, duration: 300 });
                        } 
                        // === 2D MAP MODE ===
                        else {
                            // Standard Center
                            if (position === 'center') {
                                view.goTo({ center: targetPoint }, { animate: true, duration: 300 });
                            } 
                            // Offset Logic
                            else {
                                try {
                                    const wmPoint = webMercatorUtils.geographicToWebMercator(targetPoint) as __esri.Point;
                                    const extent = view.extent;
                                    
                                    if (wmPoint && extent) {
                                        const width = extent.width;
                                        const height = extent.height;
                                        const offsetFactor = 0.25; // 25% shift

                                        let newCenterX = wmPoint.x;
                                        let newCenterY = wmPoint.y;

                                        if (position === 'east') {
                                            // Widget Left -> Show point on Right -> Move Camera Left (West)
                                            newCenterX = wmPoint.x - (width * offsetFactor);
                                        } else if (position === 'west') {
                                            // Widget Right -> Show point on Left -> Move Camera Right (East)
                                            newCenterX = wmPoint.x + (width * offsetFactor);
                                        } else if (position === 'north') {
                                            // Widget Bottom -> Show point on Top -> Move Camera Down (South)
                                            newCenterY = wmPoint.y - (height * offsetFactor);
                                        } else if (position === 'south') {
                                            // Widget Top -> Show point on Bottom -> Move Camera Up (North)
                                            newCenterY = wmPoint.y + (height * offsetFactor);
                                        }

                                        const newCenter = new this.ArcGISModules.Point({
                                            x: newCenterX,
                                            y: newCenterY,
                                            spatialReference: { wkid: 3857 }
                                        });

                                        view.goTo({ center: newCenter }, { animate: true, duration: 300 });
                                    } else {
                                        view.goTo({ center: targetPoint }, { animate: true, duration: 300 });
                                    }
                                } catch (e) {
                                    view.goTo({ center: targetPoint }, { animate: true, duration: 300 });
                                }
                            }
                        }
                    }
                }
            });
            

            if (this.state.detectionsActive) {
                this.loadDetections(event.image.id);
            }

            // Reverse geocode
            this.fetchReverseGeocode(newImg.lat, newImg.lon);
            // Update minimap tracking
            this.updateMinimapTracking();
        });
    }

    /**
        * Sets up hover detection for DirectionComponent arrows.
        * When user hovers over navigation arrows, highlights the target image marker on the map.
    */
    private setupDirectionHover() {
        if (!this.mapillaryViewer) return;

        try {
            const directionComponent: any = this.mapillaryViewer.getComponent("direction");
            
            if (!directionComponent) {
                console.warn("DirectionComponent not found");
                return;
            }

            if (directionComponent._hoveredId$) {
                const subscription = directionComponent._hoveredId$.subscribe((hoveredId: string | null) => {
                    this.log("Direction hover:", hoveredId);
                    this.handleDirectionHover(hoveredId);
                });

                // Store unsubscribe function for cleanup
                this._directionUnsubscribe = () => subscription.unsubscribe();
                
                // Mobile 'hover'
                if (this.viewerContainer.current) {
                    const container = this.viewerContainer.current;

                    const simulateMouseMove = (e: TouchEvent) => {
                        if (e.touches.length > 1) return;

                        const touch = e.touches[0];
                        // create fake mousemove event
                        const mouseEvent = new MouseEvent("mousemove", {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            clientX: touch.clientX,
                            clientY: touch.clientY,
                            screenX: touch.screenX,
                            screenY: touch.screenY,
                        });

                        if (e.target) {
                            e.target.dispatchEvent(mouseEvent);
                        }
                    };

                    // TouchStart
                    container.addEventListener("touchstart", simulateMouseMove, { passive: true });
                    
                    // TouchMove
                    container.addEventListener("touchmove", simulateMouseMove, { passive: true });
                    
                    // TouchEnd
                    container.addEventListener("touchend", () => {
                         this.handleDirectionHover(null);
                    }, { passive: true });
                }
            } else {
                console.warn("_hoveredId$ not available on DirectionComponent");
            }
        } catch (err) {
            console.warn("Failed to setup direction hover:", err);
        }
    }

    /**
        * Handles hover events from DirectionComponent.
        * Draws a highlighted yellow marker on the map for the hovered navigation target.
        * Searches across ALL available sequences (normal mode) and current sequence (turbo mode).
        * @param hoveredId Image ID being hovered, or null when hover ends
    */
    private handleDirectionHover(hoveredId: string | null) {
        const view = this.state.jimuMapView?.view;
        if (!view || !this.ArcGISModules) return;

        // Prevent redundant animation restarts
        // If the ID hasn't changed and we are already showing a graphic, do nothing.
        if (this._currentDirectionHoverId === hoveredId && this._directionHoverGraphic) {
            return;
        }
        this._currentDirectionHoverId = hoveredId;
        
        // Clear previous hover graphic
        this.clearDirectionHighlight();

        if (!hoveredId) return;

        // Search strategy:
        let hoveredImg: { id: string; lon: number; lat: number } | undefined;

        // Strategy 1: Current active sequence
        hoveredImg = this.state.sequenceImages.find(img => img.id === hoveredId);

        // Strategy 2: Search in all available sequences
        if (!hoveredImg && this.state.availableSequences?.length > 0) {
            for (const seq of this.state.availableSequences) {
                hoveredImg = seq.images.find(img => img.id === hoveredId);
                if (hoveredImg) {
                    this.log(`Found hover target in sequence: ${seq.sequenceId}`);
                    break;
                }
            }
        }

        if (!hoveredImg && this.directionImageCache[hoveredId]) {
            hoveredImg = {
                id: hoveredId,
                ...this.directionImageCache[hoveredId]
            };
        }

        // Strategy 3: Fetch from API if not found locally
        if (!hoveredImg) {
            this.log(`Image not in loaded sequences, fetching from API: ${hoveredId}`);
            this.fetchAndHighlightImage(hoveredId);
            return;
        }

        this.drawDirectionHighlight(hoveredImg);
    }

    /**
        * Fetches a Mapillary image's geometry (longitude / latitude)
        * from the Mapillary Graph API using the given imageId.
        * - Requests only minimal fields (id, geometry)
        * - Caches coordinates for reuse
        * - Ensures the hover state is still valid before drawing
        * - Prevents outdated hover results from being rendered
    */
    private async fetchAndHighlightImage(imageId: string) {
        try {
            const response = await fetch(
                `https://graph.mapillary.com/${imageId}?fields=id,geometry`,
                { headers: { Authorization: `OAuth ${this.accessToken}` } }
            );
            
            if (!response.ok) {
                console.warn(`Failed to fetch image ${imageId}`);
                return;
            }

            const data = await response.json();
            const coords = data.geometry?.coordinates;
            
            if (!coords) {
                console.warn(`No coordinates for image ${imageId}`);
                return;
            }

            const hoveredImg = {
                id: imageId,
                lon: coords[0],
                lat: coords[1]
            };
            // Cache image coordinates for future hover events
            this.directionImageCache[imageId] = { lon: hoveredImg.lon, lat: hoveredImg.lat };

            if (this._currentDirectionHoverId === imageId) {
                this.drawDirectionHighlight(hoveredImg);
            } else {
                this.log(`Hover changed during fetch, discarding: ${imageId}`);
            }
        } catch (error) {
            console.error(`Error fetching image ${imageId}:`, error);
        }
    }

    /**
        * Draws a pulsing highlight marker on the map
        * for the given image location.
        * - Clears any existing highlight
        * - Adds a graphic to the view.graphics layer
        * - Applies a pulse animation by dynamically
        *   updating the marker size
    */
    private drawDirectionHighlight(hoveredImg: { id: string; lon: number; lat: number }) {
        const view = this.state.jimuMapView?.view;
        if (!view || !this.ArcGISModules) return;
        // Remove any existing highlight before drawing a new one
        this.clearDirectionHighlight();
        const { Graphic } = this.ArcGISModules;
        const is3D = view.type === "3d";

        const geometry = {
            type: "point",
            longitude: hoveredImg.lon,
            latitude: hoveredImg.lat,
            spatialReference: { wkid: 4326 }
        };

        // Helper function to create the correct symbol for 2D or 3D
        const getSymbol = (currentSize: number) => {
            if (is3D) {
                // In 3D, anchor the point to the ground but visually lift the icon 
                // with a line (callout) pointing to the exact location.
                return {
                    type: "point-3d",
                    symbolLayers:[{
                        type: "icon",
                        resource: { primitive: "circle" },
                        material: { color: [255, 255, 0, 0.8] },
                        outline: { color: [255, 165, 0, 1], size: 2 },
                        size: currentSize
                    }],
                    verticalOffset: {
                        screenLength: 45, // Lifts the icon 45 pixels up on the screen
                        maxWorldLength: 100,
                        minWorldLength: 5
                    },
                    callout: {
                        type: "line", // Draws a line straight down to the true location
                        size: 2,
                        color:[255, 165, 0, 1],
                        border: {
                            color: [0, 0, 0, 0.3]  // dark outline around the orange line
                        }
                    }
                };
            } else {
                // Standard 2D rendering
                return {
                    type: "simple-marker",
                    style: "circle",
                    color: [255, 255, 0, 0.8],
                    size: currentSize,
                    outline: { color: [255, 165, 0, 1], width: 3 }
                };
            }
        };

        const graphic = new Graphic({
            geometry: geometry,
            symbol: getSymbol(16) as any
        });

        view.graphics.add(graphic);
        this._directionHoverGraphic = graphic;

        // Pulse animation state
        let growing = true;
        let size = 16;

        // Creates a pulsing effect by oscillating marker size
        const pulseInterval = setInterval(() => {
            if (!this._directionHoverGraphic) {
                clearInterval(pulseInterval);
                return;
            }

            size += growing ? 0.5 : -0.5;
            if (size >= 20) growing = false;
            if (size <= 16) growing = true;

            this._directionHoverGraphic.symbol = getSymbol(size) as any;
        }, 60);
        
        // Store interval reference for cleanup
        (graphic as any)._pulseInterval = pulseInterval;
    }

    /**
        * Removes the currently active direction highlight
        * from the map and stops its pulse animation.
        * - Clears the interval animation
        * - Removes the graphic from the view
        * - Resets internal reference
    */
    private clearDirectionHighlight() {
        if (this._directionHoverGraphic) {
            // Stop pulse animation
            if ((this._directionHoverGraphic as any)._pulseInterval) {
                clearInterval((this._directionHoverGraphic as any)._pulseInterval);
            }
            // Remove graphic from the map view
            const view = this.state.jimuMapView?.view; // 👈 Burayı ekle
            if (view) {
                view.graphics.remove(this._directionHoverGraphic);
            }
            this._directionHoverGraphic = null;
        }
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
            // Updated to remove blue dots (__isActiveSequencePoint) as well
            if (
                (g as any).__isSequenceOverlay || 
                (g as any).__isCone || 
                (g as any).__isActiveSequencePoint
            ) {
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
            // Loop through all localStorage keys and remove coordinate caches
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith("mly_geo_")) {
                    localStorage.removeItem(key);
                }
            });

            this.log("All Mapillary sequence caches cleared from localStorage");

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
        // existing green pulse cleanup
		if (this.currentGreenGraphic && (this.currentGreenGraphic as any)._pulseInterval) {
			clearInterval((this.currentGreenGraphic as any)._pulseInterval);
			this.currentGreenGraphic = null;
		}

        // Clean up zoom watcher
        if (this.zoomDisplayHandle) {
            this.zoomDisplayHandle.remove();
            this.zoomDisplayHandle = null;
        }

        // Clean up direction hover graphic
        this.clearDirectionHighlight();
        this.clearTurboHover();

        // Unsubscribe from direction hover events
        if (this._directionUnsubscribe) {
            this._directionUnsubscribe();
            this._directionUnsubscribe = null;
        }

        //  graphics cleanup
        if (fullRemove && this.state.jimuMapView) {
            const { view } = this.state.jimuMapView;
            view.graphics.removeAll();
        }

        if (fullRemove) {
            // listener removals
            if (this.mapClickHandle) { this.mapClickHandle.remove(); this.mapClickHandle = null; }
            if (this.pointerMoveHandle) { this.pointerMoveHandle.remove(); this.pointerMoveHandle = null; }

            this._cancelObjectsFetch = true;
            this._cancelTrafficSignsFetch = true;
            
            // watcher removals
            if (this.trafficSignsStationaryHandle) { this.trafficSignsStationaryHandle.remove(); this.trafficSignsStationaryHandle = null; }
            if (this.trafficSignsZoomHandle) { this.trafficSignsZoomHandle.remove(); this.trafficSignsZoomHandle = null; }
            if (this.objectsStationaryHandle) { this.objectsStationaryHandle.remove(); this.objectsStationaryHandle = null; }
            if (this.objectsZoomHandle) { this.objectsZoomHandle.remove(); this.objectsZoomHandle = null; }
            if (this.turboStationaryHandle) { this.turboStationaryHandle.remove(); this.turboStationaryHandle = null; }
            if (this.turboZoomHandle) { this.turboZoomHandle.remove(); this.turboZoomHandle = null; }

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
                "turboCoverage"                // Turbo Points
            ];

            layersToRemoveById.forEach(id => {
                const layer = view.map.findLayerById(id);
                if (layer) {
                    view.map.remove(layer);
                    this.log(`Removed layer by ID: ${id}`);
                }
            });

            // Nullify References
            this.mapillaryVTLayer = null;
            this.mapillaryTrafficSignsLayer = null;
            this.mapillaryTrafficSignsFeatureLayer = null;
            this.mapillaryObjectsLayer = null;
            this.mapillaryObjectsFeatureLayer = null;
            this.turboCoverageLayer = null;
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

        // viewer destruction and rest of the method
		if (this.mapillaryViewer) {
			try { this.mapillaryViewer.remove(); } catch (err) {}
			this.mapillaryViewer = null;
		}
		if (this.viewerContainer.current) {
			this.viewerContainer.current.innerHTML = '';
		}

        if (resetState) {
            // state reset logic
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

    /**
        * Restores map graphics (clicked location, sequence lines, cone, etc.) 
        * when the map view switches between 2D and 3D, as graphics are tied to the view instance.
    */
    private restoreMapGraphics = () => {
        const { jimuMapView, clickLon, clickLat, availableSequences, selectedSequenceId, sequenceImages, imageId, turboModeActive } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        const view = jimuMapView.view;

        // 1. Restore Clicked Location (Black/Red Dot)
        if (clickLon != null && clickLat != null) {
            this.drawPoint(clickLon, clickLat);
        }

        // 2. Restore Available Sequences (Background colored dots/lines - Normal Mode only)
        if (!turboModeActive && availableSequences && availableSequences.length > 0) {
            this.drawSequencesOverlay();
        }

        // 3. Restore Active Sequence (Blue line & dots)
        if (selectedSequenceId && sequenceImages && sequenceImages.length > 0) {
            const { Graphic } = this.ArcGISModules;
            
            // Blue Polyline
            if (sequenceImages.length > 1) {
                 const paths = sequenceImages.map(img => [img.lon, img.lat]);
                 const polylineGraphic = new Graphic({
                    geometry: { type: "polyline", paths: [paths], spatialReference: { wkid: 4326 } },
                    symbol: { type: "simple-line", color: [0, 0, 255, 0.8], width: 3 }, 
                    attributes: { sequenceId: selectedSequenceId }
                });
                (polylineGraphic as any).__isSequenceOverlay = true;
                view.graphics.add(polylineGraphic);
            }

            // Blue Dots
            sequenceImages.forEach(img => {
                if (img.id !== imageId) {
                    this.drawPointWithoutRemoving(img.lon, img.lat,[0, 0, 255, 1], selectedSequenceId);
                }
            });
        }

        // 4. Restore Active Image (Green Pulse) and Camera Cone
        if (imageId && sequenceImages && sequenceImages.length > 0) {
            const activeImg = sequenceImages.find(s => s.id === imageId);
            if (activeImg) {
                // Clear old references to prevent memory leaks from old intervals
                this.clearGreenPulse();
                this.clearConeGraphics();

                this.currentGreenGraphic = this.drawPulsingPoint(activeImg.lon, activeImg.lat,[0, 255, 0, 1]);
                
                const length = this.coneLengths[this.zoomStepIndex];
                const spread = this.coneSpreads[this.zoomStepIndex];
                
                if (this.mapillaryViewer) {
                    this.mapillaryViewer.getBearing().then((b: number) => {
                        if (typeof b === 'number') this._lastBearing = b;
                        this.currentConeGraphic = this.drawCone(activeImg.lon, activeImg.lat, this._lastBearing, length, spread);
                    }).catch(() => {
                        this.currentConeGraphic = this.drawCone(activeImg.lon, activeImg.lat, this._lastBearing || 0, length, spread);
                    });
                } else {
                    this.currentConeGraphic = this.drawCone(activeImg.lon, activeImg.lat, this._lastBearing || 0, length, spread);
                }
            }
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
        this.log("Destroying minimap...");
        
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
        this.log("Minimap destroyed");
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
                color: "#00ff00",
                size: 10,
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
                geometry: this.createConeGeometry(currentImg.lon, currentImg.lat, this._lastBearing, 30, 60),
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
        this.clearConeGraphics();

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
                // Ignore "Request aborted" errors which are expected during cleanup
                const errorMsg = err instanceof Error ? err.message : String(err);
                const errorName = (err as any).name;
                
                if (errorName !== 'CancelMapillaryError' && !errorMsg.includes('aborted')) {
                    console.warn("Error removing viewer:", err);
                }
            }
            this.mapillaryViewer = null;
        }

        this.setState({isFullscreen: goingFullscreen}, async () => {
            // Small delay to ensure state is settled
            await new Promise(resolve => setTimeout(resolve, 50));

            if (this.viewerContainer.current && currentImageId) {
                
                // Create new viewer
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: currentImageId,
                    renderMode: this.props.config.renderMode ?? 1,      // Default to Fill
                    transitionMode: this.props.config.transitionMode ?? 0, // Default to Smooth 
                    component: {
                        zoom: true,         
                        direction: true,  
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
                
                this.applyCustomCameraAngle();
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
                    
                    this.log("Centered map on active frame:", currentImageCoords);
                }
            }
        });
    };

    // Helper: Calculate bearing from Image (lat1,lon1) to Object (lat2,lon2)
    private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const toRad = (deg: number) => deg * Math.PI / 180;
        const toDeg = (rad: number) => rad * 180 / Math.PI;

        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        
        const brng = toDeg(Math.atan2(y, x));
        return (brng + 360) % 360;
    }

    /**
        * Fetches a small set of alternate Mapillary images related to a detected feature.
        * The function queries the Mapillary Graph API for detections associated with the
        * provided feature ID, extracts image metadata (thumbnail URL, capture time, geometry),
        * removes duplicate images, and stores up to 3 alternate images in component state.
        * It also updates UI state to indicate loading progress and saves the selected
        * feature location for reference.
        * @param featureId - Mapillary feature identifier used to query detections.
        * @param featureLat - Latitude of the selected feature.
        * @param featureLon - Longitude of the selected feature.
    */
    private async fetchAlternateImages(featureId: string, featureLat: number, featureLon: number) {
        this.setState({ 
            isFetchingAlternates: true, 
            selectedFeatureLocation: { lat: featureLat, lon: featureLon },
            alternateImages: [] // Clear previous
        });

        try {
            // Query detections for this feature, expanding the 'image' field to get URL and geometry
            const url = `https://graph.mapillary.com/${featureId}/detections?fields=image{id,thumb_256_url,geometry,captured_at}&limit=5&access_token=${this.accessToken}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data.data) {
                const images = data.data.map((det: any) => ({
                    id: det.image.id,
                    detectionId: det.id,
                    thumbUrl: det.image.thumb_256_url,
                    capturedAt: new Date(det.image.captured_at).getTime(),
                    geometry: det.image.geometry
                }));
                
                // Filter out duplicates if any, and limit to 3-5
                const uniqueImages = images.filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i).slice(0, 3);

                this.setState({ alternateImages: uniqueImages });
            }
        } catch (err) {
            console.error("Failed to fetch alternate images", err);
        } finally {
            this.setState({ isFetchingAlternates: false });
        }
    }

    /**
        * Returns a hexadecimal color value based on the provided detection label.
        * The function normalizes the input string to lowercase and matches it against
        * known label categories (e.g., traffic lights, signs, road markings, poles,
        * street objects, etc.). Certain background or ignored classes return black.
        * If no category matches, a default color is returned.
        * @param value - Detection label name or class identifier.
        * @returns Hex color number (e.g., 0xe74c3c) used for visualization.
    */
    private getDetectionColor(value: string): number {
        const label = value.toLowerCase();
        if (
            [
                'unlabeled','sky','nature vegetation','marking continuous solid',
                'object vehicle car','nature terrain'
            ].includes(label)
            || ['void','construction','vehicle','vegetation','continuous--solid', 'human', 'wire']
                .some(k => label.includes(k))
        ) return 0x000000;

        if (label.includes('traffic-light')) return 0xe74c3c;
        if (['traffic-sign','sign--store','sign--advertisement','banner']
            .some(k => label.includes(k))) return 0xe67e22;
        if (['marking','crosswalk','stop-line','continuous--dashed']
            .some(k => label.includes(k))) return 0x1abc9c;
        if (['support--pole','wire-group']
            .some(k => label.includes(k))) return 0x674ea7;
        if (['manhole','trash-can']
            .some(k => label.includes(k))) return 0x8e6e53;

        return 0x37d582;
    }

    /**
        * Toggles the visibility state of AI-generated tags in the UI.
        * This function inverses the current `showAiTags` boolean value in the
        * component state, enabling or disabling the display of AI tags.
    */
    private toggleAiTags = () => {
        this.setState({ showAiTags: !this.state.showAiTags });
    };

    /**
        * Toggles the visibility of AI object detections in the Mapillary viewer.
        * - When activated: Triggers the loading process for the current image.
        * - When deactivated: Removes all existing detection tags from the viewer.
    */
    private toggleDetections = async () => {
        const newState = !this.state.detectionsActive;
        this.setState({ detectionsActive: newState, targetDetectionId: null });

        if (newState && this.state.imageId) {
            this.loadDetections(this.state.imageId);
        } else {
            const tagComponent = this.mapillaryViewer?.getComponent("tag");
            if (tagComponent) {
                // Cleaning up hover listeners
                if ((tagComponent as any)._detectionHoverCleanup) {
                    (tagComponent as any)._detectionHoverCleanup();
                    delete (tagComponent as any)._detectionHoverCleanup;
                }
                tagComponent.removeAll();
            }
            this.detectionTagMap.clear(); // ← Clear the cache
        }
    };

    /**
        * Decodes and scales Mapillary detection geometry.
        * Mapillary API returns geometries as Base64-encoded Vector Tiles (MVT/PBF).
        * This function:
        * 1. Converts Base64 to a buffer.
        * 2. Parses the Vector Tile layer ('mpy-or').
        * 3. Normalizes coordinates from the tile's internal extent (e.g., 4096) 
        *    to a 0.0 - 1.0 range required by Mapillary-JS tags.
        * @param base64Str The raw geometry string from the Mapillary API.
        * @returns An array of [x, y] coordinate pairs.
    */
    private decodeAndNormalizeGeometry(base64Str: string): number[][] {
        try {
            const buffer = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
            const tile = new VectorTile(new Pbf(buffer));
            const layer = tile.layers['mpy-or'];
            if (!layer) return [];

            const feature = layer.feature(0);
            const rawGeometry = feature.loadGeometry(); 
            const extent = layer.extent; 

            // Mapillary-JS uses [x, y] where x is 0-1 (left to right) and y is 0-1 (top to bottom)
            const points: number[][] = rawGeometry[0].map(p => [
                p.x / extent, 
                p.y / extent
            ]);

            return points;
        } catch (e) {
            console.error("MVT Decoding failed:", e);
            return [];
        }
    }

    /**
        * Sets up hover interactions for AI detection tags.
        * Shows label text only when the user hovers over a detection polygon.
    */
    private setupDetectionHover(tagComponent: any, tags: OutlineTag[]) {
        if (!this.viewerContainer.current) return;

        const container = this.viewerContainer.current;
        
        // Store original tag configurations
        const tagConfigs = new Map<string, { text: string; color: number }>();
        tags.forEach(tag => {
            const detectionValue = this.getDetectionValueFromTagId(tag.id);
            const labelFull = detectionValue
                .split('--')
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '))
                .join(' ');
            const color = this.getDetectionColor(detectionValue);
            
            tagConfigs.set(tag.id, { text: labelFull, color });
        });
        
        let currentHoveredId: string | null = null;
        let updateTimeout: any = null;
        
        const updateTags = (hoveredId: string | null) => {
            if (currentHoveredId === hoveredId) return;
            currentHoveredId = hoveredId;
            
            tagComponent.removeAll();
            
            const updatedTags: OutlineTag[] = [];
            tags.forEach(tag => {
                const config = tagConfigs.get(tag.id);
                if (!config) return;
                
                // Check both hover AND target states**
                const isHovered = tag.id === hoveredId;
                const isTarget = tag.id === this.state.targetDetectionId;
                
                // Target takes priority over hover
                const shouldShowText = this.state.showAiTags && (isHovered || isTarget);
                const lineColor = isTarget ? 0xFF0000 : config.color;
                const fillColor = isTarget ? 0xffff00 : config.color;
                const fillOpacity = isTarget ? 0.9 : 0.3;
                const lineWidth = isTarget ? 4 : 2;
                
                try {
                    const geometry = new PolygonGeometry((tag.geometry as PolygonGeometry).polygon);
                    const newTag = new OutlineTag(
                        tag.id,
                        geometry,
                        {
                            text: shouldShowText ? config.text : "",
                            textColor: isTarget ? 0xffff00 : 0xffffff,
                            lineColor: lineColor,
                            lineWidth: lineWidth,
                            fillColor: fillColor,
                            fillOpacity: fillOpacity
                        }
                    );
                    updatedTags.push(newTag);
                } catch (err) {
                    console.warn("Error updating tag", tag.id, err);
                }
            });
            
            if (updatedTags.length > 0) {
                tagComponent.add(updatedTags);
            }
        };
        
        // Mouse move handler with corrected coordinate transformation
        const handleMouseMove = async (event: MouseEvent) => {
            if (!this.mapillaryViewer) return;
            
            try {
                const canvas = container.querySelector('canvas');
                if (!canvas) return;
                
                const rect = canvas.getBoundingClientRect();
                const pixelPoint = [
                    event.clientX - rect.left,
                    event.clientY - rect.top
                ];
                
                // Using Mapillary's built-in hit testing API
                const tagIds = await tagComponent.getTagIdsAt(pixelPoint);
                const hoveredTagId = tagIds.length > 0 ? tagIds[0] : null;
                
                // Debounce the update
                if (updateTimeout) {
                    clearTimeout(updateTimeout);
                }
                
                updateTimeout = setTimeout(() => {
                    updateTags(hoveredTagId);
                }, 50);
                
            } catch (err) {
                console.warn("Error in hover detection:", err);
                if (updateTimeout) clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => updateTags(null), 50);
            }
        };

        // Mouse leave handler
        const handleMouseLeave = () => {
            if (!this.state.showAiTags) return;
            
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            
            updateTags(null);
        };

        // Attach listeners
        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', handleMouseLeave);

        // Store cleanup function
        (tagComponent as any)._detectionHoverCleanup = () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', handleMouseLeave);
            tagConfigs.clear();
        };
    }

    // Retrieves the detection label/value associated with a given tag ID.
    private getDetectionValueFromTagId(tagId: string): string {
        return this.detectionTagMap.get(tagId) || '';
    }

    /**
        * Fetches AI detection data for a specific image and renders them as interactive tags.
        * 1. Calls Mapillary Graph API for detection features (value and geometry).
        * 2. Decodes the MVT geometry for each object.
        * 3. Creates 'PolygonGeometry' and 'OutlineTag' instances.
        * 4. Applies custom styling (Mapillary Green theme) and human-friendly labels.
        * @param imageId The ID of the image for which to load detections.
    */
    private async loadDetections(imageId: string) {
        if (!this.mapillaryViewer) return;

        try {
            const url = `https://graph.mapillary.com/${imageId}/detections?fields=id,value,geometry&access_token=${this.accessToken}`;
            const resp = await fetch(url);
            const data = await resp.json();

            const tagComponent = this.mapillaryViewer.getComponent("tag");
            if (!tagComponent || !data.data) return;

            tagComponent.removeAll(); 

            const tags: OutlineTag[] = [];
            
            data.data.forEach((det: any) => {
                if (!det.geometry) return;

                const labelFull = det.value
                    .split('--')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '))
                    .join(' ');

                const labelRaw = det.value.split('--').pop();

                // HIDE ONLY UNLABELED
                if (labelRaw === 'unlabeled'|| labelFull === 'Marking Continuous Solid' 
                    || labelFull.toLowerCase().includes('nature') 
                    || labelFull.toLowerCase().includes('construction')
                    || labelFull.toLowerCase().includes('vehicle') || labelFull.toLowerCase().includes('human')
                    || labelFull.toLowerCase().includes('wire') || labelFull.toLowerCase().includes('void')) return;

                this.detectionTagMap.set(det.id, det.value);

                const points = this.decodeAndNormalizeGeometry(det.geometry);

                if (points.length >= 3) {
                    try {
                        const geometry = new PolygonGeometry(points);
                        const color = this.getDetectionColor(det.value);

                        // Is this the specific object the user clicked in the alternate panel?
                        const isTarget = det.id === this.state.targetDetectionId;

                        const tag = new OutlineTag(
                            det.id,
                            geometry, 
                            { 
                                text: this.state.showAiTags ? labelFull : "",
                                textColor: isTarget ? 0xffff00 : 0xffffff,
                                lineColor: isTarget ? 0xffffff : color,
                                lineWidth: isTarget ? 4 : 2,
                                fillColor:  isTarget ? 0xffff00 : color,
                                fillOpacity: isTarget ? 0.9 : 0.3
                            }
                        );
                        tags.push(tag);
                    } catch (err) {
                        console.warn("Could not create tag for detection", det.id, err);
                    }
                }
            });

            if (tags.length > 0) {
                tagComponent.add(tags);
                this.log(`Successfully rendered ${tags.length} AI objects.`);
                
                // hover listeners after tags are added
                this.setupDetectionHover(tagComponent, tags);
            }
        } catch (err) {
            console.error("Failed to load image detections:", err);
        }
    }

    // Helper to load image(icons/spites)
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

    // --- Fetch ID from Username ---
    private async getUserIdFromUsername(username: string): Promise<number | null> {
        if (!username) return null;
        const url = `https://graph.mapillary.com/images?creator_username=${username}&limit=1&fields=creator&access_token=${this.accessToken}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                // Convert String ID to Integer (required for vector tile filtering)
                return parseInt(data.data[0].creator.id, 10);
            }
            return null;
        } catch (error) {
            console.warn("Error resolving Mapillary User ID:", error);
            return null;
        }
    }

    /*
        --- Initializes the Mapillary Vector Tile Layer ---
        * Creates a VectorTileLayer from the Mapillary tiles API
        * Uses an inline `minimalStyle` object for symbology (sequence = green line, image = light cyan blue circle)
        * Stores the layer in `this.mapillaryVTLayer` for later toggling
    */
    private initMapillaryLayer(filterCreatorId?: number) {
        const { VectorTileLayer } = this.ArcGISModules

        const vectorTileSourceUrl = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${this.accessToken}`

        // Create filter expression if ID exists:["==", "creator_id", 12345]
        const layerFilter = filterCreatorId ?["==", "creator_id", filterCreatorId] : null;

        // Base layers without the image circles
        const layers: any[] =[
            {
                "id": "overview",
                "source": "mapillary",
                "source-layer": "overview",
                "type": "circle",
                "filter": layerFilter,
                "paint": {
                    "circle-radius": 1,
                    "circle-color": "#35AF6D",
                    "circle-stroke-color": "#35AF6D",
                    "circle-stroke-width": 1
                }
            },
            {
                "id": "sequence",
                "source": "mapillary",
                "source-layer": "sequence",
                "type": "line",
                "filter": layerFilter,
                "paint": {
                    "line-opacity": 0.8,
                    "line-color": "#35AF6D",
                    "line-width": 2
                }
            }
        ];

        // Conditionally add the image circles layer based on config
        if (!this.props.config.hideCoverageCircles) {
            layers.push({
                "id": "image",
                "source": "mapillary",
                "source-layer": "image",
                "type": "circle",
                "filter": layerFilter,
                "paint": {
                    "circle-radius": 2,
                    "circle-color": "#35AF6D",
                    "circle-stroke-color": "#ffffff",
                    "circle-stroke-width": 1
                }
            });
        }

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
            "layers": layers
        }

        this.mapillaryVTLayer = new VectorTileLayer({
            id: "mapillary-vector-tiles",
            title: "Mapillary Coverage",
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
            id: "mapillary-traffic-signs-vt",
            title: "Mapillary Traffic Signs Coverage",
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
            id: "mapillary-objects-vt",
            title: "Mapillary Objects Coverage",
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

    private applyCustomCameraAngle = () => {
        // Fallback to 0.5 (Standard Center/Horizon) if values are missing
        const x = this.props.config.cameraX ?? 0.5;
        const y = this.props.config.cameraY ?? 0.5;

        if (this.mapillaryViewer) {
            // This will now ALWAYS run, ensuring wide widgets stay level
            this.mapillaryViewer.setCenter([x, y]);
        }
    }

    private legendRowStyle = () => ({
        display: 'flex',
        alignItems: 'center',
        gap: '2px' // Increased gap between circle and text for clarity
    });

    private legendTextStyle = () => ({
        fontSize: '9px',
        color: 'rgba(255,255,255,0.9)',
        whiteSpace: 'nowrap' as const,
        fontWeight: 400
    });

    private compactButtonStyle = () => ({
        marginTop: '4px',
        background: 'rgba(217, 83, 79, 0.2)',
        border: '1px solid rgba(217, 83, 79, 0.3)',
        color: '#ff908d',
        borderRadius: '2px',
        fontSize: '8px',
        padding: '2px 0',
        cursor: 'pointer',
        width: '100%',
        fontWeight: 700
    });

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
            this.log("Cancelled traffic signs tile fetch");
            return;
        }
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        if (jimuMapView.view.zoom < 16) {
            this.log("Not loading traffic signs, zoom below threshold");
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
        this.log("Applying traffic signs filter:", currentFilterValue);  

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
                    this.log(`Filtered to ${features.length} features with code: ${rawCode}`);
                }
            } catch (err) {
                console.warn("Failed to get sprite data for filtering", err);
            }
        }

        const { FeatureLayer } = this.ArcGISModules;

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
                })),
                defaultSymbol: {
                    type: "simple-marker",
                    color: "orange",
                    size: 8,
                    outline: { color: "white", width: 1 }
                } as any
            };
        } else {
            renderer = {
                type: "simple",
                symbol: { type: "simple-marker", size: 6, color: "orange", outline: { color: "white", width: 1 } }
            };
        }

        const layer = new FeatureLayer({
            id: "mapillary-traffic-signs-fl",
            title: "Mapillary Traffic Signs Features",
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
            this.log("Fetch finished, but zoom too low or cancelled. Discarding layer.");
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
            this.log("Cancelled object tile fetch, widget closed or toggle off");
            return;
        }
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        if (jimuMapView.view.zoom < 16) {
            this.log("Not loading objects, zoom below threshold");
            return;
        }

        const extent = jimuMapView.view.extent;
        if (!extent) {
            this.warn("Map extent not available yet");
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
                            attributes: 
                            {
                                id: feat.properties.id,
                                value: feat.properties.value,
                                name: this.objectNameMap[feat.properties.value] || feat.properties.value,
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

        // Filter out any "object--traffic-sign" items completely.
        // This removes them from the data source so they won't render at all.
        features = features.filter(f => {
            const val = f.attributes.value || "";
            // Return FALSE if it contains "object--traffic-sign" to exclude it
            return !val.includes("object--traffic-sign");
        });

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

        // Sort the list alphabetically by label
        optionsWithIcons.sort((a, b) => a.label.localeCompare(b.label));

        const allOption = { value: "All points", label: "All points", iconUrl: null };
        this.setState({ objectsOptions: [allOption, ...optionsWithIcons] });

        // Apply current filter from state
        const currentFilterValue = this.state.objectsFilterValue?.value || "All points";
        this.log("Applying objects filter:", currentFilterValue); 

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
                    this.log(`Filtered to ${features.length} features with code: ${rawCode}`);
                }
            } catch (err) {
                console.warn("Failed to get sprite data for filtering", err);
            }
        }

        const { FeatureLayer } = this.ArcGISModules;

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
                })),
                defaultSymbol: {
                    type: "simple-marker",
                    color: "orange",
                    size: 8,
                    outline: { color: "white", width: 1 }
                } as any
            };
        } else {
            renderer = {
                type: "simple",
                symbol: {
                    type: "simple-marker",
                    size: 6,
                    color: "orange",
                    outline: { color: "white", width: 1 }
                },
            };
        }

        const layer = new FeatureLayer({
            id: "mapillary-objects-fl",
            title: "Mapillary Objects Features",
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
    private toggleMapillaryTiles = async () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        const existingLayer = jimuMapView.view.map.findLayerById("mapillary-vector-tiles");

        if (existingLayer) {
            jimuMapView.view.map.remove(existingLayer);
            this.setState({ tilesActive: false });
        } else {
            // === START CHANGE ===
            // Check config for default creator
            let targetId: number | undefined = undefined;
            if (this.props.config.turboCreator) {
                targetId = await this.getUserIdFromUsername(this.props.config.turboCreator);
            }

            // Re-initialize with the fresh filter ID
            this.initMapillaryLayer(targetId);
            // === END CHANGE ===

            jimuMapView.view.map.add(this.mapillaryVTLayer);
            this.setState({ tilesActive: true });

            // Keep Turbo/Features on top
            const layers = jimuMapView.view.map.layers;
            if (this.turboCoverageLayer && layers.includes(this.turboCoverageLayer)) {
                jimuMapView.view.map.reorder(this.turboCoverageLayer, layers.length - 1);
            }
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
        if (!this.state.trafficSignsActive) {
            const currentZoom = jimuMapView.view.zoom;
            if (currentZoom < 13) {
                this.showZoomWarning("Zoom in closer (≥ 13) to see traffic sign coverage.");
            } else if (currentZoom < 16) {
                this.showZoomWarning("Zoom in closer (≥ 16) to view clickable traffic sign features.");
            }
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
                this.log("Removed traffic signs VectorTileLayer");
            }

            // 4. Remove FeatureLayer (interactive features) by ID
            const existingFL = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
            if (existingFL) {
                jimuMapView.view.map.remove(existingFL);
                this.log("Removed traffic signs FeatureLayer");
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
            }, () => {
                // If both layers are off, turn off AI detections
                if (!this.state.trafficSignsActive && !this.state.objectsActive && this.state.detectionsActive) {
                    this.setState({ detectionsActive: false });
                    const tagComponent = this.mapillaryViewer?.getComponent("tag");
                    if (tagComponent) tagComponent.removeAll();
                }
            });
            
            this.log("Traffic signs layers completely removed and filter reset");
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
            if (currentZoom < 13) {
                // New warning for coverage visibility
                this.showZoomWarning("Zoom in closer (≥ 13) to see traffic sign coverage.");
                this._cancelTrafficSignsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
            } 
            else if (currentZoom < 16) {
                // Existing warning for clickable features
                this.showZoomWarning("Zoom in closer (≥ 16) to view clickable traffic sign features.");
                this._cancelTrafficSignsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById("mapillary-traffic-signs-fl");
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);

                // --- Reset to full list when zoomed out ---
                if (this._fullTrafficSignsOptions.length > 0) {
                    this.setState({ trafficSignsOptions: this._fullTrafficSignsOptions });
                }
            } else {
                this._cancelTrafficSignsFetch = false;
                // Optionally clear warning if they zoom back in
                this.clearZoomWarning(); 
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
        if (!this.state.objectsActive) {
            const currentZoom = jimuMapView.view.zoom;
            if (currentZoom < 13) {
                this.showZoomWarning("Zoom in closer (≥ 13) to see object coverage.");
            } else if (currentZoom < 16) {
                this.showZoomWarning("Zoom in closer (≥ 16) to view clickable object features.");
            }
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
                this.log("Removed objects VectorTileLayer");
            }

            // 4. Remove FeatureLayer (interactive features) by ID
            const existingFL = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
            if (existingFL) {
                jimuMapView.view.map.remove(existingFL);
                this.log("Removed objects FeatureLayer");
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
            
            // Inside toggleMapillaryObjects, in the 'Turn OFF' branch
            this.setState({ 
                objectsActive: false, 
                showObjectsFilterBox: false,
                objectsFilterValue: defaultObjectsFilter
            }, () => {
                // If both layers are off, turn off AI detections
                if (!this.state.trafficSignsActive && !this.state.objectsActive && this.state.detectionsActive) {
                    this.setState({ detectionsActive: false });
                    const tagComponent = this.mapillaryViewer?.getComponent("tag");
                    if (tagComponent) tagComponent.removeAll();
                }
            });

            this.log("Objects layers completely removed and filter reset");
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
            if (currentZoom < 13) {
                // Warning for coverage visibility
                this.showZoomWarning("Zoom in closer (≥ 13) to see object coverage.");
                this._cancelObjectsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
            } 
            else if (currentZoom < 16) {
                // Existing warning for clickable features
                this.showZoomWarning("Zoom in closer (≥ 16) to view clickable object features.");
                this._cancelObjectsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById("mapillary-objects-fl");
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
                
                // Reset options to full list when zoomed out
                if (this._fullObjectsOptions.length > 0) {
                    this.setState({ objectsOptions: this._fullObjectsOptions });
                }
            } else {
                // Clear warning and allow fetching when zoomed in deep enough
                this._cancelObjectsFetch = false;
                this.clearZoomWarning();
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

    /**
        * Downloads currently visible traffic signs and objects within the map extent
        * as a GeoJSON file.
        * Enforces Zoom >= 16 because FeatureLayers are empty/not hydrated below that level.
    */
    private downloadCurrentFeatures = async () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // 1. Zoom Level Check
        // The FeatureLayer data is not loaded by the widget logic until Zoom 16.
        // Trying to query below this level would result in 0 features or an error.
        if (jimuMapView.view.zoom < 16) {
            this.showZoomWarning("Zoom in closer (≥ 16) to load and download feature data.", 4000);
            return;
        }

        const view = jimuMapView.view;
        const featuresList: any[] = [];

        // Helper to query a layer and format results
        const queryAndFormat = async (layer: __esri.FeatureLayer | null) => {
            if (!layer) return;
            
            try {
                const query = layer.createQuery();
                query.geometry = view.extent;
                query.spatialRelationship = "intersects";
                query.returnGeometry = true;
                query.outFields = ["*"]; 

                const results = await layer.queryFeatures(query);

                results.features.forEach((graphic) => {
                    const geoGeometry = webMercatorUtils.webMercatorToGeographic(graphic.geometry) as __esri.Point;
                    
                    if (geoGeometry) {
                        featuresList.push({
                            geometry: {
                                type: "Point",
                                coordinates: [geoGeometry.x, geoGeometry.y] 
                            },
                            type: "Feature",
                            properties: {
                                ...graphic.attributes,
                                first_seen_at: graphic.attributes.first_seen_at, 
                                last_seen_at: graphic.attributes.last_seen_at
                            }
                        });
                    }
                });
            } catch (err) {
                console.warn("Error querying features for download", err);
            }
        };

        this.setState({ isLoading: true });

        // Query active layers
        if (this.state.trafficSignsActive) {
            await queryAndFormat(this.mapillaryTrafficSignsFeatureLayer);
        }
        if (this.state.objectsActive) {
            await queryAndFormat(this.mapillaryObjectsFeatureLayer);
        }

        this.setState({ isLoading: false });

        if (featuresList.length === 0) {
            this.showZoomWarning("No features found in the current view to download.", 3000);
            return;
        }

        // Construct final GeoJSON
        const featureCollection = {
            features: featuresList,
            type: "FeatureCollection"
        };

        // Trigger Download
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(featureCollection));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `mapillary_features_${new Date().getTime()}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } catch (err) {
            console.error("Download failed", err);
        }
    };

    /**
        * Fetches the high-resolution (2048px) image URL for the current image
        * and triggers a browser download.
    */
    private downloadActiveImage = async () => {
        const { imageId, sequenceImages } = this.state;
        if (!imageId) return;

        // 1. Set Loading State
        this.setState({ isDownloading: true });

        try {
            const url = `https://graph.mapillary.com/${imageId}?fields=thumb_2048_url&access_token=${this.accessToken}`;
            const resp = await fetch(url);
            const data = await resp.json();
            const imageUrl = data.thumb_2048_url;

            if (!imageUrl) {
                alert("High-resolution image not available for this frame.");
                return;
            }

            const imageResp = await fetch(imageUrl);
            const blob = await imageResp.blob();
            const blobUrl = URL.createObjectURL(blob);

            let filename = `mapillary_${imageId}.jpg`;
            const currentImg = sequenceImages.find(img => img.id === imageId);
            
            if (currentImg && currentImg.captured_at) {
                const dateStr = new Date(currentImg.captured_at).toISOString().split('T')[0];
                filename = `mapillary_${imageId}_${dateStr}.jpg`;
            }

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(blobUrl);

        } catch (err) {
            console.error("Failed to download image:", err);
        } finally {
            // 2. CRITICAL: Reset state when done (success or fail)
            this.setState({ isDownloading: false });
        }
    };

    /**
        * Official Mapillary Time Travel Logic:
        * 1. Distance < 12 meters.
        * 2. Compass Angle Difference < 22.5°.
        * 3. Must be from a different date (to be "Time Travel").
    */
    private checkForTimeTravel = async (currentImageId: string) => {
        if (!currentImageId) {
            this.setState({ hasTimeTravel: false });
            return;
        }

        try {
            // 1. Fetch current image including COMPUTED fields and SEQUENCE
            const currentResp = await fetch(
                `https://graph.mapillary.com/${currentImageId}?fields=geometry,computed_geometry,captured_at,computed_compass_angle,compass_angle,is_pano,sequence&access_token=${this.accessToken}`
            );
            if (!currentResp.ok) return;
            const cData = await currentResp.json();
            
            // Mapillary only allows Time Travel for images successfully reconstructed (Computed)
            // If computed_geometry is missing, the official web app usually hides Time Travel.
            if (!cData.computed_geometry) {
                this.setState({ hasTimeTravel: false });
                return;
            }

            const cCoords = cData.computed_geometry.coordinates;
            const cAngle = cData.computed_compass_angle ?? cData.compass_angle;
            const cSeq = cData.sequence;
            const cTime = new Date(cData.captured_at).getTime();

            // 2. Search candidates (requesting computed fields and sequence)
            const offset = 0.0002; 
            const bbox = `${cCoords[0] - offset},${cCoords[1] - offset},${cCoords[0] + offset},${cCoords[1] + offset}`;
            const candidatesUrl = `https://graph.mapillary.com/images?bbox=${bbox}&fields=id,captured_at,compass_angle,computed_compass_angle,is_pano,geometry,computed_geometry,sequence&limit=50&access_token=${this.accessToken}`;
            
            const candidatesResp = await fetch(candidatesUrl);
            const candidatesData = await candidatesResp.json();

            if (candidatesData.data && candidatesData.data.length > 0) {
                const ONE_DAY_MS = 86400000;

                const hasValidMatch = candidatesData.data.some((img: any) => {
                    if (img.id === currentImageId) return false;

                    // RULE 1: Ignore images from the same drive
                    if (img.sequence === cSeq) return false;

                    // RULE 2: Must be a different day
                    const imgTime = new Date(img.captured_at).getTime();
                    if (Math.abs(imgTime - cTime) < ONE_DAY_MS) return false;

                    // RULE 3: Reconstruction Check
                    // If candidate wasn't reconstructed, Mapillary website won't show it.
                    if (!img.computed_geometry) return false;

                    // RULE 4: Strict 12m Distance using Computed Geometry
                    const iCoords = img.computed_geometry.coordinates;
                    const dist = this.distanceMeters(cCoords[1], cCoords[0], iCoords[1], iCoords[0]);
                    if (dist > 12) return false;

                    // RULE 5: Strict 22.5° Angle using Computed Angle
                    if (cData.is_pano || img.is_pano) return true;
                    
                    const iAngle = img.computed_compass_angle ?? img.compass_angle;
                    if (cAngle !== null && iAngle !== null) {
                        const diff = Math.abs(cAngle - iAngle) % 360;
                        const shortestDiff = diff > 180 ? 360 - diff : diff;
                        return shortestDiff <= 22.5;
                    }

                    return false;
                });
                
                this.setState({ hasTimeTravel: hasValidMatch });
            } else {
                this.setState({ hasTimeTravel: false });
            }
        } catch (err) {
            this.setState({ hasTimeTravel: false });
        }
    }

    /**
        * Generates a shareable URL with current Image ID, Bearing, and Pitch,
        * and copies it to the clipboard.
    */
    private copyShareLink = async () => {
        if (!this.mapillaryViewer || !this.state.imageId) {
             console.warn("Viewer or ImageID missing");
             return;
        }

        try {
            // 1. Get Viewer State
            let bearing = 0;
            let pitch = 0;
            let zoom = 1;

            if (typeof this.mapillaryViewer.getBearing === 'function') {
                try { bearing = await this.mapillaryViewer.getBearing(); } catch (e) {}
            }
            if (typeof this.mapillaryViewer.getPitch === 'function') {
                try { pitch = await this.mapillaryViewer.getPitch(); } catch (e) {}
            }
            if (typeof this.mapillaryViewer.getZoom === 'function') {
                try { zoom = await this.mapillaryViewer.getZoom(); } catch (e) {}
            }

            // 2. Get Parent App URL (Crucial for dropped widgets)
            let baseUrlStr = window.location.href;
            try {
                if (window.self !== window.top && window.parent) {
                    baseUrlStr = window.parent.location.href;
                }
            } catch (e) {
                console.warn("Cannot access parent window url, using widget url");
            }
            
            const url = new URL(baseUrlStr);

            // Detect if we are currently in 2D or 3D
            const mapType = this.state.jimuMapView?.view?.type === '3d' ? '3d' : '2d';

            // 3. Set params
            // Note: The URL object automatically handles placing params before the hash (#)
            // if your URL happens to have one.
            url.searchParams.set('mly_id', this.state.imageId);
            url.searchParams.set('mly_b', bearing.toFixed(1));
            url.searchParams.set('mly_p', pitch.toFixed(1));
            url.searchParams.set('mly_z', zoom.toFixed(1));
            url.searchParams.set('mly_mt', mapType); // Save Map Type
            
            const urlString = url.toString();

            // 4. Robust Clipboard Strategy
            const showSuccessAlert = () => {
                alert(
                    "Link copied to clipboard!\n\n" +
                    "This link goes directly to this specific view.\n\n" + 
                    urlString
                );
            };

            // Strategy A: Async Clipboard
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    await navigator.clipboard.writeText(urlString);
                    showSuccessAlert();
                    return; 
                } catch (clipboardError) {
                    // Fail silently, try fallback
                }
            }

            // Strategy B: Textarea Fallback
            try {
                const textArea = document.createElement("textarea");
                textArea.value = urlString;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) {
                    showSuccessAlert();
                    return; 
                }
            } catch (execError) {}

            // Strategy C: Manual
            prompt("Copy this link:", urlString);

        } catch (err) {
            console.error("Error generating link:", err);
            alert("Error generating link.");
        }
    };

    // New helper method to handle the shared URL
    private checkUrlForSharedState = async () => {
        // 1. Get the query string. 
        // We attempt to read the PARENT window (the main browser URL), 
        // because the widget runs in an iframe and its own URL won't have the params.
        let search = window.location.search;
        try {
            if (window.self !== window.top && window.parent) {
                search = window.parent.location.search;
            }
        } catch (e) {
            console.warn("Cannot access parent window params, using widget params");
        }

        const params = new URLSearchParams(search);
        const sharedId = params.get('mly_id');

        if (sharedId) {

            // MAP VIEW TYPE CHECK AND SWITCH
            const targetMapType = params.get('mly_mt'); // '2d' or '3d'

            if (targetMapType && this.state.jimuMapView && !this._hasAttemptedMapSwitch) {
                const currentType = this.state.jimuMapView.view.type;
                
                // If the link was 2D but the map opened in 3D (or vice versa)
                if (currentType !== targetMapType) {
                    this._hasAttemptedMapSwitch = true; // Ensure we only try this once
                    try {
                        const mvManager = MapViewManager.getInstance();
                        const mapGroup = mvManager.getJimuMapViewGroup(this.state.jimuMapView.mapWidgetId);
                        
                        if (mapGroup) {
                            this.log(`Map mismatch: URL wants ${targetMapType}, current is ${currentType}. Switching...`);
                            
                            // Reset the check flag so it runs AGAIN after the map switches
                            this._hasCheckedSharedState = false; 
                            
                            // Tell the Experience Builder Map Widget to toggle its 2D/3D state
                            mapGroup.switchMap();
                            
                            // Exit now. The map will switch, trigger onActiveViewChange, and come back here automatically.
                            return; 
                        }
                    } catch (err) {
                        console.warn("Could not auto-switch map view:", err);
                    }
                }
            }

            this.log("Shared Mapillary ID found:", sharedId);
            this.setState({ isSharedState: true });
            
            // Get camera params
            const bearing = parseFloat(params.get('mly_b') || '0');
            const pitch = parseFloat(params.get('mly_p') || '0');
            const mapillaryZoom = parseFloat(params.get('mly_z') || '0');

            try {
                // Fetch image details to get sequence ID and coords
                const resp = await fetch(`https://graph.mapillary.com/${sharedId}?fields=sequence,geometry`, {
                    headers: { Authorization: `OAuth ${this.accessToken}` }
                });
                
                if (resp.ok) {
                    const data = await resp.json();
                    const seqId = data.sequence;
                    const coords = data.geometry?.coordinates; // [lon, lat]

                    if (seqId && coords) {

                        // Take control of the camera and don't let anyone else in.
                        this._isFlyInActive = true;

                         // 1. Load the sequence in the viewer
                        await this.loadSequenceById(seqId, sharedId);
                        
                        // 2. ZOOM & CENTER the ArcGIS Map (Cinematic Fly-in)
                        if (this.state.jimuMapView && this.ArcGISModules) {
                            const view = this.state.jimuMapView.view;
                            const { Point } = this.ArcGISModules;

                            // Create a precise geometric point
                            const targetPoint = new Point({
                                longitude: coords[0],
                                latitude: coords[1],
                                spatialReference: { wkid: 4326 }
                            });

                            await view.when(); // Ensure map drawing engine is ready

                            if (view.type === "3d") {
                              await view.goTo({
                                    target: targetPoint,
                                    heading: bearing, 
                                    tilt: 60, 
                                    zoom: 19 
                                }, { animate: true, duration: 2500 });
                            } else {
                                view.goTo({
                                    target: targetPoint,
                                    zoom: 19 // Deep street-level zoom for 2D maps
                                }, { animate: true, duration: 2000 });
                            }
                        }
                        
                        // Flight complete, restore normal camera tracking.
                        setTimeout(() => {
                            this._isFlyInActive = false; 
                        }, 4000);

                        // 3. Apply Camera Angles after viewer is ready
                        setTimeout(() => {
                            if (this.mapillaryViewer) {
                                if (typeof this.mapillaryViewer.setCenter === 'function') this.mapillaryViewer.setCenter([coords[0], coords[1]]);
                                if (typeof this.mapillaryViewer.setBearing === 'function') this.mapillaryViewer.setBearing(bearing);
                                if (typeof this.mapillaryViewer.setPitch === 'function') this.mapillaryViewer.setPitch(pitch);
                                if (typeof this.mapillaryViewer.setZoom === 'function') this.mapillaryViewer.setZoom(mapillaryZoom);
                            }
                        }, 1000); 
                    }
                }
            } catch (err) {
                console.error("Failed to load shared state", err);
            }
        }
    }

    // --- Local caching of last sequence ---
    // Stores minimal sequence info (IDs + coords) in localStorage
    // to reload previous sequence instantly on widget startup.
    private saveSequenceCache(sequenceId: string, sequenceImages: { id: string; lat: number; lon: number }[]) {
        try {
            localStorage.setItem("mapillary_sequence_cache", JSON.stringify({
                sequenceId,
                sequenceImages
            }));
            this.log("Sequence cached to localStorage");
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
                    this.log("Sequence images restored from localStorage");
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

    // --- Helper for Debug Logging ---
    private log = (...args: any[]) => {
        if (this.props.config.debugMode) {
            // Adds a prefix so you can easily filter in Chrome DevTools
            console.log("%c[Mapillary Widget]", "color: #37d582; font-weight: bold;", ...args);
        }
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

    // Toggles the year filter on the existing Turbo layer
    private handleYearLegendClick = (year: string) => {
        // Toggle: if clicking the already selected year, turn it off (null). Otherwise, select it.
        const newYear = this.state.selectedTurboYear === year ? null : year;
        
        this.setState({ selectedTurboYear: newYear });

        if (this.turboCoverageLayer) {
            this.turboCoverageLayer.definitionExpression = newYear 
                ? `date_category = '${newYear}'` 
                : null; // null clears the filter
        }
    }

    private showTurboHover(graphic: __esri.Graphic) {
        const view = this.state.jimuMapView?.view;
        if (!view || !this.ArcGISModules) return;

        const oid = graphic.attributes?.oid;

        // Don't restart animation if already hovering the same point
        if (this._lastHoveredTurboOid === oid && this._turboHoverGraphic) return;
        this._lastHoveredTurboOid = oid;

        // Clear previous hover graphic
        this.clearTurboHover();

        const { Graphic } = this.ArcGISModules;

        // Clone the geometry of the hovered turbo point
        const hoverGraphic = new Graphic({
            geometry: graphic.geometry,
            symbol: {
                type: "simple-marker",
                color: [165, 42, 42, 0.95],   // same brown, slightly more opaque
                size: 6,
                outline: { color: [255, 255, 255, 0.9], width: 1.5 }
            } as any
        });

        (hoverGraphic as any).__isTurboHover = true;
        view.graphics.add(hoverGraphic);
        this._turboHoverGraphic = hoverGraphic;

        // Pulse animation: grows from 6 → 11 → 6 repeatedly
        let size = 6;
        let growing = true;

        this._turboHoverInterval = setInterval(() => {
            if (!this._turboHoverGraphic) {
                clearInterval(this._turboHoverInterval);
                return;
            }

            size += growing ? 0.4 : -0.4;
            if (size >= 11) growing = false;
            if (size <= 6)  growing = true;

            this._turboHoverGraphic.symbol = {
                type: "simple-marker",
                color: [165, 42, 42, 0.95],
                size: size,
                outline: { color: [255, 255, 255, 0.9], width: 1.5 }
            } as any;
        }, 40);
    }

    private clearTurboHover() {
        if (this._turboHoverInterval) {
            clearInterval(this._turboHoverInterval);
            this._turboHoverInterval = null;
        }
        if (this._turboHoverGraphic) {
            const view = this.state.jimuMapView?.view;
            if (view) view.graphics.remove(this._turboHoverGraphic);
            this._turboHoverGraphic = null;
        }
        this._lastHoveredTurboOid = null;
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
     private async enableTurboCoverageLayer(forceUsernameFilter?: string) {
        if (!this.state.turboModeActive) return;

        // INCREMENT REQUEST ID
        const requestId = ++this._turboRequestCount;

        const {
            jimuMapView,
            turboFilterUsername,
            turboFilterStartDate,
            turboFilterEndDate,
            turboFilterIsPano,
            turboColorByDate
        } = this.state;

        const activeUsername = forceUsernameFilter !== undefined ? forceUsernameFilter : turboFilterUsername;

        if (!jimuMapView) return;

        // Check Zoom Level
        const minTurboZoom = 16;
        if (jimuMapView.view.zoom < minTurboZoom) return;

        this.setState({ turboLoading: true });
        this.disableTurboCoverageLayer();
        
        // CHECK CANCELLATION
        if (this._turboRequestCount !== requestId) return;

        // 1. Resolve Username to ID (One-time check)
        let targetCreatorId: number | null = null;
        if (activeUsername && activeUsername.trim().length > 0) {
            targetCreatorId = await this.getUserIdFromUsername(activeUsername.trim());

            // CHECK CANCELLATION AGAIN AFTER AWAIT
            if (this._turboRequestCount !== requestId) return;

            if (!targetCreatorId) {
                this.showZoomWarning(`User '${activeUsername}' not found.`, 3000);
                this.setState({ turboLoading: false });
                return;
            }
        }

        // 2. Calculate Extent
        let wgs84Extent: __esri.Extent;
        try {
            const projected = webMercatorUtils.webMercatorToGeographic(jimuMapView.view.extent);
            wgs84Extent = projected as __esri.Extent;
        } catch (err) {
            this.setState({ turboLoading: false });
            return; 
        }

        const bbox = [wgs84Extent.xmin, wgs84Extent.ymin, wgs84Extent.xmax, wgs84Extent.ymax];
        const zoom = 14;
        const tiles = this.bboxToTileRange(bbox, zoom);

        const seenIds = new Set<string>();
        let features: any[] = [];
        const allYears: Set<string> = new Set();
        
        const startTime = turboFilterStartDate ? new Date(turboFilterStartDate).getTime() : null;
        const endTime = turboFilterEndDate ? new Date(turboFilterEndDate).getTime() : null;

        let objectIdCounter = 1;

        // 3. Process Tiles
        for (const [x, y, z] of tiles) {

            // CHECK CANCELLATION INSIDE LOOP
            if (this._turboRequestCount !== requestId) return;
            
            const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${this.accessToken}`;
            try {
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const ab = await resp.arrayBuffer();
                const tile = new VectorTile(new Pbf(ab));

                const imgLayer = tile.layers["image"];
                if (imgLayer) {
                    for (let i = 0; i < imgLayer.length; i++) {
                        const feat = imgLayer.feature(i);
                        const props = feat.properties; 

                        // --- Filtering ---
                        if (targetCreatorId !== null && props.creator_id !== targetCreatorId) continue;

                        if (turboFilterIsPano !== undefined) {
                            const isPano = !!props.is_pano; 
                            if (isPano !== turboFilterIsPano) continue;
                        }

                        if (startTime || endTime || turboColorByDate) {
                            if (props.captured_at) {
                                const t = props.captured_at; 
                                if (startTime && t < startTime) continue;
                                if (endTime && t > endTime) continue;
                                // REMOVED: allYears.add() from here
                            } else if (startTime || endTime) {
                                continue;
                            }
                        }

                        const geo = feat.toGeoJSON(x, y, z);
                        const [lon, lat] = geo.geometry.coordinates;
                        
                        // ID HANDLING: Convert to string immediately
                        const idStr = String(props.id);

                        // --- BOUNDARY CHECK ---
                        if (
                            !seenIds.has(idStr) &&
                            lon >= bbox[0] && lon <= bbox[2] &&
                            lat >= bbox[1] && lat <= bbox[3]
                        ) {
                            seenIds.add(idStr);

                            let yearCat: string | null = null;
                            
                            // Adding to Legend ONLY if point is inside BBOX
                            if (turboColorByDate && props.captured_at) {
                                const d = new Date(props.captured_at);
                                if (!isNaN(d.getTime())) {
                                    yearCat = String(d.getFullYear());
                                    allYears.add(yearCat); // <--- MOVED HERE
                                }
                            }

                            // --- CREATE FEATURE ---
                            features.push({
                                geometry: webMercatorUtils.geographicToWebMercator({
                                    type: "point",
                                    x: lon,
                                    y: lat,
                                    spatialReference: { wkid: 4326 }
                                }),
                                attributes: {
                                    oid: objectIdCounter++, 
                                    image_id: idStr, // STORED AS STRING 'image_id'
                                    creator_id: String(props.creator_id), 
                                    sequence_id: String(props.sequence_id || ""),
                                    captured_at: props.captured_at || null, 
                                    is_pano: !!props.is_pano ? 1 : 0,
                                    date_category: yearCat,
                                    // PBF doesn't have username string, we rely on API for that later
                                    creator_username: activeUsername || null 
                                }
                            });
                        }
                    }
                }
            } catch (err) { }
        }

        // FINAL CANCELLATION CHECK BEFORE UPDATING MAP
        if (this._turboRequestCount !== requestId) {
            return;
        }

        if (!features.length) {
            this.showZoomWarning("No Turbo coverage matches found.", 3000);
            this.setState({ turboLoading: false });
            return;
        }

        if (!this.state.turboModeActive || this.props.state === 'CLOSED') {
            this.setState({ turboLoading: false });
            return;
        }

        // --- Renderer Setup ---
        let renderer: __esri.Renderer;
        if (turboColorByDate && allYears.size > 0) {
            const yearList = Array.from(allYears).sort();
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

        // Extract FeatureLayer from the modules loaded in componentDidMount
        const { FeatureLayer } = this.ArcGISModules;

        // --- Layer Creation ---
        this.turboCoverageLayer = new FeatureLayer({
            id: "turboCoverage",
            title: "Mapillary Turbo Coverage Points",
            source: features,
            objectIdField: "oid",
            elevationInfo: {
                mode: "on-the-ground" // Drapes turbo points on ground surface, below graphics in 3D
            },
            definitionExpression: this.state.selectedTurboYear ? `date_category = '${this.state.selectedTurboYear}'` : undefined,
            fields: [
                { name: "oid", type: "oid" },
                { name: "image_id", type: "string" }, // Critical field for lookup
                { name: "creator_id", type: "string" },
                { name: "creator_username", type: "string" },
                { name: "sequence_id", type: "string" },
                { name: "captured_at", type: "date" },
                { name: "date_category", type: "string" },
                { name: "is_pano", type: "integer" }
            ],
            geometryType: "point",
            spatialReference: { wkid: 3857 },
            renderer,
            popupEnabled: false,
            outFields: ["*"] // Ensure all attributes are available on client
        });

        // Final safety check
        if (this._turboRequestCount === requestId) {
            jimuMapView.view.map.add(this.turboCoverageLayer);
            
            jimuMapView.view.whenLayerView(this.turboCoverageLayer).then(lv => {
                this.turboCoverageLayerView = lv;
            });
            this.setState({ turboLoading: false });
        }
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
        this.log("Turbo coverage layers removed");
    }
    
    // --- Load a specific sequence by ID and image ---
    // Fetches all image coordinates in the sequence,
    // updates the viewer, re-draws map markers,
    // and attaches Mapillary event listeners for bearing/image changes.
    private async loadSequenceById(sequenceId: string, startImageId: string, clickPoint?: { lon: number, lat: number }) {
        this.clearGreenPulse();
        
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // Old Code Logic: Simple clear if sequence changed
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
                selectedSequenceId: sequenceId,
                hasTimeTravel: false
            });

            // --- Check for Time Travel for the starting image ---
            const currentImg = updatedSequence.find(img => img.id === startImageId);
            if (currentImg) {
                // Passing captured_at instead of sequenceId
                this.checkForTimeTravel(startImageId);
                
                this.currentGreenGraphic = this.drawPulsingPoint(currentImg.lon, currentImg.lat, [0, 255, 0, 1]);
            }

            // Cache sequence
            this.saveSequenceCache(sequenceId, updatedSequence);

            // Destroy old viewer if exists
            if (this.mapillaryViewer) {
                try { this.mapillaryViewer.remove(); } catch {}
                this.mapillaryViewer = null;
            }

            // Create new Mapillary viewer
            if (this.viewerContainer.current) {
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId: startImageId,
                    renderMode: this.props.config.renderMode ?? 1,      // Default to Fill
                    transitionMode: this.props.config.transitionMode ?? 0, // Default to Smooth
                    component: {
                        zoom: true,    
                        direction: {
                            maxWidth: 200,
                            minWidth: 200,
                        },   
                        cover: false,
                        tag: true,
                        sequence: {
                            minWidth: 50,
                            maxWidth: 117
                        }
                    }
                });
                
                this.bindMapillaryEvents();
            }

            // Clear previous green pulse
            this.clearGreenPulse();

            // Clear old map graphics (except overlay)
            const toRemove: __esri.Graphic[] = [];
            jimuMapView.view.graphics.forEach(g => {
                if (!(g as any).__isSequenceOverlay) {
                    toRemove.push(g);
                }
            });
            toRemove.forEach(g => jimuMapView.view.graphics.remove(g));

            // --- MOVED UP: Draw Polyline FIRST so it stays BEHIND points ---
            const { Graphic } = this.ArcGISModules;
            
            const hasPolyline = jimuMapView.view.graphics.some(g => 
                (g as any).__isSequenceOverlay && 
                g.geometry.type === "polyline" && 
                g.attributes?.sequenceId === sequenceId
            );

            if (!hasPolyline && updatedSequence.length > 1) {
                 const paths = updatedSequence.map(img => [img.lon, img.lat]);
                 
                 const polylineGraphic = new Graphic({
                    geometry: { type: "polyline", paths: [paths], spatialReference: { wkid: 4326 } },
                    symbol: { type: "simple-line", color: [0, 0, 255, 0.8], width: 3 }, 
                    attributes: { sequenceId: sequenceId }
                });
                (polylineGraphic as any).__isSequenceOverlay = true;
                jimuMapView.view.graphics.add(polylineGraphic);
            }
            // -------------------------------------------------------------

            // Draw Blue Dots (Active Sequence) - Now they render ON TOP of the line
            updatedSequence.forEach(img => {
                if (img.id !== startImageId) {
                    this.drawPointWithoutRemoving(img.lon, img.lat, [0, 0, 255, 1], sequenceId);
                }
            });

            // Draw active Green Pulse - Topmost
            if (currentImg) {
                this.currentGreenGraphic = this.drawPulsingPoint(currentImg.lon, currentImg.lat, [0, 255, 0, 1]);
            }

            // Redraw clicked location marker if exists
            // Use passed point (fresh) or fallback to state (if no new click passed)
            const targetLon = clickPoint ? clickPoint.lon : this.state.clickLon;
            const targetLat = clickPoint ? clickPoint.lat : this.state.clickLat;

            if (targetLon != null && targetLat != null) {
                this.drawPoint(targetLon, targetLat);
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
            const [Graphic, Point, SimpleMarkerSymbol, VectorTileLayer, FeatureLayer] =
                await loadArcGISJSAPIModules([
                    "esri/Graphic",
                    "esri/geometry/Point",
                    "esri/symbols/SimpleMarkerSymbol",
                    "esri/layers/VectorTileLayer",
                    "esri/layers/FeatureLayer"
                ]);
            this.ArcGISModules = {
                Graphic, 
                Point, 
                SimpleMarkerSymbol, 
                VectorTileLayer,
                FeatureLayer
            };
            this.log("ArcGIS API modules loaded");

            // Resolve Default Creator ID if configured
            let defaultFilterId: number | undefined = undefined;
            if (this.props.config.turboCreator) {
                defaultFilterId = await this.getUserIdFromUsername(this.props.config.turboCreator);
                if(defaultFilterId) this.log(`Initializing Always-On layer for user ID: ${defaultFilterId}`);
            }

            // Initialize layer with the resolved ID
            this.initMapillaryLayer(defaultFilterId);
            this.initMapillaryTrafficSignsLayer();
            this.initMapillaryObjectsLayer(); 
        } catch (err) {
            console.error("ArcGIS modules failed to load:", err);
        }

        // Restore any cached sequence from previous session
        this.restoreSequenceCache();

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

        if (this.props.config.turboCreator) {
            this.setState({ turboFilterUsername: this.props.config.turboCreator });
        }

        // Check if Turbo Mode Only is enabled in config
        // Just set the state here. The watchers will be attached 
        // as soon as the map loads via onActiveViewChange.
        if (this.props.config.turboModeOnly) {
            this.setState({ turboModeActive: true });
        }

        // --- Check if we need to add the "Always On" layer now ---
        // If the MapView loaded BEFORE these modules, onActiveViewChange skipped the add.
        // We must do it here now that modules (and the layer object) are ready.
        if (this.props.config.coverageLayerAlwaysOn && this.state.jimuMapView) {
            const view = this.state.jimuMapView.view;
            const existingLayer = view.map.findLayerById("mapillary-vector-tiles");
            
            if (!existingLayer && this.mapillaryVTLayer) {
                view.map.add(this.mapillaryVTLayer);
                this.setState({ tilesActive: true });
                this.log("Coverage layer added from componentDidMount (deferred load)");
            }
        }
    }
	
	componentDidUpdate(prevProps: AllWidgetProps<any>, prevState: State) {
        
        // --- 1. Handle Resize & Re-attach Observer ---
        if (this.mapillaryViewer) {
            try { this.mapillaryViewer.resize(); } catch (e) { }
            setTimeout(() => {
                if (this.mapillaryViewer) {
                    try { this.mapillaryViewer.resize(); } catch (e) { }
                }
            }, 100);
        }

        if (prevState.isFullscreen !== this.state.isFullscreen) {
            if (this.resizeObserver) this.resizeObserver.disconnect();
            this.resizeObserver = new ResizeObserver(() => {
                if (this.mapillaryViewer?.resize) this.mapillaryViewer.resize();
            });
            if (this.viewerContainer.current) {
                this.resizeObserver.observe(this.viewerContainer.current);
            }
        }

        // --- 2. Handle State Transitions (Minimize/Close) ---
        
        // Minimized: Keep listeners, but clean up viewer if needed
        if (prevProps.visible && !this.props.visible) {
            this.log("Widget minimized - keeping listeners");
            this.cleanupWidgetEnvironment(true, false);
        }

        // Closed: Full cleanup
        if (prevProps.state === 'OPENED' && this.props.state === 'CLOSED') {
            this.log("Widget closed - cleaning up completely");
            this.cleanupWidgetEnvironment(true, true);
        }

        // --- 3. Handle Reopening (Seamless Filter Loading) ---
        if (prevProps.state === 'CLOSED' && this.props.state === 'OPENED' && this.state.jimuMapView) {
            this.log("Widget reopened - initializing environment...");

            // A. Define the initialization logic that should run ONLY after the layer is ready
            const proceedWithWidgetInitialization = () => {
                // Init secondary layers
                if (!this.mapillaryTrafficSignsLayer && this.props.config.enableTrafficSigns !== false) {
                    this.initMapillaryTrafficSignsLayer();
                }
                if (!this.mapillaryObjectsLayer && this.props.config.enableMapillaryObjects !== false) {
                    this.initMapillaryObjectsLayer();
                }

                // Restore state
                this.setState({
                    turboModeActive: !!this.props.config.turboModeOnly,
                    turboFilterUsername: this.props.config.turboCreator || "",
                    turboFilterStartDate: "",
                    turboFilterEndDate: "",
                    turboFilterIsPano: undefined,
                    turboColorByDate: false,
                    turboYearLegend: [],
                    showTurboFilterBox: false
                }, () => {
                    // Force Turbo Layer if needed
                    if (this.state.turboModeActive) {
                         this.enableTurboCoverageLayer(this.props.config.turboCreator);
                    }
                });

                this.disableTurboCoverageLayer();
                
                // CRITICAL: onActiveViewChange adds the layer to the map if "Always On" is checked.
                // By calling it here, we ensure we only add the layer AFTER it has been initialized with the correct filter.
                this.onActiveViewChange(this.state.jimuMapView);
            };

            // B. Resolve Layer ID before creating the layer
            const defaultUser = this.props.config.turboCreator || "";

            // If we need to recreate the layer (it was destroyed on close)
            if (!this.mapillaryVTLayer) {
                if (defaultUser) {
                    // ASYNC PATH: Fetch ID -> Create Layer -> Proceed
                    // This prevents the "unfiltered flash" because the layer doesn't exist yet
                    this.getUserIdFromUsername(defaultUser).then(id => {
                        // Create layer with specific ID filter
                        this.initMapillaryLayer(id || undefined);
                        proceedWithWidgetInitialization();
                    }).catch(err => {
                        console.warn("Failed to resolve user ID on reopen, defaulting to all", err);
                        this.initMapillaryLayer();
                        proceedWithWidgetInitialization();
                    });
                } else {
                    // SYNC PATH: No filter -> Create Layer -> Proceed
                    this.initMapillaryLayer();
                    proceedWithWidgetInitialization();
                }
            } else {
                // Layer already exists (rare edge case), just proceed
                proceedWithWidgetInitialization();
            }
        }

        // --- 4. Handle Config Changes (Standard Logic) ---

        // Traffic Signs Config
        if (prevProps.config.enableTrafficSigns !== this.props.config.enableTrafficSigns) {
            if (this.props.config.enableTrafficSigns === false) {
                if (this.state.trafficSignsActive) this.toggleMapillaryTrafficSigns();
                this.mapillaryTrafficSignsLayer = null;
            } else {
                this.initMapillaryTrafficSignsLayer();
            }
        }

        // Objects Config
        if (prevProps.config.enableMapillaryObjects !== this.props.config.enableMapillaryObjects) {
            if (this.props.config.enableMapillaryObjects === false) {
                if (this.state.objectsActive) this.toggleMapillaryObjects();
                this.mapillaryObjectsLayer = null;
            } else {
                this.initMapillaryObjectsLayer();
            }
        }

        // Creator Config Change (while widget is open)
        if (prevProps.config.turboCreator !== this.props.config.turboCreator) {
            const newCreator = this.props.config.turboCreator || "";
            this.setState({ turboFilterUsername: newCreator }, () => {
                if (this.state.turboModeActive) {
                    this.enableTurboCoverageLayer();
                }
            });
        }

        // Turbo Mode Only Config
        if (prevProps.config.turboModeOnly !== this.props.config.turboModeOnly) {
            if (this.props.config.turboModeOnly) {
                this.setState({ turboModeActive: true }, () => {
                    this.enableTurboCoverageLayer();
                });
            }
        }

        // Always On Config
        if (prevProps.config.coverageLayerAlwaysOn !== this.props.config.coverageLayerAlwaysOn) {
            if (this.props.config.coverageLayerAlwaysOn) {
                this.setState({ tilesActive: true });
                if (this.state.jimuMapView && this.mapillaryVTLayer) {
                     const existingLayer = this.state.jimuMapView.view.map.findLayerById("mapillary-vector-tiles");
                     if (!existingLayer) {
                         this.state.jimuMapView.view.map.add(this.mapillaryVTLayer);
                     }
                }
            } else {
                this.setState({ tilesActive: false });
                if (this.state.jimuMapView) {
                    const existingLayer = this.state.jimuMapView.view.map.findLayerById("mapillary-vector-tiles");
                    if (existingLayer) {
                        this.state.jimuMapView.view.map.remove(existingLayer);
                    }
                }
            }
        }

        if (prevProps.config.hideCoverageCircles !== this.props.config.hideCoverageCircles) {
            const reInitLayer = async () => {
                let targetId: number | undefined = undefined;
                if (this.props.config.turboCreator) {
                    targetId = (await this.getUserIdFromUsername(this.props.config.turboCreator)) || undefined;
                }
                
                // Re-create the layer with the new style
                this.initMapillaryLayer(targetId);
                
                // If it's currently showing on the map, swap it out instantly
                if (this.state.tilesActive && this.state.jimuMapView) {
                    const view = this.state.jimuMapView.view;
                    const existingLayer = view.map.findLayerById("mapillary-vector-tiles");
                    if (existingLayer) {
                        view.map.remove(existingLayer);
                    }
                    if (this.mapillaryVTLayer) {
                        view.map.add(this.mapillaryVTLayer);
                        
                        // Ensure Turbo/Features stay on top of the newly added VT layer
                        const layers = view.map.layers;
                        if (this.turboCoverageLayer && layers.includes(this.turboCoverageLayer)) {
                            view.map.reorder(this.turboCoverageLayer, layers.length - 1);
                        }
                        if (this.mapillaryObjectsFeatureLayer && layers.includes(this.mapillaryObjectsFeatureLayer)) {
                            view.map.reorder(this.mapillaryObjectsFeatureLayer, layers.length - 1);
                        }
                        if (this.mapillaryTrafficSignsFeatureLayer && layers.includes(this.mapillaryTrafficSignsFeatureLayer)) {
                            view.map.reorder(this.mapillaryTrafficSignsFeatureLayer, layers.length - 1);
                        }
                    }
                }
            };
            reInitLayer();
        }

        // --- 5. Handle Dynamic Component Toggling (Bearing/Zoom)
        if (this.mapillaryViewer) {
            // Handle Bearing Toggle
            if (prevProps.config.hideBearing !== this.props.config.hideBearing) {
                if (this.props.config.hideBearing) {
                    this.mapillaryViewer.deactivateComponent('bearing');
                } else {
                    this.mapillaryViewer.activateComponent('bearing');
                }
            }
            // Handle Zoom Toggle
            if (prevProps.config.hideZoom !== this.props.config.hideZoom) {
                if (this.props.config.hideZoom) {
                    this.mapillaryViewer.deactivateComponent('zoom');
                } else {
                    this.mapillaryViewer.activateComponent('zoom');
                }
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
            try {
                this.mapillaryViewer.resize();
            } catch (e) {
                console.warn("Viewer resize suppressed during fullscreen toggle");
            }
        }
    };

    /**
        * Handles window resize events by resizing the Mapillary viewer.
        * Ensures viewer adapts to window dimension changes.
    */
    private handleWindowResize = () => {
        if (this.mapillaryViewer?.resize) {
            try {
                this.mapillaryViewer.resize();
                this.applyCustomCameraAngle();
            } catch (e) {
                 // Ignore resize errors if widget is hidden/destroyed
            }
        }
    };

    /*
        * Handles map view changes and sets up click/hover event handlers.
        * Manages interactions for both normal and turbo mode, including object/traffic sign layers.
    */
    onActiveViewChange(jmv: JimuMapView) {
        if (!jmv) return;

        this.log("Active MapView set - Attaching Handlers");
        this.setState({ jimuMapView: jmv });

        // Use a callback to restore graphics AFTER state is set ---
        this.setState({ jimuMapView: jmv }, () => {
            jmv.view.when(() => {
                this.restoreMapGraphics();
            });
        });

        // Ensure shared link is checked ONLY AFTER the map view is bound
        if (!this._hasCheckedSharedState) {
            this._hasCheckedSharedState = true;
            // Short delay to ensure React state has committed the map view
            setTimeout(() => {
                this.checkUrlForSharedState();
            }, 100);
        }

        // ZOOM WATCHER 
        if (this.zoomDisplayHandle) {
            this.zoomDisplayHandle.remove();
            this.zoomDisplayHandle = null;
        }
        
        this.setState({ currentZoom: jmv.view.zoom });
        this.zoomDisplayHandle = jmv.view.watch("zoom", (newZoom: number) => {
            this.setState({ currentZoom: newZoom });
        });
        
        if (this.mapClickHandle) this.mapClickHandle.remove();
        if (this.pointerMoveHandle) this.pointerMoveHandle.remove();

        // Force Add Coverage Layer if Config is ON
        if (this.props.config.coverageLayerAlwaysOn) {
            this.setState({ tilesActive: true });
            if (this.ArcGISModules && this.mapillaryVTLayer) {
                const existingLayer = jmv.view.map.findLayerById("mapillary-vector-tiles");
                if (!existingLayer) {
                    jmv.view.map.add(this.mapillaryVTLayer);
                }
            }
        }

        // --- CLICK HANDLER ---
        this.mapClickHandle = jmv.view.on("click", async (evt) => {
            if (this.props.state === 'CLOSED') return;

            const point = jmv.view.toMap(evt) as __esri.Point;
            this.setState({ clickLon: point.longitude, clickLat: point.latitude });

            try {
                const response = await jmv.view.hitTest(evt);
                
                // 1. Blue Markers
                const seqPointHit = response.results.find(r => 
                    r.graphic && 
                    (
                        (r.graphic as any).__isSequenceOverlay || 
                        (r.graphic as any).__isActiveSequencePoint
                    ) &&
                    r.graphic.geometry?.type === "point"
                );

                if (seqPointHit) {
                    const seqId = seqPointHit.graphic.attributes?.sequenceId || this.state.selectedSequenceId;
                    if (!seqId) return;
                    
                    let currentSeqData = this.state.sequenceImages;
                    if (this.state.selectedSequenceId !== seqId || !currentSeqData.length) {
                        currentSeqData = await this.getSequenceWithCoords(seqId, this.accessToken);
                    }

                    if (currentSeqData.length) {
                        const closestImg = currentSeqData.reduce((closest, img) => {
                            const dist = this.distanceMeters(img.lat, img.lon, point.latitude, point.longitude);
                            return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                        }, null as any);

                        if (closestImg) {
                            if (this.state.selectedSequenceId !== seqId) {
                                this.setState({ selectedSequenceId: seqId });
                            }
                            await this.loadSequenceById(seqId, closestImg.id, { lon: point.longitude, lat: point.latitude });
                            return;
                        }
                    }
                    return;
                }

                // 2. Objects/Signs
                const featureHit = response.results.find(r => {
                    const layer = r.layer || (r.graphic && r.graphic.layer);
                    return layer && (layer.id === "mapillary-objects-fl" || layer.id === "mapillary-traffic-signs-fl");
                });

                if (featureHit && featureHit.graphic) {
                    const attrs = featureHit.graphic.attributes;
                    const featureId = attrs.id || attrs.value; // Mapillary usually uses 'id' for the feature ID
                    
                    // Get feature coordinates
                    const geoPt = webMercatorUtils.webMercatorToGeographic(featureHit.graphic.geometry) as __esri.Point;

                    // 1. Highlight the feature (Optional: Draw a specific marker for the selected object)
                    this.drawPoint(geoPt.longitude, geoPt.latitude);

                    // 2. Fetch alternates
                    this.fetchAlternateImages(featureId, geoPt.latitude, geoPt.longitude);
                    
                    // Stop here so we don't trigger the "nearest sequence" search
                    return;
                }

                // 3. Turbo Coverage
                const turboHit = response.results.find(r => {
                    const layer = r.layer || (r.graphic && r.graphic.layer);
                    return layer && layer.id === "turboCoverage";
                });
                
                // === TURBO MODE BRANCH ===
                if (this.state.turboModeActive) {
                    if (turboHit) {
                        const hitGraphic = turboHit.graphic;
                        const attrs = hitGraphic?.attributes;

                        if (this.turboCoverageLayerView && hitGraphic) {
                            if (this.highlightHandle) this.highlightHandle.remove();
                            this.highlightHandle = this.turboCoverageLayerView.highlight(hitGraphic);
                        }

                        if (attrs) {
                            const imageId = attrs.image_id || attrs.id; 
                            if (!imageId) return;

                            let seqId = attrs.sequence_id;

                           // Fetch Sequence ID from Graph API if missing in PBF
                            if (!seqId || seqId === "" || seqId === "undefined") {
                                try {
                                    const resp = await fetch(`https://graph.mapillary.com/${imageId}?fields=sequence`, {
                                        headers: { Authorization: `OAuth ${this.accessToken}` }
                                    });
                                    if (resp.ok) {
                                        const data = await resp.json();
                                        seqId = data.sequence;
                                        // Cache it back to graphic
                                        hitGraphic.attributes.sequence_id = seqId;
                                    }
                                } catch (err) { 
                                    console.error("Failed to fetch sequence for click", err);
                                    return; 
                                }
                            }
                            if (seqId) {
                                this.drawClickRipple(point.longitude, point.latitude);
                                this.setState({ selectedSequenceId: seqId });
                                this.clearSequenceGraphics();
                                await this.loadSequenceById(seqId, imageId, { lon: point.longitude, lat: point.latitude });
                                return;
                            }
                        }
                    } else {
                        // Clicked empty space in Turbo Mode
                        this.drawWarningRipple(point.longitude, point.latitude);
                        this.showZoomWarning("Turbo Mode: Please click directly on a brown coverage point.", 3000);
                        return;
                    }
                }
                
                // === NORMAL MODE BRANCH ===
                await this.handleMapClick(evt);

            } catch (error) {
                console.error("Click error", error);
                if (!this.state.turboModeActive) {
                    await this.handleMapClick(evt);
                }
            }
        });

        // --- HOVER HANDLER (Strict Debounce) ---
        this.pointerMoveHandle = jmv.view.on("pointer-move", async (evt) => {
            const globalX = evt.native.clientX;
            const globalY = evt.native.clientY;

            const hit = await jmv.view.hitTest(evt);
            
            // Standard Object Hover Logic
            const obj = hit.results.find(r => {
                const l = r.layer || (r.graphic && r.graphic.layer);
                return l && l.id === "mapillary-objects-fl";
            });

            if (obj && obj.graphic) {
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

            if (!this.tooltipDiv) return;

            // Turbo Mode Hover
            const turboHit = hit.results.find(r => {
                const layer = r.layer || (r.graphic && r.graphic.layer);
                return layer && layer.id === "turboCoverage";
            });

            if (turboHit) {
                const hitGraphic = turboHit.graphic;
                const attrs = hitGraphic?.attributes;
                if (!attrs) return;

                const featureId = attrs.image_id || attrs.id;
                if (!featureId) return;

                // GROW ANIMATION
                this.showTurboHover(hitGraphic);

                // TOOLTIP LOGIC (unchanged)
                if (this._currentHoveredFeatureId !== featureId) {
                    if (this._hoverTimeout) {
                        clearTimeout(this._hoverTimeout);
                        this._hoverTimeout = null;
                    }
                    this.tooltipDiv.style.display = "none";
                    this._currentHoveredFeatureId = featureId;

                    this._hoverTimeout = setTimeout(async () => {
                        if (!this.tooltipDiv) return;
                        this.tooltipDiv.innerHTML = `<div>Loading details…</div>`;
                        this.tooltipDiv.style.left = `${globalX + 15}px`;
                        this.tooltipDiv.style.top = `${globalY + 15}px`;
                        this.tooltipDiv.style.display = "block";

                        if (attrs.creator_username && attrs.thumb_url) {
                            const dateStr = attrs.captured_at ? new Date(attrs.captured_at).toLocaleString() : "Unknown date";
                            const thumbHtml = `<img src="${attrs.thumb_url}" style="max-width:150px;border-radius:3px;margin-top:4px;display:block;" />`;
                            this.tooltipDiv.innerHTML = `
                                <div><b>${attrs.creator_username}</b></div>
                                <div style="font-size:10px">${dateStr}</div>
                                ${thumbHtml}
                            `;
                            return;
                        }

                        try {
                            const url = `https://graph.mapillary.com/${featureId}?fields=id,sequence,creator.username,captured_at,thumb_256_url`;
                            const resp = await fetch(url, {
                                headers: { Authorization: `OAuth ${this.accessToken}` }
                            });

                            if (resp.ok) {
                                const data = await resp.json();
                                if (!this.tooltipDiv) return;

                                hitGraphic.attributes.creator_username = data.creator?.username;
                                hitGraphic.attributes.thumb_url = data.thumb_256_url;
                                if (data.captured_at) hitGraphic.attributes.captured_at = new Date(data.captured_at).getTime();

                                const dateStr = data.captured_at
                                    ? new Date(data.captured_at).toLocaleString()
                                    : "Unknown date";

                                const thumbHtml = data.thumb_256_url
                                    ? `<img src="${data.thumb_256_url}" style="max-width:150px;border-radius:3px;margin-top:4px;display:block;" />`
                                    : "";

                                this.tooltipDiv.innerHTML = `
                                    <div><b>${data.creator?.username || "Unknown User"}</b></div>
                                    <div style="font-size:10px">${dateStr}</div>
                                    ${thumbHtml}
                                `;
                            } else {
                                this.tooltipDiv.innerHTML = `<div>Failed to load details</div>`;
                            }
                        } catch (err) {
                            this.tooltipDiv.innerHTML = `<div>Error loading details</div>`;
                        }
                    }, 300);
                } else {
                    // Same feature, just update tooltip position
                    if (this.tooltipDiv.style.display === "block") {
                        this.tooltipDiv.style.left = `${globalX + 15}px`;
                        this.tooltipDiv.style.top = `${globalY + 15}px`;
                    }
                }
            } else {
                // CLEAR HOVER ANIMATION
                this.clearTurboHover();

                if (this._hoverTimeout) {
                    clearTimeout(this._hoverTimeout);
                    this._hoverTimeout = null;
                }
                this._currentHoveredFeatureId = null;
                this.tooltipDiv.style.display = "none";
            }
        });

        // Auto-Initialize Turbo Watchers if Config is ON
        if (this.props.config.turboModeOnly) {
            this.setState({ turboModeActive: true });

            if (this.turboStationaryHandle) this.turboStationaryHandle.remove();
            
            this.turboStationaryHandle = jmv.view.watch(
                "stationary",
                this.debounce(async (isStationary) => {
                    if (isStationary && this.state.turboModeActive) {
                        const stateFilter = this.state.turboFilterUsername.trim();
                        const configFilter = this.props.config.turboCreator || "";
                        const effectiveFilter = stateFilter || configFilter;

                        if (effectiveFilter) {
                            await this.enableTurboCoverageLayer(effectiveFilter);
                        } else {
                            await this.enableTurboCoverageLayer();
                        }
                    }
                }, 500)
            );

            if (this.turboZoomHandle) this.turboZoomHandle.remove();
            this.turboZoomHandle = jmv.view.watch("zoom", (z) => {
                const minTurboZoom = 16;
                if (this.state.turboModeActive) {
                    if (z < minTurboZoom) {
                        this.disableTurboCoverageLayer();
                        this.showZoomWarning("Turbo Mode active: Zoom in closer (≥ 16) to interact with data.", 0);
                    } else {
                        this.clearZoomWarning();
                    }
                }
            });

            if (jmv.view.zoom >= 16) {
                this.enableTurboCoverageLayer(this.props.config.turboCreator);
                this.clearZoomWarning();
            } else {
                this.showZoomWarning(`Your current zoom level is ${jmv.view.zoom.toFixed(1)}. Turbo Mode is active. Zoom in closer (≥ 16) to interact with data.`, 0);
            }
        }
    }

    /**
        * Displays a temporary "no image available" message to the user.
        * Message auto-dismisses after 4 seconds.
    */
    private showNoImageMessage() {
        this.setState({ 
            noImageMessageVisible: true,
            isLoading: false
        });
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
        color: any = [0, 0, 255, 1],
        sequenceId?: string 
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
                size: 9,
                outline: {color: "#e3da30", width: 1},
            },
            attributes: sequenceId ? { sequenceId: sequenceId } : undefined
        });

        (graphic as any).__isActiveSequencePoint = true;
        // Tag removed so this is treated as a temporary graphic
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
                color: "black",
                size: 7, 
                outline: { color: "white", width: 2 },
            },
            attributes: { isClickedLocation: true }
        });

        (graphic as any).__isSequenceOverlay = true;

        jimuMapView.view.graphics.add(graphic);
        this.clickedLocationGraphic = graphic;
    }

    /**
        * Removes ALL graphics tagged __isCone from the view.
        * Must be called instead of (or before) view.graphics.remove(this.currentConeGraphic).
    */
    private clearConeGraphics() {
        const view = this.state.jimuMapView?.view;
        if (!view) return;

        const toRemove: __esri.Graphic[] = [];
        view.graphics.forEach(g => {
            if ((g as any).__isCone) toRemove.push(g);
        });
        toRemove.forEach(g => view.graphics.remove(g));
        this.currentConeGraphic = null;
    }

    /**
        * Draws a camera view cone polygon at the given location and bearing.
        * 2D: flat orange polygon (unchanged)
        * 3D: matches the reference image - a low flat wedge hugging the ground,
        *     with a single slanted top face rising slightly at the far edge.
        *     Uses SEPARATE graphics per face (not multi-ring) to avoid ArcGIS
        *     hole/cutout artifacts from multi-ring polygon interpretation.
    */
    private drawCone(lon: number, lat: number, heading: number, radiusMeters = 5, spreadDeg = 60) {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return null;

        const { Graphic } = this.ArcGISModules;
        const view = jimuMapView.view;
        const is3D = (view as any).type === "3d";

        const metersToDegreesLat = (m: number) => m / 111320;
        const metersToDegreesLon = (m: number, refLat: number) =>
            m / (111320 * Math.cos((refLat * Math.PI) / 180));

        const rLat = metersToDegreesLat(radiusMeters);
        const rLon = metersToDegreesLon(radiusMeters, lat);
        const startAngle = heading - spreadDeg / 2;
        const endAngle   = heading + spreadDeg / 2;
        const STEP       = 2;

        const arcAngles: number[] = [];
        for (let a = startAngle; a <= endAngle; a += STEP) arcAngles.push(a);
        if (arcAngles[arcAngles.length - 1] < endAngle) arcAngles.push(endAngle);

        // 2D MODE
        if (!is3D) {
            const coords: [number, number][] = [[lon, lat]];
            for (const a of arcAngles) {
                const rad = (a * Math.PI) / 180;
                coords.push([lon + rLon * Math.sin(rad), lat + rLat * Math.cos(rad)]);
            }
            coords.push([lon, lat]);

            const g: __esri.Graphic = new Graphic({
                geometry: { type: "polygon", rings: [coords], spatialReference: { wkid: 4326 } },
                symbol: {
                    type: "simple-fill",
                    color: [255, 165, 0, 0.25],
                    outline: { color: [255, 165, 0, 0.8], width: 1 },
                },
            });
            (g as any).__isCone = true;
            view.graphics.add(g, 0);
            return g;
        }

        // 3D MODE
        const zFar = Math.min(radiusMeters * 0.15, 1.5);

        const leftRad  = (arcAngles[0] * Math.PI) / 180;
        const rightRad = (arcAngles[arcAngles.length - 1] * Math.PI) / 180;

        const tip:         [number, number, number] = [lon, lat, 0];
        const leftGround:  [number, number, number] = [lon + rLon * Math.sin(leftRad),  lat + rLat * Math.cos(leftRad),  0];
        const rightGround: [number, number, number] = [lon + rLon * Math.sin(rightRad), lat + rLat * Math.cos(rightRad), 0];
        const leftTop:     [number, number, number] = [lon + rLon * Math.sin(leftRad),  lat + rLat * Math.cos(leftRad),  zFar];
        const rightTop:    [number, number, number] = [lon + rLon * Math.sin(rightRad), lat + rLat * Math.cos(rightRad), zFar];

        const arcGround: [number, number, number][] = arcAngles.map(a => {
            const rad = (a * Math.PI) / 180;
            return [lon + rLon * Math.sin(rad), lat + rLat * Math.cos(rad), 0];
        });
        const arcTop: [number, number, number][] = arcAngles.map(a => {
            const rad = (a * Math.PI) / 180;
            return [lon + rLon * Math.sin(rad), lat + rLat * Math.cos(rad), zFar];
        });

        // DRAPED GROUND FILL
        const groundCoords2D: [number, number][] = [
            [lon, lat],
            ...arcAngles.map(a => {
                const rad = (a * Math.PI) / 180;
                return [lon + rLon * Math.sin(rad), lat + rLat * Math.cos(rad)] as [number, number];
            }),
            [lon, lat]
        ];

        const fillGraphic = new Graphic({
            geometry: {
                type: "polygon",
                rings: [groundCoords2D],
                spatialReference: { wkid: 4326 }
            },
            symbol: {
                type: "simple-fill",
                color: [255, 165, 0, 0.28],
                outline: { color: [0, 0, 0, 0], width: 0 }
            } as any
        });
        (fillGraphic as any).__isCone = true;
        view.graphics.add(fillGraphic);

        // LINE-3D EDGES
        const addEdge = (path: [number, number, number][], width = 2, opacity = 0.95) => {
            const g = new Graphic({
                geometry: {
                    type: "polyline",
                    paths: [path],
                    hasZ: true,
                    spatialReference: { wkid: 4326 }
                } as any,
                symbol: {
                    type: "line-3d",
                    symbolLayers: [{
                        type: "line",
                        size: width,
                        material: { color: [255, 140, 0, opacity] },
                        cap: "round",
                        join: "round"
                    }]
                } as any
            });
            (g as any).__isCone = true;
            view.graphics.add(g);
            return g;
        };

        // GROUND EDGES (the lower part you drew in paint)
        // Left ground side: tip → leftGround (straight line on ground)
        addEdge([tip, leftGround], 2.0, 0.95);

        // Right ground side: tip → rightGround (straight line on ground)
        addEdge([tip, rightGround], 2.0, 0.95);

        // Bottom arc on ground: leftGround → ... → rightGround
        addEdge(arcGround, 2.0, 0.90);

        // UPPER 3D EDGES (height cue)
        // Left diagonal: tip → leftTop
        addEdge([tip, leftTop], 2.0, 0.95);

        // Right diagonal: tip → rightTop
        addEdge([tip, rightTop], 2.0, 0.95);

        // Left vertical wall edge
        addEdge([leftGround, leftTop], 1.8, 0.65);

        // Right vertical wall edge
        addEdge([rightGround, rightTop], 1.8, 0.65);

        // Top arc
        addEdge(arcTop, 2.0, 0.90);

        // Sentinel
        const sentinel = new Graphic({
            geometry: {
                type: "point",
                longitude: lon,
                latitude: lat,
                spatialReference: { wkid: 4326 },
            } as any,
            symbol: { type: "simple-marker", size: 0, color: [0, 0, 0, 0] } as any,
        });
        (sentinel as any).__isCone = true;
        view.graphics.add(sentinel);
        return sentinel;
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

        // Only block if explicitly closed or no map view
        if (this.props.state === 'CLOSED' || !this.state.jimuMapView) {
            this.log(">>> handleMapClick BLOCKED:", {
                propsState: this.props.state,
                jimuMapView: !!this.state.jimuMapView
            });
            return;
        }
        
        // The user clicked manually, so it is no longer a restricted "Shared State"
        this.setState({ isSharedState: false }); 

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

        if (!this.state.turboModeActive && this.props.config.turboCreator) {
            this.showZoomWarning(
                `Turbo Mode is inactive. Although a Default Creator (${this.props.config.turboCreator}) is set, Normal Mode searches ALL public data at this location.`,
                5000
            );
        }

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

                    // Moved loadSequenceById INSIDE the callback to guarantee layering order
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
                        await this.loadSequenceById(globalClosest2.seqId, globalClosest2.imgId, { lon, lat });
                        
                        this.setState({ isLoading: false });
                    });
                    return; // Exit here, let callback handle the rest
                }

                // === CASE B: Click is NEAR an image in current sequence ===
                this.log("Same sequence within threshold, reusing cached overlay");

                await this.loadSequenceById(selectedSequenceId, closestImg.id, { lon, lat });

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
        // Slightly increased bbox (approx 10m) to ensure hits, but we strictly limit the results below
        const bboxSize = 0.0001; 
        
        // Reduced API limit from 500 to 100 to save bandwidth/parsing time
        const url = `https://graph.mapillary.com/images?fields=id,geometry,sequence,captured_at&bbox=${
            lon - bboxSize
        },${lat - bboxSize},${lon + bboxSize},${lat + bboxSize}&limit=100`;

        const response = await fetch(url, {
            headers: { Authorization: `OAuth ${accessToken}` }
        });
        const data = await response.json();
        if (!data.data?.length) return [];

        const grouped: Record<string, {
            sequenceId: string;
            images: { id: string; lon: number; lat: number; capturedAt?: string; dist: number }[];
            capturedAt?: string;
            minDistance: number;
        }> = {};

        for (const img of data.data) {
            const seqId = img.sequence;
            const coords = img.geometry?.coordinates;
            const capturedAt = img.captured_at;

            if (!seqId || !coords) continue;

            const distance = this.distanceMeters(lat, lon, coords[1], coords[0]);
            
            // Filter out noise > 30 meters away
            if (distance > 30) continue;

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

            if (distance < grouped[seqId].minDistance) {
                grouped[seqId].minDistance = distance;
            }

            if (!grouped[seqId].capturedAt || (capturedAt && capturedAt < grouped[seqId].capturedAt)) {
                grouped[seqId].capturedAt = capturedAt;
            }
        }

        // Sort by distance AND slice to return only the top 10 closest sequences.
        return Object.values(grouped)
            .sort((a, b) => a.minDistance - b.minDistance)
            .slice(0, 10); 
    }

    // --- Fetch full coordinate list of a sequence ---
    // Uses sequence_id → image_ids → geometry batch fetch
    // to get lat/lon for all frames in a sequence efficiently.
    private async getSequenceWithCoords(
            sequenceId: string,
            accessToken: string
        ): Promise<{ id: string; lat: number; lon: number; captured_at?: number }[]> {
            
            // 1. Check RAM Cache
            if (this.sequenceCoordsCache[sequenceId]) {
                return this.sequenceCoordsCache[sequenceId];
            }

            // 2. Check LocalStorage (Persistent Cache)
            const cacheKey = `mly_geo_${sequenceId}`;
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Populate RAM cache for next time
                    this.sequenceCoordsCache[sequenceId] = parsed; 
                    return parsed;
                }
            } catch (e) { /* ignore storage errors */ }

            try {
                // 3. API Fetch (Standard Logic)
                const url = `https://graph.mapillary.com/image_ids?sequence_id=${sequenceId}`;
                const response = await fetch(url, {
                    headers: { Authorization: `OAuth ${accessToken}` },
                });
                const data = await response.json();
                if (!Array.isArray(data.data)) return [];

                const ids = data.data.map((d: any) => d.id);

                // Batch fetch geometry
                const coordUrl = `https://graph.mapillary.com/?ids=${ids.join(",")}&fields=id,geometry,captured_at`;
                const coordResp = await fetch(coordUrl, {
                    headers: { Authorization: `OAuth ${accessToken}` },
                });
                const coordsData = await coordResp.json();

                const coords = ids
                    .map((id: string) => {
                        const value = coordsData[id];
                        if (!value) return null;
                        return {
                            id,
                            lon: value.geometry?.coordinates?.[0] || 0,
                            lat: value.geometry?.coordinates?.[1] || 0,
                            captured_at: value.captured_at ? new Date(value.captured_at).getTime() : undefined
                        };
                    })
                    .filter((item) => item !== null && item.lon !== 0);

                // 4. Save to RAM Cache
                this.sequenceCoordsCache[sequenceId] = coords; 

                // 5. Save to LocalStorage (Persistent)
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(coords));
                } catch (e) {
                    // If full, clear ALL coordinate caches and try one more time for this specific one
                    console.warn("Storage full, attempting to purge old coordinate caches...");
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith("mly_geo_")) {
                            localStorage.removeItem(key);
                        }
                    });
                    
                    // Try saving again after the purge
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(coords));
                    } catch (retryError) {
                        console.error("Storage still full after purge, skipping save.");
                    }
                }

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
                    position: "relative",
                    background: "#000",
                    boxSizing: "border-box"
                }}>

                {/* This empty div is controlled by Mapillary, React will never touch its internals */}
                <div
                    ref={this.viewerContainer}
                    style={{width: "100%", height: "100%", position: "relative"}}
                />

                {/* Legend Section */}
                {this.state.imageId && !this.props.config.hideLegend && !this.state.isFullscreen && (
                    <div className="legend-container" 
                        style={{
                            position: "absolute",
                            bottom: "2px",
                            left: "4px",
                            background: "rgba(0, 0, 0, 0.30)",
                            backdropFilter: "blur(5px)",
                            borderRadius: "4px",
                            padding: "4px 6px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            zIndex: 999,
                            pointerEvents: "auto",
                            display: "flex",
                            flexDirection: "column"
                        }}
                    >
                        <div style={{
                            opacity: 0.4,
                            fontSize: '8px',
                            fontWeight: 700,
                            marginBottom: '2px',
                            color: 'white',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            paddingBottom: '3px'
                        }}>Legend</div>

                        {/* Content Rows */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {this.state.turboModeActive ? (
                                <React.Fragment>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('#00ff00'), border: '1px solid white'}}></span> <span style={this.legendTextStyle()}>Active frame</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('blue'), border: '1px solid #e3da30'}}></span> <span style={this.legendTextStyle()}>Seq. images</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('#a52a2a'), border: '1px solid white'}}></span> <span style={this.legendTextStyle()}>Turbo coverage</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('transparent'), border: '1.5px solid cyan'}}></span> <span style={this.legendTextStyle()}>First selected</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('yellow'), border: '2px solid orange'}}></span> <span style={this.legendTextStyle()}>Next frame</span></div>
                                </React.Fragment> 
                            ) : (
                                <React.Fragment>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('black'), border: '1px solid white'}}></span> <span style={this.legendTextStyle()}>Clicked point</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('#00ff00'), border: '1px solid white'}}></span> <span style={this.legendTextStyle()}>Active frame</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('e3da30'), border: '1px solid white'}}></span> <span style={this.legendTextStyle()}>Active seq</span></div>
                                    <div style={this.legendRowStyle()}><span style={{...legendCircleStyle('yellow'), border: '2px solid orange'}}></span> <span style={this.legendTextStyle()}>Next frame</span></div>
                                    <button onClick={this.clearSequenceCache} style={this.compactButtonStyle()}>CLEAR CACHE</button>
                                </React.Fragment> 
                            )}
                        </div>
                    </div>
                )}

                {/* --- TURBO LOADING IMAGERY REGION --- */}
                {this.state.turboLoading && (
                    <div style={glassStyles.loadingContainer}>
                        {/* Use the new Compact Card style */}
                        <div className="loading-card" style={glassStyles.compactLoadingCard}>
                            
                            {/* Turbo Gold Spinner - slightly smaller override (32px) */}
                            <div className="turbo-spinner" style={{
                                ...glassStyles.turboSpinner,
                                width: "32px",
                                height: "32px",
                                borderWidth: "3px" 
                            }} />
                            
                            {/* Compact Text */}
                            <div style={glassStyles.compactLoadingText}>
                                Fetching Turbo coverage points...
                            </div>
                            
                            <style>{`
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            `}</style>
                        </div>
                    </div>
                )}

                {/* --- LOADING IMAGERY REGION --- */}
                {this.state.isLoading && (
                    <div style={glassStyles.loadingContainer}>
                        <div className="loading-card" style={glassStyles.loadingCard}>
                            
                            {/* Premium Glowing Spinner */}
                            <div className="premium-spinner" style={glassStyles.loadingSpinner} />
                            
                            {/* Text */}
                            <div style={glassStyles.loadingText}>
                                Loading imagery...
                            </div>
                            
                            {/* Animation Keyframes */}
                            <style>{`
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            `}</style>
                        </div>
                    </div>
                )}

                {/* --- CLICK A POINT TO VIEW IMAGERY REGION --- */}
                {!this.state.imageId && !this.state.isLoading && !this.state.turboLoading && !this.state.noImageMessageVisible && (
                    <div style={glassStyles.initialStateContainer}>
                        <div className="initial-state-card" style={glassStyles.initialStateCard}>
                            <span style={glassStyles.initialStateTextPrimary}>
                                Click a point to view imagery
                            </span>
                            <span style={glassStyles.initialStateTextSecondary}>
                                (Mapillary imagery will appear here)
                            </span>
                        </div>
                    </div>
                )}

                {/* --- NO IMAGE VISIBLE WARNING REGION --- */}
                {this.state.noImageMessageVisible && (
                    <div style={glassStyles.noImageContainer}>
                        <div className="no-image-card" style={glassStyles.noImageContent}>
                            {/* Icon with a subtle glow */}
                            <div style={{ 
                                filter: "drop-shadow(0 0 8px rgba(255,255,255,0.3))",
                                color: "#fff",
                                opacity: 0.9
                            }}>
                                <Icons.NoImage size={32} />
                            </div>
                            
                            <span>No nearby Mapillary imagery found.</span>
                        </div>
                    </div>
                )}

                {/* --- IMAGE UTILITY GROUP (Glassmorphism) --- */}
                {this.state.imageId && (
                    <div className="glass-image-utility-panel" style={{
                        position: "absolute",
                        bottom: "22px",
                        right: "55px",
                        zIndex: 10000,
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                        padding: "1px 3px 1px 2px",
                        background: "rgba(20, 20, 20, 0.4)", // Matches your sidebar background
                        backdropFilter: "blur(1px)",
                        WebkitBackdropFilter: "blur(1px)",
                        borderRadius: "12px",
                        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.30)",
                    }}>
                        {/* 1. TimeTravel Button */}
                        {!this.props.config.hideTimeTravel && this.state.hasTimeTravel && (
                            <button className="utility-button"
                                title="Open in Mapillary Time Travel"
                                onClick={() => {
                                    const currentImg = this.state.sequenceImages.find(i => i.id === this.state.imageId);
                                    if (currentImg) {
                                        const url = `https://www.mapillary.com/app/time-travel?lat=${currentImg.lat}&lng=${currentImg.lon}&z=17&pKey=${this.state.imageId}&focus=photo`;
                                        window.open(url, '_blank');
                                    }
                                }}
                                style={glassStyles.getButtonStyle(true, 'rgba(240, 185, 5, 0.3)')} // Gold-ish tint
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                            >
                                <Icons.TimeTravel style={{ color: "#FFD700" }} />
                            </button>
                        )}

                        {/* 2. Share Button */}
                        {!this.props.config.hideShareButton && (
                            <button className="utility-button"
                                title="Share current view"
                                onClick={this.copyShareLink}
                                style={glassStyles.getButtonStyle(false, 'rgba(255, 255, 255, 0.2)')}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                <Icons.Share />
                            </button>
                        )}

                        {/* 3. Download Button */}
                        {!this.props.config.hideImageDownload && (
                            <button className="utility-button"
                                title="Download current image (High Res)"
                                onClick={this.downloadActiveImage}
                                style={glassStyles.getButtonStyle(false, 'rgba(255, 255, 255, 0.2)')}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                {this.state.isDownloading ? (
                                    <div style={{ 
                                        width: "14px", height: "14px", 
                                        border: "2px solid #fff", borderTopColor: "transparent", 
                                        borderRadius: "50%", animation: "spin 1s linear infinite" 
                                    }} />
                                ) : (
                                    <Icons.Download />
                                )}
                            </button>
                        )}

                        {/* 4. Sync Map Based on Bearing */}
                        {this.state.jimuMapView?.view.type === '3d' && (
                            <button className="utility-button"
                                title={this.state.syncHeading ? "Lock Map Rotation (Fixed North)" : "Rotate The Map With the The Camera"}
                                onClick={() => this.setState(prev => ({ syncHeading: !prev.syncHeading }))}
                                style={{
                                    ...glassStyles.getButtonStyle(this.state.syncHeading, 'rgba(52, 152, 219, 0.9)'),
                                    boxShadow: this.state.syncHeading ? "0 0 10px rgba(52, 152, 219, 0.6)" : "none"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                {this.state.syncHeading ? (
                                    <Icons.CompassLocked />
                                ) : (
                                    <Icons.CompassUnlocked />
                                )}
                            </button>
                        )}
                        {/* 5. Center Map on Current Frame */}
                        <button className="utility-button"
                            title="Center map on current frame"
                            onClick={() => {
                                const { imageId, sequenceImages, jimuMapView } = this.state;
                                if (!imageId || !jimuMapView) return;
                                
                                const currentImg = sequenceImages.find(img => img.id === imageId);
                                if (currentImg) {
                                    jimuMapView.view.goTo({
                                        center:[currentImg.lon, currentImg.lat],
                                        // Optional: Forces a closer zoom if the user zoomed way out
                                        zoom: Math.max(jimuMapView.view.zoom, 17) 
                                    }, { animate: true, duration: 800 });
                                }
                            }}
                            style={glassStyles.getButtonStyle(false, 'rgba(255, 255, 255, 0.2)')}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                            <Icons.Crosshair size={16} />
                        </button>
                    </div>
                )}
            </div>
        );

        /**
            * NORMAL MODE BLOCK (inside widget bounds)
        */
        const normalMode = (
            <div
                className={`widget-mapillary jimu-widget ${this.state.showAiTags ? "" : "hide-mly-tags"}`}
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    border: 'none', 
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    margin: '0',
                    padding: '0',
                    containerType: 'size'
                }}
                >
                {/* wraping this logic component in display:none so it doesn't break the Flex layout */}
                <div style={{ display: 'none' }}>
                    {mapWidgetId ? (
                        <JimuMapViewComponent
                            useMapWidgetId={mapWidgetId}
                            onActiveViewChange={this.onActiveViewChange}
                        />
                    ) : null}
                </div>

                {/* showing error only if strictly needed, separate from the logic component */}
                {!mapWidgetId && (
                    <div style={{padding: "10px", color: "red"}}>
                        Please link a Map widget in Experience Builder settings
                    </div>
                )}

                {viewerArea}
                {this.state.zoomWarningMessage && (
                    <div
                        className="warning-message-container"
                        style={{
                            // Positioning
                            position: "absolute",
                            top: "6px", // Aligned with the top of your glass container
                            left: "48px", // Pushed out to the right of the buttons
                            zIndex: 9999,        
                            // Glassmorphism - Warning Style
                            background: "linear-gradient(135deg, rgba(255, 140, 0, 0.9) 0%, rgba(255, 69, 0, 0.4) 100%)", // Orange-to-Redish Glass
                            backdropFilter: "blur(14px)",
                            WebkitBackdropFilter: "blur(14px)",
                            border: "1px solid rgba(255, 165, 0, 0.3)", // Subtle orange border
                            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3), inset 0 0 10px rgba(255, 165, 0, 0.1)", // Depth + Inner Glow
                            // Typography & Layout
                            color: "#fff",
                            padding: "3px 4px",
                            borderRadius: "10px",
                            fontSize: "9px",
                            fontWeight: "600",
                            maxWidth: "90px", // Slightly wider for better readability
                            fontFamily: '"Poppins", "Montserrat", sans-serif',
                            lineHeight: "1.25",
                            letterSpacing: "0.4px",
                            textShadow: "0px 1px 2px rgba(0,0,0,0.2)", // Lifts the white text off the glass
                            textAlign: "center",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            // Animation
                            animation: "fadeIn 0.3s ease-out",
                            transformOrigin: "left center"
                        }}
                    >
                        {/* Icon wrapper to keep it from shrinking */}
                        <span style={{  filter: 'drop-shadow(0 0 4px rgba(255,165,0,0.6))' }}>  <Icons.Warning size={14} /> WARNING <br/> {this.state.zoomWarningMessage}</span>
                    </div>
                )}

                {/* Revolver-style sequence picker */}
                {this.state.availableSequences && this.state.availableSequences.length > 1 && (
                    <div style={glassStyles.sequencePickerContainer}>
                        
                        {/* Prev arrow */}
                        {this.state.availableSequences.length > 3 && (
                            <button
                                onClick={() => {
                                    this.setState(prev => ({
                                        sequenceOffset:
                                        (prev.sequenceOffset! - 1 + this.state.availableSequences!.length) %
                                        this.state.availableSequences!.length
                                    }));
                                }}
                                style={glassStyles.sequenceArrow}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            >
                                ◀
                            </button>
                        )}

                        {/* Sequence slots */}
                        {Array.from({ length: Math.min(3, this.state.availableSequences!.length) }).map((_, slotIdx) => {
                            const seqIndex = (this.state.sequenceOffset! + slotIdx) % this.state.availableSequences!.length;
                            const seq = this.state.availableSequences![seqIndex];
                            
                            const colorArr = seq._color || this.pickSequenceColor(seqIndex);
                            const cssColor = `rgba(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]}, ${colorArr[3] ?? 1})`;
                            
                            // COMPACT DATE FORMAT: "Aug 16" instead of "Aug 2016"
                            const date = seq.capturedAt
                                ? new Date(seq.capturedAt).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                                : "N/A";
                                
                            const isActive = this.state.selectedSequenceId === seq.sequenceId;

                            return (
                                <div
                                    key={seq.sequenceId}
                                    style={glassStyles.sequenceSlot(isActive)}
                                    title={`Sequence ${seqIndex + 1} (${date})`} // Hover shows full info
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
                                    onMouseEnter={e => {e.currentTarget.style.background = "rgba(255, 255, 255, 0.35)"; }}
                                    onMouseLeave={e => {e.currentTarget.style.background = isActive ? "rgba(255, 255, 255, 0.25)" : "transparent";}}
                                >
                                    {/* Color swatch */}
                                    <span style={glassStyles.sequenceDot(cssColor)} />
                                    
                                    {/* Label - Compact */}
                                    <span style={glassStyles.sequenceText}>
                                        {seqIndex + 1}. {date}
                                    </span>
                                </div>
                            );
                        })}

                        {/* Next arrow */}
                        {this.state.availableSequences.length > 3 && (
                            <button
                                onClick={() => {
                                    this.setState(prev => ({
                                        sequenceOffset: (prev.sequenceOffset! + 1) % this.state.availableSequences!.length
                                    }));
                                }}
                                style={glassStyles.sequenceArrow}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            >
                                ▶
                            </button>
                        )}
                    </div>
                )}
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-end', // Keeps everything flush to the right edge
                    position: "absolute", 
                    top: "2px", 
                    right: "4px", 
                    zIndex: 10002,
                    pointerEvents: "none", // Let clicks pass through empty spaces
                    maxHeight: "calc(100% - 100px)", // Prevent running off bottom of screen
                    overflowY: "auto", // Allow scrolling if stack gets too tall
                    scrollbarWidth: "none" // Hide scrollbar for cleaner UI
                }}>
                    {/* Info box */}
                    {!this.props.config.hideInfoBox && (
                        <div className="info-box"
                            style={{
                                fontSize: "8.5px",
                                color: "white",
                                background: "rgba(0, 0, 0, 0.35)",
                                backdropFilter: "blur(5px)", 
                                borderRadius: "6px",
                                width: "80px", // Use fixed width instead of maxWidth
                                textAlign: "left",
                                padding: "5px",
                                boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                pointerEvents: "auto" // Enable clicks inside the box
                            }}
                        >
                            {/* Header/Zoom Section */}
                            <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '3px',
                                opacity: 0.8,
                                fontSize: '10px',
                                borderBottom: '1px solid rgba(255,255,255,0.2)',
                                paddingBottom: '4px'
                            }}>
                                <span style={{fontWeight: 600, fontSize:'8px'}}>STATUS</span>
                                <span>
                                    <Icons.Search size={9} style={{marginRight:'2px', marginLeft:'2px'}}/> 
                                        <span style={{fontSize:'8px'}}>Z: {this.state.currentZoom !== undefined 
                                            ? this.state.currentZoom.toFixed(1) 
                                            : this.state.jimuMapView?.view.zoom.toFixed(1)}
                                        </span>
                                </span>
                            </div>

                            {/* Address Section */}
                            {this.state.address && (
                                <div style={{ marginBottom: "3px", color: "#37d582", fontWeight: 500 }}>
                                    <Icons.Globe size={12} style={{marginRight: '4px'}}/>
                                    {this.state.address}
                                </div>
                            )}

                            {/* Coordinates Section */}
                            {(() => {
                                if (this.state.imageId && this.state.sequenceImages.length > 0) {
                                    const currentImg = this.state.sequenceImages.find(
                                        img => img.id === this.state.imageId
                                    );
                                    if (currentImg) {
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', opacity: 0.9 }}>
                                                <div style={{display: 'flex', alignItems: 'center'}}>
                                                    <span style={{width: '25px', fontSize: '9px', color: '#aaa'}}>LAT</span>
                                                    <span>{currentImg.lat.toFixed(6)}</span>
                                                </div>
                                                <div style={{display: 'flex', alignItems: 'center'}}>
                                                    <span style={{width: '25px', fontSize: '9px', color: '#aaa'}}>LON</span>
                                                    <span>{currentImg.lon.toFixed(6)}</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                }
                                return null;
                            })()}

                            {/* Dynamic User Filter Tag (If Turbo Creator set) */}
                            {this.props.config.turboCreator && (
                                <div style={{
                                    marginTop: "4px",
                                    padding: "1px 3px",
                                    background: "rgba(55, 213, 130, 0.2)",
                                    border: "1px solid rgba(55, 213, 130, 0.4)",
                                    borderRadius: "3px",
                                    fontSize: "9px",
                                    color: "#37d582",
                                    textAlign: "center"
                                }}>
                                    {this.props.config.turboCreator}
                                </div>
                            )}
                            
                            {/* --- Turbo Mode Date Legend --- */}
                            {this.state.turboModeActive && this.state.turboColorByDate && this.state.turboYearLegend && this.state.turboYearLegend.length > 0 && (
                                <div 
                                    className="year-legend-scroll"
                                    style={{
                                        marginTop: "4px",
                                        paddingTop: "4px",
                                        borderTop: "1px solid rgba(255,255,255,0.2)",
                                        // Centering
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        // Scroll Logic
                                        maxHeight: "65px",       // Max height before scroll triggers
                                        overflowY: "auto",       // Enable vertical scrolling
                                        pointerEvents: "auto",   // Re-enables mouse interaction for scrolling
                                        overflowX: "hidden",
                                        scrollbarColor: "rgba(255,255,255,0.3) transparent" 

                                    }}
                                >
                                    {/* Hide Scrollbar for Chrome/Safari so it fits the small box */}
                                    <style>{`
                                        .year-legend-scroll::-webkit-scrollbar { 
                                            display: none; 
                                        }
                                    `}</style>

                                    <div style={{ fontSize: "8px", fontWeight: 600, opacity: 0.7, marginBottom: "2px", textAlign: "center", width: "100%" }}>
                                        YEARS
                                    </div>
                                    
                                    {this.state.turboYearLegend.map((item) => {
                                        // Determine styling based on selection state
                                        const isSelected = this.state.selectedTurboYear === item.year;
                                        const isAnySelected = !!this.state.selectedTurboYear;
                                        
                                        // Dim other items if one is selected
                                        const opacity = isAnySelected && !isSelected ? 0.3 : 1;
                                        const fontWeight = isSelected ? 800 : 400;
                                        const scale = isSelected ? "scale(1.1)" : "scale(1)";

                                        return (
                                            <div 
                                                key={item.year} 
                                                onClick={() => this.handleYearLegendClick(item.year)}
                                                style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center',
                                                    marginBottom: '3px', 
                                                    gap: '6px', // Slightly more gap for clickable feel
                                                    width: '100%',
                                                    flexShrink: 0,
                                                    cursor: 'pointer',  // Show hand cursor
                                                    opacity: opacity,
                                                    transition: 'all 0.2s ease',
                                                    transform: scale
                                                }}
                                                title={isSelected ? "Click to show all years" : `Filter by ${item.year}`}
                                            >
                                                <span style={{
                                                    width: '8px',  // Slightly larger touch target
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    backgroundColor: item.color,
                                                    border: isSelected ? '1.5px solid white' : '1px solid rgba(255,255,255,0.6)',
                                                    boxShadow: isSelected ? '0 0 4px rgba(255,255,255,0.8)' : 'none',
                                                    flexShrink: 0
                                                }}></span>
                                                <span style={{ 
                                                    whiteSpace: 'nowrap', 
                                                    fontWeight: fontWeight,
                                                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.9)'
                                                }}>
                                                    {item.year}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* DOWNLOAD BUTTON (Stacked below AI button) */}
                    {(this.state.trafficSignsActive || this.state.objectsActive) && (
                        <button 
                            onClick={this.downloadCurrentFeatures} 
                            title="Export Current Features as GeoJSON"
                            style={{
                                marginTop: '4px',
                                background: 'rgba(55, 213, 130, 0.3)',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                                color: '#fff',
                                borderRadius: '6px', // Pill shape
                                fontSize: '9px',
                                cursor: (this.state.jimuMapView?.view.zoom < 16) ? 'not-allowed' : 'pointer',
                                opacity: (this.state.jimuMapView?.view.zoom < 16) ? 0.6 : 1,
                                width: '80px', 
                                fontWeight: 600,
                                letterSpacing: '0.5px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                pointerEvents: "auto",
                                transition: "all 0.2s ease-in-out",
                                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                            }}
                            // Hover: Brighter green
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(55, 213, 130, 0.95)'}
                            // Leave: Return to the EXACT color based on the current state
                            onMouseLeave={e => e.currentTarget.style.background = this.state.detectionsActive ? 'rgba(55, 213, 130, 0.8)' : 'rgba(55, 213, 130, 0.3)'}
                        >
                            <Icons.Download size={12} color="#ffffff" /> 
                            <span style={{fontWeight: 700}}>EXPORT</span>
                        </button>
                    )}

                     {/* AI DETECTION BUTTON (Stacked below Info box) */}
                    {(this.state.trafficSignsActive || this.state.objectsActive) && this.state.imageId && (
                        <button 
                            onClick={this.toggleDetections}
                            title="Toggle AI Object Detection Overlays"
                            style={{
                                marginTop: '4px',
                                // Base background logic
                                background: this.state.detectionsActive ? 'rgba(55, 213, 130, 0.8)' : 'rgba(55, 213, 130, 0.3)',
                                color: 'white',
                                borderRadius: '6px',
                                width: '80px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'auto',
                                backdropFilter: 'blur(5px)',
                                transition: "background 0.2s" // Added for smoother transitions
                            }}
                            // Hover: Brighter green
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(55, 213, 130, 0.95)'}
                            // Leave: Return to the EXACT color based on the current state
                            onMouseLeave={e => e.currentTarget.style.background = this.state.detectionsActive ? 'rgba(55, 213, 130, 0.8)' : 'rgba(55, 213, 130, 0.3)'}
                        >
                            <Icons.Detection size={11} /> 
                            <span style={{fontSize: '8.5px', marginLeft: '3px', fontWeight: 700}}>AI OVERLAY</span>
                        </button>
                    )}

                    {/* Hide/Show Tags Toggle */}
                    {this.state.detectionsActive && (
                        <button 
                            onClick={this.toggleAiTags}
                            title={this.state.showAiTags ? "Hide Labels/Tags" : "Show Labels/Tags"}
                            style={{
                                background: this.state.showAiTags ? 'rgba(61, 36, 36, 0.2)' : 'rgba(255, 0, 0, 0.4)',
                                border: '1px solid rgba(1, 1, 1, 0.7)',
                                marginTop: '2px',
                                color: 'white',
                                borderRadius: '6px',
                                width: '30px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backdropFilter: 'blur(5px)',
                                pointerEvents: 'auto',
                                height: '12px'
                            }}
                        >
                            {this.state.showAiTags ? <Icons.LabelsOn size={14}/> : <Icons.LabelsOff size={14}/>}
                        </button>
                    )}

                    {this.state.alternateImages.length > 0 && (
                        <div className="alternate-images-panel"
                            style={{
                                marginTop: "3px", // Spacing from buttons above
                                width: "80px",   // Slightly more compact width
                                background: "rgba(20, 20, 20, 0.6)",
                                backdropFilter: "blur(10px)",
                                borderRadius: "8px",
                                padding: "3px",
                                pointerEvents: "auto", // Re-enable clicks
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px"
                            }}
                        >
                            <div style={{
                                color: "white", 
                                borderBottom: "1px solid rgba(255,255,255,0.2)", padding: "0",
                                display: "flex", justifyContent: "space-between", alignItems: "center"
                            }}>
                                <span style={{fontSize: '7px', fontWeight:'600'}}>ALTERNATE</span>
                                <button 
                                    onClick={() => this.setState({ alternateImages: [], targetDetectionId: null })}
                                    style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "10px", padding: "0 2px" }}
                                    title="Close"
                                >✕</button>
                            </div>

                            {this.state.alternateImages.map((img) => (
                                <div 
                                    key={img.id}
                                    onClick={async () => {
                                        try {
                                            this.setState({ 
                                                targetDetectionId: img.detectionId,
                                                detectionsActive: true 
                                            });

                                            const resp = await fetch(`https://graph.mapillary.com/${img.id}?fields=sequence`, {
                                                headers: { Authorization: `OAuth ${this.accessToken}` }
                                            });
                                            const data = await resp.json();
                                            
                                            if (data.sequence) {
                                                // Clear old sequence graphics INCLUDING polylines before loading new sequence
                                                if (this.state.selectedSequenceId && this.state.selectedSequenceId !== data.sequence) {
                                                    this.clearSequenceGraphics();
                                                }
                                                // 1. Load the sequence
                                                await this.loadSequenceById(data.sequence, img.id);
                                                
                                                // 2. Wait for viewer to settle, then adjust bearing
                                                setTimeout(async () => {
                                                    if (this.mapillaryViewer && this.state.selectedFeatureLocation) {
                                                        try {
                                                            
                                                            // Calculate bearing from Image -> Feature
                                                            const targetBearing = this.calculateBearing(
                                                                img.geometry.coordinates[1], img.geometry.coordinates[0],
                                                                this.state.selectedFeatureLocation.lat, this.state.selectedFeatureLocation.lon
                                                            );
                                                            // --- A. Adjust Mapillary Viewer (Look at Object) ---
                                                            if (this.mapillaryViewer) {
                                                                const currentImage = await this.mapillaryViewer.getImage();
                                                                const imageBearing = currentImage.compassAngle;
                                                                const diff = targetBearing - imageBearing;
                                                                const newX = 0.5 + (diff / 360);
                                                                this.mapillaryViewer.setCenter([newX, 0.5]);
                                                                this.loadDetections(img.id);
                                                            }

                                                            // --- B. Adjust ArcGIS Map (3D Rotation / Focus) ---
                                                            if (this.state.jimuMapView) {
                                                                const view = this.state.jimuMapView.view;
                                                                
                                                                if (view.type === '3d') {
                                                                    // The requested behavior: Rotate map so we look AT the object
                                                                    view.goTo({
                                                                        center: [img.geometry.coordinates[0], img.geometry.coordinates[1]],
                                                                        heading: targetBearing, // <--- Rotates map to face the object
                                                                        tilt: 60,               // Cinematic angle
                                                                        scale: 500              // Zoom in close
                                                                    }, { animate: true, duration: 1500 });
                                                                } else {
                                                                    // 2D Fallback: Just center closely
                                                                    view.goTo({
                                                                        center: [img.geometry.coordinates[0], img.geometry.coordinates[1]],
                                                                        zoom: 20
                                                                    }, { animate: true, duration: 1000 });
                                                                }
                                                            }



                                                        } catch (err) {
                                                            console.warn("Could not set bearing:", err);
                                                            this.loadDetections(img.id);
                                                        }
                                                    } else {
                                                        // Fallback
                                                        if (this.mapillaryViewer) this.loadDetections(img.id);
                                                    }                                                   
                                                    this._isFlyInActive = false;
                                                }, 1000); 
                                            }
                                        } catch (e) { 
                                            console.error(e); 
                                        }
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        borderRadius: "4px",
                                        overflow: "hidden",
                                        position: "relative",
                                        border: this.state.imageId === img.id ? "2px solid #37d582" : "1px solid rgba(255,255,255,0.2)",
                                        boxShadow: this.state.imageId === img.id ? "0 0 10px rgba(55, 213, 130, 0.4)" : "none",
                                        transition: "transform 0.2s",
                                        height: "50px" // Fixed height for uniformity
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.02)"}
                                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                                    title={`Captured: ${new Date(img.capturedAt).toLocaleDateString()}`}
                                >
                                    <img 
                                        src={img.thumbUrl} 
                                        alt="Alt" 
                                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} 
                                    />
                                    <div style={{
                                        position: "absolute", bottom: 0, left: 0, right: 0,
                                        background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                                        color: "white",
                                        fontSize: "8px", padding: "8px 4px 2px 4px",
                                        textAlign: "right"
                                    }}>
                                        {new Date(img.capturedAt).toLocaleDateString(undefined, {month:'numeric', year:'2-digit'})}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* --- UNIFIED FILTER BAR --- */}
                {(this.state.showTurboFilterBox || this.state.showTrafficSignsFilterBox || this.state.showObjectsFilterBox) && (
                    <div  
                        className="glass-scroll-container"
                        style={glassStyles.filterBarContainer}
                    >
                        {/* === TURBO MODE FILTER GROUP (GOLD) === */}
                        {this.state.showTurboFilterBox && (
                            <div style={glassStyles.filterGroup('#FFD700')}>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        placeholder="User..."
                                        disabled={!!this.props.config.turboCreator}
                                        value={this.state.turboFilterUsername}
                                        className="glass-input-placeholder"
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
                                                    if (val) this.enableTurboCoverageLayer(val);
                                                    else this.enableTurboCoverageLayer();
                                                }
                                            }
                                        }}
                                        style={{
                                            ...glassStyles.glassInput,
                                            width: '80px', 
                                            minWidth: '60px', 
                                            flexShrink: 1,
                                            opacity: this.props.config.turboCreator ? 0.6 : 1,
                                            cursor: this.props.config.turboCreator ? 'not-allowed' : 'text'
                                        }}
                                        autoFocus={!this.props.config.turboCreator}
                                    />
                                    {!this.props.config.turboCreator && this.state.turboFilterUsername && (
                                        <button
                                            onClick={() => {
                                                this.setState({ turboFilterUsername: "" }, () => {
                                                    this.enableTurboCoverageLayer();
                                                });
                                            }}
                                            style={{
                                                position: 'absolute',
                                                right: '10px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'rgba(255,255,255,0.6)',
                                                fontSize: '10px',
                                                cursor: 'pointer',
                                                padding: 0,
                                                display: 'flex'
                                            }}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <DatePicker
                                        selected={this.state.turboFilterStartDate ? new Date(this.state.turboFilterStartDate) : null}
                                        onChange={(date) => {
                                            const dateString = date ? date.toISOString().split('T')[0] : '';
                                            this.setState({ turboFilterStartDate: dateString }, () => this.debouncedTurboFilter());
                                        }}
                                        isClearable
                                        dateFormat="yyyy-MM-dd"
                                        placeholderText="Start"
                                        popperPlacement="bottom-end"
                                        popperProps={{ strategy: "fixed" }}
                                        portalId="root-portal"
                                        customInput={<button type="button" style={glassStyles.glassIconBtn} title="Start Date">📅</button>}
                                    />
                                    <DatePicker
                                        selected={this.state.turboFilterEndDate ? new Date(this.state.turboFilterEndDate) : null}
                                        onChange={(date) => {
                                            const dateString = date ? date.toISOString().split('T')[0] : '';
                                            this.setState({ turboFilterEndDate: dateString }, () => this.debouncedTurboFilter());
                                        }}
                                        isClearable
                                        dateFormat="yyyy-MM-dd"
                                        placeholderText="End"
                                        popperPlacement="bottom-end"
                                        popperProps={{ strategy: "fixed" }}
                                        portalId="root-portal"
                                        customInput={<button type="button" style={glassStyles.glassIconBtn} title="End Date">📅</button>}
                                    />
                                </div>

                                <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }}></div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={glassStyles.labelSmall}>Is Pano:</span>
                                    <label style={{ position: 'relative', display: 'inline-block', width: '24px', height: '14px', marginBottom: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={this.state.turboFilterIsPano === true}
                                            onChange={(e) => {
                                                const val = e.target.checked ? true : undefined;
                                                this.setState({ turboFilterIsPano: val }, () => this.debouncedTurboFilter());
                                            }}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: this.state.turboFilterIsPano ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                                            borderRadius: '34px', transition: '0.3s'
                                        }}></span>
                                        <span style={{
                                            position: 'absolute', height: '12px', width: '12px',
                                            left: this.state.turboFilterIsPano ? '14px' : '2px', bottom: '2px',
                                            backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                                        }}></span>
                                    </label>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={glassStyles.labelSmall}>Date Color:</span>
                                    <label style={{ position: 'relative', display: 'inline-block', width: '28px', height: '16px', marginBottom: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={this.state.turboColorByDate === true}
                                            onChange={(e) => {
                                                this.setState({ turboColorByDate: e.target.checked }, () => this.debouncedTurboFilter());
                                            }}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: this.state.turboColorByDate ? '#4CAF50' : 'rgba(255,255,255,0.2)',
                                            borderRadius: '34px', transition: '0.3s'
                                        }}></span>
                                        <span style={{
                                            position: 'absolute', height: '12px', width: '12px',
                                            left: this.state.turboColorByDate ? '14px' : '2px', bottom: '2px',
                                            backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
                                        }}></span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* === TRAFFIC SIGNS FILTER GROUP (ORANGE) === */}
                        {this.state.showTrafficSignsFilterBox && (
                            <div style={glassStyles.filterGroup('#FFA500')}>
                                <Select
                                    value={this.state.trafficSignsFilterValue}
                                    onChange={async (selected) => {
                                        this.setState({ trafficSignsFilterValue: selected }, async () => {
                                            if (!this.state.jimuMapView) return;
                                            const newName = selected.value;
                                            let filterCode = newName === "All traffic signs" ? newName : newName;
                                            if (newName !== "All traffic signs") {
                                                const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_signs/package_signs";
                                                const jsonResp = await fetch(`${spriteBaseUrl}.json`);
                                                const spriteData = await jsonResp.json();
                                                const code = Object.keys(spriteData).find(c => this.formatTrafficSignName(c) === newName);
                                                filterCode = code || newName;
                                            }
                                            this.filterTrafficSignsVTLayer(filterCode);
                                            if (this.state.trafficSignsActive && this.state.jimuMapView.view.zoom >= 16) {
                                                if (this.mapillaryTrafficSignsFeatureLayer) this.state.jimuMapView.view.map.remove(this.mapillaryTrafficSignsFeatureLayer);
                                                this.mapillaryTrafficSignsFeatureLayer = null;
                                                this._cancelTrafficSignsFetch = false;
                                                await this.loadMapillaryTrafficSignsFromTilesBBox(true);
                                                if (this.mapillaryTrafficSignsFeatureLayer) this.state.jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
                                            }
                                        });
                                    }}
                                    menuPortalTarget={document.body}
                                    options={this.state.trafficSignsOptions}
                                    styles={getGlassSelectStyles('#FFA500')} 
                                    menuPlacement="top"
                                    formatOptionLabel={(option) => (
                                        <div style={{ display: 'flex', alignItems: 'center' }} title={option.label}>
                                            {option.iconUrl && <img src={option.iconUrl} alt="" style={{ width: 16, height: 16, marginRight: 8, objectFit: 'contain' }} />}
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{option.label}</span>
                                        </div>
                                    )}
                                />
                            </div>
                        )}

                        {/* === OBJECTS FILTER GROUP (RED) === */}
                        {this.state.showObjectsFilterBox && (
                            <div style={glassStyles.filterGroup('#FF3C3C')}>
                                <Select
                                    value={this.state.objectsFilterValue}
                                    onChange={async (selected) => {
                                        this.setState({ objectsFilterValue: selected }, async () => {
                                            if (!this.state.jimuMapView) return;
                                            const newName = selected.value;
                                            let filterCode = newName === "All points" ? newName : newName;
                                            if (newName !== "All points") {
                                                const spriteBaseUrl = "https://raw.githubusercontent.com/sukruburakcetin/mapillary-explorer-sprite-source/main/sprites/package_objects/package_objects";
                                                const jsonResp = await fetch(`${spriteBaseUrl}.json`);
                                                const spriteData = await jsonResp.json();
                                                const code = Object.keys(spriteData).find(c => (this.objectNameMap[c] || c) === newName);
                                                filterCode = code || newName;
                                            }
                                            this.filterObjectsVTLayer(filterCode);
                                            if (this.state.objectsActive && this.state.jimuMapView.view.zoom >= 16) {
                                                if (this.mapillaryObjectsFeatureLayer) this.state.jimuMapView.view.map.remove(this.mapillaryObjectsFeatureLayer);
                                                this.mapillaryObjectsFeatureLayer = null;
                                                this._cancelObjectsFetch = false;
                                                await this.loadMapillaryObjectsFromTilesBBox(true);
                                                if (this.mapillaryObjectsFeatureLayer) this.state.jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
                                            }
                                        });
                                    }}
                                    menuPortalTarget={document.body}
                                    options={this.state.objectsOptions}
                                    styles={getGlassSelectStyles('#FF3C3C')}
                                    menuPlacement="top"
                                    formatOptionLabel={(option) => (
                                        <div style={{ display: 'flex', alignItems: 'center' }} title={option.label}>
                                            {option.iconUrl && <img src={option.iconUrl} alt="" style={{ width: 16, height: 16, marginRight: 8, objectFit: 'contain' }} />}
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{option.label}</span>
                                        </div>
                                    )}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Splash(Intro) Screen */}
                {this.state.showIntro && (
                    <div style={{
                        ...glassStyles.splashContainer,
                        // Zoom/Fade out effect when loaded
                        opacity: this.state.filtersLoaded ? 0 : 1,
                        transform: this.state.filtersLoaded ? "scale(1.1)" : "scale(1)"
                    }}>
                        <div style={glassStyles.splashCard}>
                            
                            {/* --- LOGO AREA WITH SONAR RIPPLES --- */}
                            <div style={glassStyles.logoWrapper}>
                                {/* Two ripples for depth */}
                                <div style={glassStyles.splashRipple} /> 
                                <div style={{ ...glassStyles.splashRipple, animationDelay: "1s" }} /> 
                                
                                <img 
                                    className="splash-screen-logo"
                                    src="https://images2.imgbox.com/ec/73/iwr0gH9D_o.gif" 
                                    alt="Logo"
                                    style={glassStyles.splashLogo}
                                />
                            </div>
                            
                            {/* --- SHIMMERING TITLE --- */}
                            <div className="splash-screen-text" style={glassStyles.splashTitle}>
                                MAPILLARY Explorer
                            </div>
                            
                            {/* --- GLOWING PROGRESS BAR --- */}
                            <div style={glassStyles.progressTrack}>
                                <div style={glassStyles.progressBar} />
                            </div>
                            
                            {/* --- ANIMATED MESSAGES --- */}
                            <div style={{ position: "relative", height: "14px", marginTop: "8px", width: "100%" }}>
                                <div className="splash-msg-1" style={{ 
                                    fontSize: "10px", color: "rgba(255,255,255,0.5)", fontStyle: "italic", 
                                    position: "absolute", width: "100%", textAlign: "center" 
                                }}>
                                    Initializing...
                                </div>
                                <div className="splash-msg-2" style={{ 
                                    fontSize: "10px", color: "#37d582", fontWeight: 600, letterSpacing: "0.2px", 
                                    position: "absolute", width: "100%", textAlign: "center" 
                                }}>
                                    Celebrating 3 Billion Images, Powered by You 💚
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Unified control buttons container */}
                <div
                    className="glass-control-panel"
                        style={glassStyles.container}
                    >
                    {/* Individual buttons (no grouping) */}
                    {[
                        {
                            content: <Icons.Maximize size={20}/>,
                            onClick: this.toggleFullscreen, 
                            title: 'Maximize/Fullscreen', 
                            bg: 'rgba(2, 117, 216, 0.9)', 
                            active: this.state.isFullscreen
                        },
                        {
                            content: <Icons.MapLayer size={20}/>,
                            onClick: this.toggleMapillaryTiles, 
                            title: 'Toggle Mapillary Layer', 
                            bg: 'rgba(53, 175, 109, 0.9)', 
                            active: this.state.tilesActive,
                            id: 'coverage_toggle' 
                        }
                    ]

                    // FILTER: If coverageLayerAlwaysOn is true, hide the coverage_toggle button
                    .filter(btn => {
                        if (btn.id === 'coverage_toggle' && this.props.config.coverageLayerAlwaysOn) {
                            return false;
                        }
                        return true;
                    })
                    
                    .map((btn, i) => (
                            <button className="unified-control-buttons-mapped"
                                key={i}
                                title={btn.title}
                                onClick={btn.onClick}
                                style={glassStyles.getButtonStyle(btn.active, btn.bg)}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = btn.active ? 'scale(1.1)' : 'scale(1)')}
                            >
                                {/* Changed from btn.emoji to btn.content */}
                                {btn.content}
                            </button>
                        ))
                    }

                    {/* Turbo Mode Group - Only render if at least one button is visible */}
                    {(!this.props.config.turboModeOnly || !this.props.config.hideTurboFilter) && (
                        <div style={glassStyles.groupContainer(this.state.turboModeActive)}>
                            {/* Main Turbo Button */}
                            {!this.props.config.turboModeOnly && (
                                <button className="unified-control-buttons"
                                    title="Toggle Turbo Mode"
                                    onClick={async () => {
                                        const next = !this.state.turboModeActive;
                                        this.setState({ turboModeActive: next });

                                        if (next) {
                                            const view = this.state.jimuMapView?.view;

                                            // If it's NOT a shared link state, clear the UI.
                                            // This clears manual normal-mode sequences but keeps shared-link ones.
                                            if (!this.state.isSharedState) {
                                                this.log("Manual exploration detected, clearing UI for Turbo");
                                                this.clearSequenceUI();
                                            } else {
                                                this.log("Shared state active, keeping markers visible");
                                            }

                                            if (this.state.jimuMapView?.view.zoom! < 16) {
                                                this.showZoomWarning("Zoom in closer (≥ 16) to view and interact with Mapillary coverage point features in Turbo Mode.");
                                            }

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
                                    style={glassStyles.getButtonStyle(this.state.turboModeActive, 'rgba(95, 92, 53, 0.30)')} // Gold
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = this.state.turboModeActive ? 'scale(1.1)' : 'scale(1)')}
                                >
                                    <Icons.Turbo size={20}
                                        style={{ filter: this.state.turboModeActive ? 'drop-shadow(0 0 1.2px grey)' : 'none' }}
                                    /> 
                                </button>
                            )}  
                            {/* Turbo Filter Button */}
                            {!this.props.config.hideTurboFilter && (   
                                <button className="unified-control-buttons-filters"
                                    title="Filter Turbo Mode Coverage"
                                    onClick={() => {
                                        if (!this.state.turboModeActive) return;
                                        this.setState(prev => ({ showTurboFilterBox: !prev.showTurboFilterBox }));
                                    }}
                                    onMouseEnter={e => {
                                        if (this.state.turboModeActive) e.currentTarget.style.transform = 'scale(1.1)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                    style={{
                                        ...glassStyles.getButtonStyle(this.state.showTurboFilterBox, 'rgba(255, 215, 0, 0.5)', true),
                                        opacity: this.state.turboModeActive ? 1 : 0.6,
                                        cursor: this.state.turboModeActive ? 'pointer' : 'default'
                                    }}
                                >
                                    <Icons.Filter size={16}/>
                                </button>
                            )}
                        </div>
                    )}
                    {/* Traffic Signs Group */}
                    {this.props.config.enableTrafficSigns !== false && (
                        <div style={glassStyles.groupContainer(this.state.trafficSignsActive)}>
                            {/* Main Traffic Signs Button */}
                            <button className="unified-control-buttons"
                                title="Toggle Mapillary Traffic Signs Layer"
                                onClick={this.toggleMapillaryTrafficSigns}
                                style={glassStyles.getButtonStyle(this.state.trafficSignsActive, 'rgba(147, 102, 19, 0.3)')} // Orange
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = this.state.trafficSignsActive ? 'scale(1.1)' : 'scale(1)')}
                            >
                                <Icons.AllMapillaryTrafficSigns size={16}
                                    style={{ filter: this.state.trafficSignsActive ? 'drop-shadow(0 0 1.2px grey)' : 'none' }}
                                /> 
                            </button>

                            {/* Traffic Signs Filter Button */}
                            <button className="unified-control-buttons-filters"
                                title="Filter Traffic Signs"
                                onClick={() => {
                                    if (!this.state.trafficSignsActive) return;
                                    this.setState(prev => ({ showTrafficSignsFilterBox: !prev.showTrafficSignsFilterBox }));
                                }}
                                onMouseEnter={e => {
                                    if (this.state.trafficSignsActive) e.currentTarget.style.transform = 'scale(1.1)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                                style={{
                                    ...glassStyles.getButtonStyle(this.state.showTrafficSignsFilterBox, 'rgba(255, 165, 0, 0.5)', true),
                                    opacity: this.state.trafficSignsActive ? 1 : 0.6,
                                    cursor: this.state.trafficSignsActive ? 'pointer' : 'default'
                                    // Removed manual marginTop and gap as groupContainer handles it
                                }}
                            >
                                <Icons.Filter size={16}/>
                            </button>
                        </div>
                    )}

                    {/* Objects Group */}
                    {this.props.config.enableMapillaryObjects !== false && (
                        <div style={glassStyles.groupContainer(this.state.objectsActive)}>
                            {/* Main Objects Button */}
                            <button className="unified-control-buttons"
                                title="Toggle Mapillary Objects Layer"
                                onClick={this.toggleMapillaryObjects}
                                style={glassStyles.getButtonStyle(this.state.objectsActive, 'rgba(155, 55, 55, 0.3)')} // Red
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = this.state.objectsActive ? 'scale(1.1)' : 'scale(1)')}
                            >
                                <Icons.AllMapillaryObjects size={16}
                                    style={{ filter: this.state.objectsActive ? 'drop-shadow(0 0 0.2px grey)' : 'none' }}
                                /> 
                            </button>

                            {/* Objects Filter Button */}
                            <button className="unified-control-buttons-filters"
                                title="Filter Objects"
                                onClick={() => {
                                    if (!this.state.objectsActive) return;
                                    this.setState(prev => ({ showObjectsFilterBox: !prev.showObjectsFilterBox }));
                                }}
                                onMouseEnter={e => {
                                    if (this.state.objectsActive) e.currentTarget.style.transform = 'scale(1.1)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                                style={{
                                    ...glassStyles.getButtonStyle(this.state.showObjectsFilterBox, 'rgba(255, 60, 60, 0.5)', true),
                                    opacity: this.state.objectsActive ? 1 : 0.6,
                                    cursor: this.state.objectsActive ? 'pointer' : 'default'
                                }}
                            >
                                <Icons.Filter size={16}/>
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
                    title="Exit Fullscreen"
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        zIndex: 10000,
                        background: '#d1000059',
                        color: 'white',
                        padding: '4px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <Icons.Minimize />
                </button>

                {/* Toggle Minimap Button (New) */}
                <button
                    onClick={() => this.setState(prev => ({ showMinimap: !prev.showMinimap }))}
                    title={this.state.showMinimap ? "Hide Minimap" : "Show Minimap"}
                    style={{
                        position: 'absolute',
                        top: '48px', // Positioned below the Exit button (10px + 32px height + 6px gap)
                        left: '10px',
                        zIndex: 10000,
                        background: 'rgba(0, 0, 0, 0.6)', // Neutral dark background
                        color: 'white',
                        padding: '6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px'
                    }}
                >
                    {/* Simple SVG Icons for Map Toggle */}
                    {this.state.showMinimap ? (
                        <Icons.MapOpen size={16} color="white" />
                    ) : (
                        <Icons.MapClosed size={16} color="white" />
                    )}
                </button>
                
                {/* Minimap Container */}
                <div
                    ref={this.minimapContainer}
                    className="minimap-container"
                    style={{
                        position: 'absolute',
                        bottom: '30px',
                        left: '30px',
                        width: '330px',
                        height: '220px',
                        // --- GLASSMORPHISM CORE ---
                        background: "rgba(20, 20, 20, 0.4)", // Dark tinted glass
                        backdropFilter: "blur(12px)",        // Frosted effect
                        WebkitBackdropFilter: "blur(12px)",
                        // --- BORDERS & CORNERS ---
                        border: "1px solid rgba(255, 255, 255, 0.15)", // Thin light edge
                        borderRadius: "20px",                         // Modern rounded look
                        overflow: "hidden",                           // Clips map to corners
                        // --- DEPTH & SHADOWS ---
                        // Inner shadow makes the map look "embedded" into the panel
                        boxShadow: `
                            0 8px 32px 0 rgba(0, 0, 0, 0.6), 
                            inset 0 0 0 1px rgba(255, 255, 255, 0.05)
                        `,  
                        zIndex: 10001,
                        // --- ANIMATIONS & LOGIC ---
                        visibility: this.state.showMinimap ? 'visible' : 'hidden',
                        opacity: this.state.showMinimap ? 1 : 0,
                        pointerEvents: this.state.showMinimap ? 'auto' : 'none',
                        // Transition: Added transform for a "Pop-in" effect
                        transition: "all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)",
                        transform: this.state.showMinimap ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
                    }}
                />
            </div>,
            document.body
        );
        /** Return either normal or fullscreen layout */
        return this.state.isFullscreen ? fullscreenMode : normalMode;
    }}