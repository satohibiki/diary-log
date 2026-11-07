import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/platform/logger.ts';

describe('createLogger', () => {
  it('writes one JSON line per event with allowed fields', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.info('request', { method: 'GET', path: '/api/v1/me', status: 200, durationMs: 3 });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'info', event: 'request', method: 'GET', status: 200 });
    expect(typeof entry.time).toBe('string');
  });

  it('drops fields that are not on the allow list', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.error('failed', {
      userId: 'u1',
      body: '今日の日記の本文',
      email: 'user@example.com',
      code: '12345678',
    } as never);
    const output = lines.join('\n');
    expect(output).toContain('u1');
    expect(output).not.toContain('今日の日記の本文');
    expect(output).not.toContain('user@example.com');
    expect(output).not.toContain('12345678');
  });

  it('removes the query string from paths', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.info('request', { path: '/api/v1/me/diaries?month=2026-11' });
    expect(lines[0]).not.toContain('month=');
  });

  it('records only the error name, never the message', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.errorFrom('unhandled', new TypeError('user@example.com is invalid'));
    expect(lines[0]).toContain('TypeError');
    expect(lines[0]).not.toContain('user@example.com');
  });
});
