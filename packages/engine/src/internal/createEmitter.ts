type Listener<T> = (event: T) => void;

export function createEmitter<T>() {
  const listeners = new Set<Listener<T>>();

  return {
    emit(event: T) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      listeners.clear();
    }
  };
}
