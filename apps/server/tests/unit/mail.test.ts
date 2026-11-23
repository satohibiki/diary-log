import { describe, expect, it } from 'vitest';
import { createMailer, type MailTransport } from '../../src/platform/mail.ts';

function capture() {
  const sent: { to: string; subject: string; text: string }[] = [];
  const transport: MailTransport = {
    sendMail: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
  return { sent, mailer: createMailer(transport, 'diary-log <no-reply@localhost>') };
}

describe('createMailer', () => {
  it('sends a one-time password for each purpose', async () => {
    const { sent, mailer } = capture();
    await mailer.sendOtp('user@example.com', 'registration', '12345678');
    await mailer.sendOtp('user@example.com', 'recovery', '87654321');
    await mailer.sendOtp('user@example.com', 'email_change', '11112222');
    expect(sent).toHaveLength(3);
    expect(sent[0]?.text).toContain('12345678');
    expect(sent[1]?.text).toContain('87654321');
    expect(sent[0]?.to).toBe('user@example.com');
  });

  it('sends security notifications that contain no diary content', async () => {
    const { sent, mailer } = capture();
    await mailer.notify('user@example.com', 'recovered');
    await mailer.notify('user@example.com', 'passkey_added');
    await mailer.notify('old@example.com', 'email_changed');
    expect(sent.map((m) => m.to)).toEqual(['user@example.com', 'user@example.com', 'old@example.com']);
    for (const message of sent) expect(message.text.length).toBeGreaterThan(0);
  });

  // 004: 新しい端末の確認と、パスワードの通知
  it('sends the new-device one-time password and the password notifications', async () => {
    const { sent, mailer } = capture();
    await mailer.sendOtp('user@example.com', 'new_device', '33334444');
    await mailer.notify('user@example.com', 'new_device_login');
    await mailer.notify('user@example.com', 'password_set');
    await mailer.notify('user@example.com', 'password_changed');
    await mailer.notify('user@example.com', 'recovered');
    expect(sent.map((m) => m.subject)).toEqual([
      '【diary-log】新しい端末からのログインの確認',
      '【diary-log】新しい端末からログインしました',
      '【diary-log】パスワードが設定されました',
      '【diary-log】パスワードが変更されました',
      '【diary-log】アカウントが復旧されました',
    ]);
    expect(sent[0]?.text).toContain('33334444');
    expect(sent[4]?.text).toContain('パスワードの再設定または新しいパスキーの登録');
  });

  it('propagates transport failures', async () => {
    const mailer = createMailer(
      { sendMail: () => Promise.reject(new Error('smtp down')) },
      'diary-log <no-reply@localhost>',
    );
    await expect(mailer.sendOtp('a@example.com', 'registration', '12345678')).rejects.toThrow('smtp down');
  });

  it('only accepts fixed templates, so diary text cannot be passed in', () => {
    const { mailer } = capture();
    expect(Object.hasOwn(mailer, 'send')).toBe(false);
    expect(Object.keys(mailer).sort()).toEqual(['notify', 'sendOtp']);
  });
});
