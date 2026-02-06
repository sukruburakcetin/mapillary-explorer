// src/helpers/styles.ts
import React from "react";

// --- SECTION: LEGEND PRIMITIVES ---
// Used to create the small colored dots in the map legend (e.g., green for active frame, blue for sequence).
export const legendCircleStyle = (color: string): React.CSSProperties => ({
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: color,
    marginRight: "4px",
    border: "1px solid rgba(255,255,255,0.3)", // Softer border
    flexShrink: 0    // Prevents circle from squishing
});

// --- SECTION: GLASSMORPHISM UI COMPONENTS ---
// This object contains all the logic for the "Glass" look (blur + transparency).
export const glassStyles = {
    // The main vertical sidebar on the right side of the viewer that holds control buttons.
    container: {
        position: 'absolute',
        top: '2px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'center', // Centers the buttons horizontally in the strip
        padding: '2px 0px 0px 2px', 
        // Glass Effect logic
        background: 'rgba(20, 20, 20, 0.4)',
        backdropFilter: 'blur(1px)',
        WebkitBackdropFilter: 'blur(11px)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        willChange: 'width, height', // Hints to GPU for smoother rendering
        transform: 'translateZ(0)',  // Forces hardware acceleration
    } as React.CSSProperties,

    // Generates styling for individual buttons. 
    // Logic: If 'active', it applies a colorful gradient and glow; otherwise, a subtle transparent look.
    getButtonStyle: (active: boolean, baseColor: string, isSmall: boolean = false): React.CSSProperties => ({
        background: active 
            ? `linear-gradient(135deg, ${baseColor.replace('0.9', '0.85')}, ${baseColor.replace('0.9', '0.6')})`
            : 'rgba(255, 255, 255, 0.05)',
        color: active ? '#fff' : 'rgba(255, 255, 255, 0.7)',
        width: isSmall ? '22px' : '28px',
        height: isSmall ? '22px' : '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderRadius: '8px',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        // Glow effect when the layer is turned on
        boxShadow: active 
            ? `0 0 10px ${baseColor.replace('0.9', '0.4')}, inset 0 0 10px rgba(255,255,255,0.1)` 
            : '0 2px 5px rgba(0,0,0,0.1)',
        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
        transform: active ? 'scale(1.05)' : 'scale(1)'
    }),

    // Wraps related buttons (like Turbo Mode and its Filter) into a unified visual group.
    groupContainer: (active: boolean): React.CSSProperties => ({
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        borderRadius: '10px',
        // Fixed syntax below:
        background: active 
            ? 'linear-gradient(135deg, rgba(240, 185, 5, 0.3), rgba(251, 0, 0, 0.1))' 
            : 'transparent',
        border: active ? '1px solid rgba(255, 255, 255, 0.24)' : '1px solid transparent',
        transition: 'all 0.3s ease',
        alignItems: 'center',
        padding: '2px' // Added a little padding so buttons aren't touching the border
    }),

    // Overlay style for when a user clicks the map but no imagery exists at that location.
    noImageContainer: {
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        display: "flex", justifyContent: "center", alignItems: "center",
        zIndex: 5,
        background: "rgba(18, 20, 24, 0.75)", // Dark slate tint
        backdropFilter: "blur(12px) grayscale(50%)", 
        WebkitBackdropFilter: "blur(12px) grayscale(50%)",
        opacity: 1,
        transition: "opacity 0.6s ease-in-out"
    } as React.CSSProperties,

    // The text and icon container inside the 'noImageContainer'.
    noImageContent: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        color: "rgba(255, 255, 255, 0.8)",
        fontSize: "13px",
        fontWeight: 500,
        letterSpacing: "0.5px",
        textAlign: "center",
        textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        padding: "20px 30px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
    } as React.CSSProperties,

    // Initial overlay shown when the widget is opened before any map click occurs.
    initialStateContainer: {
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        zIndex: 4, 
        background: "rgba(0, 0, 0, 0.2)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        transition: "all 0.3s ease"
    } as React.CSSProperties,

    // The card showing "Click a point to view imagery".
    initialStateCard: {
        padding: "16px 18px",
        borderRadius: "16px",
        background: "rgba(30, 30, 35, 0.6)", 
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.25)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        textAlign: "center"
    } as React.CSSProperties,

    initialStateTextPrimary: {
        fontSize: "13px",
        fontWeight: 600,
        color: "#ffffff",
        letterSpacing: "0.5px",
        textShadow: "0 2px 4px rgba(0,0,0,0.5)"
    } as React.CSSProperties,

    initialStateTextSecondary: {
        fontSize: "10px",
        color: "rgba(255, 255, 255, 0.6)",
        marginTop: "2px"
    } as React.CSSProperties,

    // Full-screen loading overlay used during imagery fetches.
    loadingContainer: {
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        display: "flex", justifyContent: "center", alignItems: "center",
        zIndex: 9999,
        background: "rgba(10, 10, 15, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        transition: "all 0.3s ease"
    } as React.CSSProperties,

    // The central card holding the loading spinner and text.
    loadingCard: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "24px 32px",
        borderRadius: "20px",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)",
        backdropFilter: "blur(16px)"
    } as React.CSSProperties,

    // The blue animated spinning ring.
    loadingSpinner: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        border: "3px solid rgba(255, 255, 255, 0.1)",
        borderTop: "3px solid #3b82f6", 
        borderRight: "3px solid rgba(59, 130, 246, 0.3)", 
        boxShadow: "0 0 15px rgba(59, 130, 246, 0.4)", 
        animation: "spin 1s linear infinite"
    } as React.CSSProperties,

    loadingText: {
        color: "#ffffff",
        fontSize: "12px",
        fontWeight: 500,
        letterSpacing: "0.5px",
        textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        opacity: 0.9
    } as React.CSSProperties,

    // A smaller loader used specifically for Turbo Mode updates.
    compactLoadingCard: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "16px",
        textAlign: "center",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 15px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)",
        backdropFilter: "blur(16px)"
    } as React.CSSProperties,

    compactLoadingText: {
        color: "#ffffff",
        fontWeight: 500,
        letterSpacing: "0.5px",
        textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        opacity: 0.9,
        maxWidth: "110px"
    } as React.CSSProperties,

    // The gold animated spinning ring for Turbo Mode.
    turboSpinner: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        border: "3px solid rgba(255, 255, 255, 0.1)",
        borderTop: "3px solid #FFD700", 
        borderRight: "3px solid rgba(255, 215, 0, 0.3)", 
        boxShadow: "0 0 15px rgba(255, 215, 0, 0.5)", 
        animation: "spin 0.7s linear infinite"
    } as React.CSSProperties,

    // Intro/Splash Screen container shown when the widget first boots up.
    splashContainer: {
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        zIndex: 20000,
        display: "flex", justifyContent: "center", alignItems: "center",
        background: "radial-gradient(circle at center, rgba(20, 30, 40, 0.85) 0%, rgba(5, 5, 10, 0.95) 100%)",
        backdropFilter: "blur(15px)",
        WebkitBackdropFilter: "blur(15px)",
        transition: "all 0.8s cubic-bezier(0.6, -0.28, 0.735, 0.045)",
        pointerEvents: "none"
    } as React.CSSProperties,

    splashCard: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "30px 40px",
        borderRadius: "24px",
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        boxShadow: "0 0 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.03)",
        backdropFilter: "blur(20px)",
        animation: "float 6s ease-in-out infinite"
    } as React.CSSProperties,

    logoWrapper: {
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: "20px"
    } as React.CSSProperties,

    splashLogo: {
        width: "64px",
        height: "auto",
        zIndex: 2,
        borderRadius: "14px",
        boxShadow: "0 10px 20px rgba(0,0,0,0.3)"
    } as React.CSSProperties,

    // Sonar ripple effect behind the splash logo.
    splashRipple: {
        position: "absolute",
        width: "60px",
        height: "60px",
        borderRadius: "50%",
        border: "1px solid rgba(53, 175, 109, 0.6)", 
        zIndex: 1,
        animation: "ripple 2s cubic-bezier(0, 0.2, 0.8, 1) infinite"
    } as React.CSSProperties,

    splashTitle: {
        fontSize: "14px",
        fontWeight: 800,
        letterSpacing: "3px",
        textTransform: "uppercase",
        background: "linear-gradient(90deg, #fff 0%, #aaa 50%, #fff 100%)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        animation: "shimmer 3s linear infinite",
        marginBottom: "12px"
    } as React.CSSProperties,

    progressTrack: {
        width: "140px",
        height: "4px",
        background: "rgba(255,255,255,0.1)",
        borderRadius: "2px",
        overflow: "hidden",
        position: "relative"
    } as React.CSSProperties,

    progressBar: {
        position: "absolute",
        top: 0, left: 0, height: "100%", width: "50%",
        background: "#35AF6D", 
        boxShadow: "0 0 10px #35AF6D", 
        borderRadius: "2px",
        animation: "loading 1.5s ease-in-out infinite"
    } as React.CSSProperties,

    // The horizontal "revolver" style picker at the top of the viewer for selecting different sequences.
    sequencePickerContainer: {
        background: "rgba(20, 20, 30, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "3px 4px", 
        borderRadius: "20px",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: "4px",
        justifyContent: "center",
        marginTop: "2px",
        overflow: "hidden"
    } as React.CSSProperties,

    // Styling for individual sequence items in the picker.
    sequenceSlot: (isActive: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        padding: "3px 8px",
        borderRadius: "12px",
        cursor: "pointer",
        background: isActive ? "rgba(255, 255, 255, 0.25)" : "transparent",
        border: isActive ? "1px solid rgba(255, 255, 255, 0.8)" : "1px solid transparent",
        boxShadow: isActive ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
        transition: "all 0.2s ease",
        flex: "1 1 0",
        minWidth: "0"
    }),

    sequenceArrow: {
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        color: "#fff",
        borderRadius: "50%",
        width: "18px",
        height: "18px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "9px",
        transition: "background 0.2s"
    } as React.CSSProperties,

    sequenceDot: (color: string): React.CSSProperties => ({
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: color,
        border: "1px solid rgba(255,255,255,0.8)",
        boxShadow: "0 0 4px rgba(0,0,0,0.5)",
        flexShrink: 0
    }),

    sequenceText: {
        whiteSpace: "nowrap", 
        fontSize: "9px",
        color: "#fff",
        fontWeight: 500,
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        overflow: "hidden",
        textOverflow: "ellipsis"
    } as React.CSSProperties,

    // The horizontal bar at the bottom containing advanced filters (User, Date, Traffic Sign filter, etc.).
    filterBarContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: "rgba(20, 20, 30, 0.65)", 
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "2px",
        marginTop: "2px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius : "20px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        pointerEvents: "auto",
        zIndex: 10001,
        overflow: "visible"
    } as React.CSSProperties,

    // Sub-containers within the filter bar for grouping related filters (e.g., all Turbo filters together).
    filterGroup: (baseColor: string): React.CSSProperties => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        borderRadius: '8px',
        background: `linear-gradient(135deg, ${baseColor}1A 0%, ${baseColor}05 100%)`, 
        border: `1px solid ${baseColor}33`, 
        boxShadow: `inset 0 0 10px ${baseColor}0D`
    }),

    // Transparent inputs inside the filter bar.
    glassInput: {
        background: "rgba(0, 0, 0, 0.2)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "20px",
        padding: "4px 20px 4px 10px",
        color: "#fff",
        fontSize: "10px",
        width: "110px",
        outline: "none",
        transition: "all 0.2s",
        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)"
    } as React.CSSProperties,

    // Small square buttons for icon triggers (like the Calendar icon).
    glassIconBtn: {
        background: "rgba(255, 255, 255, 0.1)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "6px",
        width: "22px",
        height: "22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "#fff",
        fontSize: "11px",
        marginLeft: "4px",
        transition: "background 0.2s"
    } as React.CSSProperties,

    labelSmall: {
        fontSize: '9px',
        color: 'rgba(255,255,255,0.8)',
        fontWeight: 500
    } as React.CSSProperties
};

