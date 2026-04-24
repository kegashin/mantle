import {
  BACKGROUND_PRESETS,
  FRAME_BOX_STYLE_IDS,
  FRAME_CHROME_PRESET_IDS,
  normalizeBackgroundPresetId,
  normalizeFrameChromePreset,
  resolveFrameShadowSettings,
  resolveFrameBoxStyle,
  resolveBackgroundPresetDescriptor
} from '@glyphrame/engine';
import type {
  GlyphrameCard,
  GlyphrameExportFormat,
  GlyphrameFrameBoxStyle,
  GlyphrameFramePreset,
  GlyphramePalette,
  GlyphrameTextFont,
  GlyphrameTextPlacement,
  GlyphrameSurfaceAspectRatioPreset,
  GlyphrameSurfaceTarget
} from '@glyphrame/schemas';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Icon, type IconName } from '../../components/Icon';
import styles from './InspectorPanel.module.css';

type InspectorPanelProps = {
  card: GlyphrameCard;
  targets: GlyphrameSurfaceTarget[];
  onSurfaceSizeChange: (
    patch: Partial<Pick<GlyphrameSurfaceTarget, 'width' | 'height'>>,
    options?: {
      ratio?: number;
      anchor?: 'width' | 'height';
      aspectRatioPresetId?: GlyphrameSurfaceAspectRatioPreset;
    }
  ) => void;
  onSurfaceAspectRatioChange: (
    presetId: GlyphrameSurfaceAspectRatioPreset,
    ratio?: number
  ) => void;
  onBackgroundPresetChange: (presetId: string) => void;
  onBackgroundRandomize: () => void;
  onBackgroundParamChange: (paramId: string, value: number) => void;
  onPaletteChange: (patch: Partial<GlyphramePalette>) => void;
  onFramePresetChange: (preset: GlyphrameFramePreset) => void;
  onFrameBoxStyleChange: (style: GlyphrameFrameBoxStyle) => void;
  onFrameMaterialChange: (
    patch: Partial<
      Pick<GlyphrameCard['frame'], 'boxColor' | 'boxBorderColor' | 'boxOpacity'>
    >
  ) => void;
  onFrameChromeTextChange: (value: string | undefined) => void;
  onPaddingChange: (value: number) => void;
  onFrameContentPaddingChange: (value: number) => void;
  onRadiusChange: (value: number) => void;
  onFrameShadowChange: (
    patch: Partial<
      Pick<
        GlyphrameCard['frame'],
        'shadowColor' | 'shadowStrength' | 'shadowSoftness' | 'shadowDistance'
      >
    >
  ) => void;
  onTextChange: (patch: Partial<GlyphrameCard['text']>) => void;
  onExportFormatChange: (value: GlyphrameExportFormat) => void;
  onExportScaleChange: (value: number) => void;
  onExportQualityChange: (value: number) => void;
};

const BOX_STYLE_LABELS: Record<GlyphrameFrameBoxStyle, { label: string; icon: IconName }> = {
  none: { label: 'None', icon: 'image' },
  solid: { label: 'Panel', icon: 'split' },
  'soft-panel': { label: 'Glass', icon: 'sparkle' },
  'glass-panel': { label: 'Glass', icon: 'sparkle' }
};

const CHROME_LABELS: Record<
  Exclude<GlyphrameFramePreset, 'soft-panel' | 'glass-panel'>,
  { label: string; icon: IconName }
> = {
  none: { label: 'None', icon: 'image' },
  'macos-window': { label: 'macOS window', icon: 'split' },
  'minimal-browser': { label: 'Browser', icon: 'eye' },
  'terminal-window': { label: 'Terminal', icon: 'sparkle' },
  'windows-window': { label: 'Windows', icon: 'split' }
};

const ALIGN_OPTIONS: Array<{ value: 'left' | 'center' | 'right'; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' }
];

const TEXT_PLACEMENT_OPTIONS: Array<{ value: GlyphrameTextPlacement; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' }
];

