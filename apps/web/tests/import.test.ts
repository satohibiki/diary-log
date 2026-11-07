import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importDiaries } from '../src/features/profile/import.ts';
import { UserFacingError } from '../src/lib/errors.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);

function archive(manifest: unknown, images: Record<string, Uint8Array> = {}) {
  return new Blob([new Uint8Array(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...images }))]);
}

const entry = (date: string) => ({ date, body: `${date} の日記`, weather: 'sunny', image: `images/${date}.webp` });

function stubServer(statusByDate: Record<string, number>) {
  const posted: FormData[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      posted.push(form);
      const status = statusByDate[form.get('date') as string] ?? 201;
      const body =
        status === 201
          ? '{}'
          : JSON.stringify({ type: status === 409 ? 'diary-exists' : 'validation', title: status === 409 ? '既にあります' : '入力内容を確認してください', status });
      return Promise.resolve(
        new Response(body, {
          status,
          headers: { 'content-type': status === 201 ? 'application/json' : 'application/problem+json' },
        }),
      );
    }),
  );
  return posted;
}

describe('importDiaries', () => {
  it('creates each diary through the normal API and reports counts', async () => {
    const posted = stubServer({ '2026-11-02': 409, '2026-11-03': 422 });
    const file = archive(
      { schemaVersion: 1, diaries: [entry('2026-11-01'), entry('2026-11-02'), entry('2026-11-03')] },
      { 'images/2026-11-01.webp': webp, 'images/2026-11-02.webp': webp, 'images/2026-11-03.webp': webp },
    );
    const result = await importDiaries(file);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toEqual([{ date: '2026-11-03', reason: '入力内容を確認してください' }]);
    expect(posted).toHaveLength(3);
    expect(posted[0]?.get('body')).toBe('2026-11-01 の日記');
    expect(posted[0]?.get('image')).toBeInstanceOf(Blob);
  });

  it('never overwrites: existing dates are skipped, not updated', async () => {
    stubServer({ '2026-11-01': 409 });
    const result = await importDiaries(archive({ schemaVersion: 1, diaries: [entry('2026-11-01')] }, { 'images/2026-11-01.webp': webp }));
    expect(result).toEqual({ created: 0, skipped: 1, failed: [] });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('rejects files that are not ZIP archives', async () => {
    stubServer({});
    await expect(importDiaries(new Blob(['not a zip']))).rejects.toBeInstanceOf(UserFacingError);
  });

  it('rejects archives without a valid manifest or with another schema version', async () => {
    stubServer({});
    await expect(importDiaries(new Blob([new Uint8Array(zipSync({ 'x.txt': strToU8('x') }))]))).rejects.toBeInstanceOf(UserFacingError);
    await expect(importDiaries(archive({ schemaVersion: 2, diaries: [] }))).rejects.toThrow('形式');
    await expect(importDiaries(archive({ schemaVersion: 1, diaries: [{ date: 'x' }] }))).rejects.toBeInstanceOf(UserFacingError);
  });

  it('reports a missing image as a failure for that diary', async () => {
    stubServer({});
    const result = await importDiaries(archive({ schemaVersion: 1, diaries: [entry('2026-11-01')] }));
    expect(result.failed).toEqual([{ date: '2026-11-01', reason: '画像がありません' }]);
  });
});
