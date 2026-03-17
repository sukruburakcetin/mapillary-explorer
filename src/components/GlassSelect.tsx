/** @jsx jsx */
import { React, jsx } from "jimu-core";

// Types
export interface GlassSelectOption {
    value: string;
    label: string;
    iconUrl: string | null;
}

interface GlassSelectProps {
    value: GlassSelectOption;
    onChange: (option: GlassSelectOption) => void;
    options: GlassSelectOption[];
    accentColor?: string;       // e.g. '#FFA500' or '#FF3C3C'
    menuPlacement?: "top" | "bottom";
    menuPortalTarget?: Element; // kept for API compat, not needed
}


// Styles
const base: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    width: "100%",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: "10px",
    userSelect: "none",
    WebkitUserSelect: "none",
};

const controlStyle = (accent: string, open: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "4px",
    padding: "3px 6px",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: `1px solid ${open ? accent : "rgba(255,255,255,0.15)"}`,
    borderRadius: open ? "6px 6px 0 0" : "6px",
    color: "#fff",
    cursor: "pointer",
    minHeight: "24px",
    boxShadow: open ? `0 0 8px ${accent}55` : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxSizing: "border-box" as const,
    minWidth:"130px"
});

const menuStyle = (accent: string, placement: "top" | "bottom"): React.CSSProperties => ({
    position: "absolute",
    [placement === "top" ? "bottom" : "top"]: "100%",
    left: 0,
    right: 0,
    zIndex: 99999,
    maxHeight: "200px",
    overflowY: "auto",
    background: "rgba(15,15,15,0.92)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: `1px solid ${accent}66`,
    borderTop: placement === "top" ? `1px solid ${accent}66` : "none",
    borderBottom: placement === "bottom" ? `1px solid ${accent}66` : "none",
    borderRadius: placement === "top" ? "6px 6px 0 0" : "0 0 6px 6px",
    boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 12px ${accent}33`,
    scrollbarWidth: "thin" as const,
    scrollbarColor: `${accent}55 transparent`,
});

const optionStyle = (hovered: boolean, selected: boolean, accent: string): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "5px 8px",
    cursor: "pointer",
    color: selected ? "#fff" : "rgba(255,255,255,0.82)",
    background: selected
        ? `${accent}33`
        : hovered
        ? "rgba(255,255,255,0.08)"
        : "transparent",
    fontWeight: selected ? 600 : 400,
    borderLeft: selected ? `2px solid ${accent}` : "2px solid transparent",
    transition: "background 0.1s",
    boxSizing: "border-box" as const,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
});

const chevron = (open: boolean, accent: string): React.CSSProperties => ({
    flexShrink: 0,
    width: "8px",
    height: "8px",
    borderRight: `1.5px solid ${open ? accent : "rgba(255,255,255,0.5)"}`,
    borderBottom: `1.5px solid ${open ? accent : "rgba(255,255,255,0.5)"}`,
    transform: open ? "rotate(-135deg) translateY(2px)" : "rotate(45deg) translateY(-2px)",
    transition: "transform 0.2s, border-color 0.15s",
    marginLeft: "2px",
});

// Component
export class GlassSelect extends React.PureComponent<
    GlassSelectProps,
    { open: boolean; hoveredIdx: number | null; searchQuery: string }
> {
    private containerRef = React.createRef<HTMLDivElement>();
    private searchRef = React.createRef<HTMLInputElement>();

    state = { open: false, hoveredIdx: null as number | null, searchQuery: "" };

    componentDidMount() {
        document.addEventListener("mousedown", this.handleOutsideClick);
    }

    componentWillUnmount() {
        document.removeEventListener("mousedown", this.handleOutsideClick);
    }

    private handleOutsideClick = (e: MouseEvent) => {
        if (this.containerRef.current && !this.containerRef.current.contains(e.target as Node)) {
            this.setState({ open: false, searchQuery: "" });
        }
    };

    private toggle = () => {
        this.setState(
            prev => ({ open: !prev.open, searchQuery: "", hoveredIdx: null }),
            () => {
                if (this.state.open) {
                    // Focus the search input when menu opens
                    setTimeout(() => this.searchRef.current?.focus(), 30);
                }
            }
        );
    };

    private select = (opt: GlassSelectOption) => {
        this.setState({ open: false, searchQuery: "" });
        this.props.onChange(opt);
    };

    render() {
        const {
            value,
            options,
            accentColor = "#37d582",
            menuPlacement = "top",
        } = this.props;

        const { open, hoveredIdx, searchQuery } = this.state;

        const filtered = searchQuery
            ? options.filter(o => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
            : options;

        return (
            <div ref={this.containerRef} style={base}>
                {/* Control (trigger) */}
                <div
                    style={controlStyle(accentColor, open)}
                    onClick={this.toggle}
                    role="combobox"
                    aria-expanded={open}
                >
                    {/* Selected value label */}
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", overflow: "hidden", flex: 1 }}>
                        {value?.iconUrl && (
                            <img
                                src={value.iconUrl}
                                alt=""
                                style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }}
                            />
                        )}
                        <span style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#fff",
                            fontSize: "10px",
                        }}>
                            {value?.label ?? "Select…"}
                        </span>
                    </div>
                    <div style={chevron(open, accentColor)} />
                </div>

                {/* Dropdown menu */}
                {open && (
                    <div style={menuStyle(accentColor, menuPlacement)}>
                        {/* Search input */}
                        {options.length > 6 && (
                            <div style={{ padding: "4px 6px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                <input
                                    ref={this.searchRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => this.setState({ searchQuery: e.target.value, hoveredIdx: null })}
                                    placeholder="Search…"
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        width: "100%",
                                        background: "rgba(255,255,255,0.07)",
                                        border: `1px solid ${accentColor}44`,
                                        borderRadius: "4px",
                                        color: "#fff",
                                        fontSize: "9px",
                                        padding: "3px 6px",
                                        outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                            </div>
                        )}

                        {/* Options */}
                        {filtered.length === 0 ? (
                            <div style={{ padding: "8px", color: "rgba(255,255,255,0.4)", fontSize: "9px", textAlign: "center" }}>
                                No results
                            </div>
                        ) : (
                            filtered.map((opt, idx) => (
                                <div
                                    key={opt.value}
                                    style={optionStyle(hoveredIdx === idx, opt.value === value?.value, accentColor)}
                                    onMouseEnter={() => this.setState({ hoveredIdx: idx })}
                                    onMouseLeave={() => this.setState({ hoveredIdx: null })}
                                    onMouseDown={e => { e.preventDefault(); this.select(opt); }}
                                    title={opt.label}
                                >
                                    {opt.iconUrl && (
                                        <img
                                            src={opt.iconUrl}
                                            alt=""
                                            style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }}
                                        />
                                    )}
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {opt.label}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        );
    }
}
