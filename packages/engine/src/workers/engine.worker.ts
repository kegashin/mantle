import type { WorkerRequest, WorkerResponse } from '../internal/protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'ping') {
    const response: WorkerResponse = {
      type: 'pong',
      ok: true
    };

    self.postMessage(response);
    return;
  }

  if (message.type === 'dispose') {
    const response: WorkerResponse = {
      type: 'disposed'
    };

    self.postMessage(response);
    self.close();
  }
};

export {};
