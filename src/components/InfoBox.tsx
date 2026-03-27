/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { React, jsx } from "jimu-core";
import * as Icons from "../components/Icons";
import { InfoBoxProps } from "./types";

interface InfoBoxState {
    isOverflowing: boolean;
}


/**
    * InfoBox
    * Right-hand side panel stack containing:
    *  - Status / coordinates / address card
    *  - Turbo year-legend with click-to-filter
    *  - Coverage Analysis
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
            isOverflowing: false
        };
    }

    componentDidMount() {
        this.checkOverflow();
        window.addEventListener('resize', this.checkOverflow);
    }

    componentDidUpdate() {
        // Automatically check if expanding panels caused a scrollbar to appear
        this.checkOverflow();
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.checkOverflow);
    }

    checkOverflow = () => {
        if (this.scrollContainerRef.current) {
            const { scrollHeight, clientHeight } = this.scrollContainerRef.current;
            // It overflows if the inner content height is greater than the visible height
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
            hideCoverageAnalysis,
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
                    // Firefox: thin scrollbar with transparent track and subtle thumb
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

                        {/* Street Coverage Analysis button ;
                             visible only when Turbo Mode is active so the
                             button appears exactly when it is relevant */}
                        {turboModeActive && !hideCoverageAnalysis && (() => {
                            const zoom = currentZoom ?? jimuMapViewZoom ?? 0;
                            const belowZoom  = zoom < turboMinZoom;
                            const noPoints   = !turboPointsAvailable;
                            // Button is ready only when zoom ≥ 16, turbo points are
                            // loaded, and no analysis is currently running.
                            const canRun     = !belowZoom && !noPoints && !coverageAnalysisLoading;
 
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
                                            color: canRun
                                                ? "rgba(255,255,255,0.9)"
                                                : "rgba(255,255,255,0.65)",
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
                                            if (canRun)
                                                e.currentTarget.style.background = "rgba(30, 144, 255, 0.3)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = btnBg;
                                        }}
                                    >
                                        {coverageAnalysisLoading ? (
                                            <>
                                                <div style={{
                                                    width: "8px", height: "8px",
                                                    border: "1.5px solid rgba(255,255,255,0.2)",
                                                    borderTopColor: "#1e90ff",
                                                    borderRadius: "50%",
                                                    animation: "spin 0.8s linear infinite",
                                                    flexShrink: 0,
                                                    justifyContent: "center"
                                                }} />
                                                Analysing…
                                            </>
                                        ) : belowZoom ? (
                                            "Zoom in to analyse"
                                        ) : noPoints ? (
                                            "No points"
                                        ) : (
                                            coverageResult ? "Run New Analysis" : "Analyse Coverage"
                                        )}
                                    </button>
                                </div>
                            );
                        })()}

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
                        {showAiTags ? <Icons.LabelsOn size={14} /> : <Icons.LabelsOff size={14} />}
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
                        padding: "5px",
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
                            fontSize: "7px", fontWeight: 600, color: "rgba(255,255,255,0.7)",
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

                            // Compact Row Component
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
                                <>
                                    {/* Segmented Colored Bar */}
                                    <div style={{
                                        height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.1)",
                                        display: "flex", overflow: "hidden", marginBottom: "5px"
                                    }}>
                                        {freshPct > 0 && <div style={{ width: `${freshPct}%`, background: "#37d582" }} />}
                                        {agingPct > 0 && <div style={{ width: `${agingPct}%`, background: "#ffc107" }} />}
                                        {stalePct > 0 && <div style={{ width: `${stalePct}%`, background: "#ff6e32" }} />}
                                        {nonePct > 0 && <div style={{ width: `${nonePct}%`, background: "#dc3232" }} />}
                                    </div>

                                    {/* Totals */}
                                    <div style={{ textAlign: "center", marginBottom: "5px" }}>
                                        <div style={{ fontWeight: 800, fontSize: "9px", color: "#fff" }}>{r.percentCovered}% covered</div>
                                        <div style={{ fontSize: "6.5px", color: "rgba(255,255,255,0.5)" }}>{r.coveredCount} / {r.totalCount} segments</div>
                                    </div>

                                    {/* Data Rows */}
                                    {row("#37d582", "Fresh", "(<2y)", freshPct, r.freshKm)}
                                    {row("#ffc107", "Aging", "(2-4y)", agingPct, r.agingKm)}
                                    {row("#ff6e32", "Stale", "(>4y)", stalePct, r.staleKm)}
                                    {row("#dc3232", "None", "", nonePct, r.noneKm)}

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
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    }
}
