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
}

export type IMConfig = ImmutableObject<Config>;