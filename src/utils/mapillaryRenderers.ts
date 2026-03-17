/**
    * @file mapillaryRenderers.ts
    * Pure factory functions that build ArcGIS renderer configuration objects
    * for Mapillary coverage layers.
    * No widget state, no ArcGIS module imports; returns plain JS objects
    * that the ArcGIS API accepts as renderer definitions.
*/

// Palette

/**
    * Shared color palette for year-based rendering.
    * Each entry is [R, G, B] with values 0–255.
    * Cycles automatically when there are more years than palette entries.
*/
export const YEAR_COLOR_PALETTE: ReadonlyArray<[number, number, number]> = [
    [46,  204, 113],
    [52,  152, 219],
    [241, 196,  15],
    [231,  76,  60],
    [155,  89, 182],
    [26,  188, 156],
    [230, 126,  34],
    [149, 165, 166],
];

// Renderers
/**
 * Builds a UniqueValueRenderer that colors turbo coverage points by year.
    * Each year in the provided array receives a distinct color from YEAR_COLOR_PALETTE.
    * Used by enableTurboCoverageLayer when turboColorByDate is active.
    * @param years; Sorted array of year strings (e.g. ["2021", "2022", "2023"]).
    * @returns ArcGIS UniqueValueRenderer plain-object definition.
*/
export function createYearBasedRenderer(years: string[]): any {
    return {
        type: 'unique-value',
        field: 'date_category',
        uniqueValueInfos: years.map((year, idx) => ({
            value: year,
            symbol: {
                type: 'simple-marker',
                color: [...YEAR_COLOR_PALETTE[idx % YEAR_COLOR_PALETTE.length], 0.9],
                size: 6,
                outline: { color: [255, 255, 255], width: 1 },
            },
        })),
        defaultSymbol: {
            type: 'simple-marker',
            color: [255, 255, 255, 0.5],
            size: 6,
            outline: { color: [0, 0, 0], width: 1 },
        },
    };
}
