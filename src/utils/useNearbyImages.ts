// useNearbyImages.ts
import { useState, useEffect, useRef } from 'react';
import { GRAPH_API } from '../utils/constants';
import type { NearbyImage } from '../components/types';


export function useNearbyImages(
  imageId: string | null,
  lat: number | null,
  lon: number | null,
  accessToken: string,
  radiusM = 50,
  limit = 12
) {
  const [images, setImages] = useState<NearbyImage[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!imageId || lat == null || lon == null) { setImages([]); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    const url = GRAPH_API.nearbyImages(lat, lon, radiusM, limit + 1) +
                `&access_token=${accessToken}`;

    fetch(url, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        // exclude the current image itself
        const filtered = (data.data as NearbyImage[])
          .filter(img => img.id !== imageId)
          .slice(0, limit);
        setImages(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [imageId, lat, lon, accessToken, radiusM, limit]);

  return { images, loading };
}