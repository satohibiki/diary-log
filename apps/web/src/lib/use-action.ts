import { useCallback, useState } from 'react';

/** 非同期の操作を実行し、実行中の状態とエラーを保持する。エラーは握りつぶさず画面に渡す */
export function useAction<A extends unknown[]>(action: (...args: A) => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(null);
      try {
        await action(...args);
      } catch (e) {
        setError(e);
      } finally {
        setPending(false);
      }
    },
    [action],
  );
  return { run, pending, error, setError };
}
