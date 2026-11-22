// 記入中の内容を IndexedDB に一時保持する(001 FR-017)。保存の完了時とログアウト時に消去する
// 新しく書く絵日記の書きかけは日付ごとに保持する(003、ADR-0007)
import { diaryDateSchema } from '@diary/shared';

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
/** 新しく書く絵日記の書きかけのキー。利用者と日付の組ごとに1件 */
const newKey = (user: string, date: string) => `${user}:new:${date}`;
/** 修正前の、日付の区別がない新規の書きかけのキー */
const legacyNewKey = (user: string) => `${user}:new`;

// 画像はどのブラウザでも確実に保存できるよう、ArrayBuffer と形式に分けて保存する
type Stored = Omit<Draft, 'image'> & { image: { type: string; data: ArrayBuffer } | null };

async function toStored(draft: Draft): Promise<Stored> {
  const image = draft.image ? { type: draft.image.type, data: await draft.image.arrayBuffer() } : null;
  return { ...draft, image };
}

function fromStored(stored: Stored): Draft {
  return { ...stored, image: stored.image ? new Blob([stored.image.data], { type: stored.image.type }) : null };
}

/** 文章が空白のみ、天気が未選択、絵がない書きかけ */
export function isEmptyDraft(draft: Draft | Stored): boolean {
  return draft.body.trim() === '' && draft.weather === '' && draft.image === null;
}

/** 編集の書きかけ。slot は編集する絵日記の日付 */
export async function saveDraft(user: string, slot: string, draft: Draft): Promise<void> {
  const stored = await toStored(draft);
  await run('readwrite', (store) => store.put(stored, key(user, slot)));
}

export async function loadDraft(user: string, slot: string): Promise<Draft | null> {
  const stored = await run<Stored | undefined>('readonly', (store) => store.get(key(user, slot)) as IDBRequest<Stored | undefined>);
  return stored ? fromStored(stored) : null;
}

export async function clearDraft(user: string, slot: string): Promise<void> {
  await run('readwrite', (store) => store.delete(key(user, slot)));
}

/** 新しく書く絵日記の書きかけを、その日付のキーに保持する。空なら保持せず、その日付の書きかけを消す */
export async function saveNewDraft(user: string, draft: Draft): Promise<void> {
  if (isEmptyDraft(draft)) {
    await clearNewDraft(user, draft.date);
    return;
  }
  const stored = await toStored(draft);
  await run('readwrite', (store) => store.put(stored, newKey(user, draft.date)));
}

export async function loadNewDraft(user: string, date: string): Promise<Draft | null> {
  const stored = await run<Stored | undefined>('readonly', (store) => store.get(newKey(user, date)) as IDBRequest<Stored | undefined>);
  return stored ? fromStored(stored) : null;
}

export async function clearNewDraft(user: string, date: string): Promise<void> {
  await run('readwrite', (store) => store.delete(newKey(user, date)));
}

/** 利用者の空でない新規の書きかけの日付を、新しい順に返す */
export async function listNewDraftDates(user: string): Promise<string[]> {
  const range = IDBKeyRange.bound(newKey(user, ''), newKey(user, '\uffff'));
  const stored = await run<Stored[]>('readonly', (store) => store.getAll(range) as IDBRequest<Stored[]>);
  return stored
    .filter((d) => !isEmptyDraft(d))
    .map((d) => d.date)
    .sort()
    .reverse();
}

/**
 * 修正前の書きかけ(`<user>:new`)を、記録された日付のキーへ移す(003 FR-008)。
 * 空なら捨てる。移動先が既にあれば移動先を残す。日付が正しくなければ移さずにエラーにする
 */
export async function migrateLegacyNewDraft(user: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let failure: Error | null = null;
      tx.oncomplete = () => {
        if (failure) reject(failure);
        else resolve();
      };
      tx.onerror = () => {
        reject(failure ?? tx.error ?? new Error('書きかけを移せませんでした'));
      };
      const legacy = store.get(legacyNewKey(user)) as IDBRequest<Stored | undefined>;
      legacy.onsuccess = () => {
        const stored = legacy.result;
        if (!stored) return;
        if (isEmptyDraft(stored)) {
          store.delete(legacyNewKey(user));
          return;
        }
        if (!diaryDateSchema.safeParse(stored.date).success) {
          failure = new Error('書きかけの日付を読み取れませんでした');
          return;
        }
        const target = newKey(user, stored.date);
        const existing = store.getKey(target);
        existing.onsuccess = () => {
          if (existing.result === undefined) store.put(stored, target);
          store.delete(legacyNewKey(user));
        };
      };
    });
  } finally {
    db.close();
  }
}

export async function clearAllDrafts(): Promise<void> {
  await run('readwrite', (store) => store.clear());
}
