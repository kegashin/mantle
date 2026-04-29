import { exportMantleProjectCard } from '@mantle/engine/commands';
import { resolveFrameBoxStyle } from '@mantle/engine/catalog';
import {
  type MantleBackground,
  type MantleCard,
  type MantleExportFormat,
  type MantleFrame,
  type MantleFrameBoxStyle,
  type MantleFramePreset,
  type MantleRuntimeProject as RuntimeMantleProject,
  type MantleSurfaceAspectRatioPreset,
  type MantleSurfaceTarget
} from '@mantle/schemas/model';
import {
  DEFAULT_MANTLE_TARGETS,
  createMantleProject
} from '@mantle/schemas/defaults';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../components/Icon';
import { InspectorPanel } from '../features/inspector/InspectorPanel';
import { CardCanvas } from '../features/stage/CardCanvas';
import { syncGradientColorsWithPalette } from '../lib/backgroundColors';
import { downloadBlob } from '../lib/downloadBlob';
import {
  resolveFrameContentPaddingForBoxStyle,
  resolveGlassFrameMaterial
} from '../lib/frameMaterial';
import styles from './App.module.css';
import {
  parseProjectFile,
  safeFileName,
  serializeProjectForSave
} from './projectPersistence';
import {
  createAssetFromFile,
  fileBaseName,
  formatBytes,
  hasRenderableAssetSource,
  readImageDimensions,
  revokeRuntimeObjectUrl
} from './runtimeAssets';
import {
  IMAGE_BACKGROUND_STYLE_ID,
  STYLE_GROUPS,
  STYLE_PRESETS,
  cloneBackground,
  cloneFrame,
  cloneText,
  createBackgroundForPreset,
  createBackgroundSeed,
  resetBackgroundColors,
  stylePresetToTheme,
  type StylePreset,
  updateBackgroundParam,
  upsertTheme
} from './stylePresets';
import {
  MAX_SURFACE_DIMENSION,
  fitSurfaceSizeToRatio,
  normalizeSurfaceDimension,
  upsertCustomTargetForActiveCard
} from './surfaceSizing';

const ACCEPTED_INPUT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
const ACCEPTED_PROJECT = '.mantle.json,application/json';
const SUPPORTED_INPUT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp'
]);
const SUPPORTED_INPUT_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;
const SUPPORTED_INPUT_FORMAT_HINT = 'PNG, JPG, or WebP';

type AppNoticeTone = 'success' | 'info' | 'warning' | 'error';

type AppNotice = {
  id: number;
  tone: AppNoticeTone;
  title: string;
  detail?: string | undefined;
};

type AppFailure = Readonly<{
  message: string;
}>;

type ExportSettingsMode = 'copy' | 'download';
type ExportSliderFillStyle = CSSProperties & Record<'--export-slider-fill', string>;

type StyleRailItem =
  | (StylePreset & { kind: 'preset' })
  | {
      id: typeof IMAGE_BACKGROUND_STYLE_ID;
      label: string;
      hint: string;
      kind: 'image';
    };

type ImageImportIntent =
  | { mode: 'auto' }
  | { mode: 'source-new' }
  | { mode: 'source-relink'; assetId: string }
  | { mode: 'background-new' }
  | { mode: 'background-relink'; assetId: string };

function isAppFailure(error: unknown): error is AppFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function toAppFailure(error: unknown, fallback = 'Unknown error.'): AppFailure {
  return isAppFailure(error) ? error : new Error(fallback);
}

function errorDetail(error: AppFailure): string {
  return error.message || 'Unknown error.';
}

function canWriteClipboardImage(): boolean {
  return 'ClipboardItem' in window && Boolean(navigator.clipboard?.write);
}

const EXPORT_FORMAT_OPTIONS: Array<{ value: MantleExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' }
];

