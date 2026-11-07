import { api } from '../../lib/api-client.ts';
import { clearAllDrafts } from '../../lib/draft-store.ts';

/** ログアウトする。端末に残る下書きは、サーバーへの通信の成否にかかわらず先に消去する */
export async function logout(): Promise<void> {
  await clearAllDrafts();
  await api('/auth/logout', { method: 'POST' });
}
