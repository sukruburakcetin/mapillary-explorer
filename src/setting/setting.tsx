/** @jsx jsx */
import { React, jsx } from 'jimu-core';
import { AllWidgetSettingProps } from 'jimu-for-builder';
import { SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components';
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components';
import { Switch } from 'jimu-ui';
import { IMConfig } from '../config';
import { TextInput } from 'jimu-ui';
import { ColorPicker } from 'jimu-ui/basic/color-picker'; 

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

  onBorderColorChange = (color: string) => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('borderColor', color)
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

          <SettingRow label="Lock the map to the view">
            <Switch 
              checked={this.props.config.syncMapWithImage === true}
              onChange={(evt) => {
                this.props.onSettingChange({
                  id: this.props.id,
                  config: this.props.config.set('syncMapWithImage', evt.target.checked)
                });
              }} 
            />
          </SettingRow>
           <SettingRow>
                  <span className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px' }}>
                    On: When the image changes, the map automatically centers at that point.
                  </span>
            </SettingRow>
        </SettingSection>

        <SettingSection title="Appearance Settings">
          <SettingRow label="Frame Color">
            <ColorPicker 
              color={config.borderColor || '#37d582'} 
              onChange={this.onBorderColorChange} 
            />
          </SettingRow>
          
          <SettingRow>
            <span className="text-muted" style={{ fontSize: '12px', marginTop: '5px' }}>
              You can customize your widget's ambient light to match your theme.
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
        </SettingSection>
		
        <SettingSection title="General Settings">
            <SettingRow label="Mapillary Coverage" style={{marginTop: '5px'}}>
                  <Switch 
                    checked={config.coverageLayerAlwaysOn === true} 
                    onChange={this.onToggleCoverageAlwaysOn} 
                  />
            </SettingRow>
            <SettingRow>
                  <span className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px' }}>
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
                <span className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px' }}>
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
                <span className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '5px' }}>
                  Disabling these will hide the sign and object layer toggle buttons in the widget interface.
                </span>
              </SettingRow>
            </SettingSection>
        
      </div>
    );
  }
}