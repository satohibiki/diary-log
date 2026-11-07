// テスト用のユーザーとログイン済みセッションを作成する
import { randomUUID } from 'node:crypto';
import { createSessionStore, SESSION_COOKIE } from '../../src/auth/session.ts';
import { blocks, follows, users } from '../../src/platform/db/schema.ts';
import type { TestContext, TestClient } from './app.ts';

export type TestUser = { id: string; handle: string; email: string };

export async function createUser(
  ctx: TestContext,
  options: { handle: string; email?: string; nickname?: string; visibility?: 'private' | 'public' },
): Promise<TestUser> {
  const id = randomUUID();
  const email = options.email ?? `${options.handle}@example.com`;
  const sealed = ctx.deps.cipher.encrypt(Buffer.from(email), `user.email:${id}`);
  await ctx.deps.db.insert(users).values({
    id,
    handle: options.handle,
    nickname: options.nickname ?? options.handle,
    emailEnc: sealed.ciphertext,
    keyVersion: sealed.keyVersion,
    visibility: options.visibility ?? 'private',
  });
  return { id, handle: options.handle, email };
}

export async function loginAs(
  ctx: TestContext,
  user: TestUser,
  scope: 'full' | 'recovery' = 'full',
): Promise<TestClient> {
  const store = createSessionStore(ctx.deps);
  const { token } = await store.create(user.id, scope);
  const client = ctx.client();
  client.cookies.set(SESSION_COOKIE, token);
  return client;
}

export async function follow(ctx: TestContext, follower: TestUser, followee: TestUser, status: 'pending' | 'approved' = 'approved') {
  await ctx.deps.db.insert(follows).values({
    followerId: follower.id,
    followeeId: followee.id,
    status,
    approvedAt: status === 'approved' ? new Date() : null,
  });
}

export async function block(ctx: TestContext, blocker: TestUser, blocked: TestUser) {
  await ctx.deps.db.insert(blocks).values({ blockerId: blocker.id, blockedId: blocked.id });
}
