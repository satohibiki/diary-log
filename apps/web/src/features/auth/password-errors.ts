// パスワードの条件のエラー(サーバーの 422 の項目のコード)を、利用者に分かる言葉にする(004 FR-003)
import { ApiError } from '../../lib/api-client.ts';
import { UserFacingError } from '../../lib/errors.ts';

const MESSAGES: Record<string, string> = {
  common: 'よく使われるパスワードは使えません。推測されにくいパスワードにしてください',
  contains_handle: 'ID を含むパスワードは使えません',
  too_small: 'パスワードは12文字以上にしてください',
  too_big: 'パスワードは128文字以内にしてください',
};

/** パスワードの項目のエラーなら日本語のエラーに置き換え、それ以外はそのまま返す */
export function explainPasswordError(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.status !== 422) return error;
  const messages = (error.problem.errors ?? [])
    .filter((e) => e.field === 'password' || e.field === 'newPassword')
    .map((e) => MESSAGES[e.code] ?? 'パスワードを確認してください');
  return messages.length > 0 ? new UserFacingError(messages.join('。')) : error;
}

export function assertSamePassword(password: string, confirmation: string): void {
  if (password !== confirmation) throw new UserFacingError('パスワード(確認)が一致しません');
}
