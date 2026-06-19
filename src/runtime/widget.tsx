/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { React, AllWidgetProps, jsx } from "jimu-core";
import { JimuMapViewComponent, JimuMapView, loadArcGISJSAPIModules, MapViewManager } from "jimu-arcgis";
import ReactDOM from "react-dom";
import * as webMercatorUtils from "esri/geometry/support/webMercatorUtils";
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { objectNameMap } from "../utils/mapillaryObjectNameMap";
import * as Icons from '../components/Icons'
import { glassStyles, 
    overrideStyles,
    fullscreenOverlayStyle, fullscreenExitButtonStyle, 
    fullscreenMinimapToggleButtonStyle, getMinimapContainerStyle 
} from "../utils/styles";
import {
    LAYER_IDS, STYLE_LAYER_IDS, STYLE_SOURCE_IDS,
    TILE_URLS, GRAPH_API, SPRITE_URLS, GEOCODE_URL,
    ZOOM, BBOX, LIMITS, TIME_TRAVEL as TIME_TRAVEL_THRESHOLDS,
    CACHE_KEYS, SHARE_PARAMS, TIMING, DEFAULT_FILTER_LABELS, 
    DETECTION_HIDDEN_RAW, DETECTION_HIDDEN_CATEGORIES,
    COVERAGE_SNAP_THRESHOLD_METERS, COVERAGE_MIN_POINTS_PER_SEGMENT,
    COVERAGE_ANALYSIS_INSET_METERS, OVERPASS_ROAD_QUERY,
    HIGHWAY_THRESHOLDS, POINT_CLOUD_GROUND_MODE_HEIGHT_M, 
    POINT_CLOUD_LENGTH_DEFAULT, POINT_CLOUD_LENGTH_MAX, 
    POINT_CLOUD_WIDTH_DEFAULT, POINT_CLOUD_WIDTH_MAX,
    POINT_CLOUD_FETCH_LENGTH, POINT_CLOUD_FETCH_WIDTH,
    QUALITY_SCORE
} from "../utils/constants";
import {
    distanceMeters, calculateBearing,
    bboxToTileRange, createConeGeometry, debounce as debounceUtil,
    formatTrafficSignName, parseOverpassRoads, snapPointsToSegments,
    insetBbox, segmentMidpointInBbox, lonLatToWebMercator
} from "../utils/geoUtils";
import { buildAllFilters } from "../utils/filterBuilder";
import { loadPointCloud } from "../utils/pointCloudUtils";
import type { PointCloudResult, PointCloudPoint } from "../utils/pointCloudUtils";
import { decodeAndNormalizeGeometry, getDetectionColor } from "../utils/mapillaryDetections";
import { createYearBasedRenderer, YEAR_COLOR_PALETTE } from "../utils/mapillaryRenderers";
import {
    loadImage, cropSpriteImage, processInChunks
} from "../utils/spriteUtils";
import { Viewer, OutlineTag, PolygonGeometry, geodeticToEnu, RenderPass } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';
import SequencePicker from '../components/SequencePicker'
import { Legend } from '../components/Legend';
import { InfoBox } from '../components/InfoBox';
import { FilterBar } from '../components/FilterBar';
import { SplashScreen } from '../components/SplashScreen';
import { ControlBar } from '../components/ControlBar';
import { ImageUtilityGroup } from '../components/ImageUtilityGroup';
import type { FilterOption, NearbyImage } from '../components/types';

