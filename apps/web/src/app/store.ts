import type { EngineCapabilities } from '@glyphrame/engine';
import type { SourceDescriptor } from '@glyphrame/schemas';
import { create } from 'zustand';

export type AppPhase = 'checking' | 'ready' | 'error';

type AppStore = {
  phase: AppPhase;
  capabilities: EngineCapabilities | null;
  source: SourceDescriptor | null;
  activityMessage: string;
  errorMessage: string | null;
  setPhase: (phase: AppPhase) => void;
  setCapabilities: (capabilities: EngineCapabilities) => void;
  setSource: (source: SourceDescriptor | null) => void;
  setActivityMessage: (message: string) => void;
  setErrorMessage: (message: string | null) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  phase: 'checking',
  capabilities: null,
  source: null,
  activityMessage: 'Booting compatibility checks...',
  errorMessage: null,
  setPhase: (phase) => set({ phase }),
  setCapabilities: (capabilities) => set({ capabilities }),
  setSource: (source) => set({ source }),
  setActivityMessage: (activityMessage) => set({ activityMessage }),
  setErrorMessage: (errorMessage) => set({ errorMessage })
}));
