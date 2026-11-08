import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PrivacyPage } from '../src/features/legal/PrivacyPage.tsx';
import { publicRoutes } from '../src/routes.tsx';

describe('PrivacyPage', () => {
  it('explains what operators can read, how long backups are kept, and how email is used', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    const text = document.body.textContent;
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('データの取り扱い');
    expect(text).toContain('運営者');
    expect(text).toContain('30日');
    expect(text).toMatch(/メールアドレス.*(復旧|確認)/);
    expect(text).toContain('パスワード');
  });

  it('states that the handwriting font is served by this service, not loaded from outside', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(document.body.textContent).toMatch(/書体.*このサービス/);
  });

  it('can be opened without signing in, so it is readable before registration', () => {
    expect(publicRoutes.map((r) => r.path)).toContain('/privacy');
  });
});
