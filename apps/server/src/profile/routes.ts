// プロフィールとアカウントのエンドポイント
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { nicknameSchema, visibilitySchema } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth, requireStepUp } from '../auth/middleware.ts';
import { createSessionStore } from '../auth/session.ts';
import { emailOtps, users } from '../platform/db/schema.ts';
import { parseJson } from '../platform/validation.ts';
import { findUserById, toMe } from './account.ts';

const patchSchema = z
  .strictObject({ nickname: nicknameSchema.optional(), visibility: visibilitySchema.optional() })
  .refine((v) => v.nickname !== undefined || v.visibility !== undefined, { message: 'empty' });

export function profileRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');
  const sessions = createSessionStore(deps);

  api.get('/me', full, async (c) => {
    const user = await findUserById(deps, c.get('session').userId);
    return c.json(toMe(deps, user));
  });

  api.patch('/me', full, async (c) => {
    const { userId } = c.get('session');
    const changes = await parseJson(c, patchSchema);
    await deps.db
      .update(users)
      .set({ ...changes, updatedAt: deps.now() })
      .where(eq(users.id, userId));
    return c.json(toMe(deps, await findUserById(deps, userId)));
  });

  // 退会: 絵日記、画像、プロフィール、メールアドレス、パスキー、フォロー関係、セッションを削除する(FR-007)
  api.delete('/me', full, requireStepUp(deps), async (c) => {
    const { userId } = c.get('session');
    await deps.db.transaction(async (tx) => {
      await tx.delete(emailOtps).where(eq(emailOtps.subjectId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
    c.header('Set-Cookie', sessions.clearCookie());
    return c.body(null, 204);
  });
}
