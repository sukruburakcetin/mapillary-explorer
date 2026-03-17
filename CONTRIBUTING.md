# Contributing to Mapillary Explorer

Thank you for your interest in contributing. This guide covers everything you need to set up a local development environment, understand the project structure, and submit your changes.

### Customization (Local)
You can freely customize your local version of the application to suit your needs. This includes modifying components, adjusting styles, or extending functionality. Even if you don’t plan to contribute back, you can use this project as a base to build your own customized Mapillary Explorer app with your own features and tweaks.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup the Development Environment](#setup-the-development-environment)
3. [Running the Widget Locally](#running-the-widget-locally)
4. [Project Structure for Contributors](#project-structure-for-contributors)
5. [Making Changes](#making-changes)
6. [Building for Production](#building-for-production)
7. [Submitting a Pull Request](#submitting-a-pull-request)

---

## Prerequisites

### ArcGIS Experience Builder Developer Edition 1.19

Install both the server and client services following [Esri's official install guide](https://developers.arcgis.com/experience-builder/guide/install-guide/).

> **ArcGIS Enterprise users:** If you are building for an Enterprise deployment, the bundled ExB version in Enterprise lags behind the Developer Edition. Read [COMPATIBILITY.md](COMPATIBILITY.md) before choosing which Developer Edition version to install.

### Node.js

Both ExB 1.18 and 1.19 require **Node.js 22**. Using an older version will cause build failures.

```bash
node -v   # should print v22.x.x
```

Use [nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage versions if needed.

### ArcGIS Client ID

Obtain an ArcGIS Client ID from your ArcGIS Online or Enterprise portal and configure `https://localhost:3001/` as an allowed redirect URL.

---

## Setup the Development Environment

### 1. Clone the repository

```bash
git clone https://github.com/sukruburakcetin/mapillary-explorer.git
cd mapillary-explorer
```

### 2. Copy the widget into your Experience Builder installation

Copy or symlink this repository into the `your-extensions/widgets/` folder of your local Experience Builder installation:

```bash
cp -R path/to/mapillary-explorer \
  <experience-builder-root>/client/your-extensions/widgets/mapillary-explorer
```

The default widgets folder is at:

```
<experience-builder-root>/client/your-extensions/widgets/
```

### 3. Install widget dependencies

From the Experience Builder **client** directory, install the widget's dependencies:

```bash
cd <experience-builder-root>/client
npm install mapillary-js pbf @mapbox/vector-tile
```

Pinned versions used in this project:

| Package | Version |
|---|---|
| `mapillary-js` | 4.1.2 |
| `pbf` | 4.0.1 |
| `@mapbox/vector-tile` | 2.0.4 |

> `react-select` and `react-datepicker` are **not** required. They have been replaced by the built-in `GlassSelect` and `GlassDatePicker` components, which have no external dependencies.

---

## Running the Widget Locally

### Start the Experience Builder client

In one terminal:

```bash
cd <experience-builder-root>/client
npm start
```

### Start the Experience Builder server

In a second terminal:

```bash
cd <experience-builder-root>/server
npm install   # first time only
npm start
```

Once both services are running, open the Experience Builder interface at:

```
https://localhost:3001/
```

Enter your portal URL (for example `https://myorg.maps.arcgis.com`) and your registered Client ID, then sign in with your ArcGIS credentials.

### Create a test experience

1. Click **Create New Experience** and select any template.
2. Add a **Map** widget and expand it to fill the canvas.
3. Add a **Widget Controller** on top of the map widget.
4. The **Mapillary Explorer** widget will appear at the bottom of the widgets list. Drag it into the Widget Controller.
5. Click **Live View**, select the widget, connect it to the Map widget, then save and test.

---

## Project Structure for Contributors

```
src/
├── runtime/
│   └── widget.tsx               # Main widget class, organized with #region comment blocks
├── setting/
│   └── setting.tsx              # ArcGIS EB settings panel
├── components/
│   ├── ControlBar.tsx           # Top toolbar
│   ├── FilterBar.tsx            # Turbo filter inputs
│   ├── GlassDatePicker.tsx      # Built-in date picker (no external dependency)
│   ├── GlassSelect.tsx          # Built-in dropdown (no external dependency)
│   ├── Icons.tsx                # All SVG icon components
│   ├── ImageUtilityGroup.tsx    # Floating action buttons
│   ├── InfoBox.tsx              # Live image metadata panel
│   ├── Legend.tsx               # Coverage color legend overlay
│   ├── SequencePicker.tsx       # Sequence carousel selector
│   ├── SplashScreen.tsx         # Initial loading overlay
│   └── types.ts                 # Shared TypeScript prop interfaces
├── utils/
│   ├── constants.ts             # Layer IDs, API URLs, zoom thresholds, detection filter lists
│   ├── filterBuilder.ts         # Mapillary VTL filter expression builder
│   ├── geoUtils.ts              # Pure geo math utilities
│   ├── mapillaryDetections.ts   # Pure detection geometry and color functions
│   ├── mapillaryObjectNameMap.ts # Human-readable object label map
│   ├── mapillaryRenderers.ts    # Pure ArcGIS renderer factory functions
│   ├── spriteUtils.ts           # Sprite sheet utilities
│   └── styles.ts                # All inline styles and global CSS string
└── config.ts                    # Widget config TypeScript interface
```

### Where to make changes

| What you want to do | Where to look |
|---|---|
| Add a new geo calculation or math helper | `utils/geoUtils.ts` |
| Change which detections are hidden | `utils/constants.ts` — `DETECTION_HIDDEN_RAW` and `DETECTION_HIDDEN_CATEGORIES` |
| Add a new ArcGIS layer renderer | `utils/mapillaryRenderers.ts` |
| Change API endpoints, layer IDs, or timing values | `utils/constants.ts` |
| Add or modify a React component | `components/` with props typed in `types.ts` |
| Change the settings panel | `setting/setting.tsx` and `config.ts` |
| Add a new major feature to the widget | `runtime/widget.tsx`, inside the relevant `#region` block |

> Functions in `utils/` have no React or ArcGIS dependencies. They are pure input-to-output transformations and can be unit-tested in isolation without spinning up Experience Builder.

---

## Making Changes

The Experience Builder client auto-rebuilds when you edit source files. A manual restart is required if you modify:

- `manifest.json`
- File or folder structure
- Widget name or registration information

---

## Building for Production

To generate a production-ready build, run the following from the `client/your-extensions/widgets/` directory:

```bash
npm run build:prod
```

The compiled widget will be output to:

```
<experience-builder-root>/client/dist/widgets/mapillary-explorer/
```

Copy the output folder and ensure it contains the correct structure for deployment:

```
mapillary-explorer/
├── dist/
├── config.json
├── icon.svg
└── manifest.json
```

For instructions on registering the built widget with your ArcGIS portal, see the [Setup and Installation](README.md#setup-and-installation) section of the [README.md](README.md).

> For Enterprise deployments, read [COMPATIBILITY.md](COMPATIBILITY.md) to confirm which Developer Edition version to use for your target platform before building.

---

## Submitting a Pull Request

1. Fork the repository and create a new branch from `main`:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes, keeping commits focused and descriptive.
3. Test your changes locally with a running Experience Builder instance.
4. Open a pull request against `main` with a clear title and description of what was changed and why.

If you are fixing a bug, include the steps to reproduce it. If you are adding a feature, describe the use case it addresses.
