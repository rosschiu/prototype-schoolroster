import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { SessionSummary } from '../../../../../packages/contracts/src/auth.js';
import type { UserRole } from '../../../../../packages/contracts/src/common.js';
import type { PostgresDatabase } from '../../db/postgres.js';
import { tableRef } from '../db/schema.js';

const scrypt = promisify(scryptCallback);

export const ROSTER_SESSION_COOKIE_NAME = 'schoolroster_session';
export const ROSTER_CSRF_COOKIE_NAME = 'schoolroster_csrf';
export const ROSTER_CSRF_HEADER_NAME = 'x-schoolroster-csrf';
export const ROSTER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

type SchoolRecord = {
  id: string;
  name: string;
};

type UserRecord = {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  preferredLocale?: string;
  status: 'active' | 'suspended';
  passwordHash: string;
  roles: Array<{ role: UserRole; actorId: string }>;
};

type AuthUserRow = {
  user_id: string;
  email: string;
  display_name: string;
  preferred_locale: string | null;
  user_status: 'active' | 'suspended';
  password_hash: string;
  school_id: string;
  school_name: string;
  role: UserRole;
  actor_id: string;
};

type AuthSessionRow = {
  id: string;
  user_id: string;
  school_id: string;
  active_role: UserRole;
  csrf_token_hash: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};

type StoredSession = {
  id: string;
  userId: string;
  activeSchoolId: string;
  activeRole: UserRole;
  csrfTokenHash: string;
  startedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
};

export type AuthenticatedRosterSession = SessionSummary & {
  csrfTokenHash: string;
};

export type CreatedRosterSession = {
  session: AuthenticatedRosterSession;
  sessionToken: string;
};

export type StandaloneAuthSeed = {
  schools: SchoolRecord[];
  users: UserRecord[];
};

export type CreateStandaloneAuthServiceInput = {
  seed: StandaloneAuthSeed;
  now?: () => Date;
};

export class AuthPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPermissionError';
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function assertPasswordAllowed(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('base64url')): Promise<string> {
  assertPasswordAllowed(password);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$16384$8$1$${salt}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelization, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !cost || !blockSize || !parallelization || !salt || !hash) {
    return false;
  }
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return safeEqual(key.toString('base64url'), hash);
}

function toIso(date: Date): string {
  return date.toISOString();
}

function buildSessionSummary({
  storedSession,
  user,
  school,
  csrfToken
}: {
  storedSession: StoredSession;
  user: UserRecord;
  school: SchoolRecord;
  csrfToken?: string;
}): AuthenticatedRosterSession {
  const actorByRole = user.roles.reduce<Partial<Record<UserRole, string>>>((result, entry) => {
    result[entry.role] = entry.actorId;
    return result;
  }, {});

  return {
    sessionId: storedSession.id,
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      preferredLocale: user.preferredLocale
    },
    activeSchoolId: storedSession.activeSchoolId,
    activeSchoolName: school.name,
    activeRole: storedSession.activeRole,
    availableRoles: user.roles.map((entry) => entry.role),
    actorByRole,
    startedAt: toIso(storedSession.startedAt),
    lastSeenAt: toIso(storedSession.lastSeenAt),
    expiresAt: toIso(storedSession.expiresAt),
    csrfToken,
    csrfTokenHash: storedSession.csrfTokenHash
  };
}

function roleIsAvailable(user: UserRecord, role: UserRole): boolean {
  return user.roles.some((entry) => entry.role === role);
}

function cookieExpiresAt(session: AuthenticatedRosterSession): string {
  return new Date(session.expiresAt).toUTCString();
}