function decimalPlaces(value: number): number {
  const text = String(value);
  if (!text.includes('.')) return 0;
  return text.split('.')[1]?.length ?? 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapNumericValue(value: number, min: number, max: number, step: number): number {
  const clamped = clampNumber(value, min, max);
  if (step <= 0) return clamped;

  const snapped = Math.round((clamped - min) / step) * step + min;
  const precision = Math.max(decimalPlaces(step), decimalPlaces(min), decimalPlaces(max)) + 2;
  return clampNumber(Number(snapped.toFixed(precision)), min, max);
}

function formatNumericDraft(value: number, displayScale: number): string {
  const scaled = value * displayScale;
  if (Number.isInteger(scaled)) return String(scaled);
  return String(Number(scaled.toFixed(2)));
}

function ExportSlider({
  label,
  min,
  max,
  step,
  value,
  displayScale = 1,
  suffix = '',
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  displayScale?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatNumericDraft(value, displayScale));
  const span = max - min;
  const fillPercent = span > 0 ? clampNumber((value - min) / span, 0, 1) * 100 : 0;
  const fillStyle: ExportSliderFillStyle = {
    '--export-slider-fill': `${fillPercent}%`
  };

  useEffect(() => {
    setDraft(formatNumericDraft(value, displayScale));
  }, [displayScale, value]);

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      onChange(snapNumericValue(parsed / displayScale, min, max, step));
    } else {
      setDraft(formatNumericDraft(value, displayScale));
    }
  };

  return (
    <label className={styles.exportSlider}>
      <span className={styles.exportControlHead}>
        <span>{label}</span>
        <span className={styles.exportValueControl}>
          <input
            aria-label={`${label} value`}
            inputMode="decimal"
            max={max * displayScale}
            min={min * displayScale}
            step={step * displayScale}
            type="number"
            value={draft}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setDraft(formatNumericDraft(value, displayScale));
                event.currentTarget.blur();
              }
            }}
          />
          {suffix ? <span>{suffix}</span> : null}
        </span>
      </span>
      <input
        aria-label={label}
        className={styles.exportSliderInput}
        max={max}
        min={min}
        step={step}
        style={fillStyle}
        type="range"
        value={value}
        onChange={(event) =>
          onChange(snapNumericValue(Number(event.currentTarget.value), min, max, step))
        }
      />
    </label>
  );
}

function isMissingRenderableSource(
  card: MantleCard,
  asset: RuntimeMantleProject['assets'][number] | undefined
): boolean {
  return Boolean(card.sourceAssetId) && !hasRenderableAssetSource(asset);
}

function isMissingRenderableBackground(
  background: MantleBackground,
  asset: RuntimeMantleProject['assets'][number] | undefined
): boolean {
  return Boolean(background.imageAssetId) && !hasRenderableAssetSource(asset);
}

function isSupportedSourceImage(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  return (
    SUPPORTED_INPUT_MIME_TYPES.has(mimeType) ||
    (mimeType === '' && SUPPORTED_INPUT_EXTENSION_PATTERN.test(file.name))
  );
}

function importFailureNotice(
  file: File,
  error?: AppFailure | undefined
): Omit<AppNotice, 'id'> {
  if (!isSupportedSourceImage(file)) {
    return {
      tone: 'error',
      title: 'Unsupported file',
      detail: `Import a static ${SUPPORTED_INPUT_FORMAT_HINT} image.`
    };
  }

  return {
    tone: 'error',
    title: 'Image could not be imported',
    detail: error ? errorDetail(error) : 'Unknown error.'
  };
}

function relinkMissingAssetNotice(kind: 'source' | 'background'): Omit<AppNotice, 'id'> {
  return {
    tone: 'warning',
    title: kind === 'background' ? 'Reimport background image' : 'Reimport source image',
    detail:
      kind === 'background'
        ? 'Saved projects keep image metadata only. Relink the local background image before exporting.'
        : 'Saved projects keep image metadata only. Relink the local screenshot to render or export this card.'
  };
}

function projectLoadFailureNotice(error: AppFailure): Omit<AppNotice, 'id'> {
  return {
    tone: 'error',
    title: 'Project file could not be opened',
    detail: errorDetail(error)
  };
}

function exportFailureNotice(
  error: AppFailure,
  format: MantleExportFormat,
  copyToClipboard: boolean
): Omit<AppNotice, 'id'> {
  const detail = errorDetail(error);

  if (copyToClipboard && /clipboard|permission|denied|not allowed/i.test(detail)) {
    return {
      tone: 'error',
      title: 'Clipboard unavailable',
      detail: 'The browser blocked image clipboard access. Use Download instead.'
    };
  }

  if (/not supported by this browser/i.test(detail)) {
    return {
      tone: 'error',
      title: `${format.toUpperCase()} unsupported`,
      detail: 'Choose PNG or JPEG for this browser.'
    };
  }

  if (/too large|working canvas memory|lower export scale|keep exports under/i.test(detail)) {
    return {
      tone: 'error',
      title: 'Export too large',
      detail
    };
  }

  if (/could not load image asset|image decoding|could not decode image/i.test(detail)) {
    return {
      tone: 'warning',
      title: 'Reimport source image',
      detail: 'Saved projects keep image metadata only. Relink the local screenshot before exporting.'
    };
  }

  if (/could not load background image asset/i.test(detail)) {
    return {
      tone: 'warning',
      title: 'Reimport background image',
      detail: 'Saved projects keep image metadata only. Relink the local background image before exporting.'
    };
  }

  return {
    tone: 'error',
    title: 'Export failed',
    detail
  };
}

