/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { React, jsx } from "jimu-core";
import { glassStyles } from "../utils/styles";
import { distanceMeters, pickSequenceColor } from "../utils/geoUtils";
import { SequenceInfo } from "../components/types";

// #region TYPES
export interface SequencePickerProps {
    sequences: SequenceInfo[];
    activeSequenceId: string | null;
    clickLat: number | null;
    clickLon: number | null;
    onSelectSequence: (sequenceId: string, closestImageId: string) => void;
    getSequenceWithCoords: (sequenceId: string, accessToken: string) => Promise<any[]>;
    clearGreenPulse: () => void;
    accessToken: string;
}
// #endregion

// #region COMPONENT
const SequencePicker: React.FC<SequencePickerProps> = ({
    sequences,
    activeSequenceId,
    clickLat,
    clickLon,
    onSelectSequence,
    getSequenceWithCoords,
    clearGreenPulse,
    accessToken,
}) => {
    const SLOTS = 3;
    const total = sequences?.length ?? 0;
    const showArrows = total > SLOTS;

    const [offset, setOffset] = React.useState(0);

    const activeIndex = activeSequenceId
        ? sequences.findIndex(s => s.sequenceId === activeSequenceId)
        : -1;

    // Scroll the window just enough to keep the active item visible.
    // Does not center; only nudges when the item falls outside the window.
    React.useEffect(() => {
        if (activeIndex === -1) return;
        setOffset(prev => {
            if (activeIndex < prev) return activeIndex;
            if (activeIndex >= prev + SLOTS) return activeIndex - SLOTS + 1;
            return prev;
        });
    }, [activeSequenceId, activeIndex]);

    // Early return AFTER all hooks
    if (!sequences || total <= 1) return null;

    const handleSelect = async (seq: SequenceInfo) => {
        clearGreenPulse();
        if (clickLon == null || clickLat == null) return;

        const coords = await getSequenceWithCoords(seq.sequenceId, accessToken);
        if (!coords.length) return;

        const closest = coords.reduce((best: any, img: any) => {
            const dist = distanceMeters(img.lat, img.lon, clickLat, clickLon);
            return (!best || dist < best.dist) ? { ...img, dist } : best;
        }, null);

        if (closest) onSelectSequence(seq.sequenceId, closest.id);
    };

    return (
        <div style={glassStyles.sequencePickerContainer}>

            {/* Prev Arrow */}
            {showArrows && (
                <button
                    style={{
                        ...glassStyles.sequenceArrow,
                        opacity: offset <= 0 ? 0.3 : 1,
                        cursor: offset <= 0 ? "default" : "pointer",
                    }}
                    disabled={offset <= 0}
                    onClick={() => setOffset(prev => Math.max(0, prev - 1))}
                    onMouseEnter={e => { if (offset > 0) e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                >
                    ◀
                </button>
            )}

            {/* Sequence Slots */}
            {Array.from({ length: Math.min(SLOTS, total) }).map((_, slotIdx) => {
                const seqIndex = offset + slotIdx;
                if (seqIndex >= total) return null;
                const seq = sequences[seqIndex];
                const colorArr = seq._color || pickSequenceColor(seqIndex);
                const cssColor = `rgba(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]}, ${colorArr[3] ?? 1})`;
                const date = seq.capturedAt
                    ? new Date(seq.capturedAt).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                    : "N/A";
                const isActive = activeSequenceId === seq.sequenceId;

                return (
                    <div
                        key={seq.sequenceId}
                        style={glassStyles.sequenceSlot(isActive)}
                        title={`Sequence ${seqIndex + 1} (${date})`}
                        onClick={() => handleSelect(seq)}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.35)"}
                        onMouseLeave={e => e.currentTarget.style.background = isActive ? "rgba(255,255,255,0.25)" : "transparent"}
                    >
                        <span style={glassStyles.sequenceDot(cssColor)} />
                        <span style={glassStyles.sequenceText}>
                            {seqIndex + 1}. {date}
                        </span>
                    </div>
                );
            })}

            {/* Next Arrow */}
            {showArrows && (
                <button
                    style={{
                        ...glassStyles.sequenceArrow,
                        opacity: offset + SLOTS >= total ? 0.3 : 1,
                        cursor: offset + SLOTS >= total ? "default" : "pointer",
                    }}
                    disabled={offset + SLOTS >= total}
                    onClick={() => setOffset(prev => Math.min(prev + 1, total - SLOTS))}
                    onMouseEnter={e => { if (offset + SLOTS < total) e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                >
                    ▶
                </button>
            )}

        </div>
    );
};

export default SequencePicker;
// #endregion