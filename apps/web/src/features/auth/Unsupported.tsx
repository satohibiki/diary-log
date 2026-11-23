/** パスキーに対応していない環境で、パスキーのボタンの説明として表示する(004 FR-012) */
export function PasskeyUnsupported({ id }: { id: string }) {
  return (
    <p id={id} role="status">
      このブラウザはパスキーに対応していません
    </p>
  );
}
