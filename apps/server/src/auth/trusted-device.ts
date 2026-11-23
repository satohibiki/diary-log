// 確認済みの端末(004 FR-015、FR-015a、ADR-0008)。
// Cookie には乱数のトークンを置き、DB にはそのハッシュとユーザーの組だけを保存する。端末を特定できる情報は持たない
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../platform/db/client.ts';
import { trustedDevices } from '../platform/db/schema.ts';
import type { Secrets } from '../platform/secrets.ts';

export const DEVICE_COOKIE = '__Host-device';
export const TRUSTED_DAYS = 90;
const TRUSTED_SECONDS = TRUSTED_DAYS * 24 * 3600;

type Deps = { db: Db; secrets: Secrets; now: () => Date };

export async function isTrusted(deps: Deps, userId: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [row] = await deps.db
    .select({ userId: trustedDevices.userId })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.tokenHash, deps.secrets.hashToken(token)),
        gt(trustedDevices.expiresAt, deps.now()),
      ),
    );
  return row !== undefined;
}

/** 端末を確認済みにする(済みなら期限を延ばす)。Cookie に置くトークンを返す */
export async function trust(deps: Deps, userId: string, token: string | undefined): Promise<string> {
  const value = token ?? deps.secrets.newToken();
  const now = deps.now();
  const expiresAt = new Date(now.getTime() + TRUSTED_SECONDS * 1000);
  await deps.db
    .insert(trustedDevices)
    .values({ userId, tokenHash: deps.secrets.hashToken(value), lastUsedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: [trustedDevices.userId, trustedDevices.tokenHash],
      set: { lastUsedAt: now, expiresAt },
    });
  return value;
}

export async function revokeAll(deps: Pick<Deps, 'db'>, userId: string): Promise<void> {
  await deps.db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}

export function deviceCookie(token: string): string {
  return `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${String(TRUSTED_SECONDS)}`;
}
