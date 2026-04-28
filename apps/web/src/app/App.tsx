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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

type SourceImportIntent =
  | { mode: 'auto' }
  | { mode: 'new' }
  | { mode: 'relink'; assetId: string };

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

function isMissingRenderableSource(
  card: MantleCard,
  asset: RuntimeMantleProject['assets'][number] | undefined
): boolean {
  return Boolean(card.sourceAssetId) && !hasRenderableAssetSource(asset);
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

function relinkMissingAssetNotice(): Omit<AppNotice, 'id'> {
  return {
    tone: 'warning',
    title: 'Reimport source image',
    detail: 'Saved projects keep image metadata only. Relink the local screenshot to render or export this card.'
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
      detail: 'Choose PNG, JPEG or WebP for this browser.'
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
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | null>(null);
  const sourceImportIntentRef = useRef<SourceImportIntent>({ mode: 'auto' });

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
  const activeMissingSourceAssetId =
    activeCard?.sourceAssetId && !hasRenderableAssetSource(activeAsset)
      ? activeCard.sourceAssetId
      : undefined;
  const activeSourceMissing = activeMissingSourceAssetId != null;

  const openSourcePicker = useCallback((intent: SourceImportIntent = { mode: 'auto' }) => {
    sourceImportIntentRef.current = intent;
    fileInputRef.current?.click();
  }, []);

  const openRelinkSourcePicker = useCallback(() => {
    if (!activeMissingSourceAssetId) {
      openSourcePicker({ mode: 'new' });
      return;
    }

    openSourcePicker({
      mode: 'relink',
      assetId: activeMissingSourceAssetId
    });
  }, [activeMissingSourceAssetId, openSourcePicker]);

  const resolveSourceImportIntent = useCallback(
    (intent: SourceImportIntent): SourceImportIntent => {
      if (intent.mode === 'relink') return intent;
      if (intent.mode === 'auto' && activeMissingSourceAssetId) {
        return {
          mode: 'relink',
          assetId: activeMissingSourceAssetId
        };
      }
      return { mode: 'new' };
    },
    [activeMissingSourceAssetId]
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
    async (file: File, intent: SourceImportIntent = { mode: 'auto' }) => {
      if (!isSupportedSourceImage(file)) {
        showNotice(importFailureNotice(file));
        return;
      }

      const objectUrl = registerObjectUrl(URL.createObjectURL(file));
      const resolvedIntent = resolveSourceImportIntent(intent);
      try {
        const dimensions = await readImageDimensions(objectUrl);

        if (resolvedIntent.mode === 'relink') {
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
            title: 'Image relinked',
            detail: `${file.name} is attached to this card again.`
          });
          return;
        }

        const asset = createAssetFromFile(file, objectUrl, dimensions);
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
        showNotice({
          tone: 'success',
          title: 'Image imported',
          detail: `${file.name} is ready to render.`
        });
      } catch (error) {
        revokeObjectUrl(objectUrl);
        showNotice(importFailureNotice(file, toAppFailure(error)));
      }
    },
    [project.assets, registerObjectUrl, resolveSourceImportIntent, revokeObjectUrl, showNotice]
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
      if (activeCard?.sourceAssetId && !hasRenderableAssetSource(activeAsset)) {
        showNotice(relinkMissingAssetNotice());
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
      const result = await exportMantleProjectCard({
        project: projectForExport,
        cardId: cardForExport.id
      });

      if (copyToClipboard && 'ClipboardItem' in window && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ [result.mimeType]: result.blob })
        ]);
      } else {
        downloadBlob(result);
      }
      showNotice({
        tone: 'success',
        title: copyToClipboard ? 'Copied PNG' : 'Export ready',
        detail: copyToClipboard
          ? 'The rendered image is in your clipboard.'
          : `${result.filename} downloaded.`
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
          const intent = sourceImportIntentRef.current;
          sourceImportIntentRef.current = { mode: 'auto' };
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
              onClick={() => openSourcePicker({ mode: 'new' })}
              title="Import source image"
            >
              <Icon name="image" size={14} aria-hidden="true" />
              <span>Image</span>
            </button>
          </div>

          <button
            type="button"
            className={styles.ghostButton}
            disabled={isExporting}
            onClick={() => void handleExport(true)}
            title="Copy PNG to clipboard"
          >
            <Icon name="copy" size={14} aria-hidden="true" />
            <span>Copy PNG</span>
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isExporting}
            onClick={() => void handleExport(false)}
            title="Download image"
          >
            <Icon name="download" size={14} aria-hidden="true" />
            <span>{isExporting ? 'Exporting…' : 'Download'}</span>
          </button>
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
              const presets = group.presetIds
                .map((id) => STYLE_PRESETS.find((preset) => preset.id === id))
                .filter((preset): preset is StylePreset => preset !== undefined);
              if (presets.length === 0) return null;

              return (
                <div key={group.label} className={styles.presetGroup}>
                  <div className={styles.presetGroupHeader}>
                    <span>{group.label}</span>
                    <span className={styles.presetGroupCount}>{presets.length}</span>
                  </div>
                  <div className={styles.presetGroupGrid}>
                    {presets.map((preset) => (
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
            onChooseSource={() => openSourcePicker({ mode: 'new' })}
            onRelinkSource={openRelinkSourcePicker}
          />
        </section>

        <InspectorPanel
          card={activeCard}
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
          onExportFormatChange={(format) => updateActiveExport({ format })}
          onExportScaleChange={(scale) => updateActiveExport({ scale })}
          onExportQualityChange={(quality) =>
            updateActiveExport({ quality })
          }
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
