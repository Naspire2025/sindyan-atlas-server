const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  reviewing: 'In review',
  reviewed: 'Reviewed',
  done: 'Done',
};

export function formatTaskStatus(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}