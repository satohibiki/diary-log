// 許可リスト方式の JSON ロガー。日記の内容、メールアドレス、認証情報を出力しない(憲章の原則 III)
type Fields = Partial<{
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId: string;
  errorName: string;
  errorCode: string;
  count: number;
}>;

const ALLOWED = new Set([
  'requestId', 'method', 'path', 'status', 'durationMs', 'userId', 'errorName', 'errorCode', 'count',
]);

export type Logger = {
  info: (event: string, fields?: Fields) => void;
  warn: (event: string, fields?: Fields) => void;
  error: (event: string, fields?: Fields) => void;
  errorFrom: (event: string, error: unknown, fields?: Fields) => void;
};

export function createLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Logger {
  const log = (level: string, event: string, fields: Fields = {}) => {
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level, event };
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED.has(key)) continue;
      entry[key] = key === 'path' && typeof value === 'string' ? value.split('?')[0] : value;
    }
    write(JSON.stringify(entry));
  };
  return {
    info: (event, fields) => {
      log('info', event, fields);
    },
    warn: (event, fields) => {
      log('warn', event, fields);
    },
    error: (event, fields) => {
      log('error', event, fields);
    },
    errorFrom: (event, error, fields = {}) => {
      const errorName = error instanceof Error ? error.name : typeof error;
      const code = (error as { code?: unknown } | null)?.code;
      log('error', event, {
        ...fields,
        errorName,
        ...(typeof code === 'string' ? { errorCode: code } : {}),
      });
    },
  };
}
