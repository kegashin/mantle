import {
  exportGlyphrameCard,
  getBackgroundPresetDefaultParams,
  resolveFrameBoxStyle
} from '@glyphrame/engine';
import {
  DEFAULT_GLYPHRAME_TEXT,
  DEFAULT_GLYPHRAME_TARGETS,
  GlyphrameProjectSchema,
  type GlyphrameAsset,
  type GlyphrameBackground,
  type GlyphrameCard,
  type GlyphrameExportFormat,
  type GlyphrameFrame,
  type GlyphrameFrameBoxStyle,
  type GlyphrameFramePreset,
  type GlyphramePalette,
  type GlyphrameProject,
  type GlyphrameSurfaceAspectRatioPreset,
  type GlyphrameSurfaceTarget,
  type GlyphrameText,
  type GlyphrameTextFont,
  createGlyphrameProject
} from '@glyphrame/schemas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../components/Icon';
import { InspectorPanel } from '../features/inspector/InspectorPanel';
import { CardCanvas } from '../features/stage/CardCanvas';
import { downloadBlob } from '../lib/downloadBlob';
import styles from './App.module.css';

const ACCEPTED_INPUT = 'image/*,.png,.jpg,.jpeg,.webp,.gif';
const ACCEPTED_PROJECT = '.glyphrame.json,application/json';
const CUSTOM_TARGET_PREFIX = 'custom-card-';
const MIN_SURFACE_DIMENSION = 320;
const MAX_SURFACE_DIMENSION = 4096;

type StylePreset = {
  id: string;
  label: string;
  hint: string;
  background: GlyphrameBackground;
  frame: GlyphrameFrame;
  text: GlyphrameText;
};

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'default-solid',
    label: 'Default',
    hint: 'Plain background color',
    background: {
      family: 'solid',
      presetId: 'solid-color',
      seed: 'default-solid',
      intensity: 0,
      params: {},
      palette: {
        background: '#101114',
        foreground: '#f4f1e8',
        accent: '#7ee7c7',
        muted: '#8c9995'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'solid',
      padding: 96,
      contentPadding: 0,
      cornerRadius: 22,
      shadowColor: '#000000',
      shadowStrength: 1,
      shadowSoftness: 1,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_GLYPHRAME_TEXT
  },
  {
    id: 'terminal-glass',
    label: 'Terminal Scanline',
    hint: 'Dark CRT scanlines · macOS window',
    background: {
      family: 'glyph-field',
      presetId: 'terminal-scanline',
      seed: 'terminal-glass',
      intensity: 0.68,
      params: {
        scanlineDensity: 0.72,
        glyphDensity: 0.42,
        sweepGlow: 0.68
      },
      palette: {
        background: '#070a0c',
        foreground: '#e9f1ea',
        accent: '#7ee7c7',
        muted: '#8c9995'
      }
    },
    frame: {
      preset: 'macos-window',
      boxStyle: 'solid',
      padding: 96,
      contentPadding: 0,
      cornerRadius: 22,
      shadowColor: '#000000',
      shadowStrength: 1.25,
      shadowSoftness: 1.35,
      shadowDistance: 1.2,
      alignment: 'center'
    },
    text: DEFAULT_GLYPHRAME_TEXT
  },
  {
    id: 'quiet-graphite',
    label: 'Contour Lines',
    hint: 'Editorial topography · minimal browser',
    background: {
      family: 'mesh',
      presetId: 'contour-lines',
      seed: 'quiet-graphite',
      intensity: 0.62,
      params: {
        lineDensity: 0.62,
        relief: 0.56,
        accentGlow: 0.48
      },
      palette: {
        background: '#0f1114',
        foreground: '#ecefe9',
        accent: '#d6c7a1',
        muted: '#6f7680'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'solid',
      padding: 112,
      contentPadding: 0,
      cornerRadius: 26,
      shadowColor: '#000000',
      shadowStrength: 1,
      shadowSoftness: 1,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_GLYPHRAME_TEXT
  },
  {
    id: 'docs-clean',
    label: 'Dot Grid',
    hint: 'Off-white paper · notebook dots',
    background: {
      family: 'solid',
      presetId: 'dot-grid',
      seed: 'docs-clean',
      intensity: 0.34,
      params: {
        dotOpacity: 0.34,
        dotDensity: 0.42
      },
      palette: {
        background: '#edefe9',
        foreground: '#111417',
        accent: '#3f6d60',
        muted: '#70776f'
      }
    },
    frame: {
      preset: 'none',
      boxStyle: 'none',
      padding: 88,
      contentPadding: 0,
      cornerRadius: 14,
      shadowColor: '#281a0c',
      shadowStrength: 0.55,
      shadowSoftness: 0.9,
      shadowDistance: 0.72,
      alignment: 'center'
    },
    text: DEFAULT_GLYPHRAME_TEXT
  }
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read image.'));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Could not read image.'));
    });
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener('error', () => reject(new Error('Could not decode image.')));
    image.src = dataUrl;
  });
}

