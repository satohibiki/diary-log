import type { ReactNode } from 'react';
import { LoginPage } from './features/auth/LoginPage.tsx';
import { PrivacyPage } from './features/legal/PrivacyPage.tsx';
import { RecoveryPage } from './features/auth/RecoveryPage.tsx';
import { SignupPage } from './features/auth/SignupPage.tsx';
import { SecuritySettings } from './features/auth/SecuritySettings.tsx';
import { DiaryEditor } from './features/diary/DiaryEditor.tsx';
import { DiaryView } from './features/diary/DiaryView.tsx';
import { CalendarPage } from './features/calendar/CalendarPage.tsx';
import { ProfilePage } from './features/profile/ProfilePage.tsx';
import { ConnectionsPage } from './features/social/ConnectionsPage.tsx';
import { FeedPage } from './features/social/FeedPage.tsx';
import { UserPage } from './features/social/UserPage.tsx';
import { Navigate } from 'react-router';

type RouteDef = { path: string; element: ReactNode };

/** ログインせずに開ける画面 */
export const publicRoutes: RouteDef[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/recover', element: <RecoveryPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
];

/** ログインが必要な画面 */
export const routes: RouteDef[] = [
  { path: '/', element: <Navigate to="/calendar" replace /> },
  { path: '/calendar', element: <CalendarPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/feed', element: <FeedPage /> },
  { path: '/connections', element: <ConnectionsPage /> },
  { path: '/users/:handle', element: <UserPage /> },
  { path: '/settings/security', element: <SecuritySettings /> },
  { path: '/diaries/new', element: <DiaryEditor /> },
  { path: '/diaries/:date/edit', element: <DiaryEditor /> },
  { path: '/users/:handle/diaries/:date', element: <DiaryView /> },
];
