/** @jsx jsx */
import { React, jsx } from "jimu-core";

// --- Standard Props for Icons ---
interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: string | number;
  color?: string;
}

// 1. Fullscreen / Maximize
export const Maximize = ({ size = 16, color = "white", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>
);

// 2. Exit Fullscreen / Minimize
export const Minimize = ({ size = 22, color = "white", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-14v3h3v2h-5V5h2z"/>
  </svg>
);

// 3. Map Layer (World)
export const MapLayer = ({ size = 16, color = "white", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <line x1="15" y1="4" x2="15" y2="20" />
  </svg>
);

// 4. Turbo Mode (Lightning)
export const Turbo = ({ size = 16, color = "white", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
    <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
  </svg>
);

// 5. Turbo Filter (Funnel / Magnifying Glass)
export const Filter = ({ size = 14, color = "#fff", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 4h18L14 12v7l-4 2v-9L3 4z" fill={color}/>
  </svg>
);

// 6. Traffic Sign (Custom Composite Icon)
export const AllMapillaryTrafficSigns = ({ size = 16, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="5" height="7" fill="#FFC01B"/>
    <rect x="4" y="9" width="7" height="7" rx="3.5" fill="white"/>
    <path d="M12.5 0L15.5311 1.75V5.25L12.5 7L9.46891 5.25V1.75L12.5 0Z" fill="#FF6D1B"/>
  </svg>
);

// 7. Search / Inspect (Magnifying Glass)
export const Search = ({ size = 24, color = "currentColor", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="16.65" y1="16.65" x2="21" y2="21" />
  </svg>
);

// 8. Map Objects (Points/Shapes)
export const AllMapillaryObjects = ({ size = 16, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="3" cy="3" r="3" fill="#46CDFA"/>
    <circle cx="13" cy="3" r="3" fill="#FFB81A"/>
    <circle cx="3" cy="13" r="3" fill="#F35700"/>
    <circle cx="13" cy="13" r="3" fill="#D99AB9"/>
    <circle cx="8" cy="8" r="3" fill="#D2DCE0"/>
  </svg>
);

// 9. Download
export const Download = ({ size = 14, color = "currentColor", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

// 10. Share (Network Node)
export const Share = ({ size = 14, color = "currentColor", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="18" cy="5" r="3"></circle>
    <circle cx="6" cy="12" r="3"></circle>
    <circle cx="18" cy="19" r="3"></circle>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
  </svg>
);

// 11. Time Travel (Clock)
export const TimeTravel = ({ size = 14, color = "currentColor", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

// 12. Zoom Warning (Triangle)
export const Warning = ({ size = 16, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 3L1 21H23L12 3Z" fill="white" />
    <rect x="11" y="9" width="2" height="6" fill="rgba(255,165,0,0.95)" />
    <rect x="11" y="16.5" width="2" height="2" fill="rgba(255,165,0,0.95)" />
  </svg>
);

// 13. No Image (Circle Slash)
export const NoImage = ({ size = 16, color = "currentColor", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/><line x1="7" y1="7" x2="17" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// 14. Current Address / World
export const Globe = ({ size = 24, color = "currentColor", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 0 20a15.3 15.3 0 0 1 0-20z" />
  </svg>
);

// 15. Map Open (Show Minimap)
export const MapOpen = ({ size = 16, color = "currentColor", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
    <line x1="8" y1="2" x2="8" y2="18"></line>
    <line x1="16" y1="6" x2="16" y2="22"></line>
  </svg>
);

// 16. Map Closed (Hide Minimap)
export const MapClosed = ({ size = 16, color = "currentColor", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

// 17. Detections
export const Detection = ({ size = 16, color = "white", ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);