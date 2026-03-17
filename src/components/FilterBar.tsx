/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { GlassSelect } from "../components/GlassSelect";
import { GlassDatePicker } from "../components/GlassDatePicker";
import { glassStyles } from "../utils/styles";
import { FilterBarProps } from "./types";

/**
    * FilterBar
    * Collapsible glass-style filter panel shown above the control bar.
    * Contains three independent filter groups:
    *   - Turbo Mode filters (username, date range, pano toggle, colour-by-date)
    *   - Traffic Signs filter (GlassSelect dropdown)
    *   - Objects filter (GlassSelect dropdown)
    * Each group is only rendered when its corresponding `show*FilterBox` flag is true.
*/
export const FilterBar: React.FC<FilterBarProps> = ({
    showTurboFilterBox,
    showTrafficSignsFilterBox,
    showObjectsFilterBox,
    turboFilterUsername,
    turboFilterStartDate,
    turboFilterEndDate,
    turboFilterIsPano,
    turboColorByDate,
    turboCreator,
    trafficSignsFilterValue,
    trafficSignsOptions,
    objectsFilterValue,
    objectsOptions,
    onTurboUsernameChange,
    onTurboUsernameEnter,
    onTurboUsernameClear,
    onTurboStartDateChange,
    onTurboEndDateChange,
    onTurboIsPanoChange,
    onTurboColorByDateChange,
    onTrafficSignsFilterChange,
    onObjectsFilterChange,
}) => {
    if (!showTurboFilterBox && !showTrafficSignsFilterBox && !showObjectsFilterBox) {
        return null;
    }

    return (
        <div
            className="glass-scroll-container"
            style={glassStyles.filterBarContainer}
        >
            {/* TURBO MODE FILTER GROUP (GOLD) */}
            {showTurboFilterBox && (
                <div style={glassStyles.filterGroup("#FFD700")}>

                    {/* Username input */}
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <input
                            type="text"
                            placeholder="Username"
                            disabled={!!turboCreator}
                            value={turboFilterUsername}
                            className="glass-input-placeholder"
                            onChange={(e) => onTurboUsernameChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    onTurboUsernameEnter();
                                }
                            }}
                            style={{
                                ...glassStyles.glassInput,
                                width: "80px",
                                minWidth: "60px",
                                height: "18px",
                                flexShrink: 1,
                                opacity: turboCreator ? 0.6 : 1,
                                cursor: turboCreator ? "not-allowed" : "text"
                            }}
                            autoFocus={!turboCreator}
                        />
                        {!turboCreator && turboFilterUsername && (
                            <button
                                onClick={onTurboUsernameClear}
                                style={{
                                    position: "absolute",
                                    right: "10px",
                                    background: "transparent",
                                    border: "none",
                                    color: "rgba(255,255,255,0.6)",
                                    fontSize: "8px",
                                    cursor: "pointer",
                                    padding: 0,
                                    display: "flex"
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Date range */}
                    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        <GlassDatePicker
                            selected={turboFilterStartDate ? new Date(turboFilterStartDate) : null}
                            onChange={(date) => onTurboStartDateChange(date ? date.toISOString().split("T")[0] : "")}
                            isClearable
                            placeholderText="Start"
                        />
                        <GlassDatePicker
                            selected={turboFilterEndDate ? new Date(turboFilterEndDate) : null}
                            onChange={(date) => onTurboEndDateChange(date ? date.toISOString().split("T")[0] : "")}
                            isClearable
                            placeholderText="End"
                        />
                    </div>

                    {/* Divider */}
                    <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

                    {/* Is Pano toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={glassStyles.labelSmall}>Is Pano:</span>
                        <div style={{ display: "flex", gap: "2px" }}>
                            {([
                                { label: "All", value: undefined },
                                { label: "360", value: true },
                                { label: "Flat", value: false }
                            ] as { label: string; value: boolean | undefined }[]).map((opt) => {
                                const isActive = turboFilterIsPano === opt.value;
                                return (
                                    <button
                                        key={opt.label}
                                        onClick={() => onTurboIsPanoChange(opt.value)}
                                        style={{
                                            padding: "1px 4px",
                                            fontSize: "8px",
                                            fontWeight: isActive ? 700 : 400,
                                            background: isActive ? "rgba(255, 215, 0, 0.6)" : "rgba(255,255,255,0.1)",
                                            border: isActive ? "1px solid rgba(255,215,0,0.8)" : "1px solid rgba(255,255,255,0.2)",
                                            borderRadius: "3px",
                                            color: "white",
                                            cursor: "pointer",
                                            transition: "all 0.15s ease"
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date colour toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={glassStyles.labelSmall}>Date Color:</span>
                        <label style={{ position: "relative", display: "inline-block", width: "26px", height: "16px", marginBottom: 0, marginRight: "2px" }}>
                            <input
                                type="checkbox"
                                checked={turboColorByDate === true}
                                onChange={(e) => onTurboColorByDateChange(e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                                position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: turboColorByDate ? "#4CAF50" : "rgba(255,255,255,0.2)",
                                borderRadius: "34px", transition: "0.3s"
                            }} />
                            <span style={{
                                position: "absolute", height: "12px", width: "12px",
                                left: turboColorByDate ? "14px" : "2px", bottom: "2px",
                                backgroundColor: "white", transition: "0.3s", borderRadius: "50%"
                            }} />
                        </label>
                    </div>
                </div>
            )}

            {/* TRAFFIC SIGNS FILTER GROUP (ORANGE) */}
            {showTrafficSignsFilterBox && (
                <div style={glassStyles.filterGroup("#FFA500")}>
                    <GlassSelect
                        value={trafficSignsFilterValue}
                        onChange={onTrafficSignsFilterChange}
                        options={trafficSignsOptions}
                        accentColor="#FFA500"
                        menuPlacement="top"
                    />
                </div>
            )}

            {/* OBJECTS FILTER GROUP (RED) */}
            {showObjectsFilterBox && (
                <div style={glassStyles.filterGroup("#FF3C3C")}>
                    <GlassSelect
                        value={objectsFilterValue}
                        onChange={onObjectsFilterChange}
                        options={objectsOptions}
                        accentColor="#FF3C3C"
                        menuPlacement="top"
                    />
                </div>
            )}
        </div>
    );
};
