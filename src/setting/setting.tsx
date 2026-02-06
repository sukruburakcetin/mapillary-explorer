/** @jsx jsx */
import { React, jsx } from 'jimu-core';
import { AllWidgetSettingProps } from 'jimu-for-builder';
import { SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components';
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components';
import { Switch, TextInput, NumericInput, Select, Option } from 'jimu-ui';
import { IMConfig } from '../config';

export default class Setting extends React.PureComponent<AllWidgetSettingProps<IMConfig>, any> {

  onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    this.props.onSettingChange({
      id: this.props.id,
      useMapWidgetIds: useMapWidgetIds
    });
  }

  onToggleTrafficSigns = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('enableTrafficSigns', evt.target.checked)
    });
  }

  onToggleObjects = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('enableMapillaryObjects', evt.target.checked)
    });
  }
  
  // Handle Turbo Mode Only Toggle
  onToggleTurboModeOnly = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('turboModeOnly', evt.target.checked)
    });
  }

  onToggleHideTurboFilter = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideTurboFilter', evt.target.checked)
    });
  }

  onToggleCoverageAlwaysOn = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('coverageLayerAlwaysOn', evt.target.checked)
    });
  }

  // Handle Creator Input
  onCreatorChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('turboCreator', evt.target.value)
    });
  }

  onToggleHideLegend = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideLegend', evt.target.checked)
    });
  }

  onToggleHideInfoBox = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideInfoBox', evt.target.checked)
    });
  }

  onToggleHideImageDownload = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideImageDownload', evt.target.checked)
    });
  }

  onToggleHideTimeTravel = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideTimeTravel', evt.target.checked)
    });
  }

  onToggleHideShareButton = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideShareButton', evt.target.checked)
    });
  }

  // Handler for Render Mode
  onRenderModeChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('renderMode', parseInt(evt.target.value, 10))
    });
  }

  // Handler for Transition Mode
  onTransitionModeChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('transitionMode', parseInt(evt.target.value, 10))
    });
  }

  // Handler for Sync Map Position (West, East, Center, etc.)
  onSyncPositionChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('syncMapPosition', evt.target.value)
    });
  }

  onCameraXChange = (value: number) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('cameraX', value)
    });
  }

  onCameraYChange = (value: number) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('cameraY', value)
    });
  }

  onToggleDebugMode = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('debugMode', evt.target.checked)
    });
  }

  render() {
    const config = this.props.config;

    return (
      <div className="widget-setting-mapillary jimu-widget-setting">

        <SettingSection title="Source">
          <SettingRow>
            <div style={{ width: '100%' }}>
                <div style={{ marginBottom: '8px', fontWeight: 500 }}>Select Map Widget</div>
                <MapWidgetSelector 
                  onSelect={this.onMapWidgetSelected} 
                  useMapWidgetIds={this.props.useMapWidgetIds} 
                />
            </div>
          </SettingRow>

          <SettingRow label="Lock Map to View" flow="wrap">
            <div className="d-flex justify-content-between w-100 align-items-center">
                <span title="Syncs the map center to the current image location">Enable Sync</span>
                <Switch 
                  checked={this.props.config.syncMapWithImage === true}
                  onChange={(evt) => {
                    this.props.onSettingChange({
                      id: this.props.id,
                      config: this.props.config.set('syncMapWithImage', evt.target.checked)
                    });
                  }} 
                />
            </div>
            
            {/* Extended Position Options */}
            {this.props.config.syncMapWithImage && (
                <div className="mt-2 w-100" style={{ paddingLeft: '0px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Lock Position:</div>
                    <Select 
                      size="sm" 
                      value={config.syncMapPosition || 'center'} 
                      onChange={this.onSyncPositionChange}
                      style={{ width: '100%' }}
                    >
                      <Option value="center">Center (Default)</Option>
                      <Option value="west">West (Focus Left)</Option>
                      <Option value="east">East (Focus Right)</Option>
                      <Option value="north">North (Focus Top)</Option>
                      <Option value="south">South (Focus Bottom)</Option>
                    </Select>
                    
                    <div className="text mt-2" style={{ fontSize: '10px', fontStyle: 'italic', lineHeight: '1.3', opacity: '0.3' }}>
                        {config.syncMapPosition === 'east' && "Best if your widget is docked on the Left."}
                        {config.syncMapPosition === 'west' && "Best if your widget is docked on the Right."}
                        {config.syncMapPosition === 'north' && "Best if your widget is docked on the Bottom."}
                        {config.syncMapPosition === 'south' && "Best if your widget is docked on the Top."}
                        {(!config.syncMapPosition || config.syncMapPosition === 'center') && "Keeps the active frame in the center of the map."}
                    </div>
                </div>
            )}
          </SettingRow>
        </SettingSection>
          <SettingSection title="General Settings">
            <SettingRow label="Mapillary Coverage" style={{marginTop: '5px'}}>
                  <Switch 
                    checked={config.coverageLayerAlwaysOn === true} 
                    onChange={this.onToggleCoverageAlwaysOn} 
                  />
            </SettingRow>
            <SettingRow>
                  <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px', opacity: '0.3', fontStyle:'italic' }}>
                    Always shows standard Mapillary vector tiles and hides the map toggle.
                  </span>
            </SettingRow>
            <SettingRow label="Turbo Mode Only">
                <Switch 
                  checked={config.turboModeOnly === true} 
                  onChange={this.onToggleTurboModeOnly} 
                />
            </SettingRow>
            <SettingRow>
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px', opacity: '0.3', fontStyle:'italic' }}>
                  Always enables the turbo coverage layer and hides the toggle. Disables Normal Mode, allowing interaction only by clicking visible coverage points.
                </span>
            </SettingRow>
            {/*Default Creator Field */}
            <SettingRow flow="wrap">
              <div style={{ width: '100%' }}>
                <div style={{ marginBottom: '5px', fontWeight: 500 }}>
                  Default Creator (Turbo Mode Only)
                </div>
                <TextInput 
                  className="w-100" 
                  placeholder="e.g. mapillary_user" 
                  value={config.turboCreator || ''} 
                  onChange={this.onCreatorChange} 
                />
              </div>
            </SettingRow>
        </SettingSection>
        <SettingSection title="Appearance Settings">    
          <SettingRow>
            <span className="text" style={{ fontSize: '12px', marginTop: '5px', opacity: '0.3', fontStyle:'italic' }}>
              Toggle UI elements and action tools to simplify the interface.
            </span>
          </SettingRow>

          {/* UI Toggles */}
          <SettingRow label="Hide Legend">
            <Switch 
              checked={config.hideLegend === true} 
              onChange={this.onToggleHideLegend} 
            />
          </SettingRow>

          <SettingRow label="Hide Info Box">
            <Switch 
              checked={config.hideInfoBox === true} 
              onChange={this.onToggleHideInfoBox} 
            />
          </SettingRow>

          <SettingRow label="Hide Turbo Mode Filter Button">
                <Switch 
                  checked={config.hideTurboFilter === true} 
                  onChange={this.onToggleHideTurboFilter} 
                />
          </SettingRow>

          <SettingRow label="Hide Image Download">
            <Switch 
              checked={config.hideImageDownload === true} 
              onChange={this.onToggleHideImageDownload} 
            />
          </SettingRow>

          <SettingRow label="Hide Time Travel">
            <Switch 
              checked={config.hideTimeTravel === true} 
              onChange={this.onToggleHideTimeTravel} 
            />
          </SettingRow>

          <SettingRow label="Hide Share Button">
            <Switch 
              checked={config.hideShareButton === true} 
              onChange={this.onToggleHideShareButton} 
            />
          </SettingRow>
        </SettingSection>

        <SettingSection title="Feature Detection Layers">
              <SettingRow label="Enable Traffic Signs">
                <Switch 
                  checked={config.enableTrafficSigns !== false} 
                  onChange={this.onToggleTrafficSigns} 
                />
              </SettingRow>

              <SettingRow label="Enable Mapillary Objects">
                <Switch 
                  checked={config.enableMapillaryObjects !== false} 
                  onChange={this.onToggleObjects} 
                />
              </SettingRow>

              <SettingRow>
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px', opacity: '0.3', fontStyle:'italic' }}>
                  Disabling these will hide the sign and object layer toggle buttons in the widget interface.
                </span>
              </SettingRow>
        </SettingSection>
        
        <SettingSection title="Advanced Settings">
            <SettingRow label="Render Mode">
              <Select 
                size="sm" 
                // Fallback to '1' (Fill) if renderMode is undefined
                value={String(config.renderMode ?? 1)} 
                onChange={(evt) => this.props.onSettingChange({
                  id: this.props.id,
                  config: this.props.config.set('renderMode', parseInt(evt.target.value, 10))
                })}
                style={{ width: '130px' }}
              >
                <Option value="1">Fill (Default)</Option>
                <Option value="0">Letterbox</Option>
              </Select>
            </SettingRow>
            <SettingRow>
              <span className="text" style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '-5px', opacity: '0.3', fontStyle:'italic' }}>
                <b>Fill:</b> Fills the window.<br/>
                <b>Letterbox:</b> Shows the full original image (may show black bars, recommended for wide widgets).
              </span>
            </SettingRow>

            <SettingRow label="Transition Mode">
              <Select 
                size="sm" 
                value={String(config.transitionMode ?? 0)} 
                onChange={this.onTransitionModeChange}
                style={{ width: '130px' }}
              >
                <Option value="0">Smooth (Default)</Option>
                <Option value="1">Instantaneous</Option>
              </Select>
            </SettingRow>
            <SettingRow>
              <span className="text" style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '-5px', opacity: '0.3', fontStyle:'italic' }}>
                <b>Default:</b> Uses motion blending between frames.<br/>
                <b>Instantaneous:</b> Jumps immediately to the next frame (snappier).
              </span>
            </SettingRow>
            <SettingRow flow="wrap">
              <div className="w-100">
                <div style={{ fontWeight: 500, marginBottom: '5px' }}>Default Camera Angle (Normalized 0-1)</div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ fontSize: '12px' }}>Horizontal (X)</span>
                    <NumericInput 
                      size="sm" 
                      style={{ width: '80px' }}
                      value={config.cameraX}
                      min={0} max={1} step={0.05}
                      placeholder="0.5" // Shows 0.5 when empty
                      onChange={this.onCameraXChange}
                    />
                </div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ fontSize: '12px' }}>Vertical (Y)</span>
                    <NumericInput 
                      size="sm" 
                      style={{ width: '80px' }}
                      value={config.cameraY}
                      min={0} max={1} step={0.05}
                      placeholder="0.5" // Shows 0.5 when empty
                      onChange={this.onCameraYChange}
                    />
                </div>
                <div className="text" style={{ fontSize: '11px', fontStyle: 'italic', opacity: '0.3', fontStyle:'italic' }}>
                  Standard is 0.5 for both(refers to center). <br/>
                  <b>X:</b> 0 = Left, 1 = Right. <br/>
                  <b>Y:</b> 0 = Sky, 1 = Ground. (Try 0.55 for wide widgets)
                </div>
              </div>
            </SettingRow>
            <SettingRow label="Debug Mode">
                <Switch 
                  checked={config.debugMode === true} 
                  onChange={this.onToggleDebugMode} 
                />
            </SettingRow>
            <SettingRow>
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '0px', opacity: '0.3', fontStyle:'italic' }}>
                  Enables developer logging in the browser console (F12).
                </span>
            </SettingRow>
        </SettingSection>
      </div>
    );
  }
}