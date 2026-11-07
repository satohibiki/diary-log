import { ApiError } from '../lib/api-client.ts';
import { UserFacingError } from '../lib/errors.ts';

/** エラーの内容を利用者に知らせる。エラーを隠さない(憲章の原則 VIII) */
export function ErrorMessage({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  const message =
    error instanceof ApiError
      ? error.problem.title
      : error instanceof UserFacingError
        ? error.message
        : '予期しないエラーが発生しました。時間をおいて再度お試しください';
  return (
    <p role="alert" className="error">
      {message}
    </p>
  );
}
