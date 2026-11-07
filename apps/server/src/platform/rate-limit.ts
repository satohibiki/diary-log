// PostgreSQL の固定ウィンドウによる回数制限。キーは HMAC 化して保存する
import { sql } from 'drizzle-orm';
import type { Db } from './db/client.ts';
import { rateLimits } from './db/schema.ts';
import { errors } from './errors.ts';
import type { Secrets } from './secrets.ts';

export type RateLimiter = {
  consume: (name: string, key: string, limit: number, windowSeconds: number) => Promise<void>;
};

export function createRateLimiter(deps: { db: Db; secrets: Secrets; now: () => Date }): RateLimiter {
  return {
    async consume(name, key, limit, windowSeconds) {
      const windowMs = windowSeconds * 1000;
      const windowStart = new Date(Math.floor(deps.now().getTime() / windowMs) * windowMs);
      const bucket = `${name}:${windowSeconds}:${deps.secrets.hmac('rate-limit', key).toString('hex')}`;
      const [row] = await deps.db
        .insert(rateLimits)
        .values({ bucket, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.bucket, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });
      if (!row || row.count > limit) throw errors.tooManyRequests();
    },
  };
}
