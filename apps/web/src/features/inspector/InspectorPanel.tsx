import {
  FRAME_BOX_STYLE_IDS,
  FRAME_CHROME_PRESET_IDS,
  resolveFrameShadowSettings,
  resolveFrameBoxStyle,
  resolveBackgroundPresetDescriptor
} from '@mantle/engine/catalog';
import type {
  MantleCard,
  MantleBackgroundParamId,
  MantleBackgroundPresetId,
  MantleFrameBoxStyle,
  MantleFramePreset,
  MantleRenderableAsset,
  MantlePalette,
  MantleTextFont,
  MantleTextPlacement,
  MantleTextShadow,
  MantleSurfaceAspectRatioPreset,
  MantleSurfaceTarget
} from '@mantle/schemas/model';
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';

import { ColorSwatch } from '../../components/ColorSwatch';
import { Icon, type IconName } from '../../components/Icon';
import {
  MAX_GRADIENT_COLORS,
  MIN_GRADIENT_COLORS,
  createNextGradientColor,
  getGradientColorsFromBackground,
  isColorListBackgroundPreset
} from '../../lib/backgroundColors';
import { CSS_GLASS_FRAME_DEFAULTS } from '../../lib/frameMaterial';
import styles from './InspectorPanel.module.css';

type InspectorPanelProps = {
  card: MantleCard;
  backgroundAsset?: MantleRenderableAsset | undefined;
  targets: MantleSurfaceTarget[];
  onSurfaceSizeChange: (
    patch: Partial<Pick<MantleSurfaceTarget, 'width' | 'height'>>,
    options?: {
      ratio?: number;
      anchor?: 'width' | 'height';
      aspectRatioPresetId?: MantleSurfaceAspectRatioPreset;
    }
  ) => void;
  onSurfaceAspectRatioChange: (
    presetId: MantleSurfaceAspectRatioPreset,
    ratio?: number
  ) => void;
  onBackgroundPresetChange: (presetId: MantleBackgroundPresetId) => void;
  onBackgroundRandomize: () => void;
  onBackgroundColorsReset: () => void;
  onBackgroundParamChange: (paramId: MantleBackgroundParamId, value: number) => void;
  onBackgroundColorsChange: (colors: string[]) => void;
  onBackgroundImageChoose: () => void;
  onBackgroundImageRelink: () => void;
  onBackgroundImageClear: () => void;
  onPaletteChange: (patch: Partial<MantlePalette>) => void;
  onFramePresetChange: (preset: MantleFramePreset) => void;
  onFrameBoxStyleChange: (style: MantleFrameBoxStyle) => void;
  onFrameMaterialChange: (
    patch: Partial<
      Pick<
        MantleCard['frame'],
        'boxColor' | 'boxOpacity' | 'glassBlur' | 'glassOutlineOpacity'
      >
    >
  ) => void;
  onFrameChromeTextChange: (value: string | undefined) => void;
  onPaddingChange: (value: number) => void;
  onFrameContentPaddingChange: (value: number) => void;
  onRadiusChange: (value: number) => void;
  onFrameShadowChange: (
    patch: Partial<
      Pick<
        MantleCard['frame'],
        'shadowColor' | 'shadowStrength' | 'shadowSoftness' | 'shadowDistance'
      >
    >
  ) => void;
  onTextChange: (patch: Partial<MantleCard['text']>) => void;
};

type SliderFillStyle = CSSProperties & Record<'--slider-fill', string>;
type IconChoiceMeta = { label: string; icon: IconName };
type FrameShellGroup = {
  label: string;
  values: MantleFramePreset[];
};

const BOX_STYLE_LABELS: Record<MantleFrameBoxStyle, IconChoiceMeta> = {
  none: { label: 'None', icon: 'image' },
  solid: { label: 'Panel', icon: 'split' },
  'glass-panel': { label: 'Glass', icon: 'sparkle' }
};