export function App() {
  const [project, setProject] = useState<RuntimeMantleProject>(() => ({
    ...createMantleProject({
      name: 'Mantle Draft',
      brandName: 'Mantle'
    })
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false);
  const [exportSettingsMode, setExportSettingsMode] =
    useState<ExportSettingsMode>('download');
  const [exportPopoverPosition, setExportPopoverPosition] = useState<{
    top: number;
    right: number;
  }>({ top: 56, right: 18 });
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportPopoverRef = useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | null>(null);
  const imageImportIntentRef = useRef<ImageImportIntent>({ mode: 'auto' });

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current == null) return;
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
  }, []);

  const showNotice = useCallback(
    (nextNotice: Omit<AppNotice, 'id'>) => {
      clearNoticeTimer();
      const id = Date.now();
      setNotice({ id, ...nextNotice });

      if (nextNotice.tone === 'success' || nextNotice.tone === 'info') {
        noticeTimerRef.current = window.setTimeout(() => {
          setNotice((current) => (current?.id === id ? null : current));
          noticeTimerRef.current = null;
        }, 3600);
      }
    },
    [clearNoticeTimer]
  );

  const registerObjectUrl = useCallback((url: string) => {
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeObjectUrl = useCallback((url: string) => {
    revokeRuntimeObjectUrl(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const revokeProjectObjectUrls = useCallback(
    (targetProject: RuntimeMantleProject) => {
      targetProject.assets.forEach((asset) => {
        if (asset.objectUrl) revokeObjectUrl(asset.objectUrl);
      });
    },
    [revokeObjectUrl]
  );

  useEffect(() => {
    return () => {
      clearNoticeTimer();
      objectUrlsRef.current.forEach((url) => {
        revokeRuntimeObjectUrl(url);
      });
      objectUrlsRef.current.clear();
    };
  }, [clearNoticeTimer]);

  useEffect(() => {
    if (!exportSettingsOpen) return;

    // Anchor the popover to the right edge of the export menu cluster so it
    // visually belongs to the trigger buttons instead of floating in a fixed
    // top-right slot. Re-runs on resize / scroll to track the trigger.
    const updatePosition = () => {
      const menu = exportMenuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      setExportPopoverPosition({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right)
      });
    };

    updatePosition();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportSettingsOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !exportMenuRef.current?.contains(target) &&
        !exportPopoverRef.current?.contains(target)
      ) {
        setExportSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [exportSettingsOpen]);

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
      DEFAULT_MANTLE_TARGETS[0]!,
    [activeCard?.targetId, project.targets]
  );
  const activeAsset = useMemo(
    () =>
      activeCard?.sourceAssetId
        ? project.assets.find((asset) => asset.id === activeCard.sourceAssetId)
        : undefined,
    [activeCard?.sourceAssetId, project.assets]
  );
  const activeBackgroundAsset = useMemo(
    () =>
      activeCard?.background.imageAssetId
        ? project.assets.find(
            (asset) => asset.id === activeCard.background.imageAssetId
          )
        : undefined,
    [activeCard?.background.imageAssetId, project.assets]
  );
  const activeMissingSourceAssetId =
    activeCard?.sourceAssetId && !hasRenderableAssetSource(activeAsset)
      ? activeCard.sourceAssetId
      : undefined;
  const activeMissingBackgroundAssetId =
    activeCard?.background.imageAssetId &&
    !hasRenderableAssetSource(activeBackgroundAsset)
      ? activeCard.background.imageAssetId
      : undefined;
  const activeSourceMissing = activeMissingSourceAssetId != null;

  const openExportSettings = useCallback((mode: ExportSettingsMode) => {
    setExportSettingsMode(mode);
    setExportSettingsOpen(true);
  }, []);

  const openImagePicker = useCallback((intent: ImageImportIntent = { mode: 'auto' }) => {
    imageImportIntentRef.current = intent;
    fileInputRef.current?.click();
  }, []);

  const openRelinkSourcePicker = useCallback(() => {
    if (!activeMissingSourceAssetId) {
      openImagePicker({ mode: 'source-new' });
      return;
    }

    openImagePicker({
      mode: 'source-relink',
      assetId: activeMissingSourceAssetId
    });
  }, [activeMissingSourceAssetId, openImagePicker]);

  const openRelinkBackgroundPicker = useCallback(() => {
    if (!activeMissingBackgroundAssetId) {
      openImagePicker({ mode: 'background-new' });
      return;
    }

    openImagePicker({
      mode: 'background-relink',
      assetId: activeMissingBackgroundAssetId
    });
  }, [activeMissingBackgroundAssetId, openImagePicker]);

  const resolveImageImportIntent = useCallback(
    (intent: ImageImportIntent): ImageImportIntent => {
      if (intent.mode === 'source-relink' || intent.mode === 'background-relink') {
        return intent;
      }
      if (intent.mode === 'auto' && activeMissingSourceAssetId) {
        return {
          mode: 'source-relink',
          assetId: activeMissingSourceAssetId
        };
      }
      if (intent.mode === 'auto' && activeMissingBackgroundAssetId) {
        return {
          mode: 'background-relink',
          assetId: activeMissingBackgroundAssetId
        };
      }
      return intent.mode === 'background-new'
        ? { mode: 'background-new' }
        : { mode: 'source-new' };
    },
    [activeMissingBackgroundAssetId, activeMissingSourceAssetId]
  );

  const updateActiveCard = useCallback((patch: Partial<MantleCard>) => {
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
      patch: Partial<Pick<MantleSurfaceTarget, 'width' | 'height'>>,
      options?: {
        ratio?: number;
        anchor?: 'width' | 'height';
        aspectRatioPresetId?: MantleSurfaceAspectRatioPreset;
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
    (aspectRatioPresetId: MantleSurfaceAspectRatioPreset, ratio?: number) => {
      setProject((current) => {
        const card = current.cards.find((item) => item.id === current.activeCardId);
        if (!card) return current;
        const baseTarget =
          current.targets.find((target) => target.id === card.targetId) ??
          current.targets[0] ??
          DEFAULT_MANTLE_TARGETS[0]!;

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
    },
    []
  );

  const importFile = useCallback(
    async (file: File, intent: ImageImportIntent = { mode: 'auto' }) => {
      if (!isSupportedSourceImage(file)) {
        showNotice(importFailureNotice(file));
        return;
      }

      const objectUrl = registerObjectUrl(URL.createObjectURL(file));
      const resolvedIntent = resolveImageImportIntent(intent);
      try {
        const dimensions = await readImageDimensions(objectUrl);

        if (
          resolvedIntent.mode === 'source-relink' ||
          resolvedIntent.mode === 'background-relink'
        ) {
          const currentAsset = project.assets.find(
            (asset) => asset.id === resolvedIntent.assetId
          );
          if (!currentAsset) {
            revokeObjectUrl(objectUrl);
            showNotice({
              tone: 'error',
              title: 'Source asset not found',
              detail: 'This project points to an image record that no longer exists.'
            });
            return;
          }

          if (currentAsset.objectUrl && currentAsset.objectUrl !== objectUrl) {
            revokeObjectUrl(currentAsset.objectUrl);
          }

          setProject((current) => ({
            ...current,
            updatedAt: new Date().toISOString(),
            assets: current.assets.map((asset) =>
              asset.id === resolvedIntent.assetId
                ? {
                    ...asset,
                    name: file.name,
                    mimeType: file.type || asset.mimeType,
                    width: dimensions.width,
                    height: dimensions.height,
                    fileSize: file.size,
                    objectUrl
                  }
                : asset
            )
          }));
          showNotice({
            tone: 'success',
            title:
              resolvedIntent.mode === 'background-relink'
                ? 'Background relinked'
                : 'Image relinked',
            detail:
              resolvedIntent.mode === 'background-relink'
                ? `${file.name} is attached as the background again.`
                : `${file.name} is attached to this card again.`
          });
          return;
        }

        const asset = createAssetFromFile(
          file,
          objectUrl,
          dimensions,
          resolvedIntent.mode === 'background-new' ? 'background' : 'screenshot'
        );
        setProject((current) => ({
          ...current,
          updatedAt: new Date().toISOString(),
          assets: [...current.assets, asset],
          cards: current.cards.map((item) =>
            item.id === current.activeCardId
              ? resolvedIntent.mode === 'background-new'
                ? {
                    ...item,
                    background: {
                      ...item.background,
                      family: 'image',
                      presetId: 'image-fill',
                      seed: createBackgroundSeed('image-fill'),
                      intensity: 1,
                      params: {},
                      colors: undefined,
                      imageAssetId: asset.id
                    }
                  }
                : {
                    ...item,
                    name: fileBaseName(file.name),
                    sourceAssetId: asset.id
                  }
              : item
          )
        }));
        showNotice({
          tone: 'success',
          title:
            resolvedIntent.mode === 'background-new'
              ? 'Background imported'
              : 'Image imported',
          detail:
            resolvedIntent.mode === 'background-new'
              ? `${file.name} is now the canvas background.`
              : `${file.name} is ready to render.`
        });
      } catch (error) {
        revokeObjectUrl(objectUrl);
        showNotice(importFailureNotice(file, toAppFailure(error)));
      }
    },
    [project.assets, registerObjectUrl, resolveImageImportIntent, revokeObjectUrl, showNotice]
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        isSupportedSourceImage(item)
      );
      if (file) void importFile(file, { mode: 'auto' });
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importFile]);

  const applyStylePreset = (preset: StylePreset) => {
    const theme = stylePresetToTheme(preset);
    setProject((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      themes: upsertTheme(current.themes, theme),
      cards: current.cards.map((card) =>
        card.id === current.activeCardId
          ? {
              ...card,
              themeId: preset.id,
              background: cloneBackground(preset.background),
              frame: cloneFrame(preset.frame),
              text: cloneText(preset.text)
            }
          : card
      )
    }));
  };

  const handleSaveProject = () => {
    try {
      const nextRuntimeProject: RuntimeMantleProject = {
        ...project,
        updatedAt: new Date().toISOString()
      };
      const nextProject = serializeProjectForSave(nextRuntimeProject);
      setProject(nextRuntimeProject);
      downloadBlob({
        blob: new Blob([JSON.stringify(nextProject, null, 2)], {
          type: 'application/json;charset=utf-8'
        }),
        filename: `${safeFileName(nextProject.name)}.mantle.json`,
        mimeType: 'application/json'
      });
      showNotice({
        tone: 'success',
        title: 'Project saved',
        detail: `${safeFileName(nextProject.name)}.mantle.json`
      });
    } catch (error) {
      showNotice({
        tone: 'error',
        title: 'Project could not be saved',
        detail: errorDetail(toAppFailure(error))
      });
    }
  };

  const handleLoadProject = async (file: File) => {
    try {
      const loadedProject = await parseProjectFile(file);
      const runtimeProject: RuntimeMantleProject = loadedProject;
      revokeProjectObjectUrls(project);
      setProject(runtimeProject);
      const activeCard = runtimeProject.cards.find(
        (card) => card.id === runtimeProject.activeCardId
      );
      const activeAsset = activeCard?.sourceAssetId
        ? runtimeProject.assets.find((asset) => asset.id === activeCard.sourceAssetId)
        : undefined;
      const activeBackgroundAsset = activeCard?.background.imageAssetId
        ? runtimeProject.assets.find(
            (asset) => asset.id === activeCard.background.imageAssetId
          )
        : undefined;
      if (activeCard?.sourceAssetId && !hasRenderableAssetSource(activeAsset)) {
        showNotice(relinkMissingAssetNotice('source'));
      } else if (
        activeCard?.background.imageAssetId &&
        !hasRenderableAssetSource(activeBackgroundAsset)
      ) {
        showNotice(relinkMissingAssetNotice('background'));
      } else {
        showNotice({
          tone: 'success',
          title: 'Project opened',
          detail: loadedProject.name
        });
      }
    } catch (error) {
      showNotice(projectLoadFailureNotice(toAppFailure(error)));
    }
  };

  const handleExport = async (copyToClipboard = false) => {
    if (!activeCard || !activeTarget) {
      return;
    }

    if (copyToClipboard && !canWriteClipboardImage()) {
      showNotice({
        tone: 'error',
        title: 'Clipboard unavailable',
        detail: 'This browser cannot write images to the clipboard. Use Download instead.'
      });
      return;
    }

    if (isMissingRenderableSource(activeCard, activeAsset)) {
      showNotice({
        tone: 'warning',
        title: 'Reimport source image',
        detail: 'Saved projects keep image metadata only. Relink the local screenshot before exporting.'
      });
      return;
    }

    if (isMissingRenderableBackground(activeCard.background, activeBackgroundAsset)) {
      showNotice({
        tone: 'warning',
        title: 'Reimport background image',
        detail: 'Saved projects keep image metadata only. Relink the local background image before exporting.'
      });
      return;
    }

    setIsExporting(true);
    const exportFormat: MantleExportFormat = copyToClipboard
      ? 'png'
      : activeCard.export.format;
    try {
      const cardForExport: MantleCard = {
        ...activeCard,
        export: {
          ...activeCard.export,
          format: exportFormat,
          ...(copyToClipboard ? { quality: undefined } : {})
        }
      };
      const projectForExport: RuntimeMantleProject = {
        ...project,
        cards: project.cards.map((card) =>
          card.id === cardForExport.id ? cardForExport : card
        )
      };

      if (copyToClipboard) {
        const clipboardMimeType = 'image/png';
        const clipboardBlob = exportMantleProjectCard({
          project: projectForExport,
          cardId: cardForExport.id
        }).then((result) => result.blob);

        await navigator.clipboard.write([
          new ClipboardItem({ [clipboardMimeType]: clipboardBlob })
        ]);
        showNotice({
          tone: 'success',
          title: 'Copied PNG',
          detail: 'The rendered image is in your clipboard.'
        });
        return;
      }

      const result = await exportMantleProjectCard({
        project: projectForExport,
        cardId: cardForExport.id
      });

      downloadBlob(result);
      showNotice({
        tone: 'success',
        title: 'Export ready',
        detail: `${result.filename} downloaded.`
      });
    } catch (error) {
      showNotice(
        exportFailureNotice(toAppFailure(error), exportFormat, copyToClipboard)
      );
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

  const updateActiveBackground = (patch: Partial<MantleBackground>) => {
    updateActiveCard({
      background: { ...activeCard.background, ...patch }
    });
  };

  const clearActiveBackgroundImage = () => {
    updateActiveCard({
      background: createBackgroundForPreset(activeCard.background, 'marbling')
    });
  };

  const updateActiveFrame = (patch: Partial<MantleFrame>) => {
    updateActiveCard({
      frame: { ...activeCard.frame, ...patch }
    });
  };

  const updateActiveText = (patch: Partial<MantleCard['text']>) => {
    updateActiveCard({
      text: { ...activeCard.text, ...patch }
    });
  };

  const updateActiveExport = (patch: Partial<MantleCard['export']>) => {
    updateActiveCard({
      export: { ...activeCard.export, ...patch }
    });
  };
  const exportWidth = activeTarget.width * activeCard.export.scale;
  const exportHeight = activeTarget.height * activeCard.export.scale;
  const showExportQuality = activeCard.export.format !== 'png';
  const exportFileNamePlaceholder = activeAsset?.name
    ? fileBaseName(activeAsset.name)
    : activeCard.name;

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
        if (file) void importFile(file, { mode: 'auto' });
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
          const intent = imageImportIntentRef.current;
          imageImportIntentRef.current = { mode: 'auto' };
          if (file) void importFile(file, intent);
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
          <span className={styles.brandMark} aria-hidden="true">M</span>
          <span className={styles.brandWord}>
            <span>MANTLE</span>
            <span className={styles.brandTag}>v0</span>
          </span>
        </div>

        <div className={styles.topActions}>
          <div className={styles.toolGroup}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => projectInputRef.current?.click()}
              title="Open Mantle project"
            >
              <Icon name="upload" size={14} aria-hidden="true" />
              <span>Open</span>
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleSaveProject}
              title="Save Mantle project"
            >
              <Icon name="download" size={14} aria-hidden="true" />
              <span>Save</span>
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => openImagePicker({ mode: 'source-new' })}
              title="Import source image"
            >
              <Icon name="image" size={14} aria-hidden="true" />
              <span>Image</span>
            </button>
          </div>

          <div className={styles.exportMenu} ref={exportMenuRef}>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={isExporting}
              onClick={() => openExportSettings('copy')}
              title="Copy PNG to clipboard"
            >
              <Icon name="copy" size={14} aria-hidden="true" />
              <span>Copy PNG</span>
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isExporting}
              onClick={() => openExportSettings('download')}
              title="Download image"
            >
              <Icon name="download" size={14} aria-hidden="true" />
              <span>{isExporting ? 'Exporting…' : 'Download'}</span>
            </button>

            {exportSettingsOpen ? createPortal(
              <div
                ref={exportPopoverRef}
                className={styles.exportPopover}
                role="dialog"
                aria-label={
                  exportSettingsMode === 'copy'
                    ? 'Copy PNG settings'
                    : 'Download settings'
                }
                style={{
                  top: `${exportPopoverPosition.top}px`,
                  right: `${exportPopoverPosition.right}px`
                }}
              >
                <div className={styles.exportPopoverHeader}>
                  <div>
                    <span className={styles.exportPopoverTitle}>
                      {exportSettingsMode === 'copy' ? 'Copy PNG' : 'Download'}
                    </span>
                    <span className={styles.exportPopoverHint}>
                      {exportSettingsMode === 'copy'
                        ? 'Clipboard uses PNG. Scale controls copied resolution.'
                        : 'Choose file name, format, and quality.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.exportCloseButton}
                    onClick={() => setExportSettingsOpen(false)}
                    title="Close export settings"
                  >
                    <Icon name="close" size={13} aria-hidden="true" />
                  </button>
                </div>

                {exportSettingsMode === 'download' ? (
                  <>
                    <label className={styles.exportTextField}>
                      <span>Filename</span>
                      <input
                        value={activeCard.export.fileName ?? ''}
                        placeholder={exportFileNamePlaceholder}
                        onChange={(event) => {
                          const fileName = event.currentTarget.value;
                          updateActiveExport({
                            fileName: fileName.trim() ? fileName : undefined
                          });
                        }}
                      />
                    </label>

                    <div
                      className={styles.exportSegmented}
                      role="group"
                      aria-label="Export format"
                    >
                      {EXPORT_FORMAT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={
                            activeCard.export.format === option.value
                              ? `${styles.exportSegmentedOption} ${styles.exportSegmentedOptionActive}`
                              : styles.exportSegmentedOption
                          }
                          onClick={() => updateActiveExport({ format: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                <ExportSlider
                  label="Scale"
                  min={1}
                  max={5}
                  step={1}
                  value={activeCard.export.scale}
                  suffix="×"
                  onChange={(scale) => updateActiveExport({ scale })}
                />

                <div className={styles.exportSummary}>
                  <span>Output size</span>
                  <strong>{exportWidth} × {exportHeight}</strong>
                </div>

                {exportSettingsMode === 'download' && showExportQuality ? (
                  <ExportSlider
                    label="Quality"
                    min={0.5}
                    max={1}
                    step={0.02}
                    value={activeCard.export.quality ?? 0.92}
                    displayScale={100}
                    suffix="%"
                    onChange={(quality) => updateActiveExport({ quality })}
                  />
                ) : null}

                <div className={styles.exportPopoverActions}>
                  {exportSettingsMode === 'copy' ? (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isExporting}
                      onClick={() => {
                        setExportSettingsOpen(false);
                        void handleExport(true);
                      }}
                    >
                      <Icon name="copy" size={14} aria-hidden="true" />
                      <span>Copy PNG</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isExporting}
                      onClick={() => {
                        setExportSettingsOpen(false);
                        void handleExport(false);
                      }}
                    >
                      <Icon name="download" size={14} aria-hidden="true" />
                      <span>{isExporting ? 'Exporting…' : 'Download'}</span>
                    </button>
                  )}
                </div>
              </div>,
              document.body
            ) : null}
          </div>
        </div>
      </header>

      <main className={styles.workspace}>
        <aside className={styles.leftRail}>
          <div className={styles.railHeader}>
            <span className={styles.railTitle}>Style</span>
            <span className={styles.railHint}>Quick preset</span>
          </div>
          <div className={styles.presetList}>
            {STYLE_GROUPS.map((group) => {
              const items = group.presetIds
                .map((id) => {
                  if (id === IMAGE_BACKGROUND_STYLE_ID) {
                    return {
                      id,
                      label: 'Image Background',
                      hint: 'Use your own background image',
                      kind: 'image' as const
                    };
                  }

                  const preset = STYLE_PRESETS.find((item) => item.id === id);
                  return preset ? { ...preset, kind: 'preset' as const } : undefined;
                })
                .filter((item): item is StyleRailItem => item !== undefined);
              if (items.length === 0) return null;

              return (
                <div key={group.label} className={styles.presetGroup}>
                  <div className={styles.presetGroupHeader}>
                    <span>{group.label}</span>
                    <span className={styles.presetGroupCount}>{items.length}</span>
                  </div>
                  <div className={styles.presetGroupGrid}>
                    {items.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={
                          (preset.kind === 'image'
                            ? activeCard.background.presetId === 'image-fill'
                            : preset.id === activeCard.themeId)
                            ? `${styles.presetCard} ${styles.presetCardActive}`
                            : styles.presetCard
                        }
                        onClick={() => {
                          if (preset.kind === 'image') {
                            openImagePicker({ mode: 'background-new' });
                            return;
                          }

                          applyStylePreset(preset);
                        }}
                      >
                        <span className={styles.presetLabel}>
                          <span className={styles.presetName}>{preset.label}</span>
                          <span className={styles.presetHint}>{preset.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.railFooter}>
            {activeSourceMissing ? (
              <>
                <span className={styles.footerKicker}>Source missing</span>
                <span className={styles.footerTitle}>
                  {activeAsset?.name ?? 'Saved source image'}
                </span>
                <span className={styles.footerMeta}>
                  Project files store image metadata only.
                </span>
                <button
                  type="button"
                  className={styles.footerAction}
                  onClick={openRelinkSourcePicker}
                >
                  <Icon name="image" size={13} aria-hidden="true" />
                  <span>Relink image</span>
                </button>
              </>
            ) : activeAsset ? (
              <>
                <span className={styles.footerKicker}>Source</span>
                <span className={styles.footerTitle}>{activeAsset.name}</span>
                <span className={styles.footerMeta}>
                  {activeAsset.width} × {activeAsset.height}
                  {activeAsset.fileSize ? ` · ${formatBytes(activeAsset.fileSize)}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className={styles.footerKicker}>Source</span>
                <span className={styles.footerMeta}>
                  Drop an image, paste from clipboard or use the Image button
                </span>
              </>
            )}
          </div>
        </aside>

        <section className={styles.stageWrap}>
          <div className={styles.stageMeta}>
            <span className={styles.stageMetaName}>{activeCard.name}</span>
            <span className={styles.stageMetaDot} />
            <span className={styles.stageMetaSize}>
              {activeTarget.width} × {activeTarget.height}
            </span>
          </div>
          <CardCanvas
            card={activeCard}
            target={activeTarget}
            asset={activeAsset}
            backgroundAsset={activeBackgroundAsset}
            onChooseSource={() => openImagePicker({ mode: 'source-new' })}
            onRelinkSource={openRelinkSourcePicker}
          />
        </section>

        <InspectorPanel
          card={activeCard}
          backgroundAsset={activeBackgroundAsset}
          targets={project.targets}
          onSurfaceSizeChange={updateActiveSurfaceSize}
          onSurfaceAspectRatioChange={updateActiveSurfaceAspectRatio}
          onBackgroundPresetChange={(presetId) =>
            updateActiveBackground(createBackgroundForPreset(activeCard.background, presetId))
          }
          onBackgroundRandomize={() => {
            updateActiveBackground({
              seed: createBackgroundSeed(activeCard.background.presetId)
            });
          }}
          onBackgroundColorsReset={() => {
            updateActiveBackground(resetBackgroundColors(activeCard.background));
          }}
          onBackgroundParamChange={(paramId, value) =>
            updateActiveBackground(
              updateBackgroundParam(activeCard.background, paramId, value)
            )
          }
          onBackgroundColorsChange={(colors) =>
            updateActiveBackground(
              syncGradientColorsWithPalette(activeCard.background, colors)
            )
          }
          onBackgroundImageChoose={() => openImagePicker({ mode: 'background-new' })}
          onBackgroundImageRelink={openRelinkBackgroundPicker}
          onBackgroundImageClear={clearActiveBackgroundImage}
          onPaletteChange={(patch) =>
            updateActiveBackground({
              palette: {
                ...activeCard.background.palette,
                ...patch
              }
            })
          }
          onFramePresetChange={(preset: MantleFramePreset) =>
            updateActiveFrame({
              preset,
              boxStyle: activeCard.frame.boxStyle ?? resolveFrameBoxStyle(activeCard.frame)
            })
          }
          onFrameBoxStyleChange={(boxStyle: MantleFrameBoxStyle) =>
            updateActiveFrame({
              boxStyle,
              ...(boxStyle === 'glass-panel'
                ? resolveGlassFrameMaterial(activeCard.frame)
                : {}),
              contentPadding: resolveFrameContentPaddingForBoxStyle(
                boxStyle,
                activeCard.frame.contentPadding
              )
            })
          }
          onFrameMaterialChange={updateActiveFrame}
          onFrameChromeTextChange={(chromeText) =>
            updateActiveFrame({ chromeText })
          }
          onPaddingChange={(padding) => updateActiveFrame({ padding })}
          onFrameContentPaddingChange={(contentPadding) =>
            updateActiveFrame({ contentPadding })
          }
          onRadiusChange={(cornerRadius) => updateActiveFrame({ cornerRadius })}
          onFrameShadowChange={updateActiveFrame}
          onTextChange={updateActiveText}
        />
      </main>

      {isDragging ? (
        <div className={styles.dropOverlay}>
          <div className={styles.dropTarget}>
            <Icon name="upload" size={32} aria-hidden="true" />
            <span className={styles.dropTitle}>Drop screenshot</span>
            <span className={styles.dropHint}>
              PNG, JPG or WebP · pasting from clipboard also works
            </span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          className={styles.toastSlot}
          aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <div className={`${styles.toast} ${styles[`toast${notice.tone}`]}`}>
            <span className={styles.toastIcon} aria-hidden="true">
              <Icon
                name={
                  notice.tone === 'success'
                    ? 'check'
                    : notice.tone === 'error'
                      ? 'alert'
                      : 'info'
                }
                size={15}
              />
            </span>
            <span className={styles.toastBody}>
              <span className={styles.toastTitle}>{notice.title}</span>
              {notice.detail ? (
                <span className={styles.toastDetail}>{notice.detail}</span>
              ) : null}
            </span>
            <button
              type="button"
              className={styles.toastClose}
              onClick={() => {
                clearNoticeTimer();
                setNotice(null);
              }}
              title="Dismiss"
            >
              <Icon name="close" size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
