export type Listener<T> = (state: T, previous: T) => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T extends object>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => state,

    set(patch) {
      const previous = state;
      const changes = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...changes };
      listeners.forEach((listener) => listener(state, previous));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
