import { findProjectRole } from '../db/repositories/membership.repository';
import type { AuthenticatedUser, ProjectRole } from '../types/auth';
import { AppError } from '../utils/app-error.util';

export async function getProjectRole(user: AuthenticatedUser, projectId: string): Promise<ProjectRole | 'admin' | undefined> {
  if (user.role === 'admin') return 'admin';
  return findProjectRole(user.id, projectId);
}

export async function requireProjectAccess(user: AuthenticatedUser, projectId: string): Promise<ProjectRole | 'admin'> {
  const role = await getProjectRole(user, projectId);
  if (!role) throw new AppError(404, 'Project unavailable.');
  return role;
}

export async function requireProjectLead(user: AuthenticatedUser, projectId: string): Promise<void> {
  const projectRole = await requireProjectAccess(user, projectId);
  if (projectRole !== 'admin' && projectRole !== 'project_lead') {
    throw new AppError(403, 'Project lead access is required.');
  }
}

export function requireAdmin(user: AuthenticatedUser): void {
  if (user.role !== 'admin') throw new AppError(403, 'Administrator access is required.');
}
