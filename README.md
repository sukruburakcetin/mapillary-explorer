<h1 align="center">
  <img src="https://images2.imgbox.com/d7/93/x4KQaHGa_o.jpg" width="250"><br/>
  Mapillary Explorer
</h1>

![Version](https://img.shields.io/badge/version-3.6.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![ArcGIS](https://img.shields.io/badge/ArcGIS-Experience%20Builder-007AC2)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Esri Enterprise](https://img.shields.io/badge/Esri-Enterprise_12.0+-61DAFB)
![Esri](https://img.shields.io/badge/Esri-ExB_Developer_Edition_1.18-61BAFB)

A high-performance custom widget for **ArcGIS Experience Builder** that seamlessly integrates **Mapillary imagery** with ArcGIS maps. Designed for speed and interactivity, this widget allows users to explore image sequences, visualize high-volume coverage data in real-time, and interact with detected map features like traffic signs and infrastructure assets.

## Table of Contents

1. [Key Features](#key-features)
2. [Setup & Installation](#setup--installation)
3. [Configuration](#configuration)
4. [Mapillary Explorer Demo Video](#mapillary-explorer-demo-video)
5. [Download Release](#-download-built-widget-latest-version)
6. [License](#license)
   
## Key Features

### Deep Map Integration
*   **Interactive Viewer:** Full synchronization between the Mapillary viewer and the ArcGIS map. Features a dynamic camera bearing cone, pulsing location markers, and "click-to-move" functionality.
*   **Smart Geocoding:** Real-time reverse geocoding using the ArcGIS World Geocoding Service to display contextual address data.
*   **Advanced Graphics:** Uses the ArcGIS Maps SDK to draw animated pulsing points, directional cones, and sequence polylines with smooth visual feedback.

### New Settings Panel Capabilities:
*  **Turbo Mode Only:** Lock the widget into coverage analysis mode and disable standard navigation.
*  **Default Creator:** Pre-fill the username filter to load specific user data on startup automatically.
*  **Force Coverage Layer:** Keep the Mapillary imagery geometry layer always visible.
*  **UI Customization:** Hide the "Traffic Signs" or "Mapillary Objects" buttons to declutter the interface.

### Turbo Mode (High-Speed Coverage)
*   **Vector Tile Rendering:** Renders millions of coverage points efficiently using **PBF decoding** and **Mapbox Vector Tiles**.
*   **Advanced Filtering:** Filter coverage in real-time by:
    *   Creator Username
    *   Date Range (Start/End)
    *   Panorama (360°) status
*   **Date-Based Visualization:** Optional color-coding of coverage points by year for temporal analysis.

### Feature Recognition Layers
*   **Traffic Signs & Objects:** Toggleable layers displaying detected assets (benches, manholes, signs) using custom sprite-based icons.
*   **Zoom-Aware:** Automatically manages layer visibility based on zoom levels to optimize performance.
*   **Interactive Popups:** Detailed metadata display for every detected feature.

### Smart Navigation & UI
*   **Sequence "Revolver":** An intelligent carousel selector to switch between multiple overlapping image sequences at the same location.
*   **Fullscreen Minimap:** A secondary map panel within fullscreen mode that allows users to track their route and "click-to-jump" to any frame in the sequence.
*   **Responsive Design:** Adaptive UI that scales from desktop to mobile, with touch-optimized controls and layout injection.

### Engine Customization
*   **Pro-Level Render Modes:** Switch between Fill (default immersive view) and Letterbox (ideal for wide-screen widgets to see the original uncropped photo).
*   **Transition Control:** Choose between Smooth motion blending (cinematic feel) or Instantaneous jumps (snappy, high-speed inspection).
*   **Camera Horizon Control:** Set custom default X/Y camera angles (0.0 to 1.0) to ensure the viewer always opens at a specific perspective (e.g., tilted down at the road or up at the sky).

---

## Performance & Architecture

*   **Intelligent Caching:** Implements multi-level caching (Session & LocalStorage) for sequence coordinates and sprite assets to minimize API calls.
*   **Optimized Rendering:** Uses **debouncing** for hover effects/API queries and handles complex state transitions to ensure smooth 60fps map interaction.
*   **Robust Error Handling:** Graceful degradation for missing imagery or network issues, with user-friendly status messages.
*   **Secure Configuration:** Centralized token management via the widget manifest to avoid hardcoded credentials.

## Technical Stack

| Category | Technologies |
|----------|--------------|
| **Framework** | ArcGIS Experience Builder (React-based) |
| **Mapping** | ArcGIS Maps SDK for JavaScript (`@arcgis/core`), MapillaryJS |
| **Data Parsing** | Mapbox Vector Tiles, PBF decoding |
| **UI Components** | React-Select, React-Datepicker |

## Setup & Installation

This widget is distributed as a **prebuilt (production) package** containing a `/dist` folder and `manifest.json`.  
You do **not** need ArcGIS Experience Builder Developer Edition to use it, only a web server (such as IIS) and portal administrator privileges.
However, if you want to view it on ArcGIS Developer Edition (localhost:3001), follow the CONTRIBUTE.md guide in the repository.

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

## Configuration

This widget is designed to run inside ArcGIS Experience Builder.

Below is an example of the `manifest.json` file used for configuration:

```
{
  "name": "mapillary-explorer",
  "label": "Mapillary Explorer",
  "type": "widget",
  "version": "3.6.0",
  "exbVersion": "1.18.0",
  "author": "Sukru Burak Cetin",
  "description": "Mapillary Explorer is a custom ArcGIS Experience Builder widget that brings
    Mapillary imagery directly into your web maps.",
  "copyright": "",
  "license": "http://www.apache.org/licenses/LICENSE-2.0",
  "dependency": [
    "jimu-arcgis"
  ],
  "properties": {
    "useMapWidget": true,
    "mapillaryAccessToken": "MLY|..."
  },
  "translatedLocales": [
    "en"
  ],
  "defaultSize": {
    "width": 600,
    "height": 400
  }
}
```
## Mapillary Explorer Demo Video
[![Watch the video](https://img.youtube.com/vi/ypu2tmyYTMg/hqdefault.jpg)](https://www.youtube.com/watch?v=ypu2tmyYTMg)

## 📦 [Download Built Widget Latest Version](https://github.com/sukruburakcetin/mapillary-explorer/releases/latest)

## License
This project is licensed under the **MIT License**.
