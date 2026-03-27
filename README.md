<h1 align="center">
  <img src="https://images2.imgbox.com/d7/93/x4KQaHGa_o.jpg" width="250"><br/>
  Mapillary Explorer
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-4.2.0-blue.svg" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"/>
  <img src="https://img.shields.io/badge/ArcGIS-Experience%20Builder%201.19-007AC2" alt="ArcGIS"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/Esri%20Enterprise-12.0+-61DAFB" alt="Esri Enterprise"/>
  <img src="https://img.shields.io/badge/zero--dependency%20UI-built--in-blueviolet" alt="Zero Dependency UI"/>
</p>

## Table of Contents

1. [Key Features](#key-features)
2. [Project Structure](#project-structure)
3. [Setup & Installation](#setup--installation)
4. [Contributing](#contributing)
5. [Mapillary Explorer Demo Video](#mapillary-explorer-demo-video)
6. [Mapillary Explorer Demo Experience Builder App](#mapillary-explorer-demo-experience-builder-app)
7. [ArcGIS Online Mapillary Explorer App](#arcgis-online-mapillary-explorer-app)
8. [Download Release](#-download-built-widget-latest-version)
9. [License](#license)
   
## Key Features

### Map and Viewer Integration
- **Synchronized viewer and map.** The Mapillary viewer and ArcGIS map stay in sync at all times with a live bearing cone, pulsing location marker, and click-to-move navigation.
- **Shareable URL state.** Bearing, map scale, image ID, and map type are written to the address bar in real time. Any view can be shared with a single copy-paste and restored exactly on open.
- **Fullscreen minimap.** A secondary ArcGIS map panel appears in fullscreen mode with a live direction cone. Click any point to jump to that frame or search an entirely new location without leaving fullscreen.

### Turbo Mode and Coverage Filtering
- **High-speed coverage rendering.** Millions of Mapillary coverage points are decoded from PBF/VTL tiles and rendered with real-time filtering by creator, date range, and panorama type.
- **Consistent filtering at all zoom levels.** The green Mapillary coverage layer at overview zoom respects the same date and pano filters as Turbo Mode, so filtered data is always visible without needing to zoom in first.
- **Year-based color coding.** Coverage points can be colored by capture year with a clickable legend to isolate individual years.

### Feature Detection Layers
- **Traffic signs and objects.** Toggleable layers render detected assets with sprite-based icons, interactive popups, and parallel tile fetching for significantly faster load times at zoom level 16 and above.
- **Configurable detection categories.** Which detection types are visible can be adjusted in `constants.ts` without modifying any rendering logic.

### Deployment Presets
- **Settings panel configuration.** Administrators can pre-configure creator username, date range, pano filter, and color-by-date from the Experience Builder settings panel. Any active preset automatically enables Turbo Mode on load.
- **Per-deployment UI control.** Individual toolbar buttons (Center Map, 3D Bearing Sync, Traffic Signs, Objects) can be hidden to match the needs of each deployment.

### Street Coverage Analysis. 
- **Run an on-demand analysis of road coverage freshness** directly in the InfoBox. Segments are classified into four tiers (fresh, aging, stale, uncovered) using majority vote across matched Turbo coverage points and drawn on the map in real time.

---

## Project Structure

```
mapillary-explorer/
└── src/
    ├── runtime/
    │   └── widget.tsx               # Main widget (organized with #region blocks)
    ├── setting/
    │   └── setting.tsx              # ArcGIS EB settings panel
    ├── components/
    │   ├── ControlBar.tsx           # Top toolbar (turbo, tiles, fullscreen, filter toggles)
    │   ├── FilterBar.tsx            # Turbo filter inputs (username, dates, pano, color-by-date)
    │   ├── GlassDatePicker.tsx      # Built-in date picker (replaces react-datepicker)
    │   ├── GlassSelect.tsx          # Built-in dropdown (replaces react-select)
    │   ├── Icons.tsx                # All SVG icon components
    │   ├── ImageUtilityGroup.tsx    # Floating action buttons (share, download, center, sync)
    │   ├── InfoBox.tsx              # Live image metadata panel
    │   ├── Legend.tsx               # Coverage color legend overlay
    │   ├── SequencePicker.tsx       # Sequence carousel selector
    │   ├── SplashScreen.tsx         # Initial loading overlay
    │   └── types.ts                 # Shared TypeScript prop interfaces for all components
    ├── utils/
    │   ├── constants.ts             # Layer IDs, API URLs, zoom thresholds, detection filter lists
    │   ├── filterBuilder.ts         # Mapillary VTL filter expression builder
    │   ├── geoUtils.ts              # Pure geo math: distance, bearing, tile math, cone, debounce...
    │   ├── mapillaryDetections.ts   # Pure functions: decodeAndNormalizeGeometry, getDetectionColor
    │   ├── mapillaryObjectNameMap.ts # Human-readable Mapillary object label map
    │   ├── mapillaryRenderers.ts    # Pure functions: createYearBasedRenderer, YEAR_COLOR_PALETTE
    │   ├── spriteUtils.ts           # Sprite sheet cropping and icon loading utilities
    │   └── styles.ts                # All glassStyles objects and mobileOverrideStyles CSS string
    └── config.ts                    # Widget config TypeScript interface
```

> Pure utility functions in `utils/` have no React or ArcGIS dependencies and are fully unit-testable in isolation. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local development guide.

---

## Setup & Installation

This widget is distributed as a **prebuilt (production) package** containing a `/dist` folder and `manifest.json`.  
You do **not** need ArcGIS Experience Builder Developer Edition to use it, only a web server (such as IIS) and portal administrator privileges.
However, if you want to view it on ArcGIS Developer Edition (localhost:3001), follow the CONTRIBUTE.md guide in the repository.

> ArcGIS Enterprise users and contributors: There is an important difference between running the prebuilt widget and building from source. Enterprise ships with a bundled version of Experience Builder that lags behind the Developer Edition. Please read [COMPATIBILITY.md](COMPATIBILITY.md) before building from source to avoid version mismatch issues.

To run it locally for development, see [CONTRIBUTING.md](CONTRIBUTING.md).

---
### 1. Prepare the Widget Folder

1.1. Copy the exported release version of the widget folder (e.g., `mapillary-explorer`) to your web server or IIS directory.  
Example path:
```
   C:\inetpub\wwwroot\mapillary-explorer\
```

1.2. Ensure the folder contains the following files:
```text
mapillary-explorer/
├── dist/
├── config.json
├── icon.svg
└── manifest.json
```
1.3. Verify that the `manifest.json` file includes your **Mapillary access token**:
```json
{
  "properties": {
    "useMapWidget": true,
    "mapillaryAccessToken": "MLY|YOUR_ACCESS_TOKEN"
  }
}
```
1.4. You can get your Mapillary Access Token https://www.mapillary.com/dashboard/developers here for free.

### 2. Host the Widget on a Web Server
Make sure your web server (IIS, Nginx, Apache, etc.) can serve the `mapillary-explorer` folder publicly.  
You should be able to access the manifest file from a browser, for example:
```text
https://yourserver.domain.com/mapillary-explorer/manifest.json
```
> **Success check**: If you open that URL and see valid JSON content, your hosting setup is correct.

---

### 3. Register the Widget in ArcGIS Portal

> **Note**: Portal administrator privileges are required for this step.

1. Open your **ArcGIS Enterprise** or **ArcGIS Online** portal in a browser.
2. Go to **My Content** → **Add Item** → **An application**.
3. Choose **Experience Builder widget** as the application type.
4. In the **URL** field, provide the link to your hosted `manifest.json` file.  
   **Example**:
https://yourserver.domain.com/mapillary-explorer/manifest.json
5. The **Title** field will auto-populate from the manifest (you can edit it if needed).
6. Add relevant **tags** (e.g., `mapillary`, `streetview`, `experience-builder`).
7. Click **Add Item**.

The widget is now registered in your portal as a custom Experience Builder widget.

---

### 4. Use the Widget in Experience Builder

Once registered:

1. Open **ArcGIS Experience Builder**.
2. Create a new app or edit an existing one.
3. First, add the map widget and expand it to fit the screen.
4. Then add a widget controller from the menu and toolbars section.
5. In the widget list, expand the **Custom Widgets** section.
6. You’ll see **Mapillary Explorer** (or your custom title).
7. Drag and drop it into your widget controller that is located on map widget.
8. **Connect it to a Map widget** for full functionality.
```text
NOTE: After dropping it into your widget controller, run the widget once in edit mode before saving and publishing. 
This will allow you to see the map widget and make it ready for publishing. 
If you publish it without running it once, you may receive a warning that the map widget cannot be found.
```

## Contributing

Contributions are welcome. The project is structured to make adding new features straightforward.

- **`src/utils/`** contains pure functions with no React or ArcGIS dependencies. New geo helpers, API utilities, or renderer factories added here are immediately unit-testable.
- **`src/utils/constants.ts`** controls detection filtering, layer IDs, API URLs, zoom thresholds, and timing values. Most behavioral changes can be made here without touching feature logic.
- **`src/components/`** contains React components, each with a typed props interface defined in `types.ts`.
- **`src/runtime/widget.tsx`** is organized with `// #region` comment blocks for each feature area: Sequence Management, Minimap, Coverage Layers, Turbo Mode, AI Detections, Share and Export, Map Graphics, Utilities, and more.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full local development setup guide.

---

## Mapillary Explorer Demo Experience Builder App
https://sukruburakcetin.github.io/mapillary-explorer-demo/

## ArcGIS Online Mapillary Explorer App
https://www.arcgis.com/home/item.html?id=b4da7dbf1f684510be0918c6b58905c8

## Mapillary Explorer Demo Video
[![Watch the video](https://img.youtube.com/vi/5LGTJHSNFa8/hqdefault.jpg)](https://www.youtube.com/watch?v=5LGTJHSNFa8)

## 📦 [Download Built Widget Latest Version](https://github.com/sukruburakcetin/mapillary-explorer/releases/latest)

## License
This project is licensed under the **MIT License**.

### Third-Party Terms
Use of Mapillary data or services is subject to [Mapillary's Terms of Use](https://www.mapillary.com/terms).
