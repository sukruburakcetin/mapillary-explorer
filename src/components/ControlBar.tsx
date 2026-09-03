/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { glassStyles } from "../utils/styles";
import * as Icons from "../components/Icons";
import { ControlBarProps } from "./types";

/**
    * ControlBar
    * Vertical glass button panel docked at the left edge of the widget.
    * Contains:
    *  - Fullscreen toggle
    *  - Coverage layer toggle (hidden when coverageLayerAlwaysOn)
    *  - Turbo Mode group (main button + filter toggle)
    *  - Traffic Signs group (main button + filter toggle)
    *  - Objects group (main button + filter toggle)
    * All click handlers are passed in as props - this component is purely
    * presentational and owns no state.
*/
export const ControlBar: React.FC<ControlBarProps> = ({
    coverageLayerAlwaysOn,
    turboModeOnly,
    hideTurboFilter,
    enableTrafficSigns,
    enableMapillaryObjects,
    isFullscreen,
    tilesActive,
    turboModeActive,
    showTurboFilterBox,
    trafficSignsActive,
    showTrafficSignsFilterBox,
    objectsActive,
    showObjectsFilterBox,
    jimuMapView,
    onToggleFullscreen,
    onToggleTiles,
    onToggleTurboMode,
    onToggleTurboFilter,
    onToggleTrafficSigns,
    onToggleTrafficSignsFilter,
    onToggleObjects,
    onToggleObjectsFilter
}) => {
    const zoom = jimuMapView?.view?.zoom ?? 0;
    const coverageReady = turboModeActive && zoom >= 16;
    // Individual icon buttons (fullscreen + coverage toggle)
    const singleButtons = [
        {
            id: "fullscreen",
            content: <Icons.Maximize size={20} />,
            onClick: onToggleFullscreen,
            title: "Maximize/Fullscreen",
            bg: "rgba(2, 117, 216, 0.9)",
            active: isFullscreen
        },
        {
            id: "coverage_toggle",
            content: <Icons.MapLayer size={20} />,
            onClick: onToggleTiles,
            title: "Toggle Mapillary Layer",
            bg: "rgba(53, 175, 109, 0.9)",
            active: tilesActive
        }
    ].filter(btn => !(btn.id === "coverage_toggle" && coverageLayerAlwaysOn));

    return (
        <div
            className="glass-control-panel"
            style={glassStyles.container}
        >
            {/* SINGLE ICON BUTTONS */}
            {singleButtons.map((btn, i) => (
                <button
                    className={`unified-control-buttons-mapped${btn.active ? " is-active" : ""}`}
                    key={i}
                    title={btn.title}
                    onClick={btn.onClick}
                    style={glassStyles.getButtonStyle(btn.active, btn.bg)}
                >
                    {btn.content}
                </button>
            ))}

            {/* TURBO MODE GROUP */}
            {(!turboModeOnly || !hideTurboFilter) && (
                <div style={glassStyles.groupContainer(turboModeActive)}>
                    {/* Main Turbo button */}
                    {!turboModeOnly && (
                        <button
                            className={`unified-control-buttons${turboModeActive ? " is-active" : ""}`}
                            title="Toggle Turbo Mode"
                            onClick={onToggleTurboMode}
                            style={glassStyles.getButtonStyle(turboModeActive, "rgba(95, 92, 53, 0.30)")}
                        >
                            <Icons.Turbo size={20}
                                style={{ filter: turboModeActive ? "drop-shadow(0 0 1.2px grey)" : "none" }}
                            />
                        </button>
                    )}
                    {/* Turbo filter toggle */}
                    {!hideTurboFilter && (
                        <button
                            className={`unified-control-buttons-filters${turboModeActive ? " is-hoverable" : ""}`}
                            title="Filter Turbo Mode Coverage"
                            onClick={onToggleTurboFilter}
                            style={{
                                ...glassStyles.getButtonStyle(showTurboFilterBox, "rgba(255, 215, 0, 0.5)", true),
                                opacity: turboModeActive ? 1 : 0.6,
                                cursor: turboModeActive ? "pointer" : "default"
                            }}
                        >
                            <Icons.Filter size={16} />
                        </button>
                    )}
                </div>
            )}

            {/* TRAFFIC SIGNS GROUP */}
            {enableTrafficSigns !== false && (
                <div style={glassStyles.groupContainer(trafficSignsActive)}>
                    <button
                        className={`unified-control-buttons${trafficSignsActive ? " is-active" : ""}`}
                        title="Toggle Mapillary Traffic Signs Layer"
                        onClick={onToggleTrafficSigns}
                        style={glassStyles.getButtonStyle(trafficSignsActive, "rgba(147, 102, 19, 0.3)")}
                    >
                        <Icons.AllMapillaryTrafficSigns size={16}
                            style={{ filter: trafficSignsActive ? "drop-shadow(0 0 1.2px grey)" : "none" }}
                        />
                    </button>
                    <button
                        className={`unified-control-buttons-filters${trafficSignsActive ? " is-hoverable" : ""}`}
                        title="Filter Traffic Signs"
                        onClick={onToggleTrafficSignsFilter}
                        style={{
                            ...glassStyles.getButtonStyle(showTrafficSignsFilterBox, "rgba(255, 165, 0, 0.5)", true),
                            opacity: trafficSignsActive ? 1 : 0.6,
                            cursor: trafficSignsActive ? "pointer" : "default"
                        }}
                    >
                        <Icons.Filter size={16} />
                    </button>
                </div>
            )}

            {/* OBJECTS GROUP */}
            {enableMapillaryObjects !== false && (
                <div style={glassStyles.groupContainer(objectsActive)}>
                    <button
                        className={`unified-control-buttons${objectsActive ? " is-active" : ""}`}
                        title="Toggle Mapillary Objects Layer"
                        onClick={onToggleObjects}
                        style={glassStyles.getButtonStyle(objectsActive, "rgba(155, 55, 55, 0.3)")}
                    >
                        <Icons.AllMapillaryObjects size={16}
                            style={{ filter: objectsActive ? "drop-shadow(0 0 0.2px grey)" : "none" }}
                        />
                    </button>
                    <button
                        className={`unified-control-buttons-filters${objectsActive ? " is-hoverable" : ""}`}
                        title="Filter Objects"
                        onClick={onToggleObjectsFilter}
                        style={{
                            ...glassStyles.getButtonStyle(showObjectsFilterBox, "rgba(255, 60, 60, 0.5)", true),
                            opacity: objectsActive ? 1 : 0.6,
                            cursor: objectsActive ? "pointer" : "default"
                        }}
                    >
                        <Icons.Filter size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};