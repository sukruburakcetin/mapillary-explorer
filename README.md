<h1 align="center">
  <img src="https://images2.imgbox.com/88/fe/WenwtUOl_o.jpg"><br/>Mapillary Explorer
</h1>

This is a custom **ArcGIS Experience Builder widget** written in **TypeScript + React** that integrates **Mapillary street-level imagery** with an **ArcGIS web map**.

It allows users to click a point on the map and instantly load the corresponding Mapillary panorama, complete with visual map markers, sequence tracking, and geocoded information.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Setup & Installation](#setup--installation)
4. [Configuration](#configuration)
5. [How It Works](#how-it-works)
6. [Mapillary Explorer Demo Video](#mapillary-explorer-demo-video)
7. [State Management](#state-management)
8. [Architecture](#architecture)
9. [Download Release](#-download-built-widget-latest-version)
10. [License](#license)

---

## Overview

The Mapillary Esri Experience Builder Widget connects ArcGIS web maps with Mapillary’s street-level imagery.  
Users can explore ground-level images directly from a map by clicking anywhere within the map extent.

When the user clicks on the map, the widget:

- Finds the nearest Mapillary image to that location.
- Displays the panorama in an embedded viewer.
- Draws map graphics to represent:
  - Red dot → clicked location
  - Blue dots → other images in the same sequence
  - Green pulsing dot → current active image
  - Orange cone → direction the current image was taken
- Shows address information using reverse geocoding.
- Supports fullscreen mode, local caching, and automatic cleanup when closed.

---

## Features

### ArcGIS Integration
- Uses `JimuMapViewComponent` (from `jimu-arcgis`) to connect with the active map.
- Handles map click events (`jmv.view.on("click", ...)`).
- Draws Esri `Graphics` for points, cones, and polygons representing imagery locations.

### Mapillary API Integration
- Uses the **Mapillary Graph API** to:
  - Find nearby images (`/images?bbox=...`)
  - Get sequence information
  - Retrieve all image coordinates in a sequence
  - Fetch camera headings (`computed_compass_angle`)
- Displays imagery using the **Mapillary JS Viewer**.

### Access Token from Manifest
The Mapillary access token is loaded directly from the widget’s `manifest.json` file under the property `mapillaryAccessToken`.

In the widget code, the token is accessed like this:

```this.accessToken = props.manifest?.properties?.mapillaryAccessToken || "";```
This avoids hardcoding sensitive keys in the source code.

And in the manifest.json:
```
"properties": {
		"useMapWidget": true,
		"mapillaryAccessToken": "MLY|..."
	},
```
### Reverse Geocoding
Integrates with the **ArcGIS World Geocoding Service** to display readable address data:
```https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode```

### Local Caching
- Caches the last sequence in `localStorage` under `mapillary_sequence_cache`.
- Automatically restores the last viewed sequence when the widget reopens.

### Fullscreen Mode
- Toggles between embedded and fullscreen modes using React Portals (`ReactDOM.createPortal`).
- Reinitializes the Mapillary viewer when switching modes.

### Cleanup & Lifecycle
Implements `cleanupWidgetEnvironment()` to:

- Stop animations.
- Clear map graphics.
- Destroy Mapillary viewer instances.

Automatically runs cleanup when:

- The widget becomes invisible.
- The widget closes (`state === 'CLOSED'`).
- The component unmounts.

### Error Handling
Handles:

- Missing imagery.
- Viewer load issues.
- API errors.
- Reverse geocode failures.

Displays clear fallback messages for missing or unavailable data.


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

## How It Works

1. **User Clicks on the Map**  
   The widget listens for `view.on("click", ...)` events from the connected ArcGIS MapView.

2. **Nearest Mapillary Image Query**  
   When a click occurs, the widget calls the **Mapillary Graph API** to find the closest image to the clicked coordinates.

3. **Image and Sequence Retrieval**  
   It fetches image metadata , such as sequence ID, image coordinates, and compass angle , and retrieves all images within that sequence.

4. **Map Visualization**  
   The widget draws multiple map graphics using the ArcGIS API for JavaScript:
   - **Red dot** → clicked location  
   - **Blue dots** → images from the same sequence  
   - **Green pulsing dot** → currently displayed image  
   - **Orange cone** → camera direction  

5. **Image Display**  
   The **Mapillary JS Viewer** is embedded directly in the widget to display the panorama.

6. **Reverse Geocoding**  
   The widget requests the ArcGIS World Geocoding Service to convert coordinates into human-readable addresses.

7. **State Synchronization**  
   The widget updates its internal state (sequence ID, coordinates, address, etc.) and saves the session to local storage.

8. **Cleanup**  
   When the widget is closed or hidden:
   - Viewer instances are destroyed.
   - Graphics are cleared.
   - State is reset to prevent memory leaks.

### Mapillary Explorer Demo Video

[![Watch the video](https://img.youtube.com/vi/TYrrStp9WU8/maxresdefault.jpg)](https://www.youtube.com/watch?v=TYrrStp9WU8)


## State Management

The `State` interface keeps track of the widget’s core data and runtime behavior.

| Key | Type | Purpose |
|-----|------|----------|
| `jimuMapView` | `JimuMapView` | Link to the active ArcGIS map |
| `imageId` | `string \| null` | Current Mapillary image ID |
| `sequenceId` | `string \| null` | Current Mapillary sequence |
| `sequenceImages` | `Array` | All images in the current sequence |
| `lon`, `lat` | `number \| null` | Current image coordinates |
| `isFullscreen` | `boolean` | Fullscreen toggle |
| `address` | `string \| null` | Reverse geocoded location |
| `state`, `visible` | `string \| boolean` | Widget lifecycle flags |

---

## Architecture

| Component | Purpose |
|------------|----------|
| **Widget (React class)** | Main logic and UI |
| **Mapillary JS Viewer** | Displays street-level imagery |
| **ArcGIS MapView (via `JimuMapView`)** | Receives user clicks and draws geometry |
| **ArcGIS Graphics API** | Renders red, blue, and green dots and orange cones |
| **Local Storage** | Stores the last viewed sequence |
| **ArcGIS Reverse Geocoding API** | Converts coordinates into readable addresses |
| **`mapillaryAccessToken` in `manifest.json`** | Securely stores the API key |

---

### 📦 [Download Built Widget Latest Version](https://github.com/sukruburakcetin/mapillary-explorer/releases/latest)
---
### License

This project is licensed under the **MIT License**.