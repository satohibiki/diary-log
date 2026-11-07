// 記入中の内容を IndexedDB に一時保持する(FR-017)。保存の完了時とログアウト時に消去する
export type Draft = { date: string; body: string; weather: string; image: Blob | null };

const DB_NAME = 'diary-drafts';
const STORE = 'drafts';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('下書きを保存できませんでした'));
    };
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('下書きを処理できませんでした'));
      };
    });
  } finally {
    db.close();
  }
}

const key = (user: string, slot: string) => `${user}:${slot}`;

// 画像はどのブラウザでも確実に保存できるよう、ArrayBuffer と形式に分けて保存する
type Stored = Omit<Draft, 'image'> & { image: { type: string; data: ArrayBuffer } | null };

/** slot は新規作成なら 'new'、編集なら日付 */
export async function saveDraft(user: string, slot: string, draft: Draft): Promise<void> {
  const image = draft.image ? { type: draft.image.type, data: await draft.image.arrayBuffer() } : null;
  const stored: Stored = { ...draft, image };
  await run('readwrite', (store) => store.put(stored, key(user, slot)));
}

export async function loadDraft(user: string, slot: string): Promise<Draft | null> {
  const stored = await run<Stored | undefined>('readonly', (store) => store.get(key(user, slot)) as IDBRequest<Stored | undefined>);
  if (!stored) return null;
  return { ...stored, image: stored.image ? new Blob([stored.image.data], { type: stored.image.type }) : null };
}

export async function clearDraft(user: string, slot: string): Promise<void> {
  await run('readwrite', (store) => store.delete(key(user, slot)));
}

export async function clearAllDrafts(): Promise<void> {
  await run('readwrite', (store) => store.clear());
}