const TEXT_FONT_OPTIONS: Array<{ value: GlyphrameTextFont; label: string }> = [
  { value: 'sans', label: 'Sans' },
  { value: 'system', label: 'System' },
  { value: 'display', label: 'Display' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'serif', label: 'Serif' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'slab', label: 'Slab' },
  { value: 'mono', label: 'Mono' },
  { value: 'code', label: 'Code' },
  { value: 'condensed', label: 'Condensed' }
];

const EXPORT_FORMATS: Array<{ value: GlyphrameExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' }
];

function defaultBoxColor(
  boxStyle: GlyphrameFrameBoxStyle,
  palette: GlyphramePalette
): string {
  return boxStyle === 'solid' ? palette.background : '#ffffff';
}

function defaultBoxBorderColor(
  boxStyle: GlyphrameFrameBoxStyle,
  palette: GlyphramePalette
): string {
  if (boxStyle === 'solid') return palette.foreground;
  return '#ffffff';
}

function boxColorLabels(boxStyle: GlyphrameFrameBoxStyle): {
  tint: string;
  edge: string;
} {
  if (boxStyle === 'glass-panel' || boxStyle === 'soft-panel') {
    return { tint: 'Glass tint', edge: 'Glass edge' };
  }
  return { tint: 'Panel color', edge: 'Panel edge' };
}

type AspectMode = Exclude<GlyphrameSurfaceAspectRatioPreset, 'custom'>;

const ASPECT_RATIO_OPTIONS: Array<{
  value: AspectMode;
  label: string;
  ratio?: number;
}> = [
  { value: 'free', label: 'Free' },
  { value: 'custom-ratio', label: 'Custom' },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '9:16', label: '9:16', ratio: 9 / 16 },
  { value: '4:5', label: '4:5', ratio: 4 / 5 },
  { value: '1.91:1', label: '1.91:1', ratio: 1200 / 630 }
];

