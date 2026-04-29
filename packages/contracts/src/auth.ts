import type { UserRole } from './common.js';

export type AuthSessionUser = {
  userId: string;
  email: string;
  displayName: string;
  preferredLocale?: string;
};

export type SessionSummary = {
  sessionId: string;
  user: AuthSessionUser;
  activeSchoolId: string;
  activeSchoolName: string;
  activeRole: UserRole;
  availableRoles: UserRole[];
  actorByRole: Partial<Record<UserRole, string>>;
  startedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  csrfToken?: string;
};

export type CurrentSessionResponse = {
  session: SessionSummary | null;
};

export type SignInRequest = {
  email: string;
  password: string;
  requestedRole?: UserRole;
};

export type SignInResponse = {
  session: SessionSummary;
};

export type SwitchRoleRequest = {
  activeRole: UserRole;
};

export type SwitchRoleResponse = {
  session: SessionSummary;
};
