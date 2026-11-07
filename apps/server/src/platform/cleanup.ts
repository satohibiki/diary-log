// 期限切れのデータを1時間ごとに削除する
import { lt, or, isNotNull } from 'drizzle-orm';
import type { Db } from './db/client.ts';
import { emailOtps, pendingRegistrations, rateLimits, sessions, webauthnChallenges } from './db/schema.ts';
import type { Logger } from './logger.ts';

export async function deleteExpired(db: Db, now: Date): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now));
  await db.delete(pendingRegistrations).where(lt(pendingRegistrations.expiresAt, now));
  await db.delete(emailOtps).where(or(lt(emailOtps.expiresAt, now), isNotNull(emailOtps.consumedAt)));
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)));
}

export function startCleanup(deps: { db: Db; logger: Logger; now: () => Date }): NodeJS.Timeout {
  const run = () => {
    deleteExpired(deps.db, deps.now()).catch((error: unknown) => {
      deps.logger.errorFrom('cleanup-failed', error);
    });
  };
  run();
  const timer = setInterval(run, 3600 * 1000);
  timer.unref();
  return timer;
}
