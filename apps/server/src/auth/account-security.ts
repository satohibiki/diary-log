// パスキーの管理とメールアドレスの変更(再認証が必要)
import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { emailSchema, otpSchema, type Passkey } from '@diary/shared';
import type { ApiApp, AppDeps } from '../app.ts';
import { aad } from '../platform/crypto.ts';
import { passkeys, users } from '../platform/db/schema.ts';
import { AppError, errors } from '../platform/errors.ts';
import { credentialSchema, parseJson, uuidSchema } from '../platform/validation.ts';
import { decryptEmail, findUserById } from '../profile/account.ts';
import { requireAuth, requireStepUp } from './middleware.ts';
import { issueOtp, verifyOtp } from './otp.ts';
import { notify } from './routes.ts';
import { consumeChallenge, insertPasskey, passkeysOf, registrationOptions, verifyRegistration } from './webauthn.ts';

export function accountSecurityRoutes(api: ApiApp, deps: AppDeps): void {
  const full = requireAuth('full');
  const stepUp = requireStepUp(deps);

  api.get('/me/passkeys', full, async (c) => {
    const rows = await passkeysOf(deps, c.get('session').userId);
    const list: Passkey[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
    }));
    return c.json(list);
  });

  api.post('/me/passkeys/options', full, stepUp, async (c) => {
    const user = await findUserById(deps, c.get('session').userId);
    return c.json(await registrationOptions(deps, 'add_passkey', user, await passkeysOf(deps, user.id)));
  });

  api.post('/me/passkeys/finish', full, async (c) => {
    const { userId } = c.get('session');
    const body = await parseJson(
      c,
      z.object({ challengeId: uuidSchema, credential: credentialSchema, name: z.string().trim().min(1).max(50).optional() }),
    );
    const challenge = await consumeChallenge(deps, body.challengeId, 'add_passkey', userId);
    const verified = await verifyRegistration(deps, body.credential, challenge);
    await insertPasskey(deps, userId, verified, body.name);
    await notify(deps, await findUserById(deps, userId), 'passkey_added');
    return c.body(null, 201);
  });

  api.delete('/me/passkeys/:id', full, stepUp, async (c) => {
    const { userId } = c.get('session');
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) throw errors.notFound();
    await deps.db.transaction(async (tx) => {
      const [own] = await tx
        .select({ id: passkeys.id })
        .from(passkeys)
        .where(and(eq(passkeys.id, id.data), eq(passkeys.userId, userId)))
        .for('update');
      if (!own) throw errors.notFound();
      const [total] = await tx.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId));
      if ((total?.n ?? 0) <= 1) throw errors.conflict('last-passkey', '最後のパスキーは削除できません');
      await tx.delete(passkeys).where(eq(passkeys.id, own.id));
    });
    return c.body(null, 204);
  });

  api.post('/me/email-change/start', full, stepUp, async (c) => {
    const { userId } = c.get('session');
    await deps.rateLimiter.consume('otp-send-user', userId, 3, 3600);
    const { email } = await parseJson(c, z.object({ email: emailSchema }));
    const otpId = randomUUID();
    const sealed = deps.cipher.encrypt(Buffer.from(email), aad('otp.new_email', otpId));
    const code = await issueOtp(deps, 'email_change', userId, {
      id: otpId,
      newEmailEnc: sealed.ciphertext,
      keyVersion: sealed.keyVersion,
    });
    try {
      await deps.mailer.sendOtp(email, 'email_change', code);
    } catch (error) {
      deps.logger.errorFrom('mail-failed', error, { userId });
      throw new AppError(502, 'mail-failed', 'メールを送信できませんでした。時間をおいて再度お試しください');
    }
    return c.body(null, 202);
  });

  api.post('/me/email-change/verify', full, async (c) => {
    const { userId } = c.get('session');
    const { code } = await parseJson(c, z.object({ code: otpSchema }));
    const otp = await verifyOtp(deps, 'email_change', userId, code);
    if (!otp.newEmailEnc || otp.keyVersion === null) throw errors.authenticationFailed();
    const newEmail = deps.cipher.decrypt(otp.newEmailEnc, otp.keyVersion, aad('otp.new_email', otp.id)).toString('utf8');
    const user = await findUserById(deps, userId);
    const oldEmail = decryptEmail(deps, user);
    // users の AAD で再暗号化する。同じ行の他の暗号文も同じ鍵のバージョンにそろえる
    const sealed = deps.cipher.encrypt(Buffer.from(newEmail), aad('user.email', userId));
    const avatar = user.avatarEnc
      ? deps.cipher.encrypt(deps.cipher.decrypt(user.avatarEnc, user.keyVersion, aad('user.avatar', userId)), aad('user.avatar', userId)).ciphertext
      : null;
    await deps.db
      .update(users)
      .set({ emailEnc: sealed.ciphertext, avatarEnc: avatar, keyVersion: sealed.keyVersion, updatedAt: deps.now() })
      .where(eq(users.id, userId));
    await notify(deps, user, 'email_changed', oldEmail);
    return c.body(null, 204);
  });
}
