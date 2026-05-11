import { exportMantleProjectCard } from '@mantle/engine/commands';
import {
  isAnimatedBackgroundPresetId,
  resolveFrameBoxStyle
} from '@mantle/engine/catalog';
import {
  type MantleBackground,
  type MantleCard,
  type MantleExportFormat,
  type MantleFrame,
  type MantleFrameBoxStyle,
  type MantleFramePreset,
  type MantleRuntimeProject as RuntimeMantleProject,
  type MantleSurfaceAspectRatioPreset,
  type MantleSurfaceTarget,
  type MantleTextLayer
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
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../components/Icon';
import { InspectorPanel } from '../features/inspector/InspectorPanel';
import {
  CardCanvas,
  type VideoPlaybackCommand,
  type VideoPlaybackCommandInput,
  type VideoPlaybackState
} from '../features/stage/CardCanvas';
import { syncGradientColorsWithPalette } from '../lib/backgroundColors';
import { downloadBlob } from '../lib/downloadBlob';
import {
  createMantleGifExportPlan,
  exportMantleGif,
  type MantleGifExportProgress
} from '../lib/exportGif';
import {
  createMantleWebMExportPlan,
  exportMantleWebM,
  isMantleWebMSupported,
  type MantleWebMExportProgress
} from '../lib/exportWebM';
import { formatMediaDuration, formatPlaybackTime } from '../lib/formatMedia';
import {
  resolveFrameContentPaddingForBoxStyle,
  resolveGlassFrameMaterial
} from '../lib/frameMaterial';
import styles from './App.module.css';
import {
  safeFileName
} from './projectPersistence';
import {
  createAssetFromFile,
  createVideoAssetFromFile,
  fileBaseName,
  formatBytes,
  hasRenderableAssetSource,
  readImageDimensions,
  readVideoMetadata,
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
import {
  USER_PRESET_ACCEPT,
  createUserStylePreset,
  loadUserStylePresets,
  mergeUserStylePresets,
  parseUserPresetFiles,
  saveUserStylePresets,
  serializeUserStylePreset,
  type UserStylePreset
} from './userPresets';

const ACCEPTED_INPUT =
  'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm';
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp'
]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);
const SUPPORTED_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;
const SUPPORTED_VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|webm)$/i;
const SUPPORTED_IMAGE_FORMAT_HINT = 'PNG, JPG, or WebP';
const SUPPORTED_MEDIA_FORMAT_HINT = 'PNG, JPG, WebP, MP4, MOV, or WebM';
const DEFAULT_PROJECT_NAME = 'Mantle Draft';
const PROJECT_HISTORY_LIMIT = 80;
const PROJECT_HISTORY_MERGE_WINDOW_MS = 650;
const MAX_TEXT_LAYERS = 24;

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
type StageTimelineStyle = CSSProperties &
  Record<
    | '--stage-timeline-clip-start'
    | '--stage-timeline-clip-end'
    | '--stage-timeline-playhead',
    string
  >;
type StageTimelineTick = {
  id: string;
  position: number;
  label: string;
};
type StageTimelineDragMode = 'scrub' | 'trim-start' | 'trim-end';
type StageTimelineDragState = {
  mode: StageTimelineDragMode;
  pointerId: number;
};
type CompositionMode = 'still' | 'motion';
type PresetRailMode = 'built-in' | 'saved';
type ExportProgressState = (MantleWebMExportProgress | MantleGifExportProgress) & {
  canCancel: boolean;
};
type ProjectUpdater =
  | RuntimeMantleProject
  | ((current: RuntimeMantleProject) => RuntimeMantleProject);
type ProjectHistoryState = {
  past: RuntimeMantleProject[];
  present: RuntimeMantleProject;
  future: RuntimeMantleProject[];
  lastCommitAt: number;
};
type MantleFileSystemFileHandle = {
  kind: 'file';
  getFile: () => Promise<File>;
};
type MantleFileSystemDirectoryHandle = {
  kind: 'directory';
  values: () => AsyncIterable<MantleFileSystemFileHandle | MantleFileSystemDirectoryHandle>;
};
type MantleDirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
  }) => Promise<MantleFileSystemDirectoryHandle>;
};

type StyleRailItem =
  | (StylePreset & { kind: 'preset' })
  | {
      id: typeof IMAGE_BACKGROUND_STYLE_ID;
      label: string;
      hint: string;
      kind: 'image';
    };

type MediaImportIntent =
  | { mode: 'auto' }
  | { mode: 'source-new' }
  | { mode: 'source-relink'; assetId: string }
  | { mode: 'background-new' }
  | { mode: 'background-relink'; assetId: string };

function createInitialProject(): RuntimeMantleProject {
  return {
    ...createMantleProject({
      name: DEFAULT_PROJECT_NAME,
      brandName: 'Mantle'
    })
  };
}

function createProjectHistory(): ProjectHistoryState {
  return {
    past: [],
    present: createInitialProject(),
    future: [],
    lastCommitAt: 0
  };
}

function trimProjectHistory<T>(items: T[]): T[] {
  return items.length > PROJECT_HISTORY_LIMIT
    ? items.slice(items.length - PROJECT_HISTORY_LIMIT)
    : items;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;
}

function createTextLayerId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `text-${Date.now().toString(36)}`;
}

function nextTextLayerText(layers: readonly MantleTextLayer[]): string {
  const used = new Set(layers.map((layer) => layer.text.trim()).filter(Boolean));
  for (let index = layers.length + 1; index <= MAX_TEXT_LAYERS; index += 1) {
    const label = `Text ${index}`;
    if (!used.has(label)) return label;
  }
  for (let index = 1; index <= layers.length; index += 1) {
    const label = `Text ${index}`;
    if (!used.has(label)) return label;
  }
  return `Text ${layers.length + 1}`;
}

function duplicateTextLayerText(
  layer: MantleTextLayer,
  layers: readonly MantleTextLayer[]
): string {
  const text = layer.text.trim();
  if (!text || /^Text \d+$/.test(text)) return nextTextLayerText(layers);
  return layer.text;
}

function reorderItems<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...items];
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  if (item === undefined) return [...items];
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

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

const STILL_EXPORT_FORMAT_OPTIONS: Array<{ value: MantleExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'gif', label: 'GIF' }
];
const MOTION_EXPORT_FORMAT_OPTIONS: Array<{ value: MantleExportFormat; label: string }> = [
  { value: 'webm', label: 'WebM' },
  { value: 'gif', label: 'GIF' }
];
const DEFAULT_GIF_DURATION_MS = 3000;
const DEFAULT_GIF_FRAME_RATE = 12;
const DEFAULT_VIDEO_DURATION_MS = 3000;
const DEFAULT_VIDEO_FRAME_RATE = 24;
const DEFAULT_VIDEO_BITRATE_MBPS = 8;
const MIN_VIDEO_TRIM_DURATION_MS = 100;
const VIDEO_EXPORT_MAX_DURATION_MS = 60000;
const VIDEO_TRIM_STEP_MS = 100;

function exportFormatForComposition(
  format: MantleExportFormat,
  mode: CompositionMode
): MantleExportFormat {
  if (mode === 'motion') return format === 'gif' ? 'gif' : 'webm';
  return format === 'webm' ? 'png' : format;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  if (!text.includes('.')) return 0;
  return text.split('.')[1]?.length ?? 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveVideoTrimRange(
  card: MantleCard,
  sourceDurationMs: number
): { startMs: number; endMs: number; durationMs: number } {
  const maxEnd = Math.max(
    MIN_VIDEO_TRIM_DURATION_MS,
    Math.min(
      VIDEO_EXPORT_MAX_DURATION_MS,
      sourceDurationMs || VIDEO_EXPORT_MAX_DURATION_MS
    )
  );
  const startMs = clampNumber(
    card.export.videoStartMs ?? 0,
    0,
    maxEnd - MIN_VIDEO_TRIM_DURATION_MS
  );
  const endMs = clampNumber(
    card.export.videoEndMs ?? maxEnd,
    startMs + MIN_VIDEO_TRIM_DURATION_MS,
    maxEnd
  );
  return { startMs, endMs, durationMs: endMs - startMs };
}

function progressPercent(progress: number): string {
  return `${Math.round(clampNumber(progress, 0, 1) * 100)}%`;
}

function createTimelineTicks(durationMs: number): StageTimelineTick[] {
  const duration = Math.max(100, durationMs);
  const idealTicks = Math.min(12, Math.max(5, Math.round(duration / 2000) + 1));
  const lastIndex = idealTicks - 1;

  return Array.from({ length: idealTicks }, (_, index) => {
    const position = lastIndex > 0 ? index / lastIndex : 0;
    return {
      id: `${index}-${Math.round(position * duration)}`,
      position: position * 100,
      label: formatPlaybackTime(position * duration)
    };
  });
}

function formatTimelineClock(ms: number | undefined): string {
  const totalMs = Math.max(0, Math.round(ms ?? 0));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
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

function ExportSection({
  title,
  meta,
  children
}: {
  title: string;
  meta?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className={styles.exportSection}>
      <div className={styles.exportSectionHeader}>
        <span>{title}</span>
        {meta ? <span>{meta}</span> : null}
      </div>
      <div className={styles.exportSectionBody}>{children}</div>
    </section>
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
    SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ||
    (mimeType === '' && SUPPORTED_IMAGE_EXTENSION_PATTERN.test(file.name))
  );
}

function isSupportedSourceVideo(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  return (
    SUPPORTED_VIDEO_MIME_TYPES.has(mimeType) ||
    (mimeType === '' && SUPPORTED_VIDEO_EXTENSION_PATTERN.test(file.name))
  );
}

function isSupportedSourceMedia(file: File): boolean {
  return isSupportedSourceImage(file) || isSupportedSourceVideo(file);
}

function mediaKindForFile(file: File): 'image' | 'video' | undefined {
  if (isSupportedSourceImage(file)) return 'image';
  if (isSupportedSourceVideo(file)) return 'video';
  return undefined;
}

function isUserPresetFile(file: File): boolean {
  return /\.json$/i.test(file.name);
}

async function collectUserPresetFilesFromDirectory(
  directory: MantleFileSystemDirectoryHandle,
  depth = 0
): Promise<File[]> {
  if (depth > 3) return [];

  const files: File[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      if (isUserPresetFile(file)) files.push(file);
      continue;
    }

    files.push(...(await collectUserPresetFilesFromDirectory(entry, depth + 1)));
  }

  return files;
}

async function chooseUserPresetDirectory(): Promise<File[] | undefined> {
  const pickerWindow = window as MantleDirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) return undefined;

  const directory = await pickerWindow.showDirectoryPicker({
    id: 'mantle-user-presets',
    mode: 'read'
  });
  return collectUserPresetFilesFromDirectory(directory);
}

