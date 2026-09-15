/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { FieldNote, FIELD_NOTE_CATEGORIES } from "./types";

interface Props {
    isAnnotationMode: boolean;
    pendingNote: { lon: number; lat: number; imageId: string | null } | null;
    notes: FieldNote[];
    listOpen: boolean;
    categories?: string[];
    onSubmitNote: (category: string, note: string) => void;
    onCancelPending: () => void;
    onDeleteNote: (id: string) => void;
    onClearAll: () => void;
    onExport: () => void;
    onImportFile: (file: File) => void;
    onFocusNote: (note: FieldNote) => void;
    onCloseList: () => void;
}

export const FieldNotesPanel: React.FC<Props> = (props) => {
    const {
        pendingNote, notes, listOpen, categories: propCategories,
        onSubmitNote, onCancelPending,
        onDeleteNote, onClearAll, onExport, onImportFile, onFocusNote, onCloseList
    } = props;
    
    // Use customized categories from config, or fallback to default categories
    const categories = React.useMemo(() => {
        return propCategories && propCategories.length > 0
            ? propCategories
            : Array.from(FIELD_NOTE_CATEGORIES);
    }, [propCategories]);

    const [category, setCategory] = React.useState<string>(categories[0] || "Other");
    const [noteText, setNoteText] = React.useState("");
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isConfirmingClear, setIsConfirmingClear] = React.useState(false);

    React.useEffect(() => {
        if (pendingNote) {
            setCategory(categories[0] || "Other");
            setNoteText("");
        }
    }, [pendingNote, categories]);

    return (
        <React.Fragment>
            {/* Note entry form: centered modal, avoids all fixed chrome */}
            {pendingNote && (
                <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 999999995, background: "rgba(15,15,15,0.96)", color: "#fff",
                    padding: "14px", borderRadius: "12px", width: "min(280px, 80%)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "8px"
                }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, opacity: 0.85 }}>New Field Note</div>
                    <select
                        value={category}
                        onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}
                        style={{ padding: "7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)", background: "#1a1a1a", color: "#fff", fontSize: "12px" }}
                    >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <textarea
                        value={noteText}
                        onChange={(e) => setNoteText((e.target as HTMLTextAreaElement).value)}
                        placeholder="Description (optional)"
                        rows={3}
                        style={{ padding: "7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)", background: "#1a1a1a", color: "#fff", fontSize: "12px", resize: "none" }}
                    />
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                            onClick={onCancelPending}
                            style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "11px", cursor: "pointer" }}
                        >Cancel</button>
                        <button
                            onClick={() => onSubmitNote(category, noteText)}
                            style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "#05a056", color: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                        >Save</button>
                    </div>
                </div>
            )}

            {/* Notes list: bottom-sheet with fixed header and scrollable notes */}
            {listOpen && (
                <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 999999990,
                    background: "rgba(12,12,12,0.92)", backdropFilter: "blur(10px)",
                    borderTop: "1px solid rgba(255,255,255,0.1)", padding: "6px 8px 8px 8px",
                    display: "flex", flexDirection: "column", gap: "6px",
                    animation: "nearbySlideUp 0.2s ease-out"
                }}>
                    {/* Fixed Header: Actions remain visible at all times */}
                    <div style={{ 
                        display: "flex", justifyContent: "space-between", alignItems: "center", 
                        fontSize: "9px", color: "rgba(255,255,255,0.45)", flexShrink: 0 
                    }}>
                        <span>{notes.length > 0 ? `${notes.length} field note${notes.length > 1 ? 's' : ''}` : 'No notes yet'}</span>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            {/* Import Button */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", cursor: "pointer" }}
                                    >Import
                                </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json,.geojson,application/json,application/geo+json"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                    const target = e.target as HTMLInputElement;
                                    const file = target.files?.[0];
                                    if (file) onImportFile(file);
                                    target.value = ""; // Reset input so same file can be reselected
                                }}
                            />
                            {/* Export Button */}
                            <button
                                onClick={onExport}
                                style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", border: "none", background: "#05a056", color: "#fff", cursor: "pointer" }}
                                >Export
                            </button>
                            {notes.length > 0 && (
                                <button
                                    onClick={() => {
                                        if (isConfirmingClear) {
                                            onClearAll();
                                            setIsConfirmingClear(false);
                                        } else {
                                            setIsConfirmingClear(true);
                                            // Reset back to "Clear All" after 3 seconds if not confirmed
                                            setTimeout(() => setIsConfirmingClear(false), 3000);
                                        }
                                    }}
                                    title={isConfirmingClear ? "Click again to confirm" : "Clear all field notes"}
                                    style={{
                                        fontSize: "10px",
                                        padding: "3px 8px",
                                        borderRadius: "5px",
                                        border: isConfirmingClear ? "1px solid #ff4444" : "1px solid rgba(255, 75, 75, 0.35)",
                                        background: isConfirmingClear ? "#ff4444" : "rgba(255, 50, 50, 0.15)",
                                        color: isConfirmingClear ? "#ffffff" : "#ff8888",
                                        fontWeight: isConfirmingClear ? 700 : 400,
                                        cursor: "pointer",
                                        transition: "all 0.2s ease"
                                    }}
                                >
                                    {isConfirmingClear ? "Confirm?" : "Clear All"}
                                </button>
                            )}
                            {/* Close Button */}
                            <button
                                onClick={onCloseList}
                                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "11px", padding: "0 2px", lineHeight: 1 }}
                            >✕</button>
                        </div>
                    </div>

                    {/* Scrollable Notes Area: Capped to approx. 3 items with a subtle scrollbar */}
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        maxHeight: "135px", // ~3 items height limit
                        overflowY: "auto",
                        overflowX: "hidden",
                        paddingRight: "3px",
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(255,255,255,0.25) transparent"
                    }}>
                        {notes.length === 0 && (
                            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", padding: "10px 0", textAlign: "center" }}>
                                You can get started by importing a GeoJSON file.
                            </div>
                        )}
                        {notes.slice().reverse().map(n => (
                            <div
                                key={n.id}
                                style={{
                                    padding: "6px 8px", borderRadius: "6px",
                                    background: "rgba(255,255,255,0.05)", cursor: "pointer",
                                    borderLeft: `3px solid ${n.source === 'manual' ? '#f5a623' : '#35AF6D'}`,
                                    flexShrink: 0
                                }}
                                onClick={() => onFocusNote(n)}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#fff" }}>{n.category}</span>
                                    <span
                                        onClick={(e) => { e.stopPropagation(); onDeleteNote(n.id); }}
                                        style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}
                                    >✕</span>
                                </div>
                                {n.note && <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>{n.note}</div>}
                                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                                    {new Date(n.createdAt).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </React.Fragment>
    );
};

export default FieldNotesPanel;