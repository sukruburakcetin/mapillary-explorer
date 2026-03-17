/** @jsx jsx */
import { React, jsx } from "jimu-core";

// Types
interface GlassDatePickerProps {
    selected: Date | null;
    onChange: (date: Date | null) => void;
    placeholderText?: string;
    isClearable?: boolean;
    disabled?: boolean;
    dateFormat?: string;
    popperPlacement?: string;
    popperProps?: any;
    portalId?: string;
    customInput?: React.ReactElement;
}

interface GlassDatePickerState {
    open: boolean;
    viewYear: number;
    viewMonth: number;
    hoveredDay: number | null;
}

// Helpers
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay();
}

const ACCENT = "#37d582";

const NAV_BTN: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.6)",
    cursor: "pointer",
    fontSize: "14px",
    padding: "0 5px",
    lineHeight: 1,
    borderRadius: "3px",
};

//  Component
export class GlassDatePicker extends React.PureComponent<GlassDatePickerProps, GlassDatePickerState> {
    private wrapperRef = React.createRef<HTMLDivElement>();

    constructor(props: GlassDatePickerProps) {
        super(props);
        const now = props.selected ?? new Date();
        this.state = {
            open: false,
            viewYear: now.getFullYear(),
            viewMonth: now.getMonth(),
            hoveredDay: null,
        };
    }

    componentDidMount() {
        document.addEventListener("mousedown", this.handleOutside);
    }

    componentWillUnmount() {
        document.removeEventListener("mousedown", this.handleOutside);
    }

    componentDidUpdate(prev: GlassDatePickerProps) {
        if (prev.selected !== this.props.selected && this.props.selected) {
            this.setState({
                viewYear: this.props.selected.getFullYear(),
                viewMonth: this.props.selected.getMonth(),
            });
        }
    }

    private handleOutside = (e: MouseEvent) => {
        if (this.wrapperRef.current && !this.wrapperRef.current.contains(e.target as Node)) {
            this.setState({ open: false });
        }
    };

