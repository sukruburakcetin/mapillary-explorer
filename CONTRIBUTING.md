## Contributing and Customization Guidelines

Thank you for your interest in contributing to this widget! Here’s how to get started, test changes, and submit your contributions.

### Prerequisites

- **Install ArcGIS Experience Builder (Developer Edition)**  
  Follow [Esri’s guide](https://developers.arcgis.com/experience-builder/guide/install-guide/) to install both the server and client services locally.
```
Recommendation is: "exbVersion": "1.18.0".
```
### Why Experience Builder 1.18?
    Experience Builder 1.19 introduced React 19. While this is a positive step forward,
    it also introduces compatibility issues with several popular third-party React UI libraries.
    
    In particular:
    
    Libraries such as react-select depend on Emotion internals that break under ExB 1.19’s module loading model.
    
    This leads to runtime errors (e.g. keyframes is not a function) that cannot be safely fixed inside ExB.
    
    For this reason, this project currently targets Experience Builder 1.18, which uses React 18 and provides a more predictable
    ecosystem for third-party React components.
    
    The project may upgrade to 1.19+ once these ecosystem issues are resolved.

- **Node.js**  
  Make sure you have Node.js installed (check the version required by your Experience Builder release).
```
node version used in this project: "v22 or higher".
```
- **ArcGIS Client ID**  
  Obtain an ArcGIS Client ID via your ArcGIS Online or Enterprise portal, and configure redirect URLs (e.g., `https://localhost:3001/`) as required.

## Setup the Development Environment

1. Clone the repository to your local machine:
```bash
git clone https://github.com/sukruburakcetin/mapillary-explorer.git
cd mapillary-explorer
```
2. Ensure that your local ArcGIS Experience Builder (Developer Edition) installation is ready to accept extensions.
By default, this is located under:
```text
  <experience-builder-root>/client/your-extensions/widgets
 ```
3. Copy (or symlink) this widget’s source directory into the widgets/ folder of your Experience Builder installation, e.g.:
```bash
  cp -R path/to/this-repo ./<experience-builder-root>/client/your-extensions/widgets/mapillary-explorer
 ```
---
### Running & Testing Changes Locally
### Start the Experience Builder Server
1. In one terminal, go to the server directory of Experience Builder and start the Experience Builder Client:
```bash
cd <experience-builder-root>/client
npm install mapillary-js pbf @mapbox/vector-tile react-select react-datepicker  # install dependencies (only needed the first time)
npm start        # start the client development server
 ```
```text
The versions are used in this project:
- mapillary-js@4.1.2
- pbf@4.0.1
- @mapbox/vector-tile@2.0.4
- react-select@5.10.2
- react-datepicker@8.9.0
```
2. Go to the server directory of Experience Builder, and start the Experience Builder Server:
   Open a new terminal window and run:
```bash
cd <experience-builder-root>/server
npm install      # install dependencies (only needed the first time)
npm start        # start the server
 ```
Once both services are running, open the Experience Builder interface in your browser at:
```text
  https://localhost:3001/
```
Enter portal url(for example: https://myorg.maps.arcgis.com) and Cliend ID for registered app and click log in.

Enter arcgis online user login credentials such as id and password and click log in.

Then, do the following in order:
1. Click Create New Experience.
2. From the menu that opens under Templates, select a layout and click Create.
3. From the Widgets section, select a new map widget and drag and drop it.
4. Drag a new widget controller onto your map widget.
5. The Mapillary Explorer widget will appear at the bottom of the widgets section; drag it onto the widget controller as well. Select Live View, click on Mapillary Explorer to make it see the map widget, save, and test.
---
### Editing the Widget
Make your code changes inside the widget’s src/runtime/ folder(widget.tsx).
The client-server generally auto-rebuilds when you edit files.
However, you may need to restart if you modify:
```text
manifest.json
File or folder structure
Widget name or registration information
```
---
### Building & Preparing for Release
To generate a production-ready build (inside the \client\your-extensions\widgets directory):
```
npm run build:prod
```
After building, the compiled widget will be located at(latest developer version now extract it into dist folder rather than creating dist-prod):
```text
<experience-builder-root>/client/dist/widgets/
 ```
Ensure that any required files (e.g., chunks, shared-code, manifest.json) are included in the correct structure for deployment.

To save the dist version of your widget, go and apply this section:

[Add custom widgets](https://doc.arcgis.com/en/experience-builder/11.4/configure-widgets/add-custom-widgets.htm)
