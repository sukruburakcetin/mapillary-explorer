/** @file Shared prop types for Mapillary Explorer sub-components */

import { JimuMapView } from "jimu-arcgis";

// Shared option shape (GlassSelect)
export interface FilterOption {
    value: string;
    label: string;
    iconUrl: string | null;
}

// Alternate image shape
export interface AlternateImage {
    id: string;
    detectionId: string;
    thumbUrl: string;
    capturedAt: number;
    geometry: { type: "Point"; coordinates: [number, number] };
}

// Legend props
export interface LegendProps {
    turboModeActive: boolean;
    onClearCache: () => void;
}

// InfoBox props
export interface InfoBoxProps {
    // visibility / config
    hideInfoBox?: boolean;
    turboCreator?: string;
    // state
    imageId: string | null;
    address: string | null;
    currentZoom?: number;
    jimuMapViewZoom?: number;
    sequenceImages: { id: string; lat: number; lon: number; captured_at?: number }[];
    turboModeActive?: boolean;
    turboColorByDate?: boolean;
    turboYearLegend?: { year: string; color: string }[];
    selectedTurboYear?: string | null;
    trafficSignsActive?: boolean;
    objectsActive?: boolean;
    detectionsActive: boolean;
    showAiTags: boolean;
    alternateImages: AlternateImage[];
    isFetchingAlternates: boolean;
    accessToken: string;
    // callbacks
    onYearLegendClick: (year: string) => void;
    onDownloadFeatures: () => void;
    onToggleDetections: () => void;
    onToggleAiTags: () => void;
    onCloseAlternates: () => void;
    onSelectAlternateImage: (img: AlternateImage) => void;
}

// FilterBar props
export interface FilterBarProps {
    // visibility
    showTurboFilterBox: boolean;
    showTrafficSignsFilterBox: boolean;
    showObjectsFilterBox: boolean;
    // turbo filter state
    turboFilterUsername: string;
    turboFilterStartDate?: string;
    turboFilterEndDate?: string;
    turboFilterIsPano?: boolean;
    turboColorByDate?: boolean;
    turboModeActive?: boolean;
    // locked creator (from settings)
    turboCreator?: string;
    // options
    trafficSignsFilterValue: FilterOption;
    trafficSignsOptions: FilterOption[];
    objectsFilterValue: FilterOption;
    objectsOptions: FilterOption[];
    // callbacks - turbo
    onTurboUsernameChange: (val: string) => void;
    onTurboUsernameEnter: () => void;
    onTurboUsernameClear: () => void;
    onTurboStartDateChange: (dateString: string) => void;
    onTurboEndDateChange: (dateString: string) => void;
    onTurboIsPanoChange: (val: boolean | undefined) => void;
    onTurboColorByDateChange: (val: boolean) => void;
    // callbacks - traffic signs / objects
    onTrafficSignsFilterChange: (selected: FilterOption) => void;
    onObjectsFilterChange: (selected: FilterOption) => void;
}

// SplashScreen props
export interface SplashScreenProps {
    showIntro: boolean;
    filtersLoaded: boolean;
}

// ControlBar props
export interface ControlBarProps {
    // config flags
    coverageLayerAlwaysOn?: boolean;
    turboModeOnly?: boolean;
    hideTurboFilter?: boolean;
    enableTrafficSigns?: boolean;
    enableMapillaryObjects?: boolean;
    // state
    isFullscreen: boolean;
    tilesActive?: boolean;
    turboModeActive?: boolean;
    showTurboFilterBox: boolean;
    trafficSignsActive?: boolean;
    showTrafficSignsFilterBox: boolean;
    objectsActive?: boolean;
    showObjectsFilterBox: boolean;
    jimuMapView: JimuMapView | null;
    // callbacks
    onToggleFullscreen: () => void;
    onToggleTiles: () => void;
    onToggleTurboMode: () => void;
    onToggleTurboFilter: () => void;
    onToggleTrafficSigns: () => void;
    onToggleTrafficSignsFilter: () => void;
    onToggleObjects: () => void;
    onToggleObjectsFilter: () => void;
}

// Sequence shape
export interface SequenceInfo {
    sequenceId: string;
    images?: { id: string; lon: number; lat: number; }[];
    capturedAt?: string;
    _color?: number[];
}

// ImageUtilityGroup props
export interface ImageUtilityGroupProps {
    // config flags
    hideTimeTravel?: boolean;
    hideShareButton?: boolean;
    hideImageDownload?: boolean;
    hideSyncHeadingButton?: boolean;
    hideCenterMapButton?: boolean;
    // state
    hasTimeTravel: boolean;
    isDownloading?: boolean;
    syncHeading: boolean;
    is3D: boolean;
    imageId: string | null;
    sequenceImages: { id: string; lat: number; lon: number }[];
    // callbacks
    onTimeTravel: (lat: number, lon: number, imageId: string) => void;
    onShare: () => void;
    onDownload: () => void;
    onToggleSyncHeading: () => void;
    onCenterMap: () => void;
}