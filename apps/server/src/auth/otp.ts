// ワンタイムパスワードの発行と検証(FR-005a)。
// 有効期限10分、1回限り、試行5回まで、同時に有効なものは3件まで。失敗は有効な全件の試行回数に加算する。
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { AppDeps } from '../app.ts';
import { emailOtps } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';

export type OtpPurpose = 'registration' | 'recovery' | 'email_change';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ACTIVE = 3;

type Extra = { id?: string; newEmailEnc?: Buffer; keyVersion?: number };
type Deps = Pick<AppDeps, 'db' | 'secrets' | 'now'>;

const active = (deps: Deps, purpose: OtpPurpose, subjectId: string) =>
  and(
    eq(emailOtps.purpose, purpose),
    eq(emailOtps.subjectId, subjectId),
    isNull(emailOtps.consumedAt),
    gt(emailOtps.expiresAt, deps.now()),
    lt(emailOtps.attempts, MAX_ATTEMPTS),
  );

export async function issueOtp(deps: Deps, purpose: OtpPurpose, subjectId: string, extra: Extra = {}): Promise<string> {
  const code = deps.secrets.generateOtp();
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    await tx.insert(emailOtps).values({
      id: extra.id ?? randomUUID(),
      purpose,
      subjectId,
      newEmailEnc: extra.newEmailEnc ?? null,
      keyVersion: extra.keyVersion ?? null,
      codeHmac: deps.secrets.hmac(`otp:${purpose}`, code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + TTL_MS),
    });
    const rows = await tx
      .select({ id: emailOtps.id })
      .from(emailOtps)
      .where(active(deps, purpose, subjectId))
      .orderBy(asc(emailOtps.createdAt), asc(emailOtps.id));
    const excess = rows.slice(0, Math.max(0, rows.length - MAX_ACTIVE)).map((r) => r.id);
    if (excess.length > 0) await tx.delete(emailOtps).where(inArray(emailOtps.id, excess));
  });
  return code;
}

export type ConsumedOtp = typeof emailOtps.$inferSelect;

export async function verifyOtp(deps: Deps, purpose: OtpPurpose, subjectId: string, code: string): Promise<ConsumedOtp> {
  // 失敗時の試行回数の加算を確定させるため、トランザクションの中では例外を投げない
  const matched = await deps.db.transaction(async (tx) => {
    const rows = await tx.select().from(emailOtps).where(active(deps, purpose, subjectId)).for('update');
    const match = rows.find((row) => deps.secrets.verifyHmac(`otp:${purpose}`, code, row.codeHmac));
    if (match) {
      await tx.update(emailOtps).set({ consumedAt: deps.now() }).where(eq(emailOtps.id, match.id));
      return match;
    }
    if (rows.length > 0) {
      await tx
        .update(emailOtps)
        .set({ attempts: sql`${emailOtps.attempts} + 1` })
        .where(inArray(emailOtps.id, rows.map((r) => r.id)));
    }
    return undefined;
  });
  if (!matched) throw errors.authenticationFailed();
  return matched;
}