function Section({
  icon,
  title,
  children
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <Icon name={icon} size={13} />
        <span>{title}</span>
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function DimensionField({
  label,
  value,
  min = 320,
  max = 4096,
  onCommit
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const next = Number.parseInt(draft, 10);
    if (Number.isFinite(next)) {
      onCommit(next);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <label className={styles.dimensionField}>
      <span>{label}</span>
      <input
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        type="number"
        value={draft}
        onBlur={commit}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            option.value === value
              ? `${styles.segmentedOption} ${styles.segmentedOptionActive}`
              : styles.segmentedOption
          }
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  format = (v) => String(v),
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{label}</span>
        <span className={styles.sliderValue}>{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  onReset,
  resetDisabled = false
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onReset?: () => void;
  resetDisabled?: boolean;
}) {
  return (
    <div className={styles.colorField}>
      <span className={styles.colorLabel}>{label}</span>
      <div
        className={
          onReset
            ? `${styles.colorControl} ${styles.colorControlWithReset}`
            : styles.colorControl
        }
      >
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span className={styles.colorHex}>{value.toUpperCase()}</span>
        {onReset ? (
          <button
            type="button"
            className={styles.colorResetButton}
            disabled={resetDisabled}
            onClick={onReset}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) {
    const next = b;
    b = a % b;
    a = next;
  }
  return a || 1;
}

function getSimplifiedRatioParts(target: GlyphrameSurfaceTarget | undefined): {
  width: number;
  height: number;
} {
  if (!target) return { width: 16, height: 9 };
  const divisor = gcd(target.width, target.height);
  const width = Math.round(target.width / divisor);
  const height = Math.round(target.height / divisor);

  if (width <= 99 && height <= 99) {
    return { width, height };
  }

  return {
    width: Math.max(1, Math.min(99, Math.round(target.width / Math.max(target.width, target.height) * 99))),
    height: Math.max(1, Math.min(99, Math.round(target.height / Math.max(target.width, target.height) * 99)))
  };
}

export function InspectorPanel({
  card,
  targets,
  onSurfaceSizeChange,
  onSurfaceAspectRatioChange,
  onBackgroundPresetChange,
  onBackgroundRandomize,
  onBackgroundParamChange,
  onPaletteChange,
  onFramePresetChange,
  onFrameBoxStyleChange,
  onFrameMaterialChange,
  onFrameChromeTextChange,
  onPaddingChange,
  onFrameContentPaddingChange,
  onRadiusChange,
  onFrameShadowChange,
  onTextChange,
  onExportFormatChange,
  onExportScaleChange,
  onExportQualityChange
}: InspectorPanelProps) {
  const palette = card.background.palette;
  const showQuality = card.export.format !== 'png';
  const activeTarget = useMemo(
    () => targets.find((target) => target.id === card.targetId) ?? targets[0],
    [card.targetId, targets]
  );
  const activeAspectRatio = useMemo<AspectMode>(() => {
    if (!activeTarget) return 'free';
    if (activeTarget.aspectRatioPresetId === 'custom') return 'free';
    if (activeTarget.aspectRatioPresetId) return activeTarget.aspectRatioPresetId;

    const ratio = activeTarget.width / activeTarget.height;
    const match = ASPECT_RATIO_OPTIONS.find(
      (option) => option.ratio && Math.abs(option.ratio - ratio) < 0.01
    );
    return match?.value ?? 'free';
  }, [activeTarget]);
  const customRatioParts = useMemo(
    () => getSimplifiedRatioParts(activeTarget),
    [activeTarget]
  );
  const activeRatio = useMemo(() => {
    if (activeAspectRatio === 'custom-ratio') {
      return activeTarget ? activeTarget.width / activeTarget.height : 16 / 9;
    }

    return ASPECT_RATIO_OPTIONS.find((option) => option.value === activeAspectRatio)
      ?.ratio;
  }, [activeAspectRatio, activeTarget]);
  const activeBackgroundPresetId = normalizeBackgroundPresetId(
    card.background.presetId
  );
  const activeBackgroundPreset = resolveBackgroundPresetDescriptor(
    activeBackgroundPresetId
  );
  const activeFrameBoxStyle = resolveFrameBoxStyle(card.frame);
  const exportWidth = activeTarget ? activeTarget.width * card.export.scale : 0;
  const exportHeight = activeTarget ? activeTarget.height * card.export.scale : 0;
  const activeFrameChromePreset = normalizeFrameChromePreset(card.frame.preset);
  const shadowSettings = resolveFrameShadowSettings(card.frame, palette);
  const updateShadowSettings = (
    patch: Partial<
      Pick<
        GlyphrameCard['frame'],
        'shadowColor' | 'shadowStrength' | 'shadowSoftness' | 'shadowDistance'
      >
    >
  ) =>
    onFrameShadowChange({
      shadowColor: shadowSettings.color,
      shadowStrength: shadowSettings.strength,
      shadowSoftness: shadowSettings.softness,
      shadowDistance: shadowSettings.distance,
      ...patch
    });
  const frameColorLabels = boxColorLabels(activeFrameBoxStyle);
  const frameInsetLabel =
    activeFrameChromePreset === 'none' ? 'Content inset' : 'Chrome gap';
  const showAccentColor =
    activeBackgroundPresetId !== 'dot-grid' &&
    activeBackgroundPresetId !== 'solid-color';
  const showForegroundColor = activeBackgroundPresetId !== 'solid-color';
  const showRandomize =
    activeBackgroundPresetId === 'terminal-scanline' ||
    activeBackgroundPresetId === 'contour-lines';
  const paletteClassName = showForegroundColor
    ? showAccentColor
      ? styles.paletteRow
      : `${styles.paletteRow} ${styles.paletteRowCompact}`
    : `${styles.paletteRow} ${styles.paletteRowSingle}`;
  const isSideText = card.text.placement === 'left' || card.text.placement === 'right';
  const textWidthMin = isSideText ? 0.08 : 0.2;
  const textWidthMax = isSideText ? 0.52 : 1;
  const updateTextPlacement = (placement: GlyphrameTextPlacement) => {
    const sidePlacement = placement === 'left' || placement === 'right';
    onTextChange({
      placement,
      width: sidePlacement
        ? Math.min(card.text.width, 0.32)
        : Math.max(card.text.width, 0.68)
    });
  };

  return (
    <aside className={styles.inspector}>
      <Section icon="split" title="Canvas size">
        {activeTarget ? (
          <>
            <div className={styles.ratioGrid}>
              {ASPECT_RATIO_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    option.value === activeAspectRatio
                      ? `${styles.ratioButton} ${styles.ratioButtonActive}`
                      : styles.ratioButton
                  }
                  onClick={() => onSurfaceAspectRatioChange(option.value, option.ratio)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {activeAspectRatio === 'custom-ratio' ? (
              <div className={styles.dimensionGrid}>
                <DimensionField
                  label="Ratio W"
                  min={1}
                  max={99}
                  value={customRatioParts.width}
                  onCommit={(ratioWidth) =>
                    onSurfaceAspectRatioChange(
                      'custom-ratio',
                      ratioWidth / customRatioParts.height
                    )
                  }
                />
                <DimensionField
                  label="Ratio H"
                  min={1}
                  max={99}
                  value={customRatioParts.height}
                  onCommit={(ratioHeight) =>
                    onSurfaceAspectRatioChange(
                      'custom-ratio',
                      customRatioParts.width / ratioHeight
                    )
                  }
                />
              </div>
            ) : null}
            <div className={styles.dimensionGrid}>
              <DimensionField
                label="Width"
                value={activeTarget.width}
                onCommit={(width) =>
                  onSurfaceSizeChange(
                    { width },
                    activeRatio
                      ? {
                          ratio: activeRatio,
                          anchor: 'width',
                          aspectRatioPresetId: activeAspectRatio
                        }
                      : { aspectRatioPresetId: activeAspectRatio }
                  )
                }
              />
              <DimensionField
                label="Height"
                value={activeTarget.height}
                onCommit={(height) =>
                  onSurfaceSizeChange(
                    { height },
                    activeRatio
                      ? {
                          ratio: activeRatio,
                          anchor: 'height',
                          aspectRatioPresetId: activeAspectRatio
                        }
                      : { aspectRatioPresetId: activeAspectRatio }
                  )
                }
              />
            </div>
          </>
        ) : null}
      </Section>

      <Section icon="grain" title="Background">
        <div className={styles.stylesList}>
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={
                preset.id === activeBackgroundPresetId
                  ? `${styles.styleButton} ${styles.styleButtonActive}`
                  : styles.styleButton
              }
              onClick={() => onBackgroundPresetChange(preset.id)}
            >
              <span className={styles.styleLabel}>{preset.label}</span>
              <span className={styles.styleHint}>{preset.hint}</span>
            </button>
          ))}
        </div>
        {activeBackgroundPreset.params.length > 0 ? (
          <div className={styles.parameterStack}>
            {activeBackgroundPreset.params.map((param) => (
              <Slider
                key={param.id}
                label={param.label}
                min={param.min}
                max={param.max}
                step={param.step}
                value={card.background.params?.[param.id] ?? param.defaultValue}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(value) => onBackgroundParamChange(param.id, value)}
              />
            ))}
          </div>
        ) : null}
        {showRandomize ? (
          <div className={styles.backgroundActions}>
            <button
              type="button"
              className={styles.randomizeButton}
              onClick={onBackgroundRandomize}
              title="Randomize background layout"
            >
              <Icon name="reset" size={13} />
              <span>Randomize</span>
            </button>
          </div>
        ) : null}
        <div className={paletteClassName}>
          <ColorField
            label="Background"
            value={palette.background}
            onChange={(next) => onPaletteChange({ background: next })}
          />
          {showForegroundColor ? (
            <ColorField
              label="Foreground"
              value={palette.foreground}
              onChange={(next) => onPaletteChange({ foreground: next })}
            />
          ) : null}
          {showAccentColor ? (
            <ColorField
              label="Accent"
              value={palette.accent}
              onChange={(next) => onPaletteChange({ accent: next })}
            />
          ) : null}
        </div>
      </Section>

      <Section icon="sliders" title="Frame">
        <div className={styles.frameGroupLabel}>Material</div>
        <div className={styles.frameList}>
          {FRAME_BOX_STYLE_IDS.map((style) => {
            const meta = BOX_STYLE_LABELS[style];
            return (
              <button
                key={style}
                type="button"
                className={
                  style === activeFrameBoxStyle
                    ? `${styles.frameButton} ${styles.frameButtonActive}`
                    : styles.frameButton
                }
                onClick={() => onFrameBoxStyleChange(style)}
              >
                <Icon name={meta.icon} size={13} />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
        {activeFrameBoxStyle !== 'none' ? (
          <div className={`${styles.paletteRow} ${styles.paletteRowCompact}`}>
            <ColorField
              label={frameColorLabels.tint}
              value={card.frame.boxColor ?? defaultBoxColor(activeFrameBoxStyle, palette)}
              onChange={(next) => onFrameMaterialChange({ boxColor: next })}
            />
            <ColorField
              label={frameColorLabels.edge}
              value={
                card.frame.boxBorderColor ??
                defaultBoxBorderColor(activeFrameBoxStyle, palette)
              }
              onChange={(next) => onFrameMaterialChange({ boxBorderColor: next })}
            />
          </div>
        ) : null}
        {activeFrameBoxStyle === 'glass-panel' ? (
          <Slider
            label="Glass opacity"
            min={0}
            max={2}
            step={0.02}
            value={card.frame.boxOpacity ?? 1}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(boxOpacity) => onFrameMaterialChange({ boxOpacity })}
          />
        ) : null}
        <div className={styles.frameGroupLabel}>Chrome</div>
        <div className={styles.frameList}>
          {FRAME_CHROME_PRESET_IDS.map((preset) => {
            const meta = CHROME_LABELS[preset];
            return (
              <button
                key={preset}
                type="button"
                className={
                  preset === activeFrameChromePreset
                    ? `${styles.frameButton} ${styles.frameButtonActive}`
                    : styles.frameButton
                }
                onClick={() => onFramePresetChange(preset)}
              >
                <Icon name={meta.icon} size={13} />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
        {activeFrameChromePreset !== 'none' ? (
          <label className={styles.textField}>
            <span>Bar text</span>
            <input
              value={card.frame.chromeText ?? ''}
              placeholder="Auto from card name"
              onChange={(event) =>
                onFrameChromeTextChange(event.currentTarget.value || undefined)
              }
            />
          </label>
        ) : null}
        <div className={styles.frameGroupLabel}>Layout</div>
        <Slider
          label="Canvas inset"
          min={0}
          max={240}
          step={4}
          value={card.frame.padding}
          format={(v) => `${v}px`}
          onChange={onPaddingChange}
        />
        {activeFrameBoxStyle !== 'none' ? (
          <Slider
            label={frameInsetLabel}
            min={0}
            max={120}
            step={2}
            value={card.frame.contentPadding ?? 0}
            format={(v) => `${v}px`}
            onChange={onFrameContentPaddingChange}
          />
        ) : null}
        <Slider
          label="Corner radius"
          min={0}
          max={52}
          step={2}
          value={card.frame.cornerRadius}
          format={(v) => `${v}px`}
          onChange={onRadiusChange}
        />
        <div className={styles.frameGroupLabel}>Shadow</div>
        <Slider
          label="Strength"
          min={0}
          max={2}
          step={0.02}
          value={shadowSettings.strength}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(shadowStrength) => updateShadowSettings({ shadowStrength })}
        />
        <Slider
          label="Softness"
          min={0}
          max={2.5}
          step={0.02}
          value={shadowSettings.softness}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(shadowSoftness) => updateShadowSettings({ shadowSoftness })}
        />
        <Slider
          label="Drop distance"
          min={0}
          max={2}
          step={0.02}
          value={shadowSettings.distance}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(shadowDistance) => updateShadowSettings({ shadowDistance })}
        />
        <div className={`${styles.paletteRow} ${styles.paletteRowSingle}`}>
          <ColorField
            label="Color"
            value={shadowSettings.color}
            onChange={(shadowColor) => updateShadowSettings({ shadowColor })}
          />
        </div>
      </Section>

      <Section icon="wand" title="Text">
        <Segmented
          value={card.text.placement}
          options={TEXT_PLACEMENT_OPTIONS}
          onChange={updateTextPlacement}
        />
        {card.text.placement !== 'none' ? (
          <>
            <label className={styles.textField}>
              <span>Title</span>
              <textarea
                rows={2}
                value={card.text.title ?? ''}
                placeholder="Optional title"
                onChange={(event) =>
                  onTextChange({ title: event.currentTarget.value || undefined })
                }
              />
            </label>
            <label className={styles.textField}>
              <span>Subtitle</span>
              <textarea
                rows={2}
                value={card.text.subtitle ?? ''}
                placeholder="Optional supporting line"
                onChange={(event) =>
                  onTextChange({ subtitle: event.currentTarget.value || undefined })
                }
              />
            </label>
            <Segmented
              value={card.text.align}
              options={ALIGN_OPTIONS}
              onChange={(align) => onTextChange({ align })}
            />
            <div className={styles.textStyleRow}>
              <label className={styles.selectField}>
                <span>Title font</span>
                <select
                  value={card.text.titleFont}
                  onChange={(event) =>
                    onTextChange({
                      titleFont: event.currentTarget.value as GlyphrameTextFont
                    })
                  }
                >
                  {TEXT_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <ColorField
                label="Title color"
                value={card.text.titleColor ?? palette.foreground}
                onChange={(titleColor) => onTextChange({ titleColor })}
                onReset={() => onTextChange({ titleColor: undefined })}
                resetDisabled={!card.text.titleColor}
              />
            </div>
            <div className={styles.textStyleRow}>
              <label className={styles.selectField}>
                <span>Paragraph font</span>
                <select
                  value={card.text.subtitleFont}
                  onChange={(event) =>
                    onTextChange({
                      subtitleFont: event.currentTarget.value as GlyphrameTextFont
                    })
                  }
                >
                  {TEXT_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <ColorField
                label="Paragraph color"
                value={card.text.subtitleColor ?? palette.muted ?? palette.foreground}
                onChange={(subtitleColor) => onTextChange({ subtitleColor })}
                onReset={() => onTextChange({ subtitleColor: undefined })}
                resetDisabled={!card.text.subtitleColor}
              />
            </div>
            <Slider
              label="Text scale"
              min={0.6}
              max={1.8}
              step={0.02}
              value={card.text.scale}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(scale) => onTextChange({ scale })}
            />
            <Slider
              label={isSideText ? 'Column width' : 'Line width'}
              min={textWidthMin}
              max={textWidthMax}
              step={0.02}
              value={Math.max(textWidthMin, Math.min(card.text.width, textWidthMax))}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(width) => onTextChange({ width })}
            />
            <Slider
              label="Gap"
              min={0}
              max={180}
              step={4}
              value={card.text.gap}
              format={(v) => `${v}px`}
              onChange={(gap) => onTextChange({ gap })}
            />
          </>
        ) : null}
      </Section>

      <Section icon="download" title="Export">
        <Segmented
          value={card.export.format}
          options={EXPORT_FORMATS}
          onChange={onExportFormatChange}
        />
        <Slider
          label="Scale"
          min={1}
          max={5}
          step={1}
          value={card.export.scale}
          format={(v) => `${v}×`}
          onChange={onExportScaleChange}
        />
        {activeTarget ? (
          <div className={styles.exportSummary}>
            <span>Output size</span>
            <strong>
              {exportWidth} × {exportHeight}
            </strong>
          </div>
        ) : null}
        {showQuality ? (
          <Slider
            label="Quality"
            min={0.5}
            max={1}
            step={0.02}
            value={card.export.quality ?? 0.92}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={onExportQualityChange}
          />
        ) : null}
      </Section>
    </aside>
  );
}