function titleCaseWords(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function humanizeStyleId(value: string | undefined): string {
  if (!value) return 'Mantle style';
  return titleCaseWords(value.replace(/[-_]+/g, ' ').trim()) || 'Mantle style';
}

function stylePresetDraftName(styleName: string): string {
  return /\bstyle$/i.test(styleName) ? styleName : `${styleName} style`;
}

function importFailureNotice(
  file: File,
  error?: AppFailure | undefined,
  destination: 'source' | 'background' = 'source'
): Omit<AppNotice, 'id'> {
  if (destination === 'background' && !isSupportedSourceImage(file)) {
    return {
      tone: 'error',
      title: 'Backdrop needs an image',
      detail: `Use a static ${SUPPORTED_IMAGE_FORMAT_HINT} image as the backdrop.`
    };
  }

  if (destination === 'source' && !isSupportedSourceMedia(file)) {
    if (
      file.type.toLowerCase().startsWith('video/') ||
      SUPPORTED_VIDEO_EXTENSION_PATTERN.test(file.name)
    ) {
      return {
        tone: 'warning',
        title: 'Unsupported video',
        detail: `Import ${SUPPORTED_MEDIA_FORMAT_HINT}.`
      };
    }

    return {
      tone: 'error',
      title: 'Unsupported media',
      detail: `Import ${SUPPORTED_MEDIA_FORMAT_HINT}.`
    };
  }

  return {
    tone: 'error',
    title:
      mediaKindForFile(file) === 'video'
        ? 'Video could not be imported'
        : 'Image could not be imported',
    detail: error ? errorDetail(error) : 'Unknown error.'
  };
}

function relinkMissingAssetNotice(kind: 'source' | 'background'): Omit<AppNotice, 'id'> {
  return {
    tone: 'warning',
    title: kind === 'background' ? 'Reimport backdrop image' : 'Reimport source media',
    detail:
      kind === 'background'
        ? 'Saved projects keep image metadata only. Relink the local backdrop image before exporting.'
        : 'Saved projects keep source metadata only. Relink the local file to render or export this card.'
  };
}

function exportFailureNotice(
  error: AppFailure,
  format: MantleExportFormat,
  copyToClipboard: boolean
): Omit<AppNotice, 'id'> {
  const detail = errorDetail(error);

  if (/abort|cancel/i.test(detail)) {
    return {
      tone: 'info',
      title: 'Export canceled',
      detail: 'The current export was stopped.'
    };
  }

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
      detail:
        format === 'webm'
          ? 'Use a browser with MediaRecorder WebM support, or choose PNG/GIF for a still export.'
          : 'Choose PNG, JPEG, WebP, or GIF for this browser.'
    };
  }

  if (/too large|too long|working canvas memory|lower export scale|keep exports under|lower fps|trim the clip/i.test(detail)) {
    return {
      tone: 'error',
      title: 'Export too large',
      detail
    };
  }

  if (/could not load image asset|image decoding|could not decode image/i.test(detail)) {
    return {
      tone: 'warning',
      title: 'Reimport source media',
      detail: 'Saved projects keep source metadata only. Relink the local file before exporting.'
    };
  }

  if (/could not load background image asset/i.test(detail)) {
    return {
      tone: 'warning',
      title: 'Reimport backdrop image',
      detail: 'Saved projects keep image metadata only. Relink the local backdrop image before exporting.'
    };
  }

  return {
    tone: 'error',
    title: 'Export failed',
    detail
  };
}

