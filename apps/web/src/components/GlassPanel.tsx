import type { PropsWithChildren } from 'react';

import styles from './GlassPanel.module.css';

type GlassPanelVariant = 'panel' | 'floating' | 'flat';

type GlassPanelProps = PropsWithChildren<{
  className?: string | undefined;
  variant?: GlassPanelVariant;
  as?: 'section' | 'div' | 'aside' | 'header' | 'footer';
}>;

export function GlassPanel({
  children,
  className,
  variant = 'panel',
  as: Tag = 'section'
}: GlassPanelProps) {
  const classes = [styles.base, styles[variant], className]
    .filter(Boolean)
    .join(' ');

  return <Tag className={classes}>{children}</Tag>;
}
