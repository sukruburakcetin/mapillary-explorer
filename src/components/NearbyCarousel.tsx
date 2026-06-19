// NearbyCarousel.tsx
import React, { useState, useRef } from 'react';
import type { NearbyImage } from '../components/types';

interface Props {
  images: NearbyImage[];
  loading: boolean;
  currentImageId: string | null;
  onSelectImage: (id: string) => void;
  onHoverImage?: (img: NearbyImage | null) => void;
}

export const NearbyCarousel: React.FC<Props> = ({
  images, loading, currentImageId, onSelectImage, onHoverImage
}) => {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!loading && images.length === 0) return null;

  return (
    <div style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 20 }}>

      {/* Badge button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Captures nearby"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 20,
          background: open ? '#05a056' : 'rgba(20,20,20,0.82)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {/* camera SVG icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        {loading ? '…' : images.length}
        <span style={{ fontWeight: 400, opacity: 0.8 }}>nearby</span>
        {/* chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <path d="M1 3l4 4 4-4"/>
        </svg>
      </button>

      {/* Drawer */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 36,
          right: 0,
          width: 340,
          background: 'rgba(15,15,15,0.92)',
          backdropFilter: 'blur(8px)',
          borderRadius: 10,
          padding: '8px 0',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            padding: '0 10px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 6,
          }}>
            {images.length} captures within 50 m
          </div>
          <div
            ref={scrollRef}
            style={{
              display: 'flex',
              gap: 6,
              padding: '0 8px',
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.2) transparent',
            }}
          >
            {images.map(img => (
              <NearbyThumb
                key={img.id}
                img={img}
                isCurrent={img.id === currentImageId}
                onSelect={() => { onSelectImage(img.id); setOpen(false); }}
                onHover={onHoverImage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Thumbnail
const NearbyThumb: React.FC<{
  img: NearbyImage;
  isCurrent: boolean;
  onSelect: () => void;
  onHover?: (img: NearbyImage | null) => void;
}> = ({ img, isCurrent, onSelect, onHover }) => {
  const date = new Date(img.captured_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short',
  });

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => onHover?.(img)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        flex: '0 0 auto',
        width: 100,
        scrollSnapAlign: 'start',
        cursor: 'pointer',
        borderRadius: 6,
        overflow: 'hidden',
        border: isCurrent ? '2px solid #05a056' : '2px solid transparent',
        position: 'relative',
        transition: 'transform 0.12s',
      }}
      onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.04)')}
      onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <img
        src={img.thumb_256_url}
        alt=""
        loading="lazy"
        style={{ width: '100%', height: 68, objectFit: 'cover', display: 'block' }}
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
        padding: '10px 4px 3px',
        fontSize: 9,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 1.2,
      }}>
        <div style={{ fontWeight: 600 }}>{img.creator?.username ?? ''}</div>
        <div>{date}</div>
      </div>
    </div>
  );
};