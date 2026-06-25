/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { glassStyles } from "../utils/styles";
import * as Icons from "./Icons";
import { ImageUtilityGroupProps } from "./types";

/**
    * ImageUtilityGroup
    * Floating vertical button strip rendered inside the viewer area.
    * Contains: Time Travel, Share, Download, Sync Heading, Center Map.
    * Each button is independently hidden via config flags.
*/
export const ImageUtilityGroup: React.FC<ImageUtilityGroupProps> = ({
    // config flags
    hideTimeTravel,
    hideShareButton,
    hideImageDownload,
    hideSyncHeadingButton,
    hideCenterMapButton,
    hidePointCloud,
    // state
    hasTimeTravel,
    isDownloading,
    syncHeading,
    is3D,
    imageId,
    sequenceImages,
    pointCloudLoading,
    pointCloudVisible,
    pointCloudAvailable,
    // callbacks
    onTimeTravel,
    onShare,
    onDownload,
    onToggleSyncHeading,
    onCenterMap,
    onTogglePointCloud,
}) => (
    <div
        className="glass-image-utility-panel"
        style={{
            position: "absolute",
            bottom: "22px",
            right: "55px",
            zIndex: 10000,
            gap: "3px",
            padding: "1px 3px 1px 2px",
            background: "rgba(20, 20, 20, 0.4)",
            backdropFilter: "blur(1px)",
            WebkitBackdropFilter: "blur(1px)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.30)",
        }}
    >
        {/* 1. Time Travel */}
        {!hideTimeTravel && hasTimeTravel && (
            <button
                className="utility-button"
                title="Open in Mapillary Time Travel"
                onClick={() => {
                    const currentImg = sequenceImages.find(i => i.id === imageId);
                    if (currentImg) onTimeTravel(currentImg.lat, currentImg.lon, imageId!);
                }}
                style={glassStyles.getButtonStyle(true, "rgba(240, 185, 5, 0.3)")}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1.05)")}
            >
                <Icons.TimeTravel style={{ color: "#FFD700" }} />
            </button>
        )}

        {/* 2. Share */}
        {!hideShareButton && (
            <button
                className="utility-button"
                title="Share current view"
                onClick={onShare}
                style={glassStyles.getButtonStyle(false, "rgba(255, 255, 255, 0.2)")}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
                <Icons.Share />
            </button>
        )}

        {/* 3. Download */}
        {!hideImageDownload && (
            <button
                className="utility-button"
                title="Download current image (High Res)"
                onClick={onDownload}
                style={glassStyles.getButtonStyle(false, "rgba(255, 255, 255, 0.2)")}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
                {isDownloading ? (
                    <div style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid #fff",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                    }} />
                ) : (
                    <Icons.Download />
                )}
            </button>
        )}

        {/* 4. Sync Heading (3D only) */}
        {is3D && !hideSyncHeadingButton && (
            <button
                className="utility-button"
                title={syncHeading ? "Lock Map Rotation (Fixed North)" : "Rotate The Map With the Camera"}
                onClick={onToggleSyncHeading}
                style={{
                    ...glassStyles.getButtonStyle(syncHeading, "rgba(52, 152, 219, 0.9)"),
                    boxShadow: syncHeading ? "0 0 10px rgba(52, 152, 219, 0.6)" : "none",
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
                {syncHeading ? <Icons.CompassLocked /> : <Icons.CompassUnlocked />}
            </button>
        )}

        {/* 5. Center Map */}
        {!hideCenterMapButton && (
            <button
                className="utility-button"
                title="Center map on current frame"
                onClick={onCenterMap}
                style={glassStyles.getButtonStyle(false, "rgba(255, 255, 255, 0.2)")}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
                <Icons.Crosshair size={16} />
            </button>
        )}

        {/* 6. Point Cloud, 3D only, hidden when no sfm_cluster or config hides it */}
        {is3D && !hidePointCloud && (
            <button
                className="utility-button"
                title={
                    pointCloudLoading
                        ? "Loading point cloud…"
                        : pointCloudAvailable === false
                        ? "No point cloud available for this image"
                        : pointCloudVisible
                        ? "Hide point cloud"
                        : "Load point cloud"
                }
                onClick={pointCloudLoading || pointCloudAvailable === false
                    ? undefined
                    : onTogglePointCloud
                }
                style={{
                    ...glassStyles.getButtonStyle(
                        !!pointCloudVisible,
                        "rgba(120, 80, 255, 0.45)"
                    ),
                    opacity: pointCloudAvailable === false ? 0.35 : 1,
                    cursor: pointCloudLoading || pointCloudAvailable === false
                        ? "default"
                        : "pointer",
                    boxShadow: pointCloudVisible
                        ? "0 0 10px rgba(120, 80, 255, 0.5)"
                        : "none",
                }}
                onMouseEnter={e => {
                    if (!pointCloudLoading && pointCloudAvailable !== false)
                        e.currentTarget.style.transform = "scale(1.15)";
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = pointCloudVisible
                        ? "scale(1.1)"
                        : "scale(1)";
                }}
            >
                {pointCloudLoading ? (
                    <div style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "rgba(120, 80, 255, 0.9)",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                    }} />
                ) : (
                    <Icons.PointCloud size={16} />
                )}
            </button>
        )}
    </div>
);