export function App() {
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryState>(
    createProjectHistory
  );
  const project = projectHistory.present;
  const canUndo = projectHistory.past.length > 0;
  const canRedo = projectHistory.future.length > 0;
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [compositionMode, setCompositionMode] = useState<CompositionMode>('still');
  const [videoPlaybackState, setVideoPlaybackState] =
    useState<VideoPlaybackState | null>(null);
  const [videoPlaybackCommand, setVideoPlaybackCommand] =
    useState<VideoPlaybackCommand | undefined>(undefined);
  const [presetRailMode, setPresetRailMode] = useState<PresetRailMode>('built-in');
  const [userPresets, setUserPresets] = useState<UserStylePreset[]>([]);
  const [presetDraftOpen, setPresetDraftOpen] = useState(false);
  const [presetDraftName, setPresetDraftName] = useState('');
  const [presetDraftDescription, setPresetDraftDescription] = useState('');
  const [presetImportMenuOpen, setPresetImportMenuOpen] = useState(false);
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false);
  const [exportSettingsMode, setExportSettingsMode] =
    useState<ExportSettingsMode>('download');
  const [exportPopoverPosition, setExportPopoverPosition] = useState<{
    top: number;
    right: number;
  }>({ top: 56, right: 18 });
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [density, setDensity] = useState<'compact' | 'cozy'>(() => {
    if (typeof window === 'undefined') return 'compact';
    return window.localStorage.getItem('mantle.density') === 'cozy'
      ? 'cozy'
      : 'compact';
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userPresetInputRef = useRef<HTMLInputElement | null>(null);
  const userPresetFolderInputRef = useRef<HTMLInputElement | null>(null);
  const presetImportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportPopoverRef = useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | null>(null);
  const mediaImportIntentRef = useRef<MediaImportIntent>({ mode: 'auto' });
  const videoCommandSeqRef = useRef(0);
  const stageTimelineTrackRef = useRef<HTMLDivElement | null>(null);
  const stageTimelineDragRef = useRef<StageTimelineDragState | null>(null);
  const lastStageTimelineTimeRef = useRef<number | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);

  const setProject = useCallback((updater: ProjectUpdater) => {
    setProjectHistory((history) => {
      const nextProject =
        typeof updater === 'function' ? updater(history.present) : updater;

      if (Object.is(nextProject, history.present)) return history;

      const now = Date.now();
      const shouldMerge =
        history.past.length > 0 &&
        now - history.lastCommitAt <= PROJECT_HISTORY_MERGE_WINDOW_MS;

      return {
        past: shouldMerge
          ? history.past
          : trimProjectHistory([...history.past, history.present]),
        present: nextProject,
        future: [],
        lastCommitAt: now
      };
    });
  }, []);

  const undoProject = useCallback(() => {
    setProjectHistory((history) => {
      const previous = history.past[history.past.length - 1];
      if (!previous) return history;

      return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future].slice(0, PROJECT_HISTORY_LIMIT),
        lastCommitAt: 0
      };
    });
  }, []);

  const redoProject = useCallback(() => {
    setProjectHistory((history) => {
      const next = history.future[0];
      if (!next) return history;

      return {
        past: trimProjectHistory([...history.past, history.present]),
        present: next,
        future: history.future.slice(1),
        lastCommitAt: 0
      };
    });
  }, []);

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
      exportAbortControllerRef.current?.abort();
      objectUrlsRef.current.forEach((url) => {
        revokeRuntimeObjectUrl(url);
      });
      objectUrlsRef.current.clear();
    };
  }, [clearNoticeTimer]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (density === 'cozy') {
      root.setAttribute('data-density', 'cozy');
      window.localStorage.setItem('mantle.density', 'cozy');
    } else {
      root.removeAttribute('data-density');
      window.localStorage.removeItem('mantle.density');
    }
  }, [density]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoProject();
        } else {
          undoProject();
        }
        return;
      }

      if (key === 'y' && !event.shiftKey) {
        event.preventDefault();
        redoProject();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redoProject, undoProject]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const shouldDuplicate =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === 'd';
      const shouldDelete =
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.key === 'Delete' || event.key === 'Backspace');

      if (!shouldDuplicate && !shouldDelete) return;
      event.preventDefault();

      setProject((current) => {
        const cardIndex = current.cards.findIndex(
          (card) => card.id === current.activeCardId
        );
        const card = current.cards[cardIndex];
        const layers = card?.textLayers ?? [];
        const activeLayerId =
          card?.activeTextLayerId ?? layers[layers.length - 1]?.id;
        if (cardIndex < 0 || !card || !activeLayerId || layers.length === 0) {
          return current;
        }

        const layerIndex = layers.findIndex((layer) => layer.id === activeLayerId);
        const layer = layers[layerIndex];
        if (layerIndex < 0 || !layer) return current;

        if (shouldDelete) {
          const nextLayers = layers.filter((item) => item.id !== activeLayerId);
          const nextActiveTextLayerId =
            nextLayers[Math.min(layerIndex, nextLayers.length - 1)]?.id;
          const nextCard: MantleCard = {
            ...card,
            textLayers: nextLayers.length > 0 ? nextLayers : undefined,
            activeTextLayerId: nextActiveTextLayerId
          };
          return {
            ...current,
            updatedAt: new Date().toISOString(),
            cards: current.cards.map((item, index) =>
              index === cardIndex ? nextCard : item
            )
          };
        }

        if (layers.length >= MAX_TEXT_LAYERS) return current;
        const nextLayer: MantleTextLayer = {
          ...layer,
          id: createTextLayerId(),
          text: duplicateTextLayerText(layer, layers),
          transform: {
            ...layer.transform,
            x: Math.min(0.92, layer.transform.x + 0.035),
            y: Math.min(0.92, layer.transform.y + 0.035)
          }
        };
        const nextCard: MantleCard = {
          ...card,
          textLayers: [
            ...layers.slice(0, layerIndex + 1),
            nextLayer,
            ...layers.slice(layerIndex + 1)
          ],
          activeTextLayerId: nextLayer.id
        };
        return {
          ...current,
          updatedAt: new Date().toISOString(),
          cards: current.cards.map((item, index) =>
            index === cardIndex ? nextCard : item
          )
        };
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setProject]);

  useEffect(() => {
    const folderInput = userPresetFolderInputRef.current;
    if (!folderInput) return;
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadUserStylePresets()
      .then((presets) => {
        if (!cancelled) setUserPresets(presets);
      })
      .catch((error) => {
        if (cancelled) return;
        showNotice({
          tone: 'warning',
          title: 'Saved styles unavailable',
          detail: errorDetail(toAppFailure(error))
        });
      });

    return () => {
      cancelled = true;
    };
  }, [showNotice]);

  useEffect(() => {
    if (!presetImportMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresetImportMenuOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !presetImportMenuRef.current?.contains(target)) {
        setPresetImportMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [presetImportMenuOpen]);

  const updateUserPresets = useCallback(
    (updater: (current: UserStylePreset[]) => UserStylePreset[]) => {
      setUserPresets((current) => {
        const nextPresets = updater(current);
        void saveUserStylePresets(nextPresets).catch((error) => {
          showNotice({
            tone: 'warning',
            title: 'Presets were not saved',
            detail: errorDetail(toAppFailure(error))
          });
        });
        return nextPresets;
      });
    },
    [showNotice]
  );

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
  const activeStyleName = useMemo(() => {
    const savedPreset = userPresets.find((preset) => preset.id === activeCard?.themeId);
    if (savedPreset) return savedPreset.label;

    const builtInPreset = STYLE_PRESETS.find((preset) => preset.id === activeCard?.themeId);
    if (builtInPreset) return builtInPreset.label;

    return humanizeStyleId(activeCard?.background.presetId);
  }, [activeCard?.background.presetId, activeCard?.themeId, userPresets]);
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
  const activeVideoAsset = activeAsset?.mediaKind === 'video' ? activeAsset : undefined;
  const effectiveCompositionMode: CompositionMode = activeVideoAsset
    ? 'motion'
    : compositionMode;
  const activeVideoDurationMs =
    videoPlaybackState?.durationMs || activeVideoAsset?.durationMs || 0;
  const backgroundAnimationAvailable = activeCard
    ? isAnimatedBackgroundPresetId(activeCard.background.presetId)
    : false;
  const backgroundAnimationEnabled = activeCard?.export.animateBackground ?? true;

  useEffect(() => {
    if (!activeVideoAsset) {
      setVideoPlaybackState(null);
      setVideoPlaybackCommand(undefined);
      videoCommandSeqRef.current = 0;
      return;
    }

    setVideoPlaybackState({
      currentTimeMs: 0,
      durationMs: activeVideoAsset.durationMs ?? 0,
      paused: true,
      muted: false
    });
    setVideoPlaybackCommand(undefined);
    videoCommandSeqRef.current = 0;
  }, [activeVideoAsset?.id, activeVideoAsset?.durationMs]);

  const sendVideoPlaybackCommand = useCallback(
    (command: VideoPlaybackCommandInput) => {
      const id = videoCommandSeqRef.current + 1;
      videoCommandSeqRef.current = id;
      const nextCommand: VideoPlaybackCommand =
        command.type === 'seek'
          ? { id, type: 'seek', timeMs: command.timeMs }
          : { id, type: command.type };
      setVideoPlaybackCommand(nextCommand);
    },
    []
  );

  const updateCompositionMode = useCallback(
    (mode: CompositionMode) => {
      if (mode === 'still' && activeVideoAsset) {
        showNotice({
          tone: 'info',
          title: 'Video uses Motion',
          detail: 'Replace the source with an image to switch back to Still.'
        });
        return;
      }

      setCompositionMode(mode);
    },
    [activeVideoAsset, showNotice]
  );

  const openExportSettings = useCallback(
    (mode: ExportSettingsMode) => {
      if (mode === 'copy' && effectiveCompositionMode === 'motion') {
        showNotice({
          tone: 'info',
          title: 'Use video export',
          detail: 'Motion scenes export as WebM. Switch to Still to copy a PNG frame.'
        });
        return;
      }

      setExportSettingsMode(mode);
      setExportSettingsOpen(true);
    },
    [effectiveCompositionMode, showNotice]
  );

  const openMediaPicker = useCallback((intent: MediaImportIntent = { mode: 'auto' }) => {
    mediaImportIntentRef.current = intent;
    fileInputRef.current?.click();
  }, []);

  const openRelinkSourcePicker = useCallback(() => {
    if (!activeMissingSourceAssetId) {
      openMediaPicker({ mode: 'source-new' });
      return;
    }

    openMediaPicker({
      mode: 'source-relink',
      assetId: activeMissingSourceAssetId
    });
  }, [activeMissingSourceAssetId, openMediaPicker]);

  const openRelinkBackgroundPicker = useCallback(() => {
    if (!activeMissingBackgroundAssetId) {
      openMediaPicker({ mode: 'background-new' });
      return;
    }

    openMediaPicker({
      mode: 'background-relink',
      assetId: activeMissingBackgroundAssetId
    });
  }, [activeMissingBackgroundAssetId, openMediaPicker]);

  const resolveMediaImportIntent = useCallback(
    (intent: MediaImportIntent): MediaImportIntent => {
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
  }, [setProject]);

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
    [setProject]
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
    [setProject]
  );

  const importFile = useCallback(
    async (file: File, intent: MediaImportIntent = { mode: 'auto' }) => {
      const resolvedIntent = resolveMediaImportIntent(intent);
      const destination =
        resolvedIntent.mode === 'background-new' ||
        resolvedIntent.mode === 'background-relink'
          ? 'background'
          : 'source';
      const mediaKind = mediaKindForFile(file);

      if (
        (destination === 'background' && !isSupportedSourceImage(file)) ||
        (destination === 'source' && !mediaKind)
      ) {
        showNotice(importFailureNotice(file, undefined, destination));
        return;
      }
      const resolvedMediaKind = destination === 'background' ? 'image' : mediaKind;
      if (!resolvedMediaKind) return;

      const objectUrl = registerObjectUrl(URL.createObjectURL(file));
      try {
        const importedMedia =
          resolvedMediaKind === 'video'
            ? {
                mediaKind: 'video' as const,
                metadata: await readVideoMetadata(objectUrl)
              }
            : {
                mediaKind: 'image' as const,
                metadata: await readImageDimensions(objectUrl)
              };

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

          setProject((current) => ({
            ...current,
            updatedAt: new Date().toISOString(),
            assets: current.assets.map((asset) =>
              asset.id === resolvedIntent.assetId
                ? {
                    ...asset,
                    name: file.name,
                    mimeType: file.type || asset.mimeType,
                    mediaKind: importedMedia.mediaKind,
                    width: importedMedia.metadata.width,
                    height: importedMedia.metadata.height,
                    durationMs:
                      importedMedia.mediaKind === 'video'
                        ? importedMedia.metadata.durationMs
                        : undefined,
                    frameRate: undefined,
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
                ? 'Backdrop relinked'
                : importedMedia.mediaKind === 'video'
                  ? 'Video relinked'
                  : 'Image relinked',
            detail:
              resolvedIntent.mode === 'background-relink'
                ? `${file.name} is attached as the backdrop again.`
                : `${file.name} is attached to this card again.`
          });
          return;
        }

        const asset =
          importedMedia.mediaKind === 'video'
            ? createVideoAssetFromFile(
                file,
                objectUrl,
                importedMedia.metadata,
                'screenshot'
              )
            : createAssetFromFile(
                file,
                objectUrl,
                importedMedia.metadata,
                resolvedIntent.mode === 'background-new'
                  ? 'background'
                  : 'screenshot'
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
                    sourceAssetId: asset.id,
                    sourcePlacement: { mode: 'fit' }
                  }
              : item
          )
        }));
        showNotice({
          tone: 'success',
          title:
            resolvedIntent.mode === 'background-new'
              ? 'Backdrop imported'
              : importedMedia.mediaKind === 'video'
                ? 'Video imported'
                : 'Image imported',
          detail:
            resolvedIntent.mode === 'background-new'
              ? `${file.name} is now the canvas backdrop.`
              : importedMedia.mediaKind === 'video'
                ? `${file.name} is ready for motion preview.`
                : `${file.name} is ready to render.`
        });
      } catch (error) {
        revokeObjectUrl(objectUrl);
        showNotice(importFailureNotice(file, toAppFailure(error), destination));
      }
    },
    [
      project.assets,
      registerObjectUrl,
      resolveMediaImportIntent,
      revokeObjectUrl,
      setProject,
      showNotice
    ]
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        isSupportedSourceMedia(item)
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

  const importUserPresetFiles = async (files: readonly File[]) => {
    const presetFiles = files.filter(isUserPresetFile);
    if (presetFiles.length === 0) {
      showNotice({
        tone: 'warning',
        title: 'No preset files found',
        detail: 'Choose .json preset files.'
      });
      return;
    }

    const result = await parseUserPresetFiles(presetFiles);
    if (result.presets.length > 0) {
      updateUserPresets((current) =>
        mergeUserStylePresets(current, result.presets)
      );
      setPresetRailMode('saved');
    }

    if (result.presets.length > 0 && result.failures.length === 0) {
      showNotice({
        tone: 'success',
        title: 'Presets imported',
        detail: `${result.presets.length} preset${result.presets.length === 1 ? '' : 's'} ready.`
      });
      return;
    }

    showNotice({
      tone: result.presets.length > 0 ? 'warning' : 'error',
      title:
        result.presets.length > 0
          ? 'Some presets were skipped'
          : 'Presets could not be imported',
      detail:
        result.failures[0] ??
        'The selected files are not valid Mantle preset files.'
    });
  };

  const openUserPresetFolder = async () => {
    try {
      const files = await chooseUserPresetDirectory();
      if (files) {
        await importUserPresetFiles(files);
        return;
      }
    } catch (error) {
      const failure = toAppFailure(error);
      if (!/abort/i.test(failure.message)) {
        showNotice({
          tone: 'warning',
          title: 'Folder picker unavailable',
          detail: 'Use the fallback folder picker instead.'
        });
      } else {
        return;
      }
    }

    userPresetFolderInputRef.current?.click();
  };

  const createPresetFromActiveCard = (name: string, description?: string) => {
    if (!activeCard) {
      throw new Error('No active card is available.');
    }

    return createUserStylePreset({
      name,
      description,
      background: cloneBackground(activeCard.background),
      frame: cloneFrame(activeCard.frame),
      text: cloneText(activeCard.text),
      sourceName: 'Saved style'
    });
  };

  const openPresetDraft = () => {
    if (!activeCard) return;
    if (activeCard.background.presetId === 'image-fill') {
      showNotice({
        tone: 'warning',
        title: 'Style cannot be saved yet',
        detail: 'Image backdrops are not portable presets yet. Choose a generated backdrop first.'
      });
      return;
    }

    setPresetRailMode('saved');
    setPresetDraftName(stylePresetDraftName(activeStyleName));
    setPresetDraftDescription('');
    setPresetDraftOpen(true);
  };

  const saveCurrentStylePreset = () => {
    const name = presetDraftName.trim();
    if (!name) {
      showNotice({
        tone: 'warning',
        title: 'Preset needs a name',
        detail: 'Add a short name before saving this style.'
      });
      return;
    }

    try {
      const preset = createPresetFromActiveCard(name, presetDraftDescription);
      updateUserPresets((current) => mergeUserStylePresets(current, [preset]));
      setPresetDraftOpen(false);
      showNotice({
        tone: 'success',
        title: 'Style saved',
        detail: `${preset.label} is in Saved styles.`
      });
    } catch (error) {
      showNotice({
        tone: 'error',
        title: 'Style could not be saved',
        detail: errorDetail(toAppFailure(error))
      });
    }
  };

  const exportUserPreset = (preset: UserStylePreset) => {
    try {
      downloadBlob({
        blob: new Blob([serializeUserStylePreset(preset)], {
          type: 'application/json;charset=utf-8'
        }),
        filename: `${safeFileName(preset.label)}.mantle-preset.json`,
        mimeType: 'application/json'
      });
      showNotice({
        tone: 'success',
        title: 'Preset exported',
        detail: `${safeFileName(preset.label)}.mantle-preset.json`
      });
    } catch (error) {
      showNotice({
        tone: 'error',
        title: 'Preset could not be exported',
        detail: errorDetail(toAppFailure(error))
      });
    }
  };

  const removeUserPreset = (preset: UserStylePreset) => {
    updateUserPresets((current) => current.filter((item) => item.id !== preset.id));
    showNotice({
      tone: 'info',
      title: 'Preset removed',
      detail: preset.label
    });
  };

  const cancelExport = useCallback(() => {
    exportAbortControllerRef.current?.abort();
  }, []);

  const handleExport = async (copyToClipboard = false) => {
    if (!activeCard || !activeTarget) {
      return;
    }

    if (copyToClipboard && effectiveCompositionMode === 'motion') {
      showNotice({
        tone: 'info',
        title: 'Use video export',
        detail: 'Motion scenes export as WebM. Switch to Still to copy a PNG frame.'
      });
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
        title: 'Reimport source media',
        detail: 'Saved projects keep source metadata only. Relink the local file before exporting.'
      });
      return;
    }

    const exportFormat: MantleExportFormat = copyToClipboard
      ? 'png'
      : exportFormatForComposition(activeCard.export.format, effectiveCompositionMode);

    const cardForExport: MantleCard = {
      ...activeCard,
      export: {
        ...activeCard.export,
        format: exportFormat,
        ...(copyToClipboard ? { quality: undefined } : {})
      }
    };

    if (
      activeAsset?.mediaKind === 'video' &&
      exportFormat !== 'webm' &&
      exportFormat !== 'gif'
    ) {
      showNotice({
        tone: 'info',
        title: 'Choose WebM or GIF',
        detail: 'Video sources need a motion format so the whole scene can be rendered over time.'
      });
      return;
    }

    if (isMissingRenderableBackground(activeCard.background, activeBackgroundAsset)) {
      showNotice({
        tone: 'warning',
        title: 'Reimport backdrop image',
        detail: 'Saved projects keep image metadata only. Relink the local backdrop image before exporting.'
      });
      return;
    }

    if (exportFormat === 'webm') {
      if (!isMantleWebMSupported()) {
        showNotice(
          exportFailureNotice(
            new Error('WebM export is not supported by this browser.'),
            exportFormat,
            false
          )
        );
        return;
      }

      try {
        createMantleWebMExportPlan({
          card: cardForExport,
          target: activeTarget,
          asset: activeAsset,
          backgroundAsset: activeBackgroundAsset,
          scale: cardForExport.export.scale
        });
      } catch (error) {
        showNotice(exportFailureNotice(toAppFailure(error), exportFormat, false));
        return;
      }
    }

    if (exportFormat === 'gif' && effectiveCompositionMode === 'motion') {
      try {
        createMantleGifExportPlan({
          card: cardForExport,
          target: activeTarget,
          asset: activeAsset,
          backgroundAsset: activeBackgroundAsset,
          scale: cardForExport.export.scale
        });
      } catch (error) {
        showNotice(exportFailureNotice(toAppFailure(error), exportFormat, false));
        return;
      }
    }

    setIsExporting(true);
    setExportProgress(null);
    try {
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

      if (exportFormat === 'webm') {
        const controller = new AbortController();
        exportAbortControllerRef.current = controller;
        setExportProgress({
          phase: 'preparing',
          progress: 0,
          detail: 'Preparing WebM export',
          canCancel: true
        });
        const result = await exportMantleWebM({
          card: cardForExport,
          target: activeTarget,
          asset: activeAsset,
          backgroundAsset: activeBackgroundAsset,
          scale: cardForExport.export.scale,
          signal: controller.signal,
          onProgress: (progress) =>
            setExportProgress({
              ...progress,
              canCancel: progress.phase !== 'finalizing'
            })
        });

        downloadBlob(result);
        showNotice({
          tone: 'success',
          title: 'Export ready',
          detail: `${result.filename} downloaded.`
        });
        return;
      }

      if (exportFormat === 'gif' && effectiveCompositionMode === 'motion') {
        const controller = new AbortController();
        exportAbortControllerRef.current = controller;
        setExportProgress({
          phase: 'preparing',
          progress: 0,
          detail: 'Preparing GIF export',
          canCancel: true
        });
        const result = await exportMantleGif({
          card: cardForExport,
          target: activeTarget,
          asset: activeAsset,
          backgroundAsset: activeBackgroundAsset,
          scale: cardForExport.export.scale,
          signal: controller.signal,
          onProgress: (progress) =>
            setExportProgress({
              ...progress,
              canCancel: progress.phase !== 'finalizing'
            })
        });

        downloadBlob(result);
        showNotice({
          tone: 'success',
          title: 'Export ready',
          detail: `${result.filename} downloaded.`
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
      exportAbortControllerRef.current = null;
      setExportProgress(null);
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

  const createDefaultTextLayer = (
    id: string,
    layers: MantleTextLayer[]
  ): MantleTextLayer => {
    const offset = Math.min(0.16, layers.length * 0.035);
    return {
      id,
      text: nextTextLayerText(layers),
      font: activeCard.text.titleFont === 'sans' ? 'display' : activeCard.text.titleFont,
      align: 'center',
      color: activeCard.text.titleColor,
      scale: 1.08,
      width: 0.34,
      shadow: 'auto',
      transform: {
        x: Math.min(0.82, 0.5 + offset),
        y: Math.min(0.82, 0.5 + offset),
        rotation: 0
      }
    };
  };

  const addActiveTextLayer = () => {
    const id = createTextLayerId();
    const layers = activeCard.textLayers ?? [];
    if (layers.length >= MAX_TEXT_LAYERS) return;
    updateActiveCard({
      textLayers: [...layers, createDefaultTextLayer(id, layers)],
      activeTextLayerId: id
    });
  };

  const updateActiveTextLayer = (
    layerId: string,
    patch: Partial<MantleTextLayer>
  ) => {
    updateActiveCard({
      textLayers: (activeCard.textLayers ?? []).map((layer) =>
        layer.id === layerId ? { ...layer, ...patch } : layer
      ),
      activeTextLayerId: layerId
    });
  };

  const removeActiveTextLayer = (layerId: string) => {
    const existingLayers = activeCard.textLayers ?? [];
    const removedIndex = existingLayers.findIndex((layer) => layer.id === layerId);
    const layers = existingLayers.filter((layer) => layer.id !== layerId);
    const nextActiveTextLayerId =
      activeCard.activeTextLayerId === layerId
        ? layers[Math.min(Math.max(removedIndex, 0), layers.length - 1)]?.id
        : activeCard.activeTextLayerId;
    updateActiveCard({
      textLayers: layers.length > 0 ? layers : undefined,
      activeTextLayerId: nextActiveTextLayerId
    });
  };

  const duplicateActiveTextLayer = (layerId: string) => {
    const layers = activeCard.textLayers ?? [];
    if (layers.length >= MAX_TEXT_LAYERS) return;
    const layerIndex = layers.findIndex((layer) => layer.id === layerId);
    const layer = layers[layerIndex];
    if (!layer) return;

    const id = createTextLayerId();
    const duplicate: MantleTextLayer = {
      ...layer,
      id,
      text: duplicateTextLayerText(layer, layers),
      transform: {
        ...layer.transform,
        x: Math.min(0.92, layer.transform.x + 0.035),
        y: Math.min(0.92, layer.transform.y + 0.035)
      }
    };
    updateActiveCard({
      textLayers: [
        ...layers.slice(0, layerIndex + 1),
        duplicate,
        ...layers.slice(layerIndex + 1)
      ],
      activeTextLayerId: id
    });
  };

  const moveActiveTextLayer = (layerId: string, direction: -1 | 1) => {
    const layers = activeCard.textLayers ?? [];
    const layerIndex = layers.findIndex((layer) => layer.id === layerId);
    const targetIndex = layerIndex + direction;
    if (layerIndex < 0 || targetIndex < 0 || targetIndex >= layers.length) return;

    const nextLayers = [...layers];
    const movingLayer = nextLayers[layerIndex];
    const targetLayer = nextLayers[targetIndex];
    if (!movingLayer || !targetLayer) return;
    nextLayers[layerIndex] = targetLayer;
    nextLayers[targetIndex] = movingLayer;

    updateActiveCard({
      textLayers: nextLayers,
      activeTextLayerId: layerId
    });
  };

  const reorderActiveTextLayer = (fromIndex: number, toIndex: number) => {
    const layers = activeCard.textLayers ?? [];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= layers.length ||
      toIndex >= layers.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    updateActiveCard({
      textLayers: reorderItems(layers, fromIndex, toIndex),
      activeTextLayerId: layers[fromIndex]?.id ?? activeCard.activeTextLayerId
    });
  };

  const updateActiveExport = (patch: Partial<MantleCard['export']>) => {
    updateActiveCard({
      export: { ...activeCard.export, ...patch }
    });
  };

  const updateVideoTrim = (patch: { startMs?: number; endMs?: number }) => {
    const current = resolveVideoTrimRange(activeCard, activeVideoDurationMs);
    const maxEnd = Math.max(
      MIN_VIDEO_TRIM_DURATION_MS,
      Math.min(
        VIDEO_EXPORT_MAX_DURATION_MS,
        activeVideoDurationMs || VIDEO_EXPORT_MAX_DURATION_MS
      )
    );
    const startMs = clampNumber(
      patch.startMs ?? current.startMs,
      0,
      Math.max(0, maxEnd - MIN_VIDEO_TRIM_DURATION_MS)
    );
    const endMs = clampNumber(
      patch.endMs ?? current.endMs,
      startMs + MIN_VIDEO_TRIM_DURATION_MS,
      maxEnd
    );

    updateActiveExport({
      videoStartMs: Math.round(startMs),
      videoEndMs: Math.round(endMs),
      videoDurationMs: Math.round(endMs - startMs)
    });
  };
  const exportWidth = activeTarget.width * activeCard.export.scale;
  const exportHeight = activeTarget.height * activeCard.export.scale;
  const activeExportFormat = exportFormatForComposition(
    activeCard.export.format,
    effectiveCompositionMode
  );
  const exportFormatOptions =
    effectiveCompositionMode === 'motion'
      ? MOTION_EXPORT_FORMAT_OPTIONS
      : STILL_EXPORT_FORMAT_OPTIONS;
  const showExportQuality =
    activeExportFormat === 'jpeg' || activeExportFormat === 'webp';
  const showExportGifSettings = activeExportFormat === 'gif';
  const showExportVideoSettings = activeExportFormat === 'webm';
  const showExportMotionSettings = showExportGifSettings || showExportVideoSettings;
  const showExportQualitySettings = showExportQuality || showExportVideoSettings;
  const videoTrimRange = resolveVideoTrimRange(activeCard, activeVideoDurationMs);
  const videoLoopEnabled = activeCard.export.videoLoop ?? true;
  const exportFrameRateMax = showExportGifSettings ? 24 : 60;
  const exportFrameRateMin = showExportGifSettings ? 6 : 12;
  const exportFrameRateDefault = showExportGifSettings
    ? DEFAULT_GIF_FRAME_RATE
    : DEFAULT_VIDEO_FRAME_RATE;
  const exportFrameRate = Math.min(
    exportFrameRateMax,
    Math.max(
      exportFrameRateMin,
      activeCard.export.videoFrameRate ?? exportFrameRateDefault
    )
  );
  const exportVideoDurationMs =
    activeVideoAsset ? videoTrimRange.durationMs : (
      activeCard.export.videoDurationMs ?? DEFAULT_VIDEO_DURATION_MS
    );
  const exportVideoDurationMaxSeconds = Math.max(
    0.1,
    Math.min(
      VIDEO_EXPORT_MAX_DURATION_MS / 1000,
      (activeVideoDurationMs || VIDEO_EXPORT_MAX_DURATION_MS) / 1000
    )
  );
  const videoTimelineMaxMs = Math.max(
    MIN_VIDEO_TRIM_DURATION_MS,
    Math.min(
      VIDEO_EXPORT_MAX_DURATION_MS,
      activeVideoDurationMs || videoTrimRange.endMs
    )
  );
  const stageTimelineDurationMs = Math.max(
    MIN_VIDEO_TRIM_DURATION_MS,
    videoTimelineMaxMs
  );
  const stagePlayerCurrentTimeMs = clampNumber(
    videoPlaybackState?.currentTimeMs ?? videoTrimRange.startMs,
    videoTrimRange.startMs,
    videoTrimRange.endMs
  );
  const stageTimelineSourceDurationMs = Math.max(
    videoTimelineMaxMs,
    activeVideoDurationMs || videoTrimRange.endMs
  );
  const stageTimelineTicks = useMemo(
    () => createTimelineTicks(stageTimelineDurationMs),
    [stageTimelineDurationMs]
  );
  const stageTimelineStyle: StageTimelineStyle = {
    '--stage-timeline-clip-start': `${clampNumber(
      (videoTrimRange.startMs / stageTimelineDurationMs) * 100,
      0,
      100
    )}%`,
    '--stage-timeline-clip-end': `${clampNumber(
      (videoTrimRange.endMs / stageTimelineDurationMs) * 100,
      0,
      100
    )}%`,
    '--stage-timeline-playhead': `${clampNumber(
      (stagePlayerCurrentTimeMs / stageTimelineDurationMs) * 100,
      0,
      100
    )}%`
  };
  const videoTrimIsFull =
    videoTrimRange.startMs <= 0 &&
    Math.abs(videoTrimRange.endMs - videoTimelineMaxMs) < VIDEO_TRIM_STEP_MS;
  const getStageTimelineTime = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const rect = stageTimelineTrackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return videoTrimRange.startMs;

      const progress = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
      return snapNumericValue(
        progress * stageTimelineDurationMs,
        0,
        stageTimelineDurationMs,
        VIDEO_TRIM_STEP_MS
      );
    },
    [stageTimelineDurationMs, videoTrimRange.startMs]
  );
  const seekStageTimeline = useCallback(
    (timeMs: number) => {
      const targetTimeMs = Math.round(
        clampNumber(timeMs, videoTrimRange.startMs, videoTrimRange.endMs)
      );
      if (lastStageTimelineTimeRef.current === targetTimeMs) return;

      lastStageTimelineTimeRef.current = targetTimeMs;
      setVideoPlaybackState((current) => ({
        currentTimeMs: targetTimeMs,
        durationMs: current?.durationMs || activeVideoAsset?.durationMs || 0,
        paused: current?.paused ?? true,
        muted: current?.muted ?? false
      }));
      sendVideoPlaybackCommand({ type: 'seek', timeMs: targetTimeMs });
    },
    [
      activeVideoAsset?.durationMs,
      sendVideoPlaybackCommand,
      videoTrimRange.endMs,
      videoTrimRange.startMs
    ]
  );
  const applyStageTimelineDrag = useCallback(
    (mode: StageTimelineDragMode, timeMs: number) => {
      const current = resolveVideoTrimRange(activeCard, activeVideoDurationMs);

      if (mode === 'scrub') {
        seekStageTimeline(timeMs);
        return;
      }

      if (mode === 'trim-start') {
        const startMs = clampNumber(
          timeMs,
          0,
          current.endMs - MIN_VIDEO_TRIM_DURATION_MS
        );
        updateVideoTrim({ startMs });
        seekStageTimeline(startMs);
        return;
      }

      const endMs = clampNumber(
        timeMs,
        current.startMs + MIN_VIDEO_TRIM_DURATION_MS,
        videoTimelineMaxMs
      );
      updateVideoTrim({ endMs });
      seekStageTimeline(endMs);
    },
    [
      activeCard,
      activeVideoDurationMs,
      seekStageTimeline,
      updateVideoTrim,
      videoTimelineMaxMs
    ]
  );
  const beginStageTimelineDrag = useCallback(
    (mode: StageTimelineDragMode, event: ReactPointerEvent<HTMLElement>) => {
      if (!activeVideoAsset || activeVideoDurationMs <= 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      stageTimelineDragRef.current = { mode, pointerId: event.pointerId };
      lastStageTimelineTimeRef.current = null;
      applyStageTimelineDrag(mode, getStageTimelineTime(event));
    },
    [
      activeVideoAsset,
      activeVideoDurationMs,
      applyStageTimelineDrag,
      getStageTimelineTime
    ]
  );
  const handleStageTimelinePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = stageTimelineDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
      applyStageTimelineDrag(drag.mode, getStageTimelineTime(event));
    },
    [applyStageTimelineDrag, getStageTimelineTime]
  );
  const endStageTimelineDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = stageTimelineDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
      stageTimelineDragRef.current = null;
      lastStageTimelineTimeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );
  const handleStageTimelineKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!activeVideoAsset || activeVideoDurationMs <= 0) return;

      const stepMs = event.shiftKey ? 1000 : VIDEO_TRIM_STEP_MS;
      const keyActions: Partial<Record<string, number>> = {
        ArrowLeft: stagePlayerCurrentTimeMs - stepMs,
        ArrowDown: stagePlayerCurrentTimeMs - stepMs,
        ArrowRight: stagePlayerCurrentTimeMs + stepMs,
        ArrowUp: stagePlayerCurrentTimeMs + stepMs,
        Home: videoTrimRange.startMs,
        End: videoTrimRange.endMs
      };
      const nextTimeMs = keyActions[event.key];
      if (nextTimeMs == null) return;

      event.preventDefault();
      seekStageTimeline(nextTimeMs);
    },
    [
      activeVideoAsset,
      activeVideoDurationMs,
      seekStageTimeline,
      stagePlayerCurrentTimeMs,
      videoTrimRange.endMs,
      videoTrimRange.startMs
    ]
  );
  const resetVideoTrim = useCallback(() => {
    updateActiveExport({
      videoStartMs: 0,
      videoEndMs: Math.round(videoTimelineMaxMs),
      videoDurationMs: Math.round(videoTimelineMaxMs)
    });
    setVideoPlaybackState((current) => ({
      currentTimeMs: 0,
      durationMs: current?.durationMs || activeVideoAsset?.durationMs || 0,
      paused: current?.paused ?? true,
      muted: current?.muted ?? false
    }));
    sendVideoPlaybackCommand({ type: 'seek', timeMs: 0 });
  }, [
    activeVideoAsset?.durationMs,
    sendVideoPlaybackCommand,
    updateActiveExport,
    videoTimelineMaxMs
  ]);
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
      <div className={styles.desktopOnlyNotice} role="status">
        <span className={styles.desktopOnlyMark}>M</span>
        <span className={styles.desktopOnlyTitle}>Open Mantle on desktop</span>
        <span className={styles.desktopOnlyCopy}>
          The editor needs a full-size screen for canvas controls, drag handles,
          and export settings.
        </span>
      </div>

      <input
        accept={ACCEPTED_INPUT}
        className={styles.hiddenInput}
        data-testid="source-file-input"
        ref={fileInputRef}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const intent = mediaImportIntentRef.current;
          mediaImportIntentRef.current = { mode: 'auto' };
          if (file) void importFile(file, intent);
          event.currentTarget.value = '';
        }}
      />
      <input
        accept={USER_PRESET_ACCEPT}
        className={styles.hiddenInput}
        data-testid="user-preset-file-input"
        multiple
        ref={userPresetInputRef}
        type="file"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) void importUserPresetFiles(files);
          event.currentTarget.value = '';
        }}
      />
      <input
        accept={USER_PRESET_ACCEPT}
        className={styles.hiddenInput}
        data-testid="user-preset-folder-input"
        multiple
        ref={userPresetFolderInputRef}
        type="file"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) void importUserPresetFiles(files);
          event.currentTarget.value = '';
        }}
      />

      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">M</span>
          <span className={styles.brandWord}>
            <span>MANTLE</span>
          </span>
        </div>

        <div
          className={styles.compositionModeSwitch}
          role="tablist"
          aria-label="Composition mode"
        >
          <button
            type="button"
            className={
              effectiveCompositionMode === 'still'
                ? `${styles.compositionModeButton} ${styles.compositionModeButtonActive}`
                : styles.compositionModeButton
            }
            aria-disabled={Boolean(activeVideoAsset)}
            aria-selected={effectiveCompositionMode === 'still'}
            onClick={() => updateCompositionMode('still')}
            title={
              activeVideoAsset
                ? 'Replace the source with an image to use Still'
                : 'Still composition'
            }
          >
            Still
          </button>
          <button
            type="button"
            className={
              effectiveCompositionMode === 'motion'
                ? `${styles.compositionModeButton} ${styles.compositionModeButtonActive}`
                : styles.compositionModeButton
            }
            aria-selected={effectiveCompositionMode === 'motion'}
            onClick={() => updateCompositionMode('motion')}
          >
            Motion
          </button>
        </div>

        <div className={styles.topActions}>
          <div className={styles.toolGroup}>
            <button
              type="button"
              className={`${styles.ghostButton} ${styles.iconButton}`}
              disabled={!canUndo}
              onClick={undoProject}
              title="Undo (Cmd/Ctrl+Z)"
              aria-label="Undo"
            >
              <Icon name="undo" size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${styles.ghostButton} ${styles.iconButton}`}
              disabled={!canRedo}
              onClick={redoProject}
              title="Redo (Shift+Cmd/Ctrl+Z)"
              aria-label="Redo"
            >
              <Icon name="redo" size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${styles.ghostButton} ${styles.iconButton}`}
              onClick={() =>
                setDensity((current) => (current === 'cozy' ? 'compact' : 'cozy'))
              }
              title={
                density === 'cozy'
                  ? 'Switch to compact density'
                  : 'Switch to cozy density'
              }
              aria-label="Toggle UI density"
              aria-pressed={density === 'cozy'}
            >
              <Icon name="density" size={14} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.toolGroup}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => openMediaPicker({ mode: 'source-new' })}
              title="Import source media"
            >
              <Icon name="image" size={14} aria-hidden="true" />
              <span>Import media</span>
            </button>
          </div>

          <div className={styles.exportMenu} ref={exportMenuRef}>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={isExporting || effectiveCompositionMode === 'motion'}
              onClick={() => openExportSettings('copy')}
              title={
                effectiveCompositionMode === 'motion'
                  ? 'Switch to Still to copy a PNG frame'
                  : 'Copy PNG to clipboard'
              }
            >
              <Icon name="copy" size={14} aria-hidden="true" />
              <span>Copy PNG</span>
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isExporting}
              onClick={() => openExportSettings('download')}
              title={
                effectiveCompositionMode === 'motion'
                  ? 'Download video'
                  : 'Download image'
              }
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
                        : 'Choose file name, format, and output settings.'}
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
                  <ExportSection title="Format">
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
                      {exportFormatOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={
                            activeExportFormat === option.value
                              ? `${styles.exportSegmentedOption} ${styles.exportSegmentedOptionActive}`
                              : styles.exportSegmentedOption
                          }
                          onClick={() => updateActiveExport({ format: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </ExportSection>
                ) : null}

                <ExportSection title="Size">
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
                </ExportSection>

                {exportSettingsMode === 'download' && showExportMotionSettings ? (
                  <ExportSection
                    title="Motion"
                    meta={showExportVideoSettings ? 'WebM' : 'GIF'}
                  >
                    {activeVideoAsset ? (
                      <>
                        <ExportSlider
                          label="Start"
                          min={0}
                          max={Math.max(0.1, exportVideoDurationMaxSeconds - 0.1)}
                          step={0.1}
                          value={videoTrimRange.startMs / 1000}
                          suffix="s"
                          onChange={(start) =>
                            updateVideoTrim({ startMs: Math.round(start * 1000) })
                          }
                        />

                        <ExportSlider
                          label="End"
                          min={Math.min(
                            exportVideoDurationMaxSeconds,
                            videoTrimRange.startMs / 1000 + 0.1
                          )}
                          max={exportVideoDurationMaxSeconds}
                          step={0.1}
                          value={videoTrimRange.endMs / 1000}
                          suffix="s"
                          onChange={(end) =>
                            updateVideoTrim({ endMs: Math.round(end * 1000) })
                          }
                        />

                        <div className={styles.exportSummary}>
                          <span>Clip duration</span>
                          <strong>{formatPlaybackTime(videoTrimRange.durationMs)}</strong>
                        </div>
                      </>
                    ) : (
                      <ExportSlider
                        label="Duration"
                        min={0.1}
                        max={
                          showExportGifSettings
                            ? 30
                            : exportVideoDurationMaxSeconds
                        }
                        step={0.1}
                        value={
                          showExportGifSettings
                            ? (activeCard.export.gifDurationMs ?? DEFAULT_GIF_DURATION_MS) / 1000
                            : Math.min(
                                exportVideoDurationMaxSeconds,
                                exportVideoDurationMs / 1000
                              )
                        }
                        suffix="s"
                        onChange={(duration) =>
                          updateActiveExport(
                            showExportGifSettings
                              ? { gifDurationMs: Math.round(duration * 1000) }
                              : { videoDurationMs: Math.round(duration * 1000) }
                          )
                        }
                      />
                    )}

                    {showExportGifSettings ? (
                      <>
                        <label className={styles.exportToggle}>
                          <span>
                            <strong>Loop</strong>
                            <span>Use 0 loop count for infinite replay.</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={activeCard.export.gifLoop ?? true}
                            onChange={(event) =>
                              updateActiveExport({ gifLoop: event.currentTarget.checked })
                            }
                          />
                        </label>

                        {(activeCard.export.gifLoop ?? true) ? (
                          <ExportSlider
                            label="Loop count"
                            min={0}
                            max={20}
                            step={1}
                            value={activeCard.export.gifLoopCount ?? 0}
                            onChange={(gifLoopCount) =>
                              updateActiveExport({ gifLoopCount })
                            }
                          />
                        ) : null}
                      </>
                    ) : null}

                    {showExportVideoSettings && activeVideoAsset ? (
                      <label className={styles.exportToggle}>
                        <span>
                          <strong>Loop preview</strong>
                          <span>Replay the selected trim range while previewing.</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={videoLoopEnabled}
                          onChange={(event) =>
                            updateActiveExport({
                              videoLoop: event.currentTarget.checked
                            })
                          }
                        />
                      </label>
                    ) : null}

                    <ExportSlider
                      label="Frame rate"
                      min={exportFrameRateMin}
                      max={exportFrameRateMax}
                      step={1}
                      value={exportFrameRate}
                      suffix="fps"
                      onChange={(videoFrameRate) =>
                        updateActiveExport({ videoFrameRate })
                      }
                    />
                  </ExportSection>
                ) : null}

                {exportSettingsMode === 'download' && showExportQualitySettings ? (
                  <ExportSection
                    title="Quality"
                    meta={showExportVideoSettings ? 'Video' : 'Image'}
                  >
                    {showExportQuality ? (
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

                    {showExportVideoSettings ? (
                      <ExportSlider
                        label="Bitrate"
                        min={1}
                        max={24}
                        step={0.5}
                        value={activeCard.export.videoBitrateMbps ?? DEFAULT_VIDEO_BITRATE_MBPS}
                        suffix=" Mbps"
                        onChange={(videoBitrateMbps) =>
                          updateActiveExport({ videoBitrateMbps })
                        }
                      />
                    ) : null}
                  </ExportSection>
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

          {exportProgress ? (
            <div className={styles.exportProgress} role="status">
              <span className={styles.exportProgressText}>
                <strong>{progressPercent(exportProgress.progress)}</strong>
                <span>{exportProgress.detail}</span>
              </span>
              <span className={styles.exportProgressTrack}>
                <span
                  style={{ width: progressPercent(exportProgress.progress) }}
                />
              </span>
              {exportProgress.canCancel ? (
                <button
                  type="button"
                  className={styles.exportProgressCancel}
                  onClick={cancelExport}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <main className={styles.workspace}>
        <aside className={styles.leftRail}>
          <div className={styles.railHeader}>
            <span className={styles.railTitle}>Styles</span>
            <span className={styles.railHint}>
              {presetRailMode === 'built-in'
                ? `${STYLE_PRESETS.length} built-in`
                : `${userPresets.length} saved`}
            </span>
          </div>

          <div className={styles.railModeSwitch} role="tablist" aria-label="Preset source">
            <button
              type="button"
              className={
                presetRailMode === 'built-in'
                  ? `${styles.railModeButton} ${styles.railModeButtonActive}`
                  : styles.railModeButton
              }
              onClick={() => setPresetRailMode('built-in')}
            >
              Built-in
            </button>
            <button
              type="button"
              className={
                presetRailMode === 'saved'
                  ? `${styles.railModeButton} ${styles.railModeButtonActive}`
                  : styles.railModeButton
              }
              onClick={() => setPresetRailMode('saved')}
            >
              Saved
            </button>
          </div>

          {presetRailMode === 'built-in' ? (
            <div className={styles.presetList}>
              {STYLE_GROUPS.map((group) => {
                const items = group.presetIds
                  .map((id) => {
                    if (id === IMAGE_BACKGROUND_STYLE_ID) {
                      return {
                        id,
                        label: 'Image Backdrop',
                        hint: 'Use your own backdrop image',
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
                              openMediaPicker({ mode: 'background-new' });
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
          ) : (
            <div className={styles.presetList}>
              <div className={styles.savedPresetHeader}>
                <div className={styles.savedPresetTools}>
                  <button
                    type="button"
                    className={styles.savedPresetSaveButton}
                    onClick={openPresetDraft}
                    title="Save current style"
                  >
                    <span>Save</span>
                  </button>
                  <div className={styles.savedPresetImport} ref={presetImportMenuRef}>
                    <button
                      type="button"
                      className={styles.savedPresetImportButton}
                      aria-expanded={presetImportMenuOpen}
                      onClick={() => setPresetImportMenuOpen((open) => !open)}
                    >
                      <Icon name="upload" size={13} aria-hidden="true" />
                      <span>Import</span>
                      <Icon name="chevron" size={12} aria-hidden="true" />
                    </button>
                    {presetImportMenuOpen ? (
                      <div className={styles.savedPresetImportMenu} role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPresetImportMenuOpen(false);
                            userPresetInputRef.current?.click();
                          }}
                        >
                          <span>Import from file</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPresetImportMenuOpen(false);
                            void openUserPresetFolder();
                          }}
                        >
                          <span>Import from folder</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {presetDraftOpen ? (
                <div className={styles.presetDraftCard}>
                  <label>
                    <span>Name</span>
                    <input
                      value={presetDraftName}
                      placeholder="Preset name"
                      onChange={(event) => setPresetDraftName(event.currentTarget.value)}
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <input
                      value={presetDraftDescription}
                      placeholder="Optional"
                      onChange={(event) =>
                        setPresetDraftDescription(event.currentTarget.value)
                      }
                    />
                  </label>
                  <div className={styles.presetDraftActions}>
                    <button
                      type="button"
                      className={styles.userPresetAction}
                      onClick={() => setPresetDraftOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.userPresetAction}
                      onClick={saveCurrentStylePreset}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : null}

              {userPresets.length === 0 ? (
                <div className={styles.userPresetEmpty}>
                  <span className={styles.footerKicker}>Saved styles</span>
                  <span>
                    Save the current look once, then reuse it without rebuilding the scene.
                  </span>
                </div>
              ) : (
                <div className={styles.presetGroup}>
                  <div className={styles.presetGroupHeader}>
                    <span>Saved</span>
                    <span className={styles.presetGroupCount}>{userPresets.length}</span>
                  </div>
                  <div className={styles.presetGroupGrid}>
                    {userPresets.map((preset) => (
                      <div className={styles.userPresetCard} key={preset.id}>
                        <button
                          type="button"
                          className={
                            preset.id === activeCard.themeId
                              ? `${styles.presetCard} ${styles.presetCardActive}`
                              : styles.presetCard
                          }
                          onClick={() => applyStylePreset(preset)}
                        >
                          <span className={styles.presetLabel}>
                            <span className={styles.presetName}>{preset.label}</span>
                            <span className={styles.presetHint}>{preset.hint}</span>
                          </span>
                        </button>
                        <div className={styles.userPresetCardActions}>
                          <button
                            type="button"
                            className={styles.userPresetIconAction}
                            onClick={() => exportUserPreset(preset)}
                            title="Export preset"
                          >
                            <Icon name="download" size={12} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={`${styles.userPresetIconAction} ${styles.userPresetDangerAction}`}
                            onClick={() => removeUserPreset(preset)}
                            title="Remove preset"
                          >
                            <Icon name="close" size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.railFooter}>
            {activeSourceMissing ? (
              <>
                <span className={styles.footerKicker}>Source missing</span>
                <span className={styles.footerTitle}>
                  {activeAsset?.name ?? 'Saved source media'}
                </span>
                <span className={styles.footerMeta}>
                  Project files store source metadata only.
                </span>
                <button
                  type="button"
                  className={styles.footerAction}
                  onClick={openRelinkSourcePicker}
                >
                  <Icon name="image" size={13} aria-hidden="true" />
                  <span>Relink media</span>
                </button>
              </>
            ) : activeAsset ? (
              <>
                <span className={styles.footerKicker}>Source</span>
                <span className={styles.footerTitle}>{activeAsset.name}</span>
                <span className={styles.footerMeta}>
                  {activeAsset.width} × {activeAsset.height}
                  {activeAsset.mediaKind === 'video' && activeAsset.durationMs
                    ? ` · ${formatMediaDuration(activeAsset.durationMs)}`
                    : ''}
                  {activeAsset.fileSize ? ` · ${formatBytes(activeAsset.fileSize)}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className={styles.footerKicker}>Source</span>
                <span className={styles.footerMeta}>
                  Drop media, paste from clipboard or use Import media
                </span>
              </>
            )}
          </div>
        </aside>

        <section className={styles.stageWrap}>
          <div className={styles.stageMeta}>
            <div className={styles.stageMetaIdentity}>
              <span className={styles.stageMetaName}>{activeCard.name}</span>
              <span className={styles.stageMetaDot} />
              <span className={styles.stageMetaSize}>
                {activeTarget.width} × {activeTarget.height}
              </span>
            </div>
          </div>
          <CardCanvas
            card={activeCard}
            target={activeTarget}
            asset={activeAsset}
            backgroundAsset={activeBackgroundAsset}
            motionPreviewActive={effectiveCompositionMode === 'motion'}
            backgroundAnimationEnabled={backgroundAnimationEnabled}
            videoClip={
              activeVideoAsset
                ? {
                    startMs: videoTrimRange.startMs,
                    endMs: videoTrimRange.endMs,
                    loop: videoLoopEnabled
                  }
                : undefined
            }
            videoPlaybackCommand={videoPlaybackCommand}
            onChooseSource={() => openMediaPicker({ mode: 'source-new' })}
            onRelinkSource={openRelinkSourcePicker}
            onSourcePlacementChange={(sourcePlacement) =>
              updateActiveCard({ sourcePlacement })
            }
            onFrameTransformChange={(frameTransform) =>
              updateActiveCard({ frameTransform })
            }
            onTextChange={updateActiveText}
            onTextLayerChange={updateActiveTextLayer}
            onActiveTextLayerChange={(activeTextLayerId) =>
              updateActiveCard({ activeTextLayerId })
            }
            onVideoPlaybackStateChange={setVideoPlaybackState}
          />
          {activeVideoAsset ? (
            <div className={styles.stageTimelineDock} style={stageTimelineStyle}>
              <div className={styles.stageTimelineToolbar}>
                <button
                  type="button"
                  className={styles.stagePlayerButton}
                  onClick={() =>
                    sendVideoPlaybackCommand({ type: 'toggle-playback' })
                  }
                  title={videoPlaybackState?.paused === false ? 'Pause' : 'Play'}
                >
                  <Icon
                    name={videoPlaybackState?.paused === false ? 'pause' : 'play'}
                    size={13}
                    aria-hidden="true"
                  />
                </button>
                <div className={styles.stageTimelineStatus}>
                  <span className={styles.stageTimelineStatusPrimary}>
                    {formatTimelineClock(stagePlayerCurrentTimeMs)}
                    <span>/</span>
                    {formatTimelineClock(stageTimelineSourceDurationMs)}
                  </span>
                  <span className={styles.stageTimelineStatusMeta}>
                    clip {formatTimelineClock(videoTrimRange.durationMs)}
                  </span>
                </div>
                <button
                  type="button"
                  className={
                    videoLoopEnabled
                      ? `${styles.stagePlayerButton} ${styles.stagePlayerTextButton} ${styles.stagePlayerButtonActive}`
                      : `${styles.stagePlayerButton} ${styles.stagePlayerTextButton}`
                  }
                  onClick={() => updateActiveExport({ videoLoop: !videoLoopEnabled })}
                  title={videoLoopEnabled ? 'Loop enabled' : 'Loop disabled'}
                >
                  <Icon name="repeat" size={13} aria-hidden="true" />
                  <span>Loop</span>
                </button>
                <button
                  type="button"
                  className={styles.stagePlayerButton}
                  onClick={() =>
                    sendVideoPlaybackCommand({ type: 'toggle-muted' })
                  }
                  title={videoPlaybackState?.muted ? 'Unmute' : 'Mute'}
                >
                  <Icon
                    name={videoPlaybackState?.muted ? 'volume-off' : 'volume'}
                    size={13}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  className={`${styles.stagePlayerButton} ${styles.stagePlayerTextButton}`}
                  disabled={videoTrimIsFull}
                  onClick={resetVideoTrim}
                  title="Use full source duration"
                >
                  <Icon name="reset" size={13} aria-hidden="true" />
                  <span>Full</span>
                </button>
              </div>
              <div className={styles.stageTimelineBody}>
                <div className={styles.stageTimelineTrackLabels}>
                  <span className={styles.stageTimelineTrackLabel}>Video 1</span>
                </div>
                <div className={styles.stageTimelineCanvas}>
                  <div className={styles.stageTimelineRuler} aria-hidden="true">
                    {stageTimelineTicks.map((tick) => (
                      <span
                        key={tick.id}
                        className={styles.stageTimelineTick}
                        style={{ left: `${tick.position}%` }}
                      >
                        {tick.label}
                      </span>
                    ))}
                  </div>
                  <div
                    ref={stageTimelineTrackRef}
                    className={styles.stageTimelineTrack}
                    onPointerDown={(event) =>
                      beginStageTimelineDrag('scrub', event)
                    }
                    onPointerMove={handleStageTimelinePointerMove}
                    onPointerUp={endStageTimelineDrag}
                    onPointerCancel={endStageTimelineDrag}
                    onLostPointerCapture={endStageTimelineDrag}
                    onKeyDown={handleStageTimelineKeyDown}
                    role="group"
                    aria-label="Video timeline"
                    tabIndex={0}
                  >
                    <div className={styles.stageTimelineClip}>
                      <button
                        type="button"
                        className={`${styles.stageTimelineTrimHandle} ${styles.stageTimelineTrimHandleStart}`}
                        onPointerDown={(event) =>
                          beginStageTimelineDrag('trim-start', event)
                        }
                        onPointerMove={handleStageTimelinePointerMove}
                        onPointerUp={endStageTimelineDrag}
                        onPointerCancel={endStageTimelineDrag}
                        onLostPointerCapture={endStageTimelineDrag}
                        title={`Trim start: ${formatPlaybackTime(videoTrimRange.startMs)}`}
                        aria-label="Trim video start"
                      >
                        <span className={styles.stageTimelineTrimGrip} aria-hidden="true" />
                      </button>
                      <span className={styles.stageTimelineClipName}>
                        {activeVideoAsset.name}
                      </span>
                      <span className={styles.stageTimelineClipDuration}>
                        {formatPlaybackTime(videoTrimRange.durationMs)}
                      </span>
                      <span className={styles.stageTimelineClipFrames} aria-hidden="true" />
                      <button
                        type="button"
                        className={`${styles.stageTimelineTrimHandle} ${styles.stageTimelineTrimHandleEnd}`}
                        onPointerDown={(event) =>
                          beginStageTimelineDrag('trim-end', event)
                        }
                        onPointerMove={handleStageTimelinePointerMove}
                        onPointerUp={endStageTimelineDrag}
                        onPointerCancel={endStageTimelineDrag}
                        onLostPointerCapture={endStageTimelineDrag}
                        title={`Trim end: ${formatPlaybackTime(videoTrimRange.endMs)}`}
                        aria-label="Trim video end"
                      >
                        <span className={styles.stageTimelineTrimGrip} aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.stageTimelinePlayhead}
                      onPointerDown={(event) =>
                        beginStageTimelineDrag('scrub', event)
                      }
                      onPointerMove={handleStageTimelinePointerMove}
                      onPointerUp={endStageTimelineDrag}
                      onPointerCancel={endStageTimelineDrag}
                      onLostPointerCapture={endStageTimelineDrag}
                      onKeyDown={handleStageTimelineKeyDown}
                      title="Drag current frame"
                      aria-label={`Current frame: ${formatTimelineClock(
                        stagePlayerCurrentTimeMs
                      )}`}
                    >
                      <span className={styles.stageTimelinePlayheadLabel}>
                        {formatTimelineClock(stagePlayerCurrentTimeMs)}
                      </span>
                      <span className={styles.stageTimelinePlayheadKnob} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
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
          onBackgroundImageChoose={() => openMediaPicker({ mode: 'background-new' })}
          onBackgroundImageRelink={openRelinkBackgroundPicker}
          onBackgroundImageClear={clearActiveBackgroundImage}
          showBackgroundAnimationControl={
            effectiveCompositionMode === 'motion' && backgroundAnimationAvailable
          }
          backgroundAnimationAvailable={backgroundAnimationAvailable}
          backgroundAnimationEnabled={backgroundAnimationEnabled}
          onBackgroundAnimationChange={(enabled) =>
            updateActiveExport({ animateBackground: enabled })
          }
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
          onFrameShellTextChange={(titleText) =>
            updateActiveFrame({ chromeText: titleText })
          }
          onPaddingChange={(padding) => updateActiveFrame({ padding })}
          onFrameContentPaddingChange={(contentPadding) =>
            updateActiveFrame({ contentPadding })
          }
          onRadiusChange={(cornerRadius) => updateActiveFrame({ cornerRadius })}
          onFrameShadowChange={updateActiveFrame}
          onTextChange={updateActiveText}
          onTextLayerAdd={addActiveTextLayer}
          onTextLayerChange={updateActiveTextLayer}
          onTextLayerDuplicate={duplicateActiveTextLayer}
          onTextLayerMove={moveActiveTextLayer}
          onTextLayerReorder={reorderActiveTextLayer}
          onTextLayerRemove={removeActiveTextLayer}
          onActiveTextLayerChange={(activeTextLayerId) =>
            updateActiveCard({ activeTextLayerId })
          }
        />
      </main>

      {isDragging ? (
        <div className={styles.dropOverlay}>
          <div className={styles.dropTarget}>
            <Icon name="upload" size={32} aria-hidden="true" />
            <span className={styles.dropTitle}>Drop media</span>
            <span className={styles.dropHint}>
              PNG, JPG, WebP, MP4, MOV or WebM
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
