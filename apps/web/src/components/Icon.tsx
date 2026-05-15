import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'upload'
  | 'image'
  | 'sparkle'
  | 'sliders'
  | 'film'
  | 'download'
  | 'copy'
  | 'reset'
  | 'undo'
  | 'redo'
  | 'plus'
  | 'arrow-up'
  | 'arrow-down'
  | 'play'
  | 'pause'
  | 'volume'
  | 'volume-off'
  | 'split'
  | 'eye'
  | 'zoom-fit'
  | 'zoom-100'
  | 'chevron'
  | 'close'
  | 'info'
  | 'alert'
  | 'check'
  | 'dot'
  | 'grain'
  | 'frame'
  | 'aspect-ratio'
  | 'type'
  | 'browser'
  | 'window-mac'
  | 'window-win'
  | 'terminal'
  | 'code'
  | 'document'
  | 'forbidden'
  | 'panel'
  | 'glass'
  | 'shuffle'
  | 'repeat';

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, ReactElement> = {
  upload: (
    <>
      <path d="M12 4v12" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10" />
      <path d="M18 6h2" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h4" />
      <path d="M12 12h8" />
      <circle cx="10" cy="12" r="2" />
      <path d="M4 18h12" />
      <path d="M20 18h0" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16" />
      <path d="M17 4v16" />
      <path d="M3 10h4" />
      <path d="M3 14h4" />
      <path d="M17 10h4" />
      <path d="M17 14h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  undo: (
    <>
      <path d="m9 14-5-5 5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </>
  ),
  play: <path d="M6 4v16l14-8Z" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 4 4" />
      <path d="m21 9-4 4" />
    </>
  ),
  split: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'zoom-fit': (
    <>
      <path d="M4 9V5h4" />
      <path d="M20 9V5h-4" />
      <path d="M4 15v4h4" />
      <path d="M20 15v4h-4" />
    </>
  ),
  'zoom-100': (
    <>
      <path d="M5 9h2v6" />
      <rect x="10" y="9" width="4" height="6" rx="2" />
      <rect x="16" y="9" width="4" height="6" rx="2" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h0" />
      <path d="M12 12v4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v4" />
      <path d="M12 17h0" />
    </>
  ),
  check: <path d="m5 12 5 5 9-11" />,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
  grain: (
    <>
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
      <circle cx="18" cy="6" r="1" fill="currentColor" />
      <circle cx="8" cy="14" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </>
  ),
  frame: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </>
  ),
  'aspect-ratio': (
    <>
      <rect x="3" y="3" width="18" height="10" rx="1.5" />
      <rect x="7" y="15" width="10" height="6" rx="1.5" />
    </>
  ),
  type: (
    <>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
    </>
  ),
  browser: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 6.5h10" />
    </>
  ),
  'window-mac': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6" cy="6.5" r="0.9" fill="currentColor" />
      <circle cx="8.5" cy="6.5" r="0.9" fill="currentColor" />
      <circle cx="11" cy="6.5" r="0.9" fill="currentColor" />
    </>
  ),
  'window-win': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M14.2 7h1.4" />
      <rect x="16.8" y="6.2" width="1.6" height="1.6" rx="0.2" />
      <path d="m19.6 6.2 1.4 1.6" />
      <path d="m21 6.2-1.4 1.6" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 10 3 2-3 2" />
      <path d="M13 14h4" />
    </>
  ),
  code: (
    <>
      <path d="m9 8-5 4 5 4" />
      <path d="m15 8 5 4-5 4" />
      <path d="m13 5-2 14" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M8 13h8" />
      <path d="M8 16h8" />
      <path d="M8 10h4" />
    </>
  ),
  forbidden: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.5 5.5 13 13" />
    </>
  ),
  panel: (
    <rect
      x="4"
      y="4"
      width="16"
      height="16"
      rx="2"
      fill="currentColor"
      fillOpacity="0.22"
    />
  ),
  glass: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m6 16 10-10" />
    </>
  ),
  shuffle: (
    <>
      <path d="m17 3 4 4-4 4" />
      <path d="M3 7h2c2 0 3 1 4 3" />
      <path d="M21 7h-4c-2 0-3 1-4 3" />
      <path d="m17 13 4 4-4 4" />
      <path d="M3 17h2c2 0 3-1 4-3" />
      <path d="M21 17h-4c-2 0-3-1-4-3" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  )
};

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
