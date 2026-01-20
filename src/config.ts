import { ImmutableObject } from 'jimu-core';

export interface Config {
  mapillaryAccessToken?: string;
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
    * Optional Mapillary username to filter data by default.
    * Accessed in widget via: this.props.config.turboCreator
  */
  turboCreator?: string; 
  
  /**
    * Optional border color for the Mapillary viewer or widget container.
    * Useful for visual integration with the host application theme.
    * Accessed in widget via: this.props.config.borderColor
  */
  borderColor?: string;

  /**
    * If true, synchronizes the map view with the currently displayed image.
    * When the image changes, the map automatically centers on that image location.
    * Accessed in widget via: this.props.config.syncMapWithImage
  */
  syncMapWithImage?: boolean;

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
}

export type IMConfig = ImmutableObject<Config>;