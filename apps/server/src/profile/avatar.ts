// プロフィール画像。暗号化して保存し、同じ行のメールアドレスも同じ鍵のバージョンで暗号化し直す
import { eq } from 'drizzle-orm';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { uploadLimit } from '../diaries/routes.ts';
import { aad } from '../platform/crypto.ts';
import { users } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';
import { processImage } from '../platform/images.ts';
import { handleSchema } from '@diary/shared';
import { canSeeProfile } from '../social/view-policy.ts';
import { decryptEmail, findUserByHandle, findUserById } from './account.ts';

export function avatarRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');

  api.put('/me/avatar', full, uploadLimit, async (c) => {
    const { userId } = c.get('session');
    const form = await c.req.parseBody();
    const file = form.image;
    if (!(file instanceof File) || file.size === 0) throw errors.validation([{ field: 'image', code: 'required' }]);
    const image = await processImage(Buffer.from(await file.arrayBuffer()), 'avatar');
    const user = await findUserById(deps, userId);
    const email = deps.cipher.encrypt(Buffer.from(decryptEmail(deps, user)), aad('user.email', userId));
    const avatar = deps.cipher.encrypt(image, aad('user.avatar', userId));
    await deps.db
      .update(users)
      .set({ emailEnc: email.ciphertext, avatarEnc: avatar.ciphertext, keyVersion: email.keyVersion, updatedAt: deps.now() })
      .where(eq(users.id, userId));
    return c.body(null, 204);
  });

  api.delete('/me/avatar', full, async (c) => {
    await deps.db
      .update(users)
      .set({ avatarEnc: null, updatedAt: deps.now() })
      .where(eq(users.id, c.get('session').userId));
    return c.body(null, 204);
  });

  api.get('/users/:handle/avatar', full, async (c) => {
    const handle = handleSchema.safeParse(c.req.param('handle'));
    if (!handle.success) throw errors.notFound();
    const owner = await findUserByHandle(deps, handle.data);
    if (!owner?.avatarEnc || !(await canSeeProfile(deps.db, c.get('session').userId, owner.id))) throw errors.notFound();
    const image = deps.cipher.decrypt(owner.avatarEnc, owner.keyVersion, aad('user.avatar', owner.id));
    return c.body(new Uint8Array(image), 200, { 'content-type': 'image/webp' });
  });
}
