import { useId, useState } from 'react';

type Props = {
  id: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
};

/**
 * パスワードの入力欄(004 FR-014)。伏せ字と表示を切り替えられる。
 * パスワード管理ツールの自動入力と生成、貼り付けを妨げない(autocomplete を指定し、paste を止めない)
 */
export function PasswordInput({ id, label, autoComplete, value, onChange, describedBy }: Props) {
  const [visible, setVisible] = useState(false);
  const toggleId = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        <button
          id={toggleId}
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          aria-label="パスワードを表示"
          onClick={() => {
            setVisible((v) => !v);
          }}
        >
          {visible ? '隠す' : '表示'}
        </button>
      </span>
    </>
  );
}