    private toggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.props.disabled) return;
        this.setState(prev => ({ open: !prev.open, hoveredDay: null }));
    };

    private clear = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.onChange(null);
        this.setState({ open: false });
    };

    private prevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.setState(prev => {
            let m = prev.viewMonth - 1, y = prev.viewYear;
            if (m < 0) { m = 11; y--; }
            return { viewMonth: m, viewYear: y };
        });
    };

    private nextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.setState(prev => {
            let m = prev.viewMonth + 1, y = prev.viewYear;
            if (m > 11) { m = 0; y++; }
            return { viewMonth: m, viewYear: y };
        });
    };

    private prevYear = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.setState(prev => ({ viewYear: prev.viewYear - 1 }));
    };

    private nextYear = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.setState(prev => ({ viewYear: prev.viewYear + 1 }));
    };

    private selectDay = (e: React.MouseEvent, day: number) => {
        e.stopPropagation();
        const d = new Date(this.state.viewYear, this.state.viewMonth, day);
        this.props.onChange(d);
        this.setState({ open: false, hoveredDay: null });
    };

    render() {
        const { selected, isClearable, placeholderText = "Date", disabled = false } = this.props;
        const { open, viewYear, viewMonth, hoveredDay } = this.state;

        const label      = selected ? toYMD(selected) : placeholderText;
        const totalDays  = daysInMonth(viewYear, viewMonth);
        const firstDay   = firstDayOfMonth(viewYear, viewMonth);
        const selDay     = selected?.getDate();
        const selMonth   = selected?.getMonth();
        const selYear    = selected?.getFullYear();
        const today      = new Date();

        // Build grid: leading nulls + day numbers + trailing nulls
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= totalDays; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);

        return (
            <div
                ref={this.wrapperRef}
                style={{ position: "relative", display: "inline-block" }}
            >
                {/* Trigger button */}
                <button
                    type="button"
                    onClick={this.toggle}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 7px",
                        background: open ? "rgba(55,213,130,0.15)" : "rgba(255,255,255,0.08)",
                        border: `1px solid ${open ? ACCENT : "rgba(255,255,255,0.18)"}`,
                        borderRadius: "5px",
                        color: selected ? "#fff" : "rgba(255,255,255,0.5)",
                        fontSize: "9px",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.5 : 1,
                        pointerEvents: disabled ? "none" as const : "auto" as const,
                        whiteSpace: "nowrap" as const,
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                        boxShadow: open ? `0 0 8px ${ACCENT}44` : "none",
                        transition: "all 0.15s",
                        userSelect: "none" as const,
                        WebkitUserSelect: "none" as const,
                    }}
                    title={placeholderText}
                >
                    <span style={{ fontSize: "10px", lineHeight: 1 }}>📅</span>
                    <span style={{ fontSize: "8px", lineHeight: 1 }}>{label}</span>
                    {isClearable && selected && (
                        <span
                            onClick={this.clear}
                            style={{
                                marginLeft: "1px",
                                color: "rgba(255,255,255,0.45)",
                                fontSize: "10px",
                                lineHeight: 1,
                                cursor: "pointer",
                            }}
                        >
                            ✕
                        </span>
                    )}
                </button>

                {/* Calendar panel (absolute child, opens upward) */}
                {open && (
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: "absolute",
                            bottom: "calc(100% + 6px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 10002,
                            width: "168px",
                            background: "rgba(10,10,10,0.97)",
                            backdropFilter: "blur(18px)",
                            WebkitBackdropFilter: "blur(18px)",
                            border: `1px solid ${ACCENT}55`,
                            borderRadius: "10px",
                            padding: "8px 8px 6px",
                            boxShadow: `0 -8px 32px rgba(0,0,0,0.7), 0 0 20px ${ACCENT}22`,
                            userSelect: "none" as const,
                            WebkitUserSelect: "none" as const,
                        }}
                    >
                        {/* Year navigation */}
                        <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: "5px"
                        }}>
                            <button type="button" onClick={this.prevYear} style={NAV_BTN}>«</button>
                            <span style={{ color: "#fff", fontSize: "11px", fontWeight: 700 }}>
                                {viewYear}
                            </span>
                            <button type="button" onClick={this.nextYear} style={NAV_BTN}>»</button>
                        </div>

                        {/* Month navigation */}
                        <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: "8px"
                        }}>
                            <button type="button" onClick={this.prevMonth} style={NAV_BTN}>‹</button>
                            <span style={{ color: ACCENT, fontSize: "10px", fontWeight: 600, letterSpacing: "0.4px" }}>
                                {MONTHS[viewMonth]}
                            </span>
                            <button type="button" onClick={this.nextMonth} style={NAV_BTN}>›</button>
                        </div>

                        {/* Day-of-week headers */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "3px" }}>
                            {DAYS.map(d => (
                                <div key={d} style={{
                                    fontSize: "8px",
                                    color: "rgba(255,255,255,0.3)",
                                    textAlign: "center",
                                    fontWeight: 700,
                                    padding: "1px 0",
                                }}>
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Day cells */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                            {cells.map((day, idx) => {
                                if (day === null) return <div key={`_${idx}`} />;

                                const isSelected = day === selDay && viewMonth === selMonth && viewYear === selYear;
                                const isToday    = day === today.getDate()
                                    && viewMonth === today.getMonth()
                                    && viewYear  === today.getFullYear();
                                const isHovered  = hoveredDay === day;

                                let bg = "transparent";
                                if (isSelected)     bg = ACCENT;
                                else if (isHovered) bg = "rgba(255,255,255,0.14)";
                                else if (isToday)   bg = `${ACCENT}20`;

                                return (
                                    <div
                                        key={day}
                                        className="day-cell" 
                                        onClick={e => this.selectDay(e, day)}
                                        onMouseEnter={() => this.setState({ hoveredDay: day })}
                                        onMouseLeave={() => this.setState({ hoveredDay: null })}
                                        style={{
                                            textAlign: "center",
                                            padding: "4px 2px",
                                            fontSize: "9px",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            background: bg,
                                            color: isSelected
                                                ? "#000"
                                                : isToday
                                                ? ACCENT
                                                : "rgba(255,255,255,0.88)",
                                            fontWeight: isSelected || isToday ? 700 : 400,
                                            border: isToday && !isSelected
                                                ? `1px solid ${ACCENT}55`
                                                : "1px solid transparent",
                                            transition: "background 0.08s",
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {day}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Today shortcut */}
                        <div style={{
                            marginTop: "7px",
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            paddingTop: "5px"
                        }}>
                            <button
                                type="button"
                                className="today-btn"
                                onClick={e => {
                                    e.stopPropagation();
                                    const t = new Date();
                                    this.props.onChange(t);
                                    this.setState({
                                        open: false,
                                        viewYear: t.getFullYear(),
                                        viewMonth: t.getMonth()
                                    });
                                }}
                                style={{
                                    width: "100%",
                                    background: "rgba(55,213,130,0.12)",
                                    border: `1px solid ${ACCENT}44`,
                                    borderRadius: "5px",
                                    color: ACCENT,
                                    fontSize: "9px",
                                    cursor: "pointer",
                                    padding: "3px 0",
                                    fontWeight: 600,
                                    letterSpacing: "0.3px",
                                }}
                            >
                                Today
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
