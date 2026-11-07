import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createUser, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

async function alice() {
  return loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
}

describe('PATCH /me', () => {
  it('starts private and can switch visibility', async () => {
    const client = await alice();
    expect(await (await client.get('/api/v1/me')).json()).toMatchObject({ visibility: 'private' });
    const res = await client.patch('/api/v1/me', { visibility: 'public' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visibility: 'public' });
  });

  it('updates the nickname (1 to 20 characters)', async () => {
    const client = await alice();
    expect(await (await client.patch('/api/v1/me', { nickname: 'ありす🌸' })).json()).toMatchObject({ nickname: 'ありす🌸' });
    expect((await client.patch('/api/v1/me', { nickname: '' })).status).toBe(422);
    expect((await client.patch('/api/v1/me', { nickname: 'あ'.repeat(21) })).status).toBe(422);
  });

  it('accepts only nickname and visibility', async () => {
    const client = await alice();
    expect((await client.patch('/api/v1/me', { email: 'x@example.com' })).status).toBe(422);
    expect((await client.patch('/api/v1/me', { handle: 'other' })).status).toBe(422);
    expect((await client.patch('/api/v1/me', {})).status).toBe(422);
  });
});
