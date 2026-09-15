# Compatibility Notes

## ArcGIS Experience Builder Version Support

This widget is developed with the *ArcGIS Experience Builder Developer Edition 1.18 and tested against **ArcGIS Experience Builder Developer Edition 1.19 and 1.20** versions and runs on **ArcGIS Online** (October 2025 release).

| exbVersion (Developer edition) | JSAPI version | ArcGIS Enterprise | ArcGIS Online | Calcite version | Recommended Node.js version | Recommended pnpm version | React.js version |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1.21 | 5.1 | — | June 2026 | 5.1 | 24 | 11 | 19 |
| 1.20 | 5.0 | 12.1 | March 2026 | 5.0 | 24 | — | 19 |
| 1.19 | 4.34 | — | October 2025 | 3.3.3 | 22 | — | 19 |
| 1.18 | 4.33 | 12.0 | June 2025 | 3.2.1 | 22 | — | 18 |

For more details see ESRI's guide about release versions:
https://developers.arcgis.com/experience-builder/guide/release-versions/

---

## Important: Running vs. Building

There is a critical distinction between **running** this widget and **building** it for production.

### Running the widget (no build required)

If you are using the **prebuilt release** from the releases page, you can deploy and run the widget on any of the supported platforms above without any build step. No Developer Edition is required.

### Building from source

If you want to build the widget from source to produce a `dist/` folder, you must use the **Developer Edition** that matches your target platform.

> **ArcGIS Enterprise users:** Enterprise ships with a specific bundled version of Experience Builder that lags behind the latest Developer Edition:
>
> - **ArcGIS Enterprise 12.1 bundles ExB 1.20** (JSAPI 5.0, Calcite 5.0, Node 24, React 19).
> - **ArcGIS Enterprise 12.0 bundles ExB 1.18** (JSAPI 4.33, Calcite 3.2.1, Node 22, React 18).
> - **ExB 1.19 and 1.21** are not bundled in Enterprise releases.
>
> This means:
> - You can **run** the prebuilt widget on Enterprise 12.0 or 12.1 without issues.
> - If you want to **build from source** for an Enterprise deployment, you must build using the matching Developer Edition version (**ExB 1.18** for Enterprise 12.0, or **ExB 1.20** for Enterprise 12.1).
> - Building with a mismatched Developer Edition (e.g., building with 1.21 for an Enterprise 12.0/12.1 target) may produce a `dist/` that fails to load due to JSAPI, Calcite, Node, or React runtime version mismatches.

### Quick reference

| Your target | Use to run | Use to build from source |
|---|---|---|
| ArcGIS Online | Prebuilt release or Developer Edition 1.19, 1.20, or 1.21 | Developer Edition 1.20 or 1.21 |
| ArcGIS Enterprise 12.1 | Prebuilt release | Developer Edition 1.20 |
| ArcGIS Enterprise 12.0 | Prebuilt release | Developer Edition 1.18 |

---

## Node.js

Both ExB 1.18 and 1.19 require **Node.js 22**. Using an older Node version will cause build failures. Use [nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage Node versions if needed:

```bash
nvm install 22
nvm use 22
node -v  # should print v22.x.x
```
For the 1.20 or 1.21 version, even though the recommendation is node 24, I recommend using node 20.19.0 with nvm.
