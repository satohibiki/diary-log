/** 利用者にそのまま表示できるエラー */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}
