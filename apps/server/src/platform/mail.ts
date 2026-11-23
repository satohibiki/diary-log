// メール送信。定型文のみを送り、日記の内容は含めない(憲章の原則 III)
export type MailMessage = { to: string; subject: string; text: string };
export type MailTransport = { sendMail: (message: MailMessage & { from: string }) => Promise<unknown> };

export type OtpPurpose = 'registration' | 'recovery' | 'email_change' | 'new_device';
export type Notice = 'recovered' | 'passkey_added' | 'email_changed' | 'new_device_login' | 'password_set' | 'password_changed';

const OTP_SUBJECT: Record<OtpPurpose, string> = {
  registration: '【diary-log】メールアドレスの確認',
  recovery: '【diary-log】アカウントの復旧',
  email_change: '【diary-log】新しいメールアドレスの確認',
  new_device: '【diary-log】新しい端末からのログインの確認',
};

const NOTICE: Record<Notice, { subject: string; text: string }> = {
  recovered: {
    subject: '【diary-log】アカウントが復旧されました',
    text: 'パスワードの再設定または新しいパスキーの登録により、アカウントが復旧されました。\n心当たりがない場合は、すぐにアカウントを確認してください。',
  },
  passkey_added: {
    subject: '【diary-log】パスキーが追加されました',
    text: 'あなたのアカウントに新しいパスキーが追加されました。\n心当たりがない場合は、すぐにパスキーの一覧を確認してください。',
  },
  email_changed: {
    subject: '【diary-log】メールアドレスが変更されました',
    text: 'あなたのアカウントのメールアドレスが変更されました。\n心当たりがない場合は、すぐにアカウントを確認してください。',
  },
  new_device_login: {
    subject: '【diary-log】新しい端末からログインしました',
    text: 'あなたのアカウントに、新しい端末からログインしました。\n心当たりがない場合は、すぐにパスワードを変更してください。',
  },
  password_set: {
    subject: '【diary-log】パスワードが設定されました',
    text: 'あなたのアカウントにパスワードが設定されました。ほかの端末はログアウトされました。\n心当たりがない場合は、すぐにアカウントを確認してください。',
  },
  password_changed: {
    subject: '【diary-log】パスワードが変更されました',
    text: 'あなたのアカウントのパスワードが変更されました。ほかの端末はログアウトされました。\n心当たりがない場合は、すぐにアカウントを復旧してください。',
  },
};

export type Mailer = {
  sendOtp: (to: string, purpose: OtpPurpose, code: string) => Promise<void>;
  notify: (to: string, notice: Notice) => Promise<void>;
};

export function createMailer(transport: MailTransport, from: string): Mailer {
  const send = async (message: MailMessage) => {
    await transport.sendMail({ ...message, from });
  };
  return {
    sendOtp: (to, purpose, code) =>
      send({
        to,
        subject: OTP_SUBJECT[purpose],
        text: `ワンタイムパスワード: ${code}\n\n有効期限は10分です。心当たりがない場合は、このメールを破棄してください。`,
      }),
    notify: (to, notice) => send({ to, ...NOTICE[notice] }),
  };
}
