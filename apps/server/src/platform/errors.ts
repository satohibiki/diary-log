// RFC 9457 の problem+json によるエラー応答。内部エラーの詳細は応答にもログにも含めない
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from './logger.ts';

export type FieldError = { field: string; code: string };

export class AppError extends Error {
  override name = 'AppError';
  readonly status: ContentfulStatusCode;
  readonly type: string;
  readonly errors: FieldError[] | undefined;

  constructor(status: ContentfulStatusCode, type: string, title: string, errors?: FieldError[]) {
    super(title);
    this.status = status;
    this.type = type;
    this.errors = errors;
  }
}

export const errors = {
  validation: (fieldErrors: FieldError[]) =>
    new AppError(422, 'validation', '入力内容を確認してください', fieldErrors),
  unauthorized: () => new AppError(401, 'unauthorized', 'ログインが必要です'),
  authenticationFailed: () => new AppError(401, 'authentication-failed', '認証できませんでした'),
  forbidden: () => new AppError(403, 'forbidden', 'この操作は許可されていません'),
  stepUpRequired: () => new AppError(403, 'step-up-required', 'パスキーでの再認証が必要です'),
  notFound: () => new AppError(404, 'not-found', '見つかりません'),
  conflict: (type: string, title: string) => new AppError(409, type, title),
  payloadTooLarge: () => new AppError(413, 'payload-too-large', 'ファイルが大きすぎます(10MB まで)'),
  unsupportedMedia: (title = '対応していない形式です') => new AppError(415, 'unsupported-media-type', title),
  invalidImage: (title: string) => new AppError(422, 'invalid-image', title),
  tooManyRequests: () => new AppError(429, 'too-many-requests', '試行回数が上限に達しました。しばらく待ってから再度お試しください'),
};

export function problem(c: Context, error: AppError): Response {
  const body: Record<string, unknown> = { type: error.type, title: error.message, status: error.status };
  if (error.errors) body.errors = error.errors;
  return c.newResponse(JSON.stringify(body), error.status, {
    'content-type': 'application/problem+json',
  });
}

export function handleError(logger: Logger) {
  return (error: Error, c: Context): Response => {
    if (error instanceof AppError) return problem(c, error);
    logger.errorFrom('unhandled-error', error, { method: c.req.method, path: c.req.path });
    return problem(c, new AppError(500, 'server-error', 'サーバーでエラーが発生しました'));
  };
}
