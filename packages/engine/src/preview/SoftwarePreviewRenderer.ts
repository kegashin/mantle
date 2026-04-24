import type { EngineSessionState } from '../runtime/sessionState';
import { renderPreviewScene } from './renderPreviewScene';

export class SoftwarePreviewRenderer {
  readonly backend = 'software' as const;
  private readonly context: CanvasRenderingContext2D;
  private pendingState: EngineSessionState | null = null;
  private renderTimer: number | null = null;
  private isDestroyed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Preview canvas 2D context is unavailable.');
    }

    this.context = context;
  }

  render(state: EngineSessionState) {
    this.pendingState = state;

    if (this.renderTimer != null || this.isDestroyed) {
      return;
    }

    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;

      if (this.isDestroyed || !this.pendingState) {
        return;
      }

      const nextState = this.pendingState;
      this.pendingState = null;
      renderPreviewScene(this.canvas, nextState);

      if (this.pendingState) {
        this.render(this.pendingState);
      }
    }, 48);
  }

  destroy() {
    this.isDestroyed = true;
    if (this.renderTimer != null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
