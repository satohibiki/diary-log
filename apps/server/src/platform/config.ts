// 環境変数を検証して設定を読み込む。欠落や不正があれば代替値を使わず起動を止める(憲章の原則 VIII)
export type Config = Readonly<{
  databaseUrl: string;
  appOrigin: string;
  rpId: string;
  rpName: string;
  encryptionKeys: ReadonlyMap<number, Buffer>;
  activeKeyVersion: number;
  hmacSecret: Buffer;
  smtpUrl: string;
  mailFrom: string;
  port: number;
}>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const REQUIRED = [
  'DATABASE_URL', 'APP_ORIGIN', 'RP_ID', 'RP_NAME', 'DATA_ENCRYPTION_KEYS', 'ACTIVE_KEY_VERSION',
  'HMAC_SECRET', 'SMTP_URL', 'MAIL_FROM', 'PORT',
] as const;

function parseKeys(raw: string): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const entry of raw.split(',')) {
    const match = /^(\d+):([A-Za-z0-9+/=]+)$/.exec(entry.trim());
    if (!match?.[1] || !match[2]) throw new ConfigError('DATA_ENCRYPTION_KEYS の形式が不正です');
    const key = Buffer.from(match[2], 'base64');
    if (key.length !== 32) throw new ConfigError('DATA_ENCRYPTION_KEYS の鍵は32バイトである必要があります');
    keys.set(Number(match[1]), key);
  }
  return keys;
}

function parseInteger(name: string, raw: string): number {
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${name} は整数である必要があります`);
  return Number(raw);
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) throw new ConfigError(`環境変数が設定されていません: ${missing.join(', ')}`);
  const get = (name: (typeof REQUIRED)[number]) => env[name] ?? '';

  const encryptionKeys = parseKeys(get('DATA_ENCRYPTION_KEYS'));
  const activeKeyVersion = parseInteger('ACTIVE_KEY_VERSION', get('ACTIVE_KEY_VERSION'));
  if (!encryptionKeys.has(activeKeyVersion)) {
    throw new ConfigError('ACTIVE_KEY_VERSION に対応する鍵が DATA_ENCRYPTION_KEYS にありません');
  }
  const hmacSecret = Buffer.from(get('HMAC_SECRET'), 'base64');
  if (hmacSecret.length < 32) throw new ConfigError('HMAC_SECRET は32バイト以上である必要があります');

  let appOrigin: string;
  try {
    appOrigin = new URL(get('APP_ORIGIN')).origin;
  } catch {
    throw new ConfigError('APP_ORIGIN が URL ではありません');
  }
  if (!appOrigin.startsWith('https://')) throw new ConfigError('APP_ORIGIN は https である必要があります');

  return Object.freeze({
    databaseUrl: get('DATABASE_URL'),
    appOrigin,
    rpId: get('RP_ID'),
    rpName: get('RP_NAME'),
    encryptionKeys,
    activeKeyVersion,
    hmacSecret,
    smtpUrl: get('SMTP_URL'),
    mailFrom: get('MAIL_FROM'),
    port: parseInteger('PORT', get('PORT')),
  });
}
