import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAUNCH_KIT_THEME,
  LaunchKitProjectSchema,
  createLaunchKitProject
} from './project';

describe('LaunchKitProjectSchema', () => {
  it('accepts the default project factory output', () => {
    const project = createLaunchKitProject({
      id: 'demo-project',
      name: 'Demo Launch Kit',
      appName: 'Pulse'
    });

    expect(LaunchKitProjectSchema.parse(project)).toEqual(project);
  });

  it('accepts a localized multi-slide project', () => {
    const project = createLaunchKitProject({
      id: 'localized-project',
      name: 'Localized Launch Kit',
      appName: 'Orbit'
    });

    project.locales = [
      { code: 'en-US', label: 'English (US)', isDefault: true },
      { code: 'de-DE', label: 'German', isDefault: false }
    ];
    project.targets = ['apple-iphone', 'apple-ipad', 'google-phone'];
    project.assets = [
      {
        id: 'screen-1',
        kind: 'screenshot',
        name: 'Home',
        mimeType: 'image/png',
        width: 1290,
        height: 2796,
        fileSize: 512000
      }
    ];
    project.slides = [
      {
        id: 'slide-1',
        sourceAssetId: 'screen-1',
        layoutPresetId: 'hero-center',
        framePresetId: 'iphone-dark',
        backgroundPresetId: DEFAULT_LAUNCH_KIT_THEME.backgroundPresetId,
        contentByLocale: {
          'en-US': {
            eyebrow: 'Track smarter',
            title: 'See every workout at a glance',
            subtitle: 'Live progress, trends, and faster logging.'
          },
          'de-DE': {
            eyebrow: 'Besser tracken',
            title: 'Alle Workouts auf einen Blick',
            subtitle: 'Live-Fortschritt, Trends und schnelleres Logging.'
          }
        }
      }
    ];

    expect(LaunchKitProjectSchema.parse(project)).toMatchObject({
      id: 'localized-project',
      targets: ['apple-iphone', 'apple-ipad', 'google-phone'],
      slides: [
        {
          contentByLocale: {
            'de-DE': {
              title: 'Alle Workouts auf einen Blick'
            }
          }
        }
      ]
    });
  });
});
