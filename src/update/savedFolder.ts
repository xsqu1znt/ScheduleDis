// Remembers the extension's folder between updates. Folder handles can only be stored in IndexedDB.

const OPTIONS = { database: "updater", store: "folders", key: "extension" } as const;

/** Runs one request against the store and waits for its result. */
function withStore<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(OPTIONS.database, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(OPTIONS.store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const pending = request(database.transaction(OPTIONS.store, mode).objectStore(OPTIONS.store));
      pending.onerror = () => reject(pending.error);
      pending.onsuccess = () => resolve(pending.result);
      database.close();
    };
  });
}

export function loadSavedFolder() {
  return withStore<FileSystemDirectoryHandle | undefined>("readonly", s => s.get(OPTIONS.key));
}

export function saveFolder(folder: FileSystemDirectoryHandle) {
  return withStore("readwrite", s => s.put(folder, OPTIONS.key));
}

export function forgetSavedFolder() {
  return withStore("readwrite", s => s.delete(OPTIONS.key));
}
