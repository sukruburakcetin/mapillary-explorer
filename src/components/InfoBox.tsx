/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { React, jsx } from "jimu-core";
import * as Icons from "../components/Icons";
import { InfoBoxProps } from "./types";
import { miniJoyStyle } from "../utils/styles";

interface InfoBoxState {
    isOverflowing: boolean;
    sliderDragValue: number | null;
    sliderDragWidthValue: number | null;
}
/**
    * InfoBox
    * Right-hand side panel stack containing:
    *  - Status / coordinates / address card
    *  - Turbo year-legend with click-to-filter
    *  - Coverage Analysis
    *  - StreetGap community link (route planning / gap finding)
    *  - Feature export button (when traffic signs or objects active)
    *  - AI Overlay toggle button
    *  - AI tag show/hide toggle
    *  - Alternate images panel
*/
export class InfoBox extends React.PureComponent<InfoBoxProps, InfoBoxState> {

    private scrollContainerRef = React.createRef<HTMLDivElement>();

    constructor(props: InfoBoxProps) {
        super(props);
        this.state = {
            isOverflowing: false,
            sliderDragValue: null,
            sliderDragWidthValue: null,
        };
    }

    componentDidMount() {
        this.checkOverflow();
        window.addEventListener('resize', this.checkOverflow);
    }

