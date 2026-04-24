import {
  AnimationSettingsSchema,
  ConversionSettingsSchema,
  DEFAULT_ANIMATION_SETTINGS,
  DEFAULT_CONVERSION_SETTINGS,
  DEFAULT_PREVIEW_STATE,
  ExportOptionsSchema,
  PreviewStateSchema,
  type AnimationSettings,
  type ConversionSettings,
  type EngineEvent,
  type ExportOptions,
  type ExportResult,
  type PreviewState,
  type SourceDescriptor
} from '@glyphrame/schemas';

import { AsciiPreviewRenderer } from '../gpu/AsciiPreviewRenderer';
import { createEmitter } from '../internal/createEmitter';
import { SoftwarePreviewRenderer } from '../preview/SoftwarePreviewRenderer';
import type { EngineSessionState } from '../runtime/sessionState';
import { loadSourceAsset, type SourceInput } from '../source/loadSourceDescriptor';
import { exportPlaceholderResult } from '../export/exportPlaceholderResult';

export type EnginePreviewBackend = 'webgpu' | 'software';

export type CreateEngineSessionOptions = {
  previewTarget: HTMLCanvasElement;
  preferredBackend?: EnginePreviewBackend | 'auto';
};

export interface EngineSession {
  readonly backend: EnginePreviewBackend;
  loadSource(input: SourceInput): Promise<SourceDescriptor>;
  setConversionSettings(settings: ConversionSettings): Promise<void>;
  setAnimationSettings(settings: AnimationSettings): Promise<void>;
  setPreviewState(state: PreviewState): Promise<void>;
  export(options: ExportOptions): Promise<ExportResult>;
  subscribe(listener: (event: EngineEvent) => void): () => void;
  destroy(): Promise<void>;
}

type PreviewRenderer = {
  readonly backend: EnginePreviewBackend;
  render(state: EngineSessionState): void;
  destroy(): void;
};

async function createPreviewRenderer(
  options: CreateEngineSessionOptions
): Promise<PreviewRenderer> {
  const preferredBackend = options.preferredBackend ?? 'auto';
  const canTryWebGPU =
    preferredBackend !== 'software' &&
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    navigator.gpu != null;

  if (canTryWebGPU) {
    try {
      return await AsciiPreviewRenderer.create(options.previewTarget);
    } catch (error) {
      if (preferredBackend === 'webgpu') {
        throw error;
      }
    }
  }

  if (preferredBackend === 'webgpu') {
    throw new Error('WebGPU preview initialization failed.');
  }

  return new SoftwarePreviewRenderer(options.previewTarget);
}

export async function createEngineSession(
  options: CreateEngineSessionOptions
): Promise<EngineSession> {
  const emitter = createEmitter<EngineEvent>();
  let previewRenderer = await createPreviewRenderer(options);
  const strictWebGPU = (options.preferredBackend ?? 'auto') === 'webgpu';
  const state: EngineSessionState = {
    source: null,
    sourceBitmap: null,
    disposeSource: null,
    conversionSettings: DEFAULT_CONVERSION_SETTINGS,
    animationSettings: DEFAULT_ANIMATION_SETTINGS,
    previewState: DEFAULT_PREVIEW_STATE,
    asciiTextLines: []
  };

  const ensurePreviewRendered = () => {
    try {
      previewRenderer.render(state);
    } catch (error) {
      if (previewRenderer.backend !== 'webgpu' || strictWebGPU) {
        throw error;
      }

      previewRenderer.destroy();
      previewRenderer = new SoftwarePreviewRenderer(options.previewTarget);
      emitter.emit({
        type: 'warning',
        message:
          'WebGPU preview failed in this browser, so Glyphrame switched to CPU compatibility preview.'
      });
      previewRenderer.render(state);
    }
  };

  ensurePreviewRendered();

  return {
    get backend() {
      return previewRenderer.backend;
    },
    async loadSource(input) {
      const loaded = await loadSourceAsset(input);
      state.disposeSource?.();
      state.source = loaded.descriptor;
      state.sourceBitmap = loaded.bitmap;
      state.disposeSource = loaded.dispose;

      if (!loaded.bitmap) {
        emitter.emit({
          type: 'warning',
          message: `${loaded.descriptor.name} could not be decoded for preview in this browser.`
        });
      }

      ensurePreviewRendered();
      emitter.emit({ type: 'source-loaded', source: loaded.descriptor });
      emitter.emit({ type: 'preview-updated' });
      return loaded.descriptor;
    },
    async setConversionSettings(settings) {
      state.conversionSettings = ConversionSettingsSchema.parse({
        ...DEFAULT_CONVERSION_SETTINGS,
        ...settings
      });
      ensurePreviewRendered();
      emitter.emit({ type: 'preview-updated' });
    },
    async setAnimationSettings(settings) {
      state.animationSettings = AnimationSettingsSchema.parse(settings);
      ensurePreviewRendered();
      emitter.emit({ type: 'preview-updated' });
    },
    async setPreviewState(previewState) {
      state.previewState = PreviewStateSchema.parse(previewState);
      ensurePreviewRendered();
      emitter.emit({ type: 'preview-updated' });
    },
    async export(rawOptions) {
      const exportOptions = ExportOptionsSchema.parse(rawOptions);
      emitter.emit({ type: 'export-started', format: exportOptions.format });
      emitter.emit({ type: 'export-progress', progress: 0.25 });
      const result = await exportPlaceholderResult(exportOptions, {
        previewTarget: options.previewTarget,
        state
      });
      emitter.emit({ type: 'export-progress', progress: 1 });
      emitter.emit({ type: 'export-finished', result });
      return result;
    },
    subscribe(listener) {
      return emitter.subscribe(listener);
    },
    async destroy() {
      emitter.clear();
      state.disposeSource?.();
      state.disposeSource = null;
      state.sourceBitmap = null;
      previewRenderer.destroy();
    }
  };
}
