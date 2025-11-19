// src/helpers/styles.ts
import React from "react";

// --- Legend & UI helper styles ---
// src/helpers/styles.ts
export const legendCircleStyle = (color: string): React.CSSProperties => ({
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: color,
    marginRight: "6px",
    border: "1px solid #ccc"
});

export const legendRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    marginBottom: "4px"
};

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

@media (max-width: 768px) {
    .widget-mapillary input[type="date"]::-webkit-datetime-edit {
        display: none !important;
    }
    .show-panorama-only-filter { font-size: 0 !important; }
    .show-panorama-only-filter::after { content: "Panoramas:"; font-size: 9px !important; }
    .show-color-by-date-filter { font-size: 0 !important; }
    .show-color-by-date-filter::after { content: "CBD:"; font-size: 9px !important; }
    .react-datepicker { transform: scale(0.6); }
    .react-datepicker-popper { height: 230px; }
    .unified-control-buttons{ height: 20px !important; width: 20px !important; font-size: 12px !important; }
    .unified-control-buttons-mapped{ height: 21px !important; width: 21px !important; font-size: 12px !important; }
    .unified-control-buttons-filters{ height: 16px !important; width: 16px !important; font-size: 10px !important; }
    .unified-button-controls-svg-icons{ height: 12px !important; width: 12px !important; }
    .info-box{ font-size: 8px !important; max-width: 100px !important; }
    .turbo-legend-cbd-title, .turbo-legend-cbd-date-title{ font-size: 8px !important; }
    .turbo-legend-cbd-circles{ width: 8px !important; height: 8px !important; }
    .legend-container{ max-width: 230px !important; padding: 0px 8px !important; bottom: 1px !important; left: 0px !important; }
    .legend-container-turbo-inner{ display: flex !important; width: 230px !important; font-size: 8px !important; padding-top: 4px !important; }
    .legend-container-turbo-inner-cell{ width: 60px !important; }
    .legend-container-normal-inner{ display: flex !important; }
    .desktop-text { display: none !important; }
    .mobile-text { display: inline !important; }
    .legend-container-normal-button{ margin-top: 4px !important; }
}
`;
