<h1 align="center">
  <img src="https://images2.imgbox.com/d7/93/x4KQaHGa_o.jpg" width="250"><br/>
  Mapillary Explorer
</h1>

This is a custom **ArcGIS Experience Builder widget** written in **TypeScript + React** that integrates **Mapillary street-level imagery** with an **ArcGIS web map**.

It allows users to click a point on the map and instantly load the corresponding Mapillary panorama, complete with visual map markers, sequence tracking, and geocoded information.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Setup & Installation](#setup--installation)
4. [Configuration](#configuration)
5. [Mapillary Explorer Demo Video](#mapillary-explorer-demo-video)
6. [Download Release](#-download-built-widget-latest-version)
7. [License](#license)

---

## Overview

The Mapillary ArcGIS Experience Builder Widget is a comprehensive street-level imagery exploration tool that seamlessly integrates Mapillary’s vast database of geotagged photos with ArcGIS web maps. This advanced widget provides users with multiple ways to discover, visualize, and interact with street-level imagery and detected map objects directly within their ArcGIS Experience Builder applications.

When users interact with the map, the widget intelligently finds and displays the most relevant Mapillary imagery while providing rich visual context through:
- Smart sequence navigation with color-coded route overlays
- Interactive map graphics showing clicked locations, active images, and camera viewsheds
- Multiple exploration modes including Normal Mode for sequence browsing and Turbo Mode for direct coverage exploration
- Advanced filtering capabilities for traffic signs and map objects with visual icon previews
- Comprehensive address information through integrated reverse geocoding

---

## Features

### Core ArcGIS Integration

- Deep Map Integration: Uses JimuMapViewComponent for seamless connection with active Experience Builder map widgets
- Advanced Graphics System: Draws sophisticated Esri Graphics including animated pulsing points, directional view cones, sequence polylines, and visual click feedback
- Multi-Mode Map Interaction: Handles complex click events with hit-testing for multiple layer types and interaction modes
- Intelligent Sequence Management: Automatically detects and switches between multiple nearby image sequences

### Comprehensive Mapillary API Integration

- Spatial Query Engine: Uses advanced bounding box queries (/images?bbox=...) to find nearby imagery within configurable distance thresholds
- Sequence Intelligence: Automatically groups images by sequence and retrieves complete coordinate sets for route visualization
- Batch Data Processing: Efficiently processes image metadata including creator information, capture dates, and panorama detection
- Smart Caching System: Implements session-based coordinate caching to minimize API calls and improve performance

### Vector Tile Integration

- Real-time Coverage Display: Shows live Mapillary coverage using Vector Tile layers for sequences and individual images
- Advanced Filtering System: Provides zoom-level-aware filtering with VectorTileLayer for coverage and FeatureLayer for detailed interactions
- Traffic Signs Layer: Displays comprehensive traffic sign data with custom sprite-based icon rendering
- Map Objects Layer: Shows detected objects (benches, street lights, traffic cones, etc.) with human-readable names and filtering
- Turbo Mode: Direct-click coverage exploration with optional user filtering and date-based color coding(works super fast)

## Advanced User Interface Features

### Dual-Mode Operation

- Normal Mode: Traditional sequence-based exploration with intelligent sequence switching
- Turbo Mode: Direct coverage point interaction with advanced filtering (username, date range, panorama type, color-coding by year)

### Interactive Controls

- Unified Control Panel: Organized button groups for fullscreen, layer toggles, and mode switching
- Smart Sequence Selector: Revolving carousel showing multiple available sequences with color coding and date information
- Advanced Filter Dropdowns: React-Select powered filtering with icon previews for traffic signs and objects
- Dynamic Layer Management: Zoom-level-aware layer activation/deactivation to optimize performance

### Visual Feedback Systems

- Animated Graphics: Pulsing active points, ripple click effects, and smooth transitions
- Camera Viewshed Visualization: Dynamic cone graphics showing camera direction and adjustable zoom levels
- Color-Coded Legends: Context-sensitive legends for different modes and active layers
- Progressive Loading Indicators: Multi-stage loading screens with descriptive status messages

## Enhanced Data Management

### Access Token Security

- Manifest Integration: Securely loads Mapillary access tokens from widget manifest properties
- Centralized Configuration: Single-point token management avoiding hardcoded credentials
- Displays clear fallback messages for missing or unavailable data.

### Intelligent Caching

- Multi-Level Caching:
	- Session cache for sequence coordinates to reduce API calls

	- LocalStorage persistence for last-viewed sequence across widget sessions

	- Sprite image caching for traffic sign and object icons
	
- Cache Management: User-controlled cache clearing with complete state reset

### Advanced Geocoding

- Integrated Address Resolution: Real-time reverse geocoding using ArcGIS World Geocoding Service
- Smart Address Display: Contextual address formatting optimized for UI space constraints

## Technical Architecture

### Responsive Design

- Multi-Device Support: CSS injection system for mobile-responsive legends and controls
- Dynamic Sizing: Adaptive UI elements that scale based on screen size and widget dimensions
- Touch Optimization: Mobile-friendly interaction patterns with appropriate button sizing

### Performance Optimization

- Debounced Operations: Smart debouncing for API calls, filter updates, and map interactions
- Zoom-Level Management: Automatic layer activation/deactivation based on zoom thresholds
- Efficient Graphics Management: Selective graphics clearing and redrawing to minimize map rendering overhead

### Advanced State Management

- Complex State Transitions: Handles multiple simultaneous modes, filters, and interaction states
- Event-Driven Architecture: Comprehensive event handling for map interactions, viewer changes, and UI updates
- Lifecycle Management: Proper cleanup of event handlers, graphics, and API resources

### Error Handling & Resilience

- Graceful Degradation: Comprehensive fallback handling for missing imagery, API failures, and network issues
- User-Friendly Messaging: Clear status indicators and error messages with automatic dismissal
- Robust Cleanup: Complete resource cleanup on widget close/reopen to prevent memory leaks

## Setup & Installation

This widget is distributed as a **prebuilt (production) package** containing a `/dist` folder and `manifest.json`.  
You do **not** need ArcGIS Experience Builder Developer Edition to use it, only a web server (such as IIS) and portal administrator privileges.

---

### 1. Prepare the Widget Folder

1.1. Copy the exported widget folder (e.g., `mapillary-explorer`) to your web server or IIS directory.  
   Example path:
   ```
   C:\inetpub\wwwroot\mapillary-explorer\
```

1.2. Ensure the folder contains the following files:
```text
mapillary-explorer/
├── dist/
├── manifest.json
├── config.json
└── README.md
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
  "version": "1.0.0",
  "exbVersion": "1.18.0",
  "author": "Sukru Burak Cetin",
  "description": "Mapillary Explorer is a custom ArcGIS Experience Builder widget that brings street-level Mapillary imagery directly into your web maps.",
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

---

### Mapillary Explorer Demo Video

[![Watch the video](https://img.youtube.com/vi/TYrrStp9WU8/hqdefault.jpg)](https://www.youtube.com/watch?v=TYrrStp9WU8)

---

### 📦 [Download Built Widget Latest Version](https://github.com/sukruburakcetin/mapillary-explorer/releases/latest)
---
### License

This project is licensed under the **MIT License**.
