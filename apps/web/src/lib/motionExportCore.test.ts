import { describe, expect, it } from 'vitest';

import { createMantleCard } from '@mantle/schemas/defaults';
import type { MantleRenderableAsset, MantleSurfaceTarget } from '@mantle/schemas/model';

import { createMantleGifExportPlan } from './exportGif';
import {
  createMantleMotionExportPlan,
  reportMotionProgress,
  throwIfMotionExportAborted,
  type MantleMotionExportInput,
  type MantleMotionExportProgress
} from './motionExportCore';

const target: MantleSurfaceTarget = {
  id: 'test-target',
  kind: 'custom',
  label: 'Test target',
  width: 100,
  height: 100,
  platform: 'custom'
};

const videoAsset: MantleRenderableAsset = {
  id: 'video-1',
  role: 'screenshot',
  name: 'clip.mp4',
  mediaKind: 'video',
  durationMs: 10_000,
  width: 1280,
  height: 720
};

describe('motion export planning', () => {
  it('uses the saved trim range for video exports', () => {
    const card = createMantleCard();
    card.export = {
      ...card.export,
      videoStartMs: 1200,
      videoEndMs: 4600,
      videoDurationMs: 9000,
      videoFrameRate: 24
    };

    const plan = createMantleMotionExportPlan(
      { card, target, asset: videoAsset },
      {
        defaultDurationMs: 3000,
        defaultFrameRate: 24,
        label: 'WebM',
        maxDurationMs: 60000,
        maxFrameRate: 60,
        maxFrames: 1000,
        maxPixelCount: 2_000_000,
        minFrameRate: 1,
        requestedDurationMs: card.export.videoDurationMs
      }
    );

    expect(plan.startMs).toBe(1200);
    expect(plan.endMs).toBe(4600);
    expect(plan.durationMs).toBe(3400);
  });

  it('uses requested duration for generated motion without a video trim end', () => {
    const card = createMantleCard();
    card.export = {
      ...card.export,
      videoDurationMs: 4200,
      videoFrameRate: 12
    };

    const plan = createMantleMotionExportPlan(
      { card, target },
      {
        defaultDurationMs: 3000,
        defaultFrameRate: 24,
        label: 'GIF',
        maxDurationMs: 30000,
        maxFrameRate: 24,
        maxFrames: 1000,
        maxPixelCount: 2_000_000,
        minFrameRate: 6,
        requestedDurationMs: card.export.videoDurationMs
      }
    );

    expect(plan.startMs).toBe(0);
    expect(plan.endMs).toBe(4200);
    expect(plan.durationMs).toBe(4200);
    expect(plan.frameRate).toBe(12);
    expect(plan.totalFramePixels).toBe(plan.pixelCount * plan.frameCount);
  });

  it('rejects motion exports with too many total frame pixels', () => {
    const card = createMantleCard();
    card.export = {
      ...card.export,
      videoDurationMs: 4000,
      videoFrameRate: 20
    };

    expect(() =>
      createMantleMotionExportPlan(
        {
          card,
          target: {
            ...target,
            width: 1000,
            height: 1000
          }
        },
        {
          defaultDurationMs: 3000,
          defaultFrameRate: 24,
          label: 'WebM',
          maxDurationMs: 60000,
          maxFrameRate: 60,
          maxFrames: 1000,
          maxPixelCount: 2_000_000,
          maxTotalFramePixels: 50_000_000,
          minFrameRate: 1,
          requestedDurationMs: card.export.videoDurationMs
        }
      )
    ).toThrow(/too heavy/i);
  });

  it('rejects GIF exports with too many total frame pixels', () => {
    const card = createMantleCard();
    card.export = {
      ...card.export,
      format: 'gif',
      gifDurationMs: 30_000,
      videoFrameRate: 8
    };

    expect(() =>
      createMantleGifExportPlan({
        card,
        target: {
          ...target,
          width: 1001,
          height: 1000
        }
      })
    ).toThrow(/too heavy/i);
  });

  it('throws immediately when motion export is aborted', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfMotionExportAborted(controller.signal)).toThrow(/abort/i);
  });

  it('clamps progress reports to the visible 0-100 range', () => {
    const progressReports: MantleMotionExportProgress[] = [];

    reportMotionProgress(
      {
        card: createMantleCard(),
        target,
        onProgress: (progress) => {
          progressReports.push(progress);
        }
      } satisfies MantleMotionExportInput,
      {
        phase: 'rendering',
        progress: 1.5,
        detail: 'Rendering'
      }
    );

    expect(progressReports[0]?.progress).toBe(1);
  });
});