// --- SECTION: REACT-SELECT THEME ---
// Heavily customizes the 'react-select' component to match the dark glass UI.
export const getGlassSelectStyles = (baseColor: string = "#fff") => ({
    container: (base: any) => ({
        ...base,
        width: '150px',
        fontSize: '10px'
    }),
    control: (base: any, state: any) => ({
        ...base,
        minHeight: '28px',
        height: '28px',
        backgroundColor: "rgba(0, 0, 0, 0.2)", 
        borderColor: state.isFocused ? baseColor : "rgba(255, 255, 255, 0.15)",
        borderRadius: "8px",
        boxShadow: "none",
        cursor: "pointer",
        "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.3)"
        }
    }),
    singleValue: (base: any) => ({
        ...base,
        color: "#fff",
        fontWeight: 500
    }),
    input: (base: any) => ({
        ...base,
        color: "#fff",
        margin: 0,
        padding: 0
    }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base: any) => ({
        ...base,
        color: "rgba(255,255,255,0.5)",
        padding: "4px"
    }),
    menuPortal: (base: any) => ({
        ...base,
        zIndex: 100005
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: "rgba(30, 30, 35, 0.95)",
        backdropFilter: "blur(10px)",
        borderRadius: "8px",
        border: `1px solid ${baseColor}40`,
        marginTop: "4px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '250px',
        padding: '4px',
        "::-webkit-scrollbar": { width: "6px" },
        "::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.2)", borderRadius: "3px" }
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isFocused ? `${baseColor}33` : "transparent",
        color: state.isFocused ? "#fff" : "rgba(255,255,255,0.8)",
        fontSize: "10px",
        borderRadius: "4px",
        cursor: "pointer",
        padding: "6px 8px"
    })
});

