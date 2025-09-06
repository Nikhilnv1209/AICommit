export type IndexStatus = 'IDLE' | 'INDEXING' | 'COMPLETED' | 'ERROR';

type ProgressState = {
  status: IndexStatus;
  processed: number;
  total: number;
  message?: string;
  startedAt?: number;
  updatedAt?: number;
};

const store = new Map<string, ProgressState>();

function now() { return Date.now(); }

export function startIndexing(projectId: string) {
  store.set(projectId, { status: 'INDEXING', processed: 0, total: 0, startedAt: now(), updatedAt: now() });
}

export function setTotal(projectId: string, total: number) {
  const prev = store.get(projectId) || { status: 'INDEXING', processed: 0, total: 0 } as ProgressState;
  store.set(projectId, { ...prev, status: 'INDEXING', total, updatedAt: now() });
}

export function setProcessed(projectId: string, processed: number) {
  const prev = store.get(projectId) || { status: 'INDEXING', processed: 0, total: 0 } as ProgressState;
  const total = prev.total || Math.max(prev.total, processed);
  store.set(projectId, { ...prev, status: 'INDEXING', processed, total, updatedAt: now() });
}

export function incrementProcessed(projectId: string, inc: number = 1) {
  const prev = store.get(projectId) || { status: 'INDEXING', processed: 0, total: 0 } as ProgressState;
  const processed = (prev.processed || 0) + inc;
  store.set(projectId, { ...prev, status: 'INDEXING', processed, updatedAt: now() });
}

export function completeIndexing(projectId: string) {
  const prev = store.get(projectId);
  if (prev) {
    store.set(projectId, { ...prev, status: 'COMPLETED', updatedAt: now() });
  } else {
    store.set(projectId, { status: 'COMPLETED', processed: 0, total: 0, updatedAt: now() });
  }
}

export function errorIndexing(projectId: string, message?: string) {
  const prev = store.get(projectId);
  store.set(projectId, { ...(prev || { processed: 0, total: 0 }), status: 'ERROR', message, updatedAt: now() });
}

export function getIndexingProgress(projectId: string): ProgressState {
  return store.get(projectId) || { status: 'IDLE', processed: 0, total: 0 };
}

