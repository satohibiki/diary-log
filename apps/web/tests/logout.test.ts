import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout } from '../src/features/auth/logout.ts';
import { loadNewDraft, saveNewDraft } from '../src/lib/draft-store.ts';
import { mockFetch } from './helpers.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

// 新規の書きかけは日付ごとのキーに保持する(003 FR-003)。消去の期待は変えない
describe('logout', () => {
  it('ends the session and removes every draft from this device', async () => {
    await saveNewDraft('alice', { date: '2026-11-07', body: 'のこさない', weather: '', image: null });
    const calls = mockFetch({ 'POST /api/v1/auth/logout': { status: 204 } });
    await logout();
    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(await loadNewDraft('alice', '2026-11-07')).toBeNull();
  });

  it('removes drafts even if the server cannot be reached, then reports the failure', async () => {
    await saveNewDraft('alice', { date: '2026-11-07', body: 'のこさない', weather: '', image: null });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(logout()).rejects.toMatchObject({ status: 0 });
    expect(await loadNewDraft('alice', '2026-11-07')).toBeNull();
  });
});
