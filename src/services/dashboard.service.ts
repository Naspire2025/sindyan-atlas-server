import {
  countOpenIssues,
  countOpenRisks,
  fetchBlockedTasks,
  fetchHighSeverityRisks,
  fetchOverdueIssues,
  fetchOverdueMilestones,
  fetchOverdueTasks,
  fetchOverviewProjects,
  fetchStalledTasks,
} from '../db/repositories/dashboard.repository';
import { env } from '../config/env';
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
  const [overdueMilestones, overdueTasks, stalledTasks, blockedTasks, highSeverityRisks, overdueIssues] = await Promise.all([
    fetchOverdueMilestones(user.id, isAdmin),
    fetchOverdueTasks(user.id, isAdmin),
    fetchStalledTasks(user.id, isAdmin, env.taskStalledDays),
    fetchBlockedTasks(user.id, isAdmin),
    fetchHighSeverityRisks(user.id, isAdmin),
    fetchOverdueIssues(user.id, isAdmin),
  ]);
  return deduplicateAttentionItems([
    ...blockedTasks.map((item) => ({ ...item, item_type: 'task', reason: 'Task is blocked', severity: 'high' })),
    ...overdueTasks.map((item) => ({ ...item, item_type: 'task', reason: `Overdue since ${item.due_date}`, severity: 'high' })),
    ...stalledTasks.map((item) => ({ ...item, item_type: 'task', reason: `No update in ${env.taskStalledDays} days`, severity: 'medium' })),
    ...overdueMilestones.map((item) => ({ ...item, item_type: 'milestone', reason: `Milestone overdue since ${item.target_date}`, severity: 'high' })),
    ...highSeverityRisks.map((item) => ({ ...item, item_type: 'risk', reason: 'High-severity active risk', severity: item.severity || 'high' })),
    ...overdueIssues.map((item) => ({ ...item, item_type: 'issue', reason: `Resolution overdue since ${item.target_resolution_date}`, severity: 'high' })),
  ]);
}

function deduplicateAttentionItems(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.item_type}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
