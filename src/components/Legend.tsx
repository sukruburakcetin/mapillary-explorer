/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { legendCircleStyle, legendRowStyle, legendTextStyle, compactButtonStyle } from "../utils/styles";
import { LegendProps } from "./types";

/**
    * Legend
    * Displays a small map-legend overlay inside the viewer area.
    * Shows turbo-mode entries (coverage colours) or normal-mode entries
    * (clicked point, active frame, sequence colour).
*/
export const Legend: React.FC<LegendProps> = ({ turboModeActive, onClearCache }) => (
    <div
        className="legend-container"
        style={{
            position: "absolute",
            bottom: "2px",
            left: "4px",
            background: "rgba(0, 0, 0, 0.30)",
            backdropFilter: "blur(5px)",
            borderRadius: "4px",
            padding: "4px 6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.1)",
            zIndex: 999,
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column"
        }}
    >
        <div style={{
            opacity: 0.4,
            fontSize: "8px",
            fontWeight: 700,
            marginBottom: "2px",
            color: "white",
            textTransform: "uppercase",
            letterSpacing: "1px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            paddingBottom: "3px"
        }}>Legend</div>

        <div style={{ display: "flex", flexDirection: "column" }}>
            {turboModeActive ? (
                <React.Fragment>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("#00ff00"), border: "1px solid white" }}></span> <span style={legendTextStyle}>Active frame</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("blue"), border: "1px solid #e3da30" }}></span> <span style={legendTextStyle}>Seq. images</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("#a52a2a"), border: "1px solid white" }}></span> <span style={legendTextStyle}>Turbo coverage</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("transparent"), border: "1.5px solid cyan" }}></span> <span style={legendTextStyle}>First selected</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("yellow"), border: "2px solid orange" }}></span> <span style={legendTextStyle}>Next frame</span></div>
                </React.Fragment>
            ) : (
                <React.Fragment>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("black"), border: "1px solid white" }}></span> <span style={legendTextStyle}>Clicked point</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("#00ff00"), border: "1px solid white" }}></span> <span style={legendTextStyle}>Active frame</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("e3da30"), border: "1px solid white" }}></span> <span style={legendTextStyle}>Active seq</span></div>
                    <div style={legendRowStyle}><span style={{ ...legendCircleStyle("yellow"), border: "2px solid orange" }}></span> <span style={legendTextStyle}>Next frame</span></div>
                    <button onClick={onClearCache} style={compactButtonStyle}>CLEAR CACHE</button>
                </React.Fragment>
            )}
        </div>
    </div>
);
