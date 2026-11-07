// 利用者のアカウント情報の読み書き。メールアドレスは暗号化して保存する
import { eq } from 'drizzle-orm';
import type { Me } from '@diary/shared';
import type { AppDeps } from '../app.ts';
import { aad } from '../platform/crypto.ts';
import { users } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';

type Deps = Pick<AppDeps, 'db' | 'cipher'>;
export type UserRow = typeof users.$inferSelect;

export async function findUserById(deps: Pick<AppDeps, 'db'>, id: string): Promise<UserRow> {
  const [row] = await deps.db.select().from(users).where(eq(users.id, id));
  if (!row) throw errors.unauthorized();
  return row;
}

export async function findUserByHandle(deps: Pick<AppDeps, 'db'>, handle: string): Promise<UserRow | undefined> {
  const [row] = await deps.db.select().from(users).where(eq(users.handle, handle));
  return row;
}

export function decryptEmail(deps: Deps, user: UserRow): string {
  return deps.cipher.decrypt(user.emailEnc, user.keyVersion, aad('user.email', user.id)).toString('utf8');
}

export function toMe(deps: Deps, user: UserRow): Me {
  return {
    handle: user.handle,
    nickname: user.nickname,
    email: decryptEmail(deps, user),
    visibility: user.visibility,
    hasAvatar: user.avatarEnc !== null,
  };
}