// React component state
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
    availableSequences?: { sequenceId: string; images: { id: string; lon: number; lat: number }[]; _color?: number[]; capturedAt?: string }[];
    selectedSequenceId?: string;
    clickLon?: number;
    clickLat?: number;
    tilesActive?: boolean;
    trafficSignsActive?: boolean;
    objectsActive?: boolean;
    turboModeActive?: boolean;
    turboLoading?: boolean;
    featuresLoading?: boolean;  // traffic signs / objects tile fetch in progress
    coverageAnalysisLoading?: boolean;
    coverageResult?: import('../components/types').CoverageResult | null;
    coverageSegmentsVisible?: boolean;
    turboFilterStartDate?: string; // ISO yyyy-mm-dd
    turboFilterEndDate?: string;   // ISO yyyy-mm-dd
    turboFilterIsPano?: boolean; // true = only panoramas, false = only non-panos, undefined/empty = no filter
    turboColorByDate?: boolean;
    qualityViewActive?: boolean;
    turboYearLegend?: { year: string, color: string }[];
    zoomWarningMessage?: string;
    trafficSignsFilterValue: { value: string; label: string; iconUrl: string | null };
    objectsFilterValue: { value: string; label: string; iconUrl: string | null };
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
    toastMessage?: React.ReactNode;
    isMeasureMode: boolean;
    measurePoints: Array<{ mapLon: number, mapLat: number, mapZ: number, rawLon: number, rawLat: number, alt: number }>;
    showCalibrationPanel: boolean;
    nudgeStep: number;
    pointCloudLoading?: boolean;
    pointCloudVisible?: boolean;
    pointCloudAvailable?: boolean; // null = unknown, false = no sfm_cluster for this image
    pointCloudColorMode: 'rgb' | 'elevation';
    pointCloudLength: number;
    pointCloudMaxLength: number;
    pointCloudActualLength: number;
    pointCloudWidth: number;
    pointCloudMaxWidth: number;
    pointCloudActualWidth: number;
    isSightMode: boolean;
    sightObserver: any | null;
    sightTargets: any[];
    isViewshedMode: boolean;
    nearbyImages?: NearbyImage[];
    nearbyLoading?: boolean;
    nearbyStripOpen?: boolean;
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
    private clickedLocationGraphic: __esri.Graphic | null = null;
    private _directionHoverGraphic: __esri.Graphic | null = null;
    private _nearbyPinGraphic: __esri.Graphic | null = null;
    
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
    private _isInitialImageLoad = true;
    
    // Layers
    private accessToken: string = "";
    private mapillaryVTLayer: __esri.VectorTileLayer | null = null;
    private mapillaryTrafficSignsLayer: __esri.VectorTileLayer | null = null;
    private mapillaryObjectsLayer: __esri.VectorTileLayer | null = null;
    
    // Layer properties
    private mapillaryTrafficSignsFeatureLayer: __esri.FeatureLayer | null = null;
    private mapillaryObjectsFeatureLayer: __esri.FeatureLayer | null = null;
    private turboCoverageLayer: __esri.FeatureLayer | null = null;
    private _coverageSegmentsLayer: __esri.GraphicsLayer | null = null;
    private _coverageZoneGraphic: __esri.Graphic | null = null;
    private _coverageSegments: import("../utils/geoUtils").RoadSegment[] = [];
    private _coverageCoveredFlags: boolean[] = [];
    private _coverageSegmentTiers: import("../components/types").SegmentTier[] = [];
    private turboCoverageLayerView: __esri.LayerView | null = null;
    private _spriteCache: Record<string, { img: HTMLImageElement, json: any }> = {};

    // Spatial Caching Trackers
    private _loadedTurboFiltersKey: string = "";
    private _loadedTileKeys: Set<string> = new Set();         // tiles already fetched
    private _turboOidCounter: number = 1;                      // global OID counter across incremental adds   
    private _userIdCache: Map<string, number | null> = new Map();
    
    // Point Cloud Variables
    private _pointCloudLayer: __esri.Layer | null = null;
    private _pointCloudRendererActive: boolean = false; // tracks if Mapillary viewer renderer is attached
    private _pointCloudViewerRenderer: any = null; 
    private _groundMode: boolean = false;
    private _ringGeneration: number = 0; // Incremented on every ring redraw to cancel stale async draws

    // Measurement Renderer Variables
    private _measurementRendererActive: boolean = false;
    private _measurementViewerRenderer: any = null;
    private _sightViewModel: any = null;
    private _viewshedAnalysis: any = null;
    private _gridLayer: __esri.GraphicsLayer | null = null;
    private _gridLayerReady: Promise<void> | null = null;

    // Nude Tool Variables
    private _nudgeX: number = 0; // East/West offset in meters
    private _nudgeY: number = 0; // North/South offset in meters
    private _nudgeZ: number = 0; // Up/Down offset in meters
    private _baseAlt: number = 0;
    private _cameraLat: number = 0;
    private _cameraLon: number = 0;
    private _currentPointCloudResult: PointCloudResult | null = null;
    private _measureLayer: __esri.GraphicsLayer | null = null;
    
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
    private _toastTimer: ReturnType<typeof setTimeout> | null = null;

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
    private _debouncedBearingUrlUpdate: (() => void) & { cancel?: () => void } = Object.assign(() => {}, { cancel: () => {} });
    private _debouncedZoomUrlUpdate:    (() => void) & { cancel?: () => void } = Object.assign(() => {}, { cancel: () => {} });
    private zoomDisplayHandle: __esri.WatchHandle | null = null;

    // Request tracking
    private _turboRequestCount: number = 0;
    private _hasCheckedSharedState: boolean = false;
    private _isFlyInActive: boolean = false;
    private _hasAttemptedMapSwitch: boolean = false;
    
    // Hover graphics
    private _turboHoverGraphic: __esri.Graphic | null = null;
    private _turboHoverInterval: any = null;
    private _lastHoveredTurboOid: number | null = null;
    private _hoveredSequenceId: string | null = null;
    private _sequenceHighlightLayer: __esri.VectorTileLayer | null = null;

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
        turboLoading: false,
        featuresLoading: false,
        coverageAnalysisLoading: false,
        coverageResult: null,
        coverageSegmentsVisible: false,
        turboFilterUsername: "",
        turboFilterStartDate: "",
        turboFilterEndDate: "",
        turboFilterIsPano: undefined,
        showTurboFilterBox: false,
        turboYearLegend: [],
        qualityViewActive: false,
        showTrafficSignsFilterBox: false,
        trafficSignsFilterValue: { value: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, label: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, iconUrl: null },
        trafficSignsOptions: [{ value: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, label: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, iconUrl: null }],
        showObjectsFilterBox: false,
        objectsFilterValue: { value: DEFAULT_FILTER_LABELS.OBJECTS, label: DEFAULT_FILTER_LABELS.OBJECTS, iconUrl: null },
        objectsOptions: [{ value: DEFAULT_FILTER_LABELS.OBJECTS, label: DEFAULT_FILTER_LABELS.OBJECTS, iconUrl: null }],
        filtersLoaded: false,
        showIntro: true,
        hasTimeTravel: false,
        showMinimap: true,
        detectionsActive: false,
        showAiTags: true,
        isSharedState: false,
        alternateImages: [],
        selectedFeatureLocation: null,
        isFetchingAlternates: false,
        targetDetectionId: null,
        syncHeading: false,
        isMeasureMode: false,
        measurePoints:[],
        showCalibrationPanel: false,
        nudgeStep: 0.5, // Default movement step is half a meter
        pointCloudLoading: false,
        pointCloudVisible: false,
        pointCloudAvailable: undefined,
        pointCloudLength: POINT_CLOUD_LENGTH_DEFAULT,
        pointCloudMaxLength: POINT_CLOUD_LENGTH_MAX,
        pointCloudActualLength: 100,
        pointCloudWidth: POINT_CLOUD_WIDTH_DEFAULT, // Default width is 30m (15m left, 15m right)
        pointCloudMaxWidth: POINT_CLOUD_WIDTH_MAX,
        pointCloudActualWidth: 50,
        pointCloudColorMode: 'rgb',
        isSightMode: false,
        sightObserver: null,
        sightTargets:[],
        isViewshedMode: false,
    };

    constructor(props: AllWidgetProps<any>) {
        super(props);
		
		// Read accessToken from manifest.json properties - you should use your own token start with MLY
		this.accessToken = (props.manifest?.properties as any)?.mapillaryAccessToken || "";
		this.log("Loaded Access Token:", this.accessToken);
        
        // Wrap the layer reload logic in debounce (300ms delay after typing stops)
        this.debouncedTurboFilter = debounceUtil(async () => {
            // Read state lazily inside the fired timeout, not captured at schedule time
            const turboFilterUsername  = this.state.turboFilterUsername;
            const turboFilterStartDate = this.state.turboFilterStartDate;
            const turboFilterEndDate   = this.state.turboFilterEndDate;
            const turboFilterIsPano    = this.state.turboFilterIsPano;

            let creatorId: number | undefined = undefined;
            const username = turboFilterUsername?.trim();
            if (username) {
                creatorId = await this.getUserIdFromUsername(username) || undefined;
            }

            this.rebuildCoverageLayer(
                creatorId,
                turboFilterStartDate || undefined,
                turboFilterEndDate   || undefined,
                turboFilterIsPano,
                this.state.qualityViewActive
            );

            if (this.state.turboModeActive) {
                await this.enableTurboCoverageLayer();
            }
        }, 300);

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

        // Debounced URL bearing update, rebuilds on every bindMapillaryEvents call
        // so it always closes over the latest imageId/lat/lon from state
        this._debouncedBearingUrlUpdate = debounceUtil(() => {
            // Skip while fly-in is active, Mapillary keeps firing bearing events
            // as it transitions to the image's natural compass angle, which would
            // overwrite the shared bearing in the URL before the user even sees it.
            if (this._isFlyInActive) return;
            const { imageId, sequenceImages } = this.state;
            if (!imageId) return;
            const img = sequenceImages.find(s => s.id === imageId);
            if (img) this.updateUrlWithCurrentImage(imageId, img.lat, img.lon);
        }, 600);

        // Define local redraw helper, pass specific coordinates
        const redrawCone = async (lon?: number, lat?: number) => {
            const view = this.state.jimuMapView?.view;
            if (!view) return;

            // If Turbo Mode is active and no specific sequence is selected,
            // we should not draw the camera cone.
            if (this.state.turboModeActive && !this.state.selectedSequenceId) {
                this.clearConeGraphics();
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
            this.drawCone(lon, lat, bearing, length, spread);
            
            // Always re-surface green pulse above the cone
            if (this.currentGreenGraphic) {
                view.graphics.remove(this.currentGreenGraphic);
                view.graphics.add(this.currentGreenGraphic);
            }
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
            
            // Debounced URL update, fires 600ms after user stops panning
            this._debouncedBearingUrlUpdate();

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
                    const resp = await fetch(`${GRAPH_API.BASE}/${newId}?fields=sequence,geometry`, {
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
                this.checkAndLoadNextPointCloud(newId);

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
                        
                        // 3D SCENE: GPS NAVIGATION MODE
                        if (view.type === "3d") {
                            view.goTo({
                                center: [activeImg.lon, activeImg.lat],
                                // heading: this._lastBearing 
                            }, { animate: true, duration: 300 });
                        } 
                        // 2D MAP MODE
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
            if (!this._isFlyInActive) {
                this.updateUrlWithCurrentImage(newId, newImg.lat, newImg.lon);
            }

            this.fetchNearbyImages(newImg.lat, newImg.lon, newId);
        });
    }

    // #region DIRECTION HOVER SYSTEM
    // Highlights the target image marker on the map when the user hovers over
    // Mapillary's navigation arrows (DirectionComponent).
    // Flow:
    //   setupDirectionHover        → subscribes to DirectionComponent._hoveredId$
    //       └─ handleDirectionHover    → finds image coords from state/cache/API
    //           ├─ fetchAndHighlightImage  → API fallback if coords not cached
    //           └─ drawDirectionHighlight  → draws pulsing yellow marker on map
    //   clearDirectionHighlight    → removes marker + stops pulse animation

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
                `${GRAPH_API.BASE}/${imageId}?fields=id,geometry`,
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

        // Also add a simple yellow marker to the minimap so the hover is visible there too
        if (this.minimapGraphicsLayer) {
            const minimapHoverGraphic = new Graphic({
                geometry: geometry,
                symbol: {
                    type: "simple-marker",
                    style: "circle",
                    color: [255, 255, 0, 0.85],
                    size: 12,
                    outline: { color: [255, 165, 0, 1], width: 2 }
                } as any
            });
            (minimapHoverGraphic as any).__isDirectionHover = true;
            this.minimapGraphicsLayer.add(minimapHoverGraphic);
        }

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
            const view = this.state.jimuMapView?.view;
            if (view) {
                view.graphics.remove(this._directionHoverGraphic);
            }
            // Remove from minimap too
            if (this.minimapGraphicsLayer) {
                const toRemove: __esri.Graphic[] = [];
                this.minimapGraphicsLayer.graphics.forEach((g: __esri.Graphic) => {
                    if ((g as any).__isDirectionHover) toRemove.push(g);
                });
                toRemove.forEach(g => this.minimapGraphicsLayer.remove(g));
            }
            this._directionHoverGraphic = null;
        }
    }
    // #regionend Direction Hover System

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

    // #region SEQUENCE MANAGEMENT
    // Handles loading, drawing, caching and clearing sequence overlays.
    // Load a specific sequence by ID and image
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

            // Check for Time Travel for the starting image
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

                // Because we destroyed the viewer, we must re-attach the 3D layers!
                if (this.state.pointCloudVisible && this._currentPointCloudResult) {
                    this.addViewerPointCloudRenderer(this._currentPointCloudResult, startImageId);
                }
                if (this.state.isMeasureMode) {
                    this.updateViewerMeasurementRenderer();
                }
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

            // Draw Polyline FIRST so it stays BEHIND points
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

            // Draw Blue Dots (Active Sequence), Now they render ON TOP of the line
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

    // Fetch nearby sequences (single API call)
    // - Queries Mapillary Graph API for images within ~10m bbox.
    // - Groups them by sequence ID and keeps the earliest captured_at
    // - date per sequence for UI dropdown display.
    private async getSequencesInBBox(lon: number, lat: number, accessToken: string) {
        // Slightly increased bbox (approx 10m) to ensure hits, but we strictly limit the results below
        const bboxSize = BBOX.SEQUENCE_SEARCH; 
        
        // Reduced API limit from 500 to 200 to save bandwidth/parsing time
        const url = `${GRAPH_API.BASE}/images?fields=id,geometry,sequence,captured_at&bbox=${
            lon - bboxSize
        },${lat - bboxSize},${lon + bboxSize},${lat + bboxSize}&limit=${LIMITS.SEQUENCE_SEARCH_IMAGES}`;

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

            const distance = distanceMeters(lat, lon, coords[1], coords[0]);
            
            // Filter out noise > 15 meters away
            if (distance > 15) continue;

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

    // Fetch full coordinate list of a sequence
    // - Uses sequence_id → image_ids → geometry batch fetch
    // - to get lat/lon for all frames in a sequence efficiently.
    private async getSequenceWithCoords(
            sequenceId: string,
            accessToken: string
        ): Promise<{ id: string; lat: number; lon: number; captured_at?: number }[]> {
            
            // 1. Check RAM Cache
            if (this.sequenceCoordsCache[sequenceId]) {
                return this.sequenceCoordsCache[sequenceId];
            }

            // 2. Check LocalStorage (Persistent Cache)
            const cacheKey = `${CACHE_KEYS.GEO_PREFIX}${sequenceId}`;
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
                const url = `${GRAPH_API.BASE}/image_ids?sequence_id=${sequenceId}`;
                const response = await fetch(url, {
                    headers: { Authorization: `OAuth ${accessToken}` },
                });
                const data = await response.json();
                if (!Array.isArray(data.data)) return [];

                const ids = data.data.map((d: any) => d.id);

                // Batch fetch geometry
                const coordUrl = `${GRAPH_API.BASE}/?ids=${ids.join(",")}&fields=id,geometry,captured_at`;
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
                    .filter((item: any): item is { id: string; lon: number; lat: number; captured_at?: number } => item !== null && item.lon !== 0);

                // 4. Save to RAM Cache
                this.sequenceCoordsCache[sequenceId] = coords; 

                // 5. Save to LocalStorage (Persistent)
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(coords));
                } catch (e) {
                    // If full, clear ALL coordinate caches and try one more time for this specific one
                    console.warn("Storage full, attempting to purge old coordinate caches...");
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith(CACHE_KEYS.GEO_PREFIX)) {
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

            // Draw a point for every image in this sequence
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
            localStorage.removeItem(CACHE_KEYS.SEQUENCE);
            // Loop through all localStorage keys and remove coordinate caches
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(CACHE_KEYS.GEO_PREFIX)) {
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

    // Local caching of last sequence
    // Stores minimal sequence info (IDs + coords) in localStorage
    // to reload previous sequence instantly on widget startup.
    private saveSequenceCache(sequenceId: string, sequenceImages: { id: string; lat: number; lon: number }[]) {
        try {
            localStorage.setItem(CACHE_KEYS.SEQUENCE, JSON.stringify({
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
            const cache = localStorage.getItem(CACHE_KEYS.SEQUENCE);
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
    // #endregion SEQUENCE MANAGEMENT

    // Clean up everything when widget closes or reloads
    // Stops animation intervals, removes all map graphics,
    // destroys Mapillary viewer instance, clears DOM container,
    // and resets internal state if requested.
	private cleanupWidgetEnvironment(resetState: boolean = false, fullRemove: boolean = true) {
        // existing green pulse cleanup
		if (this.currentGreenGraphic && (this.currentGreenGraphic as any)._pulseInterval) {
			clearInterval((this.currentGreenGraphic as any)._pulseInterval);
			this.currentGreenGraphic = null;
		}

        if (this._sequenceHighlightLayer) {
            const view = this.state.jimuMapView?.view;
            if (view) view.map.remove(this._sequenceHighlightLayer);
            this._sequenceHighlightLayer = null;
        }

        // Clean up zoom watcher and cancel any pending zoom URL update
        if (this.zoomDisplayHandle) {
            this.zoomDisplayHandle.remove();
            this.zoomDisplayHandle = null;
        }
        this._debouncedZoomUrlUpdate.cancel?.();

        // Clean up direction hover graphic
        this.clearDirectionHighlight();
        this.clearTurboHover();

        // Unsubscribe from direction hover events
        if (this._directionUnsubscribe) {
            this._directionUnsubscribe();
            this._directionUnsubscribe = null;
        }

        if (this._sightViewModel) {
            this._sightViewModel.clear();
            this._sightViewModel = null;
        }

        if (this._viewshedAnalysis) {
            this.clearViewshed();
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

            // ROBUST REMOVAL BY ID
            const layersToRemoveById = [
                LAYER_IDS.COVERAGE_VT,       // General Tiles
                LAYER_IDS.TRAFFIC_SIGNS_VT,   // Traffic Signs Coverage
                LAYER_IDS.TRAFFIC_SIGNS_FL,   // Traffic Signs Popup Points
                LAYER_IDS.OBJECTS_VT,         // Objects Coverage
                LAYER_IDS.OBJECTS_FL,         // Objects Popup Points
                LAYER_IDS.TURBO_COVERAGE                // Turbo Points
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
                        this.drawCone(activeImg.lon, activeImg.lat, this._lastBearing, length, spread);
                        if (this.currentGreenGraphic) {
                            const view = this.state.jimuMapView?.view;
                            if (view) { view.graphics.remove(this.currentGreenGraphic); view.graphics.add(this.currentGreenGraphic); }
                        }
                    }).catch(() => {
                        this.drawCone(activeImg.lon, activeImg.lat, this._lastBearing || 0, length, spread);
                        if (this.currentGreenGraphic) {
                            const view = this.state.jimuMapView?.view;
                            if (view) { view.graphics.remove(this.currentGreenGraphic); view.graphics.add(this.currentGreenGraphic); }
                        }
                    });
                } else {
                    this.drawCone(activeImg.lon, activeImg.lat, this._lastBearing || 0, length, spread);
                    if (this.currentGreenGraphic) {
                        const view = this.state.jimuMapView?.view;
                        if (view) { view.graphics.remove(this.currentGreenGraphic); view.graphics.add(this.currentGreenGraphic); }
                    }
                }
            }
        }
    }

    // #region MINIMAP
    // Creates, updates and destroys the fullscreen minimap view.
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
                id: LAYER_IDS.MINIMAP_TRACKING
            });

            // 2. Advanced Basemap Duplication Strategy
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
            
            // Determine initial center
            let initialCenter = this.state.jimuMapView.view.center;
            if (this.state.imageId && this.state.sequenceImages.length > 0) {
                const currentImg = this.state.sequenceImages.find(img => img.id === this.state.imageId);
                if (currentImg) {
                    initialCenter = [currentImg.lon, currentImg.lat] as any;
                }
            }

            this.minimapView = new MapView({
                container: this.minimapContainer.current,
                map: minimap,
                center: initialCenter,
                zoom: this.state.jimuMapView.view.zoom - ZOOM.MINIMAP_OFFSET,
                ui: { components: [] },
                constraints: { rotationEnabled: true, snapToZoom: true, minZoom: 0, maxZoom: 20 },
                navigation: { mouseWheelZoomEnabled: true, browserTouchPanEnabled: true }
            });

            await this.minimapView.when();

            // Safe Layer Transfer
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

            // D. Mapillary coverage VectorTileLayer for minimap
            // Always shows image circles at full opacity regardless of hideCoverageCircles config,
            // so the minimap always has useful point context.
            try {
                const vectorTileSourceUrl = `${TILE_URLS.COVERAGE}?access_token=${this.accessToken}`;
                const minimapCoverageStyle = {
                    version: 8,
                    sources: {
                        [STYLE_SOURCE_IDS.MAPILLARY]: {
                            type: "vector",
                            tiles: [vectorTileSourceUrl],
                            minzoom: 0,
                            maxzoom: 14
                        }
                    },
                    layers: [
                        {
                            id: STYLE_LAYER_IDS.SEQUENCE,
                            source: STYLE_SOURCE_IDS.MAPILLARY,
                            "source-layer": STYLE_LAYER_IDS.SEQUENCE,
                            type: "line",
                            paint: {
                                "line-opacity": 0.6,
                                "line-color": "#35AF6D",
                                "line-width": 1.5
                            }
                        },
                        {
                            id: STYLE_LAYER_IDS.IMAGE,
                            source: STYLE_SOURCE_IDS.MAPILLARY,
                            "source-layer": STYLE_LAYER_IDS.IMAGE,
                            type: "circle",
                            paint: {
                                "circle-radius": 2,
                                "circle-color": "#35AF6D",
                                "circle-stroke-color": "#ffffff",
                                "circle-stroke-width": 1,
                                "circle-opacity": 1,
                                "circle-stroke-opacity": 1
                            }
                        }
                    ]
                };
                const minimapCoverageLayer = new VectorTileLayer({
                    style: minimapCoverageStyle,
                    opacity: 0.8
                });
                layersToAdd.push(minimapCoverageLayer);
            } catch(e) {
                console.warn("Could not add coverage layer to minimap:", e);
            }

            minimap.addMany(layersToAdd);

            // Re-add graphics layer on top so cone, green dot and hover markers
            // always render above turbo coverage points and VT layers
            minimap.remove(this.minimapGraphicsLayer);
            minimap.add(this.minimapGraphicsLayer);

            this.updateMinimapTracking();

            this.minimapView.on("click", async (evt) => {
                const clickPoint = evt.mapPoint;
                const clickLon = clickPoint.longitude;
                const clickLat = clickPoint.latitude;

                // 1. Check if the click is near a point in the CURRENT sequence (proximity jump)
                if (this.state.sequenceImages?.length > 0 && this.state.sequenceId) {
                    let closestImg: { id: string; lat: number; lon: number; captured_at?: number } | null = null;
                    let minDist = Infinity;
                    this.state.sequenceImages.forEach(img => {
                        const dist = distanceMeters(img.lat, img.lon, clickLat, clickLon);
                        if (dist < minDist) {
                            minDist = dist;
                            closestImg = img;
                        }
                    });
                    // If within 5m of a sequence point, jump within the current sequence
                    if (closestImg && minDist < 5 && closestImg.id !== this.state.imageId) {
                        await this.loadSequenceById(this.state.sequenceId!, closestImg.id);
                        return;
                    }
                }

                // 2. Click is elsewhere, search for nearby sequences at that location.
                //    We intentionally do NOT set availableSequences or call drawSequencesOverlay
                //    so the main map is not polluted with colored multi-sequence overlays.
                //    We just find the closest image and load it directly.
                this.setState({ isLoading: true });
                try {
                    const nearbySeqs = await this.getSequencesInBBox(clickLon, clickLat, this.accessToken);
                    if (!nearbySeqs.length) {
                        this.showNoImageMessage();
                        this.setState({ isLoading: false });
                        return;
                    }

                    // Fetch full coords for each nearby sequence
                    const fullSeqs = await Promise.all(
                        nearbySeqs.map(async (seq) => {
                            const allImages = await this.getSequenceWithCoords(seq.sequenceId, this.accessToken);
                            return { ...seq, images: allImages };
                        })
                    );

                    // Find the image closest to the click across all returned sequences
                    let globalClosest: { seqId: string; imgId: string; dist: number } | null = null;
                    fullSeqs.forEach(seq => {
                        seq.images.forEach(img => {
                            const dist = distanceMeters(img.lat, img.lon, clickLat, clickLon);
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

                    // Load the sequence, this updates sequenceImages/imageId/selectedSequenceId
                    // but leaves availableSequences untouched so no colored overlay appears.
                    // When the user exits fullscreen they'll see just the single blue sequence line.
                    await this.loadSequenceById(globalClosest.seqId, globalClosest.imgId, { lon: clickLon, lat: clickLat });
                    this.setState({ isLoading: false, availableSequences: [], clickLon, clickLat });
                } catch (err) {
                    console.error("Minimap click error:", err);
                    this.setState({ isLoading: false });
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
            try { this.minimapWatchHandle.remove(); } catch (err) {}
            this.minimapWatchHandle = null;
        }

        // Clear graphics layer contents but don't destroy yet,
        // destroying before the view is gone causes ArcGIS to access
        // deallocated animation state and throw "Cannot read properties of undefined (reading 'animation')"
        if (this.minimapGraphicsLayer) {
            try { this.minimapGraphicsLayer.removeAll(); } catch (err) {}
        }

        // Destroy the view first (nulls this.minimapView immediately so updateMinimapTracking
        // won't fire goTo on a half-destroyed view during async Mapillary image events)
        if (this.minimapView) {
            const viewToDestroy = this.minimapView;
            this.minimapView = null; // null BEFORE destroy so any in-flight callbacks bail out

            try {
                (viewToDestroy as any).container = null;
            } catch (err) {}

            try {
                viewToDestroy.destroy();
            } catch (err) {
                console.warn("Error destroying minimap view:", err);
            }
        }

        // Now safe to destroy graphics layer
        if (this.minimapGraphicsLayer) {
            try { this.minimapGraphicsLayer.destroy(); } catch (err) {}
            this.minimapGraphicsLayer = null;
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
        // Guard: view must exist AND not have been destroyed.
        // After destroyMinimap() sets container=null, the view object lingers briefly
        // before this.minimapView is nulled, check destroyed flag to close that window.
        if (!this.minimapGraphicsLayer || !this.state.imageId || !this.ArcGISModules || !this.minimapView) return;
        if ((this.minimapView as any).destroyed) return;

        const currentImg = this.state.sequenceImages.find(img => img.id === this.state.imageId);
        if (!currentImg) return;

        const { Graphic } = this.ArcGISModules;

        // Clearing previous tracking graphics
        try { this.minimapGraphicsLayer.removeAll(); } catch { return; }

        // Center the minimap on the current frame.
        // goTo() returns a Promise; use .catch() not try/catch so the
        // async rejection ("Cannot read properties of undefined: animation")
        // is silently swallowed when the view is destroyed mid-flight.
        if (this.minimapView && !(this.minimapView as any).destroyed) {
            this.minimapView.goTo({
                center: [currentImg.lon, currentImg.lat],
                zoom: this.minimapView.zoom
            }, { animate: false }).catch(() => { /* view destroyed mid-flight, ignore */ });
        }

        // Re-check view is still alive before adding graphics
        if (!this.minimapGraphicsLayer || !this.minimapView || (this.minimapView as any).destroyed) return;

        // Adding pulsing tracking dot
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

        try { this.minimapGraphicsLayer.add(trackingDot); } catch { return; }

        // Adding direction cone on minimap
        if (this._lastBearing !== undefined && this.minimapGraphicsLayer && !(this.minimapView as any)?.destroyed) {
            try {
                const coneMini = new Graphic({
                    geometry: createConeGeometry(currentImg.lon, currentImg.lat, this._lastBearing, 30, 60),
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
            } catch { return; }
        }

        // Optionally, adding the sequence polyline
        if (this.state.sequenceImages.length > 1 && this.minimapGraphicsLayer && !(this.minimapView as any)?.destroyed) {
            try {
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
            } catch { return; }
        }
    }
    // #endregion MINIMAP

    // #region FULLSCREEN & RESIZE
    // Manages toggling fullscreen mode and keeping the Mapillary viewer
    // correctly sized when the container or window dimensions change.
    // Toggle between embedded and fullscreen modes
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
                    this.drawCone(
                        currentImageCoords.lon, 
                        currentImageCoords.lat, 
                        currentBearing, 
                        length, 
                        spread
                    );
                    if (this.currentGreenGraphic) {
                        const view = this.state.jimuMapView?.view;
                        if (view) { view.graphics.remove(this.currentGreenGraphic); view.graphics.add(this.currentGreenGraphic); }
                    }
                }
                
                this.applyCustomCameraAngle();
                // Bind events
                this.bindMapillaryEvents();

                if (this.state.pointCloudVisible && this._currentPointCloudResult) {
                    this.addViewerPointCloudRenderer(this._currentPointCloudResult, currentImageId);
                }
                if (this.state.isMeasureMode) {
                    this.updateViewerMeasurementRenderer();
                }
                
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
    // #endregion FULLSCREEN & RESIZE

    // #region AI DETECTIONS
    // Loads, renders and manages Mapillary detection tags in the viewer.
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
            const url = `${GRAPH_API.BASE}/${imageId}/detections?fields=id,value,geometry&access_token=${this.accessToken}`;
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
                    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '))
                    .join(' ');

                const labelRaw = det.value.split('--').pop();

                // HIDE such as UNLABELED
                const labelLower = labelFull.toLowerCase();
                if (
                    DETECTION_HIDDEN_RAW.includes(labelRaw ?? '') ||
                    DETECTION_HIDDEN_CATEGORIES.some(cat => labelLower.includes(cat))
                ) return;

                this.detectionTagMap.set(det.id, det.value);

                const points = decodeAndNormalizeGeometry(det.geometry);

                if (points.length >= 3) {
                    try {
                        const geometry = new PolygonGeometry(points);
                        const color = getDetectionColor(det.value);

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
            const color = getDetectionColor(detectionValue);
            
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
        * Toggles the visibility state of AI-generated tags in the UI.
        * This function inverses the current `showAiTags` boolean value in the
        * component state, enabling or disabling the display of AI tags.
    */
    private toggleAiTags = () => {
        this.setState({ showAiTags: !this.state.showAiTags });
    };

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
            const url = `${GRAPH_API.BASE}/${featureId}/detections?fields=image{id,thumb_256_url,geometry,captured_at}&limit=5&access_token=${this.accessToken}`;
            
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
                const uniqueImages = images.filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i).slice(0, LIMITS.ALTERNATE_IMAGES);
                this.setState({ alternateImages: uniqueImages });
            }
        } catch (err) {
            console.error("Failed to fetch alternate images", err);
        } finally {
            this.setState({ isFetchingAlternates: false });
        }
    }

    /*
        * Handles selecting an alternate image from the InfoBox panel.
        * When a user clicks a different image thumbnail, this function:
        * 1. Retrieves the sequence containing that image
        * 2. Loads the sequence on the map/viewer
        * 3. Rotates the Mapillary viewer toward the detected feature
        * 4. Moves the ArcGIS map camera to the image location
        * 5. Loads detections for the selected image
    */
    private _handleSelectAlternateImage = async (img: {
        id: string; detectionId: string; thumbUrl: string; capturedAt: number;
        geometry: { type: "Point"; coordinates: [number, number] };
    }) => {
        try {
            this.setState({ targetDetectionId: img.detectionId, detectionsActive: true });
            const resp = await fetch(`${GRAPH_API.BASE}/${img.id}?fields=sequence`, {
                headers: { Authorization: `OAuth ${this.accessToken}` }
            });
            const data = await resp.json();
            if (data.sequence) {
                if (this.state.selectedSequenceId && this.state.selectedSequenceId !== data.sequence) {
                    this.clearSequenceGraphics();
                }
                await this.loadSequenceById(data.sequence, img.id);
                setTimeout(async () => {
                    if (this.mapillaryViewer && this.state.selectedFeatureLocation) {
                        try {
                            const targetBearing = calculateBearing(
                                img.geometry.coordinates[1], img.geometry.coordinates[0],
                                this.state.selectedFeatureLocation.lat, this.state.selectedFeatureLocation.lon
                            );
                            if (this.mapillaryViewer) {
                                const currentImage = await this.mapillaryViewer.getImage();
                                const imageBearing = currentImage.compassAngle;
                                const diff = targetBearing - imageBearing;
                                const newX = 0.5 + (diff / 360);
                                this.mapillaryViewer.setCenter([newX, 0.5]);
                                this.loadDetections(img.id);
                            }
                            if (this.state.jimuMapView) {
                                const view = this.state.jimuMapView.view;
                                if (view.type === "3d") {
                                    view.goTo({ center: [img.geometry.coordinates[0], img.geometry.coordinates[1]], heading: targetBearing, tilt: 60, scale: 500 }, { animate: true, duration: 1500 });
                                } else {
                                    view.goTo({ center: [img.geometry.coordinates[0], img.geometry.coordinates[1]], zoom: 20 }, { animate: true, duration: 1000 });
                                }
                            }
                        } catch (err) {
                            console.warn("Could not set bearing:", err);
                            this.loadDetections(img.id);
                        }
                    } else {
                        if (this.mapillaryViewer) this.loadDetections(img.id);
                    }
                    this._isFlyInActive = false;
                }, 1000);
            }
        } catch (e) { console.error(e); }
    }
    // #endregion AI DETECTIONS


    // #region FILTER LOADING
    // Preloads traffic sign and object dropdown options from sprite sheets.
    /**
        * Loads traffic sign filter options with icons from Mapillary sprite repository.
        * Sets up dropdown options and initializes filter state to DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS.
    */
    private async preloadTrafficSignOptions() {
        try {
            const spriteBaseUrl = SPRITE_URLS.TRAFFIC_SIGNS;
            
            const [jsonResp, img] = await Promise.all([
                fetch(`${spriteBaseUrl}.json`).then(r => r.json()),
                loadImage(`${spriteBaseUrl}.png`)
            ]);

            const codes = Object.keys(jsonResp);

            processInChunks(
                codes, 
                20, 
                (code) => {
                    const friendlyName = formatTrafficSignName(code);
                    const meta = jsonResp[code];
                    
                    // 1. Define the variable
                    const iconUrl = cropSpriteImage(img, meta);
                    
                    // 2. Check if it is valid
                    if (!iconUrl) return null; 

                    return { value: friendlyName, label: friendlyName, iconUrl };
                },
                (results) => {
                    const allOption: FilterOption = { value: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, label: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, iconUrl: null };

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
        * Sets up dropdown options and initializes filter state to DEFAULT_FILTER_LABELS.OBJECTS.
    */
    private async preloadObjectOptions() {
        try {
            const spriteBaseUrl = SPRITE_URLS.OBJECTS;

            const [jsonResp, img] = await Promise.all([
                fetch(`${spriteBaseUrl}.json`).then(r => r.json()),
                loadImage(`${spriteBaseUrl}.png`)
            ]);

            const codes = Object.keys(jsonResp);

            processInChunks(
                codes, 
                20, 
                (code) => {
                    const friendlyName = objectNameMap[code] || code;
                    const meta = jsonResp[code];
                    
                    // 1. Define
                    const iconUrl = cropSpriteImage(img, meta);

                    // 2. Check
                    if (!iconUrl) return null;

                    return { value: friendlyName, label: friendlyName, iconUrl };
                },
                (results) => {
                    const allOption: FilterOption = { value: DEFAULT_FILTER_LABELS.OBJECTS, label: DEFAULT_FILTER_LABELS.OBJECTS, iconUrl: null };

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

        const targetLayer = newStyle.layers.find((ly: any) => ly.id === STYLE_LAYER_IDS.TRAFFIC_SIGNS_ICONS);
        if (targetLayer) {
            if (!selectedValue || selectedValue === DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS) {
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
        const targetLayer = newStyle.layers.find((ly: any) => ly.id === STYLE_LAYER_IDS.OBJECTS_ICONS);

        if (targetLayer) {
            if (!selectedValue || selectedValue === DEFAULT_FILTER_LABELS.OBJECTS) {
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
    // #endregion FILTER LOADING

    // #region COVERAGE LAYERS
    /*
        Initializes the Mapillary Vector Tile Layer
        * Creates a VectorTileLayer from the Mapillary tiles API
        * Uses an inline `minimalStyle` object for symbology (sequence = green line, image = light cyan blue circle)
        * Stores the layer in `this.mapillaryVTLayer` for later toggling
    */
    private initMapillaryLayer(
        filterCreatorId?: number,
        filterStartDate?: string,
        filterEndDate?: string,
        filterIsPano?: boolean | null,
        qualityViewActive?: boolean
    ) {
        const { VectorTileLayer } = this.ArcGISModules;
        const vectorTileSourceUrl = `${TILE_URLS.COVERAGE}?access_token=${this.accessToken}`;

        const { overviewFilter, sequenceFilter, imageFilter, hasPanoFilter } = buildAllFilters({
            creatorId: filterCreatorId,
            startDate: filterStartDate,
            endDate:   filterEndDate,
            isPano:    filterIsPano,
        });

        const layers: any[] = [];

        // Pano condition (classic filter syntax for ArcGIS VTL compatibility)
        let panoCondition: any = null;
        if (filterIsPano === true) {
            panoCondition = ["any",
                ["==", "is_pano", true],
                ["==", "is_pano", 1],
                ["==", "is_pano", "true"]
            ];
        } else if (filterIsPano === false) {
            panoCondition = ["all",
                ["!=", "is_pano", true],
                ["!=", "is_pano", 1],
                ["!=", "is_pano", "true"]
            ];
        }

        const applyPano = (baseFilter: any) => {
            if (!panoCondition) return baseFilter;
            if (!baseFilter)    return panoCondition;
            return ["all", baseFilter, panoCondition];
        };

        const finalOverviewFilter  = applyPano(overviewFilter);
        const finalSequenceFilter  = applyPano(sequenceFilter);
        const finalImageFilter     = applyPano(imageFilter);

        // OVERVIEW LAYER
        if (!hasPanoFilter) {
            layers.push({
                "id": STYLE_LAYER_IDS.OVERVIEW,
                "source": STYLE_SOURCE_IDS.MAPILLARY,
                "source-layer": "overview",
                "type": "circle",
                ...(finalOverviewFilter ? { "filter": finalOverviewFilter } : {}),
                "paint": {
                    "circle-radius": 1,
                    "circle-color": "#35AF6D",
                    "circle-stroke-color": "#35AF6D",
                    "circle-stroke-width": 1
                }
            });
        }

        // SEQUENCE + IMAGE LAYERS
        if (qualityViewActive) {
            // QUALITY VIEW: 4 colour-banded sequence layers
            // Uses pure CLASSIC syntax to prevent crashes when combined with is_pano
            const seqBand = (id: string, qualityConditions: any[], color: string, opacity = 0.85) => {
                const filter = finalSequenceFilter
                    ? ["all", finalSequenceFilter, ...qualityConditions]
                    : ["all", ...qualityConditions];
                
                return {
                    "id": id,
                    "source": STYLE_SOURCE_IDS.MAPILLARY,
                    "source-layer": "sequence",
                    "type": "line",
                    "filter": filter,
                    "paint": {
                        "line-opacity": opacity,
                        "line-color": color,
                        "line-width": 2.5
                    }
                };
            };

            layers.push(seqBand(
                STYLE_LAYER_IDS.SEQUENCE_GOOD,
                [[">=", "quality_score", QUALITY_SCORE.GOOD]],
                "#35AF6D"
            ));
            layers.push(seqBand(
                STYLE_LAYER_IDS.SEQUENCE_FAIR,
                [
                    [">=", "quality_score", QUALITY_SCORE.FAIR],
                    ["<",  "quality_score", QUALITY_SCORE.GOOD]
                ],
                "#F5A623"
            ));
            layers.push(seqBand(
                STYLE_LAYER_IDS.SEQUENCE_POOR,
                [
                    [">",  "quality_score", QUALITY_SCORE.FLOOR],
                    ["<",  "quality_score", QUALITY_SCORE.FAIR]
                ],
                "#D0021B"
            ));
            layers.push(seqBand(
                STYLE_LAYER_IDS.SEQUENCE_UNSCORED,
                [["any",
                    ["!has", "quality_score"],
                    ["==", "quality_score", 0]
                ]],
                "#A855F7", 
                0.85
            ));

            if (!this.props.config.hideCoverageCircles) {
                const imgBand = (id: string, qualityConditions: any[], color: string, opacity = 0.85) => {
                    const filter = finalImageFilter
                        ? ["all", finalImageFilter, ...qualityConditions]
                        : ["all", ...qualityConditions];

                    return {
                        "id": id,
                        "source": STYLE_SOURCE_IDS.MAPILLARY,
                        "source-layer": "image",
                        "type": "circle",
                        "filter": filter,
                        "paint": {
                            "circle-radius": 2,
                            "circle-color": color,
                            "circle-stroke-color": "#ffffff",
                            "circle-stroke-width": 1,
                            "circle-opacity": opacity,
                            "circle-stroke-opacity": opacity
                        }
                    };
                };

                layers.push(imgBand(
                    STYLE_LAYER_IDS.IMAGE_GOOD,
                    [[">=", "quality_score", QUALITY_SCORE.GOOD]],
                    "#35AF6D"
                ));
                layers.push(imgBand(
                    STYLE_LAYER_IDS.IMAGE_FAIR,
                    [
                        [">=", "quality_score", QUALITY_SCORE.FAIR],
                        ["<",  "quality_score", QUALITY_SCORE.GOOD]
                    ],
                    "#F5A623"
                ));
                layers.push(imgBand(
                    STYLE_LAYER_IDS.IMAGE_POOR,
                    [
                        [">",  "quality_score", QUALITY_SCORE.FLOOR],
                        ["<",  "quality_score", QUALITY_SCORE.FAIR]
                    ],
                    "#D0021B"
                ));
                layers.push(imgBand(
                    STYLE_LAYER_IDS.IMAGE_UNSCORED,
                    [["any",
                        ["!has", "quality_score"],
                        ["==", "quality_score", 0]
                    ]],
                    "#A855F7",
                    0.85
                ));
            }

        } else {
            // NORMAL VIEW: single green sequence + image layer
            layers.push({
                "id": STYLE_LAYER_IDS.SEQUENCE,
                "source": STYLE_SOURCE_IDS.MAPILLARY,
                "source-layer": "sequence",
                "type": "line",
                ...(finalSequenceFilter ? { "filter": finalSequenceFilter } : {}),
                "paint": {
                    "line-opacity": 0.8,
                    "line-color": "#35AF6D",
                    "line-width": 2
                }
            });

            if (!this.props.config.hideCoverageCircles) {
                layers.push({
                    "id": STYLE_LAYER_IDS.IMAGE,
                    "source": STYLE_SOURCE_IDS.MAPILLARY,
                    "source-layer": "image",
                    "type": "circle",
                    ...(finalImageFilter ? { "filter": finalImageFilter } : {}),
                    "paint": {
                        "circle-radius": 2,
                        "circle-color": "#35AF6D",
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-width": 1,
                        "circle-opacity": 1,
                        "circle-stroke-opacity": 1
                    }
                });
            }
        }

        const minimalStyle = {
            "version": 8,
            "sources": {
                [STYLE_SOURCE_IDS.MAPILLARY]: {
                    "type": "vector",
                    "tiles": [vectorTileSourceUrl],
                    "minzoom": 0,
                    "maxzoom": 14
                }
            },
            "layers": layers
        };

        this.mapillaryVTLayer = new VectorTileLayer({
            id: LAYER_IDS.COVERAGE_VT,
            title: "Mapillary Coverage",
            style: minimalStyle
        });
    }

    /**
        * Rebuilds the Mapillary coverage vector tile layer on the map.
        * This method reinitializes the layer with new filters (creator, date, pano),
        * removes any existing coverage layer from the map, and adds the updated one.
        * @param creatorId Optional Mapillary creator/user ID to filter images by.
        * @param startDate Optional start date for filtering images.
        * @param endDate Optional end date for filtering images.
        * @param isPano Optional flag to filter panorama images (true = pano, false = non-pano, null/undefined = all).
    */
    private rebuildCoverageLayer(
        creatorId?: number,
        startDate?: string,
        endDate?: string,
        isPano?: boolean | null,
        qualityViewActive?: boolean
    ) {
        if (!this.state.jimuMapView) return;
        const view = this.state.jimuMapView.view;

        this.log('[rebuildCoverageLayer] called with isPano:', isPano);
        
        this.initMapillaryLayer(creatorId, startDate, endDate, isPano, qualityViewActive);

        this.log('[rebuildCoverageLayer] tilesActive:', this.state.tilesActive);

        this.log('[rebuildCoverageLayer] image layer filter:', 
            JSON.stringify(this.mapillaryVTLayer?.style?.layers?.find((l:any) => l.id === 'image')?.filter));

        this.log('[rebuildCoverageLayer] qualityViewActive:', qualityViewActive, 
            '| layers built:', this.mapillaryVTLayer?.style?.layers?.map((l: any) => l.id));

        const existingOnMap = view.map.findLayerById(LAYER_IDS.COVERAGE_VT);

        this.log('[rebuildCoverageLayer] existingOnMap:', !!existingOnMap);

        if (this.state.tilesActive || existingOnMap) {
            if (existingOnMap) view.map.remove(existingOnMap);
            if (this.mapillaryVTLayer) {
                view.map.add(this.mapillaryVTLayer);

                // Push turbo + feature layers back on top so they always sit above the VTL
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
    }

    /*
        Toggles Mapillary Vector Tile Layer or Mapillary Traffic Signs on/off in the current map view
        * If layer is already in the map, remove it
        * If layer is not in the map, add it
        * Uses `this.mapillaryVTLayer` created by initMapillaryLayer()
        * Uses `this.mapillaryTrafficSignsLayer` created by initMapillaryTrafficSignsLayer()
    */
    private toggleMapillaryTiles = async () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        const existingLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.COVERAGE_VT);

        if (existingLayer) {
            jimuMapView.view.map.remove(existingLayer);
            this.setState({ tilesActive: false });
        } else {
            // Resolve creator ID
            let targetId: number | undefined = undefined;
            const activeUsername = this.state.turboFilterUsername?.trim() 
                || this.props.config.turboCreator;
            if (activeUsername) {
                targetId = await this.getUserIdFromUsername(activeUsername) || undefined;
            }

            // DEBUG: confirm what's being passed
            this.log('[toggleMapillaryTiles] turboFilterIsPano:', this.state.turboFilterIsPano);
    
            // Re-initialize with full current filter state
            this.initMapillaryLayer(
                targetId,
                this.state.turboFilterStartDate  || undefined,
                this.state.turboFilterEndDate    || undefined,
                this.state.turboFilterIsPano,
                this.state.qualityViewActive
            );

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

    /*
        Initializes the Mapillary Traffic Signs Layer
        * Creates a Traffic Signs Layer from the Mapillary tiles API
        * Stores the layer in `this.mapillaryTrafficSignsLayer` for later toggling
    */
     private initMapillaryTrafficSignsLayer() {
        const { VectorTileLayer } = this.ArcGISModules;

        const vectorTileSourceUrl = `${TILE_URLS.TRAFFIC_SIGNS}?access_token=${this.accessToken}`;
        const spriteBaseUrl = SPRITE_URLS.TRAFFIC_SIGNS;

        const minimalStyle = {
            version: 8,
            sprite: spriteBaseUrl,
            sources: {
                [STYLE_SOURCE_IDS.TRAFFIC_SIGNS]: {
                    type: "vector",
                    tiles: [vectorTileSourceUrl],
                    minzoom: 0,
                    maxzoom: 14
                }
            },
            layers: [
                {
                    id: STYLE_LAYER_IDS.TRAFFIC_SIGNS_ICONS,
                    source: STYLE_SOURCE_IDS.TRAFFIC_SIGNS,
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
            id: LAYER_IDS.TRAFFIC_SIGNS_VT,
            title: "Mapillary Traffic Signs Coverage",
            style: minimalStyle
        });
    }

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

        // Turn OFF
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
            const existingVTLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_VT);
            if (existingVTLayer) {
                jimuMapView.view.map.remove(existingVTLayer);
                this.log("Removed traffic signs VectorTileLayer");
            }

            // 4. Remove FeatureLayer (interactive features) by ID
            const existingFL = jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_FL);
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
            const defaultTrafficSignsFilter: FilterOption = { 
                value: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, 
                label: DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS, 
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

        // Turn ON
        this._cancelTrafficSignsFetch = false;
        
        // Check if VT layer exists by ID
        const existingVTLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_VT);
        
        // Ensure VT layer is present
        if (!existingVTLayer) {
            this.initMapillaryTrafficSignsLayer();
            jimuMapView.view.map.add(this.mapillaryTrafficSignsLayer); 
        }

        if (jimuMapView.view.zoom >= ZOOM.FEATURES_INTERACTIVE) {
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
                const specificLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_FL);
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
            } 
            else if (currentZoom < 16) {
                // Existing warning for clickable features
                this.showZoomWarning("Zoom in closer (≥ 16) to view clickable traffic sign features.");
                this._cancelTrafficSignsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_FL);
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);

                // Reset to full list when zoomed out
                if (this._fullTrafficSignsOptions.length > 0) {
                    this.setState({ trafficSignsOptions: this._fullTrafficSignsOptions });
                }
            } else {
                this._cancelTrafficSignsFetch = false;
                // Optionally clear warning if they zoom back in
                this.clearZoomWarning(); 
            }
        });
        
        // Fire immediately on first threshold crossing so features
        // appear as soon as the map is stationary at zoom >= 16.
        // Subsequent pan/zoom refreshes use a 100ms debounce to avoid
        // redundant reloads while the user is still navigating.
        let trafficSignsEverLoaded = false;
        const debouncedRefresh = debounceUtil(async () => {
            await this.loadMapillaryTrafficSignsFromTilesBBox(true);
        }, 100);

        this.trafficSignsStationaryHandle = jimuMapView.view.watch("stationary", (isStationary) => {
            if (!isStationary) return;
            if (jimuMapView.view.zoom < 16) return;
            if (this._cancelTrafficSignsFetch) return;
            if (!trafficSignsEverLoaded) {
                // First time crossing the threshold; load immediately, no debounce
                trafficSignsEverLoaded = true;
                this.loadMapillaryTrafficSignsFromTilesBBox(true);
            } else {
                debouncedRefresh();
            }
        });

        this.trafficSignsZoomHandle = zoomHandle;
        this.setState({ trafficSignsActive: true });
    };

    /*
        Initializes the Mapillary Objects Layer Layer
        * Creates a Object Layer from the Mapillary tiles API
        * Stores the layer in `this.mapillaryObjectsLayer` for later toggling
    */
    private initMapillaryObjectsLayer() {
        const { VectorTileLayer } = this.ArcGISModules;

        const vectorTileSourceUrl = `${TILE_URLS.OBJECTS}?access_token=${this.accessToken}`;
        const spriteBaseUrl = SPRITE_URLS.OBJECTS;

        const minimalStyle = {
            version: 8,
            sprite: spriteBaseUrl,
            sources: {
                [STYLE_SOURCE_IDS.OBJECTS]: {
                    type: "vector",
                    tiles: [vectorTileSourceUrl],
                    minzoom: 0,
                    maxzoom: 14
                }
            },
            layers: [
                {
                    id: STYLE_LAYER_IDS.OBJECTS_ICONS,
                    source: STYLE_SOURCE_IDS.OBJECTS,
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
            id: LAYER_IDS.OBJECTS_VT,
            title: "Mapillary Objects Coverage",
            style: minimalStyle
        });
    }

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

        // Turn OFF
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
            const existingVTLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_VT);
            if (existingVTLayer) {
                jimuMapView.view.map.remove(existingVTLayer);
                this.log("Removed objects VectorTileLayer");
            }

            // 4. Remove FeatureLayer (interactive features) by ID
            const existingFL = jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_FL);
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
            const defaultObjectsFilter: FilterOption = { 
                value: DEFAULT_FILTER_LABELS.OBJECTS, 
                label: DEFAULT_FILTER_LABELS.OBJECTS, 
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

        // Turn ON
        this._cancelObjectsFetch = false;

        const existingVTLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_VT);

        if (!existingVTLayer) {
            this.initMapillaryObjectsLayer();
            jimuMapView.view.map.add(this.mapillaryObjectsLayer);
        }

        if (jimuMapView.view.zoom >= ZOOM.FEATURES_INTERACTIVE) {
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
                const specificLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_FL);
                if (specificLayer) jimuMapView.view.map.remove(specificLayer);
            } 
            else if (currentZoom < 16) {
                // Existing warning for clickable features
                this.showZoomWarning("Zoom in closer (≥ 16) to view clickable object features.");
                this._cancelObjectsFetch = true;
                const specificLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_FL);
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

        let objectsEverLoaded = false;
        const debouncedRefresh = debounceUtil(async () => {
            await this.loadMapillaryObjectsFromTilesBBox(true);
        }, 100);

        this.objectsStationaryHandle = jimuMapView.view.watch("stationary", (isStationary) => {
            if (!isStationary) return;
            if (jimuMapView.view.zoom < 16) return;
            if (this._cancelObjectsFetch) return;
            if (!objectsEverLoaded) {
                objectsEverLoaded = true;
                this.loadMapillaryObjectsFromTilesBBox(true);
            } else {
                debouncedRefresh();
            }
        });

        this.objectsZoomHandle = zoomHandle;
        this.setState({ objectsActive: true });
    };

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
    private async loadFeaturesFromTilesBBox(
        matchSpriteIcons: boolean,
        cfg: {
            // Cancellation
            cancelFlag: () => boolean;
            // Tile source
            tileUrl: string;
            tileLayerName: string;
            // Feature naming
            nameFormatter: (value: string) => string;
            // Optional post-fetch feature filter
            postFilter?: (features: any[]) => any[];
            // Sprite sheet
            spriteBaseUrl: string;
            // Dropdown options
            allOptionLabel: string;
            sortOptions?: boolean;
            setOptions: (opts: any[]) => void;
            // Current filter
            currentFilterValue: string;
            resolveRawCode: (spriteData: Record<string, any>, filterValue: string) => string | undefined;
            // ArcGIS layer
            layerId: string;
            layerTitle: string;
            fields: any[];
            popupContent: string;
            layerRef: (layer: any) => void;
            activeFlag: boolean;
        }
    ) {
        if (cfg.cancelFlag()) return;

        const { jimuMapView } = this.state;
        if (!jimuMapView) return;
        if (jimuMapView.view.zoom < 16) return;

        const extent = jimuMapView.view.extent;
        if (!extent) { console.warn("Map extent not available yet"); return; }

        this.setState({ featuresLoading: true });
        // Yield to the render cycle so the spinner has a chance to paint
        // before the heavy tile fetching begins.
        await new Promise(resolve => setTimeout(resolve, 0));

        const geoExtent = webMercatorUtils.webMercatorToGeographic(extent) as __esri.Extent;
        const bbox = [geoExtent.xmin, geoExtent.ymin, geoExtent.xmax, geoExtent.ymax];
        const tiles = bboxToTileRange(bbox, ZOOM.TILE_FETCH);

        // Fetch all tiles in parallel instead of sequentially.
        // At zoom 16 a typical viewport covers 4-9 tiles ; fetching them
        // concurrently cuts tile-fetch time by ~4-9x.
        const tileResults = await Promise.all(
            tiles.map(async ([x, y, z]) => {
                const url = `${cfg.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))}?access_token=${this.accessToken}`;
                try {
                    const resp = await fetch(url);
                    if (!resp.ok) return [];
                    const pbfInstance = new Pbf(await resp.arrayBuffer());
                    const tile = new VectorTile(pbfInstance);
                    const layer = tile.layers[cfg.tileLayerName];
                    if (!layer) return [];

                    const tileFeatures: any[] = [];
                    for (let i = 0; i < layer.length; i++) {
                        try {
                            const feat = layer.feature(i).toGeoJSON(x, y, z);
                            const [lon, lat] = (feat.geometry as any).coordinates;
                            if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) {
                                const geom = lonLatToWebMercator(lon, lat);
                                if (!geom) continue;
                                tileFeatures.push({
                                    geometry: geom,
                                    attributes: {
                                        id: feat.properties.id,
                                        value: feat.properties.value,
                                        name: cfg.nameFormatter(feat.properties.value),
                                        first_seen_at: feat.properties.first_seen_at,
                                        last_seen_at: feat.properties.last_seen_at,
                                    }
                                });
                            }
                        } catch (err) { console.warn("Feature parse error", err); }
                    }
                    return tileFeatures;
                } catch (err) {
                    console.error("Tile fetch error", err);
                    return [];
                }
            })
        );

        let features: any[] = tileResults.flat();

        // Optional post-fetch filter (e.g. objects removes traffic signs)
        if (cfg.postFilter) features = cfg.postFilter(features);

        // Fetch sprite JSON once and reuse for dropdown icons,
        // filter resolution, AND renderer icon loading ; was fetched 2-3 times.
        let spriteData: Record<string, any> = {};
        let spriteImg: HTMLImageElement | null = null;
        
        try {
            if (this._spriteCache[cfg.spriteBaseUrl]) {
                spriteImg = this._spriteCache[cfg.spriteBaseUrl].img;
                spriteData = this._spriteCache[cfg.spriteBaseUrl].json;
            } else {
                [spriteImg, spriteData] = await Promise.all([
                    loadImage(`${cfg.spriteBaseUrl}.png`),
                    fetch(`${cfg.spriteBaseUrl}.json`).then(r => r.json()),
                ]);
                this._spriteCache[cfg.spriteBaseUrl] = { img: spriteImg, json: spriteData };
            }
        } catch (err) { console.warn("Failed to load sprite sheet", err); }

        // Build dropdown options using the already-loaded sprite data
        const uniqueValuesMap = new Map<string, string>();
        features.forEach(f => uniqueValuesMap.set(f.attributes.value, f.attributes.name));

        const optionsWithIcons: Array<{value: string; label: string; iconUrl: string | null}> = [];
        if (spriteImg) {
            for (const [value, name] of uniqueValuesMap.entries()) {
                if (spriteData[value]) {
                    try {
                        const iconUrl = cropSpriteImage(spriteImg, spriteData[value]);
                        if (iconUrl) optionsWithIcons.push({ value: name, label: name, iconUrl });
                    } catch (err) { console.warn(`Failed to crop icon for ${value}`, err); }
                }
            }
        }

        if (cfg.sortOptions) optionsWithIcons.sort((a, b) => a.label.localeCompare(b.label));
        cfg.setOptions([
            { value: cfg.allOptionLabel, label: cfg.allOptionLabel, iconUrl: null },
            ...optionsWithIcons
        ]);

        // Apply active filter using the already-loaded sprite data
        if (cfg.currentFilterValue !== cfg.allOptionLabel) {
            const rawCode = cfg.resolveRawCode(spriteData, cfg.currentFilterValue);
            if (rawCode) {
                features = features.filter(f => f.attributes.value === rawCode);
                this.log(`Filtered to ${features.length} features with code: ${rawCode}`);
            }
        }

        // Load all renderer icons in parallel instead of sequentially.
        // Promise.all fires all icon loads concurrently.
        const { FeatureLayer } = this.ArcGISModules;
        let renderer: __esri.Renderer;
        if (matchSpriteIcons) {
            const uniqueValues = Array.from(new Set(features.map(f => f.attributes.value)));
            const iconEntries = uniqueValues.map(val => {
                if (!spriteData[val] || !spriteImg) return null;
                try {
                    const dataUrl = cropSpriteImage(spriteImg, spriteData[val]);
                    return dataUrl ? [val, dataUrl] as [string, string] : null;
                } catch { return null; }
            });
            const iconCache = Object.fromEntries(iconEntries.filter(Boolean) as [string, string][]);

            renderer = {
                type: "unique-value", field: "value",
                uniqueValueInfos: Object.keys(iconCache).map(v => ({
                    value: v,
                    symbol: { type: "picture-marker", url: iconCache[v], width: 20, height: 20 }
                })),
                defaultSymbol: { type: "simple-marker", color: "orange", size: 8, outline: { color: "white", width: 1 } }
            } as any;
        } else {
            renderer = {
                type: "simple",
                symbol: { type: "simple-marker", size: 6, color: "orange", outline: { color: "white", width: 1 } }
            } as any;
        }

        const layer = new FeatureLayer({
            id: cfg.layerId,
            title: cfg.layerTitle,
            source: features,
            fields: cfg.fields,
            objectIdField: "id",
            spatialReference: { wkid: 3857 },
            geometryType: "point",
            renderer,
            popupTemplate: { title: "{name}", content: cfg.popupContent }
        });

        // Last-second cancellation check
        if (cfg.cancelFlag() || jimuMapView.view.zoom < 16) {
            this.setState({ featuresLoading: false });
            return;
        }

        const existingLayer = jimuMapView.view.map.findLayerById(cfg.layerId);
        if (existingLayer) {
            jimuMapView.view.map.remove(existingLayer);
            (existingLayer as __esri.FeatureLayer).destroy(); // FREES THE RAM
        }

        cfg.layerRef(layer);
        if (cfg.activeFlag) jimuMapView.view.map.add(layer);
        this.setState({ featuresLoading: false });
    }

    private async loadMapillaryTrafficSignsFromTilesBBox(matchSpriteIcons: boolean = true) {
        await this.loadFeaturesFromTilesBBox(matchSpriteIcons, {
            cancelFlag:       () => this._cancelTrafficSignsFetch,
            tileUrl:          TILE_URLS.TRAFFIC_SIGNS,
            tileLayerName:    'traffic_sign',
            nameFormatter:    (v) => formatTrafficSignName(v),
            spriteBaseUrl:    SPRITE_URLS.TRAFFIC_SIGNS,
            allOptionLabel:   DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS,
            setOptions:       (opts) => this.setState({ trafficSignsOptions: opts }),
            currentFilterValue: this.state.trafficSignsFilterValue?.value || DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS,
            resolveRawCode:   (spriteData, filterValue) =>
                Object.keys(spriteData).find(c => formatTrafficSignName(c) === filterValue),
            layerId:          LAYER_IDS.TRAFFIC_SIGNS_FL,
            layerTitle:       'Mapillary Traffic Signs Features',
            fields: [
                { name: 'id', type: 'string', alias: 'ID' },
                { name: 'value', type: 'string', alias: 'Sign Code' },
                { name: 'name', type: 'string', alias: 'Sign Name' },
                { name: 'first_seen_at', type: 'date', alias: 'First Seen' },
                { name: 'last_seen_at', type: 'date', alias: 'Last Seen' },
            ],
            popupContent:     `<b>ID:</b> {id}<br><b>First Seen:</b> {first_seen_at}<br><b>Value Code:</b> {value}<br><b>Last Seen:</b> {last_seen_at}`,
            layerRef:         (layer) => { this.mapillaryTrafficSignsFeatureLayer = layer; },
            activeFlag:       this.state.trafficSignsActive,
        });
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
        await this.loadFeaturesFromTilesBBox(matchSpriteIcons, {
            cancelFlag:       () => this._cancelObjectsFetch,
            tileUrl:          TILE_URLS.OBJECTS,
            tileLayerName:    'point',
            nameFormatter:    (v) => objectNameMap[v] || v,
            postFilter:       (features) => features.filter(f => !f.attributes.value.includes('object--traffic-sign')),
            sortOptions:      true,
            spriteBaseUrl:    SPRITE_URLS.OBJECTS,
            allOptionLabel:   DEFAULT_FILTER_LABELS.OBJECTS,
            setOptions:       (opts) => this.setState({ objectsOptions: opts }),
            currentFilterValue: this.state.objectsFilterValue?.value || DEFAULT_FILTER_LABELS.OBJECTS,
            resolveRawCode:   (spriteData, filterValue) =>
                Object.keys(spriteData).find(c => (objectNameMap[c] || c) === filterValue),
            layerId:          LAYER_IDS.OBJECTS_FL,
            layerTitle:       'Mapillary Objects Features',
            fields: [
                { name: 'id', type: 'string', alias: 'ID' },
                { name: 'value', type: 'string', alias: 'Object Type Code' },
                { name: 'name', type: 'string', alias: 'Object Type Name' },
                { name: 'first_seen_at', type: 'date', alias: 'First Seen' },
                { name: 'last_seen_at', type: 'date', alias: 'Last Seen' },
            ],
            popupContent:     `<b>ID:</b> {id}<br><b>First Seen:</b> {first_seen_at}<br><b>Value Code:</b> {value}<br><b>Last Seen:</b> {last_seen_at}`,
            layerRef:         (layer) => { this.mapillaryObjectsFeatureLayer = layer; },
            activeFlag:       this.state.objectsActive,
        });
    }

    private toggleQualityView = async () => {
        const newActive = !this.state.qualityViewActive;
        this.setState({ qualityViewActive: newActive }, async () => {
            if (!this.state.tilesActive) return; // layer not on map, nothing to rebuild

            let creatorId: number | undefined;
            const username = this.state.turboFilterUsername?.trim() || this.props.config.turboCreator;
            if (username) {
                creatorId = await this.getUserIdFromUsername(username) || undefined;
            }

            this.rebuildCoverageLayer(
                creatorId,
                this.state.turboFilterStartDate || undefined,
                this.state.turboFilterEndDate   || undefined,
                this.state.turboFilterIsPano,
                newActive
            );
        });
    };
    // #endregion COVERAGE LAYERS

    // #region SHARE & EXPORT
    /**
        * Generates a shareable URL with current Image ID, Bearing, and Pitch,
        * and copies it to the clipboard.
    */
    private copyShareLink = async () => {
        if (!this.state.imageId) return;

        try {
            const targetWindow = (window.self !== window.top && window.parent)
                ? window.parent : window;

            const urlString = targetWindow.location.href; // already has everything

            if (navigator.clipboard && window.isSecureContext) {
                try {
                    await navigator.clipboard.writeText(urlString);
                    this.showToast(
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Icons.Check size={14} /> Link copied to clipboard
                        </span>
                    );
                    return;
                } catch (e) {}
            }

            // Textarea fallback
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
                    this.showToast("✓ Link copied to clipboard");
                    return;
                }
            } catch (e) {}

            this.showToast("⚠ Could not copy, please copy from address bar");

        } catch (err) {
            console.error("Error generating link:", err);
        }
    };

    // Helper method to handle the shared URL
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
        const sharedId = params.get(SHARE_PARAMS.IMAGE_ID);

        if (sharedId) {

            // MAP VIEW TYPE CHECK AND SWITCH
            const targetMapType = params.get(SHARE_PARAMS.MAP_TYPE); // '2d' or '3d'

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
            const bearing = parseFloat(params.get(SHARE_PARAMS.BEARING) || '0');
            // SHARE_PARAMS.ZOOM stores the ArcGIS map zoom level (e.g. 19.0),
            // NOT a Mapillary viewer zoom (0–1). Use it to restore the map position.
            const mapZoom = parseFloat(params.get(SHARE_PARAMS.ZOOM) || '19');

            try {
                // Fetch image details to get sequence ID and coords
                const resp = await fetch(`${GRAPH_API.BASE}/${sharedId}?fields=sequence,geometry`, {
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
                                    zoom: mapZoom
                                }, { animate: true, duration: 2500 });
                            } else {
                                // Await so we can write the correct URL zoom immediately
                                // after animation settles, before _isFlyInActive clears.
                                await view.goTo({
                                    target: targetPoint,
                                    zoom: mapZoom
                                }, { animate: true, duration: 2000 });
                            }
                        }

                        // Write correct zoom to URL now while _isFlyInActive is still true
                        // so the zoom watcher cannot interfere.
                        if (this.state.jimuMapView) {
                            const { imageId, sequenceImages } = this.state;
                            const img = sequenceImages.find(s => s.id === imageId);
                            if (img) this.updateUrlWithCurrentImage(imageId!, img.lat, img.lon);
                        }
                        
                        // Flight complete, restore normal camera tracking.
                        setTimeout(() => {
                            this._isFlyInActive = false; 
                        }, 1500);

                        // 3. Apply camera angles after viewer is ready.
                        //    setBearing() is not a real Mapillary-JS API; the correct
                        //    way to point the viewer at a specific bearing is setCenter([x, 0.5])
                        //    where x is derived from the diff between target bearing and the
                        //    image's compassAngle (same pattern used in _handleSelectAlternateImage).
                        setTimeout(async () => {
                            if (this.mapillaryViewer) {
                                try {
                                    const currentImage = await this.mapillaryViewer.getImage();
                                    const imageBearing = currentImage.compassAngle ?? 0;
                                    const diff = bearing - imageBearing;
                                    // Normalise x into 0..1 range
                                    const x = ((0.5 + (diff / 360)) % 1 + 1) % 1;
                                    this.mapillaryViewer.setCenter([x, 0.5]);
                                } catch (err) {
                                    console.warn("Could not set shared bearing on viewer:", err);
                                }
                                // Do NOT call viewer.setZoom(); the ZOOM param is the
                                // ArcGIS map zoom (19.0), not a Mapillary viewer zoom (0–1).
                                // Lock the correct bearing into _lastBearing and the URL.
                                this._lastBearing = bearing;
                                this.updateUrlWithCurrentImage(sharedId, coords[1], coords[0]);
                            }
                        }, 1000); 
                    }
                }
            } catch (err) {
                console.error("Failed to load shared state", err);
            }
        }
    }

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

        this.setState({ isDownloading: true });

        try {
            const url = `${GRAPH_API.BASE}/${imageId}?fields=thumb_2048_url&access_token=${this.accessToken}`;
            const resp = await fetch(url);
            const data = await resp.json();
            const imageUrl = data.thumb_2048_url;

            if (!imageUrl) {
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.Warning size={14} /> High-resolution image not available
                    </span>
                );
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

            this.showToast(
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icons.Download size={14} /> Image downloaded
                </span>
            );

        } catch (err) {
            console.error("Failed to download image:", err);
            this.showToast(
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icons.Warning size={14} /> Download failed
                </span>
            );
        } finally {
            this.setState({ isDownloading: false });
        }
    };
    // #endregion SHARE & EXPORT

    // #region TURBO MODE
    /**
        * Initializes or incrementally updates the high-performance "Turbo Mode" coverage layer.
        * Turbo Mode converts Mapillary vector tiles into interactive ArcGIS FeatureLayer points,
        * enabling rapid querying, filtering, and selection at broad zoom levels.
        * Core Workflow & Architectural Optimizations:
        * - Dynamic Spatial Buffering: Scales the bounding box buffer dynamically based on the current zoom 
        *   level (e.g., 0% at Z14, 10% at Z16+) to minimize unnecessary network payload and API throttling.
        * - Robust Tile Fetching: Retrieves MVT tiles concurrently. Features intelligent caching that correctly 
        *   stores genuine empty regions (404/204) while deferring rate-limited (429/50x) requests for future retries.
        * - Spatial Decimation (Grid Thinning): Implements an ~11-meter virtual grid (`gridResolution`) to 
        *   aggressively deduplicate overlapping points. This prevents V8 heap exhaustion and UI thread freezing at lower zooms.
        * - Lightweight Projection: Utilizes optimized, purely mathematical Web Mercator conversion (`lonLatToWebMercator`) 
        *   to bypass the heavy CPU/RAM allocation overhead of native Esri Geometry objects.
        * - Chunked Rendering & Race Condition Guard: Appends new features to the map in safe batches (15,000) 
        *   via `applyEdits` to prevent silent feature drops. Automatically aborts stale render loops during rapid panning.
        * - Global Spatial Indexing: Enforces a global `fullExtent` to guarantee that the ArcGIS client-side 
        *   R-Tree never arbitrarily clips or hides newly appended features that fall outside the initial map bounding box.
        * @param {string} [forceUsernameFilter] - Optional username to strictly filter coverage points by a specific Mapillary creator.
    */
    private async enableTurboCoverageLayer(forceUsernameFilter?: string) {
        if (!this.state.turboModeActive) return;

        const requestId = ++this._turboRequestCount;
        const { jimuMapView, turboFilterUsername, turboFilterStartDate, turboFilterEndDate, turboFilterIsPano, turboColorByDate } = this.state;
        const activeUsername = forceUsernameFilter !== undefined ? forceUsernameFilter : turboFilterUsername;

        if (!jimuMapView || jimuMapView.view.zoom < ZOOM.TURBO_MIN) return;

        // Resolve User ID
        let targetCreatorId: number | null = null;
        if (activeUsername?.trim()) {
            targetCreatorId = await this.getUserIdFromUsername(activeUsername.trim());
            if (this._turboRequestCount !== requestId) return;
            if (!targetCreatorId) {
                this.showZoomWarning(`User '${activeUsername}' not found.`, 3000);
                return;
            }
        }

        let wgs84Extent: __esri.Extent;
        try {
            wgs84Extent = webMercatorUtils.webMercatorToGeographic(jimuMapView.view.extent) as __esri.Extent;
        } catch (err) { return; }

        // DYNAMIC BUFFER: 10% at Z16+, 5% at Z15, 0% at Z14 to save massive amounts of RAM and network requests
        const currentZoom = jimuMapView.view.zoom;
        const bufferMultiplier = currentZoom < 15 ? 0.0 : (currentZoom < 16 ? 0.05 : 0.10);

        const width = wgs84Extent.xmax - wgs84Extent.xmin;
        const height = wgs84Extent.ymax - wgs84Extent.ymin;
        const bbox =[
            wgs84Extent.xmin - (width * bufferMultiplier),
            wgs84Extent.ymin - (height * bufferMultiplier),
            wgs84Extent.xmax + (width * bufferMultiplier),
            wgs84Extent.ymax + (height * bufferMultiplier)
        ];
        
        const tiles = bboxToTileRange(bbox, ZOOM.TILE_FETCH);
        const startTime = turboFilterStartDate ? new Date(turboFilterStartDate).getTime() : null;
        const endTime = turboFilterEndDate ? new Date(turboFilterEndDate).getTime() : null;

        const activeFilterKey = `${targetCreatorId || 'all'}-${turboFilterIsPano ?? 'all'}-${startTime || 'none'}-${endTime || 'none'}-${turboColorByDate}`;
        
        // CHECK IF LAYER EXISTS & HANDLE TOGGLES
        let existingLayer = jimuMapView.view.map.findLayerById(LAYER_IDS.TURBO_COVERAGE) as __esri.FeatureLayer;

        if (!existingLayer || this._loadedTurboFiltersKey !== activeFilterKey) {
            // Layer was destroyed or filter changed. Reset cache!
            this._loadedTileKeys.clear();
            this._loadedTurboFiltersKey = activeFilterKey;
            if (existingLayer) {
                jimuMapView.view.map.remove(existingLayer);
                existingLayer.destroy();
                existingLayer = null as any;
                this.turboCoverageLayer = null;
            }
        }

        // FIND ONLY MISSING TILES
        const missingTiles = tiles.filter(([x, y, z]) => !this._loadedTileKeys.has(`${z}/${x}/${y}`));

        // TRUE SEAMLESS PANNING
        if (missingTiles.length === 0) return;

        this.setState({ turboLoading: true });
        await new Promise(resolve => setTimeout(resolve, 0));

        const allYears: Set<string> = new Set();
        
        // MEMORY OPTIMIZATION 1: The Spatial Grid for Thinning
        const gridSet = new Set<string>();
        const gridResolution = 0.0001;

        const tilePromises = missingTiles.map(async ([x, y, z]) => {
            // Return an object so we can track the tileKey safely
            if (this._turboRequestCount !== requestId) return { tileKey: null, features:[] };
            
            // MEMORY OPTIMIZATION 2: Yield to prevent UI freeze per tile
            await new Promise(resolve => setTimeout(resolve, 0)); 
            
            const tileKey = `${z}/${x}/${y}`;
            const url = `${TILE_URLS.COVERAGE.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y))}?access_token=${this.accessToken}`;
            
            try {
                const resp = await fetch(url);
                if (!resp.ok) {
                    // If 404, it is genuinely empty water/land. Cache it.
                    if (resp.status === 404 || resp.status === 204) {
                        return { tileKey, features:[] };
                    }
                    // If 429 or 50x, the server rejected us. DO NOT cache it! Try again next pan.
                    return { tileKey: null, features:[] }; 
                }
                
                const tile = new VectorTile(new Pbf(await resp.arrayBuffer()));
                const imgLayer = tile.layers["image"];
                if (!imgLayer) return { tileKey, features:[] }; 

                const newFeatures: any[] =[];
                for (let i = 0; i < imgLayer.length; i++) {
                    const feat = imgLayer.feature(i);
                    const props = feat.properties; 

                    // Filters
                    if (targetCreatorId !== null && props.creator_id !== targetCreatorId) continue;
                    if (turboFilterIsPano !== undefined && !!props.is_pano !== turboFilterIsPano) continue;
                    if (startTime || endTime || turboColorByDate) {
                        const t = props.captured_at as number;
                        if (!t) { if(startTime||endTime) continue; } 
                        else {
                            if (startTime && t < startTime) continue;
                            if (endTime && t > endTime) continue;
                        }
                    }

                    const geo = feat.toGeoJSON(x, y, z);
                    const [lon, lat] = (geo.geometry as any).coordinates;

                    // Fast Grid Decimation Check
                    const gridX = Math.round(lon / gridResolution);
                    const gridY = Math.round(lat / gridResolution);
                    const gridKey = `${gridX},${gridY}`;
                    
                    if (gridSet.has(gridKey)) continue; 
                    gridSet.add(gridKey); 

                    let yearCat: string | null = null;
                    if (turboColorByDate && props.captured_at) {
                        const d = new Date(props.captured_at as number);
                        if (!isNaN(d.getTime())) {
                            yearCat = String(d.getFullYear());
                            allYears.add(yearCat);
                        }
                    }

                    // MEMORY OPTIMIZATION 3: Use fast geoUtils Web Mercator projection
                    const geom = lonLatToWebMercator(lon, lat);
                    if (!geom) continue; // Skip invalid coordinates

                    newFeatures.push({
                        geometry: geom,
                        attributes: {
                            oid: this._turboOidCounter++, 
                            image_id: String(props.id), 
                            creator_id: String(props.creator_id), 
                            sequence_id: String(props.sequence_id || ""),
                            captured_at: props.captured_at || null, 
                            is_pano: !!props.is_pano ? 1 : 0,
                            date_category: yearCat,
                            creator_username: activeUsername || null 
                        }
                    });
                }
                return { tileKey, features: newFeatures };
            } catch (err) { 
                return { tileKey: null, features:[] };
            }
        });

        const results = await Promise.all(tilePromises);
        
        // If the user panned away before this finished, abort completely!
        if (this._turboRequestCount !== requestId) return;

        // ONLY record tiles as "loaded" and extract features if the rendering wasn't aborted
        const newFeaturesRaw: any[] =[];
        for (const res of results) {
            if (res.tileKey) {
                this._loadedTileKeys.add(res.tileKey); // Safely add to cache NOW
                for (const feature of res.features) {
                    newFeaturesRaw.push(feature);
                }
            }
        }

        // UPDATE MAP LAYER SEAMLESSLY
        if (existingLayer) {
            // APPEND TO EXISTING MAP DATA IN CHUNKS TO PREVENT SILENT DROPS
            if (newFeaturesRaw.length > 0) {
                const chunkSize = 15000;
                for (let i = 0; i < newFeaturesRaw.length; i += chunkSize) {
                    existingLayer.applyEdits({ addFeatures: newFeaturesRaw.slice(i, i + chunkSize) });
                }
                
                if (turboColorByDate && allYears.size > 0) {
                    const currentYears = new Set(this.state.turboYearLegend?.map(l => l.year) ||[]);
                    let hasNewYear = false;
                    allYears.forEach(y => { if (!currentYears.has(y)) hasNewYear = true; currentYears.add(y); });
                    
                    if (hasNewYear) {
                        const yearList = Array.from(currentYears).sort();
                        const legendMap = yearList.map((year, idx) => ({
                            year: year,
                            color: `rgb(${YEAR_COLOR_PALETTE[idx % YEAR_COLOR_PALETTE.length].join(",")})`
                        }));
                        this.setState({ turboYearLegend: legendMap });
                        existingLayer.renderer = createYearBasedRenderer(yearList);
                    }
                }
            }
            
            // Guarantee Turbo dots stay above Vector Tiles on pan
            const layers = jimuMapView.view.map.layers;
            if (layers.includes(existingLayer)) {
                jimuMapView.view.map.reorder(existingLayer, layers.length - 1);
            }

        } else {
            // LAYER CREATION (First time or after toggle)
            const { FeatureLayer } = this.ArcGISModules;
            let renderer: __esri.Renderer;
            
            if (turboColorByDate && allYears.size > 0) {
                const yearList = Array.from(allYears).sort();
                renderer = createYearBasedRenderer(yearList);
                const legendMap = yearList.map((year, idx) => ({
                    year: year,
                    color: `rgb(${YEAR_COLOR_PALETTE[idx % YEAR_COLOR_PALETTE.length].join(",")})`
                }));
                this.setState({ turboYearLegend: legendMap });
            } else {
                renderer = {
                    type: "simple",
                    symbol: { type: "simple-marker", color:[165, 42, 42, 0.9], size: 5, outline: { color:[255, 255, 255], width: 1 } }
                } as any;
                this.setState({ turboYearLegend:[] });
            }

            this.turboCoverageLayer = new FeatureLayer({
                id: LAYER_IDS.TURBO_COVERAGE,
                title: "Mapillary Turbo Coverage Points",
                source: newFeaturesRaw,
                objectIdField: "oid",
                elevationInfo: { mode: "on-the-ground" },
                // FORCE ARCGIS TO NEVER CLIP FEATURES WHEN ZOOMED OUT
                // By explicitly forcing the fullExtent to the size of the whole planet upon creation, 
                // the code bypasses ArcGIS's spatial index optimization. 
                // It guarantees that no matter where the user pans or how many new points are dynamically added later, 
                // the map engine will always render them.
                fullExtent: {
                    xmin: -20037508.34,
                    ymin: -20037508.34,
                    xmax: 20037508.34,
                    ymax: 20037508.34,
                    spatialReference: { wkid: 3857 }
                },
                definitionExpression: this.state.selectedTurboYear ? `date_category = '${this.state.selectedTurboYear}'` : undefined,
                fields:[
                    { name: "oid", type: "oid" },
                    { name: "image_id", type: "string" }, 
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
                outFields: ["*"]
            });

            jimuMapView.view.map.add(this.turboCoverageLayer);
            jimuMapView.view.whenLayerView(this.turboCoverageLayer).then(lv => {
                this.turboCoverageLayerView = lv;
            });
        }

        this.setState({ turboLoading: false });
    }

    /**
        * Removes the LAYER_IDS.TURBO_COVERAGE FeatureLayer from the map
        * and clears its reference.
    */
    private disableTurboCoverageLayer() {
        const { jimuMapView } = this.state;
        if (!jimuMapView) return;

        // Remove Points Layer
        const layer = jimuMapView.view.map.findLayerById(LAYER_IDS.TURBO_COVERAGE);
        if (layer) {
            jimuMapView.view.map.remove(layer);
        }
        this.turboCoverageLayer = null; 
        this.log("Turbo coverage layers removed");
    }

    /**
        * Displays a pulsing hover indicator on a Turbo point.
        * The function creates a temporary graphic at the hovered point location
        * and animates it by repeatedly increasing and decreasing its size.
        *
        * @param graphic The turbo point graphic being hovered.
    */
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

    /**
        * Clears the turbo hover animation and removes the hover graphic from the map.
        * This stops the pulse animation and resets hover state.
    */
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

    /**
        * Handles the Turbo Mode toggle button.
        * Turbo Mode loads Mapillary coverage points as feature graphics
        * for high-performance interaction at large zoom levels.
    */
    private _handleToggleTurboMode = async () => {
        const next = !this.state.turboModeActive;
        this.setState({ turboModeActive: next });

        if (next) {
            const view = this.state.jimuMapView?.view;
            if (!this.state.isSharedState) {
                this.log("Manual exploration detected, clearing UI for Turbo");
                this.clearSequenceUI();
            } else {
                this.log("Shared state active, keeping markers visible");
            }

            const currentZoom = this.state.jimuMapView?.view.zoom ?? 0;
            if (currentZoom < ZOOM.TURBO_MIN) {
                this.showZoomWarning("Zoom in closer (\u2265 16) to view and interact with Mapillary coverage point features in Turbo Mode.");
            } else {
                // Already at or above zoom 16, fetch immediately once view is ready
                if (view) {
                    await view.when();
                }
                await this.enableTurboCoverageLayer();
                this.clearZoomWarning();
            }

            if (this.state.jimuMapView) {
                if (this.turboStationaryHandle) { this.turboStationaryHandle.remove(); this.turboStationaryHandle = null; }
                this.turboStationaryHandle = this.state.jimuMapView.view.watch(
                    "stationary",
                    debounceUtil(async (isStationary) => {
                        if (isStationary && this.state.turboModeActive) {
                            if (this.state.jimuMapView.view.zoom < ZOOM.TURBO_MIN) return;
                            const filter = this.state.turboFilterUsername.trim();
                            if (filter) await this.enableTurboCoverageLayer(filter);
                            else await this.enableTurboCoverageLayer();
                        }
                    }, TIMING.TURBO_DEBOUNCE_MS)
                );
                if (this.turboZoomHandle) { this.turboZoomHandle.remove(); this.turboZoomHandle = null; }
                this.turboZoomHandle = this.state.jimuMapView.view.watch("zoom", (z) => {
                    if (this.state.turboModeActive && z < ZOOM.TURBO_MIN) {
                        this.disableTurboCoverageLayer();
                    }
                });
            }
        } else {
            this.disableTurboCoverageLayer();
            if (this.turboStationaryHandle) { this.turboStationaryHandle.remove(); this.turboStationaryHandle = null; }
            if (this.turboZoomHandle) { this.turboZoomHandle.remove(); this.turboZoomHandle = null; }
            this.clearSequenceCache();
            this.rebuildCoverageLayer(
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    this.state.qualityViewActive
            );
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
    }

     // #region STREET COVERAGE ANALYSIS

    /**
        * Runs street coverage analysis for the current map view.
        * Requires Turbo Mode to be active and zoom >= 16 so that
        * turboCoverageLayer already holds decoded coverage points.
        * Flow:
        *  1. Fetch OSM road segments for current bbox via Overpass API
        *  2. Query turbo coverage layer for point geometries
        *  3. Snap points to segments within COVERAGE_SNAP_THRESHOLD_METERS
        *  4. Store result in state ; InfoBox renders the summary
    */
    private runCoverageAnalysis = async () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.turboCoverageLayer) return;

        this.setState({ coverageAnalysisLoading: true, coverageResult: null });
        // Yield to render cycle so the spinner paints before heavy work begins
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            // 1. Get current bbox in WGS84
            const extent = jimuMapView.view.extent;
            const geo = webMercatorUtils.webMercatorToGeographic(extent) as __esri.Extent;
            const { xmin: west, ymin: south, xmax: east, ymax: north } = geo;

            // 2. Fetch OSM road network for this bbox.
            // One automatic retry after 3s if the server returns 504 or 429.
            // Hard stop after the retry ; no loop risk.
            const query = OVERPASS_ROAD_QUERY(south, west, north, east);
            const fetchOverpass = () => fetch("https://overpass-api.de/api/interpreter", {
                method: "POST",
                body: query
            });

            let resp = await fetchOverpass();
            if (!resp.ok && (resp.status === 504 || resp.status === 429)) {
                const reason = resp.status === 429 ? "rate limit" : "timeout";
                this.showToast(`Overpass API ${reason} ; retrying in 3s…`, 3000);
                await new Promise(resolve => setTimeout(resolve, 3000));
                resp = await fetchOverpass(); // exactly one retry, no further loop
            }
            if (!resp.ok) {
                if (resp.status === 504) throw new Error("Road network server is busy (504). Please try again in a moment.");
                if (resp.status === 429) throw new Error("Too many requests to road network server (429). Please wait a minute and try again.");
                throw new Error(`Overpass API error: ${resp.status}`);
            }
            const osmData = await resp.json();
            const segments = parseOverpassRoads(osmData);

            if (!segments.length) {
                this.showToast("No road network found in this area.");
                return;
            }

            // Filter segments to inner bbox only.
            // Turbo coverage points are truncated at the view extent boundary ;
            // sequences that cross the edge are cut off, leaving edge segments
            // with an incomplete point neighbourhood. Restricting analysis to
            // segment midpoints that fall within an inset inner bbox ensures
            // every analysed segment has a full surrounding of coverage points
            // and results are stable regardless of pan position.
            const innerBbox = insetBbox(
                [west, south, east, north],
                COVERAGE_ANALYSIS_INSET_METERS
            );
            const innerSegments = segments.filter(seg => segmentMidpointInBbox(seg, innerBbox));

            if (!innerSegments.length) {
                this.showToast("Analysis area too small after edge filtering. Zoom out slightly.");
                return;
            }

            this.log(`Coverage analysis: ${segments.length} total segments → ${innerSegments.length} inner segments (${segments.length - innerSegments.length} edge segments excluded)`);

            // Drawing dashed rectangle on the map showing the analysed inner area.
            // This makes the analysis zone visible so the user understands why
            // segments near the view edges are not shown.
            
            this.drawCoverageZone(innerBbox);

            // 3. Extracting [lon, lat] points from the loaded turbo coverage layer.
            // Query the layer SOURCE directly (not the LayerView) so we get all
            // features regardless of whether the LayerView has finished rendering.
            const featureQuery = this.turboCoverageLayer.createQuery();
            featureQuery.where = "1=1";
            featureQuery.outFields = ["*"];
            featureQuery.returnGeometry = true;
            featureQuery.outSpatialReference = { wkid: 3857 };
            
            // Wait for the layer to finish loading before querying
            await this.turboCoverageLayer.when();
            const result = await this.turboCoverageLayer.queryFeatures(featureQuery);

            const points: [number, number][] =[];
            const pointTimestamps: (number | null)[] =[];
            
            result.features.forEach((f: any) => {
                const pt = webMercatorUtils.webMercatorToGeographic(f.geometry) as any;
                points.push([pt.x, pt.y]);
                // captured_at stored as ms epoch in the turbo layer
                const ts = f.attributes?.captured_at;
                pointTimestamps.push(typeof ts === 'number' && ts > 0 ? ts : null);
            });

            if (!points.length) {
                this.showToast("No coverage points loaded. Try refreshing Turbo Mode.");
                return;
            }

            // 4. Running snap analysis...
            const coverage = snapPointsToSegments(
                points, innerSegments,
                COVERAGE_SNAP_THRESHOLD_METERS, COVERAGE_MIN_POINTS_PER_SEGMENT,
                HIGHWAY_THRESHOLDS, pointTimestamps
            );

            this._coverageSegments     = innerSegments;
            this._coverageCoveredFlags = coverage.segmentTiers.map(t => t !== 'none');
            this._coverageSegmentTiers = coverage.segmentTiers;

            this.setState({ coverageResult: coverage, coverageSegmentsVisible: false });
            this.log(`Coverage: ${coverage.percentCovered}% covered ; fresh:${coverage.freshCount} aging:${coverage.agingCount} stale:${coverage.staleCount} none:${coverage.noneCount}`);

        } catch (err) {
            console.error("Coverage analysis failed:", err);
            const msg = err instanceof Error ? err.message : "Coverage analysis failed.";
            this.showToast(msg, 5000);
        } finally {
            this.setState({ coverageAnalysisLoading: false });
        }
    };


    /**
        * Draws road segments on the ArcGIS map using a 4-tier freshness color scheme.
        *  FRESH  (< 2 yrs); green        [55, 213, 130]  solid, width 2
        *  AGING  (2–4 yrs); amber        [255, 193, 7]   solid, width 2
        *  STALE  (> 4 yrs); orange-red   [255, 110, 50]  solid, width 3
        *  NONE   (no data); red dashed   [220, 50, 50]   dash, width 3
        * Draw order: fresh → aging → stale → none so that problem segments
        * always render on top and are never hidden by green.
    */
    private async drawCoverageSegments() {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this._coverageSegments.length) return;

        this.clearCoverageSegments();

        const [GraphicsLayer, Graphic] = await loadArcGISJSAPIModules([
            "esri/layers/GraphicsLayer",
            "esri/Graphic"
        ]);

        const layer = new GraphicsLayer({ id: "coverage-segments-layer", listMode: "hide" });

        // Tier style definitions ; rendered bottom-to-top so red always shows on top
        const tierStyles: Record<string, { color: number[]; width: number; style: string }> = {
            fresh: { color: [55,  213, 130, 0.9], width: 2, style: "solid" },
            aging: { color: [255, 193,   7, 0.95], width: 2, style: "solid" },
            stale: { color: [255, 110,  50, 1.0], width: 3, style: "solid" },
            none:  { color: [220,  50,  50, 1.0], width: 3, style: "dash"  },
        };

        const drawOrder: Array<'fresh'|'aging'|'stale'|'none'> = ['fresh', 'aging', 'stale', 'none'];

        for (const tier of drawOrder) {
            const style = tierStyles[tier];
            this._coverageSegments.forEach((seg, i) => {
                if ((this._coverageSegmentTiers[i] ?? (this._coverageCoveredFlags[i] ? 'fresh' : 'none')) !== tier) return;
                const graphic = new Graphic({
                    geometry: {
                        type: "polyline",
                        paths: [[[seg.start[0], seg.start[1]], [seg.end[0], seg.end[1]]]],
                        spatialReference: { wkid: 4326 }
                    },
                    symbol: { type: "simple-line", color: style.color, width: style.width, style: style.style }
                });
                layer.add(graphic);
            });
        }

        jimuMapView.view.map.add(layer);
        this._coverageSegmentsLayer = layer;
        this.setState({ coverageSegmentsVisible: true });
    }

    /**
        * Removes the coverage segments GraphicsLayer from the map and resets state.
    */
    private clearCoverageSegments(resetTiers: boolean = false) {
        const { jimuMapView } = this.state;
        if (this._coverageSegmentsLayer) {
            jimuMapView?.view.map.remove(this._coverageSegmentsLayer);
            this._coverageSegmentsLayer = null;
        }
        // Only wipe tiers when the analysis result is being fully discarded
        // (e.g. user pans away). When called from drawCoverageSegments to
        // replace an existing layer, tiers must survive to colour the new graphics.
        if (resetTiers) {
            this._coverageSegmentTiers = [];
            this._coverageCoveredFlags = [];
            this._coverageSegments     = [];
            this.clearCoverageZone();
        }
        this.setState({ coverageSegmentsVisible: false });
    }

    /**
     * Draws a dashed rectangle on the map outlining the inner analysis bbox.
     * Helps the user understand why segments near the view edges are excluded.
     */
    private drawCoverageZone(innerBbox: [number, number, number, number]) {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        // Remove any existing zone graphic first
        this.clearCoverageZone();

        const [west, south, east, north] = innerBbox;
        const { Graphic } = this.ArcGISModules;

        const zoneGraphic = new Graphic({
            geometry: {
                type: "polygon",
                rings: [[
                    [west,  south],
                    [east,  south],
                    [east,  north],
                    [west,  north],
                    [west,  south],
                ]],
                spatialReference: { wkid: 4326 }
            },
            symbol: {
                type: "simple-fill",
                color: [0, 0, 0, 0], // transparent fill
                outline: {
                    type: "simple-line",
                    color: [30, 144, 255, 0.8], // blue dashed border
                    width: 1.5,
                    style: "dash"
                }
            } as any
        });

        (zoneGraphic as any).__isCoverageZone = true;
        jimuMapView.view.graphics.add(zoneGraphic);
        this._coverageZoneGraphic = zoneGraphic;
    }

    /**
        * Removes the coverage analysis zone rectangle from the map.
    */
    private clearCoverageZone() {
        if (this._coverageZoneGraphic) {
            const view = this.state.jimuMapView?.view;
            if (view) view.graphics.remove(this._coverageZoneGraphic);
            this._coverageZoneGraphic = null;
        }
    }

    /**
        * Toggles the coverage segments layer visibility.
        * Called from the InfoBox toggle button.
    */
    private toggleCoverageSegments = () => {
        if (this.state.coverageSegmentsVisible) {
            this.clearCoverageSegments(false); // keep tiers so re-show works
        } else {
            this.drawCoverageSegments();
        }
    };

    // #endregion STREET COVERAGE ANALYSIS
    
    // #region POINT CLOUD

    /**
        * Loads the Mapillary SfM point cloud for the currently active image
        * and renders it as a GraphicsLayer in the ArcGIS 3D scene.
        * Only available when:
        *  - The map view is 3D (point clouds are meaningless as flat 2D dots)
        *  - An image is currently loaded
        *  - The image has sfm_cluster data (not all images are reconstructed)
        * Flow:
        *  1. loadPointCloud() fetches metadata, downloads CDN blob,
        *     decompresses with pako, converts ENU→WGS84, sanity-checks
        *  2. Points are colored by elevation (Z) using a blue→green→red gradient
        *  3. A GraphicsLayer is added to the scene with one Graphic per point
        *  4. State is updated so the UI button reflects the active cloud
    */
    private loadPointCloudLayer = async (isAutoLoading: boolean = false) => {
        const { jimuMapView, imageId, sequenceImages } = this.state;
        if (!jimuMapView || !imageId) return;

        if (jimuMapView.view.type !== "3d") {
            this.showToast("Point Cloud is only available in 3D map mode.");
            return;
        }

        // Set the Prefix based on the loading context
        const loadingPrefix = isAutoLoading 
            ? "Auto-loading next segment" 
            : "Downloading 3D Point Cloud";

        this.setState({ pointCloudLoading: true, pointCloudAvailable: undefined });
        this.clearPointCloud(false);

        try {
            let progressEnabled = true;

            const result = await loadPointCloud(imageId, this.accessToken, {
                frustumCrop: false,
                cropLengthMeters: POINT_CLOUD_FETCH_LENGTH,
                cropWidthMeters:  POINT_CLOUD_FETCH_WIDTH,
                sequenceImages: this.state.sequenceImages.map(img => ({
                    id:  img.id,
                    lon: img.lon,
                    lat: img.lat,
                })),
                onProgress: (status) => {
                    if (!progressEnabled) return;
                    this.showToast(
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{
                                width: "12px", height: "12px",
                                border: "2px solid rgba(255,255,255,0.3)",
                                borderTopColor: "#fff",
                                borderRadius: "50%",
                                animation: "spin 1s linear infinite"
                            }} />
                            <span><b>{loadingPrefix}:</b> {status}</span>
                        </span>,
                        15000
                    );
                }
            });

            if (!result) {
                this.setState({ pointCloudLoading: false, pointCloudAvailable: false });
                this.showToast("No point cloud available for this image.");
                return;
            }

            // Find the GPS position of the currently active image (The Car/the Person)
            const activeImage = sequenceImages.find(img => img.id === imageId);
            this._cameraLon = activeImage ? activeImage.lon : 0;
            this._cameraLat = activeImage ? activeImage.lat : 0;

            const pointCloudExtentM = result.points.reduce((max, pt) => {
                const d = distanceMeters(pt.lat, pt.lon, this._cameraLat, this._cameraLon);
                return d > max ? d : max;
            }, 0);

            // add width extent using E-W axis only
            const bearing = this.getStreetBearing();
            const rad = (bearing * Math.PI) / 180;
            const sinB = Math.sin(rad);
            const cosB = Math.cos(rad);

            const pointCloudWidthExtentM = result.points.reduce((max, pt) => {
                const dy = (pt.lat - this._cameraLat) * 111320;
                const dx = (pt.lon - this._cameraLon) * 111320 * Math.cos((this._cameraLat * Math.PI) / 180);
                const right = Math.abs(dx * cosB - dy * sinB);
                return right > max ? right : max;
            }, 0);

            this.setState({ 
                pointCloudActualLength: Math.min(
                    Math.ceil(pointCloudExtentM / 10) * 10,
                    POINT_CLOUD_FETCH_LENGTH
                ),
                pointCloudActualWidth: Math.min(
                    Math.ceil(pointCloudWidthExtentM / 10) * 10,
                    POINT_CLOUD_FETCH_WIDTH
                ),
            });

            // Save the raw result so the T,F,G,H,R,C keys or UI cp calibration values can use it without re-downloading
            this._currentPointCloudResult = result;
        
            // Reset the nudge back to 0 for the new image
            this._nudgeX = 0;
            this._nudgeY = 0;
            this._nudgeZ = 0;

            this.setState({ pointCloudMaxLength: POINT_CLOUD_LENGTH_MAX });

            // Capture agent-PROXIMITY FLOOR ALGORITHM
            // Isolate only the points within a tight 5-meter radius around the car
            const nearbyPoints = result.points.filter(p => 
                distanceMeters(this._cameraLat, this._cameraLon, p.lat, p.lon) < 5.0
            );

            // If there are enough points around the car, use them. Otherwise fallback to whole cloud.
            const floorSamplePoints = nearbyPoints.length > 50 ? nearbyPoints : result.points;

            // Sort these specific points by altitude
            const sampledAlts = floorSamplePoints.map(p => p.alt).sort((a, b) => a - b);
            
            // Take the 5th percentile of the points immediately around the car.
            // This safely bypasses reflections/noise and perfectly grabs the asphalt!
            this._baseAlt = sampledAlts[Math.floor(sampledAlts.length * 0.05)]; 

            // Draw the ArcGIS Map
            this.renderPointCloudMapLayer(true);
            this.drawConcentricRings(
                this.state.pointCloudLength <= 0
                    ? this.state.pointCloudActualLength
                    : this.state.pointCloudLength
            );
            
            // Draw the Mapillary Viewer Overlay
            const initialPoints = this.state.pointCloudLength > 0
                ? result.points.filter(p =>
                    distanceMeters(p.lat, p.lon, this._cameraLat, this._cameraLon) <= this.state.pointCloudLength
                )
                : result.points;

            // Pass a shallow copy of result with filtered points for the viewer
            // _currentPointCloudResult still holds the full unfiltered cloud
            this.addViewerPointCloudRenderer(
                { ...result, points: initialPoints },
                imageId
            );

            this.setState({
                pointCloudLoading:   false,
                pointCloudVisible:   true,
                pointCloudAvailable: true,
            });
            
            progressEnabled = false;
            
            const totalPoints = result.points.length;
            const dupes = result.duplicatesRemoved;
            const visiblePoints = initialPoints.length;

            // Final success toast with dedup stats
            this.showToast(
                <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.Check size={14} color="#37d582" />
                        <b>Point cloud loaded:</b> {result.clusterCount} cluster{result.clusterCount !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.75)", paddingLeft: "20px" }}>
                        {totalPoints.toLocaleString()} pts total
                        {dupes > 0 ? ` · ${dupes.toLocaleString()} dupes removed` : ''}
                    </span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", paddingLeft: "20px" }}>
                        {visiblePoints.toLocaleString()} pts visible at {this.state.pointCloudLength}m × {this.state.pointCloudWidth}m
                    </span>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", paddingLeft: "20px" }}>
                        Use T, F, G, H, R, V to align or use calibration panel.
                    </span>
                </span>,
                6000
            );
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Load failed.";
            console.error("Point cloud load failed:", err);
            
            this.setState({ 
                pointCloudLoading: false, 
                pointCloudVisible: false,
                pointCloudAvailable: false // Mark as unavailable so the UI knows
            });

            // Distinguish between a "Crash" and "No Data"
            if (errorMsg.includes("No 3D") || errorMsg.includes("No points") || errorMsg.includes("empty")) {
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ffc107" }}>
                        <Icons.Warning size={14} /> 
                        <b>No Coverage:</b> Mapillary 3D data is not available here.
                    </span>, 
                    5000
                );
            } else {
                // Real technical error (Network/Auth/Code)
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ff6e32" }}>
                        <Icons.Warning size={14} /> 
                        <b>Error:</b> {errorMsg}
                    </span>, 
                    5000
                );
            }
        }
    };

    /**
        * 2. DRAWS the 3D Map Layer. 
        * This is called initially, and re-called instantly every time you press T,F,G,H,R,V.
    */
    private renderPointCloudMapLayer = (silent: boolean = false) => {
        if (!this.state.jimuMapView || !this._currentPointCloudResult) return;
        const { FeatureLayer } = this.ArcGISModules;
        
        const result = this._currentPointCloudResult;
        const cropLength = this.state.pointCloudLength <= 0 ? 0 : this.state.pointCloudLength;

        // Convert the Nudge Meters into GPS Degrees
        const nudgeLat = this._nudgeY / 111320;
        const nudgeLon = this._nudgeX / (111320 * Math.cos((this._cameraLat * Math.PI) / 180));

        const uniqueColors = new Set<string>();
        const quantize = (val: number) => {
            const q = Math.round(val / 16) * 16;
            return q > 255 ? 255 : q;
        };
        const toHex = (c: number) => c.toString(16).padStart(2, '0');

        // Compute rotation helpers for the Oriented Bounding Box (OBB) using Street Direction
        const bearing = this.getStreetBearing();
        const rad = (bearing * Math.PI) / 180;
        const sinB = Math.sin(rad);
        const cosB = Math.cos(rad);
        
        // Dynamic half-width (30m covers standard street width + sidewalks + front yards)
        const halfWidth = this.state.pointCloudWidth;

        const features: any[] = [];
        let filteredIndex = 0;

        result.points.forEach((p, origIndex) => {
            const distFromCamera = distanceMeters(this._cameraLat, this._cameraLon, p.lat, p.lon);
            
            // Calculate relative offset in meters BEFORE applying shift/nudge
            const dy = (p.lat - this._cameraLat) * 111320;
            const dx = (p.lon - this._cameraLon) * 111320 * Math.cos((this._cameraLat * Math.PI) / 180);

            // Project onto local Forward and Right coordinate system
            const forward = dx * sinB + dy * cosB;
            const right = dx * cosB - dy * sinB;

            // Apply OBB Street Corridor Filter
            // Width always enforced, prevents parallel street bleed even on FULL length
            if (halfWidth > 0 && Math.abs(right) > halfWidth) return;

            // Length crop only when not FULL (0 = unlimited length sentinel)
            if (cropLength > 0) {
                if (forward < -cropLength || forward > cropLength) return;
            }

            const relativeZ = p.alt - this._baseAlt;
            const finalZ = relativeZ + this._nudgeZ;

            let pr = p.r ?? 160, pg = p.g ?? 160, pb = p.b ?? 160;
            if (pr <= 1 && pg <= 1 && pb <= 1 && (pr > 0 || pg > 0 || pb > 0)) {
                pr = Math.round(pr * 255);
                pg = Math.round(pg * 255);
                pb = Math.round(pb * 255);
            }

            const hexColor = `#${toHex(quantize(pr))}${toHex(quantize(pg))}${toHex(quantize(pb))}`;
            uniqueColors.add(hexColor);

            features.push({
                geometry: {
                    type: "point",
                    longitude: p.lon + nudgeLon,
                    latitude:  p.lat + nudgeLat,
                    z: finalZ,
                    spatialReference: { wkid: 4326 }
                },
                attributes: {
                    ObjectID:           filteredIndex + 1,
                    pointIndex:         filteredIndex,
                    originalIndex:      origIndex,
                    colorCode:          hexColor,
                    relativeHeight:     parseFloat(finalZ.toFixed(2)),
                    absoluteAltitude:   parseFloat(p.alt.toFixed(2)),
                    distanceFromCamera: parseFloat(distFromCamera.toFixed(2))
                }
            });
            
            filteredIndex++;
        });

        const uniqueValueInfos = Array.from(uniqueColors).map(hex => ({
            value: hex,
            symbol: {
                type: "point-3d",
                symbolLayers:[{
                    type: "icon",
                    resource: { primitive: "circle" },
                    material: { color: hex },
                    size: 2.0,
                    outline: { size: 0 }
                }]
            }
        }));

        // Construct renderer based on selected color mode
        let activeRenderer: __esri.Renderer;

        if (this.state.pointCloudColorMode === 'elevation') {
            activeRenderer = {
                type: "simple",
                symbol: {
                    type: "point-3d",
                    symbolLayers:[{
                        type: "icon",
                        resource: { primitive: "circle" },
                        material: { color: "white" },
                        size: 2.0,
                        outline: { size: 0 }
                    }]
                },
                visualVariables:[{
                    type: "color",
                    field: "relativeHeight",
                    stops:[
                        { value: -0.5, color: "#0000FF" },
                        { value:  0.0, color: "#00FFFF" },
                        { value:  2.5, color: "#00FF00" },
                        { value:  7.0, color: "#FFFF00" },
                        { value: 15.0, color: "#FF0000" }
                    ]
                }]
            } as any;
        } else {
            activeRenderer = {
                type: "unique-value",
                field: "colorCode",
                uniqueValueInfos: uniqueValueInfos
            } as any;
        }

        // 1. Initialize layer completely EMPTY to prevent UI lockup
        const layer = new FeatureLayer({
            id: "point-cloud-layer",
            source:[],
            objectIdField: "ObjectID",
            geometryType: "point",
            hasZ: true,
            spatialReference: { wkid: 4326 },
            elevationInfo: { mode: "relative-to-ground", offset: 0.5 },
            fields:[
                { name: "ObjectID",           type: "oid" },
                { name: "pointIndex",         type: "integer" },
                { name: "originalIndex",      type: "integer" },
                { name: "colorCode",          type: "string", alias: "Hex Color" },
                { name: "relativeHeight",     type: "double", alias: "Height Above Road (m)" },
                { name: "absoluteAltitude",   type: "double", alias: "Sea-level Altitude (m)" },
                { name: "distanceFromCamera", type: "double", alias: "Distance from Car (m)" }
            ],
            outFields: ["*"],
            popupEnabled: true,
            popupTemplate: {
                title: "Point Cloud Node",
                content: `
                    <div style="font-size: 13px; line-height: 1.5;">
                        <b>Distance from Camera:</b> {distanceFromCamera} m<br/>
                        <b>Height Above Road:</b> {relativeHeight} m<br/>
                        <b>Absolute Altitude:</b> {absoluteAltitude} m<br/>
                        <span style="display:none;">{originalIndex}</span>
                    </div>
                `
            },
            renderer: activeRenderer
        });

        // 2. Remove old layer and add the new EMPTY layer instantly
        if (this._pointCloudLayer) {
            this.state.jimuMapView.view.map.remove(this._pointCloudLayer);
        }
        this.state.jimuMapView.view.map.add(layer);
        this._pointCloudLayer = layer as any;

        // 3. BACKGROUND CHUNKING, feed features in batches to avoid UI freeze
        const chunkSize = 15000;
        let currentIndex = 0;
        const totalChunks = Math.ceil(features.length / chunkSize);
        let chunksDone = 0;

        //  NOTIFY USER that 3D scene is reloading
        if (totalChunks > 0 && !silent) {
            this.showToast(
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                        width: "12px", height: "12px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                        flexShrink: 0
                    }} />
                    <span>
                        Updating 3D scene ({features.length.toLocaleString()} pts)…
                    </span>
                </span>,
                30000
            );
        }

        const processNextChunk = async () => {
            if (currentIndex >= features.length) {
                // ALL CHUNKS DONE: replace loading toast with success
                if (!silent) {
                    this.showToast(
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Icons.Check size={14} color="#37d582" />
                            3D scene updated ({features.length.toLocaleString()} points)
                        </span>,
                        2500
                    );
                }
                return;
            }

            if (this._pointCloudLayer !== layer) return;

            const chunk = features.slice(currentIndex, currentIndex + chunkSize);

            try {
                await layer.applyEdits({ addFeatures: chunk });
                currentIndex += chunkSize;
                chunksDone++;
                setTimeout(processNextChunk, 50);
            } catch (err) {
                console.warn("Error applying point cloud chunk:", err);
            }
        };

        processNextChunk();
        
        // 4. Draw the Concentric Distance Rings
        this.drawConcentricRings(
            this.state.pointCloudLength <= 0
                ? this.state.pointCloudActualLength
                : this.state.pointCloudLength
        );
    };

    /**
        * 1. KEY DOWN: Accumulates the distance and updates the UI toast,
        * but DOES NOT render the heavy map layer yet.
    */
    private handleNudgeKeyDown = (e: KeyboardEvent) => {
        // Only allow nudging if the point cloud is currently visible
        if (!this.state.pointCloudVisible || !this._currentPointCloudResult) return;

        // Ignore keystrokes if the user is typing in a text box
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        let handled = false;
        const step = e.shiftKey ? 1.0 : 0.2; 

        const bearingRad = (this._lastBearing * Math.PI) / 180;
        const cosB = Math.cos(bearingRad);
        const sinB = Math.sin(bearingRad);

        switch (e.key.toLowerCase()) {
            case 't': // Move FORWARD
                this._nudgeY += step * cosB; 
                this._nudgeX += step * sinB; 
                handled = true; break;
                
            case 'g': // Move BACKWARD
                this._nudgeY -= step * cosB;
                this._nudgeX -= step * sinB;
                handled = true; break;
                
            case 'f': // Move LEFT
                this._nudgeY += step * sinB;
                this._nudgeX -= step * cosB;
                handled = true; break;
                
            case 'h': // Move RIGHT
                this._nudgeY -= step * sinB;
                this._nudgeX += step * cosB;
                handled = true; break;

            case 'r': // Move UP
                this._nudgeZ += step;
                handled = true; break;
            case 'v': // Move DOWN
                this._nudgeZ -= step;
                handled = true; break;

            // THE Z-SLICER (GROUND MODE)
            case 'x': 
                this._groundMode = !this._groundMode;
                if (this._pointCloudLayer) {
                    // Instantly hide any point taller than 1.5 meters
                    (this._pointCloudLayer as __esri.FeatureLayer).definitionExpression = 
                        this._groundMode ? `relativeHeight < ${POINT_CLOUD_GROUND_MODE_HEIGHT_M}` : "1=1";
                }

                if (this._pointCloudViewerRenderer) {
                    this._pointCloudViewerRenderer.updateColors();
                    
                    // FORCE REDRAW: The microscopic camera hack instantly applies the visual change
                    if (this.mapillaryViewer) {
                        this.mapillaryViewer.getCenter().then((c: number[]) => {
                            this.mapillaryViewer.setCenter([c[0] + 0.000001, c[1]]);
                        }).catch(() => {});
                    }
                }
                
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.GroundGrid size={14} /> 
                           <b>Ground Mode:</b> {this._groundMode ? `ON (Buildings > ${POINT_CLOUD_GROUND_MODE_HEIGHT_M}m Hidden)` : 'OFF (Full Cloud)'}
                    </span>,
                    3000
                );
                e.preventDefault();
                return;

            case 'c': 
                this.setState(prev => ({
                    pointCloudColorMode: prev.pointCloudColorMode === 'rgb' ? 'elevation' : 'rgb'
                }), () => {
                    this.showToast(
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <b>Color Mode:</b> {this.state.pointCloudColorMode === 'elevation' ? 'Elevation Heatmap' : 'True RGB'}
                        </span>,
                        3000
                    );

                    // 1. Redraw Esri Map
                    this.renderPointCloudMapLayer();
                    
                    // 2. Redraw Mapillary Viewer
                    if (this._pointCloudViewerRenderer) {
                        this._pointCloudViewerRenderer.updateColors();
                        if (this.mapillaryViewer) this.mapillaryViewer.resize();
                    }
                });
                e.preventDefault();
                return;
        }

        if (handled) {
            e.preventDefault(); 
            this.showToast(
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icons.Crosshair size={14} /> 
                    <b>Total Offset:</b> 
                    {Math.abs(this._nudgeX).toFixed(1)}m {this._nudgeX > 0 ? 'E' : 'W'}, 
                    {Math.abs(this._nudgeY).toFixed(1)}m {this._nudgeY > 0 ? 'N' : 'S'}
                    {Math.abs(this._nudgeZ).toFixed(1)}m {this._nudgeZ > 0 ? 'Up' : 'Dn'}
                </span>,
                1000
            );
        }
    };

    /**
        * 2. KEY UP: Triggers the actual map redraw ONLY when the user releases the key.
    */
    private handleNudgeKeyUp = (e: KeyboardEvent) => {
        if (!this.state.pointCloudVisible || !this._currentPointCloudResult) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const key = e.key.toLowerCase();
        
        // If they released T, F, G, H, R or V apply the final location to the map!
        if (['t', 'f', 'h', 'g', 'r', 'v'].includes(key)) {
            // We use the debounced version just in case they release two keys (like T and H) 
            // at the exact same millisecond, preventing double-renders.
            this._debouncedNudgeRender();
        }
    };

    /**
        * Toggles the Calibration UI Panel
    */
    private toggleCalibrationPanel = () => {
        this.setState(prev => ({ showCalibrationPanel: !prev.showCalibrationPanel }));
    };

    /**
        * Triggers when the user clicks an on-screen Joystick Arrow.
        * Maps directional clicks to the camera's current viewing angle.
    */
    private handleJoystickNudge = (axis: 'x' | 'y' | 'z', direction: 1 | -1) => {
        if (!this.state.pointCloudVisible || !this._currentPointCloudResult) return;

        const step = this.state.nudgeStep * direction;
        const bearingRad = (this._lastBearing * Math.PI) / 180;
        const cosB = Math.cos(bearingRad);
        const sinB = Math.sin(bearingRad);

        if (axis === 'y') { // Forward / Backward
            this._nudgeY += step * cosB;
            this._nudgeX += step * sinB;
        } else if (axis === 'x') { // Left / Right
            this._nudgeY -= step * sinB;
            this._nudgeX += step * cosB;
        } else if (axis === 'z') { // Up / Down
            this._nudgeZ += step;
        }

        // Show instant feedback toast
        this.showToast(
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Icons.Crosshair size={14} /> 
                <b>Offset:</b> X:{this._nudgeX.toFixed(1)}m, Y:{this._nudgeY.toFixed(1)}m, Z:{this._nudgeZ.toFixed(1)}m
            </span>, 1000
        );

        // Instantly redraw the map
        this._debouncedNudgeRender();
    };

    /**
        * Instantly resets the cloud back to the ground and clears the X/Y drift offset.
    */
    private resetCalibration = () => {
        this._nudgeX = 0;
        this._nudgeY = 0;
        this._nudgeZ = 0;
        this.showToast("Cloud reset to Mapillary coordinates.", 2000);
        this.renderPointCloudMapLayer();
    };

    /**
        Creates and attaches a MapillaryJS ICustomRenderer that draws the point
        cloud as white semi-transparent dots directly onto the street imagery.
        * Uses raw WebGL with gl.POINTS; no Three.js dependency required.
        * geodeticToEnu (from mapillary-js) converts each WGS84 point to the
        * viewer's local topocentric ENU frame so they project correctly onto
        * the panoramic scene as the user pans and zooms.
    */
    private addViewerPointCloudRenderer(result: PointCloudResult, imageId: string) {
        if (!this.mapillaryViewer) return;
        this.removeViewerPointCloudRenderer();

        const points = result.points;

        const vsSource = `
            attribute vec3 aPosition;
            attribute vec4 aColor;          
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelMatrix;
            uniform float uIsHighlightDraw;
            uniform float uPixelRatio;
            varying float vIsHighlight;
            varying vec3 vColor;
            varying float vAlpha;            

            void main(void) {
                gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
                if (uIsHighlightDraw > 0.5) {
                    gl_PointSize = 20.0 * uPixelRatio;
                    vIsHighlight = 1.0;
                } else {
                    gl_PointSize = 1.0 * uPixelRatio; 
                    vIsHighlight = 0.0;
                }
                vColor = aColor.rgb / 255.0; 
                vAlpha = aColor.a / 255.0; // Pass the Alpha channel to the fragment shader
            }
        `;

        const fsSource = `
            precision mediump float;
            varying float vIsHighlight;
            varying vec3 vColor;
            varying float vAlpha;            

            void main(void) {
                // If Ground Mode sets Alpha to 0, kill the pixel instantly!
                if (vAlpha < 0.5) {
                    discard;
                }

                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                
                if (dist > 0.5) discard; 
                
                if (vIsHighlight > 0.5) {
                    if (dist > 0.40) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.8);
                    } else if (dist > 0.30) {
                        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                    } else {
                        gl_FragColor = vec4(1.0, 0.9, 0.0, 1.0);
                    }
                } else {
                    // Soft point splatting for a dense cloud look
                    float alpha = (0.5 - dist) * 2.0; 
                    gl_FragColor = vec4(vColor, alpha * 0.95); 
                }
            }
        `;

        const widget = this;
        const renderer: any = {
            id: 'point-cloud-renderer',
            renderPass: RenderPass.Opaque,
            _gl: null,
            _program: null,
            _positionBuffer: null,
            _highlightBuffer: null,
            _vertexCount: 0,
            _modelMatrix: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
            _points: points,
            _selectedIndex: -1,
            _currentReference: null,
            _uViewMatrixLoc: null,
            _uProjectionMatrixLoc: null,
            _uModelMatrixLoc: null,
            _uIsHighlightDrawLoc: null,
            _uPixelRatioLoc: null,
            _pixelRatio: window.devicePixelRatio || 1,
            _aPositionLoc: -1,
            _colorBuffer: null as WebGLBuffer | null,
            _aColorLoc: -1,

            updateColors() {
                const gl = this._gl;
                if (!gl || !this._colorBuffer) return;

                const mode = widget.state.pointCloudColorMode;
                const base = widget._baseAlt;
                const nudgeZ = widget._nudgeZ;
                const isGroundMode = widget._groundMode;
                
                // Fallback to 1.5m to ensure it never fails
                const limit = POINT_CLOUD_GROUND_MODE_HEIGHT_M || 1.5; 

                const colors: number[] =[];
                for (const p of this._points) {
                    const relH = p.alt - base + nudgeZ;
                    
                    // Alpha flag: 255 = visible, 0 = hidden (Ground Mode)
                    const a = (isGroundMode && relH >= limit) ? 0 : 255;

                    if (mode === 'elevation') {
                        let r = 0, g = 0, b = 255;
                        if (relH <= -0.5) { r = 0; g = 0; b = 255; } 
                        else if (relH <= 0.0) { r = 0; g = Math.round(((relH - -0.5) / 0.5) * 255); b = 255; } 
                        else if (relH <= 2.5) { r = 0; g = 255; b = Math.round((1 - (relH - 0.0) / 2.5) * 255); } 
                        else if (relH <= 7.0) { r = Math.round(((relH - 2.5) / 4.5) * 255); g = 255; b = 0; } 
                        else if (relH <= 15.0) { r = 255; g = Math.round((1 - (relH - 7.0) / 8.0) * 255); b = 0; } 
                        else { r = 255; g = 0; b = 0; } 
                        
                        colors.push(r, g, b, a); // Push 4 values (RGBA)
                    } else {
                        colors.push(p.r ?? 160, p.g ?? 160, p.b ?? 160, a); // Push 4 values (RGBA)
                    }
                }

                gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
                // DYNAMIC_DRAW allows real-time updates without breaking WebGL
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW); 
            },

            updatePoints(filteredPoints: PointCloudPoint[]) {
                const gl = this._gl;
                if (!gl || !this._positionBuffer || !this._colorBuffer || !this._currentReference) return;

                this._points = filteredPoints;
                this._vertexCount = filteredPoints.length;

                // Rebuild position buffer from filtered subset
                const positions: number[] = [];
                for (const p of filteredPoints) {
                    const enu = geodeticToEnu(
                        p.rawLon, p.rawLat, p.alt,
                        this._currentReference.lng,
                        this._currentReference.lat,
                        this._currentReference.alt
                    );
                    positions.push(enu[0], enu[1], enu[2]);
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

                // Rebuild color buffer for the new subset
                this.updateColors();
            },

            setHighlight(index: number) {
                this._selectedIndex = index;
                this.updateHighlightBuffer();
            },

            updateHighlightBuffer() {
                const gl = this._gl;
                if (!gl || !this._highlightBuffer || !this._currentReference || this._selectedIndex < 0) return;
                
                const p = this._points[this._selectedIndex];
                if (!p) return;

                const enu = geodeticToEnu(
                    p.rawLon, p.rawLat, p.alt,
                    this._currentReference.lng, this._currentReference.lat, this._currentReference.alt
                );
                
                gl.bindBuffer(gl.ARRAY_BUFFER, this._highlightBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(enu), gl.DYNAMIC_DRAW);
            },

            onAdd(viewer: any, reference: any, context: WebGLRenderingContext) {
                const gl = context;
                this._gl = gl;
                this._currentReference = reference;

                const compile = (type: number, src: string) => {
                    const s = gl.createShader(type)!;
                    gl.shaderSource(s, src);
                    gl.compileShader(s);
                    return s;
                };

                const vs = compile(gl.VERTEX_SHADER, vsSource);
                const fs = compile(gl.FRAGMENT_SHADER, fsSource);
                const program = gl.createProgram()!;
                gl.attachShader(program, vs);
                gl.attachShader(program, fs);
                gl.linkProgram(program);
                this._program = program;

                this._uViewMatrixLoc = gl.getUniformLocation(program, 'uViewMatrix');
                this._uProjectionMatrixLoc = gl.getUniformLocation(program, 'uProjectionMatrix');
                this._uModelMatrixLoc = gl.getUniformLocation(program, 'uModelMatrix');
                this._uIsHighlightDrawLoc = gl.getUniformLocation(program, 'uIsHighlightDraw');
                this._aPositionLoc = gl.getAttribLocation(program, 'aPosition');
                this._aColorLoc = gl.getAttribLocation(program, 'aColor');
                this._uPixelRatioLoc = gl.getUniformLocation(program, 'uPixelRatio');
                this._pixelRatio = window.devicePixelRatio || 1;

                const positions: number[] =[];
                for (const p of this._points) {
                    const enu = geodeticToEnu(
                        p.rawLon, p.rawLat, p.alt,
                        reference.lng, reference.lat, reference.alt
                    );
                    positions.push(enu[0], enu[1], enu[2]);
                }
                this._vertexCount = positions.length / 3;

                this._positionBuffer = gl.createBuffer()!;
                gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

                this._colorBuffer = gl.createBuffer()!;
                this.updateColors(); // Generate initial RGBA array

                this._highlightBuffer = gl.createBuffer()!;
                gl.bindBuffer(gl.ARRAY_BUFFER, this._highlightBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.DYNAMIC_DRAW);
            },

            onReference(viewer: any, reference: any) {
                this._currentReference = reference;
                const gl = this._gl;
                if (!gl || !this._positionBuffer) return;
                
                const positions: number[] =[];
                for (const p of this._points) {
                    const enu = geodeticToEnu(
                        p.rawLon, p.rawLat, p.alt,
                        reference.lng, reference.lat, reference.alt
                    );
                    positions.push(enu[0], enu[1], enu[2]);
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

                this.updateHighlightBuffer();
            },

            onRemove(viewer: any, context: WebGLRenderingContext) {
                const gl = context;
                if (this._program) gl.deleteProgram(this._program);
                if (this._positionBuffer) gl.deleteBuffer(this._positionBuffer);
                if (this._highlightBuffer) gl.deleteBuffer(this._highlightBuffer);
                if (this._colorBuffer) gl.deleteBuffer(this._colorBuffer);
                this._gl = null;
                this._program = null;
            },

            render(context: WebGLRenderingContext, viewMatrix: Float32Array, projectionMatrix: Float32Array) {
                const gl = context;
                const program = this._program;
                if (!program || !this._positionBuffer || this._vertexCount === 0) return;

                gl.useProgram(program);

                gl.uniformMatrix4fv(this._uViewMatrixLoc, false, viewMatrix);
                gl.uniformMatrix4fv(this._uProjectionMatrixLoc, false, projectionMatrix);
                gl.uniformMatrix4fv(this._uModelMatrixLoc, false, this._modelMatrix);
                if (this._uPixelRatioLoc) gl.uniform1f(this._uPixelRatioLoc, this._pixelRatio);

                gl.uniform1f(this._uIsHighlightDrawLoc, 0.0);

                gl.enableVertexAttribArray(this._aPositionLoc);
                gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
                gl.vertexAttribPointer(this._aPositionLoc, 3, gl.FLOAT, false, 0, 0);

                if (this._aColorLoc >= 0 && this._colorBuffer) {
                    gl.enableVertexAttribArray(this._aColorLoc);
                    gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
                    
                    // Tell WebGL to expect 4 numbers (RGBA) instead of 3!
                    gl.vertexAttribPointer(this._aColorLoc, 4, gl.FLOAT, false, 0, 0); 
                }

                gl.enable(gl.DEPTH_TEST);
                gl.depthMask(false);
                gl.drawArrays(gl.POINTS, 0, this._vertexCount);
                gl.depthMask(true);

                if (this._selectedIndex >= 0 && this._highlightBuffer) {
                    gl.uniform1f(this._uIsHighlightDrawLoc, 1.0);
                    gl.bindBuffer(gl.ARRAY_BUFFER, this._highlightBuffer);
                    gl.vertexAttribPointer(this._aPositionLoc, 3, gl.FLOAT, false, 0, 0);
                    gl.disableVertexAttribArray(this._aColorLoc); 
                    gl.vertexAttrib4f(this._aColorLoc, 255, 255, 0, 255); 
                    gl.disable(gl.DEPTH_TEST);
                    gl.drawArrays(gl.POINTS, 0, 1);
                    gl.enable(gl.DEPTH_TEST);
                }

                gl.disableVertexAttribArray(this._aPositionLoc);
                if (this._aColorLoc >= 0) gl.disableVertexAttribArray(this._aColorLoc);
            },
        };

        try {
            this.mapillaryViewer.addCustomRenderer(renderer);
            this._pointCloudRendererActive = true;
            this._pointCloudViewerRenderer = renderer; 
        } catch (err) {
            console.warn("Could not attach point cloud viewer renderer:", err);
        }
    }

    /**
        * Removes the MapillaryJS WebGL point cloud renderer from the viewer.
    */
    private removeViewerPointCloudRenderer() {
        if (!this.mapillaryViewer || !this._pointCloudRendererActive) return;
        try {
            this.mapillaryViewer.removeCustomRenderer('point-cloud-renderer');
        } catch (err) {
            console.warn("Could not remove point cloud viewer renderer:", err);
        }
        this._pointCloudRendererActive = false;
    }

    /**
        * Removes the point cloud GraphicsLayer from the map and resets state.
        * @param resetState If true, also resets pointCloudAvailable to undefined.
        *                   Pass false when clearing before a reload so the loading
        *                   spinner state is not interrupted.
    */
    private clearPointCloud = (resetState: boolean = true) => {
        const { jimuMapView } = this.state;
        if (this._pointCloudLayer) {
            jimuMapView?.view.map.remove(this._pointCloudLayer);
            this._pointCloudLayer = null;
        }
        this.removeViewerPointCloudRenderer();

        // DEACTIVATE ALL POINT-CLOUD-DEPENDENT TOOLS
        // Measure mode
        if (this.state.isMeasureMode) {
            this.setState({ isMeasureMode: false, measurePoints: [] }, () => {
                this.updateMeasurementGraphics(); // clears the 3D line from map + viewer
            });
        }

        // Line of Sight
        if (this.state.isSightMode) {
            if (this._sightViewModel) this._sightViewModel.clear();
            this.setState({ isSightMode: false, sightObserver: null, sightTargets: [] });
        }

        // Viewshed
        if (this.state.isViewshedMode) {
            this.clearViewshed();
            this.setState({ isViewshedMode: false });
        }

        // Lidar Grid Rings
        if (this._gridLayer) {
            const { jimuMapView } = this.state;
            try {
                if (jimuMapView) jimuMapView.view.map.remove(this._gridLayer);
            } catch (e) {
                // ignore if view already torn down
            }
            this._gridLayer = null;
        }
        
        this._gridLayerReady = null;

        // Cancel any in-flight async ring-draw from before the clear
        this._ringGeneration++;

        // Calibration panel
        if (this.state.showCalibrationPanel) {
            this.setState({ showCalibrationPanel: false });
        }

        if (resetState) {
            this.setState({
                pointCloudVisible:   false,
                pointCloudAvailable: undefined,
            });
        }
    };

    /**
        * Toggles the point cloud layer.
        * - If a cloud is loaded and visible: removes it
        * - If no cloud is loaded: triggers a fresh load
        * The toggle is image-aware, switching to a new image clears the
        * previous cloud automatically via the image change event handler.
    */
    private togglePointCloud = () => {
        if (this.state.pointCloudVisible) {
            this.clearPointCloud(true);
        } else {
            this.loadPointCloudLayer();
        }
    };

    // The debounced function to redraw the layer when you stop pressing keys
    private _debouncedNudgeRender = debounceUtil(() => {
        // Redraw Esri Map (this also calls drawConcentricRings internally,
        // but we call it explicitly here too to clear stale rings immediately
        // before the heavier layer rebuild finishes)
        this.renderPointCloudMapLayer();
        this.drawConcentricRings(
            this.state.pointCloudLength <= 0
                ? this.state.pointCloudActualLength
                : this.state.pointCloudLength
        );
        
        // Update colors in the viewer (in case they shifted up/down)
        if (this._pointCloudViewerRenderer) {
            this._pointCloudViewerRenderer.updateColors();
            if (this.mapillaryViewer) this.mapillaryViewer.resize();
        }
    }, 150);

    /**
        * Toggles the 3D Line of Sight Mode on and off.
    */
    private toggleSightMode = () => {
        this.setState(prev => {
            const nextSight = !prev.isSightMode;
            const updates: any = {
                isSightMode: nextSight,
                sightObserver: null,
                sightTargets:[]
            };

            // Prevent clash: Automatically turn off Measure Mode if it was on
            if (nextSight && prev.isMeasureMode) {
                updates.isMeasureMode = false;
                updates.measurePoints =[];
            }
            return updates;
        }, async () => {
            // Update Measure graphics to clear the lines if we just turned it off
            if (!this.state.isMeasureMode) {
                this.updateMeasurementGraphics();
            }

            if (this.state.isSightMode) {
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        3D Sight Mode: Click to place Observer, then click Targets.
                    </span>, 4000
                );

                if (!this._sightViewModel && this.state.jimuMapView) {
                    try {
                        const [LineOfSightViewModel] = await loadArcGISJSAPIModules(["esri/widgets/LineOfSight/LineOfSightViewModel"]);
                        this._sightViewModel = new LineOfSightViewModel({
                            view: this.state.jimuMapView.view
                        });
                    } catch (e) {
                        console.warn("Could not load LineOfSightViewModel", e);
                    }
                }
            } else {
                this.clearSight();
            }
        });
    };

    /**
        * Clears the current Line of Sight analysis.
    */
    private clearSight = () => {
        this.setState({ sightObserver: null, sightTargets:[] });
        if (this._sightViewModel) {
            this._sightViewModel.clear();
        }
    };

    /**
        * Toggles the 3D Viewshed Analysis Mode on and off.
    */
    private toggleViewshedMode = async () => {
        this.setState(prev => {
            const nextMode = !prev.isViewshedMode;
            const updates: any = { isViewshedMode: nextMode };

            // Prevent clashes: Automatically turn off other tools
            if (nextMode) {
                if (prev.isMeasureMode) {
                    updates.isMeasureMode = false;
                    updates.measurePoints = [];
                    this.updateMeasurementGraphics();
                }
                if (prev.isSightMode) {
                    updates.isSightMode = false;
                    updates.sightObserver = null;
                    updates.sightTargets = [];
                    if (this._sightViewModel) this._sightViewModel.clear();
                }
            }
            return updates;
        }, () => {
            if (this.state.isViewshedMode) {
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.Viewshed size={14} /> 360° Viewshed Mode: Click on the point cloud to drop an observer.
                    </span>, 4000
                );
            } else {
                this.clearViewshed();
            }
        });
    };

    /**
        * Clears the current Viewshed analysis.
    */
    private clearViewshed = () => {
        if (this._viewshedAnalysis && this.state.jimuMapView) {
            // Cast to 'any' to bypass the TypeScript error for .analyses on MapView
            const view = this.state.jimuMapView.view as any;
            if (view.analyses) {
                view.analyses.remove(this._viewshedAnalysis);
            }
            this._viewshedAnalysis = null;
        }
    };

    /**
        * Toggles the 3D Measurement Mode on and off.
    */
    private toggleMeasureMode = () => {
        this.setState(prev => {
            const nextMeasure = !prev.isMeasureMode;
            const updates: any = { 
                isMeasureMode: nextMeasure, 
                measurePoints:[] 
            };
            
            // Prevent clash: Automatically turn off Sight Mode if it was on
            if (nextMeasure && prev.isSightMode) {
                updates.isSightMode = false;
                updates.sightObserver = null;
                updates.sightTargets =[];
                if (this._sightViewModel) {
                    this._sightViewModel.clear();
                }
                updates.isViewshedMode = false; // Turn off viewshed
                this.clearViewshed();           // Remove the red/green graphics
            }
            return updates;
        }, () => {
            this.updateMeasurementGraphics();
            if (this.state.isMeasureMode) {
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icons.Measure size={14} /> 3D Measure Mode Active: Click two points.
                    </span>, 3000
                );
            }
        });
    };

    /**
        * Clears the current measurement and removes the 3D line from the map.
    */
    private clearMeasurement = () => {
        this.setState({ measurePoints:[] }, () => {
            this.updateMeasurementGraphics();
        });
    };

    /**
        * Draws the dots, the line, and the text label on the ArcGIS 3D Map.
    */
    private async updateMeasurementGraphics() {
        if (!this.state.jimuMapView) return;
        
        // 1. Create the layer if it doesn't exist yet
        if (!this._measureLayer) {
            const [GraphicsLayer] = await loadArcGISJSAPIModules(["esri/layers/GraphicsLayer"]);
            this._measureLayer = new GraphicsLayer({
                id: "pc-measure-layer",
                elevationInfo: { mode: "relative-to-ground", offset: 0.5 } // Must match the point cloud layer perfectly
            });
            this.state.jimuMapView.view.map.add(this._measureLayer);
        }
        
        this._measureLayer.removeAll();
        const pts = this.state.measurePoints;

        // Sync with the Mapillary Viewer BEFORE the early return!
        this.updateViewerMeasurementRenderer();

        // Now if the points are cleared, it stops here safely.
        if (pts.length === 0) return;
        
        const { Graphic } = this.ArcGISModules;
        
        // 2. Draw the clicked anchor points (Cyan for start, Magenta for end)
        pts.forEach((pt, i) => {
            const g = new Graphic({
                geometry: { type: "point", longitude: pt.mapLon, latitude: pt.mapLat, z: pt.mapZ, hasZ: true, spatialReference: { wkid: 4326 } },
                symbol: {
                    type: "point-3d",
                    symbolLayers:[{
                        type: "icon",
                        resource: { primitive: "circle" },
                        material: { color: i === 0 ? [0, 255, 255, 1] :[255, 0, 255, 1] }, 
                        size: 6,
                        outline: { color: [255, 255, 255, 1], size: 1.5 }
                    }]
                } as any
            });
            this._measureLayer!.add(g);
        });
        
        // 3. Draw the Line & Calculate Distance if we have 2 points
        if (pts.length === 2) {
            const p1 = pts[0];
            const p2 = pts[1];
            
            // Draw a bright yellow line connecting them
            const line = new Graphic({
                geometry: {
                    type: "polyline",
                    paths: [[[p1.mapLon, p1.mapLat, p1.mapZ], [p2.mapLon, p2.mapLat, p2.mapZ]]],
                    hasZ: true,
                    spatialReference: { wkid: 4326 }
                },
                symbol: {
                    type: "line-3d",
                    symbolLayers:[{
                        type: "line",
                        material: { color: [255, 255, 0, 1] },
                        size: 4
                    }]
                } as any
            });
            this._measureLayer.add(line);
            
            // THE MATH: Calculate True 3D Distance using raw, unshifted coordinates
            const hDist = distanceMeters(p1.rawLat, p1.rawLon, p2.rawLat, p2.rawLon);
            const vDist = Math.abs(p2.alt - p1.alt);
            const tDist = Math.sqrt(hDist * hDist + vDist * vDist); // Pythagorean theorem
            
            // Find the midpoint to place the label
            const midLon = (p1.mapLon + p2.mapLon) / 2;
            const midLat = (p1.mapLat + p2.mapLat) / 2;
            const midZ = (p1.mapZ + p2.mapZ) / 2;
            
            // Add floating 3D Text
            const text = new Graphic({
                geometry: { type: "point", longitude: midLon, latitude: midLat, z: midZ + 0.5, hasZ: true, spatialReference: { wkid: 4326 } },
                symbol: {
                    type: "text",
                    text: `${tDist.toFixed(2)}m`,
                    color:[255, 255, 255, 1],
                    haloColor:[0, 0, 0, 0.8],
                    haloSize: 1.5,
                    font: { size: 12, weight: "bold" }
                } as any
            });
            this._measureLayer.add(text);
        }
        
        // Sync the 3D measurement to the Mapillary Panoramic Viewer!
        this.updateViewerMeasurementRenderer();
    }

    
    /**
        * Triggers the WebGL renderer to update or clear the measurement graphics inside the viewer
    */
    private updateViewerMeasurementRenderer() {
        if (!this.mapillaryViewer) return;

        const pts = this.state.measurePoints;

        // If no points, remove the renderer completely to clear the view
        if (pts.length === 0) {
            if (this._measurementRendererActive) {
                try { 
                    this.mapillaryViewer.removeCustomRenderer('measurement-line-renderer'); 
                } catch(e) {}
                this._measurementRendererActive = false;
                this._measurementViewerRenderer = null;
                this.mapillaryViewer.resize(); // Force redraw
            }
            return;
        }

        // Add renderer if missing, otherwise just update the point coordinates
        if (!this._measurementRendererActive) {
            this.addMeasurementRenderer();
        } else if (this._measurementViewerRenderer) {
            this._measurementViewerRenderer.updatePositions(pts);
            this.mapillaryViewer.resize(); // Force redraw
        }
    }

    /**
        * Builds and attaches a Custom WebGL Renderer that draws the 3D measurement line
        * and anchor points directly into the Mapillary panoramic space.
    */
    private addMeasurementRenderer() {
        if (!this.mapillaryViewer) return;

        const vsSource = `
            attribute vec3 aPosition;
            attribute vec3 aColor;
            varying vec3 vColor;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelMatrix;
            uniform float uPixelRatio;

            void main(void) {
                gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
                gl_PointSize = 16.0 * uPixelRatio; // Size of the anchor dots
                vColor = aColor;
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform float uIsPoint;
            varying vec3 vColor;

            void main(void) {
                if (uIsPoint > 0.5) {
                    // Turn gl_Point into a perfect circle
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float dist = length(coord);
                    if (dist > 0.5) discard;

                    // Draw a crisp white border around the anchor points to make them pop
                    if (dist > 0.35) {
                        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                    } else {
                        gl_FragColor = vec4(vColor, 1.0); 
                    }
                } else {
                    // Solid yellow color for the connecting line
                    gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); 
                }
            }
        `;

        const widget = this;

        const renderer: any = {
            id: 'measurement-line-renderer',
            renderPass: RenderPass.Opaque, // Draw over the image
            _gl: null,
            _program: null,
            _positionBuffer: null,
            _colorBuffer: null,
            _modelMatrix: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
            _currentReference: null,
            _vertexCount: 0,

            onAdd(viewer: any, reference: any, context: WebGLRenderingContext) {
                const gl = context;
                this._gl = gl;
                this._currentReference = reference;

                const compile = (type: number, src: string) => {
                    const s = gl.createShader(type)!;
                    gl.shaderSource(s, src);
                    gl.compileShader(s);
                    return s;
                };

                const vs = compile(gl.VERTEX_SHADER, vsSource);
                const fs = compile(gl.FRAGMENT_SHADER, fsSource);
                const program = gl.createProgram()!;
                gl.attachShader(program, vs);
                gl.attachShader(program, fs);
                gl.linkProgram(program);
                this._program = program;

                this._uViewMatrixLoc = gl.getUniformLocation(program, 'uViewMatrix');
                this._uProjectionMatrixLoc = gl.getUniformLocation(program, 'uProjectionMatrix');
                this._uModelMatrixLoc = gl.getUniformLocation(program, 'uModelMatrix');
                this._uPixelRatioLoc = gl.getUniformLocation(program, 'uPixelRatio');
                this._uIsPointLoc = gl.getUniformLocation(program, 'uIsPoint');
                this._aPositionLoc = gl.getAttribLocation(program, 'aPosition');
                this._aColorLoc = gl.getAttribLocation(program, 'aColor');

                this._positionBuffer = gl.createBuffer()!;
                this._colorBuffer = gl.createBuffer()!;
                
                // Immediately pull state and populate the buffers
                this.updatePositions(widget.state.measurePoints);
            },

            // Mapillary fires this automatically if the user moves down the street to a new image
            onReference(viewer: any, reference: any) {
                this._currentReference = reference;
                this.updatePositions(widget.state.measurePoints);
            },

            updatePositions(pts: any[]) {
                const gl = this._gl;
                if (!gl || !this._positionBuffer || !this._colorBuffer || !this._currentReference) return;

                this._vertexCount = pts.length;
                if (pts.length === 0) return;

                const positions = new Float32Array(pts.length * 3);
                const colors = new Float32Array(pts.length * 3);
                
                pts.forEach((pt, i) => {
                    // Convert Raw WGS84 back to Mapillary local ENU coordinates
                    const enu = geodeticToEnu(
                        pt.rawLon, pt.rawLat, pt.alt, 
                        this._currentReference.lng, this._currentReference.lat, this._currentReference.alt
                    );
                    positions[i*3] = enu[0];
                    positions[i*3+1] = enu[1];
                    positions[i*3+2] = enu[2];

                    if (i === 0) {
                        // Point 1: Cyan
                        colors[i*3] = 0.0; colors[i*3+1] = 1.0; colors[i*3+2] = 1.0; 
                    } else {
                        // Point 2: Magenta
                        colors[i*3] = 1.0; colors[i*3+1] = 0.0; colors[i*3+2] = 1.0; 
                    }
                });

                gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

                gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
            },

            onRemove(viewer: any, context: WebGLRenderingContext) {
                const gl = context;
                if (this._program) gl.deleteProgram(this._program);
                if (this._positionBuffer) gl.deleteBuffer(this._positionBuffer);
                if (this._colorBuffer) gl.deleteBuffer(this._colorBuffer);
                this._gl = null;
            },

            render(context: WebGLRenderingContext, viewMatrix: Float32Array, projectionMatrix: Float32Array) {
                const gl = context;
                const program = this._program;
                if (!program || !this._positionBuffer || this._vertexCount === 0) return;

                gl.useProgram(program);

                gl.uniformMatrix4fv(this._uViewMatrixLoc, false, viewMatrix);
                gl.uniformMatrix4fv(this._uProjectionMatrixLoc, false, projectionMatrix);
                gl.uniformMatrix4fv(this._uModelMatrixLoc, false, this._modelMatrix);
                gl.uniform1f(this._uPixelRatioLoc, window.devicePixelRatio || 1);

                gl.enableVertexAttribArray(this._aPositionLoc);
                gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
                gl.vertexAttribPointer(this._aPositionLoc, 3, gl.FLOAT, false, 0, 0);

                gl.enableVertexAttribArray(this._aColorLoc);
                gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
                gl.vertexAttribPointer(this._aColorLoc, 3, gl.FLOAT, false, 0, 0);

                // 1. Draw the connecting yellow line (Only if 2 points exist)
                if (this._vertexCount === 2) {
                    gl.uniform1f(this._uIsPointLoc, 0.0);
                    gl.lineWidth(4.0); 
                    gl.drawArrays(gl.LINES, 0, 2);
                }

                // 2. Draw the Cyan & Magenta anchor points on top
                gl.uniform1f(this._uIsPointLoc, 1.0);
                gl.drawArrays(gl.POINTS, 0, this._vertexCount);

                gl.disableVertexAttribArray(this._aPositionLoc);
                gl.disableVertexAttribArray(this._aColorLoc);
            }
        };

        try {
            this.mapillaryViewer.addCustomRenderer(renderer);
            this._measurementRendererActive = true;
            this._measurementViewerRenderer = renderer;
            this.mapillaryViewer.resize(); // Force redraw immediately
        } catch (e) {
            console.warn("Could not attach measurement renderer:", e);
        }
    }

    /**
        * Checks if the user has driven off the edge of the current point cloud cluster.
        * If they enter a new cluster, it automatically downloads the next 3D block seamlessly!
    */
    private checkAndLoadNextPointCloud = async (newImageId: string) => {
        // Only run if the point cloud feature is actively turned ON by the user
        if (!this.state.pointCloudVisible) return;

        // Prevent spamming if we are already in the middle of loading one
        if (this.state.pointCloudLoading) return;

        try {
            let newClusterUrl: string | undefined = undefined;

            // The API often crashes if geometry fields aren't requested alongside the cluster.
            let url = `${GRAPH_API.BASE}/${newImageId}?fields=sfm_cluster,reference_lla,computed_geometry,geometry&access_token=${this.accessToken}`;
            let resp = await fetch(url);
            
            if (!resp.ok && resp.status === 500) {
                url = `${GRAPH_API.BASE}/${newImageId}?fields=sfm_cluster,computed_geometry,geometry&access_token=${this.accessToken}`;
                resp = await fetch(url);
            }
            if (!resp.ok && resp.status === 500) {
                url = `${GRAPH_API.BASE}/${newImageId}?fields=sfm_cluster,geometry&access_token=${this.accessToken}`;
                resp = await fetch(url);
            }

            // If we successfully bypassed the bug, extract the URL
            if (resp.ok) {
                const data = await resp.json();
                newClusterUrl = data.sfm_cluster?.url;
            }

            // Scenario 1: They drove into an area with NO 3D data at all
            if (!newClusterUrl) {
                this.showToast(
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ffc107" }}>
                        <Icons.Warning size={14} /> Drove out of 3D coverage area. Point cloud hidden.
                    </span>, 3000
                );
                this.clearPointCloud(true);
                return;
            }

            // Scenario 2: They are still inside the exact same cluster! 
            // Strip the Facebook CDN security tokens before comparing
            const currentBaseUrl = this._currentPointCloudResult?.sfmClusterUrl?.split('?')[0];
            const newBaseUrl = newClusterUrl.split('?')[0];

            if (currentBaseUrl && currentBaseUrl === newBaseUrl) {
                return; // DO NOTHING. The WebGL renderer handles the perspective shift automatically.
            }

            // Scenario 3: The URL changed! They drove off the edge into a new block.
            // Pass 'true' to trigger the auto-load Toast message.
            this.loadPointCloudLayer(true); 

        } catch (err) {
            console.warn("Failed to check next point cloud cluster", err);
        }
    };

    /**
        * Extracts the currently loaded point cloud, applies the user's Nudge calibrations, 
        * and downloads it as a standard .CSV file for CAD/ArcGIS Pro import.
    */
    private downloadPointCloud = () => {
        if (!this.state.pointCloudVisible || !this._currentPointCloudResult) {
            this.showToast("No point cloud available to export.");
            return;
        }

        this.showToast(
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{
                    width: "12px", height: "12px",
                    border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                    borderRadius: "50%", animation: "spin 1s linear infinite"
                }} />
                Preparing CSV Export...
            </span>, 
            2000
        );

        // 1. Calculate the user's active Nudge calibration
        const nudgeLat = this._nudgeY / 111320;
        const nudgeLon = this._nudgeX / (111320 * Math.cos((this._cameraLat * Math.PI) / 180));

        // 2. Build the standard CSV Headers
        let csvContent = "Longitude,Latitude,Elevation,R,G,B\n";

        // 3. Loop through all points and format them
        this._currentPointCloudResult.points.forEach(p => {
            // Apply calibration offsets
            const finalLon = (p.lon + nudgeLon).toFixed(7);
            const finalLat = (p.lat + nudgeLat).toFixed(7);
            const finalZ = (p.alt + this._nudgeZ).toFixed(3);
            
            // Format colors safely (Mapillary sometimes uses 0-1 floats or 0-255 ints)
            let pr = p.r ?? 160, pg = p.g ?? 160, pb = p.b ?? 160;
            if (pr <= 1 && pg <= 1 && pb <= 1 && (pr > 0 || pg > 0 || pb > 0)) {
                pr = Math.round(pr * 255);
                pg = Math.round(pg * 255);
                pb = Math.round(pb * 255);
            }

            csvContent += `${finalLon},${finalLat},${finalZ},${pr},${pg},${pb}\n`;
        });

        // 4. Trigger the Browser Download
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `mapillary_3d_scan_${this.state.imageId}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            this.showToast(
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icons.Check size={14} color="#37d582" />
                    Point Cloud Exported!
                </span>, 3000
            );
        } catch (err) {
            console.error("Point Cloud download failed", err);
            this.showToast("Export failed.");
        }
    };

    /**
        * Updates the point cloud length radius filter.
        * Clamps the value, applies distance-based filtering, and refreshes the map + viewer.
        * @param newLength Radius in meters (0 = unlimited).
    */
    handlePointCloudLengthChange = (newLength: number) => {
        const clamped = newLength <= 0 
            ? 0 
            : Math.min(newLength, this.state.pointCloudMaxLength);

        const bearing = this.getStreetBearing();
        const rad = (bearing * Math.PI) / 180;
        const sinB = Math.sin(rad);
        const cosB = Math.cos(rad);
        
        // 1. Pull dynamic width from state
        const halfWidth = this.state.pointCloudWidth;

        this.setState({ pointCloudLength: clamped }, () => {
            if (!this.state.pointCloudVisible || !this._currentPointCloudResult) return;

            // 1. Refresh points (WebGL Map)
            this.renderPointCloudMapLayer();

            // 2. Refresh rings (GraphicsLayer)
            this.drawConcentricRings(
                clamped <= 0
                    ? this.state.pointCloudActualLength
                    : clamped
            );

            // 3. Refresh viewer renderer (WebGL Viewer)
            if (this._pointCloudViewerRenderer) {
                const allPoints = this._currentPointCloudResult.points;
                
                // 2. Filter logic rewritten so Width ALWAYS applies, even if Radius is FULL
                const filteredPoints = allPoints.filter(p => {
                    const dy = (p.lat - this._cameraLat) * 111320;
                    const dx = (p.lon - this._cameraLon) * 111320 * Math.cos((this._cameraLat * Math.PI) / 180);
                    const forward = dx * sinB + dy * cosB;
                    const right = dx * cosB - dy * sinB;
                    
                    // Always block parallel streets using the Corridor Width
                    if (halfWidth > 0 && Math.abs(right) > halfWidth) return false;
                    
                    // If radius is not FULL (0), constrain Forward and Backward symmetrically
                    if (clamped > 0) {
                        if (forward < -clamped || forward > clamped) return false;
                    }
                    
                    return true;
                });

                this._pointCloudViewerRenderer.updatePoints(filteredPoints);
                if (this.mapillaryViewer) this.mapillaryViewer.resize();
            }
        });
    };
    
    private handlePointCloudWidthChange = (newWidth: number) => {
        const clamped = newWidth <= 0 ? 0 : Math.max(5, Math.min(newWidth, POINT_CLOUD_WIDTH_MAX));

        this.setState({ pointCloudWidth: clamped }, () => {
            if (!this.state.pointCloudVisible || !this._currentPointCloudResult) return;

            // 1. Refresh points (WebGL Map)
            this.renderPointCloudMapLayer();

            // 2. Refresh rings (GraphicsLayer)
            this.drawConcentricRings(
                this.state.pointCloudLength <= 0
                    ? this.state.pointCloudActualLength
                    : this.state.pointCloudLength
            );

            // 3. Refresh viewer renderer (WebGL Viewer)
            if (this._pointCloudViewerRenderer) {
                const allPoints = this._currentPointCloudResult.points;
                const bearing = this.getStreetBearing();
                const rad = (bearing * Math.PI) / 180;
                const sinB = Math.sin(rad);
                const cosB = Math.cos(rad);
                const currentLength = this.state.pointCloudLength;
                const halfWidth = clamped;

                const filteredPoints = allPoints.filter(p => {
                    const dy = (p.lat - this._cameraLat) * 111320;
                    const dx = (p.lon - this._cameraLon) * 111320 * Math.cos((this._cameraLat * Math.PI) / 180);
                    const forward = dx * sinB + dy * cosB;
                    const right = dx * cosB - dy * sinB;
                    
                    // Always apply width filter
                    if (halfWidth > 0 && Math.abs(right) > halfWidth) return false;
                    
                    // Apply length radius filter if not FULL (0)
                    if (currentLength  > 0) {
                        if (forward < -currentLength  || forward > currentLength) return false;
                    }
                    return true;
                });

                this._pointCloudViewerRenderer.updatePoints(filteredPoints);
                if (this.mapillaryViewer) this.mapillaryViewer.resize();
            }
        });
    };

    private async ensureGridLayer(): Promise<boolean> {
        if (this._gridLayerReady) {
            await this._gridLayerReady;
            return !!this._gridLayer;
        }

        this._gridLayerReady = (async () => {
            if (!this._gridLayer) {
                const [GraphicsLayer] = await loadArcGISJSAPIModules(["esri/layers/GraphicsLayer"]);
                if (!this._gridLayer) {
                    this._gridLayer = new GraphicsLayer({
                        id: "pc-grid-layer",
                        elevationInfo: { mode: "relative-to-ground", offset: 0.5 }
                    });
                }
            }
            try {
                const map = this.state.jimuMapView?.view.map;
                if (map && !map.layers.includes(this._gridLayer)) {
                    map.add(this._gridLayer);
                }
            } catch (e) {
                // View mid-teardown, ignore
            }
        })();

        await this._gridLayerReady;
        this._gridLayerReady = null;
        return !!this._gridLayer;
    }
    
    /**
        * Draws concentric distance rings around the camera to provide spatial scale.
    */
    private async drawConcentricRings(currentRadius: number) {
        if (!this.state.jimuMapView || !this.ArcGISModules) return;

        const myGeneration = ++this._ringGeneration;
        const layerReady = await this.ensureGridLayer();
        if (!layerReady || myGeneration !== this._ringGeneration) return;
        
        this._gridLayer.removeAll();

        const { Graphic } = this.ArcGISModules;

        const nudgeLat = this._nudgeY / 111320;
        const nudgeLon = this._nudgeX / (111320 * Math.cos((this._cameraLat * Math.PI) / 180));
        const centerLon = this._cameraLon + nudgeLon;
        const centerLat = this._cameraLat + nudgeLat;
        const mPerDegLat = 111320;
        const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180);

        const halfWidth = this.state.pointCloudWidth;

        const effectiveLength = currentRadius > 0 ? currentRadius : (this.state.pointCloudActualLength ?? 100);
        const effectiveMax = Math.max(effectiveLength, halfWidth > 0 ? halfWidth : 0);

        // Base step on the LARGER dimension so long corridors don't get flooded with rings.
        // Then clamp to a minimum of 10m so we never draw rings every 5m.
        const rawStep = Math.max(effectiveLength, halfWidth > 0 ? halfWidth : effectiveLength) / 6;
        const niceSteps = [10, 25, 50, 100, 200, 500];
        const step = Math.max(
            niceSteps.find(s => s >= rawStep) ?? niceSteps[niceSteps.length - 1],
            10
        );

        const allIntervals: number[] = [];
        for (let r = step; r < effectiveMax; r += step) allIntervals.push(Math.round(r));
        if (currentRadius > 0) allIntervals.push(currentRadius);
        if (halfWidth > 0 && halfWidth !== currentRadius) allIntervals.push(halfWidth);

        allIntervals.forEach(radius => {
            const isLengthBoundary = currentRadius > 0 && radius === currentRadius;
            const isWidthBoundary  = halfWidth > 0 && radius === halfWidth;
            // Skip intermediate rings beyond length, but never skip boundary rings
            if (!isLengthBoundary && !isWidthBoundary && currentRadius > 0 && radius > currentRadius) return;

            const isBoundary = isLengthBoundary || isWidthBoundary;
            const bearing = this.getStreetBearing();
            const radB = (bearing * Math.PI) / 180;
            const sinB = Math.sin(radB);
            const cosB = Math.cos(radB);

            const ringCoords: number[][] = [];

            // Draw as a true ellipse scaled to the corridor proportions.
            // Each ring's semi-axis = radius scaled by how far the corridor
            // extends in that direction, capped at the corridor boundary.
            const semiForward = currentRadius > 0 ? Math.min(radius, currentRadius) : effectiveLength;
            const semiRight   = halfWidth > 0     ? Math.min(radius, halfWidth)     : radius;

            for (let i = 0; i <= 360; i += 3) {
                const rad = (i * Math.PI) / 180;
                const forward = semiForward * Math.cos(rad);
                const right   = semiRight   * Math.sin(rad);

                // Project back to lat/lon
                const finalDx = right * cosB + forward * sinB;
                const finalDy = -right * sinB + forward * cosB;

                ringCoords.push([
                    centerLon + (finalDx / mPerDegLon),
                    centerLat + (finalDy / mPerDegLat),
                    0
                ]);
            }

            // Draw as a closed loop (connecting end back to start)
            const ringGraphic = new Graphic({
                geometry: {
                    type: "polyline",
                    paths: [[...ringCoords, ringCoords[0]]],
                    hasZ: true,
                    spatialReference: { wkid: 4326 }
                },
                symbol: {
                    type: "simple-line",
                    color: isLengthBoundary ? [255, 165, 0, 0.9]    // orange for length
                        : isWidthBoundary  ? [255, 215, 0, 0.9]    // gold for width
                        : [0, 255, 255, 0.4],                       // cyan for intermediate
                    width: (isLengthBoundary || isWidthBoundary) ? 3 : 1.5,
                    style: "solid"
                } as any
            });
            this._gridLayer!.add(ringGraphic);

            // Place labels at the most Forward, Backward, Left and Right points
            let bestFrontPt: number[] = ringCoords[0];
            let bestBackPt:  number[] = ringCoords[0];
            let bestRightPt: number[] = ringCoords[0];
            let bestLeftPt:  number[] = ringCoords[0];
            let maxFwd = -Infinity, minFwd = Infinity;
            let maxRgt = -Infinity, minRgt = Infinity;

            ringCoords.forEach((c: number[]) => {
                const dy = (c[1] - centerLat) * 111320;
                const dx = (c[0] - centerLon) * 111320 * Math.cos((centerLat * Math.PI) / 180);
                const fwd = dx * sinB + dy * cosB;
                const rgt = dx * cosB - dy * sinB;

                if (fwd > maxFwd) { maxFwd = fwd; bestFrontPt = c; }
                if (fwd < minFwd) { minFwd = fwd; bestBackPt  = c; }
                if (rgt > maxRgt) { maxRgt = rgt; bestRightPt = c; }
                if (rgt < minRgt) { minRgt = rgt; bestLeftPt  = c; }
            });

            // Draw labels: length axis shows "Xm", width axis shows "Xm" in a different color
            const drawLabel = (pt: number[], text: string, isWidth: boolean) => {
                const label = new Graphic({
                    geometry: { type: "point", longitude: pt[0], latitude: pt[1], z: 0, hasZ: true, spatialReference: { wkid: 4326 } },
                    symbol: {
                        type: "text",
                        text,
                        color: isBoundary
                            ? (isWidth ? [255, 200, 0, 1] : [255, 255, 255, 1])
                            : (isWidth ? [255, 200, 0, 0.85] : [0, 255, 255, 0.9]),
                        haloColor: [0, 0, 0, 0.8], haloSize: 1.5, font: { size: 10, weight: "bold" }
                    } as any
                });
                this._gridLayer!.add(label);
            };

            const lengthLabel = `${Math.round(semiForward)}m`;
            const widthLabel  = `${Math.round(semiRight)}m`;

            // Length axis labels (front + back): cyan / white
            if (maxFwd - minFwd > 10) {
                drawLabel(bestFrontPt, lengthLabel, false);
                drawLabel(bestBackPt,  lengthLabel, false);
            } else {
                drawLabel(bestFrontPt, lengthLabel, false);
            }

            // Width axis labels (left + right), yellow/amber
            // Only show if the ellipse is meaningfully wider than it is tall
            if (maxRgt - minRgt > 10 && Math.abs(semiRight - semiForward) > 5) {
                drawLabel(bestRightPt, widthLabel, true);
                drawLabel(bestLeftPt,  widthLabel, true);
            }
        });
    }

    /**
        * Calculates the direction of the street based on the sequence path.
        * Looks 15 meters ahead to bypass micro-GPS jitter and keep the corridor perfectly straight.
    */
    private getStreetBearing(): number {
        const { sequenceImages, imageId } = this.state;
        if (!sequenceImages || !imageId) return this._lastBearing || 0;

        const currentIdx = sequenceImages.findIndex(img => String(img.id) === String(imageId));
        if (currentIdx === -1) return this._lastBearing || 0;

        const currentImg = sequenceImages[currentIdx];
        
        // 1. Look ahead at least 15 meters to bypass GPS jitter
        for (let i = currentIdx + 1; i < sequenceImages.length; i++) {
            const img = sequenceImages[i];
            if (distanceMeters(currentImg.lat, currentImg.lon, img.lat, img.lon) >= 15) {
                return calculateBearing(currentImg.lat, currentImg.lon, img.lat, img.lon);
            }
        }
        
        // 2. If at the end, look behind at least 15 meters
        for (let i = currentIdx - 1; i >= 0; i--) {
            const img = sequenceImages[i];
            if (distanceMeters(img.lat, img.lon, currentImg.lat, currentImg.lon) >= 15) {
                return calculateBearing(img.lat, img.lon, currentImg.lat, currentImg.lon);
            }
        }

        // 3. Fallback to immediate neighbors
        if (currentIdx < sequenceImages.length - 1) {
            return calculateBearing(currentImg.lat, currentImg.lon, sequenceImages[currentIdx + 1].lat, sequenceImages[currentIdx + 1].lon);
        } else if (currentIdx > 0) {
            return calculateBearing(sequenceImages[currentIdx - 1].lat, sequenceImages[currentIdx - 1].lon, currentImg.lat, currentImg.lon);
        }

        return this._lastBearing || 0;
    }


    // #endregion POINT CLOUD

    // #endregion TURBO MODE

    // Initial setup lifecycle
    // - Loads ArcGIS API modules dynamically (Graphic, Point, etc.),
    // - restores cache, loads Mapillary JS/CSS via CDN,
    // - and attaches resize/fullscreen event listeners.
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

            // 1. Read presets FIRST before creating any layer
            const presetStartDate   = this.props.config.turboDefaultStartDate  || undefined;
            const presetEndDate     = this.props.config.turboDefaultEndDate    || undefined;
            const presetIsPano      = this.props.config.turboDefaultIsPano  ?? undefined;
            const presetColorByDate = this.props.config.turboDefaultColorByDate ?? false;

            // 2. Resolve Default Creator ID if configured
            let defaultFilterId: number | undefined = undefined;
            if (this.props.config.turboCreator) {
                defaultFilterId = await this.getUserIdFromUsername(this.props.config.turboCreator);
                if (defaultFilterId) this.log(`Initializing Always-On layer for user ID: ${defaultFilterId}`);
            }

            // 3. Initialize layer with presets baked in from the start,
            //    so when onActiveViewChange adds it to the map it's already filtered
            this.initMapillaryLayer(
                defaultFilterId,
                presetStartDate,
                presetEndDate,
                presetIsPano,
                false
            );
            this.initMapillaryTrafficSignsLayer();
            this.initMapillaryObjectsLayer();

            // 4. Apply preset state, no debouncedTurboFilter needed since
            //    the layer was already created with correct filters above
            this.setState({
                turboFilterStartDate: presetStartDate || "",
                turboFilterEndDate:   presetEndDate   || "",
                turboFilterIsPano:    presetIsPano,
                turboColorByDate:     presetColorByDate,
            });

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
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', this.handleFullscreenChange);
        window.addEventListener('resize', this.handleWindowResize);

        // Add keyboard listener for W, A, S, D Point Cloud Nudging
        window.addEventListener('keydown', this.handleNudgeKeyDown);
        window.addEventListener('keyup', this.handleNudgeKeyUp);

        this.tooltipDiv = document.createElement("div");
        Object.assign(this.tooltipDiv.style, {
            position: "fixed",
            pointerEvents: "none",
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
        styleSheet.innerText = overrideStyles;
        document.head.appendChild(styleSheet);

        if (this.props.config.turboCreator) {
            this.setState({ turboFilterUsername: this.props.config.turboCreator });
        }

        // Check if Turbo Mode Only is enabled in config
        if (this.props.config.turboModeOnly) {
            this.setState({ turboModeActive: true });
        }

        // Check if we need to add the "Always On" layer now
        // If the MapView loaded BEFORE these modules, onActiveViewChange skipped the add.
        if (this.props.config.coverageLayerAlwaysOn && this.state.jimuMapView) {
            const view = this.state.jimuMapView.view;
            const existingLayer = view.map.findLayerById(LAYER_IDS.COVERAGE_VT);
            
            if (!existingLayer && this.mapillaryVTLayer) {
                view.map.add(this.mapillaryVTLayer);
                this.setState({ tilesActive: true });
                this.log("Coverage layer added from componentDidMount (deferred load)");
            }
        }
    }
	
	componentDidUpdate(prevProps: AllWidgetProps<any>, prevState: State) {
        
        // 1. Handle Resize & Re-attach Observer
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

        // 2. Handle State Transitions (Minimize/Close)
        
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

        // 3. Handle Reopening (Seamless Filter Loading)
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
                    turboFilterUsername:  this.props.config.turboCreator             || "",
                    turboFilterStartDate: this.props.config.turboDefaultStartDate    || "",
                    turboFilterEndDate:   this.props.config.turboDefaultEndDate      || "",
                    turboFilterIsPano:    this.props.config.turboDefaultIsPano    ?? undefined,
                    turboColorByDate:     this.props.config.turboDefaultColorByDate  ?? false,
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
                const reopenInit = async () => {
                    let id: number | undefined;
                    if (defaultUser) {
                        try { id = (await this.getUserIdFromUsername(defaultUser)) || undefined; }
                        catch { id = undefined; }
                    }
                    this.initMapillaryLayer(
                        id,
                        this.state.turboFilterStartDate || undefined,
                        this.state.turboFilterEndDate   || undefined,
                        this.state.turboFilterIsPano,
                        this.state.qualityViewActive
                    );
                    proceedWithWidgetInitialization();
                };
                reopenInit();
            } else {
                proceedWithWidgetInitialization();
            }
        }

        // 4. Handle Config Changes (Standard Logic)

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
        // Turbo Preset: Start Date
        if (prevProps.config.turboDefaultStartDate !== this.props.config.turboDefaultStartDate) {
            this.setState({ turboFilterStartDate: this.props.config.turboDefaultStartDate || "" }, () => {
                this.debouncedTurboFilter(); // always rebuild green layer; also reloads turbo points if active
            });
        }

        // Turbo Preset: End Date
        if (prevProps.config.turboDefaultEndDate !== this.props.config.turboDefaultEndDate) {
            this.setState({ turboFilterEndDate: this.props.config.turboDefaultEndDate || "" }, () => {
                this.debouncedTurboFilter();
            });
        }

        // Turbo Preset: Is Pano
        if (prevProps.config.turboDefaultIsPano !== this.props.config.turboDefaultIsPano) {
            this.setState({ turboFilterIsPano: this.props.config.turboDefaultIsPano ?? undefined }, () => {
                this.debouncedTurboFilter();
            });
        }

        // Turbo Preset: Color by Date
        if (prevProps.config.turboDefaultColorByDate !== this.props.config.turboDefaultColorByDate) {
            this.setState({ turboColorByDate: this.props.config.turboDefaultColorByDate ?? false }, () => {
                this.debouncedTurboFilter();
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
                     const existingLayer = this.state.jimuMapView.view.map.findLayerById(LAYER_IDS.COVERAGE_VT);
                     if (!existingLayer) {
                         this.state.jimuMapView.view.map.add(this.mapillaryVTLayer);
                     }
                }
            } else {
                this.setState({ tilesActive: false });
                if (this.state.jimuMapView) {
                    const existingLayer = this.state.jimuMapView.view.map.findLayerById(LAYER_IDS.COVERAGE_VT);
                    if (existingLayer) {
                        this.state.jimuMapView.view.map.remove(existingLayer);
                    }
                }
            }
        }

        /**
            * Responds to the `hideCoverageCircles` config toggle by hot-swapping
            * the Mapillary Vector Tile layer with a freshly initialized instance
            * that reflects the new circle visibility setting.
            * If a creator filter is configured, resolves the creator ID before
            * reinitializing to preserve the existing user filter.
            * After the swap, reorders Turbo coverage, objects, and traffic sign
            * layers to ensure they remain on top of the base coverage layer.
        */
        if (prevProps.config.hideCoverageCircles !== this.props.config.hideCoverageCircles) {
            const reInitLayer = async () => {
                let targetId: number | undefined = undefined;
                if (this.props.config.turboCreator) {
                    targetId = (await this.getUserIdFromUsername(this.props.config.turboCreator)) || undefined;
                }
                
                // Re-create the layer with the new style
                this.initMapillaryLayer(
                    targetId,
                    this.state.turboFilterStartDate || undefined,
                    this.state.turboFilterEndDate   || undefined,
                    this.state.turboFilterIsPano,
                    this.state.qualityViewActive
                );
                
                // If it's currently showing on the map, swap it out instantly
                if (this.state.tilesActive && this.state.jimuMapView) {
                    const view = this.state.jimuMapView.view;
                    const existingLayer = view.map.findLayerById(LAYER_IDS.COVERAGE_VT);
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

        // 5. Handle Dynamic Component Toggling (Bearing/Zoom)
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

    // Cleanup lifecycle
    // - Ensures all intervals, observers, and event listeners are removed
    // - to prevent memory leaks when widget is closed or reloaded.
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

        window.removeEventListener('keydown', this.handleNudgeKeyDown);
        window.removeEventListener('keyup', this.handleNudgeKeyUp);

        // Clear warning timeout
        if (this._zoomWarningTimeout) {
            clearTimeout(this._zoomWarningTimeout);
            this._zoomWarningTimeout = null;
        }
	}

    /*
        * Handles map view changes and sets up click/hover event handlers.
        * Manages interactions for both normal and turbo mode, including object/traffic sign layers.
    */
     /*
        * Handles map view changes and sets up click/hover event handlers.
        * Manages interactions for both normal and turbo mode, including object/traffic sign layers.
    */
    onActiveViewChange(jmv: JimuMapView) {
        if (!jmv) return;

        this.log("Active MapView set - Attaching Handlers");
        this.setState({ jimuMapView: jmv });

        this.clearGreenPulse();
        this.clearTurboHover();

        if (this._sequenceHighlightLayer) {
            try {
                const map = jmv.view.map;
                if (map && map.layers.includes(this._sequenceHighlightLayer)) {
                    map.remove(this._sequenceHighlightLayer);
                }
                this._sequenceHighlightLayer.destroy();
            } catch (e) {}
            this._sequenceHighlightLayer = null;
        }
        this._hoveredSequenceId = null;

        // Use a callback to restore graphics AFTER state is set
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

        // Debounce zoom URL updates; fires 600ms after the user stops zooming,
        // same cadence as the bearing URL update.
        this._debouncedZoomUrlUpdate = debounceUtil(() => {
            if (this._isFlyInActive) return;
            const { imageId, sequenceImages } = this.state;
            if (!imageId) return;
            const img = sequenceImages.find(s => s.id === imageId);
            if (img) this.updateUrlWithCurrentImage(imageId, img.lat, img.lon);
        }, 600);

        this.zoomDisplayHandle = jmv.view.watch("zoom", (newZoom: number) => {
            this.setState({ currentZoom: newZoom });
            this._debouncedZoomUrlUpdate();
        });
        
        if (this.mapClickHandle) this.mapClickHandle.remove();
        if (this.pointerMoveHandle) this.pointerMoveHandle.remove();

        // Force Add Coverage Layer if Config is ON or manually enabled
        if (this.props.config.coverageLayerAlwaysOn || this.state.tilesActive) {
            this.setState({ tilesActive: true });
            if (this.ArcGISModules && this.mapillaryVTLayer) {
                const existingLayer = jmv.view.map.findLayerById(LAYER_IDS.COVERAGE_VT);
                if (!existingLayer) {
                    jmv.view.map.add(this.mapillaryVTLayer);
                }
            }
        }

        // Restore Traffic Signs Layer and re-attach its watchers to the new map view
        if (this.state.trafficSignsActive) {
            if (this.mapillaryTrafficSignsLayer) {
                const existing = jmv.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_VT);
                if (!existing) jmv.view.map.add(this.mapillaryTrafficSignsLayer);
            }

            if (this.trafficSignsStationaryHandle) this.trafficSignsStationaryHandle.remove();
            if (this.trafficSignsZoomHandle) this.trafficSignsZoomHandle.remove();

            let trafficSignsEverLoaded = false;
            const debouncedRefreshTS = debounceUtil(async () => {
                await this.loadMapillaryTrafficSignsFromTilesBBox(true);
            }, 100);

            this.trafficSignsStationaryHandle = jmv.view.watch("stationary", (isStationary) => {
                if (!isStationary) return;
                if (this.state.jimuMapView && this.state.jimuMapView.view.zoom < 16) return;
                if (this._cancelTrafficSignsFetch) return;
                if (!trafficSignsEverLoaded) {
                    trafficSignsEverLoaded = true;
                    this.loadMapillaryTrafficSignsFromTilesBBox(true);
                } else {
                    debouncedRefreshTS();
                }
            });

            this.trafficSignsZoomHandle = jmv.view.watch("zoom", async (currentZoom) => {
                if (currentZoom < 13) {
                    this.showZoomWarning("Zoom in closer (≥ 13) to see traffic sign coverage.");
                    this._cancelTrafficSignsFetch = true;
                    if (this.state.jimuMapView) {
                        const specificLayer = this.state.jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_FL);
                        if (specificLayer) this.state.jimuMapView.view.map.remove(specificLayer);
                    }
                } else if (currentZoom < 16) {
                    this.showZoomWarning("Zoom in closer (≥ 16) to view clickable traffic sign features.");
                    this._cancelTrafficSignsFetch = true;
                    if (this.state.jimuMapView) {
                        const specificLayer = this.state.jimuMapView.view.map.findLayerById(LAYER_IDS.TRAFFIC_SIGNS_FL);
                        if (specificLayer) this.state.jimuMapView.view.map.remove(specificLayer);
                    }
                    if (this._fullTrafficSignsOptions.length > 0) {
                        this.setState({ trafficSignsOptions: this._fullTrafficSignsOptions });
                    }
                } else {
                    this._cancelTrafficSignsFetch = false;
                    this.clearZoomWarning();
                }
            });

            // Wait for view to be completely ready before fetching!
            jmv.view.when(() => {
                if (jmv.view.zoom >= ZOOM.FEATURES_INTERACTIVE) {
                    this._cancelTrafficSignsFetch = false;
                    trafficSignsEverLoaded = true;
                    this.loadMapillaryTrafficSignsFromTilesBBox(true);
                }
            });
        }

        // Restore Objects Layer and re-attach its watchers to the new map view
        if (this.state.objectsActive) {
            if (this.mapillaryObjectsLayer) {
                const existing = jmv.view.map.findLayerById(LAYER_IDS.OBJECTS_VT);
                if (!existing) jmv.view.map.add(this.mapillaryObjectsLayer);
            }

            if (this.objectsStationaryHandle) this.objectsStationaryHandle.remove();
            if (this.objectsZoomHandle) this.objectsZoomHandle.remove();

            let objectsEverLoaded = false;
            const debouncedRefreshObj = debounceUtil(async () => {
                await this.loadMapillaryObjectsFromTilesBBox(true);
            }, 100);

            this.objectsStationaryHandle = jmv.view.watch("stationary", (isStationary) => {
                if (!isStationary) return;
                if (this.state.jimuMapView && this.state.jimuMapView.view.zoom < 16) return;
                if (this._cancelObjectsFetch) return;
                if (!objectsEverLoaded) {
                    objectsEverLoaded = true;
                    this.loadMapillaryObjectsFromTilesBBox(true);
                } else {
                    debouncedRefreshObj();
                }
            });

            this.objectsZoomHandle = jmv.view.watch("zoom", async (currentZoom) => {
                if (currentZoom < 13) {
                    this.showZoomWarning("Zoom in closer (≥ 13) to see object coverage.");
                    this._cancelObjectsFetch = true;
                    if (this.state.jimuMapView) {
                        const specificLayer = this.state.jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_FL);
                        if (specificLayer) this.state.jimuMapView.view.map.remove(specificLayer);
                    }
                } else if (currentZoom < 16) {
                    this.showZoomWarning("Zoom in closer (≥ 16) to view clickable object features.");
                    this._cancelObjectsFetch = true;
                    if (this.state.jimuMapView) {
                        const specificLayer = this.state.jimuMapView.view.map.findLayerById(LAYER_IDS.OBJECTS_FL);
                        if (specificLayer) this.state.jimuMapView.view.map.remove(specificLayer);
                    }
                    if (this._fullObjectsOptions.length > 0) {
                        this.setState({ objectsOptions: this._fullObjectsOptions });
                    }
                } else {
                    this._cancelObjectsFetch = false;
                    this.clearZoomWarning();
                }
            });

            // Wait for view to be completely ready before fetching!
            jmv.view.when(() => {
                if (jmv.view.zoom >= ZOOM.FEATURES_INTERACTIVE) {
                    this._cancelObjectsFetch = false;
                    objectsEverLoaded = true;
                    this.loadMapillaryObjectsFromTilesBBox(true);
                }
            });
        }

        // Restore manual Turbo Mode or Auto-Initialize if Config is ON
        if (this.props.config.turboModeOnly || this.state.turboModeActive) {
            this.setState({ turboModeActive: true });

            // Force a complete rebuild of the Client-Side FeatureLayer. 
            // WebGL buffers from the 2D map often fail to render in the 3D scene if reused.
            this._loadedTurboFiltersKey = ""; 
            this._loadedTileKeys.clear();

            if (this.turboStationaryHandle) this.turboStationaryHandle.remove();
            
            this.turboStationaryHandle = jmv.view.watch(
                "stationary",
                debounceUtil(async (isStationary) => {
                    if (isStationary && this.state.turboModeActive) {
                        if (this.state.jimuMapView && this.state.jimuMapView.view.zoom < ZOOM.TURBO_MIN) return;
                        const stateFilter = this.state.turboFilterUsername.trim();
                        const configFilter = this.props.config.turboCreator || "";
                        const effectiveFilter = stateFilter || configFilter;

                        if (effectiveFilter) {
                            await this.enableTurboCoverageLayer(effectiveFilter);
                        } else {
                            await this.enableTurboCoverageLayer();
                        }
                    }
                }, TIMING.TURBO_DEBOUNCE_MS)
            );

            if (this.turboZoomHandle) this.turboZoomHandle.remove();
            this.turboZoomHandle = jmv.view.watch("zoom", (z) => {
                const minTurboZoom = ZOOM.TURBO_MIN;
                if (this.state.turboModeActive) {
                    if (z < minTurboZoom) {
                        this.disableTurboCoverageLayer();
                        this.showZoomWarning("Turbo Mode active: Zoom in closer (≥ 16) to interact with imagery data.", 0);
                    } else {
                        this.clearZoomWarning();
                    }
                }
            });

            // Wait for view to be completely ready before checking zoom and fetching!
            jmv.view.when(() => {
                if (jmv.view.zoom >= ZOOM.TURBO_MIN) {
                    const effectiveFilter = this.state.turboFilterUsername.trim() || this.props.config.turboCreator || "";
                    this.enableTurboCoverageLayer(effectiveFilter);
                    this.clearZoomWarning();
                } else {
                    this.showZoomWarning(`Your current zoom level is ${jmv.view.zoom.toFixed(1)}. Turbo Mode is active. Zoom in closer (≥ 16) to interact with imagery data.`, 0);
                }
            });
        }

        // Push the interactive FeatureLayers (dots/icons) back to the absolute top once the view is ready
        jmv.view.when(() => {
            const currentLayers = jmv.view.map.layers;[this.turboCoverageLayer, this.mapillaryObjectsFeatureLayer, this.mapillaryTrafficSignsFeatureLayer].forEach(fl => {
                if (fl && currentLayers.includes(fl)) {
                    jmv.view.map.reorder(fl, currentLayers.length - 1);
                }
            });
        });

        // If the user swipes the mouse quickly across the map, this prevents lagging and too many hover fetchs 
        let hoverHitTestTimeout: any = null;

        // Hide turbo hover tooltip when mouse leaves the map container
        const mapContainer = jmv.view.container as HTMLElement;
        if (mapContainer) {
            mapContainer.addEventListener("mouseleave", () => {
                if (hoverHitTestTimeout) {
                    clearTimeout(hoverHitTestTimeout);
                    hoverHitTestTimeout = null;
                }
                // Clear tooltip
                if (this.tooltipDiv) {
                    this.tooltipDiv.style.display = "none";
                }
                // Clear hover animation
                this.clearTurboHover();

                this.highlightSequenceOnVTL(null);
                // Clear pending tooltip fetch
                if (this._hoverTimeout) {
                    clearTimeout(this._hoverTimeout);
                    this._hoverTimeout = null;
                }
                this._currentHoveredFeatureId = null;
            });
        }

        // CLICK HANDLER
        this.mapClickHandle = jmv.view.on("click", async (evt) => {
            if (this.props.state === 'CLOSED') return;

            const point = jmv.view.toMap(evt) as __esri.Point;
            this.setState({ clickLon: point.longitude, clickLat: point.latitude });

            try {
                const response = await jmv.view.hitTest(evt);

                const pointCloudHit = response.results.find((r: any) => {
                    const layer = r.layer || (r.graphic && r.graphic.layer);
                    return layer && layer.id === "point-cloud-layer";
                });

                if (pointCloudHit && (pointCloudHit as any).graphic) {
                    const attrs = (pointCloudHit as any).graphic.attributes || {};
                    const geom = (pointCloudHit as any).graphic.geometry;
                    
                    // Safely handle ArcGIS lowercasing field names randomly
                    const rawOriginal = attrs.originalIndex ?? attrs.originalindex;
                    const rawPointIdx = attrs.pointIndex ?? attrs.pointindex;
                    const rawObjectId = attrs.ObjectID ?? attrs.objectid;

                    // Grab filtered index (For Viewer Highlighting)
                    const idx = rawPointIdx !== undefined ? rawPointIdx : ((rawObjectId || 1) - 1);
                    
                    // Grab original index (For raw data lookup)
                    const originalIdx = rawOriginal !== undefined ? rawOriginal : idx;
                    
                    if (this.state.isMeasureMode) {
                        const p = this._currentPointCloudResult?.points[originalIdx];
                        if (p) {
                            const newPt = {
                                mapLon: geom.longitude,
                                mapLat: geom.latitude,
                                mapZ: geom.z,
                                rawLon: (p as any).rawLon || p.lon,
                                rawLat: (p as any).rawLat || p.lat,
                                alt: p.alt
                            };
                            
                            let newPoints =[...this.state.measurePoints, newPt];
                            if (newPoints.length > 2) {
                                newPoints =[newPt]; 
                            }
                            
                            this.setState({ measurePoints: newPoints }, () => {
                                this.updateMeasurementGraphics();
                            });
                        }
                        return; // Stop here so it doesn't trigger anything else!
                    }

                    // SIGHT MODE
                    if (this.state.isSightMode && this._sightViewModel) {
                        if (!this.state.sightObserver) {
                            this.setState({ sightObserver: geom });
                            this._sightViewModel.observer = geom;
                        } else {
                            this.setState(prev => ({ sightTargets: [...prev.sightTargets, geom] }));
                            this._sightViewModel.targets.add({ location: geom });
                        }
                        return;
                    }

                    // VIEWSHED MODE LOGIC
                    if (this.state.isViewshedMode && this.state.jimuMapView) {
                        this.clearViewshed(); 
                        loadArcGISJSAPIModules([
                            "esri/analysis/ViewshedAnalysis",
                            "esri/analysis/Viewshed",
                            "esri/geometry/Point"
                        ]).then(([ViewshedAnalysis, Viewshed, Point]) => {
                            const viewshed = new Viewshed({
                                observer: new Point({
                                    longitude: geom.longitude,
                                    latitude: geom.latitude,
                                    z: geom.z + 1.5,
                                    spatialReference: { wkid: 4326 }
                                }),
                                farDistance: 150,
                                horizontalFieldOfView: 360,
                                verticalFieldOfView: 90,
                                heading: 0,
                                tilt: 0
                            });

                            this._viewshedAnalysis = new ViewshedAnalysis({
                                viewsheds: [viewshed]
                            });

                            const view = this.state.jimuMapView!.view as any; 
                            if (view.type === "3d" && view.analyses) {
                                view.analyses.add(this._viewshedAnalysis);
                            }
                        });
                        return; 
                    }

                    if (this._pointCloudViewerRenderer) {
                        this._pointCloudViewerRenderer.setHighlight(idx); // Use filtered index for WebGL
                        if (this.mapillaryViewer) {
                            this.mapillaryViewer.resize(); 
                            this.mapillaryViewer.getCenter().then((c: number[]) => {
                                this.mapillaryViewer.setCenter([c[0], c[1]]);
                            }).catch(() => {});
                        }
                    }
                    return; 

                } else {
                    if (this._pointCloudViewerRenderer) {
                        this._pointCloudViewerRenderer.setHighlight(-1);
                        if (this.mapillaryViewer) this.mapillaryViewer.resize();
                    }
                }
                
                // 1. Blue Markers
                const seqPointHit = response.results.find((r: any) => 
                    r.graphic && 
                    (
                        (r.graphic as any).__isSequenceOverlay || 
                        (r.graphic as any).__isActiveSequencePoint
                    ) &&
                    r.graphic.geometry?.type === "point"
                );

                if (seqPointHit) {
                    const seqId = (seqPointHit as any).graphic.attributes?.sequenceId || this.state.selectedSequenceId;
                    if (!seqId) return;
                    
                    let currentSeqData = this.state.sequenceImages;
                    if (this.state.selectedSequenceId !== seqId || !currentSeqData.length) {
                        currentSeqData = await this.getSequenceWithCoords(seqId, this.accessToken);
                    }

                    if (currentSeqData.length) {
                        const closestImg = currentSeqData.reduce((closest, img) => {
                            const dist = distanceMeters(img.lat, img.lon, point.latitude, point.longitude);
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
                const featureHit = response.results.find((r: any) => {
                    const layer = r.layer || (r.graphic && r.graphic.layer);
                    return layer && (layer.id === LAYER_IDS.OBJECTS_FL || layer.id === LAYER_IDS.TRAFFIC_SIGNS_FL);
                });

                if (featureHit && (featureHit as any).graphic) {
                    const attrs = (featureHit as any).graphic.attributes;
                    const featureId = attrs.id || attrs.value; // Mapillary usually uses 'id' for the feature ID
                    
                    // Get feature coordinates
                    const geoPt = webMercatorUtils.webMercatorToGeographic((featureHit as any).graphic.geometry) as __esri.Point;

                    // 1. Highlight the feature (Optional: Draw a specific marker for the selected object)
                    this.drawPoint(geoPt.longitude, geoPt.latitude);

                    // 2. Fetch alternates
                    this.fetchAlternateImages(featureId, geoPt.latitude, geoPt.longitude);
                    
                    // Stop here so we don't trigger the "nearest sequence" search
                    return;
                }

                // 3. Turbo Coverage (Get ALL overlapping hits instead of just one)
                const turboHits = response.results.filter((r: any) => {
                    const layer = r.layer || (r.graphic && r.graphic.layer);
                    return layer && layer.id === LAYER_IDS.TURBO_COVERAGE;
                });
                
                // TURBO COVERAGE MODE BRANCH
                if (this.state.turboModeActive) {
                    if (turboHits.length > 0) {
                        // 1. Mathematically find the ABSOLUTE closest overlapping point
                        let closestGraphic: __esri.Graphic | null = null;
                        let minDistance = Infinity;

                        turboHits.forEach((hit: any) => {
                            const graphic = hit.graphic;
                            // Convert the hit graphic to WGS84 to calculate distance
                            const geom = webMercatorUtils.webMercatorToGeographic(graphic.geometry) as __esri.Point;
                            if (geom) {
                                // Compare mouse click (point.latitude/longitude) to dot location (geom)
                                const dist = distanceMeters(point.latitude, point.longitude, geom.latitude, geom.longitude);
                                if (dist < minDistance) {
                                    minDistance = dist;
                                    closestGraphic = graphic;
                                }
                            }
                        });

                        // 2. Load exactly the point they clicked
                        if (closestGraphic) {
                            // TypeScript safety check
                            const safeGraphic = closestGraphic as __esri.Graphic;
                            const attrs = safeGraphic.attributes;

                            // Safely highlight the point
                            if (this.turboCoverageLayerView) {
                                if (this.highlightHandle) this.highlightHandle.remove();
                                this.highlightHandle = (this.turboCoverageLayerView as any).highlight(safeGraphic);
                            }

                            if (attrs) {
                                const imageId = attrs.image_id; 
                                if (!imageId) return;

                                let seqId = attrs.sequence_id;

                                if (!seqId || seqId === "" || seqId === "undefined") {
                                    try {
                                        const resp = await fetch(`${GRAPH_API.BASE}/${imageId}?fields=sequence`, {
                                            headers: { Authorization: `OAuth ${this.accessToken}` }
                                        });
                                        if (resp.ok) {
                                            const data = await resp.json();
                                            seqId = data.sequence;
                                            safeGraphic.attributes.sequence_id = seqId;
                                        }
                                    } catch (err) { return; }
                                }
                                if (seqId) {
                                    this.drawClickRipple(point.longitude, point.latitude);
                                    this.setState({ selectedSequenceId: seqId });
                                    this.clearSequenceGraphics();
                                    await this.loadSequenceById(seqId, imageId, { lon: point.longitude, lat: point.latitude });
                                    return;
                                }
                            }
                        }
                    }
                    
                    // Clicked empty space
                    this.drawWarningRipple(point.longitude, point.latitude);
                    this.showZoomWarning("Turbo Mode: Please click directly on a brown coverage point.", 3000);
                    return;
                }
                
                // NORMAL MODE BRANCH
                await this.handleMapClick(evt);

            } catch (error) {
                console.error("Click error", error);
                if (!this.state.turboModeActive) {
                    await this.handleMapClick(evt);
                }
            }
        });

        // HOVER HANDLER
        this.pointerMoveHandle = jmv.view.on("pointer-move", (evt) => {
            // Immediately clear the previous pending hitTest
            if (hoverHitTestTimeout) {
                clearTimeout(hoverHitTestTimeout);
            }

            // Capture exact screen coordinates for the deferred hitTest
            const globalX = evt.native.clientX;
            const globalY = evt.native.clientY;
            const screenPoint = { x: evt.x, y: evt.y };

            // Wait 40ms before performing the expensive hitTest.
            // If the user swiping the mouse wildly, this drops the intermediate 
            // frames and prevents the browser UI thread from stuttering.
            hoverHitTestTimeout = setTimeout(async () => {
                try {
                    // Test ALL layers (no include filter)
                    const hit = await jmv.view.hitTest(screenPoint);

                    // 1. POINT CLOUD HOVER SYNC (Dual-Hover Feature)
                    const pcHit = hit.results.find((r: any) => {
                        const l = r.layer || (r.graphic && r.graphic.layer);
                        return l && l.id === "point-cloud-layer";
                    });

                    if (pcHit && (pcHit as any).graphic) {
                        const attrs = (pcHit as any).graphic.attributes || {};
                        const idx = attrs.pointIndex ?? ((attrs.ObjectID || 1) - 1);
                        
                        if (this._pointCloudViewerRenderer) {
                            this._pointCloudViewerRenderer.setHighlight(idx);
                            if (this.mapillaryViewer) this.mapillaryViewer.resize(); 
                        }
                    } else {
                        // Clear point cloud highlight if mouse moves off the cloud
                        if (this._pointCloudViewerRenderer && this._pointCloudViewerRenderer._selectedIndex !== -1) {
                            this._pointCloudViewerRenderer.setHighlight(-1);
                            if (this.mapillaryViewer) this.mapillaryViewer.resize();
                        }
                    }

                    // 2. STANDARD OBJECT / TRAFFIC SIGN HOVER LOGIC
                    const obj = hit.results.find((r: any) => {
                        const l = r.layer || (r.graphic && r.graphic.layer);
                        return l && (l.id === LAYER_IDS.OBJECTS_FL || l.id === LAYER_IDS.TRAFFIC_SIGNS_FL);
                    });

                    if (obj && (obj as any).graphic) {
                        const attrs = (obj as any).graphic.attributes || {};
                        if (this.tooltipDiv) {
                            this.tooltipDiv.innerHTML = `
                                <div><b>${attrs.name || attrs.value}</b></div>
                            `;
                            this.tooltipDiv.style.left = `${globalX + 15}px`;
                            this.tooltipDiv.style.top = `${globalY + 15}px`;
                            this.tooltipDiv.style.display = "block";
                        }
                        return; // Stop here, don't trigger Turbo hover
                    }

                    if (!this.tooltipDiv) return;

                    // 3. TURBO MODE HOVER LOGIC
                    const turboHit = hit.results.find((r: any) => {
                        const layer = r.layer || (r.graphic && r.graphic.layer);
                        return layer && layer.id === LAYER_IDS.TURBO_COVERAGE;
                    });

                    if (turboHit && (turboHit as any).graphic) {
                        const hitGraphic = (turboHit as any).graphic;
                        const attrs = hitGraphic?.attributes;
                        if (!attrs) return;

                        const featureId = attrs.image_id;
                        if (!featureId) return;

                        // GROW ANIMATION
                        this.showTurboHover(hitGraphic);

                        // TOOLTIP LOGIC
                        if (this._currentHoveredFeatureId !== featureId) {
                            if (this._hoverTimeout) {
                                clearTimeout(this._hoverTimeout);
                                this._hoverTimeout = null;
                            }
                            this.tooltipDiv.style.display = "none";
                            this._currentHoveredFeatureId = featureId;

                            // Instantly wipe the old sequence highlight before starting the 300ms timer
                            this.highlightSequenceOnVTL(null);

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
                                    this.highlightSequenceOnVTL(attrs.sequence_id ?? null);
                                    console.log('[hover] cached sequence_id:', attrs.sequence_id);
                                    return;
                                }

                                try {
                                    const url = `${GRAPH_API.BASE}/${featureId}?fields=id,sequence,creator,captured_at,thumb_256_url`;
                                    const resp = await fetch(url, {
                                        headers: { Authorization: `OAuth ${this.accessToken}` }
                                    });

                                    if (resp.ok) {
                                        const data = await resp.json();
                                        if (!this.tooltipDiv) return;

                                        hitGraphic.attributes.sequence_id = data.sequence;
                                        hitGraphic.attributes.creator_username = data.creator?.username;
                                        hitGraphic.attributes.thumb_url = data.thumb_256_url;
                                        if (data.captured_at) hitGraphic.attributes.captured_at = new Date(data.captured_at).getTime();
                                        this.highlightSequenceOnVTL(hitGraphic.attributes.sequence_id ?? null);
                                        console.log('[hover] fetched sequence:', data.sequence);

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
                        this.highlightSequenceOnVTL(null);

                        if (this._hoverTimeout) {
                            clearTimeout(this._hoverTimeout);
                            this._hoverTimeout = null;
                        }
                        this._currentHoveredFeatureId = null;
                        this.tooltipDiv.style.display = "none";
                    }
                } catch (err) {
                    // Ignore hitTest aborted errors
                }
            }, 40); // End of debounce timeout
        });
    }

    // #region MAP GRAPHICS
    // All methods that draw or remove graphics on the ArcGIS map view.
    // - drawPulsingPoint → animates active image point (green).
    // - drawClickRipple → shows short-lived red ripple at click.
    // - drawPoint → draws static red point for clicked location.
    // - drawCone → draws camera direction cone based on bearing.
    private drawPulsingPoint(
        lon: number,
        lat: number,
        baseColor: any =[0, 255, 0, 1]
    ) {
        const {jimuMapView} = this.state;
        if (!jimuMapView || !this.ArcGISModules) return null;
        
        const view = jimuMapView.view;
        const is3D = view.type === "3d";

        this.clearGreenPulse(); // clear any existing before drawing new
        const {Graphic} = this.ArcGISModules;

        // Helper to generate the correct symbol based on 2D/3D view type
        const getSymbol = (currentSize: number) => {
            if (is3D) {
                return {
                    type: "point-3d",
                    // X-Ray vision: Always draw on top of the orange 3D cone walls
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    // ArcGIS ignores disableDepthTest unless the point is "undraped" from the ground.
                    // We use an imperceptible 1-pixel (max 10cm) lift. It won't look "floating", 
                    // but satisfies the 3D engine's requirement to bypass the depth buffer.
                    verticalOffset: {
                        screenLength: 1, 
                        maxWorldLength: 0.1,
                        minWorldLength: 0.1
                    },
                    symbolLayers:[{
                        type: "icon",
                        resource: { primitive: "circle" },
                        material: { color: baseColor },
                        size: currentSize,
                        outline: { color:[255, 255, 255, 1], size: 2 }
                    }]
                };
            } else {
                return {
                    type: "simple-marker",
                    style: "circle",
                    color: baseColor,
                    size: currentSize,
                    outline: { color: "white", width: 2 },
                };
            }
        };

        const graphic = new Graphic({
            geometry: {
                type: "point",
                longitude: lon,
                latitude: lat,
                spatialReference: {wkid: 4326},
            },
            symbol: getSymbol(10) as any,
        });

        view.graphics.add(graphic);

        let growing = true;
        let size = 10;

        const pulseInterval = setInterval(() => {
            size += growing ? 0.5 : -0.5;
            if (size >= 14) growing = false;
            if (size <= 10) growing = true;

            // ArcGIS 4.x automatically updates the view when properties change.
            // DO NOT use remove() and add() here, as it destroys 3D WebGL performance 
            // and causes graphics to vanish when the camera turns.
            graphic.symbol = getSymbol(size) as any;

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
                size: 7,
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
                    color: [255, 165, 0, 0.35],
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

    /**
        * Keeps the browser URL in sync with the currently active Mapillary image.
        * Called on every image change so the address bar always reflects the current
        * state, allowing users to bookmark or copy the URL at any time without
        * needing to use the share button.
        * Attempts to update the parent window URL (Experience Builder iframe context).
        * Silently skips if cross-origin restrictions apply, share button remains
        * as the reliable fallback in that case.
        * @param imageId  Active Mapillary image ID
        * @param lat      Image latitude (written to URL for reference/display)
        * @param lon      Image longitude (written to URL for reference/display)
    */
    private updateUrlWithCurrentImage(imageId: string, lat: number, lon: number) {
        try {
            const targetWindow = (window.self !== window.top && window.parent) 
                ? window.parent 
                : window;
            // Detect if we are currently in 2D or 3D
            const mapType = this.state.jimuMapView?.view?.type === '3d' ? '3d' : '2d';
            const url = new URL(targetWindow.location.href);
            url.searchParams.set(SHARE_PARAMS.LAT, lat.toFixed(6));
            url.searchParams.set(SHARE_PARAMS.LON, lon.toFixed(6));
            url.searchParams.set(SHARE_PARAMS.IMAGE_ID, imageId);
            url.searchParams.set(SHARE_PARAMS.BEARING, String(this._lastBearing.toFixed(1)));
            url.searchParams.set(SHARE_PARAMS.ZOOM, String(this.state.currentZoom?.toFixed(1) ?? ''));
            url.searchParams.set(SHARE_PARAMS.MAP_TYPE, mapType);
            
            targetWindow.history.replaceState(null, '', url.toString());
        } catch (e) {
            // Cross-origin iframe, silently skip, share button still works
        }
    }

    /**
        * Highlights a specific Mapillary sequence on the map using a dynamic Vector Tile Layer.
        * This method is highly optimized for rapid mouse-move (hover) interactions. 
        * Instead of destroying and recreating layers, it lazily instantiates a single 
        * VectorTileLayer and hot-swaps its style filter. It also handles 2D/3D view switching
        * and overrides default rendering animations for instantaneous visual feedback.
        * @param {string | null} sequenceId - The Mapillary sequence ID to highlight, or null to clear the highlight.
    */
    private highlightSequenceOnVTL(sequenceId: string | null) {
        // Guard clause: Prevent redundant WebGL updates if the hovered sequence hasn't changed.
        if (this._hoveredSequenceId === sequenceId) return;
        this._hoveredSequenceId = sequenceId;

        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.ArcGISModules) return;

        // FAST CLEAR: If no sequence is provided (mouse off), simply hide the layer.
        // Bypassing layer destruction preserves the WebGL context and eliminates GC overhead.
        if (!sequenceId) {
            if (this._sequenceHighlightLayer) {
                this._sequenceHighlightLayer.visible = false;
            }
            return;
        }

        const view = jimuMapView.view;
        const { VectorTileLayer } = this.ArcGISModules;

        try {
            const vectorTileSourceUrl = `${TILE_URLS.COVERAGE}?access_token=${this.accessToken}`;

            // Define the Mapbox GL Style specification dynamically.
            const highlightStyle = {
                version: 8,
                sources: {
                    [STYLE_SOURCE_IDS.MAPILLARY]: {
                        type: "vector",
                        tiles: [vectorTileSourceUrl],
                        minzoom: 0,
                        maxzoom: 14
                    }
                },
                layers: [
                    {
                        id: "sequence-highlight",
                        source: STYLE_SOURCE_IDS.MAPILLARY,
                        "source-layer": STYLE_LAYER_IDS.SEQUENCE,
                        type: "line",
                        filter: ["==", ["get", "id"], sequenceId], // Target the specific sequence
                        paint: {
                            "line-color": "#00ff88",
                            "line-width": 5,
                            "line-opacity": 1.0,
                            // Override default ArcGIS fade animations to ensure 
                            // the highlight snaps instantly when jumping between points.
                            "line-opacity-transition": { duration: 0 },
                            "line-color-transition": { duration: 0 },
                            "line-width-transition": { duration: 0 }
                        }
                    }
                ]
            };

            // LAZY INITIALIZATION: Create the layer only on the very first hover event.
            if (!this._sequenceHighlightLayer) {
                this._sequenceHighlightLayer = new VectorTileLayer({
                    style: highlightStyle,
                    opacity: 1,
                    id: "mapillary-sequence-highlight",
                    listMode: "hide"
                });

                // Z-Index Management: Ensure the highlight sits visually above the base 
                // coverage lines, but beneath interactive feature dots (Turbo/Objects).
                const turboIndex = this.turboCoverageLayer
                    ? view.map.layers.indexOf(this.turboCoverageLayer)
                    : view.map.layers.length;

                view.map.add(this._sequenceHighlightLayer, Math.max(0, turboIndex));
            } else {
                
                // CONTEXT RECOVERY: If the view was swapped (e.g., transitioning between 
                // 2D and 3D maps), the layer may have been detached. Reattach it safely.
                if (!view.map.layers.includes(this._sequenceHighlightLayer)) {
                    const turboIndex = this.turboCoverageLayer
                        ? view.map.layers.indexOf(this.turboCoverageLayer)
                        : view.map.layers.length;
                    view.map.add(this._sequenceHighlightLayer, Math.max(0, turboIndex));
                }

                // FAST UPDATE: Utilize `loadStyle()` to hot-swap the style object.
                // This updates the filter in the GPU immediately without tearing down the layer.
                if (typeof this._sequenceHighlightLayer.loadStyle === 'function') {
                    this._sequenceHighlightLayer.loadStyle(highlightStyle);
                } else {
                    // Fallback for older ArcGIS JS API versions
                    this._sequenceHighlightLayer.style = highlightStyle;
                }
                
                // Ensure the layer is unhidden if it was previously cleared via the FAST CLEAR logic.
                this._sequenceHighlightLayer.visible = true;
            }

        } catch (e) {
            console.warn('highlightSequenceOnVTL failed:', e);
        }
    }
    // #endregion MAP GRAPHICS

    // Main user interaction
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
                // FIRST CLICK LOGIC
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
                            const dist = distanceMeters(img.lat, img.lon, lat, lon);
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
                // LATER CLICK LOGIC
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
                    const dist = distanceMeters(img.lat, img.lon, lat, lon);
                    return (!closest || dist < closest.dist) 
                        ? { ...img, dist } 
                        : closest;
                }, null as ({ id: string; lat: number; lon: number; dist: number }) | null);

                if (!closestImg) {
                    this.showNoImageMessage();
                    return;
                }
                
                const DISTANCE_THRESHOLD_METERS = 0.2;

                // CASE A: Click is far -> New Search
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
                                const dist = distanceMeters(img.lat, img.lon, lat, lon);
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

                // CASE B: Click is NEAR an image in current sequence
                this.log("Same sequence within threshold, reusing cached overlay");

                await this.loadSequenceById(selectedSequenceId, closestImg.id, { lon, lat });

                // Optional: mark “off-point” clicks with a red marker
                const toleranceMeters = 0.5;
                const onSequencePoint = updatedSequence.some(img =>
                    distanceMeters(img.lat, img.lon, lat, lon) <= toleranceMeters
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

    // #region UTILITIES
    // Misc helpers used across the widget.

    // Fetch ID from Username
    private async getUserIdFromUsername(username: string): Promise<number | null> {
        if (!username) return null;
        if (this._userIdCache.has(username)) return this._userIdCache.get(username)!;
        const url = `${GRAPH_API.BASE}/images?creator_username=${username}&limit=1&fields=creator&access_token=${this.accessToken}`;
        try {
            const response = await fetch(url);
            if (!response.ok) { this._userIdCache.set(username, null); return null; }
            const data = await response.json();
            const id = data.data?.length > 0 ? parseInt(data.data[0].creator.id, 10) : null;
            this._userIdCache.set(username, id);
            return id;
        } catch {
            return null;
        }
    }

    // Reverse geocoding helper
    // Calls ArcGIS World Geocoding API to convert image lat/lon
    // into a readable address displayed in the info box.
	private fetchReverseGeocode = async (lat: number, lon: number) => {
        try {
            const response = await fetch(
                `${GEOCODE_URL}?location=${lon},${lat}&distance=100&f=json`
            );
            const data = await response.json();
            const fullAddress = data.address?.LongLabel || 'Address not found';
            const addressParts = fullAddress.split(', ').filter((part: string) => part.trim());
            const secondPart = addressParts[1] || fullAddress;
            this.setState({ address: secondPart });
        } catch (error) {
            console.error('Reverse geocode error:', error);
            this.setState({ address: 'Failed to fetch address' });
        }
    }

    /*
        * Displays a zoom warning.
        * @param message Text to display
        * @param duration Time in ms. If 0, the message stays indefinitely until cleared manually.
    */
    private showZoomWarning(message: string, duration: number = TIMING.WARNING_DEFAULT_MS) {
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

    
    // Immediately hides the "no image available" message.
    private clearNoImageMessage() {
        this.setState({ noImageMessageVisible: false });
    }

    /**
        * Applies the configured camera center offset to the Mapillary viewer.
        * Uses cameraX/cameraY from widget config, defaulting to [0.5, 0.5]
        * (standard horizon center) if values are absent.
        * Called on every image change and window resize to ensure
        * the viewport stays correctly aligned regardless of widget dimensions.
    */
    private applyCustomCameraAngle = () => {
        const x = this.props.config.cameraX ?? 0.5;
        const y = this.props.config.cameraY ?? 0.5;

        if (this.mapillaryViewer) {
            this.mapillaryViewer.setCenter([x, y]);
        }
    }

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
                `${GRAPH_API.BASE}/${currentImageId}?fields=geometry,computed_geometry,captured_at,
                computed_compass_angle,compass_angle,is_pano,sequence&access_token=${this.accessToken}`
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
            const offset = BBOX.TIME_TRAVEL; 
            const bbox = `${cCoords[0] - offset},${cCoords[1] - offset},${cCoords[0] + offset},${cCoords[1] + offset}`;
            const candidatesUrl = `${GRAPH_API.BASE}/images?bbox=${bbox}&fields=id,captured_at,compass_angle,computed_compass_angle,
            is_pano,geometry,computed_geometry,sequence&limit=${LIMITS.TIME_TRAVEL_CANDIDATES}&access_token=${this.accessToken}`;
            
            const candidatesResp = await fetch(candidatesUrl);
            const candidatesData = await candidatesResp.json();

            if (candidatesData.data && candidatesData.data.length > 0) {

                const hasValidMatch = candidatesData.data.some((img: any) => {
                    if (img.id === currentImageId) return false;

                    // RULE 1: Ignore images from the same drive
                    if (img.sequence === cSeq) return false;

                    // RULE 2: Must be a different day
                    const imgTime = new Date(img.captured_at).getTime();
                    if (Math.abs(imgTime - cTime) < TIME_TRAVEL_THRESHOLDS.MIN_GAP_MS) return false;

                    // RULE 3: Reconstruction Check
                    // If candidate wasn't reconstructed, Mapillary website won't show it.
                    if (!img.computed_geometry) return false;

                    // RULE 4: Strict distance check using Computed Geometry
                    const iCoords = img.computed_geometry.coordinates;
                    const dist = distanceMeters(cCoords[1], cCoords[0], iCoords[1], iCoords[0]);
                    if (dist > TIME_TRAVEL_THRESHOLDS.MAX_DISTANCE_M) return false;

                    // RULE 5: Strict angle check using Computed Angle
                    if (cData.is_pano || img.is_pano) return true;
                    
                    const iAngle = img.computed_compass_angle ?? img.compass_angle;
                    if (cAngle !== null && iAngle !== null) {
                        const diff = Math.abs(cAngle - iAngle) % 360;
                        const shortestDiff = diff > 180 ? 360 - diff : diff;
                        return shortestDiff <= TIME_TRAVEL_THRESHOLDS.MAX_ANGLE_DEG;
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
        * Displays a temporary toast notification.
        * @param message - React node content to display inside the toast
        * @param duration - Time in milliseconds before the toast disappears (default: 2500ms)
    */
    private showToast(message: React.ReactNode, duration: number = 2500) {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this.setState({ toastMessage: message });
        this._toastTimer = setTimeout(() => {
            this.setState({ toastMessage: undefined });
            this._toastTimer = null;
        }, duration);
    }

    /**
        * Centers the map view on the currently displayed frame.
        * Retrieves the current image from the active sequence and uses its
        * geographic coordinates to reposition the map. The map smoothly
        * animates to the frame location and ensures a minimum zoom level
        * for better visibility. After centering, a toast notification is
        * displayed to inform the user.
    */
    private handleCenterMap = () => {
        const { imageId, sequenceImages, jimuMapView } = this.state;
        if (!imageId || !jimuMapView) return;
        
        const currentImg = sequenceImages.find(img => img.id === imageId);
        if (currentImg) {
            jimuMapView.view.goTo({
                center: [currentImg.lon, currentImg.lat],
                zoom: Math.max(jimuMapView.view.zoom, 17)
            }, { animate: true, duration: 800 });

            this.showToast(
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icons.Crosshair size={14} /> Map centered on current frame
                </span>
            );
        }
    };
    /**
        * Toggles synchronization between the map rotation and the camera heading.
        * When enabled, the map rotates to match the current camera orientation
        * of the viewer. When disabled, the map remains fixed (north-up) regardless
        * of camera direction.
        * After toggling the state, a toast notification is displayed to inform
        * the user whether map rotation is now synced or unlocked.
    */
    private handleToggleSyncHeading = () => {
        const newSyncHeading = !this.state.syncHeading;
        this.setState({ syncHeading: newSyncHeading });

        this.showToast(
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {newSyncHeading 
                    ? <><Icons.CompassLocked size={14} /> Map rotation synced to camera</>
                    : <><Icons.CompassUnlocked size={14} /> Map rotation unlocked</>
                }
            </span>
        );
    };
    
    // Helper for Debug Logging
    private log = (...args: any[]) => {
        if (this.props.config.debugMode) {
            // Adds a prefix so you can easily filter in Chrome DevTools
            console.log("%c[Mapillary Widget]", "color: #37d582; font-weight: bold;", ...args);
        }
    }

    /**
        * Fetches nearby street-level images from the Mapillary Graph API
        * centered on the given coordinates, then populates the nearby image strip.
        * Applies a startup delay on the very first image load so the fetch does not
        * race with the splash-screen fade animation; all subsequent calls are immediate.
        * @param lat     - Latitude of the anchor point (decimal degrees, WGS-84).
        * @param lon     - Longitude of the anchor point (decimal degrees, WGS-84).
        * @param imageId - ID of the currently active image, excluded from results
        *                  so the viewer does not show the current image as a "nearby" suggestion.
    */
    private async fetchNearbyImages(lat: number, lon: number, imageId: string) {
        
        const doFetch = async () => {
            this.setState({ nearbyLoading: true, nearbyImages: [], nearbyStripOpen: false });
            try {
                const url = GRAPH_API.nearbyImages(lat, lon, 50, 13) +
                            `&access_token=${this.accessToken}`;
                const res = await fetch(url);
                const data = await res.json();
                const images = (data.data as NearbyImage[])
                    .filter(img => img.id !== imageId)
                    .slice(0, 12);
                this.setState({ nearbyImages: images });
            } catch {
                this.setState({ nearbyImages: [] });
            } finally {
                this.setState({ nearbyLoading: false });
            }
        };

        if (this._isInitialImageLoad) {
            this._isInitialImageLoad = false;
            // wait for splash fade + a little breathing room
            setTimeout(doFetch, TIMING.SPLASH_FADE_MS + 300);
        } else {
            doFetch();
        }
    }

    /**
        * Places or removes a temporary highlight pin on the ArcGIS map to indicate
        * the geographic position of a hovered nearby-image thumbnail.
        * Only one pin exists at a time, calling this method always removes the
        * previous graphic before adding a new one. Pass `null` to clear the pin
        * without adding a replacement (e.g. on mouse-leave).
        * @param img - The nearby image whose coordinates should be pinned, or
        *              `null` to remove the existing pin.
    */
    private highlightNearbyPin(img: NearbyImage | null) {
        const view = this.state.jimuMapView?.view;
        if (!view || !this.ArcGISModules) return;

        // Remove previous pin
        if (this._nearbyPinGraphic) {
            view.graphics.remove(this._nearbyPinGraphic);
            this._nearbyPinGraphic = null;
        }

        if (!img) return;

        const [lon, lat] = img.geometry.coordinates;
        const { Graphic } = this.ArcGISModules;

        this._nearbyPinGraphic = new Graphic({
            geometry: {
                type: 'point',
                longitude: lon,
                latitude: lat,
                spatialReference: { wkid: 4326 }
            },
            symbol: {
                type: 'simple-marker',
                style: 'circle',
                color: [255, 200, 0, 0.9],      // yellow, matches your direction hover
                size: 10,
                outline: { color: [255, 255, 255, 1], width: 1.5 }
            }
        });

        view.graphics.add(this._nearbyPinGraphic);
    }
    // #endregion UTILITIES
    
    // Main UI rendering logic
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

                {/* LEGEND REGION */}
                {this.state.imageId && !this.props.config.hideLegend && !this.state.isFullscreen && (
                    <Legend
                        turboModeActive={!!this.state.turboModeActive}
                        onClearCache={this.clearSequenceCache}
                    />
                )}

                {/* FEATURES LOADING REGION; traffic signs / objects tile fetch */}
                {this.state.featuresLoading && (
                    <div style={glassStyles.featuresLoadingBadge}>
                        <div style={glassStyles.featuresLoadingSpinner} />
                        <span style={glassStyles.featuresLoadingText}>
                            Loading features...
                        </span>
                    </div>
                )}

                {/* TURBO LOADING IMAGERY REGION */}
                {this.state.turboLoading && (
                    <div style={glassStyles.turboDynamicPillContainer}>
                        <div style={glassStyles.turboDynamicPill}>
                            {/* Dual-Ring Tech Spinner */}
                            <div style={{ position: "relative", width: "20px", height: "20px" }}>
                                <div style={{
                                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                    border: "2px solid rgba(255, 193, 7, 0.15)",
                                    borderTopColor: "#ffc107",
                                    borderRadius: "50%",
                                    animation: "turboDataSpin 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite"
                                }} />
                                <div style={{
                                    position: "absolute", top: "4px", left: "4px", right: "4px", bottom: "4px",
                                    border: "2px solid rgba(255, 193, 7, 0.1)",
                                    borderBottomColor: "#ffc107",
                                    borderRadius: "50%",
                                    animation: "turboDataSpin 1.5s linear infinite reverse"
                                }} />
                            </div>
                            
                            {/* Premium Gradient Text */}
                            <div style={glassStyles.turboDynamicPillText}>
                                Fetching Turbo Coverage Points...
                            </div>
                        </div>
                    </div>
                )}

                {/* LOADING IMAGERY REGION */}
                {this.state.isLoading && (
                    <div style={glassStyles.imageDynamicPillContainer}>
                        <div style={glassStyles.imageDynamicPill}>
                            {/* Dual-Ring Tech Spinner */}
                            <div style={{ position: "relative", width: "20px", height: "20px" }}>
                                <div style={{
                                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                    border: "2px solid rgba(55, 213, 130, 0.15)",
                                    borderTopColor: "#37d582",
                                    borderRadius: "50%",
                                    animation: "turboDataSpin 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite"
                                }} />
                                <div style={{
                                    position: "absolute", top: "4px", left: "4px", right: "4px", bottom: "4px",
                                    border: "2px solid rgba(55, 213, 130, 0.1)",
                                    borderBottomColor: "#37d582",
                                    borderRadius: "50%",
                                    animation: "turboDataSpin 1.5s linear infinite reverse"
                                }} />
                            </div>
                            
                            {/* Premium Gradient Text */}
                            <div style={glassStyles.imageDynamicPillText}>
                                Loading Imagery...
                            </div>
                        </div>
                    </div>
                )}

                {/* CLICK A POINT TO VIEW IMAGERY REGION */}
                {!this.state.imageId && !this.state.isLoading && !this.state.turboLoading && !this.state.noImageMessageVisible && (
                    <div style={glassStyles.initialStateContainer}>
                        <div className="initial-state-card" style={glassStyles.initialStateCard}>

                            {/* Polished text with clean gradient styling */}
                            <span style={{
                                ...glassStyles.initialStateTextPrimary,
                                background: "linear-gradient(90deg, #fff 0%, #37d582 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text"
                            }}>
                                CLICK A POINT TO VIEW IMAGERY
                            </span>
                            
                            {/* Kept intact for TypeScript mapping, automatically hidden by glassStyles config */}
                            <span style={glassStyles.initialStateTextSecondary}>
                                (Mapillary imagery will appear here)
                            </span>
                        </div>
                    </div>
                )}

                {/* NO IMAGE VISIBLE WARNING REGION */}
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

                {/* IMAGE UTILITY GROUP */}
                {this.state.imageId && (
                    <ImageUtilityGroup
                        hideTimeTravel={this.props.config.hideTimeTravel}
                        hideShareButton={this.props.config.hideShareButton}
                        hideImageDownload={this.props.config.hideImageDownload}
                        hideSyncHeadingButton={this.props.config.hideSyncHeadingButton}
                        hideCenterMapButton={this.props.config.hideCenterMapButton}
                        hasTimeTravel={this.state.hasTimeTravel}
                        isDownloading={this.state.isDownloading}
                        syncHeading={this.state.syncHeading}
                        is3D={this.state.jimuMapView?.view.type === '3d'}
                        imageId={this.state.imageId}
                        sequenceImages={this.state.sequenceImages}
                        onTimeTravel={(lat, lon, imageId) => {
                            const url = `https://www.mapillary.com/app/time-travel?lat=${lat}&lng=${lon}&z=17&pKey=${imageId}&focus=photo`;
                            this.showToast(
                                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <Icons.TimeTravel style={{ color: "#FFD700", width: 14, height: 14 }} /> Opening Time Travel in new tab...
                                </span>,
                                2000
                            );
                            setTimeout(() => window.open(url, '_blank'), 2000);
                        }}
                        onShare={this.copyShareLink}
                        onDownload={this.downloadActiveImage}
                        onToggleSyncHeading={this.handleToggleSyncHeading}
                        onCenterMap={this.handleCenterMap}
                        hidePointCloud={this.props.config.hidePointCloud}
                        pointCloudLoading={this.state.pointCloudLoading}
                        pointCloudVisible={this.state.pointCloudVisible}
                        pointCloudAvailable={this.state.pointCloudAvailable}
                        onTogglePointCloud={this.togglePointCloud}
                    />
                )}

                {/* NEARBY CAPTURES BOTTOM STRIP */}
                {this.state.imageId && this.state.nearbyStripOpen && (
                    <div style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 999999990,
                        background: "rgba(12,12,12,0.92)",
                        backdropFilter: "blur(10px)",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                        padding: "6px 8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        // slide up animation
                        animation: "nearbySlideUp 0.2s ease-out",
                    }}>
                        <style>{`
                            @keyframes nearbySlideUp {
                                from { transform: translateY(100%); opacity: 0; }
                                to   { transform: translateY(0);    opacity: 1; }
                            }
                        `}</style>

                        {/* Header row */}
                        <div style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: "9px", color: "rgba(255,255,255,0.45)",
                        }}>
                            <span>{(this.state.nearbyImages ?? []).length} captures within 50 m</span>
                            <button
                                onClick={() => this.setState({ nearbyStripOpen: false })}
                                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                                        cursor: "pointer", fontSize: "11px", padding: "0 2px", lineHeight: 1 }}
                            >✕</button>
                        </div>

                        {/* Thumbnail scroll row */}
                        <div style={{
                            display: "flex",
                            gap: "5px",
                            overflowX: "auto",
                            scrollSnapType: "x mandatory",
                            scrollbarWidth: "thin",
                            scrollbarColor: "rgba(255,255,255,0.2) transparent",
                            paddingBottom: "2px",
                        }}>
                            {(this.state.nearbyImages ?? []).map(img => {
                                const isCurrent = img.id === this.state.imageId;
                                const date = new Date(img.captured_at).toLocaleDateString(undefined, {
                                    year: "numeric", month: "short"
                                });
                                return (
                                    <div
                                        key={img.id}
                                        onClick={() => {
                                            this.mapillaryViewer?.moveTo(img.id);
                                            this.setState({ nearbyStripOpen: false });
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = "scale(1.04)";
                                            this.highlightNearbyPin(img);
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = "scale(1)";
                                            this.highlightNearbyPin(null);
                                        }}
                                        style={{
                                            flex: "0 0 auto",
                                            width: "220px",
                                            scrollSnapAlign: "start",
                                            cursor: "pointer",
                                            borderRadius: "5px",
                                            overflow: "hidden",
                                            border: isCurrent ? "2px solid #05a056" : "2px solid transparent",
                                            position: "relative",
                                            transition: "transform 0.12s",
                                        }}
                                    >
                                        <img
                                            src={img.thumb_512_url ?? img.thumb_256_url} 
                                            alt=""
                                            loading="lazy"
                                            style={{ width: "100%", height: "144px", objectFit: "cover", display: "block" }}
                                        />
                                        <div style={{
                                            position: "absolute", bottom: 0, left: 0, right: 0,
                                            background: "linear-gradient(transparent, rgba(0,0,0,0.78))",
                                            padding: "10px 4px 3px",
                                            fontSize: "8px", color: "rgba(255,255,255,0.85)", lineHeight: 1.3,
                                        }}>
                                            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {img.creator?.username ?? ""}
                                            </div>
                                            <div style={{ opacity: 0.7 }}>{date}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
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

                {/* showing error only if strictly needed, 
                    separate from the logic component 
                    missing map widget warning overlay*/}
                                {!mapWidgetId && (
                    <div style={glassStyles.missingMapContainer}>
                        <div style={glassStyles.missingMapCard}>
                            
                            <div style={glassStyles.missingMapIcon}>
                                <Icons.Warning size={36} />
                            </div>
                            
                            <h3 style={glassStyles.missingMapTitle}>
                                Map Connection Required
                            </h3>
                            
                            <p style={glassStyles.missingMapText}>
                                The Mapillary Explorer needs to be linked to a Map Widget to function properly.
                            </p>
                            
                            <div style={glassStyles.missingMapInstructionsBox}>
                                <div style={glassStyles.missingMapInstructionsTitle}>
                                    How to fix:
                                </div>
                                <ol style={glassStyles.missingMapInstructionsList}>
                                    <li>Open this widget's <b>Settings</b> panel</li>
                                    <li>Go to the <b>Source</b> tab</li>
                                    <li>Click <b>Select Map widget</b></li>
                                    <li>Select your target map name</li>
                                </ol>
                            </div>
                            
                        </div>
                    </div>
                )}

                {viewerArea}
                {this.state.zoomWarningMessage && (
                    <div
                        className="warning-message-container"
                        style={glassStyles.zoomWarningContainer}
                    >
                        <span style={glassStyles.zoomWarningIcon}>
                            <Icons.Warning size={12} /> WARNING
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.75)", fontStyle: "italic" }}>
                            {this.state.zoomWarningMessage}
                        </span>
                    </div>
                )}

                {this.state.toastMessage && (
                    <div style={glassStyles.toastContainer}>
                        {this.state.toastMessage}
                    </div>
                )}

                {/* Revolver-style sequence picker */}
                <SequencePicker
                    sequences={this.state.availableSequences ?? []}
                    activeSequenceId={this.state.selectedSequenceId}
                    clickLat={this.state.clickLat}
                    clickLon={this.state.clickLon}
                    accessToken={this.accessToken}
                    getSequenceWithCoords={this.getSequenceWithCoords.bind(this)}
                    clearGreenPulse={this.clearGreenPulse.bind(this)}
                    onSelectSequence={(sequenceId, closestImageId) => {
                        this.setState({ selectedSequenceId: sequenceId });
                        this.loadSequenceById(sequenceId, closestImageId);
                    }}
                />
                
                {/* INFO BOX */}
                <InfoBox
                    hideInfoBox={this.props.config.hideInfoBox}
                    turboCreator={this.props.config.turboCreator}
                    imageId={this.state.imageId}
                    address={this.state.address}
                    currentZoom={this.state.currentZoom}
                    jimuMapViewZoom={this.state.jimuMapView?.view.zoom}
                    sequenceImages={this.state.sequenceImages}
                    turboModeActive={this.state.turboModeActive}
                    turboColorByDate={this.state.turboColorByDate}
                    turboYearLegend={this.state.turboYearLegend}
                    selectedTurboYear={this.state.selectedTurboYear}
                    trafficSignsActive={this.state.trafficSignsActive}
                    objectsActive={this.state.objectsActive}
                    detectionsActive={this.state.detectionsActive}
                    showAiTags={this.state.showAiTags}
                    alternateImages={this.state.alternateImages}
                    isFetchingAlternates={this.state.isFetchingAlternates}
                    accessToken={this.accessToken}
                    onYearLegendClick={this.handleYearLegendClick}
                    onDownloadFeatures={this.downloadCurrentFeatures}
                    onToggleDetections={this.toggleDetections}
                    onToggleAiTags={this.toggleAiTags}
                    onCloseAlternates={() => this.setState({ alternateImages: [], targetDetectionId: null })}
                    onSelectAlternateImage={this._handleSelectAlternateImage}
                    coverageAnalysisLoading={this.state.coverageAnalysisLoading}
                    coverageResult={this.state.coverageResult}
                    coverageSegmentsVisible={this.state.coverageSegmentsVisible}
                    turboPointsAvailable={!!this.turboCoverageLayer && !this.state.turboLoading}
                    turboMinZoom={ZOOM.TURBO_MIN}
                    onToggleCoverageSegments={this.toggleCoverageSegments}
                    onRunCoverageAnalysis={this.runCoverageAnalysis}
                    hideCoverageAnalysis={this.props.config.hideCoverageAnalysis}
                    onDismissCoverageResult={() => {
                        this.clearCoverageSegments(true);
                        this.setState({ coverageResult: null });
                    }}
                    pointCloudVisible={this.state.pointCloudVisible}
                    isMeasureMode={this.state.isMeasureMode}
                    measurePoints={this.state.measurePoints}
                    onToggleMeasureMode={this.toggleMeasureMode}
                    onClearMeasurement={this.clearMeasurement}
                    showCalibrationPanel={this.state.showCalibrationPanel}
                    pointCloudColorMode={this.state.pointCloudColorMode}
                    nudgeStep={this.state.nudgeStep}
                    onToggleCalibrationPanel={this.toggleCalibrationPanel}
                    onJoystickNudge={this.handleJoystickNudge}
                    onResetCalibration={this.resetCalibration}
                    onSetNudgeStep={(step) => this.setState({ nudgeStep: step })}
                    pointCloudLength={this.state.pointCloudLength}
                    pointCloudMaxLength={this.state.pointCloudMaxLength}
                    pointCloudActualLength={this.state.pointCloudActualLength}
                    pointCloudWidth={this.state.pointCloudWidth}
                    pointCloudMaxWidth={this.state.pointCloudMaxWidth}
                    pointCloudActualWidth={this.state.pointCloudActualWidth}
                    onWidthChange={this.handlePointCloudWidthChange}
                    onLengthChange={this.handlePointCloudLengthChange}
                    onDownloadPointCloud={this.downloadPointCloud}
                    isSightMode={this.state.isSightMode}
                    sightObserver={this.state.sightObserver}
                    sightTargets={this.state.sightTargets}
                    isViewshedMode={this.state.isViewshedMode}
                    onToggleViewshedMode={this.toggleViewshedMode}
                    onClearViewshed={this.clearViewshed}
                    onToggleSightMode={this.toggleSightMode}
                    onClearSight={this.clearSight}
                    enableQualityView={this.props.config.enableQualityView}
                    qualityViewActive={this.state.qualityViewActive}
                    onToggleQualityView={this.toggleQualityView}
                    nearbyCount={this.state.nearbyImages?.length ?? 0}
                    nearbyLoading={!!this.state.nearbyLoading}
                    nearbyStripOpen={!!this.state.nearbyStripOpen}
                    onToggleNearbyStrip={() => this.setState(prev => ({ nearbyStripOpen: !prev.nearbyStripOpen }))}
                />
                
                {/* UNIFIED FILTER BAR */}
                <FilterBar
                    showTurboFilterBox={this.state.showTurboFilterBox}
                    showTrafficSignsFilterBox={this.state.showTrafficSignsFilterBox}
                    showObjectsFilterBox={this.state.showObjectsFilterBox}
                    turboFilterUsername={this.state.turboFilterUsername}
                    turboFilterStartDate={this.state.turboFilterStartDate}
                    turboFilterEndDate={this.state.turboFilterEndDate}
                    turboFilterIsPano={this.state.turboFilterIsPano}
                    turboColorByDate={this.state.turboColorByDate}
                    turboModeActive={this.state.turboModeActive}
                    turboCreator={this.props.config.turboCreator}
                    trafficSignsFilterValue={this.state.trafficSignsFilterValue}
                    trafficSignsOptions={this.state.trafficSignsOptions}
                    objectsFilterValue={this.state.objectsFilterValue}
                    objectsOptions={this.state.objectsOptions}
                    onTurboUsernameChange={(val) => this.setState({ turboFilterUsername: val }, () => this.debouncedTurboFilter())}
                    onTurboUsernameEnter={() => {
                        this.debouncedTurboFilter.cancel?.();
                        const val = this.state.turboFilterUsername.trim();
                        if (this.state.jimuMapView && this.state.turboModeActive) {
                            if (val) this.enableTurboCoverageLayer(val);
                            else this.enableTurboCoverageLayer();
                        }
                    }}
                    onTurboUsernameClear={() => this.setState({ turboFilterUsername: "" }, () => this.enableTurboCoverageLayer())}
                    onTurboStartDateChange={(dateString) => this.setState({ turboFilterStartDate: dateString }, () => this.debouncedTurboFilter())}
                    onTurboEndDateChange={(dateString) => this.setState({ turboFilterEndDate: dateString }, () => this.debouncedTurboFilter())}
                    onTurboIsPanoChange={(newVal) => {
                        this.setState({ turboFilterIsPano: newVal }, () => {
                            const rebuild = async () => {
                                let creatorId: number | undefined = undefined;
                                const username = this.state.turboFilterUsername?.trim();
                                if (username) creatorId = await this.getUserIdFromUsername(username) || undefined;
                                this.rebuildCoverageLayer(
                                    creatorId,
                                    this.state.turboFilterStartDate || undefined,
                                    this.state.turboFilterEndDate   || undefined,
                                    newVal,
                                    this.state.qualityViewActive
                                );
                                if (this.state.turboModeActive) await this.enableTurboCoverageLayer();
                            };
                            rebuild();
                        });
                    }}
                    onTurboColorByDateChange={(val) => this.setState({ turboColorByDate: val }, () => this.debouncedTurboFilter())}
                    onTrafficSignsFilterChange={async (selected: FilterOption) => {
                        this.setState({ trafficSignsFilterValue: selected }, async () => {
                            if (!this.state.jimuMapView) return;
                            const newName = selected.value;
                            let filterCode = newName;
                            if (newName !== DEFAULT_FILTER_LABELS.TRAFFIC_SIGNS) {
                                const jsonResp = await fetch(`${SPRITE_URLS.TRAFFIC_SIGNS}.json`);
                                const spriteData = await jsonResp.json();
                                const code = Object.keys(spriteData).find(c => formatTrafficSignName(c) === newName);
                                filterCode = code || newName;
                            }
                            this.filterTrafficSignsVTLayer(filterCode);
                            if (this.state.trafficSignsActive && this.state.jimuMapView.view.zoom >= ZOOM.FEATURES_INTERACTIVE) {
                                if (this.mapillaryTrafficSignsFeatureLayer) this.state.jimuMapView.view.map.remove(this.mapillaryTrafficSignsFeatureLayer);
                                this.mapillaryTrafficSignsFeatureLayer = null;
                                this._cancelTrafficSignsFetch = false;
                                await this.loadMapillaryTrafficSignsFromTilesBBox(true);
                                if (this.mapillaryTrafficSignsFeatureLayer) this.state.jimuMapView.view.map.add(this.mapillaryTrafficSignsFeatureLayer);
                            }
                        });
                    }}
                    onObjectsFilterChange={async (selected: FilterOption) => {
                        this.setState({ objectsFilterValue: selected }, async () => {
                            if (!this.state.jimuMapView) return;
                            const newName = selected.value;
                            let filterCode = newName;
                            if (newName !== DEFAULT_FILTER_LABELS.OBJECTS) {
                                const jsonResp = await fetch(`${SPRITE_URLS.OBJECTS}.json`);
                                const spriteData = await jsonResp.json();
                                const code = Object.keys(spriteData).find(c => (objectNameMap[c] || c) === newName);
                                filterCode = code || newName;
                            }
                            this.filterObjectsVTLayer(filterCode);
                            if (this.state.objectsActive && this.state.jimuMapView.view.zoom >= ZOOM.FEATURES_INTERACTIVE) {
                                if (this.mapillaryObjectsFeatureLayer) this.state.jimuMapView.view.map.remove(this.mapillaryObjectsFeatureLayer);
                                this.mapillaryObjectsFeatureLayer = null;
                                this._cancelObjectsFetch = false;
                                await this.loadMapillaryObjectsFromTilesBBox(true);
                                if (this.mapillaryObjectsFeatureLayer) this.state.jimuMapView.view.map.add(this.mapillaryObjectsFeatureLayer);
                            }
                        });
                    }}
                />

                {/* Splash Screen */}
                <SplashScreen
                    showIntro={this.state.showIntro}
                    filtersLoaded={this.state.filtersLoaded}
                />

                {/* Control Bar */}
                <ControlBar
                    coverageLayerAlwaysOn={this.props.config.coverageLayerAlwaysOn}
                    turboModeOnly={this.props.config.turboModeOnly}
                    hideTurboFilter={this.props.config.hideTurboFilter}
                    enableTrafficSigns={this.props.config.enableTrafficSigns}
                    enableMapillaryObjects={this.props.config.enableMapillaryObjects}
                    isFullscreen={this.state.isFullscreen}
                    tilesActive={this.state.tilesActive}
                    turboModeActive={this.state.turboModeActive}
                    showTurboFilterBox={this.state.showTurboFilterBox}
                    trafficSignsActive={this.state.trafficSignsActive}
                    showTrafficSignsFilterBox={this.state.showTrafficSignsFilterBox}
                    objectsActive={this.state.objectsActive}
                    showObjectsFilterBox={this.state.showObjectsFilterBox}
                    jimuMapView={this.state.jimuMapView}
                    onToggleFullscreen={this.toggleFullscreen}
                    onToggleTiles={this.toggleMapillaryTiles}
                    onToggleTurboMode={this._handleToggleTurboMode}
                    onToggleTurboFilter={() => {
                        if (!this.state.turboModeActive) return;
                        this.setState(prev => ({ showTurboFilterBox: !prev.showTurboFilterBox }));
                    }}
                    onToggleTrafficSigns={this.toggleMapillaryTrafficSigns}
                    onToggleTrafficSignsFilter={() => {
                        if (!this.state.trafficSignsActive) return;
                        this.setState(prev => ({ showTrafficSignsFilterBox: !prev.showTrafficSignsFilterBox }));
                    }}
                    onToggleObjects={this.toggleMapillaryObjects}
                    onToggleObjectsFilter={() => {
                        if (!this.state.objectsActive) return;
                        this.setState(prev => ({ showObjectsFilterBox: !prev.showObjectsFilterBox }));
                    }}
                />
            </div>
        );

        /**
            * FULLSCREEN MODE BLOCK (portal to body)
        */
        const fullscreenMode = ReactDOM.createPortal(
            <div style={fullscreenOverlayStyle}>
                {viewerArea}
                <button
                    onClick={this.toggleFullscreen}
                    title="Exit Fullscreen"
                    style={fullscreenExitButtonStyle}
                >
                    <Icons.Minimize />
                </button>

                {/* Toggle Minimap Button */}
                <button
                    onClick={() => this.setState(prev => ({ showMinimap: !prev.showMinimap }))}
                    title={this.state.showMinimap ? "Hide Minimap" : "Show Minimap"}
                    style={fullscreenMinimapToggleButtonStyle}
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
                    style={getMinimapContainerStyle(this.state.showMinimap)}
                />
            </div>,
            document.body
        );
        /** Return either normal or fullscreen layout */
        return this.state.isFullscreen ? fullscreenMode : normalMode;
    }}