const CHROME_LABELS: Record<MantleFramePreset, IconChoiceMeta> = {
  none: { label: 'None', icon: 'image' },
  'macos-window': { label: 'macOS window', icon: 'split' },
  'minimal-browser': { label: 'Browser', icon: 'eye' },
  'terminal-window': { label: 'Terminal', icon: 'sparkle' },
  'windows-window': { label: 'Windows', icon: 'split' },
  'code-editor': { label: 'Code editor', icon: 'sliders' },
  'document-page': { label: 'Document', icon: 'film' }
};

const FRAME_SHELL_GROUPS: FrameShellGroup[] = [
  {
    label: 'Basic',
    values: ['none']
  },
  {
    label: 'Windows',
    values: ['minimal-browser', 'macos-window', 'windows-window', 'terminal-window', 'code-editor']
  },
  {
    label: 'Editorial',
    values: ['document-page']
  }
];

const ALIGN_OPTIONS: Array<{ value: 'left' | 'center' | 'right'; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' }
];

const TEXT_PLACEMENT_OPTIONS: Array<{ value: MantleTextPlacement; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' }
];

const TEXT_SHADOW_OPTIONS: Array<{ value: MantleTextShadow; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' }
];

const TEXT_FONT_OPTIONS: Array<{ value: MantleTextFont; label: string }> = [
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

function isMantleTextFont(value: string): value is MantleTextFont {
  return TEXT_FONT_OPTIONS.some((option) => option.value === value);
}

function resolveTextFontValue(
  value: string,
  fallback: MantleTextFont
): MantleTextFont {
  return isMantleTextFont(value) ? value : fallback;
}

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const formatTurnsAsDegrees = (value: number) => `${Math.round(value * 360)}°`;
const formatPx = (value: number) => `${value}px`;
const formatFractionalPx = (value: number) =>
  `${Number.isInteger(value) ? value : value.toFixed(1)}px`;
const formatPreciseMultiplier = (value: number) => `${value.toFixed(2)}×`;

function decimalPlaces(value: number): number {
  const text = String(value);
  if (!text.includes('.')) return 0;
  return text.split('.')[1]?.length ?? 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapSliderValue(value: number, min: number, max: number, step: number): number {
  const clamped = clampNumber(value, min, max);
  if (step <= 0) return clamped;

  const snapped = Math.round((clamped - min) / step) * step + min;
  const precision = Math.max(decimalPlaces(step), decimalPlaces(min), decimalPlaces(max)) + 2;
  return clampNumber(Number(snapped.toFixed(precision)), min, max);
}

function formatSliderEditValue(value: number, scale: number): string {
  const scaled = value * scale;
  if (Number.isInteger(scaled)) return String(scaled);
  return String(Number(scaled.toFixed(2)));
}

function formatBackgroundParamValue(
  paramId: MantleBackgroundParamId,
  value: number
): string {
  return paramId === 'angle' ? formatTurnsAsDegrees(value) : formatPercent(value);
}

function defaultBoxColor(
  boxStyle: MantleFrameBoxStyle,
  palette: MantlePalette
): string {
  return boxStyle === 'solid' ? palette.background : CSS_GLASS_FRAME_DEFAULTS.boxColor;
}

function boxColorLabel(boxStyle: MantleFrameBoxStyle): string {
  if (boxStyle === 'glass-panel') {
    return 'Color';
  }
  return 'Panel color';
}

type AspectMode = MantleSurfaceAspectRatioPreset;

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
  defaultOpen = false,
  children
}: {
  icon: IconName;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={open ? `${styles.section} ${styles.sectionOpen}` : styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={styles.sectionIcon}>
          <Icon name={icon} size={13} aria-hidden="true" />
        </span>
        <span className={styles.sectionTitle}>{title}</span>
        <span
          className={open ? `${styles.sectionChevron} ${styles.sectionChevronOpen}` : styles.sectionChevron}
          aria-hidden="true"
        >
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
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

function IconChoiceGrid<T extends string>({
  activeValue,
  values,
  labels,
  onChange
}: {
  activeValue: T;
  values: readonly T[];
  labels: Record<T, IconChoiceMeta>;
  onChange: (next: T) => void;
}) {
  return (
    <div className={styles.frameList}>
      {values.map((value) => {
        const meta = labels[value];
        return (
          <button
            key={value}
            type="button"
            className={
              value === activeValue
                ? `${styles.frameButton} ${styles.frameButtonActive}`
                : styles.frameButton
            }
            onClick={() => onChange(value)}
          >
            <Icon name={meta.icon} size={13} aria-hidden="true" />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FrameShellGrid({
  activeValue,
  onChange
}: {
  activeValue: MantleFramePreset;
  onChange: (next: MantleFramePreset) => void;
}) {
  const knownValues = new Set(FRAME_CHROME_PRESET_IDS);
  const groups = FRAME_SHELL_GROUPS.map((group) => ({
    ...group,
    values: group.values.filter((value) => knownValues.has(value))
  })).filter((group) => group.values.length > 0);

  return (
    <div className={styles.frameShellGroups}>
      {groups.map((group) => (
        <div key={group.label} className={styles.frameShellGroup}>
          <div className={styles.frameSubGroupLabel}>{group.label}</div>
          <IconChoiceGrid
            activeValue={activeValue}
            values={group.values}
            labels={CHROME_LABELS}
            onChange={onChange}
          />
        </div>
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
  editScale = 1,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: number) => string;
  editScale?: number;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatSliderEditValue(value, editScale));
  const span = max - min;
  const fillPercent = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) * 100 : 0;
  const sliderFillStyle: SliderFillStyle = {
    '--slider-fill': `${fillPercent}%`
  };
  const editMin = min * editScale;
  const editMax = max * editScale;
  const editStep = step * editScale;

  useEffect(() => {
    if (!editing) {
      setDraft(formatSliderEditValue(value, editScale));
    }
  }, [editScale, editing, value]);

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      onChange(snapSliderValue(parsed / editScale, min, max, step));
    } else {
      setDraft(formatSliderEditValue(value, editScale));
    }
    setEditing(false);
  };

  return (
    <div className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{label}</span>
        {editing ? (
          <input
            aria-label={`${label} value`}
            autoFocus
            className={styles.sliderValueInput}
            inputMode="decimal"
            max={editMax}
            min={editMin}
            step={editStep}
            type="number"
            value={draft}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setDraft(formatSliderEditValue(value, editScale));
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={styles.sliderValueButton}
            onClick={() => setEditing(true)}
            title="Set exact value"
          >
            {format(value)}
          </button>
        )}
      </span>
      <span className={styles.sliderRow}>
        <span className={styles.sliderTicks} aria-hidden="true">
          <span className={styles.sliderTickMajor} />
          <span className={styles.sliderTickMinor} />
          <span className={styles.sliderTickMajor} />
          <span className={styles.sliderTickMinor} />
          <span className={styles.sliderTickMajor} />
        </span>
        <input
          className={styles.sliderInput}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={sliderFillStyle}
          aria-label={label}
          onChange={(event) =>
            onChange(snapSliderValue(Number(event.currentTarget.value), min, max, step))
          }
        />
      </span>
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

function getSimplifiedRatioParts(target: MantleSurfaceTarget | undefined): {
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
  backgroundAsset,
  targets,
  onSurfaceSizeChange,
  onSurfaceAspectRatioChange,
  onBackgroundRandomize,
  onBackgroundColorsReset,
  onBackgroundParamChange,
  onBackgroundColorsChange,
  onBackgroundImageChoose,
  onBackgroundImageRelink,
  onBackgroundImageClear,
  onPaletteChange,
  onFramePresetChange,
  onFrameBoxStyleChange,
  onFrameMaterialChange,
  onFrameChromeTextChange,
  onPaddingChange,
  onFrameContentPaddingChange,
  onRadiusChange,
  onFrameShadowChange,
  onTextChange
}: InspectorPanelProps) {
  const palette = card.background.palette;
  const activeTarget = useMemo(
    () => targets.find((target) => target.id === card.targetId) ?? targets[0],
    [card.targetId, targets]
  );
  const activeAspectRatio = useMemo<AspectMode>(() => {
    if (!activeTarget) return 'free';
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
  const activeBackgroundPresetId = card.background.presetId;
  const activeBackgroundPreset = resolveBackgroundPresetDescriptor(
    activeBackgroundPresetId
  );
  const isImageBackground = activeBackgroundPresetId === 'image-fill';
  const isImageBackgroundMissing =
    isImageBackground && Boolean(card.background.imageAssetId) && !backgroundAsset?.objectUrl;
  const gradientColors = useMemo(
    () => getGradientColorsFromBackground(card.background),
    [card.background]
  );
  const activeFrameBoxStyle = resolveFrameBoxStyle(card.frame);
  const activeFrameChromePreset = card.frame.preset;
  const isGlassMaterial = activeFrameBoxStyle === 'glass-panel';
  const shadowSettings = resolveFrameShadowSettings(card.frame, palette);
  const updateShadowSettings = (
    patch: Partial<
      Pick<
        MantleCard['frame'],
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
  const frameColorLabel = boxColorLabel(activeFrameBoxStyle);
  const frameInsetLabel =
    activeFrameChromePreset === 'none' ? 'Content inset' : 'Chrome gap';
  const usesColorList = isColorListBackgroundPreset(activeBackgroundPresetId);
  const showAccentColor =
    (usesColorList ||
      (activeBackgroundPresetId !== 'dot-grid' &&
        activeBackgroundPresetId !== 'solid-color')) &&
    !isImageBackground;
  const showForegroundColor =
    activeBackgroundPresetId !== 'solid-color' && !usesColorList && !isImageBackground;
  const showRandomize =
    usesColorList ||
    activeBackgroundPresetId === 'symbol-wave' ||
    activeBackgroundPresetId === 'falling-pattern' ||
    activeBackgroundPresetId === 'signal-field' ||
    activeBackgroundPresetId === 'smoke-veil' ||
    activeBackgroundPresetId === 'terminal-scanline' ||
    activeBackgroundPresetId === 'contour-lines';
  const colorListLabel = 'Gradient colors';
  const paletteFieldCount =
    1 + (showForegroundColor ? 1 : 0) + (showAccentColor ? 1 : 0);
  const paletteClassName =
    paletteFieldCount >= 3
      ? styles.paletteRow
      : paletteFieldCount === 2
        ? `${styles.paletteRow} ${styles.paletteRowCompact}`
        : `${styles.paletteRow} ${styles.paletteRowSingle}`;
  const isSideText = card.text.placement === 'left' || card.text.placement === 'right';
  const textWidthMin = isSideText ? 0.08 : 0.2;
  const textWidthMax = isSideText ? 0.52 : 1;
  const updateTextPlacement = (placement: MantleTextPlacement) => {
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
      <Section icon="grain" title="Background" defaultOpen>
        <div className={styles.presetIdentity}>
          <span className={styles.identityLabel}>{activeBackgroundPreset.label}</span>
          <span className={styles.identityHint}>{activeBackgroundPreset.hint}</span>
        </div>
        {isImageBackground ? (
          <div
            className={
              isImageBackgroundMissing
                ? `${styles.backgroundImagePanel} ${styles.backgroundImagePanelMissing}`
                : styles.backgroundImagePanel
            }
          >
            <div className={styles.backgroundImageMeta}>
              <span className={styles.backgroundImageLabel}>Selected image</span>
              <span className={styles.backgroundImageName}>
                {backgroundAsset?.name ?? 'Saved background image'}
              </span>
              {backgroundAsset?.width && backgroundAsset.height ? (
                <span className={styles.backgroundImageSize}>
                  {backgroundAsset.width} × {backgroundAsset.height}
                </span>
              ) : null}
              {isImageBackgroundMissing ? (
                <span className={styles.backgroundImageWarning}>
                  Project files store image metadata only. Relink the original file.
                </span>
              ) : null}
            </div>
            <div className={styles.backgroundImageActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={
                  isImageBackgroundMissing
                    ? onBackgroundImageRelink
                    : onBackgroundImageChoose
                }
                title={
                  isImageBackgroundMissing
                    ? 'Relink background image'
                    : 'Replace background image'
                }
              >
                <Icon name="image" size={13} aria-hidden="true" />
                <span>{isImageBackgroundMissing ? 'Relink' : 'Replace'}</span>
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={onBackgroundImageClear}
                title="Remove background image"
              >
                <Icon name="close" size={13} aria-hidden="true" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        ) : null}
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
                format={(value) => formatBackgroundParamValue(param.id, value)}
                editScale={param.id === 'angle' ? 360 : 100}
                onChange={(value) => onBackgroundParamChange(param.id, value)}
              />
            ))}
          </div>
        ) : null}
        {!isImageBackground ? (
          <div className={styles.backgroundActions}>
            {showRandomize ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={onBackgroundRandomize}
                title="Randomize background layout"
              >
                <Icon name="reset" size={13} aria-hidden="true" />
                <span>Randomize</span>
              </button>
            ) : null}
            <button
              type="button"
              className={styles.actionButton}
              onClick={onBackgroundColorsReset}
              title="Reset background colors"
            >
              <Icon name="reset" size={13} aria-hidden="true" />
              <span>Reset colors</span>
            </button>
          </div>
        ) : null}
        {isImageBackground ? null : usesColorList ? (
          <div className={styles.gradientColorPanel}>
            <div className={styles.gradientColorHeader}>
              <span>{colorListLabel}</span>
              <button
                type="button"
                className={styles.gradientAddButton}
                disabled={gradientColors.length >= MAX_GRADIENT_COLORS}
                onClick={() =>
                  onBackgroundColorsChange([
                    ...gradientColors,
                    createNextGradientColor(gradientColors)
                  ])
                }
              >
                Add color
              </button>
            </div>
            <div className={styles.gradientColorGrid}>
              {gradientColors.map((color, index) => (
                <div className={styles.gradientColorItem} key={index}>
                  <ColorSwatch
                    label={`Color ${index + 1}`}
                    value={color}
                    onChange={(next) => {
                      const nextColors = [...gradientColors];
                      nextColors[index] = next;
                      onBackgroundColorsChange(nextColors);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.gradientRemoveButton}
                    disabled={gradientColors.length <= MIN_GRADIENT_COLORS}
                    onClick={() =>
                      onBackgroundColorsChange(
                        gradientColors.filter((_, colorIndex) => colorIndex !== index)
                      )
                    }
                    title="Remove color"
                  >
                    <Icon name="close" size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={paletteClassName}>
            <ColorSwatch
              label="Background"
              value={palette.background}
              onChange={(next) => onPaletteChange({ background: next })}
            />
            {showForegroundColor ? (
              <ColorSwatch
                label="Foreground"
                value={palette.foreground}
                onChange={(next) => onPaletteChange({ foreground: next })}
              />
            ) : null}
            {showAccentColor ? (
              <ColorSwatch
                label="Accent"
                value={palette.accent}
                onChange={(next) => onPaletteChange({ accent: next })}
              />
            ) : null}
          </div>
        )}
      </Section>

      <Section icon="sliders" title="Frame" defaultOpen>
        <div className={styles.frameGroupLabel}>Material</div>
        <IconChoiceGrid
          activeValue={activeFrameBoxStyle}
          values={FRAME_BOX_STYLE_IDS}
          labels={BOX_STYLE_LABELS}
          onChange={onFrameBoxStyleChange}
        />
        {isGlassMaterial ? (
          <Slider
            label="Transparency"
            min={0}
            max={1}
            step={0.01}
            value={card.frame.boxOpacity ?? CSS_GLASS_FRAME_DEFAULTS.boxOpacity}
            format={formatPercent}
            editScale={100}
            onChange={(boxOpacity) => onFrameMaterialChange({ boxOpacity })}
          />
        ) : null}
        {isGlassMaterial ? (
          <Slider
            label="Blur"
            min={0}
            max={5}
            step={0.1}
            value={card.frame.glassBlur ?? CSS_GLASS_FRAME_DEFAULTS.glassBlur}
            format={formatFractionalPx}
            onChange={(glassBlur) => onFrameMaterialChange({ glassBlur })}
          />
        ) : null}
        {activeFrameBoxStyle === 'solid' || isGlassMaterial ? (
          <div className={`${styles.paletteRow} ${styles.paletteRowSingle}`}>
            <ColorSwatch
              label={frameColorLabel}
              value={card.frame.boxColor ?? defaultBoxColor(activeFrameBoxStyle, palette)}
              onChange={(next) => onFrameMaterialChange({ boxColor: next })}
            />
          </div>
        ) : null}
        {isGlassMaterial ? (
          <Slider
            label="Outline"
            min={0}
            max={1}
            step={0.01}
            value={
              card.frame.glassOutlineOpacity ??
              CSS_GLASS_FRAME_DEFAULTS.glassOutlineOpacity
            }
            format={formatPercent}
            editScale={100}
            onChange={(glassOutlineOpacity) =>
              onFrameMaterialChange({ glassOutlineOpacity })
            }
          />
        ) : null}
        <div className={styles.frameGroupLabel}>Presentation</div>
        <FrameShellGrid
          activeValue={activeFrameChromePreset}
          onChange={onFramePresetChange}
        />
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
          format={formatPx}
          onChange={onPaddingChange}
        />
        {activeFrameBoxStyle !== 'none' ? (
          <Slider
            label={frameInsetLabel}
            min={0}
            max={120}
            step={2}
            value={card.frame.contentPadding ?? 0}
            format={formatPx}
            onChange={onFrameContentPaddingChange}
          />
        ) : null}
        <Slider
          label="Corner radius"
          min={0}
          max={52}
          step={2}
          value={card.frame.cornerRadius}
          format={formatPx}
          onChange={onRadiusChange}
        />
        <div className={styles.frameGroupLabel}>Shadow</div>
        <Slider
          label="Strength"
          min={0}
          max={4}
          step={0.02}
          value={shadowSettings.strength}
          format={formatPercent}
          editScale={100}
          onChange={(shadowStrength) => updateShadowSettings({ shadowStrength })}
        />
        <Slider
          label="Softness"
          min={0}
          max={4}
          step={0.02}
          value={shadowSettings.softness}
          format={formatPercent}
          editScale={100}
          onChange={(shadowSoftness) => updateShadowSettings({ shadowSoftness })}
        />
        <Slider
          label="Drop distance"
          min={0}
          max={4}
          step={0.02}
          value={shadowSettings.distance}
          format={formatPercent}
          editScale={100}
          onChange={(shadowDistance) => updateShadowSettings({ shadowDistance })}
        />
        <div className={`${styles.paletteRow} ${styles.paletteRowSingle}`}>
          <ColorSwatch
            label="Color"
            value={shadowSettings.color}
            onChange={(shadowColor) => updateShadowSettings({ shadowColor })}
          />
        </div>
      </Section>

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
                      titleFont: resolveTextFontValue(
                        event.currentTarget.value,
                        card.text.titleFont
                      )
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
              <ColorSwatch
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
                      subtitleFont: resolveTextFontValue(
                        event.currentTarget.value,
                        card.text.subtitleFont
                      )
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
              <ColorSwatch
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
              format={formatPreciseMultiplier}
              onChange={(scale) => onTextChange({ scale })}
            />
            <Slider
              label={isSideText ? 'Column width' : 'Line width'}
              min={textWidthMin}
              max={textWidthMax}
              step={0.02}
              value={Math.max(textWidthMin, Math.min(card.text.width, textWidthMax))}
              format={formatPercent}
              editScale={100}
              onChange={(width) => onTextChange({ width })}
            />
            <Slider
              label="Gap"
              min={0}
              max={180}
              step={4}
              value={card.text.gap}
              format={formatPx}
              onChange={(gap) => onTextChange({ gap })}
            />
            <div className={styles.frameGroupLabel}>Shadow</div>
            <Segmented
              value={card.text.shadow}
              options={TEXT_SHADOW_OPTIONS}
              onChange={(shadow) => onTextChange({ shadow })}
            />
          </>
        ) : null}
      </Section>

    </aside>
  );
}