// --- SECTION: GLOBAL CSS STRING ---
// Contains CSS animations, responsive container queries, and specific fixes for ArcGIS Experience Builder panels.
export const mobileOverrideStyles = `
    /* EXPERIENCE BUILDER UI FIXES */
    .mobile-panel-content-header { height: 30px !important; }
    .expand-mobile-panel-touch-container { height: 30px !important; }
    .expand-mobile-panel[style*="height: 150px"] { height: 280px !important; }

    /* MAPILLARY-JS OVERRIDES */
    .mapillary-js .DirectionsPerspective {
        z-index: 1 !important;
    }
    .mapillary-js .DirectionsPerspectiveArrow {
        filter: drop-shadow(0px 0px 2px rgba(0,0,0,0.8)) !important;
    }
    .mapillary-js .DirectionsPerspectiveContainer {
        bottom: 10px !important;
    }

    /* Z-INDEX STACKING FIXES */
    .legend-container { display: flex !important; }
    .react-datepicker-popper { z-index: 100005 !important; }
    .react-select__menu-portal { z-index: 100005 !important; }
    .glass-scroll-container::-webkit-scrollbar { display: none; }
    .glass-scroll-container { -ms-overflow-style: none; scrollbar-width: none; }

    /* RESPONSIVE SCALING FOR VIEWER CONTROLS */
    .widget-mapillary.jimu-widget .mapillary-sequence-playback,
    .widget-mapillary.jimu-widget .mapillary-sequence-timeline {
        --scale: clamp(0.5, 100cqw / 850, 0.9);
        transform: translateX(-50%) scale(var(--scale)) !important;
        transform-origin: top center !important;
        transition: transform 0.15s ease-out;
    }

    /* CONTAINER QUERIES: RESPONSIVE SIZING BASED ON WIDGET WIDTH */
    @container (max-width: 599px) {
        .widget-mapillary.jimu-widget .mapillary-sequence-playback,
        .widget-mapillary.jimu-widget .mapillary-sequence-timeline {
            transform: translateX(-50%) scale(0.5) !important;
        }
    }

    @container (min-width: 600px) {
        .widget-mapillary.jimu-widget .mapillary-sequence-playback,
        .widget-mapillary.jimu-widget .mapillary-sequence-timeline {
            transform: translateX(-50%) scale(0.75) !important;
        }
    }

    /* MINI BUTTONS FOR SMALL WIDGETS */
    @container (max-width: 350px) {
        .unified-control-buttons-mapped, .unified-control-buttons { width: 24px !important; height: 24px !important; }
        .unified-control-buttons-filters { width: 20px !important; height: 20px !important; }
        .unified-control-buttons-mapped svg, .unified-control-buttons svg { width: 20px !important; height: 20px !important; }
        .unified-control-buttons-filters svg { width: 16px !important; height: 16px !important; }
    }

    /* TINY BUTTONS FOR NARROW SIDEBARS */
    @container (max-width: 250px) {
        .unified-control-buttons-mapped, .unified-control-buttons { width: 20px !important; height: 20px !important; border-radius: 6px !important; }
        .unified-control-buttons-filters { width: 16px !important; height: 16px !important; }
        .unified-control-buttons-mapped svg, .unified-control-buttons svg { width: 12px !important; height: 12px !important; }
    }
    
    /* EXPERIENCE BUILDER PANEL OVERRIDES */
    .p-1 { padding: 0px !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] { border: none !important; box-shadow: none !important; background: transparent !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] .jimu-floating-panel-content { background: transparent !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] .widget-content.p-1 { padding: 0 !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] .resizer-0.bottom-right { right: 0 !important; bottom: 0 !important; width: 15px !important; height: 15px !important; padding: 0 !important; margin: 0 !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] .resize-handle { position: absolute !important; right: 0px !important; bottom: 0px !important; padding: 0 !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] .resize-handle svg path { fill: #35AF6D !important; }
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] .resizer-0.bottom-right:hover svg path{ fill: #82e8ec !important; }

    /* SIDEBAR BUTTON CLAMPING (FLUID SCALING) */
    .glass-control-panel {
        max-height: calc(100% - 10px) !important;
        overflow-y: auto !important;
        scrollbar-width: none;
        gap: 3px !important; 
    }
    .glass-control-panel::-webkit-scrollbar { display: none; }
    .glass-control-panel .unified-control-buttons,
    .glass-control-panel .unified-control-buttons-mapped {
        width: clamp(22px, 8cqh, 30px) !important;
        height: clamp(22px, 8cqh, 30px) !important;
        flex-shrink: 0 !important;
    }
    .glass-control-panel .unified-control-buttons-filters {
        width: clamp(18px, 6cqh, 24px) !important;
        height: clamp(18px, 6cqh, 24px) !important;
        flex-shrink: 0 !important;
    }
    .glass-control-panel svg {
        width: clamp(12px, 70%, 22px) !important;
        height: clamp(12px, 60%, 22px) !important;
        display: block;
        transition: all 0.2s ease;
    }
    .glass-control-panel .unified-control-buttons-filters svg {
        width: clamp(10px, 60%, 16px) !important;
        height: clamp(10px, 60%, 16px) !important;
    }
    .glass-control-panel > div { gap: 2px !important; display: flex !important; flex-direction: column !important; }
    .unified-control-buttons, .unified-control-buttons-mapped { margin-left: 0 !important; }

    /* GLASS UTILITY PANEL */
    .glass-image-utility-panel {
        padding: clamp(2px, 1cqmin, 4px) !important;
        gap: clamp(2px, 1cqh, 6px) !important;
        borderRadius: clamp(6px, 2cqmin, 12px) !important;
        right: clamp(40px, 10cqw, 60px) !important;
        bottom: clamp(20px, 5cqh, 27px) !important;
    }

    .glass-image-utility-panel .utility-button {
        width: clamp(18px, 6cqh, 24px) !important;
        height: clamp(18px, 6cqh, 24px) !important;
    }

    .glass-image-utility-panel .utility-button svg {
        width: clamp(12px, 70%, 18px) !important;
        height: clamp(12px, 70%, 18px) !important;
    }

    .utility-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid #fff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    /* OVERLAY CARD FLUID SCALING */
    .initial-state-card, .loading-card, .no-image-card {
        padding: clamp(10px, 5cqh, 30px) clamp(12px, 5cqw, 40px) !important;
        gap: clamp(4px, 2cqh, 16px) !important;
        max-width: 85% !important;
        border-radius: clamp(8px, 3cqmin, 20px) !important;
    }
    .initial-state-card span:first-of-type, .loading-card div, .no-image-card span {
        font-size: clamp(8px, 4cqmin, 12px) !important;
        line-height: 1.2 !important;
    }
    .initial-state-card span:last-of-type { font-size: clamp(7px, 3cqmin, 10px) !important; }
    .loading-card .premium-spinner, .loading-card .turbo-spinner {
        width: clamp(20px, 8cqmin, 40px) !important; height: clamp(20px, 8cqmin, 40px) !important;
        border-width: clamp(2px, 0.8cqmin, 4px) !important;
    }
    .no-image-card svg, .initial-state-card svg { width: clamp(18px, 6cqmin, 32px) !important; height: clamp(18px, 6cqmin, 32px) !important; }

    /* HIDE SUBTITLES ON SHORT WIDGETS */
    @container (max-height: 200px) {
        .initial-state-card span:last-of-type { display: none !important; }
        .initial-state-card, .loading-card { padding: 8px !important; }
    }

    /* LEGEND FLUID SCALING */
    .legend-container {
        padding: clamp1px, 0.5cqmin, 2px) !important;
        gap: clamp(1px, 1cqh, 4px) !important;
        border-radius: clamp(4px, 2cqmin, 8px) !important;
        bottom: clamp(2px, 2cqh, 2px) !important;
        left: clamp(2px, 2cqw, 2px) !important;
        max-width: 40% !important;
    }
    .legend-container div[style*="opacity: 0.4"] { font-size: clamp(4px, 2cqmin, 8px) !important; margin-bottom: 1px !important; padding-bottom: 1px !important; }
    @container (max-height: 340px) {
        .legend-container div[style*="opacity: 0.4"] { display: none !important; }
        .legend-container { bottom: 0 !important; }
    }
    .legend-container span[style*="font-size"] { font-size: clamp(6px, 3cqmin, 9px) !important; }
    .legend-container span[style*="border-radius: 50%"] { width: clamp(6px, 3cqmin, 9px) !important; height: clamp(6px, 3cqmin, 9px) !important; margin-right: 2px !important; }
    .legend-container button { font-size: clamp(6px, 2cqmin, 8px) !important; padding: 1px 0 !important; margin-top: 2px !important; }
    @container (max-height: 250px) { .legend-container button { display: none !important; } }

    /* KEYFRAME DEFINITIONS */
    @keyframes activePulse {
        0% { box-shadow: 0 0 5px var(--glow); }
        50% { box-shadow: 0 0 15px var(--glow); }
        100% { box-shadow: 0 0 5px var(--glow); }
    }
    .unified-control-buttons.active-layer { animation: activePulse 2s infinite ease-in-out; }

    /* FORCE SMOOTH RESIZE */
    div.jimu-floating-panel[aria-label="Mapillary Explorer"] {
        transition: width 0.05s ease-out, height 0.05s ease-out !important;
    }

    /* PREVENT BLACK FLASH */
    .widget-mapillary .mapillary-js {
        background: #000 !important;
        overflow: hidden !important;
    }

    /* HIDE BLACK STRIPES DURING RESIZE */
    .widget-mapillary .mapillary-viewer {
        overflow: hidden !important;
        background: #1a1a1a !important; /* Darker gray instead of pure black */
    }

    .widget-mapillary .mapillary-viewer canvas {
        transition: none !important; /* Remove any canvas transitions */
    }

    

    /* MOBILE (768px) OVERRIDES */
    @media (max-width: 768px) {
        .widget-mapillary input[type="date"]::-webkit-datetime-edit { display: none !important; }
        .show-panorama-only-filter::after { content: "Panoramas:"; font-size: 9px !important; }
        .show-color-by-date-filter::after { content: "CBD:"; font-size: 9px !important; }
        .react-datepicker { transform: scale(0.6) !important; }
        .react-datepicker-popper { height: 230px !important; }
        .info-box { font-size: 8px !important; max-width: 110px !important; }
        .legend-container { display: none !important; }
        .esri-popup__main-container { width: 250px !important; top: 8% !important; left: 17% !important; max-height:42% !important; }
        .splash-screen-logo { margin-bottom: 15px !important; }
        .splash-screen-text { font-size: 10px !important; }
        .minimap-container { top: 50px !important; left: 50% !important; right: auto !important; transform: translateX(-50%) !important; width: 90% !important; max-width: 350px !important; height: 150px !important; }
        .warning-message-container { font-size: 8px !important; }
    }
`;