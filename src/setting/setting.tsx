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

  onToggleHideCoverageCircles = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideCoverageCircles', evt.target.checked)
    });
  }

  // Handle Creator Input
  onCreatorChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
      const value = evt.target.value;
      let config = this.props.config.set('turboCreator', value);
      config = this.autoSetTurboMode(config);
      this.props.onSettingChange({ id: this.props.id, config });
  }

  // Turbo Preset Handlers
  onTurboDefaultStartDateChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
      const value = evt.target.value || undefined;
      let config = this.props.config.set('turboDefaultStartDate', value);
      config = this.autoSetTurboMode(config);
      this.props.onSettingChange({ id: this.props.id, config });
  }

  onTurboDefaultEndDateChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
      const value = evt.target.value || undefined;
      let config = this.props.config.set('turboDefaultEndDate', value);
      config = this.autoSetTurboMode(config);
      this.props.onSettingChange({ id: this.props.id, config });
  }

  /**
    * Cycles the Is Pano preset through three states via a <Select>:
    *   ''      → no filter (undefined)
    *   'true'  → panoramas only
    *   'false' → non-panoramas only
  */
  onTurboDefaultIsPanoChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
      const raw = evt.target.value;
      const value = raw === 'true' ? true : raw === 'false' ? false : null;
      let config = this.props.config.set('turboDefaultIsPano', value);
      config = this.autoSetTurboMode(config);
      this.props.onSettingChange({ id: this.props.id, config });
  }

  onToggleTurboDefaultColorByDate = (evt: React.ChangeEvent<HTMLInputElement>) => {
      let config = this.props.config.set('turboDefaultColorByDate', evt.target.checked);
      config = this.autoSetTurboMode(config);
      this.props.onSettingChange({ id: this.props.id, config });
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

  onToggleHideSyncHeadingButton = (evt: React.ChangeEvent<HTMLInputElement>) => {
      this.props.onSettingChange({
          id: this.props.id,
          config: this.props.config.set('hideSyncHeadingButton', evt.target.checked)
      });
  }

  onToggleHideCenterMapButton = (evt: React.ChangeEvent<HTMLInputElement>) => {
      this.props.onSettingChange({
          id: this.props.id,
          config: this.props.config.set('hideCenterMapButton', evt.target.checked)
      });
  }

  onToggleHideCoverageAnalysis = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('hideCoverageAnalysis', evt.target.checked)
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

  // Helper: converts stored boolean | null | undefined to the <Select> string value
  private isPanoSelectValue(): string {
    const v = this.props.config.turboDefaultIsPano;
    if (v === true)  return 'true';
    if (v === false) return 'false';
    return '';
  }
  
  private autoSetTurboMode(config: any): any {
    const hasAnyPreset = !!(
        config.turboCreator ||
        config.turboDefaultStartDate ||
        config.turboDefaultEndDate ||
        (config.turboDefaultIsPano !== null && config.turboDefaultIsPano !== undefined) ||
        config.turboDefaultColorByDate
    );
    return config.set('turboModeOnly', hasAnyPreset);
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
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px', opacity: '0.3' }}>
                  Always shows standard Mapillary vector tiles and hides the map toggle.
                </span>
            </SettingRow>
            <SettingRow label="Hide Coverage Circles">
                  <Switch 
                    checked={config.hideCoverageCircles === true} 
                    onChange={this.onToggleHideCoverageCircles} 
                  />
            </SettingRow>
            <SettingRow>
                <span className="text" style={{ fontSize: '12px', marginTop: '5px', opacity: '0.3', fontStyle:'italic' }}>
                  Hides the individual image points on the Mapillary coverage layer, showing only sequence lines.
                </span>
            </SettingRow>
            <SettingRow label="Turbo Mode Only">
                <Switch 
                  checked={config.turboModeOnly === true} 
                  onChange={this.onToggleTurboModeOnly} 
                />
            </SettingRow>
            <SettingRow>
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px', opacity: '0.3' }}>
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

        {/*Turbo Coverage Presets */}
        <SettingSection title="Turbo Coverage Presets">
          <SettingRow>
            <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', opacity: '0.4' }}>
              These values pre-populate the Turbo Mode filter panel when the widget loads.
              Users can still override them at runtime via the filter button (unless it is hidden).
            </span>
          </SettingRow>

          {/* Start Date */}
          <SettingRow flow="wrap">
            <div style={{ width: '100%' }}>
              <div style={{ marginBottom: '5px', fontWeight: 500 }}>Default Start Date</div>
              <input
                type="date"
                value={config.turboDefaultStartDate || ''}
                onChange={this.onTurboDefaultStartDateChange}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color, #ccc)',
                  background: 'var(--input-bg, #fff)',
                  color: 'var(--input-color, #333)',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
              {config.turboDefaultStartDate && (
                <button
                  onClick={() => {
                      let config = this.props.config.set('turboDefaultStartDate', undefined);
                      config = this.autoSetTurboMode(config);
                      this.props.onSettingChange({ id: this.props.id, config });
                  }}
                  style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger-color, #c00)',
                    cursor: 'pointer',
                    padding: '0'
                  }}
                >
                  ✕ Clear start date
                </button>
              )}
            </div>
          </SettingRow>

          {/* End Date */}
          <SettingRow flow="wrap">
            <div style={{ width: '100%' }}>
              <div style={{ marginBottom: '5px', fontWeight: 500 }}>Default End Date</div>
              <input
                type="date"
                value={config.turboDefaultEndDate || ''}
                onChange={this.onTurboDefaultEndDateChange}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color, #ccc)',
                  background: 'var(--input-bg, #fff)',
                  color: 'var(--input-color, #333)',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
              {config.turboDefaultEndDate && (
                <button
                  onClick={() => {
                      let config = this.props.config.set('turboDefaultEndDate', undefined);
                      config = this.autoSetTurboMode(config);
                      this.props.onSettingChange({ id: this.props.id, config });
                  }}
                  style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger-color, #c00)',
                    cursor: 'pointer',
                    padding: '0'
                  }}
                >
                  ✕ Clear end date
                </button>
              )}
            </div>
          </SettingRow>

          {/* Date range validation hint */}
          {config.turboDefaultStartDate && config.turboDefaultEndDate &&
            config.turboDefaultStartDate > config.turboDefaultEndDate && (
            <SettingRow>
              <span style={{ fontSize: '11px', color: 'var(--danger-color, #c00)', fontWeight: 500 }}>
                ⚠ Start date is after end date - no images will match this range.
              </span>
            </SettingRow>
          )}

          {/* Is Pano Filter */}
          <SettingRow flow="wrap">
            <div style={{ width: '100%' }}>
              <div style={{ marginBottom: '5px', fontWeight: 500 }}>Default Panorama Filter</div>
              <Select
                size="sm"
                value={this.isPanoSelectValue()}
                onChange={this.onTurboDefaultIsPanoChange}
                style={{ width: '100%' }}
              >
                <Option value="">All images (no filter)</Option>
                <Option value="true">Panoramas only</Option>
                <Option value="false">Non-panoramas only</Option>
              </Select>
              <div style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '4px', opacity: '0.4' }}>
                Restricts Turbo coverage to panoramic or flat images only.
              </div>
            </div>
          </SettingRow>

          {/* Color by Date */}
          <SettingRow label="Default Color by Capture Year">
            <Switch
              checked={config.turboDefaultColorByDate === true}
              onChange={this.onToggleTurboDefaultColorByDate}
            />
          </SettingRow>
          <SettingRow>
            <span className="text" style={{ fontSize: '11px', fontStyle: 'italic', opacity: '0.4' }}>
              When enabled, Turbo coverage points are coloured by their capture year on first load.
              The legend in the info box will reflect the year breakdown.
            </span>
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

          <SettingRow label="Hide Coverage Analysis">
            <Switch checked={config.hideCoverageAnalysis === true} 
            onChange={this.onToggleHideCoverageAnalysis} />
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
          <SettingRow label="Hide Lock Map Rotation Button (3D)">
              <Switch
                  checked={config.hideSyncHeadingButton === true}
                  onChange={evt => this.props.onSettingChange({
                      id: this.props.id,
                      config: this.props.config.set('hideSyncHeadingButton', evt.target.checked)
                  })}
              />
          </SettingRow>

          <SettingRow label="Hide Center Map Button">
              <Switch
                  checked={config.hideCenterMapButton === true}
                  onChange={evt => this.props.onSettingChange({
                      id: this.props.id,
                      config: this.props.config.set('hideCenterMapButton', evt.target.checked)
                  })}
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
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px', opacity: '0.3' }}>
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
              <span className="text" style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '-5px', opacity: '0.3' }}>
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
              <span className="text" style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '-5px', opacity: '0.3' }}>
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
                <div className="text" style={{ fontSize: '11px', fontStyle: 'italic', opacity: '0.3'}}>
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
                <span className="text" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '0px', opacity: '0.3'}}>
                  Enables developer logging in the browser console (F12).
                </span>
            </SettingRow>
        </SettingSection>
      </div>
    );
  }
}