export function buildSessionCookies({
  sessionToken,
  session,
  secure
}: {
  sessionToken: string;
  session: AuthenticatedRosterSession;
  secure: boolean;
}): string[] {
  const baseFlags = ['Path=/', 'SameSite=Lax', `Expires=${cookieExpiresAt(session)}`];
  const secureFlag = secure ? ['Secure'] : [];
  return [
    [
      `${encodeURIComponent(ROSTER_SESSION_COOKIE_NAME)}=${encodeURIComponent(sessionToken)}`,
      ...baseFlags,
      'HttpOnly',
      ...secureFlag
    ].join('; '),
    [
      `${encodeURIComponent(ROSTER_CSRF_COOKIE_NAME)}=${encodeURIComponent(session.csrfToken ?? '')}`,
      ...baseFlags,
      ...secureFlag
    ].join('; ')
  ];
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...valueParts] = part.split('=');
        return [decodeURIComponent(name ?? ''), decodeURIComponent(valueParts.join('='))];
      })
  );
}

export function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function createStandaloneAuthService({ seed, now = () => new Date() }: CreateStandaloneAuthServiceInput) {
  const schools = new Map(seed.schools.map((school) => [school.id, school]));
  const usersById = new Map(seed.users.map((user) => [user.id, user]));
  const usersByEmail = new Map(seed.users.map((user) => [normalizeEmail(user.email), user]));
  const sessionsByTokenHash = new Map<string, StoredSession>();

  function resolveSession(storedSession: StoredSession, csrfToken?: string): AuthenticatedRosterSession | null {
    const user = usersById.get(storedSession.userId);
    const school = schools.get(storedSession.activeSchoolId);
    if (!user || !school || user.status !== 'active') {
      return null;
    }
    return buildSessionSummary({ storedSession, user, school, csrfToken });
  }

  return {
    async signIn(input: {
      email: string;
      password: string;
      requestedRole?: UserRole;
      ipAddress?: string;
      userAgent?: string;
    }): Promise<CreatedRosterSession | null> {
      const user = usersByEmail.get(normalizeEmail(input.email));
      if (!user || user.status !== 'active') {
        return null;
      }
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        return null;
      }

      const activeRole = input.requestedRole ?? user.roles[0]?.role;
      const school = schools.get(user.schoolId);
      if (!activeRole || !school || !roleIsAvailable(user, activeRole)) {
        return null;
      }

      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const current = now();
      const storedSession: StoredSession = {
        id: randomUUID(),
        userId: user.id,
        activeSchoolId: user.schoolId,
        activeRole,
        csrfTokenHash: hashToken(csrfToken),
        startedAt: current,
        lastSeenAt: current,
        expiresAt: new Date(current.getTime() + ROSTER_SESSION_TTL_MS)
      };
      sessionsByTokenHash.set(hashToken(sessionToken), storedSession);
      const session = buildSessionSummary({ storedSession, user, school, csrfToken });
      return { session, sessionToken };
    },

    async getSession(input: { sessionToken?: string }): Promise<AuthenticatedRosterSession | null> {
      if (!input.sessionToken) {
        return null;
      }
      const storedSession = sessionsByTokenHash.get(hashToken(input.sessionToken));
      const current = now();
      if (!storedSession || storedSession.revokedAt || storedSession.expiresAt.getTime() <= current.getTime()) {
        return null;
      }
      storedSession.lastSeenAt = current;
      return resolveSession(storedSession);
    },

    async switchRole(input: {
      session: AuthenticatedRosterSession;
      activeRole: UserRole;
    }): Promise<AuthenticatedRosterSession | null> {
      const storedSession = [...sessionsByTokenHash.values()].find((item) => item.id === input.session.sessionId);
      const user = storedSession ? usersById.get(storedSession.userId) : undefined;
      if (!storedSession || !user || !roleIsAvailable(user, input.activeRole)) {
        return null;
      }
      storedSession.activeRole = input.activeRole;
      storedSession.lastSeenAt = now();
      return resolveSession(storedSession);
    },

    async signOut(sessionId: string): Promise<void> {
      const storedSession = [...sessionsByTokenHash.values()].find((item) => item.id === sessionId);
      if (storedSession) {
        storedSession.revokedAt = now();
      }
    },

    verifyCsrf(session: AuthenticatedRosterSession, csrfToken?: string): boolean {
      return typeof csrfToken === 'string' && safeEqual(hashToken(csrfToken), session.csrfTokenHash);
    },

    requireRole(session: AuthenticatedRosterSession | null, allowedRoles: UserRole[]): AuthenticatedRosterSession {
      if (!session) {
        throw new AuthPermissionError('A valid roster session is required.');
      }
      if (!allowedRoles.includes(session.activeRole)) {
        throw new AuthPermissionError('The active role is not allowed for this roster operation.');
      }
      return session;
    },

    assertSchoolScope(session: AuthenticatedRosterSession, schoolId: string): void {
      if (session.activeSchoolId !== schoolId) {
        throw new AuthPermissionError('Cross-school roster access is not allowed.');
      }
    }
  };
}

