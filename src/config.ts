import { ImmutableObject } from 'jimu-core';

export interface Config {

  /**
    * Mapillary API access token used to authenticate requests to the Mapillary services.
    * Required for loading imagery, vector tiles, and related Mapillary data.
    * Accessed in widget via: this.props.config.mapillaryAccessToken
  */
  mapillaryAccessToken?: string;

  /**
    * If true, synchronizes the map view with the currently displayed image.
    * When the image changes, the map automatically centers on that image location.
    * Accessed in widget via: this.props.config.syncMapWithImage
  */
  syncMapWithImage?: boolean;

  /**
    * Defines the anchor position for map synchronization when `syncMapWithImage` is enabled.
    * Determines where the current image location should appear within the map view relative to the center.
    * Options:
    * - `'center'` (Default): Centers the map directly on the current image.
    * - `'east'`: Positions the image on the **Right** side of the map (shifts map center West). Best for widgets docked on the **Left**.
    * - `'west'`: Positions the image on the **Left** side of the map (shifts map center East). Best for widgets docked on the **Right**.
    * - `'north'`: Positions the image at the **Top** of the map (shifts map center South). Best for widgets docked at the **Bottom**.
    * - `'south'`: Positions the image at the **Bottom** of the map (shifts map center North). Best for widgets docked at the **Top**.
  */
  syncMapPosition?: string;

    /**
    * If true, forces the widget to stay in Turbo Mode and may restrict non-turbo UI.
    * Accessed in widget via: this.props.config.turboModeOnly
  */
  turboModeOnly: boolean;

  /**
    * If true, the Mapillary Vector Tile (green lines/dots) layer loads immediately upon map ready.
    * Accessed in widget via: this.props.config.coverageLayerAlwaysOn
  */
  coverageLayerAlwaysOn: boolean;

  /**
    * If true, hides the individual image points (circles) on the Mapillary coverage layer.
  */
  hideCoverageCircles?: boolean;

  /**
    * Optional Mapillary username to filter data by default.
    * Accessed in widget via: this.props.config.turboCreator
  */
  turboCreator?: string; 

    // Turbo Coverage Presets
  /**
    * Default start date filter for Turbo Mode coverage (ISO yyyy-mm-dd).
    * Pre-populates the start date input when the widget initialises.
    * Accessed in widget via: this.props.config.turboDefaultStartDate
  */
  turboDefaultStartDate?: string;

  /**
    * Default end date filter for Turbo Mode coverage (ISO yyyy-mm-dd).
    * Pre-populates the end date input when the widget initialises.
    * Accessed in widget via: this.props.config.turboDefaultEndDate
  */
  turboDefaultEndDate?: string;

  /**
    * Default panorama-only filter for Turbo Mode.
    * - `true`  → show only panoramic images
    * - `false` → show only non-panoramic images
    * - `undefined` / not set → show all (no filter)
    * Accessed in widget via: this.props.config.turboDefaultIsPano
  */
  turboDefaultIsPano?: boolean | null;

  /**
    * If true, Turbo Mode coverage points are coloured by their capture year
    * when the widget first loads (pre-enables the "Color by Date" toggle).
    * Accessed in widget via: this.props.config.turboDefaultColorByDate
  */
  turboDefaultColorByDate?: boolean;

  /**
    * If true, the legend overlay inside the viewer is hidden.
  */
  hideLegend?: boolean;
  
  /**
    * If true, the info box (lat/lon, zoom, address) inside the viewer is hidden.
  */
  hideInfoBox?: boolean;

  /**
    * If true, the Mapillary "bearing" component (visual indicator of direction) is deactivated.
  */
  hideBearing?: boolean;

  /**
    * If true, the Mapillary "zoom" component (+/- buttons) is deactivated.
  */
  hideZoom?: boolean;

  /**
    * If true, the filter button (magnifying glass) inside the Turbo Mode controls is hidden.
    * This prevents users from changing the username/date filters.
  */
  hideTurboFilter?: boolean;
  
  /**
    * If true, the button to download the current high-res image is hidden.
  */
  hideImageDownload?: boolean;

  /**
    * If true, the Time Travel button (clock icon) is hidden even if historical data exists.
  */
  hideTimeTravel?: boolean;
  
  /**
	  * If true, the Share button (network icon) is hidden.
  */
  hideShareButton?: boolean;

  /**
	  * If true, hides the Lock Map Rotation button (only visible in 3D mode).
  */
  hideSyncHeadingButton?: boolean;

  /**
	  * If true, hides the Center Map on Current Frame button.
  */
  hideCenterMapButton?: boolean;

  /**
    * Controls the visibility/availability of the Traffic Signs button and functionality.
    * Accessed in widget via: this.props.config.enableTrafficSigns
  */
  enableTrafficSigns: boolean;

  /**
    * Controls the visibility/availability of the Mapillary Objects (points) button and functionality.
    * Accessed in widget via: this.props.config.enableMapillaryObjects
  */
  enableMapillaryObjects: boolean;

  /**
    * 0 = Letterbox, 1 = Fill
  */
  renderMode?: number;

  /**
    * 0 = Default (Smooth), 1 = Instantaneous
  */
  transitionMode?: number;

  /**
    * Horizontal camera center (0 to 1). Default 0.5
  */
  cameraX?: number; 

  /**
    * Vertical camera center (0 to 1). Default 0.5
  */
  cameraY?: number; 
  /**
    * If true, enables console.log outputs for debugging.
  */
  debugMode?: boolean;

}

export type IMConfig = ImmutableObject<Config>;