import type { TestClient } from './app.ts';
import { makeImage } from './images.ts';

export async function diaryForm(fields: { date?: string; body?: string; weather?: string; image?: Buffer | null; filename?: string }) {
  const form = new FormData();
  if (fields.date !== undefined) form.set('date', fields.date);
  if (fields.body !== undefined) form.set('body', fields.body);
  if (fields.weather !== undefined) form.set('weather', fields.weather);
  const image = fields.image === undefined ? await makeImage('jpeg') : fields.image;
  if (image) form.set('image', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), fields.filename ?? 'photo.jpg');
  return form;
}

export async function createDiary(client: TestClient, date: string, body = 'きょうは こうえんで あそびました。') {
  const res = await client.postForm('/api/v1/me/diaries', await diaryForm({ date, body, weather: 'sunny' }));
  if (res.status !== 201) throw new Error(`絵日記の作成に失敗しました: ${res.status} ${await res.text()}`);
  return res;
}