    componentDidUpdate() {
        this.checkOverflow();
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.checkOverflow);
    }

    checkOverflow = () => {
        if (this.scrollContainerRef.current) {
            const { scrollHeight, clientHeight } = this.scrollContainerRef.current;
            const isOverflowing = scrollHeight > clientHeight;
            if (this.state.isOverflowing !== isOverflowing) {
                this.setState({ isOverflowing });
            }
        }
    };

    render() {
        const { isOverflowing } = this.state;
        const {
            hideInfoBox, turboCreator,
            imageId, address, currentZoom, jimuMapViewZoom,
            sequenceImages, turboModeActive, turboColorByDate,
            turboYearLegend, selectedTurboYear,
            trafficSignsActive, objectsActive,
            detectionsActive, showAiTags,
            alternateImages,
            onYearLegendClick, onDownloadFeatures,
            onToggleDetections, onToggleAiTags,
            onCloseAlternates, onSelectAlternateImage,
            coverageAnalysisLoading, coverageResult,
            coverageSegmentsVisible, onToggleCoverageSegments,
            onRunCoverageAnalysis, onDismissCoverageResult,
            turboPointsAvailable, turboMinZoom = 16,
            hideCoverageAnalysis, pointCloudVisible,
            isMeasureMode, measurePoints,
            onToggleMeasureMode, onClearMeasurement,
            isSightMode, sightObserver, sightTargets,
            onToggleSightMode, onClearSight,
            isViewshedMode, onToggleViewshedMode, onClearViewshed,
            showCalibrationPanel, nudgeStep, onToggleCalibrationPanel,
            onJoystickNudge, onResetCalibration, onSetNudgeStep,
            pointCloudColorMode, onDownloadPointCloud, qualityViewActive, onToggleQualityView,
            nearbyCount, nearbyLoading, nearbyStripOpen, onToggleNearbyStrip,
        } = this.props;

        const currentImg = (imageId && sequenceImages.length > 0)
            ? sequenceImages.find(img => img.id === imageId)
            : null;

        return (
            <div
                ref={this.scrollContainerRef}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    position: "absolute",
                    top: "2px",
                    right: isOverflowing ? "0" : "4px",
                    zIndex: 10002,
                    pointerEvents: "auto",
                    maxHeight: "calc(100% - 120px)",
                    overflowY: "auto",
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(255,255,255,0.25) transparent"
                }}>

                {/* STATUS CARD */}
                {!hideInfoBox && (
                    <div
                        className="info-box"
                        style={{
                            fontSize: "8.5px",
                            color: "white",
                            background: "rgba(0, 0, 0, 0.35)",
                            backdropFilter: "blur(5px)",
                            borderRadius: "6px",
                            width: "80px",
                            textAlign: "left",
                            padding: "5px",
                            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            pointerEvents: "auto"
                        }}
                    >
                        {/* Header / zoom */}
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "3px",
                            opacity: 0.8,
                            fontSize: "10px",
                            borderBottom: "1px solid rgba(255,255,255,0.2)",
                            paddingBottom: "4px"
                        }}>
                            <span style={{ fontWeight: 600, fontSize: "8px" }}>STATUS</span>
                            <span>
                                <Icons.Search size={9} style={{ marginRight: "2px", marginLeft: "2px" }} />
                                <span style={{ fontSize: "8px" }}>
                                    Z: {currentZoom !== undefined ? currentZoom.toFixed(1) : jimuMapViewZoom?.toFixed(1)}
                                </span>
                            </span>
                        </div>

                        {/* Address */}
                        {address && (
                            <div style={{ marginBottom: "3px", color: "#37d582", fontWeight: 500 }}>
                                <Icons.Globe size={12} style={{ marginRight: "4px" }} />
                                {address}
                            </div>
                        )}

                        {/* Coordinates */}
                        {currentImg && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", opacity: 0.9 }}>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                    <span style={{ width: "25px", fontSize: "9px", color: "#aaa" }}>LAT</span>
                                    <span>{currentImg.lat.toFixed(6)}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                    <span style={{ width: "25px", fontSize: "9px", color: "#aaa" }}>LON</span>
                                    <span>{currentImg.lon.toFixed(6)}</span>
                                </div>
                            </div>
                        )}

                        {/* Locked creator tag */}
                        {turboCreator && (
                            <div style={{
                                marginTop: "4px",
                                padding: "1px 3px",
                                background: "rgba(55, 213, 130, 0.2)",
                                border: "1px solid rgba(55, 213, 130, 0.4)",
                                borderRadius: "3px",
                                fontSize: "9px",
                                color: "#37d582",
                                textAlign: "center"
                            }}>
                                {turboCreator}
                            </div>
                        )}

                        {/* Street Coverage Analysis button + StreetGap link */}
                        {turboModeActive && !hideCoverageAnalysis && (() => {
                            const zoom    = currentZoom ?? jimuMapViewZoom ?? 0;
                            const belowZoom = zoom < turboMinZoom;
                            const noPoints  = !turboPointsAvailable;
                            const canRun    = !belowZoom && !noPoints && !coverageAnalysisLoading;

                            const tooltip = coverageAnalysisLoading
                                ? "Analysing…"
                                : belowZoom
                                ? `Zoom in to street level (≥ ${turboMinZoom}) first`
                                : noPoints
                                ? "No Turbo coverage points loaded in this area"
                                : "Run Street Coverage Analysis";

                            const btnBg = canRun && coverageResult
                                ? "rgba(30, 144, 255, 0.42)"
                                : "rgba(30, 144, 255, 0.17)";

                            return (
                                <React.Fragment>
                                    {/* Coverage Analysis button */}
                                    <div style={{
                                        marginTop: "5px",
                                        borderTop: "1px solid rgba(255,255,255,0.08)",
                                        paddingTop: "4px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}>
                                        <button
                                            onClick={canRun ? onRunCoverageAnalysis : undefined}
                                            title={tooltip}
                                            style={{
                                                width: "100%",
                                                textAlign: "center",
                                                borderRadius: "4px",
                                                border: `1px solid ${canRun ? "rgba(30, 144, 255, 0.4)" : "rgba(255,255,255,0.1)"}`,
                                                background: btnBg,
                                                color: canRun ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.65)",
                                                fontSize: "7px",
                                                fontWeight: 500,
                                                cursor: canRun ? "pointer" : "not-allowed",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "4px",
                                                transition: "background 0.2s, color 0.2s",
                                                whiteSpace: "nowrap",
                                                opacity: canRun ? 1 : 0.5,
                                            }}
                                            onMouseEnter={e => {
                                                if (canRun) e.currentTarget.style.background = "rgba(30, 144, 255, 0.3)";
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = btnBg;
                                            }}
                                        >
                                            {coverageAnalysisLoading
                                                ? (
                                                    <React.Fragment>
                                                        <div style={{
                                                            width: "8px", height: "8px",
                                                            border: "1.5px solid rgba(255,255,255,0.2)",
                                                            borderTopColor: "#1e90ff",
                                                            borderRadius: "50%",
                                                            animation: "spin 0.8s linear infinite",
                                                            flexShrink: 0,
                                                        }} />
                                                        Analysing…
                                                    </React.Fragment>
                                                )
                                                : (
                                                    <span>
                                                        {belowZoom
                                                            ? "Zoom in to analyse"
                                                            : noPoints
                                                            ? "No points"
                                                            : coverageResult
                                                            ? "Run New Analysis"
                                                            : "Analyse Coverage"}
                                                    </span>
                                                )
                                            }
                                        </button>
                                    </div>

                                    {/* StreetGap community tool */}
                                    <div style={{
                                        marginTop: "4px",
                                        borderTop: "1px solid rgba(255,255,255,0.06)",
                                        paddingTop: "4px",
                                    }}>
                                        <a
                                            href="https://loprz.github.io/streetgap-web/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="StreetGap is a community tool to plan routes and find detailed coverage gaps. Created by Ryan Lopez"
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "4px",
                                                width: "100%",
                                                padding: "3px 0",
                                                borderRadius: "4px",
                                                border: "1px solid rgba(55,213,130,0.2)",
                                                background: "rgba(55,213,130,0.07)",
                                                color: "rgba(55,213,130,0.85)",
                                                fontSize: "8px",
                                                fontWeight: 600,
                                                letterSpacing: "0.3px",
                                                textDecoration: "none",
                                                cursor: "pointer",
                                                transition: "background 0.2s, border-color 0.2s",
                                                whiteSpace: "nowrap",
                                                boxSizing: "border-box",
                                            }}
                                            onMouseEnter={e => {
                                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(55,213,130,0.15)";
                                                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(55,213,130,0.4)";
                                            }}
                                            onMouseLeave={e => {
                                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(55,213,130,0.07)";
                                                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(55,213,130,0.2)";
                                            }}
                                        >
                                            <span style={{ fontWeight: 700 }}>
                                            <span
                                                style={{
                                                    background: "linear-gradient(to right, #ec4899, #ed6cad)",
                                                    WebkitBackgroundClip: "text",
                                                    WebkitTextFillColor: "transparent",
                                                    backgroundClip: "text",
                                                }}
                                            >
                                                STREET
                                            </span>
                                            <span style={{ color: "#fff" }}>GAP</span>
                                            </span>
                                        </a>
                                    </div>
                                </React.Fragment>
                            );
                        })()}

                        {/* QUALITY VIEW TOGGLE */}
                        {!hideCoverageAnalysis && (
                            <div style={{
                                marginTop: "5px",
                                borderTop: "1px solid rgba(255,255,255,0.08)",
                                paddingTop: "4px",
                            }}>
                                <button
                                    onClick={onToggleQualityView}
                                    title={qualityViewActive
                                        ? "Quality View ON: lines coloured by image quality score"
                                        : "Quality View OFF: click to colour coverage lines by quality score"}
                                    style={{
                                        background: "none", border: "none", padding: 0, margin: 0,
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        width: "100%", cursor: "pointer", color: "white"
                                    }}
                                >
                                    <span style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "3px",
                                        fontWeight: 600,
                                        fontSize: "8px",
                                        lineHeight: 1,
                                        color: qualityViewActive ? "#F5A623" : "rgba(255,255,255,0.7)"
                                    }}>
                                        <Icons.Star
                                            size={10}
                                            color={qualityViewActive ? "#F5A623" : "rgba(255,255,255,0.7)"}
                                            filled={qualityViewActive}
                                        />
                                        QUALITY
                                    </span>
                                    <div style={{
                                        width: "16px", height: "8px", borderRadius: "4px",
                                        background: qualityViewActive ? "#F5A623" : "rgba(255,255,255,0.3)",
                                        position: "relative", flexShrink: 0, transition: "background 0.2s"
                                    }}>
                                        <div style={{
                                            position: "absolute", top: "1px",
                                            left: qualityViewActive ? "9px" : "1px",
                                            width: "6px", height: "6px", borderRadius: "50%",
                                            background: "white", transition: "left 0.2s"
                                        }} />
                                    </div>
                                </button>

                                {qualityViewActive && (
                                    <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                                        {([
                                            ["#35AF6D", "Good",     "≥0.70"],
                                            ["#F5A623", "Fair",     "0.45–0.70"],
                                            ["#D0021B", "Poor",     "0.10–0.45"],
                                            ["#A855F7", "Unscored", "N/A"],
                                        ] as [string, string, string][]).map(([color, label, range]) => (
                                            <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "7px" }}>
                                                <div style={{ width: "8px", height: "3px", borderRadius: "2px", background: color, flexShrink: 0 }} />
                                                <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{label}</span>
                                                {range && <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>{range}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* NEARBY CAPTURES TRIGGER ROW */}
                        {imageId && (
                            <div style={{
                                marginTop: "5px",
                                borderTop: "1px solid rgba(255,255,255,0.08)",
                                paddingTop: "4px",
                            }}>
                                <button
                                    onClick={onToggleNearbyStrip}
                                    title="Show captures nearby"
                                    style={{
                                        background: "none", border: "none", padding: 0, margin: 0,
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        width: "100%", cursor: "pointer", color: "white"
                                    }}
                                >
                                    <span style={{
                                        fontSize: "7.5px", lineHeight: 1, fontWeight: 600,
                                        color: nearbyStripOpen ? "#05a056" : "rgba(255,255,255,0.7)",
                                        display: "flex", alignItems: "center", gap: "4px"
                                    }}>
                                        <Icons.Camera size={9} />
                                        NEARBY
                                        {nearbyLoading
                                            ? <span style={{ opacity: 0.5 }}>…</span>
                                            : nearbyCount != null && nearbyCount > 0
                                            ? <span style={{
                                                background: "#05a056", color: "white",
                                                borderRadius: "8px", padding: "1px 4px 0px",
                                                fontSize: "6.5px", fontWeight: 700
                                            }}>{nearbyCount}</span>
                                            : null
                                        }
                                    </span>
                                    {/* chevron */}
                                    <svg width="8" height="8" viewBox="0 0 10 10" fill="white"
                                        style={{ transform: nearbyStripOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", opacity: 0.6 }}>
                                        <path d="M1 3l4 4 4-4" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Turbo year legend */}
                        {turboModeActive && turboColorByDate && turboYearLegend && turboYearLegend.length > 0 && (
                            <div
                                className="year-legend-scroll"
                                style={{
                                    marginTop: "4px",
                                    paddingTop: "4px",
                                    borderTop: "1px solid rgba(255,255,255,0.2)",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    maxHeight: "65px",
                                    overflowY: "auto",
                                    pointerEvents: "auto",
                                    overflowX: "hidden",
                                    scrollbarColor: "rgba(255,255,255,0.3) transparent"
                                }}
                            >
                                <style>{`.year-legend-scroll::-webkit-scrollbar { display: none; }`}</style>
                                <div style={{ fontSize: "8px", fontWeight: 600, opacity: 0.7, marginBottom: "2px", textAlign: "center", width: "100%" }}>
                                    YEARS
                                </div>
                                {turboYearLegend.map((item) => {
                                    const isSelected = selectedTurboYear === item.year;
                                    const isAnySelected = !!selectedTurboYear;
                                    return (
                                        <div
                                            key={item.year}
                                            onClick={() => onYearLegendClick(item.year)}
                                            title={isSelected ? "Click to show all years" : `Filter by ${item.year}`}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                marginBottom: "3px",
                                                gap: "6px",
                                                width: "100%",
                                                flexShrink: 0,
                                                cursor: "pointer",
                                                opacity: isAnySelected && !isSelected ? 0.3 : 1,
                                                transition: "all 0.2s ease",
                                                transform: isSelected ? "scale(1.1)" : "scale(1)"
                                            }}
                                        >
                                            <span style={{
                                                width: "8px",
                                                height: "8px",
                                                borderRadius: "50%",
                                                backgroundColor: item.color,
                                                border: isSelected ? "1.5px solid white" : "1px solid rgba(255,255,255,0.6)",
                                                boxShadow: isSelected ? "0 0 4px rgba(255,255,255,0.8)" : "none",
                                                flexShrink: 0
                                            }} />
                                            <span style={{
                                                whiteSpace: "nowrap",
                                                fontWeight: isSelected ? 800 : 400,
                                                color: isSelected ? "#fff" : "rgba(255,255,255,0.9)"
                                            }}>
                                                {item.year}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 3D TAPE MEASURE */}
                {pointCloudVisible && (
                    <div style={{
                        marginTop: "4px",
                        background: isMeasureMode ? "rgba(25, 25, 25, 0.85)" : "rgba(20, 20, 20, 0.6)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "5px",
                        width: "80px",
                        border: isMeasureMode ? "1px solid rgba(30, 144, 255, 0.5)" : "1px solid rgba(255, 255, 255, 0.15)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        pointerEvents: "auto",
                        boxSizing: "border-box"
                    }}>
                        <button
                            onClick={onToggleMeasureMode}
                            title="Toggle 3D Tape Measure"
                            style={{
                                background: "none", border: "none", padding: 0, margin: 0,
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                width: "100%", cursor: "pointer", color: "white"
                            }}
                        >
                            <span style={{ fontSize: "7px", fontWeight: 600, color: isMeasureMode ? "#1e90ff" : "rgba(255,255,255,0.7)" }}>
                                <Icons.Measure size={12} style={{ marginRight: "2px", verticalAlign: "bottom" }} />
                                MEASURE
                            </span>
                            <div style={{
                                width: "16px", height: "8px", borderRadius: "4px",
                                background: isMeasureMode ? "#1e90ff" : "rgba(255,255,255,0.3)",
                                position: "relative"
                            }}>
                                <div style={{
                                    position: "absolute", top: "1px", left: isMeasureMode ? "9px" : "1px",
                                    width: "6px", height: "6px", borderRadius: "50%", background: "white",
                                    transition: "left 0.2s"
                                }} />
                            </div>
                        </button>

                        {isMeasureMode && (
                            <div style={{ marginTop: "4px", fontSize: "7.5px", color: "#ccc", textAlign: "left" }}>
                                {(!measurePoints || measurePoints.length === 0) && "Select 1st point"}
                                {measurePoints && measurePoints.length === 1 && "Select 2nd point"}
                                {measurePoints && measurePoints.length === 2 && (
                                    <div style={{ color: '#37d582', fontWeight: 'bold' }}>Ready</div>
                                )}
                                {measurePoints && measurePoints.length > 0 && (
                                    <button
                                        onClick={onClearMeasurement}
                                        style={{
                                            marginTop: "5px", width: "100%",
                                            background: "rgba(255,0,0,0.2)", border: "1px solid rgba(255,0,0,0.4)",
                                            color: "#ffcccc", borderRadius: "3px", padding: "2px 0",
                                            fontSize: "7.5px", cursor: "pointer", fontWeight: 600
                                        }}
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 3D LINE OF SIGHT */}
                {pointCloudVisible && (
                    <div style={{
                        marginTop: "4px",
                        background: isSightMode ? "rgba(25, 25, 25, 0.85)" : "rgba(20, 20, 20, 0.6)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "5px",
                        width: "80px",
                        border: isSightMode ? "1px solid rgba(168, 85, 247, 0.5)" : "1px solid rgba(255, 255, 255, 0.15)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        pointerEvents: "auto",
                        boxSizing: "border-box"
                    }}>
                        <button
                            onClick={onToggleSightMode}
                            title="Toggle 3D Line of Sight"
                            style={{
                                background: "none", border: "none", padding: 0, margin: 0,
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                width: "100%", cursor: "pointer", color: "white"
                            }}
                        >
                            <span style={{ fontSize: "7px", fontWeight: 600, color: isSightMode ? "#a855f7" : "rgba(255,255,255,0.7)" }}>
                                <Icons.Eye size={12} style={{ marginRight: "5px", verticalAlign: "bottom" }} />
                                SIGHT
                            </span>
                            <div style={{
                                width: "16px", height: "8px", borderRadius: "4px",
                                background: isSightMode ? "#a855f7" : "rgba(255,255,255,0.3)",
                                position: "relative"
                            }}>
                                <div style={{
                                    position: "absolute", top: "1px", left: isSightMode ? "9px" : "1px",
                                    width: "6px", height: "6px", borderRadius: "50%", background: "white",
                                    transition: "left 0.2s"
                                }} />
                            </div>
                        </button>

                        {isSightMode && (
                            <div style={{ marginTop: "4px", fontSize: "7.5px", color: "#ccc", textAlign: "left" }}>
                                {!sightObserver && "Select Observer point"}
                                {sightObserver && "Click to add Targets"}
                                {(sightObserver || (sightTargets && sightTargets.length > 0)) && (
                                    <button
                                        onClick={onClearSight}
                                        style={{
                                            marginTop: "5px", width: "100%",
                                            background: "rgba(255,0,0,0.2)", border: "1px solid rgba(255,0,0,0.4)",
                                            color: "#ffcccc", borderRadius: "3px", padding: "2px 0",
                                            fontSize: "7.5px", cursor: "pointer", fontWeight: 600
                                        }}
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 3D VIEWSHED ANALYSIS */}
                {pointCloudVisible && (
                    <div style={{
                        marginTop: "4px",
                        background: isViewshedMode ? "rgba(25, 25, 25, 0.85)" : "rgba(20, 20, 20, 0.6)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "5px",
                        width: "80px",
                        border: isViewshedMode ? "1px solid rgba(255, 85, 85, 0.5)" : "1px solid rgba(255, 255, 255, 0.15)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        pointerEvents: "auto",
                        boxSizing: "border-box"
                    }}>
                        <button
                            onClick={onToggleViewshedMode}
                            title="Toggle 3D Viewshed (Blind Spot) Analysis"
                            style={{
                                background: "none", border: "none", padding: 0, margin: 0,
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                width: "100%", cursor: "pointer", color: "white"
                            }}
                        >
                            <span style={{ fontSize: "7px", fontWeight: 600, color: isViewshedMode ? "#ff5555" : "rgba(255,255,255,0.7)" }}>
                                <Icons.Viewshed size={12} style={{ marginRight: "2px", verticalAlign: "bottom" }} />
                                VIEWSHED
                            </span>
                            <div style={{
                                width: "16px", height: "8px", borderRadius: "4px",
                                background: isViewshedMode ? "#ff5555" : "rgba(255,255,255,0.3)",
                                position: "relative"
                            }}>
                                <div style={{
                                    position: "absolute", top: "1px", left: isViewshedMode ? "9px" : "1px",
                                    width: "6px", height: "6px", borderRadius: "50%", background: "white",
                                    transition: "left 0.2s"
                                }} />
                            </div>
                        </button>

                        {isViewshedMode && (
                            <div style={{ marginTop: "4px", fontSize: "7.5px", color: "#ccc", textAlign: "left" }}>
                                Click cloud to calculate blind spots.
                                <button
                                    onClick={onClearViewshed}
                                    style={{
                                        marginTop: "5px", width: "100%",
                                        background: "rgba(255,0,0,0.2)", border: "1px solid rgba(255,0,0,0.4)",
                                        color: "#ffcccc", borderRadius: "3px", padding: "2px 0",
                                        fontSize: "7.5px", cursor: "pointer", fontWeight: 600
                                    }}
                                >
                                    CLEAR
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* POINT CLOUD CALIBRATION MICRO-JOYSTICK */}
                {pointCloudVisible && (
                    <div style={{
                        marginTop: "4px",
                        background: showCalibrationPanel ? "rgba(25, 25, 25, 0.85)" : "rgba(20, 20, 20, 0.6)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "5px",
                        width: "80px",
                        border: showCalibrationPanel ? "1px solid rgba(255, 193, 7, 0.5)" : "1px solid rgba(255, 255, 255, 0.15)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        pointerEvents: "auto",
                        boxSizing: "border-box"
                    }}>
                        <button
                            onClick={onToggleCalibrationPanel}
                            title="Calibrate Point Cloud GPS Drift"
                            style={{
                                background: "none", border: "none", padding: 0, margin: 0,
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                width: "100%", cursor: "pointer", color: "white"
                            }}
                        >
                            <span style={{ fontSize: "7px", fontWeight: 600, color: showCalibrationPanel ? "#ffc107" : "rgba(255,255,255,0.7)" }}>
                                <Icons.Crosshair size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                                CALIBRATE
                            </span>
                            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)" }}>
                                {showCalibrationPanel ? '▼' : '▲'}
                            </div>
                        </button>

                        {showCalibrationPanel && (
                            <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                {/* Step size toggle */}
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7px", background: "rgba(0,0,0,0.3)", padding: "3px", borderRadius: "3px" }}>
                                    <label style={{ cursor: "pointer", color: nudgeStep === 0.1 ? "#37d582" : "white" }}>
                                        <input type="radio" checked={nudgeStep === 0.1} onChange={() => onSetNudgeStep?.(0.1)} style={{ display: "none" }} /> 0.1m
                                    </label>
                                    <label style={{ cursor: "pointer", color: nudgeStep === 1.0 ? "#37d582" : "white" }}>
                                        <input type="radio" checked={nudgeStep === 1.0} onChange={() => onSetNudgeStep?.(1.0)} style={{ display: "none" }} /> 1.0m
                                    </label>
                                </div>

                                {/* Micro D-Pad */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', justifyItems: 'center', marginTop: '2px' }}>
                                    <div />
                                    <button onClick={() => onJoystickNudge?.('y', 1)} style={miniJoyStyle}>▲</button>
                                    <div />
                                    <button onClick={() => onJoystickNudge?.('x', -1)} style={miniJoyStyle}>◀</button>
                                    <button onClick={onResetCalibration} style={{ ...miniJoyStyle, fontSize: '6px', background: 'rgba(255,0,0,0.3)', borderColor: 'rgba(255,0,0,0.5)', fontWeight: 'bold' }}>RST</button>
                                    <button onClick={() => onJoystickNudge?.('x', 1)} style={miniJoyStyle}>▶</button>
                                    <div />
                                    <button onClick={() => onJoystickNudge?.('y', -1)} style={miniJoyStyle}>▼</button>
                                    <div />
                                </div>

                                {/* Vertical Z-controls */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px', marginTop: '2px' }}>
                                    <button onClick={() => onJoystickNudge?.('z', -1)} style={{ ...miniJoyStyle, width: '32px', fontSize: '7.5px' }}>▼ Z</button>
                                    <button onClick={() => onJoystickNudge?.('z', 1)} style={{ ...miniJoyStyle, width: '32px', fontSize: '7.5px' }}>▲ Z</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* POINT CLOUD ELEVATION HEATMAP LEGEND */}
                {pointCloudVisible && pointCloudColorMode === 'elevation' && (
                    <div style={{
                        marginTop: "4px",
                        background: "rgba(20, 20, 20, 0.6)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "6px",
                        padding: "5px",
                        width: "80px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        pointerEvents: "auto",
                        boxSizing: "border-box"
                    }}>
                        <div style={{ fontSize: "7px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "4px", textAlign: "center" }}>
                            ELEVATION
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {[
                                { val: "15m+", col: "#FF0000", lbl: "Tall" },
                                { val: "7.0m", col: "#FFFF00", lbl: "Poles" },
                                { val: "2.5m", col: "#00FF00", lbl: "Fences" },
                                { val: "0.0m", col: "#00FFFF", lbl: "Road" },
                                { val: "Below", col: "#0000FF", lbl: "Ditch" }
                            ].map(item => (
                                <div key={item.val} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "6.5px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                        <div style={{
                                            width: 6, height: 6, borderRadius: "50%",
                                            background: item.col, border: "0.5px solid rgba(255,255,255,0.4)", flexShrink: 0
                                        }} />
                                        <span style={{ color: "white", fontWeight: 600 }}>{item.val}</span>
                                    </div>
                                    <span style={{ color: "rgba(255,255,255,0.5)" }}>{item.lbl}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* POINT CLOUD LENGTH + WIDTH SLIDERS */}
                {this.props.pointCloudVisible && (() => {
                    const {
                        pointCloudLength, pointCloudMaxLength, pointCloudActualLength, onLengthChange,
                        pointCloudWidth, pointCloudMaxWidth, pointCloudActualWidth, onWidthChange,
                    } = this.props;

                    const lengthStep = 5;
                    const lengthSliderMax = pointCloudMaxLength + lengthStep;
                    const isLengthFull = pointCloudLength <= 0;
                    const lengthSliderValue = isLengthFull ? lengthSliderMax : pointCloudLength;

                    const handleLengthDec = () => {
                        if (isLengthFull) {
                            onLengthChange(pointCloudMaxLength);
                        } else {
                            const next = pointCloudLength - lengthStep;
                            onLengthChange(next < 10 ? 10 : next);
                        }
                    };
                    const handleLengthInc = () => {
                        if (isLengthFull) return;
                        const next = pointCloudLength + lengthStep;
                        onLengthChange(next > pointCloudMaxLength ? 0 : next);
                    };

                    const hasWidth = pointCloudWidth !== undefined && !!onWidthChange;
                    const minWidth = 5;
                    const maxWidth = pointCloudMaxWidth ?? 80;
                    const widthStep = 5;
                    const widthValue = pointCloudWidth ?? minWidth;
                    const widthSliderMax = maxWidth + widthStep;
                    const isWidthFull = pointCloudWidth <= 0 || widthValue >= widthSliderMax;
                    const widthSliderValue = isWidthFull ? widthSliderMax : widthValue;

                    const handleWidthDec = () => {
                        if (!onWidthChange) return;
                        if (isWidthFull) {
                            onWidthChange(maxWidth);
                        } else {
                            onWidthChange(Math.max(minWidth, widthValue - widthStep));
                        }
                    };
                    const handleWidthInc = () => {
                        if (!onWidthChange) return;
                        const next = widthValue + widthStep;
                        onWidthChange(next > maxWidth ? 0 : next);
                    };

                    const btnBase: React.CSSProperties = {
                        width: "16px", height: "16px", borderRadius: "3px",
                        border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)",
                        color: "white", fontSize: "11px", lineHeight: "1", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, padding: 0, transition: "background 0.15s"
                    };

                    const divider = (
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", margin: "6px 0 5px" }} />
                    );

                    return (
                        <div style={{
                            marginTop: "4px",
                            background: "rgba(20, 20, 20, 0.6)",
                            backdropFilter: "blur(10px)",
                            borderRadius: "6px",
                            padding: "6px",
                            width: "80px",
                            border: "1px solid rgba(255,255,255,0.15)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                            display: "flex",
                            flexDirection: "column",
                            pointerEvents: "auto",
                            boxSizing: "border-box"
                        }}>
                            {/* LENGTH sub-section */}
                            <div style={{ fontSize: "7px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "4px", textAlign: "center" }}>
                                LENGTH <span style={{ fontWeight: 400, opacity: 0.55, fontSize: "6px" }}>N↔S</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px", gap: "3px" }}>
                                <button
                                    title="Decrease length by 5m" onClick={handleLengthDec} style={btnBase}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                                >&#8722;</button>
                                <div style={{ fontSize: "8px", fontWeight: "bold", color: isLengthFull ? "#37d582" : "#00FFFF", textAlign: "center", flex: 1 }}>
                                    {this.state.sliderDragValue !== null
                                        ? (this.state.sliderDragValue >= lengthSliderMax
                                            ? `FULL (~${pointCloudActualLength}m)`
                                            : `${this.state.sliderDragValue}m`)
                                        : (isLengthFull
                                            ? `FULL (~${pointCloudActualLength}m)`
                                            : `${pointCloudLength}m`)
                                    }
                                </div>
                                <button
                                    title={isLengthFull ? "Already at full length" : "Increase length by 5m"} onClick={handleLengthInc}
                                    style={{ ...btnBase, opacity: isLengthFull ? 0.35 : 1, cursor: isLengthFull ? "default" : "pointer" }}
                                    onMouseEnter={e => { if (!isLengthFull) e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
                                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                                >+</button>
                            </div>
                            <div style={{ position: "relative", width: "100%" }}>
                                <div style={{
                                    position: "absolute",
                                    left: `${((pointCloudMaxLength - 10) / (lengthSliderMax - 10)) * 100}%`,
                                    width: "1px", height: "8px",
                                    background: "rgba(255,255,255,0.4)",
                                    pointerEvents: "none",
                                    transform: "translateX(-50%)"
                                }} />
                                <input
                                    className="point-cloud-slider" type="range" min={10} max={lengthSliderMax} step={lengthStep}
                                    value={this.state.sliderDragValue ?? lengthSliderValue}
                                    onChange={e => this.setState({ sliderDragValue: Number(e.target.value) })}
                                    onMouseUp={e => {
                                        const val = Number((e.target as HTMLInputElement).value);
                                        this.setState({ sliderDragValue: null });
                                        onLengthChange(val >= lengthSliderMax ? 0 : val);
                                    }}
                                    onTouchEnd={e => {
                                        const val = Number((e.target as HTMLInputElement).value);
                                        this.setState({ sliderDragValue: null });
                                        onLengthChange(val >= lengthSliderMax ? 0 : val);
                                    }}
                                    style={{ width: "100%", background: "transparent", cursor: "pointer", height: "3px", appearance: "none" }}
                                />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px", fontSize: "6.5px", color: "rgba(255,255,255,0.5)" }}>
                                <span>10m</span>
                                <span style={{ color: "rgba(255,255,255,0.35)" }}>{pointCloudMaxLength}m</span>
                                <span>FULL</span>
                            </div>

                            {/* WIDTH sub-section */}
                            {hasWidth && (
                                <React.Fragment>
                                    {divider}
                                    <div style={{ fontSize: "7px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "4px", textAlign: "center" }}>
                                        WIDTH <span style={{ fontWeight: 400, opacity: 0.55, fontSize: "6px" }}>E↔W</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px", gap: "3px" }}>
                                        <button
                                            title="Decrease width by 5m" onClick={handleWidthDec}
                                            style={{ ...btnBase, opacity: widthValue <= minWidth ? 0.35 : 1, cursor: widthValue <= minWidth ? "default" : "pointer" }}
                                            onMouseEnter={e => { if (widthValue > minWidth) e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
                                            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                                        >&#8722;</button>
                                        <div style={{ fontSize: "8px", fontWeight: "bold", color: isWidthFull ? "#37d582" : "#FFD700", textAlign: "center", flex: 1 }}>
                                            {this.state.sliderDragWidthValue !== null
                                                ? (this.state.sliderDragWidthValue >= widthSliderMax
                                                    ? `FULL (~${pointCloudActualWidth}m)`
                                                    : `${this.state.sliderDragWidthValue}m`)
                                                : (isWidthFull
                                                    ? `FULL (~${pointCloudActualWidth}m)`
                                                    : `${widthValue}m`)
                                            }
                                        </div>
                                        <button
                                            title={isWidthFull ? "Already at full width" : "Increase width by 5m"} onClick={handleWidthInc}
                                            style={{ ...btnBase, opacity: isWidthFull ? 0.35 : 1, cursor: isWidthFull ? "default" : "pointer" }}
                                            onMouseEnter={e => { if (!isWidthFull) e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
                                            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                                        >+</button>
                                    </div>
                                    <div style={{ position: "relative", width: "100%" }}>
                                        <div style={{
                                            position: "absolute",
                                            left: `${((maxWidth - minWidth) / (widthSliderMax - minWidth)) * 100}%`,
                                            width: "1px", height: "8px",
                                            background: "rgba(255,255,255,0.4)",
                                            pointerEvents: "none",
                                            transform: "translateX(-50%)"
                                        }} />
                                        <input
                                            className="point-cloud-slider" type="range" min={minWidth} max={widthSliderMax} step={widthStep}
                                            value={this.state.sliderDragWidthValue ?? widthSliderValue}
                                            onChange={e => this.setState({ sliderDragWidthValue: Number(e.target.value) })}
                                            onMouseUp={e => {
                                                const val = Number((e.target as HTMLInputElement).value);
                                                this.setState({ sliderDragWidthValue: null });
                                                onWidthChange!(val >= widthSliderMax ? 0 : val);
                                            }}
                                            onTouchEnd={e => {
                                                const val = Number((e.target as HTMLInputElement).value);
                                                this.setState({ sliderDragWidthValue: null });
                                                onWidthChange!(val >= widthSliderMax ? 0 : val);
                                            }}
                                            style={{ width: "100%", background: "transparent", cursor: "pointer", height: "3px", appearance: "none" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px", fontSize: "6.5px", color: "rgba(255,255,255,0.5)" }}>
                                        <span>{minWidth}m</span>
                                        <span style={{ color: "rgba(255,255,255,0.35)" }}>{maxWidth}m</span>
                                        <span>FULL</span>
                                    </div>
                                </React.Fragment>
                            )}
                        </div>
                    );
                })()}

                {/* POINT CLOUD CSV EXPORT BUTTON */}
                {pointCloudVisible && (
                    <button
                        onClick={onDownloadPointCloud}
                        title="Export Point Cloud as CSV (Includes Calibrations)"
                        style={{
                            marginTop: "4px",
                            background: "rgba(30, 144, 255, 0.3)",
                            backdropFilter: "blur(10px)",
                            WebkitBackdropFilter: "blur(10px)",
                            color: "#fff",
                            borderRadius: "6px",
                            fontSize: "9px",
                            cursor: "pointer",
                            width: "80px",
                            fontWeight: 600,
                            letterSpacing: "0.5px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            pointerEvents: "auto",
                            transition: "all 0.2s ease-in-out",
                            border: "1px solid rgba(30, 144, 255, 0.5)",
                            boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                            padding: "4px 0"
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(30, 144, 255, 0.8)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(30, 144, 255, 0.3)")}
                    >
                        <Icons.Download size={12} color="#ffffff" />
                        <span style={{ fontWeight: 700 }}>CSV (3D)</span>
                    </button>
                )}

                {/* EXPORT BUTTON */}
                {(trafficSignsActive || objectsActive) && (
                    <button
                        onClick={onDownloadFeatures}
                        title="Export Current Features as GeoJSON"
                        style={{
                            marginTop: "4px",
                            background: "rgba(55, 213, 130, 0.3)",
                            backdropFilter: "blur(10px)",
                            WebkitBackdropFilter: "blur(10px)",
                            color: "#fff",
                            borderRadius: "6px",
                            fontSize: "9px",
                            cursor: "pointer",
                            width: "80px",
                            fontWeight: 600,
                            letterSpacing: "0.5px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            pointerEvents: "auto",
                            transition: "all 0.2s ease-in-out",
                            boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(55, 213, 130, 0.95)")}
                        onMouseLeave={e => (e.currentTarget.style.background = detectionsActive ? "rgba(55, 213, 130, 0.8)" : "rgba(55, 213, 130, 0.3)")}
                    >
                        <Icons.Download size={12} color="#ffffff" />
                        <span style={{ fontWeight: 700 }}>EXPORT</span>
                    </button>
                )}

                {/* AI OVERLAY BUTTON */}
                {(trafficSignsActive || objectsActive) && imageId && (
                    <button
                        onClick={onToggleDetections}
                        title="Toggle AI Object Detection Overlays"
                        style={{
                            marginTop: "4px",
                            background: detectionsActive ? "rgba(55, 213, 130, 0.8)" : "rgba(55, 213, 130, 0.3)",
                            color: "white",
                            borderRadius: "6px",
                            width: "80px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: "auto",
                            backdropFilter: "blur(5px)",
                            transition: "background 0.2s"
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(55, 213, 130, 0.95)")}
                        onMouseLeave={e => (e.currentTarget.style.background = detectionsActive ? "rgba(55, 213, 130, 0.8)" : "rgba(55, 213, 130, 0.3)")}
                    >
                        <Icons.Detection size={11} />
                        <span style={{ fontSize: "8.5px", marginLeft: "3px", fontWeight: 700 }}>AI OVERLAY</span>
                    </button>
                )}

                {/* AI TAG VISIBILITY TOGGLE */}
                {detectionsActive && (
                    <button
                        onClick={onToggleAiTags}
                        title={showAiTags ? "Hide Labels/Tags" : "Show Labels/Tags"}
                        style={{
                            background: showAiTags ? "rgba(61, 36, 36, 0.2)" : "rgba(255, 0, 0, 0.4)",
                            border: "1px solid rgba(1, 1, 1, 0.7)",
                            marginTop: "2px",
                            color: "white",
                            borderRadius: "6px",
                            width: "30px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backdropFilter: "blur(5px)",
                            pointerEvents: "auto",
                            height: "12px"
                        }}
                    >
                        {showAiTags ? <Icons.LabelsOn size={12} /> : <Icons.LabelsOff size={12} />}
                    </button>
                )}

                {/* ALTERNATE IMAGES PANEL */}
                {alternateImages.length > 0 && (
                    <div
                        className="alternate-images-panel"
                        style={{
                            marginTop: "3px",
                            width: "80px",
                            background: "rgba(20, 20, 20, 0.6)",
                            backdropFilter: "blur(10px)",
                            borderRadius: "8px",
                            padding: "3px",
                            pointerEvents: "auto",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px"
                        }}
                    >
                        <div style={{
                            color: "white",
                            borderBottom: "1px solid rgba(255,255,255,0.2)", padding: "0",
                            display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                            <span style={{ fontSize: "7px", fontWeight: "600" }}>ALTERNATE</span>
                            <button
                                onClick={onCloseAlternates}
                                style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "10px", padding: "0 2px" }}
                                title="Close"
                            >✕</button>
                        </div>

                        {alternateImages.map((img) => (
                            <div
                                key={img.id}
                                onClick={() => onSelectAlternateImage(img)}
                                style={{
                                    cursor: "pointer",
                                    borderRadius: "4px",
                                    overflow: "hidden",
                                    position: "relative",
                                    border: imageId === img.id ? "2px solid #37d582" : "1px solid rgba(255,255,255,0.2)",
                                    boxShadow: imageId === img.id ? "0 0 10px rgba(55, 213, 130, 0.4)" : "none",
                                    transition: "transform 0.2s",
                                    height: "50px"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.02)")}
                                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                                title={`Captured: ${new Date(img.capturedAt).toLocaleDateString()}`}
                            >
                                <img
                                    src={img.thumbUrl}
                                    alt="Alt"
                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                                <div style={{
                                    position: "absolute", bottom: 0, left: 0, right: 0,
                                    background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                                    color: "white",
                                    fontSize: "8px", padding: "8px 4px 2px 4px",
                                    textAlign: "right"
                                }}>
                                    {new Date(img.capturedAt).toLocaleDateString(undefined, { month: "numeric", year: "2-digit" })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* STREET COVERAGE ANALYSIS RESULT */}
                {(coverageAnalysisLoading || coverageResult) && (
                    <div style={{
                        marginTop: "3px",
                        padding: "0 5px 5px 5px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.40)",
                        border: "1px solid rgba(30, 144, 255, 0.3)",
                        backdropFilter: "blur(5px)",
                        pointerEvents: "auto",
                        width: "80px",
                        boxSizing: "border-box"
                    }}>
                        {/* Header */}
                        <div style={{
                            fontSize: "5.4px", fontWeight: 500, color: "rgba(255,255,255,0.7)",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            borderBottom: "1px solid rgba(255,255,255,0.2)", marginBottom: "4px"
                        }}>
                            <span>STREET COVERAGE</span>
                            <button onClick={onDismissCoverageResult} style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "10px", paddingBottom: "2px" }}>×</button>
                        </div>

                        {coverageAnalysisLoading && (
                            <div style={{ textAlign: "center", fontSize: "8px", color: "#ccc", padding: "1px" }}>Analysing...</div>
                        )}

                        {coverageResult && !coverageAnalysisLoading && (() => {
                            const r = coverageResult;
                            const total = r.totalCount || 1;
                            const freshPct = Math.round((r.freshCount / total) * 100);
                            const agingPct  = Math.round((r.agingCount  / total) * 100);
                            const stalePct  = Math.round((r.staleCount  / total) * 100);
                            const nonePct   = Math.round((r.noneCount   / total) * 100);

                            const row = (color: string, label: string, age: string, pct: number, km: number) => (
                                <div style={{ marginBottom: "3px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "7px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{label}</span>
                                            <span style={{ color: "rgba(255,255,255,0.5)" }}>{age}</span>
                                        </div>
                                        <span style={{ fontWeight: 700, color: "#fff" }}>{pct}%</span>
                                    </div>
                                    <div style={{ textAlign: "right", fontSize: "6.5px", color: "rgba(255,255,255,0.5)", marginTop: "1px" }}>
                                        {km} km
                                    </div>
                                </div>
                            );

                            return (
                                <React.Fragment>
                                    {/* Segmented Colored Bar */}
                                    <div style={{
                                        height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.1)",
                                        display: "flex", overflow: "hidden", marginBottom: "5px"
                                    }}>
                                        {freshPct > 0 && <div style={{ width: `${freshPct}%`, background: "#37d582" }} />}
                                        {agingPct > 0 && <div style={{ width: `${agingPct}%`, background: "#ffc107" }} />}
                                        {stalePct > 0 && <div style={{ width: `${stalePct}%`, background: "#ff6e32" }} />}
                                        {nonePct  > 0 && <div style={{ width: `${nonePct}%`,  background: "#dc3232" }} />}
                                    </div>

                                    {/* Totals */}
                                    <div style={{ textAlign: "center", marginBottom: "5px" }}>
                                        <div style={{ fontWeight: 800, fontSize: "9px", color: "#fff" }}>{r.percentCovered}% covered</div>
                                        <div style={{ fontSize: "6.5px", color: "rgba(255,255,255,0.5)" }}>{r.coveredCount} / {r.totalCount} segments</div>
                                    </div>

                                    {/* Data Rows */}
                                    {row("#37d582", "Fresh", "(<2y)",  freshPct, r.freshKm)}
                                    {row("#ffc107", "Aging", "(2-4y)", agingPct, r.agingKm)}
                                    {row("#ff6e32", "Stale", "(>4y)",  stalePct, r.staleKm)}
                                    {row("#dc3232", "None",  "",       nonePct,  r.noneKm)}

                                    {/* Toggle Button */}
                                    <button
                                        onClick={onToggleCoverageSegments}
                                        style={{
                                            width: "100%", marginTop: "3px", borderRadius: "3px",
                                            border: "1px solid rgba(255,255,255,0.15)",
                                            background: coverageSegmentsVisible ? "rgba(30, 144, 255, 0.4)" : "rgba(255,255,255,0.1)",
                                            color: "white", fontSize: "7px", fontWeight: 600, cursor: "pointer", padding: "3px 0"
                                        }}
                                    >
                                        {coverageSegmentsVisible ? "HIDE MAP" : "SHOW MAP"}
                                    </button>
                                </React.Fragment>
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    }
}