// src/helpers/styles.ts
import React from "react";

// --- Legend & UI helper styles ---
// src/helpers/styles.ts
export const legendCircleStyle = (color: string): React.CSSProperties => ({
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: color,
    marginRight: "8px",
    border: "1px solid rgba(255,255,255,0.3)", // Softer border
    flexShrink: 0    // Prevents circle from squishing
});

// --- Mobile / Responsive Styles ---
export const mobileOverrideStyles = `
.mobile-panel-content-header {
    height: 30px !important;
}
.expand-mobile-panel-touch-container{
    height: 30px !important;
}
.expand-mobile-panel[style*="height: 150px"] {
    height: 280px !important;
}

.mapillary-js .DirectionsPerspective {
    z-index: 1 !important; /* Ensure arrows are below our Widget UI but above the image */
}

/* Force standard chevrons to be more visible on bright backgrounds */
.mapillary-js .DirectionsPerspectiveArrow {
    filter: drop-shadow(0px 0px 2px rgba(0,0,0,0.8)) !important;
}

/* Ensure the navigation arrows center themselves properly in short widgets */
.mapillary-js .DirectionsPerspectiveContainer {
    bottom: 10px !important;
}

.legend-container{ display: none !important; }
.widget-mapillary .legend-container { display: flex !important; }

@media (max-width: 768px) {
        .widget-mapillary input[type="date"]::-webkit-datetime-edit { display: none !important; }
        .show-panorama-only-filter { font-size: 0 !important; }
        .show-panorama-only-filter::after { content: "Panoramas:"; font-size: 9px !important; }
        .show-color-by-date-filter { font-size: 0 !important; }
        .show-color-by-date-filter::after { content: "CBD:"; font-size: 9px !important; }
        .react-datepicker { transform: scale(0.6) !important; }
        .react-datepicker-popper { height: 230px !important; }
        .unified-control-buttons{ height: 20px !important; width: 20px !important; font-size: 12px !important; }
        .unified-control-buttons-mapped{ height: 21px !important; width: 21px !important; font-size: 12px !important; }
        .unified-control-buttons-filters{ height: 16px !important; width: 16px !important; font-size: 10px !important; }
        .unified-button-controls-svg-icons{ height: 12px !important; width: 12px !important; }
        .info-box{ font-size: 8px !important; max-width: 110px !important; }
        .legend-container{ display: none !important; }
        .esri-popup__main-container { width: 250px !important; top: 8% !important; left: 17% !important; max-height:42% !important; }
        .splash-screen-spinner { width: 25px !important; height: 25px !important; }
        .splash-screen-logo { margin-bottom: 15px !important; }
        .splash-screen-text { font-size: 10px !important; }
        .minimap-container { 
            top: 50px !important; left: 50% !important; right: auto !important; transform: translateX(-50%) !important; 
            width: 90% !important; max-width: 350px !important; height: 150px !important; 
        }
        .warning-message-container { font-size: 8px !important; }
    }
`;
