// 新規の書きかけのキーを日付ごとに分けたため(003 FR-003)、新規の書きかけは日付ごとの関数で確かめる
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllDrafts,
  clearDraft,
  clearNewDraft,
  isEmptyDraft,
  listNewDraftDates,
  loadDraft,
  loadNewDraft,
  migrateLegacyNewDraft,
  saveDraft,
  saveNewDraft,
  type Draft,
} from '../src/lib/draft-store.ts';

beforeEach(async () => {
  await clearAllDrafts();
});

const text = (date: string, body = 'かきかけ'): Draft => ({ date, body, weather: '', image: null });

describe('draft store', () => {
  it('saves and restores a draft including the image', async () => {
    const image = new Blob(['img'], { type: 'image/png' });
    await saveNewDraft('alice', { date: '2026-11-07', body: 'かきかけ', weather: 'sunny', image });
    const draft = await loadNewDraft('alice', '2026-11-07');
    expect(draft).toMatchObject({ date: '2026-11-07', body: 'かきかけ', weather: 'sunny' });
    expect(draft?.image).toBeInstanceOf(Blob);
  });

  it('keeps drafts separate per user and per diary', async () => {
    await saveNewDraft('alice', text('2026-11-07', 'a'));
    await saveDraft('alice', '2026-11-01', { date: '2026-11-01', body: 'edit', weather: 'rainy', image: null });
    expect(await loadNewDraft('bobby', '2026-11-07')).toBeNull();
    expect((await loadDraft('alice', '2026-11-01'))?.body).toBe('edit');
  });

  it('keeps new drafts separate per date', async () => {
    await saveNewDraft('alice', text('2026-11-08', '8か'));
    await saveNewDraft('alice', text('2026-11-22', '22にち'));
    expect((await loadNewDraft('alice', '2026-11-22'))?.body).toBe('22にち');
    expect((await loadNewDraft('alice', '2026-11-08'))?.body).toBe('8か');
  });

  it('does not keep an empty new draft, and removes an earlier one', async () => {
    await saveNewDraft('alice', { date: '2026-11-22', body: '  \n', weather: '', image: null });
    expect(await loadNewDraft('alice', '2026-11-22')).toBeNull();
    await saveNewDraft('alice', text('2026-11-22'));
    await saveNewDraft('alice', { date: '2026-11-22', body: '', weather: '', image: null });
    expect(await loadNewDraft('alice', '2026-11-22')).toBeNull();
  });

  it('tells whether a draft is empty', () => {
    expect(isEmptyDraft({ date: '2026-11-22', body: ' \n\t', weather: '', image: null })).toBe(true);
    expect(isEmptyDraft({ date: '2026-11-22', body: 'a', weather: '', image: null })).toBe(false);
    expect(isEmptyDraft({ date: '2026-11-22', body: '', weather: 'sunny', image: null })).toBe(false);
    expect(isEmptyDraft({ date: '2026-11-22', body: '', weather: '', image: new Blob(['x']) })).toBe(false);
  });

  it('lists the dates of non-empty new drafts of the user, newest first', async () => {
    await saveNewDraft('alice', text('2026-11-15'));
    await saveNewDraft('alice', text('2026-11-08'));
    await saveNewDraft('alice', text('2026-11-22'));
    await saveNewDraft('bobby', text('2026-11-20'));
    await saveDraft('alice', '2026-11-01', text('2026-11-01'));
    await saveDraft('alice', 'new', text('2026-11-03'));
    expect(await listNewDraftDates('alice')).toEqual(['2026-11-22', '2026-11-15', '2026-11-08']);
  });

  it('clears a draft after saving', async () => {
    await saveNewDraft('alice', text('2026-11-15'));
    await saveNewDraft('alice', text('2026-11-22'));
    await clearNewDraft('alice', '2026-11-15');
    expect(await loadNewDraft('alice', '2026-11-15')).toBeNull();
    expect(await loadNewDraft('alice', '2026-11-22')).not.toBeNull();
    await saveDraft('alice', '2026-11-01', text('2026-11-01'));
    await clearDraft('alice', '2026-11-01');
    expect(await loadDraft('alice', '2026-11-01')).toBeNull();
  });

  it('clears every draft on logout', async () => {
    await saveNewDraft('alice', text('2026-11-07', 'a'));
    await saveNewDraft('bobby', text('2026-11-07', 'b'));
    await clearAllDrafts();
    expect(await loadNewDraft('alice', '2026-11-07')).toBeNull();
    expect(await loadNewDraft('bobby', '2026-11-07')).toBeNull();
  });
});

// 修正前の書きかけ(キー `<user>:new`)の移行(003 FR-008)。修正前と同じ saveDraft(user, 'new', …) で作る
describe('migrateLegacyNewDraft', () => {
  it('moves a non-empty legacy draft to the key of its date', async () => {
    const image = new Blob(['img'], { type: 'image/png' });
    await saveDraft('alice', 'new', { date: '2026-11-08', body: 'まえの', weather: 'cloudy', image });
    await migrateLegacyNewDraft('alice');
    const moved = await loadNewDraft('alice', '2026-11-08');
    expect(moved).toMatchObject({ date: '2026-11-08', body: 'まえの', weather: 'cloudy' });
    expect(moved?.image).toBeInstanceOf(Blob);
    expect(await loadDraft('alice', 'new')).toBeNull();
  });

  it('drops an empty legacy draft', async () => {
    await saveDraft('alice', 'new', { date: '2026-11-08', body: '', weather: '', image: null });
    await migrateLegacyNewDraft('alice');
    expect(await loadDraft('alice', 'new')).toBeNull();
    expect(await listNewDraftDates('alice')).toEqual([]);
    expect(await loadNewDraft('alice', '2026-11-08')).toBeNull();
  });

  it('keeps the existing new draft when both exist', async () => {
    await saveNewDraft('alice', text('2026-11-08', 'あたらしい'));
    await saveDraft('alice', 'new', text('2026-11-08', 'ふるい'));
    await migrateLegacyNewDraft('alice');
    expect((await loadNewDraft('alice', '2026-11-08'))?.body).toBe('あたらしい');
    expect(await loadDraft('alice', 'new')).toBeNull();
  });

  it('fails and keeps the legacy draft when its date is invalid', async () => {
    await saveDraft('alice', 'new', text('2026-02-30'));
    await expect(migrateLegacyNewDraft('alice')).rejects.toThrow();
    expect(await loadDraft('alice', 'new')).not.toBeNull();
  });

  it('does nothing without a legacy draft and leaves other users alone', async () => {
    await saveDraft('bobby', 'new', text('2026-11-08'));
    await migrateLegacyNewDraft('alice');
    expect(await listNewDraftDates('alice')).toEqual([]);
    expect(await loadDraft('bobby', 'new')).not.toBeNull();
  });
});
