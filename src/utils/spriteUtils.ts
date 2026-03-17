/**
  * spriteUtils.ts
  * Pure async helpers for loading and cropping icons from Mapillary
  * sprite sheets (PNG + JSON metadata).
  * No React, no ArcGIS - only browser Canvas/DOM APIs.
*/

// Types

/** One entry from a Mapillary sprite JSON file */
export interface SpriteMeta {
  x:          number;
  y:          number;
  width:      number;
  height:     number;
  pixelRatio: number;
}

// Low-level helpers

/**
  * Loads an <img> element from a URL, with crossOrigin = 'anonymous'
  * (required for GitHub-hosted sprite PNGs).
*/
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = url;
  });
}

/**
  * Crops a single icon out of a sprite sheet PNG and returns it
  * as a base64 PNG data URL.
  * @param spriteImg  Already-loaded sprite HTMLImageElement
  * @param meta       Position / size metadata from the sprite JSON
*/
export function cropSpriteImage(
  spriteImg: HTMLImageElement,
  meta: SpriteMeta
): string {
  const canvas = document.createElement('canvas');
  canvas.width  = meta.width;
  canvas.height = meta.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  ctx.drawImage(
    spriteImg,
    meta.x, meta.y, meta.width, meta.height, // source rect in sprite
    0, 0,  meta.width, meta.height            // destination rect on canvas
  );

  return canvas.toDataURL();
}

/**
  * Fetches a single named icon from a Mapillary sprite sheet and returns
  * it as a base64 PNG data URL, ready to use in an ArcGIS picture-marker
  * symbol `url` property.
  * @param spriteJSONUrl  URL to the sprite JSON file (coordinates + sizes)
  * @param spritePNGUrl   URL to the sprite PNG image
  * @param iconName       Key name of the icon inside the JSON
*/
export async function loadSpriteIconDataURL(
  spriteJSONUrl: string,
  spritePNGUrl:  string,
  iconName:      string
): Promise<string> {
  const jsonResp = await fetch(spriteJSONUrl);
  if (!jsonResp.ok) {
    throw new Error(`Failed to fetch sprite JSON (${jsonResp.status}): ${spriteJSONUrl}`);
  }
  const spriteData: Record<string, SpriteMeta> = await jsonResp.json();

  if (!spriteData[iconName]) {
    throw new Error(`Icon '${iconName}' not found in sprite JSON`);
  }

  const { x, y, width, height, pixelRatio } = spriteData[iconName];
  const ratio = pixelRatio || 1;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = spritePNGUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = width  / ratio;
      canvas.height = height / ratio;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(
        img,
        x, y, width, height,                    // source rect
        0, 0, width / ratio, height / ratio      // dest rect
      );

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = reject;
  });
}

// Batch helpers

/**
  * Processes an array in small synchronous chunks, yielding to the browser's
  * main thread between chunks via `setTimeout(fn, 0)`.
  * This prevents long-running loops from freezing UI animations (e.g. the
  * splash-screen progress bar) while iterating over hundreds of sprite codes.
  * @param items      Array of items to process
  * @param chunkSize  How many items to process before yielding
  * @param iterator   Called for each item; may return a value or null/undefined
  * @param onComplete Called once with all non-null results when done
*/
export function processInChunks<T, R>(
  items:      T[],
  chunkSize:  number,
  iterator:   (item: T) => Promise<R | null | undefined> | (R | null | undefined),
  onComplete: (results: R[]) => void
): void {
  let index = 0;
  const results: R[] = [];

  const nextChunk = async () => {
    const end = Math.min(index + chunkSize, items.length);
    for (let i = index; i < end; i++) {
      const res = await iterator(items[i]);
      if (res != null) results.push(res as R);
    }
    index = end;

    if (index < items.length) {
      // Yield to main thread then continue
      setTimeout(nextChunk, 0);
    } else {
      onComplete(results);
    }
  };

  nextChunk();
}

/**
  * Loads icons for every entry in `codes` from a sprite sheet and returns
  * an array of `{ value, label, iconUrl }` option objects, ready to use
  * in a GlassSelect dropdown.
  * Skips any code that has no matching entry in the sprite JSON, or whose
  * cropped image fails to produce a valid data URL.
  * @param codes           Array of raw Mapillary value codes to load
  * @param spriteBaseUrl   Base URL without extension (`.json` / `.png` appended)
  * @param labelFn         Converts a raw code to a human-friendly label string
*/
export async function loadSpriteOptions(
  codes:         string[],
  spriteBaseUrl: string,
  labelFn:       (code: string) => string
): Promise<Array<{ value: string; label: string; iconUrl: string }>> {
  const [spriteData, img] = await Promise.all([
    fetch(`${spriteBaseUrl}.json`).then(r => r.json()) as Promise<Record<string, SpriteMeta>>,
    loadImage(`${spriteBaseUrl}.png`),
  ]);

  const options: Array<{ value: string; label: string; iconUrl: string }> = [];

  for (const code of codes) {
    if (!spriteData[code]) continue;
    try {
      const iconUrl = cropSpriteImage(img, spriteData[code]);
      if (iconUrl) {
        options.push({ value: labelFn(code), label: labelFn(code), iconUrl });
      }
    } catch {
      // silently skip icons that fail to crop
    }
  }

  return options;
}
