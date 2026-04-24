export type EngineSupportStatus = 'supported' | 'unsupported';

export type EngineCapabilities = {
  status: EngineSupportStatus;
  requiresSecureContext: boolean;
  hasWebGPU: boolean;
  hasAdapter: boolean;
  workerWebGPUSupported: boolean;
  reasons: string[];
  warnings: string[];
};

export async function detectEngineCapabilities(): Promise<EngineCapabilities> {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const hasWindow = typeof window !== 'undefined';
  const isSecureContextValue = hasWindow ? window.isSecureContext : false;
  const hasWebGPU =
    typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu != null;
  const hasWorkerSupport = typeof Worker !== 'undefined';
  let hasAdapter = false;

  if (hasWebGPU) {
    try {
      hasAdapter = (await navigator.gpu.requestAdapter()) != null;
    } catch {
      hasAdapter = false;
      warnings.push('navigator.gpu exists, but requesting an adapter failed.');
    }
  }

  const workerWebGPUSupported = hasWebGPU && hasWorkerSupport;

  if (!isSecureContextValue) {
    reasons.push('WebGPU requires a secure context. Use HTTPS or localhost.');
  }

  if (!hasWebGPU) {
    reasons.push('This browser does not expose navigator.gpu.');
  }

  if (hasWebGPU && !hasAdapter) {
    reasons.push('WebGPU is exposed, but no GPU adapter is currently available.');
  }

  if (!hasWorkerSupport) {
    reasons.push('Dedicated workers are unavailable in this browser.');
  }

  if (hasWebGPU && !workerWebGPUSupported) {
    warnings.push('Main-thread WebGPU exists, but worker support is not available yet.');
  }

  return {
    status: reasons.length === 0 ? 'supported' : 'unsupported',
    requiresSecureContext: !isSecureContextValue,
    hasWebGPU,
    hasAdapter,
    workerWebGPUSupported,
    reasons,
    warnings
  };
}
