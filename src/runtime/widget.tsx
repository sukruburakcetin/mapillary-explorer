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

    state: State = {
        jimuMapView: null,
        imageId: null,
        sequenceId: null,
        sequenceImages: [],
        lon: null,
        lat: null,
        isFullscreen: false,
		address: null,
        isLoading: false
    };
	private accessToken: string = "";
    constructor(props: AllWidgetProps<any>) {
        super(props);
		
		    // Read from manifest
		this.accessToken = props.manifest?.properties?.mapillaryAccessToken || "";
		console.log("Loaded Access Token:", this.accessToken);

        this.onActiveViewChange = this.onActiveViewChange.bind(this);
        this.handleMapClick = this.handleMapClick.bind(this);
    }
	
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
	// Fullscreen, expand
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

    async componentDidMount() {
        try {
            const [Graphic, Point, SimpleMarkerSymbol] =
                await loadArcGISJSAPIModules([
                    "esri/Graphic",
                    "esri/geometry/Point",
                    "esri/symbols/SimpleMarkerSymbol",
                ]);
            this.ArcGISModules = {Graphic, Point, SimpleMarkerSymbol};
            console.log("ArcGIS API modules loaded");
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
                console.log("✅ Mapillary JS loaded", !!window.mapillary);
                window.define = originalDefine;
                resolve();
            };
            script.onerror = () => {
                console.error("❌ Failed to load Mapillary JS");
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

    // Utility for geo distance (Haversine)
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


    private async getImageHeading(imageId: string, accessToken: string): Promise<number | null> {
        try {
            const url = `https://graph.mapillary.com/${imageId}?fields=computed_compass_angle`;
            const response = await fetch(url, {
                headers: {Authorization: `OAuth ${accessToken}`}
            });
            const data = await response.json();
            return typeof data.computed_compass_angle === 'number' ? data.computed_compass_angle : null;
        } catch {
            return null;
        }
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

    private async handleMapClick(event: __esri.ViewClickEvent) {
        const { jimuMapView, sequenceImages } = this.state;
        if (!jimuMapView) return;

        const point = jimuMapView.view.toMap(event) as __esri.Point;
        let lon = point.longitude;
        let lat = point.latitude;

        // Instant feedback: ripple animation
        this.drawClickRipple(lon, lat);

        // Show loading spinner
        this.setState({ isLoading: true });

        try {
            let imageId: string | null = null;

            // --- Check if clicked near existing blue sequence image ---
            if (sequenceImages.length > 0) {
                const clickedImg = sequenceImages.reduce((closest, img) => {
                    const dist = this.distanceMeters(img.lat, img.lon, lat, lon);
                    return (!closest || dist < closest.dist) ? { ...img, dist } : closest;
                }, null as ({ id: string, lat: number, lon: number, dist: number } | null));

                if (clickedImg && clickedImg.dist < 20) {
                    imageId = clickedImg.id;
                    lon = clickedImg.lon;
                    lat = clickedImg.lat;
                }
            }

            // --- If not found locally, fetch from Mapillary ---
            if (!imageId) {
                imageId = await this.getNearestImage(lon, lat, this.accessToken);
                if (!imageId) {
                    this.showNoImageMessage();
                    return;
                }
            }

            // Set coords + image ID
            this.setState({ lon, lat, imageId });
            this.clearNoImageMessage();

            // --- Get sequence ---
            const sequenceId = await this.getSequenceIdFromImage(imageId, this.accessToken);
            if (!sequenceId) return;
            this.setState({ sequenceId });

            const updatedSequence = await this.getSequenceWithCoords(sequenceId, this.accessToken);
            this.setState({ sequenceImages: updatedSequence });
            this.saveSequenceCache(sequenceId, updatedSequence);

            // --- Setup Mapillary viewer ---
            const { Viewer } = window.mapillary;
            if (this.mapillaryViewer) {
                try { this.mapillaryViewer.remove(); } catch {}
                this.mapillaryViewer = null;
            }

            if (this.viewerContainer.current) {
                this.mapillaryViewer = new Viewer({
                    container: this.viewerContainer.current,
                    accessToken: this.accessToken,
                    imageId
                });

                this.mapillaryViewer.on("bearing", (event: any) => {
                    const newBearing = event.bearing;
                    const currentId = this.state.imageId;
                    if (!currentId) return;
                    const img = this.state.sequenceImages.find(s => s.id === currentId);
                    if (!img || !this.currentConeGraphic) return;
                    const view = this.state.jimuMapView?.view;
                    if (!view) return;
                    view.graphics.remove(this.currentConeGraphic);
                    this.currentConeGraphic = this.drawCone(img.lon, img.lat, newBearing);
                });

                this.mapillaryViewer.on("image", async (event: any) => {
                    const newId = event.image.id;
                    const img = this.state.sequenceImages.find(s => s.id === newId);
                    if (!img) return;
                    const view = this.state.jimuMapView?.view;
                    if (!view) return;

                    this.setState({ imageId: newId });

                    if (this.currentGreenGraphic) {
                        if ((this.currentGreenGraphic as any)._pulseInterval) {
                            clearInterval((this.currentGreenGraphic as any)._pulseInterval);
                        }
                        view.graphics.remove(this.currentGreenGraphic);
                    }

                    // Remove all cones
                    view.graphics.forEach(g => {
                        if ((g as any).__isCone) {
                            view.graphics.remove(g);
                        }
                    });

                    this.currentGreenGraphic = this.drawPulsingPoint(img.lon, img.lat, [0, 255, 0, 1]);

                    // Fetch address for display
                    this.fetchReverseGeocode(img.lat, img.lon);

                    const currentBearing = await this.mapillaryViewer.getBearing();
                    if (currentBearing !== null) {
                        this.currentConeGraphic = this.drawCone(img.lon, img.lat, currentBearing);
                    }
                });
            }

            // --- Clear graphics ---
            if (this.currentGreenGraphic) {
                if ((this.currentGreenGraphic as any)._pulseInterval) {
                    clearInterval((this.currentGreenGraphic as any)._pulseInterval);
                }
                try { jimuMapView.view.graphics.remove(this.currentGreenGraphic); } catch {}
                this.currentGreenGraphic = null;
            }

            jimuMapView.view.graphics.removeAll();

            // Draw markers
            this.drawPoint(lon, lat); // red snap marker
            updatedSequence.forEach(img => {
                if (img.id !== imageId) {
                    this.drawPointWithoutRemoving(img.lon, img.lat, [0, 0, 255, 1]);
                }
            });
            const currentImg = updatedSequence.find(img => img.id === imageId);
            if (currentImg) {
                this.currentGreenGraphic = this.drawPulsingPoint(currentImg.lon, currentImg.lat, [0, 255, 0, 1]);
            }

        } catch (err) {
            console.error("Map click error:", err);
        } finally {
            // Hide spinner
            this.setState({ isLoading: false });
        }
    }

    private async getNearestImage(lon: number, lat: number, accessToken: string) {
        const bboxSize = 0.0001; // ~55 meters
        const url = `https://graph.mapillary.com/images?fields=id,geometry&bbox=${
            lon - bboxSize
        },${lat - bboxSize},${lon + bboxSize},${lat + bboxSize}&limit=50`;

        try {
            const response = await fetch(url, {
                headers: {Authorization: `OAuth ${accessToken}`},
            });
            const data = await response.json();
            if (!data.data?.length) return null;

            // Find actual closest image
            let closest = null;
            for (const img of data.data) {
                const coords = img.geometry?.coordinates;
                if (coords?.length === 2) {
                    const dist = this.distanceMeters(lat, lon, coords[1], coords[0]);
                    if (!closest || dist < closest.dist) {
                        closest = {id: img.id, dist};
                    }
                }
            }
            return closest?.id || null;
        } catch {
            return null;
        }
    }

    private async getSequenceIdFromImage(
        imageId: string,
        accessToken: string
    ): Promise<string | null> {
        const url = `https://graph.mapillary.com/${imageId}?fields=sequence`;
        try {
            const response = await fetch(url, {
                headers: {Authorization: `OAuth ${accessToken}`},
            });
            const data = await response.json();
            return typeof data.sequence === "string" ? data.sequence : null;
        } catch {
            return null;
        }
    }

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
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        zIndex: 10000,
                        background: 'rgba(2, 117, 216, 0.7)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
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