// AES-256-GCM による保存時暗号化。AAD にレコードの種別と ID を含め、暗号文の入れ替えを検出する
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export type Sealed = { ciphertext: Buffer; keyVersion: number };

export type CipherBox = {
  encrypt: (plaintext: Buffer, aad: string) => Sealed;
  decrypt: (ciphertext: Buffer, keyVersion: number, aad: string) => Buffer;
};

/** AAD の文字列を作る。kind はレコードの種別(例: diary.content) */
export const aad = (kind: string, id: string) => `${kind}:${id}`;

export function createCipherBox(keys: ReadonlyMap<number, Buffer>, activeVersion: number): CipherBox {
  const keyFor = (version: number): Buffer => {
    const key = keys.get(version);
    if (!key) throw new Error(`暗号鍵のバージョン ${version} がありません`);
    return key;
  };
  keyFor(activeVersion);
  return {
    encrypt(plaintext, aadValue) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv('aes-256-gcm', keyFor(activeVersion), iv);
      cipher.setAAD(Buffer.from(aadValue));
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return { ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]), keyVersion: activeVersion };
    },
    decrypt(ciphertext, keyVersion, aadValue) {
      const iv = ciphertext.subarray(0, IV_LENGTH);
      const tag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const body = ciphertext.subarray(IV_LENGTH + TAG_LENGTH);
      const decipher = createDecipheriv('aes-256-gcm', keyFor(keyVersion), iv);
      decipher.setAAD(Buffer.from(aadValue));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    },
  };
}
