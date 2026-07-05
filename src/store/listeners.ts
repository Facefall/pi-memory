export type NotifyAfterWriteOptions = {
  skipConsolidateCheck?: boolean;
};

export type StoreListeners = {
  onSyncToSidecar(listener: () => void): () => void;
  onConsolidateCheck(listener: () => void): () => void;
  notifySyncToSidecar(): void;
  notifyAfterWrite(opts?: NotifyAfterWriteOptions): void;
};

/** Sidecar sync + debounced consolidate-check subscriptions after Ground Truth writes. */
export function createStoreListeners(isConsolidating: () => boolean): StoreListeners {
  const syncToSidecarListeners = new Set<() => void>();
  const consolidateCheckListeners = new Set<() => void>();

  return {
    onSyncToSidecar(listener: () => void): () => void {
      syncToSidecarListeners.add(listener);
      return () => syncToSidecarListeners.delete(listener);
    },

    onConsolidateCheck(listener: () => void): () => void {
      consolidateCheckListeners.add(listener);
      return () => consolidateCheckListeners.delete(listener);
    },

    notifySyncToSidecar(): void {
      for (const listener of syncToSidecarListeners) listener();
    },

    notifyAfterWrite(opts?: NotifyAfterWriteOptions): void {
      for (const listener of syncToSidecarListeners) listener();
      if (!opts?.skipConsolidateCheck && !isConsolidating()) {
        for (const listener of consolidateCheckListeners) listener();
      }
    },
  };
}
