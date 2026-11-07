// サーバー側セッション。DB にはトークンのハッシュのみを保存する
import { and, eq, gt, ne } from 'drizzle-orm';
import type { Db } from '../platform/db/client.ts';
import { sessions } from '../platform/db/schema.ts';
import type { Secrets } from '../platform/secrets.ts';

export const SESSION_COOKIE = '__Host-session';
export type Scope = 'full' | 'recovery';

const TTL_SECONDS: Record<Scope, number> = { full: 30 * 24 * 3600, recovery: 10 * 60 };
const STEP_UP_MS = 5 * 60 * 1000;

export type SessionInfo = {
  token: string;
  tokenHash: Buffer;
  userId: string;
  scope: Scope;
  stepUpUntil: Date | null;
};

export type SessionStore = ReturnType<typeof createSessionStore>;

export function createSessionStore(deps: { db: Db; secrets: Secrets; now: () => Date }) {
  const { db, secrets, now } = deps;
  return {
    async create(userId: string, scope: Scope): Promise<{ token: string }> {
      const token = secrets.newToken();
      await db.insert(sessions).values({
        tokenHash: secrets.hashToken(token),
        userId,
        scope,
        expiresAt: new Date(now().getTime() + TTL_SECONDS[scope] * 1000),
      });
      return { token };
    },

    async find(token: string): Promise<SessionInfo | null> {
      const tokenHash = secrets.hashToken(token);
      const [row] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now())));
      return row ? { token, tokenHash, userId: row.userId, scope: row.scope, stepUpUntil: row.stepUpUntil } : null;
    },

    async revoke(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, secrets.hashToken(token)));
    },

    async revokeAllForUser(userId: string, exceptToken?: string): Promise<void> {
      await db
        .delete(sessions)
        .where(
          exceptToken === undefined
            ? eq(sessions.userId, userId)
            : and(eq(sessions.userId, userId), ne(sessions.tokenHash, secrets.hashToken(exceptToken))),
        );
    },

    async markStepUp(token: string): Promise<void> {
      await db
        .update(sessions)
        .set({ stepUpUntil: new Date(now().getTime() + STEP_UP_MS) })
        .where(eq(sessions.tokenHash, secrets.hashToken(token)));
    },

    cookie(token: string, scope: Scope): string {
      return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_SECONDS[scope]}`;
    },

    clearCookie(): string {
      return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
    },
  };
}
