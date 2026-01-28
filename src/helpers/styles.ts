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
    marginRight: "4px",
    border: "1px solid rgba(255,255,255,0.3)", // Softer border
    flexShrink: 0    // Prevents circle from squishing
});

// --- Glassmorphism UI Styles ---
export const glassStyles = {
    container: {
        position: 'absolute',
        top: '5px',
        left: '5px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        // Glass Effect
        background: 'rgba(20, 20, 20, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '4px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
    } as React.CSSProperties,

    // Helper to generate button styles dynamically
    getButtonStyle: (active: boolean, baseColor: string, isSmall: boolean = false): React.CSSProperties => ({
        // Logic: Active = Colorful Glass, Inactive = Dark Glass
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
        
        // The "Glass Edge" border
        border: active 
            ? '1px solid rgba(255, 255, 255, 0.3)' 
            : '1px solid rgba(255, 255, 255, 0.05)',
        
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        
        // Glow effect when active
        boxShadow: active 
            ? `0 0 10px ${baseColor.replace('0.9', '0.4')}, inset 0 0 10px rgba(255,255,255,0.1)` 
            : '0 2px 5px rgba(0,0,0,0.1)',
            
        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
        transform: active ? 'scale(1.05)' : 'scale(1)'
    }),

    groupContainer: (active: boolean): React.CSSProperties => ({
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        borderRadius: '10px',
        // Subtle background for grouped items
        background: active ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        border: active ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
        transition: 'all 0.3s ease'
    }),

    noImageContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 5, // Lower than controls (10000) but above map (0)
        
        // Deep Dark Glass Effect
        background: "rgba(18, 20, 24, 0.75)", // Dark slate tint
        backdropFilter: "blur(12px) grayscale(50%)", // Blurs the map and desaturates it
        WebkitBackdropFilter: "blur(12px) grayscale(50%)",
        
        opacity: 1,
        transition: "opacity 0.6s ease-in-out"
    } as React.CSSProperties,

    noImageContent: {
        display: "flex",
        flexDirection: "column", // Stack icon above text
        alignItems: "center",
        gap: "12px",
        
        // Typography
        color: "rgba(255, 255, 255, 0.8)",
        fontSize: "13px",
        fontWeight: 500,
        letterSpacing: "0.5px",
        textAlign: "center",
        
        // Text Shadow for readability
        textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        
        // Optional: Put the text inside a mini-glass card
        padding: "20px 30px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
    } as React.CSSProperties,
    // --- Initial "Click to View" State ---
    initialStateContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 4, // Low z-index so it doesn't block controls
        
        // Light Glass Effect (So user sees the map clearly)
        background: "rgba(0, 0, 0, 0.2)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        transition: "all 0.3s ease"
    } as React.CSSProperties,

    initialStateCard: {
        padding: "16px 18px",
        borderRadius: "16px",
        
        // Card Glass Look
        background: "rgba(30, 30, 35, 0.6)", // Dark semi-transparent card
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

    loadingContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        
        // Dark blurred background to focus attention on the loader
        background: "rgba(10, 10, 15, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        transition: "all 0.3s ease"
    } as React.CSSProperties,

    loadingCard: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "24px 32px",
        borderRadius: "20px",
        
        // The Glass Card
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)",
        backdropFilter: "blur(16px)"
    } as React.CSSProperties,

    loadingSpinner: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        // Base ring (faint)
        border: "3px solid rgba(255, 255, 255, 0.1)",
        // Active ring (Neon Blue)
        borderTop: "3px solid #3b82f6", 
        borderRight: "3px solid rgba(59, 130, 246, 0.3)", // Fade out effect
        // Glow effect
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

    compactLoadingCard: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",           // Reduced from 16px
        padding: "12px 16px", // Reduced from 24px 32px
        borderRadius: "16px",
        textAlign: "center",
        
        // Same Glass Look
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 15px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)",
        backdropFilter: "blur(16px)"
    } as React.CSSProperties,

    // Optional: Slightly smaller text for the compact view
    compactLoadingText: {
        color: "#ffffff",
        fontSize: "10px", // Reduced from 13px
        fontWeight: 500,
        letterSpacing: "0.5px",
        textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        opacity: 0.9,
        maxWidth: "240px" // Forces text to wrap neatly if too wide
    } as React.CSSProperties,

    turboSpinner: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        // Base ring
        border: "3px solid rgba(255, 255, 255, 0.1)",
        // Active ring (Gold/Yellow)
        borderTop: "3px solid #FFD700", 
        borderRight: "3px solid rgba(255, 215, 0, 0.3)", 
        // Gold Glow
        boxShadow: "0 0 15px rgba(255, 215, 0, 0.5)", 
        // Slightly faster animation for "Turbo" feel
        animation: "spin 0.7s linear infinite"
    } as React.CSSProperties,

      splashContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 20000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        // Deep, rich background
        background: "radial-gradient(circle at center, rgba(20, 30, 40, 0.85) 0%, rgba(5, 5, 10, 0.95) 100%)",
        backdropFilter: "blur(15px)",
        WebkitBackdropFilter: "blur(15px)",
        transition: "all 0.8s cubic-bezier(0.6, -0.28, 0.735, 0.045)", // "Zoom in" exit effect
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
        // A subtle glow behind the card
        boxShadow: "0 0 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.03)",
        backdropFilter: "blur(20px)",
        animation: "float 6s ease-in-out infinite" // Floating motion
    } as React.CSSProperties,

    // Container for the Logo + Ripples
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

    // The Sonar Ripple Effect
    splashRipple: {
        position: "absolute",
        width: "60px",
        height: "60px",
        borderRadius: "50%",
        border: "1px solid rgba(53, 175, 109, 0.6)", // Mapillary Green
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
        animation: "shimmer 3s linear infinite", // Text shine effect
        marginBottom: "12px"
    } as React.CSSProperties,

    // Sleek Progress Bar Container
    progressTrack: {
        width: "140px",
        height: "4px",
        background: "rgba(255,255,255,0.1)",
        borderRadius: "2px",
        overflow: "hidden",
        position: "relative"
    } as React.CSSProperties,

    // The Moving Bar
    progressBar: {
        position: "absolute",
        top: 0,
        left: 0,
        height: "100%",
        width: "50%",
        background: "#35AF6D", // Mapillary Green
        boxShadow: "0 0 10px #35AF6D", // Glowing bar
        borderRadius: "2px",
        animation: "loading 1.5s ease-in-out infinite"
    } as React.CSSProperties,

    sequencePickerContainer: {
        background: "rgba(20, 20, 30, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "3px 4px", // Reduced padding
        borderRadius: "20px",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: "4px", // Reduced gap
        justifyContent: "center",
        marginTop: "5px",
        overflow: "hidden" // Prevent spillover
    } as React.CSSProperties,

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
        width: "18px", // Smaller buttons
        height: "18px",
        flexShrink: 0, // Don't let arrows shrink
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "9px",
        transition: "background 0.2s"
    } as React.CSSProperties,

    sequenceDot: (color: string): React.CSSProperties => ({
        display: "inline-block",
        width: "8px", // Smaller dot
        height: "8px",
        borderRadius: "50%",
        backgroundColor: color,
        border: "1px solid rgba(255,255,255,0.8)",
        boxShadow: "0 0 4px rgba(0,0,0,0.5)",
        flexShrink: 0
    }),

    sequenceText: {
        whiteSpace: "nowrap", 
        fontSize: "9px", // Smaller font
        color: "#fff",
        fontWeight: 500,
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        overflow: "hidden",
        textOverflow: "ellipsis"
    } as React.CSSProperties,

    filterBarContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center', // Centers items when stacked
        gap: '6px',              // Vertical/Horizontal gap between chips
        // Glass Style
        background: "rgba(20, 20, 30, 0.7)", 
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "2px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        pointerEvents: "auto",
        zIndex: 10001,           // Ensured bar is above map but below dropdowns
        // Ensured standard behavior (No scrolling)
        overflow: "visible"
    } as React.CSSProperties,

    // Helper for the colored sections (Turbo/Signs/Objects)
    filterGroup: (baseColor: string): React.CSSProperties => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 6px',
        borderRadius: '8px',
        // Tinted Glass background based on the feature color
        background: `linear-gradient(135deg, ${baseColor}1A 0%, ${baseColor}05 100%)`, // ~10% opacity
        border: `1px solid ${baseColor}33`, // ~20% opacity border
        boxShadow: `inset 0 0 10px ${baseColor}0D`
    }),

    // The text input for Username
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

    // Small icon buttons (Calendar)
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

