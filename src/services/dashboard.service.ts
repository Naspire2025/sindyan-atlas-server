import {
  countOpenIssues,
  countOpenRisks,
  fetchBlockedTasks,
  fetchHighSeverityRisks,
  fetchOverdueIssues,
  fetchOverdueMilestones,
  fetchOverviewProjects,
} from '../db/repositories/dashboard.repository';
import type { AuthenticatedUser } from '../types/auth';
import { requireAdmin } from './project-access.service';

function deriveHealthScore(projects: Array<Record<string, unknown>>): number {
  if (projects.length === 0) return 0;
  let score = 0;
  for (const project of projects) {
    const total = Number(project.total_tasks) || 0;
    const done = Number(project.done_tasks) || 0;
    const blocked = Number(project.blocked_tasks) || 0;
    const overdue = Number(project.overdue_tasks) || 0;
    if (total === 0) { score += 50; continue; }
    const completionRatio = done / total;
    const penalty = (blocked + overdue) / total;
    score += Math.max(0, Math.min(100, Math.round((completionRatio - penalty) * 100)));
  }
  return Math.round(score / projects.length);
}

export async function getDashboardOverview(user: AuthenticatedUser) {
  requireAdmin(user);
  const isAdmin = user.role === 'admin';
  const projects = await fetchOverviewProjects(user.id, isAdmin);

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const completedProjects = projects.filter((p) => p.status === 'completed').length;
  const blockedProjects = projects.filter((p) => p.status === 'blocked').length;
  const overdueProjects = projects.filter((p) => Number(p.overdue_tasks) > 0).length;

  const totalTasks = projects.reduce((sum, p) => sum + (Number(p.total_tasks) || 0), 0);
  const doneTasks = projects.reduce((sum, p) => sum + (Number(p.done_tasks) || 0), 0);
  const blockedTasks = projects.reduce((sum, p) => sum + (Number(p.blocked_tasks) || 0), 0);
  const overdueTasks = projects.reduce((sum, p) => sum + (Number(p.overdue_tasks) || 0), 0);

  const openRisks = await countOpenRisks(user.id, isAdmin);
  const openIssues = await countOpenIssues(user.id, isAdmin);

  return {
    health_score: deriveHealthScore(projects),
    kpis: {
      total_projects: totalProjects,
      active_projects: activeProjects,
      completed_projects: completedProjects,
      blocked_projects: blockedProjects,
      overdue_projects: overdueProjects,
      total_tasks: totalTasks,
      done_tasks: doneTasks,
      blocked_tasks: blockedTasks,
      overdue_tasks: overdueTasks,
      open_risks: openRisks,
      open_issues: openIssues,
    },
    projects,
  };
}

export async function getDashboardAttention(user: AuthenticatedUser) {
  requireAdmin(user);
  const isAdmin = user.role === 'admin';
  return {
    overdue_milestones: await fetchOverdueMilestones(user.id, isAdmin),
    blocked_tasks: await fetchBlockedTasks(user.id, isAdmin),
    high_severity_risks: await fetchHighSeverityRisks(user.id, isAdmin),
    overdue_issues: await fetchOverdueIssues(user.id, isAdmin),
  };
}
