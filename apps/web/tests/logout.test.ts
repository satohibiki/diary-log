import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout } from '../src/features/auth/logout.ts';
import { loadDraft, saveDraft } from '../src/lib/draft-store.ts';
import { mockFetch } from './helpers.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logout', () => {
  it('ends the session and removes every draft from this device', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-07', body: 'のこさない', weather: '', image: null });
    const calls = mockFetch({ 'POST /api/v1/auth/logout': { status: 204 } });
    await logout();
    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(await loadDraft('alice', 'new')).toBeNull();
  });

  it('removes drafts even if the server cannot be reached, then reports the failure', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-07', body: 'のこさない', weather: '', image: null });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(logout()).rejects.toMatchObject({ status: 0 });
    expect(await loadDraft('alice', 'new')).toBeNull();
  });
});
