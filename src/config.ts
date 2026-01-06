import { ImmutableObject } from 'jimu-core';

export interface Config {
  mapillaryAccessToken?: string;
  // New settings
  enableTrafficSigns: boolean;
  enableMapillaryObjects: boolean;
  turboModeOnly: boolean;
}

export type IMConfig = ImmutableObject<Config>;