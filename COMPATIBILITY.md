# Compatibility Notes

## ArcGIS Experience Builder Version Support

This widget is developed with the *ArcGIS Experience Builder Developer Edition 1.18 and tested against **ArcGIS Experience Builder Developer Edition 1.19 and 1.20** versions and runs on **ArcGIS Online** (October 2025 release).

| exbVersion | JSAPI | Developer Edition | ArcGIS Online | ArcGIS Enterprise | Calcite | Node.js | React |
|---|---|---|---|---|---|---|---|
| 1.20 | 5.0.12 | 1.20 | March 2026 | not included | 5.0.2 | 24 | 19 |
| 1.19 | 4.34 | 1.19 | October 2025 | not included | 3.3.3 | 22 | 19 |
| 1.18 | 4.33 | 1.18 | June 2025 | 12.0 | 3.2.1 | 22 | 18 |

For more details see ESRI's guide about release versions:
https://developers.arcgis.com/experience-builder/guide/release-versions/

---

## Important: Running vs. Building

There is a critical distinction between **running** this widget and **building** it for production.

### Running the widget (no build required)

If you are using the **prebuilt release** from the releases page, you can deploy and run the widget on any of the supported platforms above without any build step. No Developer Edition is required.

### Building from source

If you want to build the widget from source to produce a `dist/` folder, you must use the **Developer Edition** that matches your target platform.

> **ArcGIS Enterprise users:** Enterprise ships with a specific bundled version of Experience Builder that lags behind the Developer Edition. As of this writing, **ArcGIS Enterprise 12.0 bundles ExB 1.18**, not 1.19 or 1.20. This means:
>
> - You can **run** the prebuilt widget on Enterprise 12.0 without issues.
> - If you want to **build from source** for an Enterprise 12.0 deployment, you must use **Developer Edition 1.18**, not 1.19 or 1.20.
> - Building with Developer Edition 1.19 or 1.20 and deploying to Enterprise 12.0 may produce a `dist/` that fails to load due to JSAPI, Calcite, or React version mismatches between the bundle and the Enterprise runtime.

### Quick reference

| Your target | Use to run | Use to build from source |
|---|---|---|
| ArcGIS Online | Prebuilt release or Developer Edition 1.19 or 1.20 | Developer Edition 1.19 |
| ArcGIS Enterprise 12.0 | Prebuilt release | Developer Edition 1.18 |

---

## Node.js

Both ExB 1.18 and 1.19 require **Node.js 22**. Using an older Node version will cause build failures. Use [nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage Node versions if needed:

```bash
nvm install 22
nvm use 22
node -v  # should print v22.x.x
```
For the 1.20 version, even though the recommendation is node 24, I recommend using node 20.19.0 with nvm.