export type StandaloneAuthService = ReturnType<typeof createStandaloneAuthService>;

function userFromRows(rows: AuthUserRow[]): UserRecord | null {
  const first = rows[0];
  if (!first) {
    return null;
  }

  return {
    id: first.user_id,
    schoolId: first.school_id,
    email: first.email,
    displayName: first.display_name,
    preferredLocale: first.preferred_locale ?? undefined,
    status: first.user_status,
    passwordHash: first.password_hash,
    roles: rows.map((row) => ({ role: row.role, actorId: row.actor_id }))
  };
}

function schoolFromRows(rows: AuthUserRow[]): SchoolRecord | null {
  const first = rows[0];
  return first ? { id: first.school_id, name: first.school_name } : null;
}

function sessionFromRow(row: AuthSessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.user_id,
    activeSchoolId: row.school_id,
    activeRole: row.active_role,
    csrfTokenHash: row.csrf_token_hash,
    startedAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined
  };
}

export async function seedPostgresStandaloneAuth(input: {
  database: PostgresDatabase;
  schema: string;
  seed: StandaloneAuthSeed;
}): Promise<void> {
  await input.database.query('begin');
  try {
    for (const school of input.seed.schools) {
      await input.database.query(
        `insert into ${tableRef(input.schema, 'schools')} (id, name)
         values ($1, $2)
         on conflict (id) do update set name = excluded.name, updated_at = now()`,
        [school.id, school.name]
      );
    }

    for (const user of input.seed.users) {
      await input.database.query(
        `insert into ${tableRef(input.schema, 'auth_users')} (
          id, email, display_name, preferred_locale, password_hash, status
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          email = excluded.email,
          display_name = excluded.display_name,
          preferred_locale = excluded.preferred_locale,
          password_hash = excluded.password_hash,
          status = excluded.status,
          updated_at = now()`,
        [user.id, normalizeEmail(user.email), user.displayName, user.preferredLocale ?? null, user.passwordHash, user.status]
      );

      const membershipId = `membership-${user.schoolId}-${user.id}`;
      await input.database.query(
        `insert into ${tableRef(input.schema, 'school_memberships')} (id, user_id, school_id, status)
         values ($1, $2, $3, $4)
         on conflict (user_id, school_id) do update set
           id = excluded.id,
           status = excluded.status,
           updated_at = now()`,
        [membershipId, user.id, user.schoolId, user.status === 'active' ? 'active' : 'suspended']
      );

      for (const role of user.roles) {
        if (role.role === 'teacher') {
          await input.database.query(
            `insert into ${tableRef(input.schema, 'teachers')} (id, school_id, display_name)
             values ($1, $2, $3)
             on conflict (id) do update set
               school_id = excluded.school_id,
               display_name = excluded.display_name,
               updated_at = now()`,
            [role.actorId, user.schoolId, user.displayName]
          );
        }

        await input.database.query(
          `insert into ${tableRef(input.schema, 'role_assignments')} (id, membership_id, role, actor_id)
           values ($1, $2, $3, $4)
           on conflict (membership_id, role) do update set actor_id = excluded.actor_id`,
          [`role-${membershipId}-${role.role}`, membershipId, role.role, role.actorId]
        );
      }
    }
    await input.database.query('commit');
  } catch (error) {
    await input.database.query('rollback');
    throw error;
  }
}

