// テスト用のソフトウェア認証器。node:crypto の ES256 で WebAuthn の応答を生成する
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const b64url = (buf: Uint8Array) => Buffer.from(buf).toString('base64url');

// 必要な型だけを扱う最小限の CBOR エンコーダー
function cbor(value: unknown): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
    const b = Buffer.alloc(5);
    b[0] = (major << 5) | 26;
    b.writeUInt32BE(n, 1);
    return b;
  };
  if (typeof value === 'number') {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === 'string') {
    const s = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, s.length), s]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([head(2, value.length), Buffer.from(value)]);
  }
  if (value instanceof Map) {
    const parts: Buffer[] = [head(5, value.size)];
    for (const [k, v] of value) parts.push(cbor(k), cbor(v));
    return Buffer.concat(parts);
  }
  throw new Error('unsupported CBOR value');
}

type Credential = { id: Buffer; privateKey: KeyObject; userHandle: string; counter: number };

type CreationOptions = { challenge: string; rp: { id?: string }; user: { id: string } };
type RequestOptions = { challenge: string; rpId?: string };

export class SoftwareAuthenticator {
  readonly #origin: string;
  readonly #rpId: string;
  readonly credentials: Credential[] = [];

  constructor(origin = 'https://localhost:5173', rpId = 'localhost') {
    this.#origin = origin;
    this.#rpId = rpId;
  }

  #authData(flags: number, counter: number, attested?: Buffer): Buffer {
    const rpIdHash = createHash('sha256').update(this.#rpId).digest();
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    return Buffer.concat([rpIdHash, Buffer.from([flags]), count, ...(attested ? [attested] : [])]);
  }

  /** navigator.credentials.create() の応答に相当する JSON を返す */
  create(options: CreationOptions) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    const coseKey = new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x ?? '', 'base64url')],
      [-3, Buffer.from(jwk.y ?? '', 'base64url')],
    ]);
    const id = randomBytes(16);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(id.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLength, id, cbor(coseKey)]);
    // UP(0x01) + UV(0x04) + AT(0x40)
    const authData = this.#authData(0x45, 0, attested);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: this.#origin, crossOrigin: false }),
    );
    const attestationObject = cbor(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    this.credentials.push({ id, privateKey, userHandle: options.user.id, counter: 0 });
    return {
      id: b64url(id),
      rawId: b64url(id),
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** navigator.credentials.get() の応答に相当する JSON を返す */
  get(options: RequestOptions, credential: Credential | undefined = this.credentials.at(-1)) {
    if (!credential) throw new Error('認証情報が登録されていません');
    credential.counter += 1;
    const authData = this.#authData(0x05, credential.counter);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: this.#origin, crossOrigin: false }),
    );
    const signature = sign(
      'sha256',
      Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()]),
      credential.privateKey,
    );
    return {
      id: b64url(credential.id),
      rawId: b64url(credential.id),
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: credential.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
