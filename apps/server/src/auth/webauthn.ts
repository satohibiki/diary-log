// WebAuthn の設定とチャレンジの管理。チャレンジは5分有効で1回限り
import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { AppDeps } from '../app.ts';
import { passkeys, webauthnChallenges } from '../platform/db/schema.ts';
import { errors } from '../platform/errors.ts';

type Purpose = (typeof webauthnChallenges.$inferSelect)['purpose'];
type Deps = Pick<AppDeps, 'db' | 'config' | 'now'>;
type PasskeyRow = typeof passkeys.$inferSelect;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function storeChallenge(deps: Deps, challenge: string, purpose: Purpose, subjectId: string | null) {
  const id = randomUUID();
  await deps.db.insert(webauthnChallenges).values({
    id,
    challenge,
    purpose,
    subjectId,
    expiresAt: new Date(deps.now().getTime() + CHALLENGE_TTL_MS),
  });
  return id;
}

/** チャレンジを取り出して削除する。存在しない、期限切れ、目的が違う場合は 401 */
export async function consumeChallenge(deps: Deps, id: string, purpose: Purpose, subjectId: string | null) {
  const [row] = await deps.db
    .delete(webauthnChallenges)
    .where(and(eq(webauthnChallenges.id, id), gt(webauthnChallenges.expiresAt, deps.now())))
    .returning();
  if (row?.purpose !== purpose || row.subjectId !== subjectId) throw errors.authenticationFailed();
  return row.challenge;
}

export async function registrationOptions(
  deps: Deps,
  purpose: Purpose,
  user: { id: string; handle: string },
  existing: PasskeyRow[] = [],
) {
  const options = await generateRegistrationOptions({
    rpName: deps.config.rpName,
    rpID: deps.config.rpId,
    userName: user.handle,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credentialId.toString('base64url') })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  const challengeId = await storeChallenge(deps, options.challenge, purpose, user.id);
  return { challengeId, options };
}

export async function verifyRegistration(deps: Deps, response: unknown, expectedChallenge: string) {
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: deps.config.appOrigin,
      expectedRPID: deps.config.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw errors.authenticationFailed();
  }
  if (!result.verified) throw errors.authenticationFailed();
  const { credential } = result.registrationInfo;
  return {
    credentialId: Buffer.from(credential.id, 'base64url'),
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
  };
}

export async function authenticationOptions(
  deps: Deps,
  purpose: Purpose,
  subjectId: string | null,
  allow: PasskeyRow[] = [],
) {
  const options = await generateAuthenticationOptions({
    rpID: deps.config.rpId,
    allowCredentials: allow.map((p) => ({ id: p.credentialId.toString('base64url'), transports: p.transports })),
    userVerification: 'required',
  });
  const challengeId = await storeChallenge(deps, options.challenge, purpose, subjectId);
  return { challengeId, options };
}

/** 認証の応答を検証し、署名カウンターと最終利用日時を更新する */
export async function verifyAuthentication(deps: Deps, response: unknown, expectedChallenge: string, passkey: PasskeyRow) {
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: response as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: deps.config.appOrigin,
      expectedRPID: deps.config.rpId,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId.toString('base64url'),
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.signCount,
        transports: passkey.transports,
      },
    });
  } catch {
    throw errors.authenticationFailed();
  }
  if (!result.verified) throw errors.authenticationFailed();
  await deps.db
    .update(passkeys)
    .set({ signCount: result.authenticationInfo.newCounter, lastUsedAt: deps.now() })
    .where(eq(passkeys.id, passkey.id));
}

/** 応答の id から登録済みのパスキーを探す */
export async function findPasskeyByCredential(deps: Deps, credentialId: string): Promise<PasskeyRow | undefined> {
  const [row] = await deps.db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, Buffer.from(credentialId, 'base64url')));
  return row;
}

export async function passkeysOf(deps: Deps, userId: string): Promise<PasskeyRow[]> {
  return deps.db.select().from(passkeys).where(eq(passkeys.userId, userId));
}

export async function insertPasskey(
  deps: Deps,
  userId: string,
  verified: Awaited<ReturnType<typeof verifyRegistration>>,
  name: string | undefined,
) {
  await deps.db.insert(passkeys).values({
    id: randomUUID(),
    userId,
    credentialId: verified.credentialId,
    publicKey: verified.publicKey,
    signCount: verified.counter,
    transports: verified.transports,
    name: name ?? 'パスキー',
  });
}
