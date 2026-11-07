// API の応答の型(contracts/openapi.yaml に対応)
import type { Visibility, Weather } from './schemas.ts';

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { field: string; code: string }[];
};

export type Me = {
  handle: string;
  nickname: string;
  email: string;
  visibility: Visibility;
  hasAvatar: boolean;
};

export type UserSummary = { handle: string; nickname: string; hasAvatar: boolean };

export type Diary = {
  date: string;
  body: string;
  weather: Weather;
  imageUrl: string;
  author: UserSummary;
};

export type DiaryPage = { items: Diary[]; nextCursor: string | null };

export type FollowList = { approved: UserSummary[]; pending: UserSummary[] };

export type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export type WebAuthnOptions<T> = { challengeId: string; options: T };
