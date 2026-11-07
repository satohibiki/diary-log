import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { AppError, errors, handleError } from '../../src/platform/errors.ts';
import { createLogger } from '../../src/platform/logger.ts';

function appThrowing(error: unknown, lines: string[] = []) {
  const app = new Hono();
  app.onError(handleError(createLogger((line) => lines.push(line))));
  app.get('/', () => {
    throw error;
  });
  return app;
}

describe('handleError', () => {
  it('returns problem+json for application errors', async () => {
    const res = await appThrowing(errors.conflict('diary-exists', 'その日付の絵日記は既にあります')).request('/');
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(await res.json()).toEqual({
      type: 'diary-exists',
      title: 'その日付の絵日記は既にあります',
      status: 409,
    });
  });

  it('includes field errors for validation failures', async () => {
    const res = await appThrowing(errors.validation([{ field: 'body', code: 'too_big' }])).request('/');
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: [{ field: 'body', code: 'too_big' }] });
  });

  it('hides internal error details and logs only the error name', async () => {
    const lines: string[] = [];
    const res = await appThrowing(new Error('connection to user@example.com failed'), lines).request('/');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('user@example.com');
    expect(lines.join()).not.toContain('user@example.com');
    expect(lines.join()).toContain('Error');
  });

  it('uses the same 404 problem for missing and forbidden resources', async () => {
    const a = await appThrowing(errors.notFound()).request('/');
    expect(a.status).toBe(404);
    expect(await a.json()).toEqual({ type: 'not-found', title: '見つかりません', status: 404 });
  });

  it('exposes AppError for instanceof checks', () => {
    expect(errors.notFound()).toBeInstanceOf(AppError);
  });
});
