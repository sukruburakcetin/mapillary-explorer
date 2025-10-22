/** @jsx jsx */
import {React, AllWidgetProps, jsx} from "jimu-core";
import {JimuMapViewComponent, JimuMapView} from "jimu-arcgis";
import ReactDOM from "react-dom";

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
    private coneSpreads = [60, 40, 30, 20]; // width in degrees
    private coneLengths = [10, 15, 20, 30];  // length in meters, tuned to 5m spacing
    private zoomStepIndex = 0;              // start zoomed out
    private mapillaryVTLayer: __esri.VectorTileLayer | null = null;

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
        selectedSequenceId: null
    };

    constructor(props: AllWidgetProps<any>) {
        super(props);
		
		// Read accessToken from manifest.json properties - you should use your own token start with MLY
		this.accessToken = props.manifest?.properties?.mapillaryAccessToken || "";
		// console.log("Loaded Access Token:", this.accessToken);

        this.onActiveViewChange = this.onActiveViewChange.bind(this);
        this.handleMapClick = this.handleMapClick.bind(this);
    }
	
    // --- Clean up everything when widget closes or reloads ---
    // Stops animation intervals, removes all map graphics,
    // destroys Mapillary viewer instance, clears DOM container,
    // and resets internal state if requested.
	private cleanupWidgetEnvironment(resetState: boolean = false) {
		// Stop pulsing point
		if (this.currentGreenGraphic && (this.currentGreenGraphic as any)._pulseInterval) {
			clearInterval((this.currentGreenGraphic as any)._pulseInterval);
			this.currentGreenGraphic = null;
		}

		// Remove all graphics from map
		if (this.state.jimuMapView) {
			try {
				this.state.jimuMapView.view.graphics.removeAll();
			} catch (err) {
				console.warn("Error clearing graphics:", err);
			}
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
				address: null
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
     * 
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
     --- Toggles Mapillary Vector Tile Layer on/off in the current map view ---
     * 
     * - If layer is already in the map, remove it
     * - If layer is not in the map, add it
     * - Controlled by button in UI ("🗺️" icon)
     * - Uses `this.mapillaryVTLayer` created by initMapillaryLayer()
    */
    private toggleMapillaryTiles = () => {
        const { jimuMapView } = this.state;
        if (!jimuMapView || !this.mapillaryVTLayer) return;

        const layers = jimuMapView.view.map.layers;
        if (layers.includes(this.mapillaryVTLayer)) {
            // Layer is currently ON → remove it from map
            jimuMapView.view.map.remove(this.mapillaryVTLayer);
        } else {
            jimuMapView.view.map.add(this.mapillaryVTLayer);
        }
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
                        sequenceId: null,                // keep it hidden until user clicks
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
            jimuMapView.view.graphics.removeAll();

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
        if (jmv) {
            console.log("Active MapView set");
            this.setState({jimuMapView: jmv});
            jmv.view.on("click", this.handleMapClick);
        }
    }

    private showNoImageMessage() {
        if (!this.viewerContainer.current) return;
        this.viewerContainer.current.innerHTML = "";
        const message = document.createElement("div");
        message.textContent =
            "🚫 No nearby Mapillary image found at this location.";
        message.style.cssText = `
		  display:flex;
		  justify-content:center;
		  align-items:center;
		  width:100%;
		  height:100%;
		  font-size:14px;
		  color:#666;
		  background:#f9f9f9;
		  text-align:center;
		  opacity:0;
		  transition: opacity 0.6s ease-in-out;
		`;
        this.viewerContainer.current.appendChild(message);
        setTimeout(() => (message.style.opacity = "1"), 50);
        setTimeout(() => {
            message.style.opacity = "0";
            setTimeout(() => message.remove(), 600);
        }, 4000);
    }

    private clearNoImageMessage() {
        if (!this.viewerContainer.current) return;
        const existingMessage =
            this.viewerContainer.current.querySelector("div");
        if (
            existingMessage &&
            existingMessage.textContent?.includes("No nearby Mapillary")
        ) {
            existingMessage.remove();
        }
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

    private drawCone(lon: number, lat: number, heading: number, radiusMeters = 10, spreadDeg = 60) {
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
                const sequences = await this.getSequencesInBBox(lon, lat, this.accessToken);
                if (!sequences.length) {
                    this.showNoImageMessage();
                    return;
                }

                // Save sequences for dropdown.
                this.setState({ availableSequences: sequences });

                // Pick closest image inside first sequence.
                const chosenSeq = sequences[0];
                const chosenImg = chosenSeq.images.reduce((closest, img) => {
                    const dist = this.distanceMeters(img.lat, img.lon, lat, lon);
                    return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                }, null as (typeof chosenSeq.images[0] & { dist: number }) | null);

                // Track selection in state.
                this.setState({
                    selectedSequenceId: chosenSeq.sequenceId,
                    lon,
                    lat
                });

                this.clearNoImageMessage();

                // Load sequence starting at chosen image.
                await this.loadSequenceById(chosenSeq.sequenceId, chosenImg.id);

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
                    const sequences = await this.getSequencesInBBox(lon, lat, this.accessToken);
                    if (!sequences.length) {
                        this.showNoImageMessage();
                        return;
                    }

                    this.setState({ availableSequences: sequences });

                    // Pick closest image in first found sequence
                    const newSeq = sequences[0];
                    const newClosest = newSeq.images.reduce((c, img) => {
                        const d = this.distanceMeters(img.lat, img.lon, lat, lon);
                        return (!c || d < c.dist) ? { ...img, dist: d } : c;
                    }, null as any);

                    // Update state / selection
                    this.setState({ selectedSequenceId: newSeq.sequenceId, lon, lat });
                    this.clearNoImageMessage();

                    // Load new sequence starting at closest image
                    await this.loadSequenceById(newSeq.sequenceId, newClosest.id);
                    return; // Don't run rest below
                }

                // If within threshold → stick with current sequence
                await this.loadSequenceById(selectedSequenceId, closestImg.id);
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
        const bboxSize = 0.0001; // ~55 meters
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
                        }} />
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

                {!this.state.imageId && (
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
					  <span style={{fontSize: "12px", marginTop: "100px", opacity: 0.9}}>
						🛈 Click any point on the map to show panorama
					  </span>
											<span style={{fontSize: "10px", opacity: 0.7}}>
						(Mapillary street-level imagery will appear here)
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

                {/* Sequence picker overlay */}
                {this.state.availableSequences && this.state.availableSequences.length > 1 && (
                    <div style={{
                        position: "absolute",
                        top: "9px", // Below info box which is at 10px
                        left: "40px", // Hug top-right
                        background: "rgba(0,0,0,0.6)", // Semi-transparent dark
                        padding: "2px 2px 1px 4px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        zIndex: 10000,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                        color: "#fff"
                    }}>
                        <label style={{ marginRight: "6px", fontWeight: 500 }}>Sequence:</label>
                        <select
                            value={this.state.selectedSequenceId || ""}
                            onChange={async (e) => {
                            const seqId = e.target.value;

                            // Update selected sequence ID in state
                            this.setState({ selectedSequenceId: seqId });

                            // Clear old active frame before loading new sequence
                            this.clearGreenPulse();

                            // If we already have lon/lat of last click, go to closest image for that point
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
                                background: "rgb(255, 255, 255, 0.8)",
                                color: "#000",
                                borderRadius: "4px",
                                border: "none",
                                padding: "2px 4px",
                                fontSize: "8px",
                                cursor: "pointer"
                            }}
                        >
                        {this.state.availableSequences.map(seq => {
                            const date = seq.capturedAt
                                ? new Date(seq.capturedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                : "Unknown date";

                            return (
                                <option key={seq.sequenceId} value={seq.sequenceId}>
                                {seq.sequenceId.slice(0, 3)}... ({seq.images.length} nearby) — {date}
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
                            Sequence images
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

                {/* Fullscreen toggle button */}
                <button
                    onClick={this.toggleFullscreen}
                    title="Maximize/Fullscreen"
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        zIndex: 10000,
                        background: 'rgba(2, 117, 216, 0.7)',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    🗖
                </button>

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

                <button
                    onClick={this.toggleMapillaryTiles}
                    title="Toggle Mapillary Layer"
                    style={{
                        position: 'absolute',
                        top: '50px',
                        left: '10px',
                        background: 'rgba(53, 175, 109, 0.7)',
                        color: '#fff',
                        borderRadius: '3px',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        zIndex: 10000
                    }}
                >
                    🗺️

              
                </button>

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