// --- Custom Styles for React-Select to match Glassmorphism ---
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
        // Glass Background
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
        color: "#fff", // White text
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
        // Note: zIndex here doesn't matter much if using portal, 
        // but 'menuPortal' above does.
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
        backgroundColor: state.isFocused ? `${baseColor}33` : "transparent", // Highlight color
        color: state.isFocused ? "#fff" : "rgba(255,255,255,0.8)",
        fontSize: "10px",
        borderRadius: "4px",
        cursor: "pointer",
        padding: "6px 8px"
    })
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

    .legend-container { 
        display: flex !important; 
    }

    .react-datepicker-popper { z-index: 100005 !important; }
    
    .react-select__menu-portal { z-index: 100005 !important; }

    .glass-scroll-container::-webkit-scrollbar {
        display: none;
    }
        
    .glass-scroll-container {
        -ms-overflow-style: none;  /* IE and Edge */
        scrollbar-width: none;  /* Firefox */
    }

    .widget-mapillary.jimu-widget 
    .mapillary-sequence-playback,
    .widget-mapillary.jimu-widget 
    .mapillary-sequence-timeline {
        --scale: clamp(0.5, 100cqw / 850, 0.9);
        transform: translateX(-50%) scale(var(--scale)) !important;
        transform-origin: top center !important;
        transition: transform 0.15s ease-out;
    }

    @container (max-width: 599px) {
        .widget-mapillary.jimu-widget 
        .mapillary-sequence-playback,
        .widget-mapillary.jimu-widget 
        .mapillary-sequence-timeline {
            transform: translateX(-50%) scale(0.5) !important;
        }
    }

    @container (min-width: 600px) {
        .widget-mapillary.jimu-widget 
        .mapillary-sequence-playback,
        .widget-mapillary.jimu-widget 
        .mapillary-sequence-timeline {
        transform: translateX(-50%) scale(0.75) !important;
        }
    }

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
            .legend-container { display: none !important; }
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