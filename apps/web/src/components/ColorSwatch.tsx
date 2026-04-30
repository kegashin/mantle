import { useId } from 'react';

import { Icon } from './Icon';
import styles from './ColorSwatch.module.css';

type ColorSwatchProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onReset?: () => void;
  resetDisabled?: boolean;
};

function normalizeHex(value: string): string {
  return value.toUpperCase();
}

export function ColorSwatch({
  label,
  value,
  onChange,
  onReset,
  resetDisabled = false
}: ColorSwatchProps) {
  const inputId = useId();

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <label className={styles.swatch} htmlFor={inputId} title={label}>
          <span
            className={styles.swatchDot}
            style={{ background: value }}
            aria-hidden="true"
          />
          <span className={styles.swatchHex}>{normalizeHex(value)}</span>
          <input
            id={inputId}
            className={styles.swatchInput}
            type="color"
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </label>
        {onReset ? (
          <button
            type="button"
            className={styles.reset}
            disabled={resetDisabled}
            onClick={onReset}
            title="Reset to default"
            aria-label="Reset to default"
          >
            <Icon name="reset" size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
