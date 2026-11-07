import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { makeImage, makeJpegWithGps } from '../helpers/images.ts';
import { block, createUser, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

const form = (image: Buffer, type = 'image/jpeg') => {
  const f = new FormData();
  f.set('image', new Blob([new Uint8Array(image)], { type }), 'avatar');
  return f;
};

describe('avatar', () => {
  it('stores a 400px WebP without metadata, encrypted', async () => {
    const user = await createUser(ctx, { handle: 'alice' });
    const client = await loginAs(ctx, user);
    expect((await client.putForm('/api/v1/me/avatar', form(await makeImage('png', 1200, 800)))).status).toBe(204);
    const res = await client.get('/api/v1/users/alice/avatar');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([400, 267]);
    const [row] = await ctx.deps.db.select().from(users);
    expect(row?.avatarEnc?.subarray(0, 4).toString('latin1')).not.toBe('RIFF');
    expect(await (await client.get('/api/v1/me')).json()).toMatchObject({ hasAvatar: true });
  });

  it('removes location data', async () => {
    const client = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    await client.putForm('/api/v1/me/avatar', form(await makeJpegWithGps()));
    const image = Buffer.from(await (await client.get('/api/v1/users/alice/avatar')).arrayBuffer());
    expect((await sharp(image).metadata()).exif).toBeUndefined();
  });

  it('rejects unsupported formats and oversized files', async () => {
    const client = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    expect((await client.putForm('/api/v1/me/avatar', form(await makeImage('gif'), 'image/gif'))).status).toBe(415);
    expect((await client.putForm('/api/v1/me/avatar', form(Buffer.alloc(10 * 1024 * 1024 + 1)))).status).toBe(413);
  });

  it('can be deleted', async () => {
    const client = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    await client.putForm('/api/v1/me/avatar', form(await makeImage('png')));
    expect((await client.delete('/api/v1/me/avatar')).status).toBe(204);
    expect((await client.get('/api/v1/users/alice/avatar')).status).toBe(404);
  });

  it('is visible to signed-in users but not across a block', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const bob = await createUser(ctx, { handle: 'bobby' });
    const a = await loginAs(ctx, alice);
    await a.putForm('/api/v1/me/avatar', form(await makeImage('png')));
    const b = await loginAs(ctx, bob);
    expect((await b.get('/api/v1/users/alice/avatar')).status).toBe(200);
    await block(ctx, alice, bob);
    expect((await b.get('/api/v1/users/alice/avatar')).status).toBe(404);
    expect((await ctx.client().get('/api/v1/users/alice/avatar')).status).toBe(401);
  });

  it('keeps the email readable after the avatar is re-encrypted', async () => {
    const client = await loginAs(ctx, await createUser(ctx, { handle: 'alice', email: 'keep@example.com' }));
    await client.putForm('/api/v1/me/avatar', form(await makeImage('png')));
    expect(await (await client.get('/api/v1/me')).json()).toMatchObject({ email: 'keep@example.com' });
  });
});
