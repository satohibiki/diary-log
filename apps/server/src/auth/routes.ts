// 認証のエンドポイント: 登録、ログイン、ログアウト、復旧、再認証
import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import { z } from 'zod';
import { emailSchema, handleSchema, otpSchema } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { aad } from '../platform/crypto.ts';
import { pendingRegistrations, users, webauthnChallenges } from '../platform/db/schema.ts';
import { isUniqueViolation } from '../platform/db/errors.ts';
import { AppError, errors } from '../platform/errors.ts';
import { credentialSchema, parseJson, uuidSchema } from '../platform/validation.ts';
import { findUserByHandle, findUserById } from '../profile/account.ts';
import { requireAuth, type AuthEnv } from './middleware.ts';
import { issueOtp, verifyOtp } from './otp.ts';
import { createSessionStore, type Scope } from './session.ts';
import {
  authenticationOptions,
  consumeChallenge,
  findPasskeyByCredential,
  insertPasskey,
  passkeysOf,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from './webauthn.ts';

const PENDING_TTL_MS = 60 * 60 * 1000;
const HOUR = 3600;
const DAY = 24 * HOUR;
const passkeyName = z.string().trim().min(1).max(50).optional();

const mailFailed = () => new AppError(502, 'mail-failed', 'メールを送信できませんでした。時間をおいて再度お試しください');

export function authRoutes(api: ApiApp, deps: AppDeps): void {
  const sessions = createSessionStore(deps);
  const { rateLimiter: limit } = deps;

  const signIn = async (c: Context<AuthEnv>, userId: string, scope: Scope) => {
    const { token } = await sessions.create(userId, scope);
    c.header('Set-Cookie', sessions.cookie(token, scope), { append: true });
  };

  const sendOtp = async (to: string, purpose: 'registration' | 'recovery' | 'email_change', code: string) => {
    try {
      await deps.mailer.sendOtp(to, purpose, code);
    } catch (error) {
      deps.logger.errorFrom('mail-failed', error);
      throw mailFailed();
    }
  };

  const pendingFor = async (registrationId: string) => {
    const [row] = await deps.db
      .select()
      .from(pendingRegistrations)
      .where(and(eq(pendingRegistrations.id, registrationId), gt(pendingRegistrations.expiresAt, deps.now())));
    return row;
  };

  const pendingEmail = (row: typeof pendingRegistrations.$inferSelect) =>
    deps.cipher.decrypt(row.emailEnc, row.keyVersion, aad('pending.email', row.id)).toString('utf8');

  // ---------- 登録 ----------

  api.post('/auth/registration/start', async (c) => {
    const ip = deps.clientIp(c);
    await limit.consume('register-start', ip, 10, HOUR);
    const { handle, email } = await parseJson(c, z.object({ handle: handleSchema, email: emailSchema }));
    if (await findUserByHandle(deps, handle)) throw errors.conflict('handle-taken', 'この ID は既に使われています');
    const id = randomUUID();
    const sealed = deps.cipher.encrypt(Buffer.from(email), aad('pending.email', id));
    await deps.db.insert(pendingRegistrations).values({
      id,
      handle,
      emailEnc: sealed.ciphertext,
      keyVersion: sealed.keyVersion,
      expiresAt: new Date(deps.now().getTime() + PENDING_TTL_MS),
    });
    await sendOtp(email, 'registration', await issueOtp(deps, 'registration', id));
    return c.json({ registrationId: id }, 202);
  });

  api.post('/auth/registration/resend', async (c) => {
    const ip = deps.clientIp(c);
    const { registrationId } = await parseJson(c, z.object({ registrationId: uuidSchema }));
    await limit.consume('otp-send-ip', ip, 10, HOUR);
    await limit.consume('otp-send-registration', registrationId, 3, HOUR);
    const pending = await pendingFor(registrationId);
    if (!pending || pending.emailVerifiedAt) throw errors.notFound();
    await sendOtp(pendingEmail(pending), 'registration', await issueOtp(deps, 'registration', pending.id));
    return c.body(null, 202);
  });

  api.post('/auth/registration/verify-email', async (c) => {
    await limit.consume('otp-verify-ip', deps.clientIp(c), 30, HOUR);
    const { registrationId, code } = await parseJson(c, z.object({ registrationId: uuidSchema, code: otpSchema }));
    const pending = await pendingFor(registrationId);
    if (!pending) throw errors.authenticationFailed();
    await verifyOtp(deps, 'registration', pending.id, code);
    await deps.db
      .update(pendingRegistrations)
      .set({ emailVerifiedAt: deps.now() })
      .where(eq(pendingRegistrations.id, pending.id));
    return c.json(await registrationOptions(deps, 'register', { id: pending.id, handle: pending.handle }));
  });

  api.post('/auth/registration/finish', async (c) => {
    const body = await parseJson(c, z.object({ challengeId: uuidSchema, credential: credentialSchema, name: passkeyName }));
    // チャレンジの対象は登録途中のデータ。メールアドレスが確認済みでなければ失敗する
    const subject = await subjectOfChallenge(deps, body.challengeId);
    const pending = subject ? await pendingFor(subject) : undefined;
    if (!pending?.emailVerifiedAt) throw errors.authenticationFailed();
    const challenge = await consumeChallenge(deps, body.challengeId, 'register', pending.id);
    const verified = await verifyRegistration(deps, body.credential, challenge);

    // メールアドレスは users の AAD で再暗号化する
    const email = pendingEmail(pending);
    const sealed = deps.cipher.encrypt(Buffer.from(email), aad('user.email', pending.id));
    try {
      await deps.db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: pending.id,
          handle: pending.handle,
          nickname: pending.handle,
          emailEnc: sealed.ciphertext,
          keyVersion: sealed.keyVersion,
        });
        await insertPasskey({ ...deps, db: tx }, pending.id, verified, body.name);
        await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.id, pending.id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw errors.conflict('handle-taken', 'この ID は既に使われています');
      }
      throw error;
    }
    await signIn(c, pending.id, 'full');
    return c.body(null, 201);
  });

  // ---------- ログイン ----------

  api.post('/auth/login/options', async (c) => {
    await limit.consume('login-options-ip', deps.clientIp(c), 10, 60);
    return c.json(await authenticationOptions(deps, 'login', null));
  });

  api.post('/auth/login/verify', async (c) => {
    const ip = deps.clientIp(c);
    await limit.consume('login-verify-ip', ip, 10, 60);
    const body = await parseJson(c, z.object({ handle: handleSchema, challengeId: uuidSchema, credential: credentialSchema }));
    // ID 単独では制限しない。第三者が本人を締め出せないようにするため(research.md §8)
    await limit.consume('login-ip-handle', `${ip}|${body.handle}`, 5, 60);
    const challenge = await consumeChallenge(deps, body.challengeId, 'login', null);
    const user = await findUserByHandle(deps, body.handle);
    const passkey = await findPasskeyByCredential(deps, body.credential.id);
    if (!user || passkey?.userId !== user.id) throw errors.authenticationFailed();
    await verifyAuthentication(deps, body.credential, challenge, passkey);
    await signIn(c, user.id, 'full');
    return c.body(null, 204);
  });

  api.post('/auth/logout', async (c) => {
    const session = c.get('maybeSession');
    if (session) await sessions.revoke(session.token);
    c.header('Set-Cookie', sessions.clearCookie());
    return c.body(null, 204);
  });

  // ---------- 復旧 ----------

  api.post('/auth/recovery/start', async (c) => {
    const ip = deps.clientIp(c);
    const { handle } = await parseJson(c, z.object({ handle: handleSchema }));
    await limit.consume('otp-send-ip', ip, 10, HOUR);
    await limit.consume('otp-send-ip-handle', `${ip}|${handle}`, 3, HOUR);
    await limit.consume('otp-send-handle', handle, 10, DAY);
    const user = await findUserByHandle(deps, handle);
    if (user) {
      // 応答時間から ID の有無が分からないよう、送信を待たずに応答する
      void (async () => {
        const code = await issueOtp(deps, 'recovery', user.id);
        const email = deps.cipher.decrypt(user.emailEnc, user.keyVersion, aad('user.email', user.id)).toString('utf8');
        await deps.mailer.sendOtp(email, 'recovery', code);
      })().catch((error: unknown) => {
        deps.logger.errorFrom('recovery-mail-failed', error);
      });
    }
    return c.body(null, 202);
  });

  api.post('/auth/recovery/verify', async (c) => {
    await limit.consume('otp-verify-ip', deps.clientIp(c), 30, HOUR);
    const { handle, code } = await parseJson(c, z.object({ handle: handleSchema, code: otpSchema }));
    const user = await findUserByHandle(deps, handle);
    if (!user) throw errors.authenticationFailed();
    await verifyOtp(deps, 'recovery', user.id, code);
    await signIn(c, user.id, 'recovery');
    return c.json(await registrationOptions(deps, 'recover', user, await passkeysOf(deps, user.id)));
  });

  api.post('/auth/recovery/finish', requireAuth('recovery'), async (c) => {
    const session = c.get('session');
    const body = await parseJson(c, z.object({ challengeId: uuidSchema, credential: credentialSchema, name: passkeyName }));
    const challenge = await consumeChallenge(deps, body.challengeId, 'recover', session.userId);
    const verified = await verifyRegistration(deps, body.credential, challenge);
    await insertPasskey(deps, session.userId, verified, body.name);
    // 復旧の完了時に、他のすべてのセッションを失効させる
    await sessions.revokeAllForUser(session.userId);
    await signIn(c, session.userId, 'full');
    const user = await findUserById(deps, session.userId);
    await notify(deps, user, 'recovered');
    return c.body(null, 204);
  });

  // ---------- 再認証 ----------

  api.post('/auth/step-up/options', requireAuth('full'), async (c) => {
    const { userId } = c.get('session');
    return c.json(await authenticationOptions(deps, 'step_up', userId, await passkeysOf(deps, userId)));
  });

  api.post('/auth/step-up/verify', requireAuth('full'), async (c) => {
    const session = c.get('session');
    const body = await parseJson(c, z.object({ challengeId: uuidSchema, credential: credentialSchema }));
    const challenge = await consumeChallenge(deps, body.challengeId, 'step_up', session.userId);
    const passkey = await findPasskeyByCredential(deps, body.credential.id);
    if (passkey?.userId !== session.userId) throw errors.authenticationFailed();
    await verifyAuthentication(deps, body.credential, challenge, passkey);
    await sessions.markStepUp(session.token);
    return c.body(null, 204);
  });
}

async function subjectOfChallenge(deps: AppDeps, challengeId: string): Promise<string | null> {
  const [row] = await deps.db
    .select({ subjectId: webauthnChallenges.subjectId })
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.id, challengeId));
  return row?.subjectId ?? null;
}

/** セキュリティ通知を送る。送信の失敗はログに記録する(処理自体は完了しているため) */
export async function notify(
  deps: AppDeps,
  user: typeof users.$inferSelect,
  notice: 'recovered' | 'passkey_added' | 'email_changed',
  to?: string,
): Promise<void> {
  try {
    const email = to ?? deps.cipher.decrypt(user.emailEnc, user.keyVersion, aad('user.email', user.id)).toString('utf8');
    await deps.mailer.notify(email, notice);
  } catch (error) {
    deps.logger.errorFrom('notify-failed', error, { userId: user.id });
  }
}
