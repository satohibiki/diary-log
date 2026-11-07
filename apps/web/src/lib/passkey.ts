// パスキーの作成と利用。ブラウザの操作の失敗は、利用者に分かる言葉に置き換えて伝える
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type { WebAuthnOptions } from '@diary/shared';
import { api } from './api-client.ts';
import { UserFacingError } from './errors.ts';

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

const toUserError = (error: unknown): Error =>
  error instanceof Error && error.name === 'NotAllowedError'
    ? new UserFacingError('パスキーの操作がキャンセルされたか、時間切れになりました。もう一度お試しください')
    : new UserFacingError('パスキーを利用できませんでした。端末の設定を確認してください');

type CreationJSON = Parameters<typeof startRegistration>[0]['optionsJSON'];
type RequestJSON = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export async function createPasskey(options: CreationJSON): Promise<unknown> {
  try {
    return await startRegistration({ optionsJSON: options });
  } catch (error) {
    throw toUserError(error);
  }
}

export async function getPasskey(options: RequestJSON): Promise<unknown> {
  try {
    return await startAuthentication({ optionsJSON: options });
  } catch (error) {
    throw toUserError(error);
  }
}

/** パスキーで再認証し、機密性の高い操作を5分間許可してもらう */
export async function stepUp(): Promise<void> {
  const { challengeId, options } = await api<WebAuthnOptions<RequestJSON>>('/auth/step-up/options', { method: 'POST' });
  const credential = await getPasskey(options);
  await api('/auth/step-up/verify', { method: 'POST', json: { challengeId, credential } });
}

export type { CreationJSON, RequestJSON };
