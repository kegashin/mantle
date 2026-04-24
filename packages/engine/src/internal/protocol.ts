export type WorkerRequest =
  | {
      type: 'ping';
    }
  | {
      type: 'dispose';
    };

export type WorkerResponse =
  | {
      type: 'pong';
      ok: true;
    }
  | {
      type: 'disposed';
    };