export function createPostgresStandaloneAuthService(input: {
  database: PostgresDatabase;
  schema: string;
  now?: () => Date;
}): StandaloneAuthService {
  const now = input.now ?? (() => new Date());

  async function loadUserRowsByEmail(email: string): Promise<AuthUserRow[]> {
    const result = await input.database.query<AuthUserRow>(
      `select
        u.id as user_id,
        u.email,
        u.display_name,
        u.preferred_locale,
        u.status as user_status,
        u.password_hash,
        s.id as school_id,
        s.name as school_name,
        ra.role,
        ra.actor_id
       from ${tableRef(input.schema, 'auth_users')} u
       inner join ${tableRef(input.schema, 'school_memberships')} sm on sm.user_id = u.id
       inner join ${tableRef(input.schema, 'schools')} s on s.id = sm.school_id
       inner join ${tableRef(input.schema, 'role_assignments')} ra on ra.membership_id = sm.id
       where lower(u.email) = $1 and sm.status = 'active'
       order by s.id, ra.role`,
      [normalizeEmail(email)]
    );
    return result.rows;
  }

  async function loadUserRowsById(userId: string, schoolId: string): Promise<AuthUserRow[]> {
    const result = await input.database.query<AuthUserRow>(
      `select
        u.id as user_id,
        u.email,
        u.display_name,
        u.preferred_locale,
        u.status as user_status,
        u.password_hash,
        s.id as school_id,
        s.name as school_name,
        ra.role,
        ra.actor_id
       from ${tableRef(input.schema, 'auth_users')} u
       inner join ${tableRef(input.schema, 'school_memberships')} sm on sm.user_id = u.id
       inner join ${tableRef(input.schema, 'schools')} s on s.id = sm.school_id
       inner join ${tableRef(input.schema, 'role_assignments')} ra on ra.membership_id = sm.id
       where u.id = $1 and s.id = $2 and sm.status = 'active'
       order by ra.role`,
      [userId, schoolId]
    );
    return result.rows;
  }

  async function getStoredSessionById(sessionId: string): Promise<StoredSession | null> {
    const result = await input.database.query<AuthSessionRow>(
      `select id, user_id, school_id, active_role, csrf_token_hash, created_at, last_seen_at, expires_at, revoked_at
       from ${tableRef(input.schema, 'auth_sessions')}
       where id = $1`,
      [sessionId]
    );
    return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
  }

  async function resolveSession(storedSession: StoredSession, csrfToken?: string): Promise<AuthenticatedRosterSession | null> {
    const rows = await loadUserRowsById(storedSession.userId, storedSession.activeSchoolId);
    const user = userFromRows(rows);
    const school = schoolFromRows(rows);
    if (!user || !school || user.status !== 'active') {
      return null;
    }
    return buildSessionSummary({ storedSession, user, school, csrfToken });
  }

  return {
    async signIn(inputData: {
      email: string;
      password: string;
      requestedRole?: UserRole;
      ipAddress?: string;
      userAgent?: string;
    }): Promise<CreatedRosterSession | null> {
      const rows = await loadUserRowsByEmail(inputData.email);
      const user = userFromRows(rows);
      const school = schoolFromRows(rows);
      if (!user || !school || user.status !== 'active') {
        return null;
      }
      if (!(await verifyPassword(inputData.password, user.passwordHash))) {
        return null;
      }

      const activeRole = inputData.requestedRole ?? user.roles[0]?.role;
      if (!activeRole || !roleIsAvailable(user, activeRole)) {
        return null;
      }

      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const current = now();
      const storedSession: StoredSession = {
        id: randomUUID(),
        userId: user.id,
        activeSchoolId: user.schoolId,
        activeRole,
        csrfTokenHash: hashToken(csrfToken),
        startedAt: current,
        lastSeenAt: current,
        expiresAt: new Date(current.getTime() + ROSTER_SESSION_TTL_MS)
      };

      await input.database.query(
        `insert into ${tableRef(input.schema, 'auth_sessions')} (
          id, user_id, school_id, active_role, session_token_hash, csrf_token_hash,
          ip_address, user_agent, created_at, last_seen_at, expires_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)`,
        [
          storedSession.id,
          storedSession.userId,
          storedSession.activeSchoolId,
          storedSession.activeRole,
          hashToken(sessionToken),
          storedSession.csrfTokenHash,
          inputData.ipAddress ?? null,
          inputData.userAgent ?? null,
          current,
          storedSession.expiresAt
        ]
      );

      return { session: buildSessionSummary({ storedSession, user, school, csrfToken }), sessionToken };
    },

    async getSession(inputData: { sessionToken?: string }): Promise<AuthenticatedRosterSession | null> {
      if (!inputData.sessionToken) {
        return null;
      }
      const result = await input.database.query<AuthSessionRow>(
        `select id, user_id, school_id, active_role, csrf_token_hash, created_at, last_seen_at, expires_at, revoked_at
         from ${tableRef(input.schema, 'auth_sessions')}
         where session_token_hash = $1`,
        [hashToken(inputData.sessionToken)]
      );
      const row = result.rows[0];
      const current = now();
      if (!row || row.revoked_at || row.expires_at.getTime() <= current.getTime()) {
        return null;
      }

      await input.database.query(
        `update ${tableRef(input.schema, 'auth_sessions')} set last_seen_at = $1 where id = $2`,
        [current, row.id]
      );
      return resolveSession(sessionFromRow({ ...row, last_seen_at: current }));
    },

    async switchRole(inputData: {
      session: AuthenticatedRosterSession;
      activeRole: UserRole;
    }): Promise<AuthenticatedRosterSession | null> {
      const storedSession = await getStoredSessionById(inputData.session.sessionId);
      if (!storedSession || storedSession.revokedAt || storedSession.expiresAt.getTime() <= now().getTime()) {
        return null;
      }

      const rows = await loadUserRowsById(storedSession.userId, storedSession.activeSchoolId);
      const user = userFromRows(rows);
      if (!user || !roleIsAvailable(user, inputData.activeRole)) {
        return null;
      }

      const current = now();
      await input.database.query(
        `update ${tableRef(input.schema, 'auth_sessions')}
         set active_role = $1, last_seen_at = $2
         where id = $3`,
        [inputData.activeRole, current, storedSession.id]
      );

      return resolveSession({
        ...storedSession,
        activeRole: inputData.activeRole,
        lastSeenAt: current
      });
    },

    async signOut(sessionId: string): Promise<void> {
      await input.database.query(
        `update ${tableRef(input.schema, 'auth_sessions')}
         set revoked_at = $1
         where id = $2 and revoked_at is null`,
        [now(), sessionId]
      );
    },

    verifyCsrf(session: AuthenticatedRosterSession, csrfToken?: string): boolean {
      return typeof csrfToken === 'string' && safeEqual(hashToken(csrfToken), session.csrfTokenHash);
    },

    requireRole(session: AuthenticatedRosterSession | null, allowedRoles: UserRole[]): AuthenticatedRosterSession {
      if (!session) {
        throw new AuthPermissionError('A valid roster session is required.');
      }
      if (!allowedRoles.includes(session.activeRole)) {
        throw new AuthPermissionError('The active role is not allowed for this roster operation.');
      }
      return session;
    },

    assertSchoolScope(session: AuthenticatedRosterSession, schoolId: string): void {
      if (session.activeSchoolId !== schoolId) {
        throw new AuthPermissionError('Cross-school roster access is not allowed.');
      }
    }
  };
}
