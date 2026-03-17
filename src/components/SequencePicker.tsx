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
    const [offset, setOffset] = React.useState(0);

    if (!sequences || sequences.length <= 1) return null;

    const SLOTS = 3;
    const visible = Array.from({ length: Math.min(SLOTS, sequences.length) });
    const showArrows = sequences.length > SLOTS;

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
                    style={glassStyles.sequenceArrow}
                    onClick={() => setOffset(prev => (prev - 1 + sequences.length) % sequences.length)}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                >
                    ◀
                </button>
            )}

            {/* Sequence Slots */}
            {visible.map((_, slotIdx) => {
                const seqIndex = (offset + slotIdx) % sequences.length;
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
                    style={glassStyles.sequenceArrow}
                    onClick={() => setOffset(prev => (prev + 1) % sequences.length)}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
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