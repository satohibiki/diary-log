/** 一意制約の違反(PostgreSQL の 23505)かどうか。Drizzle はドライバーのエラーを cause に入れる */
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
}
