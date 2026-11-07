import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Me } from '@diary/shared';
import { api, ApiError } from '../lib/api-client.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

type MeState = { me: Me; setMe: (me: Me) => void };
const MeContext = createContext<MeState | null>(null);

export function useMe(): Me {
  return useMeState().me;
}

export function useMeState(): MeState {
  const state = use(MeContext);
  if (!state) throw new Error('useMe は RequireAuth の内側で使う必要があります');
  return state;
}

type Status = { kind: 'loading' } | { kind: 'ready'; me: Me } | { kind: 'signed-out' } | { kind: 'error'; error: unknown };

/** ログインしていない場合はログイン画面へ移動する */
export function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    api<Me>('/me', { signal: controller.signal }).then(
      (me) => {
        setStatus({ kind: 'ready', me });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(error instanceof ApiError && error.status === 401 ? { kind: 'signed-out' } : { kind: 'error', error });
      },
    );
    return () => {
      controller.abort();
    };
  }, []);

  switch (status.kind) {
    case 'loading':
      return <p aria-busy="true">読み込み中…</p>;
    case 'signed-out':
      return <Navigate to="/login" replace />;
    case 'error':
      return <ErrorMessage error={status.error} />;
    case 'ready':
      return (
        <MeContext
          value={{
            me: status.me,
            setMe: (me) => {
              setStatus({ kind: 'ready', me });
            },
          }}
        >
          {children}
        </MeContext>
      );
  }
}
