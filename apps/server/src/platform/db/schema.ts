// データベースのスキーマ(data-model.md に対応)
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const visibility = pgEnum('visibility', ['private', 'public']);
export const sessionScope = pgEnum('session_scope', ['full', 'recovery']);
export const challengePurpose = pgEnum('challenge_purpose', ['register', 'login', 'step_up', 'add_passkey', 'recover']);
export const otpPurpose = pgEnum('otp_purpose', ['registration', 'recovery', 'email_change']);
export const followStatus = pgEnum('follow_status', ['pending', 'approved']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull().unique(),
  nickname: text('nickname').notNull(),
  emailEnc: bytea('email_enc').notNull(),
  avatarEnc: bytea('avatar_enc'),
  visibility: visibility('visibility').notNull().default('private'),
  keyVersion: integer('key_version').notNull(),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    credentialId: bytea('credential_id').notNull().unique(),
    publicKey: bytea('public_key').notNull(),
    signCount: bigint('sign_count', { mode: 'number' }).notNull(),
    transports: text('transports').array().notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [index('passkeys_user_idx').on(t.userId), check('passkeys_name_len', sql`char_length(${t.name}) <= 50`)],
);

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: bytea('token_hash').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scope: sessionScope('scope').notNull(),
    stepUpUntil: ts('step_up_until'),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const webauthnChallenges = pgTable('webauthn_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challenge: text('challenge').notNull(),
  purpose: challengePurpose('purpose').notNull(),
  subjectId: uuid('subject_id'),
  expiresAt: ts('expires_at').notNull(),
});

export const pendingRegistrations = pgTable('pending_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull(),
  emailEnc: bytea('email_enc').notNull(),
  keyVersion: integer('key_version').notNull(),
  emailVerifiedAt: ts('email_verified_at'),
  expiresAt: ts('expires_at').notNull(),
});

export const emailOtps = pgTable(
  'email_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: otpPurpose('purpose').notNull(),
    subjectId: uuid('subject_id').notNull(),
    newEmailEnc: bytea('new_email_enc'),
    keyVersion: integer('key_version'),
    codeHmac: bytea('code_hmac').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
  },
  (t) => [index('email_otps_subject_idx').on(t.purpose, t.subjectId)],
);

export const diaries = pgTable(
  'diaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    diaryDate: date('diary_date', { mode: 'string' }).notNull(),
    contentEnc: bytea('content_enc').notNull(),
    imageEnc: bytea('image_enc').notNull(),
    keyVersion: integer('key_version').notNull(),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // 1人1日付1件(FR-011)
    uniqueIndex('diaries_user_date_unique').on(t.userId, t.diaryDate),
  ],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: followStatus('status').notNull(),
    createdAt: createdAt(),
    approvedAt: ts('approved_at'),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index('follows_followee_idx').on(t.followeeId, t.status),
    check('follows_not_self', sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('blocks_blocked_idx').on(t.blockedId)],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    bucket: text('bucket').notNull(),
    windowStart: ts('window_start').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);
