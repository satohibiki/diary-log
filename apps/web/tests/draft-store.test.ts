import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from '../src/lib/draft-store.ts';

beforeEach(async () => {
  await clearAllDrafts();
});

describe('draft store', () => {
  it('saves and restores a draft including the image', async () => {
    const image = new Blob(['img'], { type: 'image/png' });
    await saveDraft('alice', 'new', { date: '2026-11-07', body: 'かきかけ', weather: 'sunny', image });
    const draft = await loadDraft('alice', 'new');
    expect(draft).toMatchObject({ date: '2026-11-07', body: 'かきかけ', weather: 'sunny' });
    expect(draft?.image).toBeInstanceOf(Blob);
  });

  it('keeps drafts separate per user and per diary', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-07', body: 'a', weather: '', image: null });
    await saveDraft('alice', '2026-11-01', { date: '2026-11-01', body: 'edit', weather: 'rainy', image: null });
    expect(await loadDraft('bobby', 'new')).toBeNull();
    expect((await loadDraft('alice', '2026-11-01'))?.body).toBe('edit');
  });

  it('clears a draft after saving', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-07', body: 'a', weather: '', image: null });
    await clearDraft('alice', 'new');
    expect(await loadDraft('alice', 'new')).toBeNull();
  });

  it('clears every draft on logout', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-07', body: 'a', weather: '', image: null });
    await saveDraft('bobby', 'new', { date: '2026-11-07', body: 'b', weather: '', image: null });
    await clearAllDrafts();
    expect(await loadDraft('alice', 'new')).toBeNull();
    expect(await loadDraft('bobby', 'new')).toBeNull();
  });
});
