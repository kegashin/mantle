import { renderGlyphrameCardToCanvas } from '@glyphrame/engine';
import type {
  GlyphrameAsset,
  GlyphrameCard,
  GlyphrameSurfaceTarget
} from '@glyphrame/schemas';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../../components/Icon';
import styles from './CardCanvas.module.css';

type CardCanvasProps = {
  card: GlyphrameCard;
  target: GlyphrameSurfaceTarget;
  asset?: GlyphrameAsset | undefined;
  onChooseSource?: () => void;
};

/**
 * Reactive preview canvas.
 *
 * Strategy: the wrapper <div> owns the layout box (sized by the stage grid),
 * JavaScript measures it, computes the largest aspect-matched box that fits,
 * and sets the canvas CSS width / height inline. The canvas backing store is
 * then driven by DPR-scaled target dimensions for crisp rendering at any
 * zoom level. Uses the same engine function as export — preview == export.
 */
export function CardCanvas({ card, target, asset, onChooseSource }: CardCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    let cancelled = false;
    let rafId = 0;

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(async () => {
        if (cancelled) return;

        // Inner box after padding.
        const style = window.getComputedStyle(wrap);
        const padX =
          Number.parseFloat(style.paddingLeft || '0') +
          Number.parseFloat(style.paddingRight || '0');
        const padY =
          Number.parseFloat(style.paddingTop || '0') +
          Number.parseFloat(style.paddingBottom || '0');
        const availW = Math.max(0, wrap.clientWidth - padX);
        const availH = Math.max(0, wrap.clientHeight - padY);
        if (availW === 0 || availH === 0) return;

        const aspect = target.width / target.height;
        let cssW = availW;
        let cssH = availW / aspect;
        if (cssH > availH) {
          cssH = availH;
          cssW = availH * aspect;
        }

        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (cssW / target.width) * dpr;

        try {
          const rendered = await renderGlyphrameCardToCanvas({
            card,
            target,
            asset,
            scale,
            showEmptyPlaceholderText: Boolean(asset)
          });
          if (cancelled) return;

          if (canvas.width !== rendered.width) canvas.width = rendered.width;
          if (canvas.height !== rendered.height) canvas.height = rendered.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context is unavailable.');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(rendered, 0, 0);

          setRenderError(null);
        } catch (error) {
          if (cancelled) return;
          setRenderError(error instanceof Error ? error.message : 'Render failed.');
        }
      });
    };

    schedule();

    const resize = new ResizeObserver(schedule);
    resize.observe(wrap);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      resize.disconnect();
    };
  }, [card, target, asset]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        className={styles.canvas}
        ref={canvasRef}
        // Canvas starts hidden until JS measures the wrapper. Prevents the
        // intrinsic canvas size (width attribute) from forcing parent growth.
        style={{ width: 0, height: 0 }}
      />
      {!asset ? (
        <div className={styles.emptyOverlay}>
          <div className={styles.emptyActions}>
            <Icon name="upload" size={19} />
            <span>Drop screenshot</span>
            <button
              className={styles.chooseButton}
              type="button"
              onClick={onChooseSource}
            >
              <Icon name="image" size={14} />
              <span>Choose image</span>
            </button>
          </div>
        </div>
      ) : null}
      {renderError ? <div className={styles.errorLayer}>{renderError}</div> : null}
    </div>
  );
}
