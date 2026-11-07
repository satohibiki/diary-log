// API クライアント。失敗は ApiError として必ず呼び出し元へ伝える(憲章の原則 VIII)
import type { Problem } from '@diary/shared';

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.title);
    this.status = status;
    this.problem = problem;
  }
}

let onUnauthorized: () => void = () => undefined;

/** 401 を受け取ったときの処理(ログイン画面への移動など)を登録する */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

type Options = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal };

export const NETWORK_ERROR_TITLE = 'インターネットに接続できません。接続を確認してから、もう一度お試しください';

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers();
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'same-origin',
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, { type: 'network', title: NETWORK_ERROR_TITLE, status: 0 });
  }
  if (res.ok) {
    // 202 や 204 のように本文がない成功応答もある
    const text = await res.text();
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }

  const problem = await readProblem(res);
  if (res.status === 401) onUnauthorized();
  throw new ApiError(res.status, problem);
}

async function readProblem(res: Response): Promise<Problem> {
  if (res.headers.get('content-type')?.includes('application/problem+json')) {
    return (await res.json()) as Problem;
  }
  return { type: 'server-error', title: 'サーバーでエラーが発生しました', status: res.status };
}

/** バイナリ(ZIP など)を取得する */
export async function apiBlob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { type: 'network', title: NETWORK_ERROR_TITLE, status: 0 });
  }
  if (!res.ok) {
    const problem = await readProblem(res);
    if (res.status === 401) onUnauthorized();
    throw new ApiError(res.status, problem);
  }
  return res.blob();
}