function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'Screenshot';
}

function safeFileName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'glyphrame-project'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function alignValue(value: unknown): GlyphrameText['align'] {
  return value === 'left' || value === 'right' || value === 'center' ? value : 'center';
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fontValue(value: unknown): GlyphrameTextFont {
  if (
    value === 'sans' ||
    value === 'system' ||
    value === 'display' ||
    value === 'rounded' ||
    value === 'serif' ||
    value === 'editorial' ||
    value === 'slab' ||
    value === 'mono' ||
    value === 'code' ||
    value === 'condensed'
  ) {
    return value;
  }
  return DEFAULT_GLYPHRAME_TEXT.titleFont;
}

function migrateLegacyTextEntity(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const copy = isRecord(value.copy) ? value.copy : undefined;
  const typography = isRecord(value.typography) ? value.typography : undefined;
  const next: Record<string, unknown> = { ...value };
  delete next.copy;
  delete next.typography;

  if (isRecord(next.text)) {
    const text = next.text;
    const legacyFont = fontValue(text.font);
    const legacyColor = stringValue(text.color);
    next.text = {
      ...text,
      titleFont: fontValue(text.titleFont ?? legacyFont),
      subtitleFont: fontValue(text.subtitleFont ?? legacyFont),
      ...(stringValue(text.titleColor) ? { titleColor: stringValue(text.titleColor) } : legacyColor ? { titleColor: legacyColor } : {}),
      ...(stringValue(text.subtitleColor)
        ? { subtitleColor: stringValue(text.subtitleColor) }
        : legacyColor
          ? { subtitleColor: legacyColor }
          : {})
    };
    return next;
  }

  const title = stringValue(copy?.headline);
  const subtitle = stringValue(copy?.subtitle);
  const hasText = Boolean(title || subtitle);
  next.text = {
    placement: hasText ? 'top' : 'none',
    align: alignValue(typography?.align),
    titleFont: DEFAULT_GLYPHRAME_TEXT.titleFont,
    subtitleFont: DEFAULT_GLYPHRAME_TEXT.subtitleFont,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    scale: numberValue(typography?.headlineScale, 1),
    width: numberValue(typography?.maxWidth, DEFAULT_GLYPHRAME_TEXT.width),
    gap: DEFAULT_GLYPHRAME_TEXT.gap
  } satisfies GlyphrameText;

  return next;
}

function migrateLegacyGlyphrameProject(value: unknown): unknown {
  if (!isRecord(value)) return value;

  return {
    ...value,
    cards: Array.isArray(value.cards)
      ? value.cards.map((card) => migrateLegacyTextEntity(card))
      : value.cards,
    themes: Array.isArray(value.themes)
      ? value.themes.map((theme) => migrateLegacyTextEntity(theme))
      : value.themes
  };
}

function createBackgroundSeed(presetId: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${presetId}-${suffix}`;
}

function createAssetFromFile(
  file: File,
  dataUrl: string,
  dimensions: { width: number; height: number }
): GlyphrameAsset {
  return {
    id: `asset-${Date.now()}`,
    role: 'screenshot',
    name: file.name,
    mimeType: file.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    fileSize: file.size,
    dataUrl
  };
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSurfaceDimension(value: number, fallback: number): number {
  const next = Number.isFinite(value) ? value : fallback;
  return Math.min(
    MAX_SURFACE_DIMENSION,
    Math.max(MIN_SURFACE_DIMENSION, Math.round(next))
  );
}

function resolveFrameContentPaddingForBoxStyle(
  boxStyle: GlyphrameFrameBoxStyle,
  current: number | undefined
): number {
  if (current && current > 0) return current;
  return boxStyle === 'soft-panel' || boxStyle === 'glass-panel' ? 32 : 0;
}

function fitSurfaceSizeToRatio({
  value,
  ratio,
  anchor
}: {
  value: number;
  ratio: number;
  anchor: 'width' | 'height';
}): Pick<GlyphrameSurfaceTarget, 'width' | 'height'> {
  if (anchor === 'width') {
    let width = normalizeSurfaceDimension(value, DEFAULT_GLYPHRAME_TARGETS[0]!.width);
    let height = Math.round(width / ratio);

    if (height > MAX_SURFACE_DIMENSION) {
      height = MAX_SURFACE_DIMENSION;
      width = Math.round(height * ratio);
    }
    if (height < MIN_SURFACE_DIMENSION) {
      height = MIN_SURFACE_DIMENSION;
      width = Math.round(height * ratio);
    }

    return {
      width: normalizeSurfaceDimension(width, DEFAULT_GLYPHRAME_TARGETS[0]!.width),
      height: normalizeSurfaceDimension(height, DEFAULT_GLYPHRAME_TARGETS[0]!.height)
    };
  }

  let height = normalizeSurfaceDimension(value, DEFAULT_GLYPHRAME_TARGETS[0]!.height);
  let width = Math.round(height * ratio);

  if (width > MAX_SURFACE_DIMENSION) {
    width = MAX_SURFACE_DIMENSION;
    height = Math.round(width / ratio);
  }
  if (width < MIN_SURFACE_DIMENSION) {
    width = MIN_SURFACE_DIMENSION;
    height = Math.round(width / ratio);
  }

  return {
    width: normalizeSurfaceDimension(width, DEFAULT_GLYPHRAME_TARGETS[0]!.width),
    height: normalizeSurfaceDimension(height, DEFAULT_GLYPHRAME_TARGETS[0]!.height)
  };
}

function upsertCustomTargetForActiveCard(
  project: GlyphrameProject,
  patch: Partial<Pick<GlyphrameSurfaceTarget, 'width' | 'height'>>,
  aspectRatioPresetId?: GlyphrameSurfaceAspectRatioPreset
): GlyphrameProject {
  const card = project.cards.find((item) => item.id === project.activeCardId);
  if (!card) return project;

  const baseTarget =
    project.targets.find((target) => target.id === card.targetId) ??
    project.targets[0] ??
    DEFAULT_GLYPHRAME_TARGETS[0]!;
  const customTargetId = `${CUSTOM_TARGET_PREFIX}${card.id}`;
  const nextAspectRatioPresetId =
    aspectRatioPresetId ?? baseTarget.aspectRatioPresetId ?? 'free';
  const nextTarget: GlyphrameSurfaceTarget = {
    id: customTargetId,
    kind: 'custom',
    label: nextAspectRatioPresetId === 'free' ? 'Free' : 'Custom',
    width: normalizeSurfaceDimension(patch.width ?? baseTarget.width, baseTarget.width),
    height: normalizeSurfaceDimension(patch.height ?? baseTarget.height, baseTarget.height),
    platform: 'custom',
    aspectRatioPresetId: nextAspectRatioPresetId
  };
  const hasCustomTarget = project.targets.some((target) => target.id === customTargetId);

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    targets: hasCustomTarget
      ? project.targets.map((target) =>
          target.id === customTargetId ? nextTarget : target
        )
      : [nextTarget, ...project.targets],
    cards: project.cards.map((item) =>
      item.id === card.id ? { ...item, targetId: customTargetId } : item
    )
  };
}

export function App() {
  const [project, setProject] = useState(() =>
    createGlyphrameProject({
      name: 'Glyphrame Draft',
      brandName: 'Glyphrame'
    })
  );
  const [status, setStatus] = useState('Ready');
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const activeCard = useMemo(
    () =>
      project.cards.find((card) => card.id === project.activeCardId) ??
      project.cards[0],
    [project.activeCardId, project.cards]
  );
  const activeTarget = useMemo(
    () =>
      project.targets.find((target) => target.id === activeCard?.targetId) ??
      project.targets[0] ??
      DEFAULT_GLYPHRAME_TARGETS[0]!,
    [activeCard?.targetId, project.targets]
  );
  const activeAsset = useMemo(
    () =>
      activeCard?.sourceAssetId
        ? project.assets.find((asset) => asset.id === activeCard.sourceAssetId)
        : undefined,
    [activeCard?.sourceAssetId, project.assets]
  );

  const updateActiveCard = useCallback((patch: Partial<GlyphrameCard>) => {
    setProject((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      cards: current.cards.map((card) =>
        card.id === current.activeCardId ? { ...card, ...patch } : card
      )
    }));
  }, []);

  const updateActiveSurfaceSize = useCallback(
    (
      patch: Partial<Pick<GlyphrameSurfaceTarget, 'width' | 'height'>>,
      options?: {
        ratio?: number;
        anchor?: 'width' | 'height';
        aspectRatioPresetId?: GlyphrameSurfaceAspectRatioPreset;
      }
    ) => {
      setProject((current) => {
        if (options?.ratio && options.anchor) {
          const value = patch[options.anchor];
          if (value != null) {
            return upsertCustomTargetForActiveCard(
              current,
              fitSurfaceSizeToRatio({
                value,
                ratio: options.ratio,
                anchor: options.anchor
              }),
              options.aspectRatioPresetId
            );
          }
        }

        return upsertCustomTargetForActiveCard(
          current,
          patch,
          options?.aspectRatioPresetId
        );
      });
    },
    []
  );

  const updateActiveSurfaceAspectRatio = useCallback(
    (aspectRatioPresetId: GlyphrameSurfaceAspectRatioPreset, ratio?: number) => {
    setProject((current) => {
      const card = current.cards.find((item) => item.id === current.activeCardId);
      if (!card) return current;
      const baseTarget =
        current.targets.find((target) => target.id === card.targetId) ??
        current.targets[0] ??
        DEFAULT_GLYPHRAME_TARGETS[0]!;

      if (!ratio) {
        return upsertCustomTargetForActiveCard(
          current,
          {
            width: baseTarget.width,
            height: baseTarget.height
          },
          aspectRatioPresetId
        );
      }

      let width = normalizeSurfaceDimension(baseTarget.width, baseTarget.width);
      let height = normalizeSurfaceDimension(width / ratio, baseTarget.height);

      if (height >= MAX_SURFACE_DIMENSION) {
        height = MAX_SURFACE_DIMENSION;
        width = normalizeSurfaceDimension(height * ratio, width);
      }

      return upsertCustomTargetForActiveCard(
        current,
        { width, height },
        aspectRatioPresetId
      );
    });
  }, []);

  const importFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus('Unsupported file type.');
      return;
    }

    setStatus(`Importing ${file.name}`);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(dataUrl);
      const asset = createAssetFromFile(file, dataUrl, dimensions);
      setProject((current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        assets: [...current.assets, asset],
        cards: current.cards.map((item) =>
          item.id === current.activeCardId
            ? {
                ...item,
                name: fileBaseName(file.name),
                sourceAssetId: asset.id
              }
            : item
        )
      }));
      setStatus(`${file.name} imported`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    }
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/')
      );
      if (file) void importFile(file);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importFile]);

  const applyStylePreset = (preset: StylePreset) => {
    updateActiveCard({
      themeId: preset.id,
      background: preset.background,
      frame: preset.frame,
      text: preset.text
    });
    setStatus(`${preset.label} applied`);
  };

  const handleSaveProject = () => {
    try {
      const nextProject = GlyphrameProjectSchema.parse({
        ...project,
        updatedAt: new Date().toISOString()
      });
      setProject(nextProject);
      downloadBlob({
        blob: new Blob([JSON.stringify(nextProject, null, 2)], {
          type: 'application/json;charset=utf-8'
        }),
        filename: `${safeFileName(nextProject.name)}.glyphrame.json`,
        mimeType: 'application/json'
      });
      setStatus('Project saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Project save failed.');
    }
  };

  const handleLoadProject = async (file: File) => {
    setStatus(`Loading ${file.name}`);
    try {
      const rawProject = JSON.parse(await file.text()) as unknown;
      const loadedProject = GlyphrameProjectSchema.parse(
        migrateLegacyGlyphrameProject(rawProject)
      );
      const activeCardExists = loadedProject.cards.some(
        (card) => card.id === loadedProject.activeCardId
      );
      if (!activeCardExists) {
        throw new Error('Project file points to a missing active card.');
      }
      setProject(loadedProject);
      setStatus(`${loadedProject.name} loaded`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Project load failed.');
    }
  };

  const handleExport = async (copyToClipboard = false) => {
    if (!activeCard || !activeTarget) {
      setStatus('Nothing to export yet.');
      return;
    }

    setIsExporting(true);
    try {
      const exportFormat: GlyphrameExportFormat = copyToClipboard
        ? 'png'
        : activeCard.export.format;
      const cardForExport: GlyphrameCard = {
        ...activeCard,
        export: {
          ...activeCard.export,
          format: exportFormat,
          ...(copyToClipboard ? { quality: undefined } : {})
        }
      };
      const result = await exportGlyphrameCard({
        card: cardForExport,
        target: activeTarget,
        asset: activeAsset
      });

      if (copyToClipboard && 'ClipboardItem' in window && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ [result.mimeType]: result.blob })
        ]);
        setStatus('Copied PNG to clipboard');
      } else {
        downloadBlob(result);
        setStatus(copyToClipboard ? 'Clipboard unavailable, downloaded PNG' : 'Export ready');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!activeCard || !activeTarget) {
    return (
      <div className={styles.page}>
        <div className={styles.fatal}>Project failed to initialize.</div>
      </div>
    );
  }

  return (
    <div
      className={styles.page}
      onDragEnter={(event) => {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <input
        accept={ACCEPTED_INPUT}
        className={styles.hiddenInput}
        data-testid="source-file-input"
        ref={fileInputRef}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importFile(file);
          event.currentTarget.value = '';
        }}
      />
      <input
        accept={ACCEPTED_PROJECT}
        className={styles.hiddenInput}
        data-testid="project-file-input"
        ref={projectInputRef}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handleLoadProject(file);
          event.currentTarget.value = '';
        }}
      />

      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>◐</span>
          <span className={styles.brandName}>GLYPHRAME</span>
          <span className={styles.brandMeta}>v0</span>
        </div>
        <div className={styles.topSpacer} />
        <div className={styles.topActions}>
          <div className={styles.topGroup}>
            <span className={styles.topGroupLabel}>Project</span>
            <div className={styles.topGroupButtons}>
              <button
                className={styles.topButton}
                type="button"
                onClick={() => projectInputRef.current?.click()}
                title="Open Glyphrame project"
              >
                <Icon name="upload" size={13} />
                <span>Open</span>
              </button>
              <button
                className={styles.topButton}
                type="button"
                onClick={handleSaveProject}
                title="Save Glyphrame project"
              >
                <Icon name="download" size={13} />
                <span>Save</span>
              </button>
            </div>
          </div>
          <div className={styles.topGroup}>
            <span className={styles.topGroupLabel}>Source</span>
            <div className={styles.topGroupButtons}>
              <button
                className={styles.topButton}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Import source image"
              >
                <Icon name="image" size={13} />
                <span>Image</span>
              </button>
            </div>
          </div>
          <div className={styles.topGroup}>
            <span className={styles.topGroupLabel}>Output</span>
            <div className={styles.topGroupButtons}>
              <button
                className={styles.topButton}
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport(true)}
                title="Copy PNG to clipboard"
              >
                <Icon name="copy" size={13} />
                <span>Copy PNG</span>
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport(false)}
                title="Download image"
              >
                <Icon name="download" size={13} />
                <span>{isExporting ? 'Exporting…' : 'Download'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className={styles.workspace}>
        <aside className={styles.leftRail}>
          <div className={styles.railHeader}>
            <span>Style</span>
            <span className={styles.railMeta}>Quick preset</span>
          </div>
          <div className={styles.presetList}>
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  preset.id === activeCard.themeId
                    ? `${styles.presetCard} ${styles.presetCardActive}`
                    : styles.presetCard
                }
                onClick={() => applyStylePreset(preset)}
              >
                <span
                  className={styles.presetSwatch}
                  style={{
                    background: `linear-gradient(135deg, ${preset.background.palette.background}, ${preset.background.palette.accent})`
                  }}
                />
                <span className={styles.presetLabel}>
                  <strong>{preset.label}</strong>
                  <small>{preset.hint}</small>
                </span>
              </button>
            ))}
          </div>

          <div className={styles.railFooter}>
            {activeAsset ? (
              <>
                <span className={styles.footerTitle}>{activeAsset.name}</span>
                <span className={styles.footerMeta}>
                  {activeAsset.width} × {activeAsset.height}
                  {activeAsset.fileSize ? ` · ${formatBytes(activeAsset.fileSize)}` : ''}
                </span>
              </>
            ) : (
              <span className={styles.footerMeta}>
                Drop a screenshot or paste from clipboard
              </span>
            )}
          </div>
        </aside>

        <section className={styles.stageWrap}>
          <div className={styles.stageToolbar}>
            <div>
              <div className={styles.stageKicker}>Active card</div>
              <div className={styles.stageTitle}>{activeCard.name}</div>
            </div>
            <div className={styles.statusPill}>
              <span className={styles.statusDot} />
              <span>{status}</span>
            </div>
          </div>
          <CardCanvas
            card={activeCard}
            target={activeTarget}
            asset={activeAsset}
            onChooseSource={() => fileInputRef.current?.click()}
          />
        </section>

        <InspectorPanel
          card={activeCard}
          targets={project.targets}
          onSurfaceSizeChange={updateActiveSurfaceSize}
          onSurfaceAspectRatioChange={updateActiveSurfaceAspectRatio}
          onBackgroundPresetChange={(presetId) =>
            updateActiveCard({
              background: {
                ...activeCard.background,
                presetId,
                params: getBackgroundPresetDefaultParams(presetId)
              }
            })
          }
          onBackgroundRandomize={() => {
            updateActiveCard({
              background: {
                ...activeCard.background,
                seed: createBackgroundSeed(activeCard.background.presetId)
              }
            });
            setStatus('Background randomized');
          }}
          onBackgroundParamChange={(paramId, value) =>
            updateActiveCard({
              background: {
                ...activeCard.background,
                params: {
                  ...activeCard.background.params,
                  [paramId]: value
                }
              }
            })
          }
          onPaletteChange={(patch) => {
            const nextPalette: GlyphramePalette = {
              ...activeCard.background.palette,
              ...patch
            };
            updateActiveCard({
              background: { ...activeCard.background, palette: nextPalette }
            });
          }}
          onFramePresetChange={(preset: GlyphrameFramePreset) =>
            updateActiveCard({
              frame: {
                ...activeCard.frame,
                preset,
                boxStyle: activeCard.frame.boxStyle ?? resolveFrameBoxStyle(activeCard.frame)
              }
            })
          }
          onFrameBoxStyleChange={(boxStyle: GlyphrameFrameBoxStyle) =>
            updateActiveCard({
              frame: {
                ...activeCard.frame,
                preset:
                  activeCard.frame.preset === 'soft-panel' ||
                  activeCard.frame.preset === 'glass-panel'
                    ? 'none'
                    : activeCard.frame.preset,
                boxStyle,
                contentPadding: resolveFrameContentPaddingForBoxStyle(
                  boxStyle,
                  activeCard.frame.contentPadding
                )
              }
            })
          }
          onFrameMaterialChange={(patch) =>
            updateActiveCard({ frame: { ...activeCard.frame, ...patch } })
          }
          onFrameChromeTextChange={(chromeText) =>
            updateActiveCard({ frame: { ...activeCard.frame, chromeText } })
          }
          onPaddingChange={(padding) =>
            updateActiveCard({ frame: { ...activeCard.frame, padding } })
          }
          onFrameContentPaddingChange={(contentPadding) =>
            updateActiveCard({ frame: { ...activeCard.frame, contentPadding } })
          }
          onRadiusChange={(cornerRadius) =>
            updateActiveCard({ frame: { ...activeCard.frame, cornerRadius } })
          }
          onFrameShadowChange={(patch) =>
            updateActiveCard({ frame: { ...activeCard.frame, ...patch } })
          }
          onTextChange={(patch) =>
            updateActiveCard({ text: { ...activeCard.text, ...patch } })
          }
          onExportFormatChange={(format) =>
            updateActiveCard({
              export: { ...activeCard.export, format }
            })
          }
          onExportScaleChange={(scale) =>
            updateActiveCard({ export: { ...activeCard.export, scale } })
          }
          onExportQualityChange={(quality) =>
            updateActiveCard({ export: { ...activeCard.export, quality } })
          }
        />
      </main>

      {isDragging ? (
        <div className={styles.dropOverlay}>
          <div className={styles.dropTarget}>
            <Icon name="upload" size={28} />
            <span>Drop screenshot</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
