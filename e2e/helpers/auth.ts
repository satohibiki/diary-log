// E2E 用: Chromium の仮想認証器と、開発用メールサーバー(Mailpit)からのワンタイムパスワード取得
import type { BrowserContext, Page } from '@playwright/test';

export async function addVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

const MAILPIT = 'http://localhost:8025/api/v1';

type MailSummary = { ID: string; To: { Address: string }[]; Created: string };

/** 指定した宛先に届いた最新のメールから8桁のコードを取り出す。届くまで最大10秒待つ */
export async function fetchOtp(to: string, after = new Date(0)): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (!res.ok) throw new Error(`Mailpit の検索に失敗しました: ${res.status}`);
    const { messages } = (await res.json()) as { messages: MailSummary[] };
    const latest = messages.find((m) => new Date(m.Created) >= after);
    if (latest) {
      const detail = (await (await fetch(`${MAILPIT}/message/${latest.ID}`)).json()) as { Text: string };
      const code = /\b(\d{8})\b/.exec(detail.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${to} 宛てのワンタイムパスワードが届きませんでした`);
}

export function uniqueHandle(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 20);
}
