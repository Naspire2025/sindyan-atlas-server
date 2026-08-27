export type OrganizationRole = 'admin' | 'team_member';
export type UserStatus = 'pending' | 'active' | 'suspended';
export type ProjectRole = 'member' | 'project_lead';

export type AuthenticatedUser = {
  id: number;
  name: string;
  email: string;
  role: OrganizationRole;
  status: UserStatus;
};

export type SessionIdentity = AuthenticatedUser & {
  sessionId: number;
  csrfTokenHash: string;
  expiresAt: string;
  absoluteExpiresAt: string;
};
