/** @jsx jsx */
import { React, jsx } from 'jimu-core';
import { AllWidgetSettingProps } from 'jimu-for-builder';
import { SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components';
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components';
import { Switch } from 'jimu-ui';
import { IMConfig } from '../config';
import { TextInput } from 'jimu-ui';

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
                    Forces the standard Mapillary vector tiles (green lines & blue images) to always be visible. Hides the map toggle button.
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
                  Forces the turbo coverage layer to always be active and hides the toggle. Disables "Normal Mode" (nearest image search), restricting interaction to clicking directly on visible coverage points.
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