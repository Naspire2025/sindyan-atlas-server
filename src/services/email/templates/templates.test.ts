import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInvitationEmail } from './invitation.template';
import { renderTaskAssignmentEmail } from './task-assignment.template';
import { renderTaskCommentEmail } from './task-comment.template';
import { renderTaskDeadlineReminderEmail } from './task-deadline-reminder.template';
import { renderTaskStatusChangeEmail } from './task-status-change.template';
import { renderTaskBlockerEmail } from './task-blocker.template';

test('invitation email renders subject, plain text, and an accept link', () => {
  const email = renderInvitationEmail({
    recipientName: 'Ada',
    invitationUrl: 'https://atlas.app/accept-invitation?token=abc',
  });
  assert.equal(email.subject, 'You have been invited to Atlas');
  assert.match(email.text, /Hello Ada/);
  assert.match(email.html, /https:\/\/atlas.app\/accept-invitation\?token=abc/);
});

test('task assignment email names the assignee and the task', () => {
  const email = renderTaskAssignmentEmail({
    recipientName: 'Bo',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    taskUrl: 'https://atlas.app/tasks/t1',
  });
  assert.equal(email.subject, 'You have been assigned a task in Atlas Launch');
  assert.match(email.text, /You have been assigned a task in Atlas Launch: "Write migration"/);
  assert.match(email.html, /Atlas Launch/);
  assert.match(email.html, />Write migration</);
});

test('status change email formats internal status values into labels', () => {
  const email = renderTaskStatusChangeEmail({
    recipientName: 'Bo',
    actorName: 'Cara',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    status: 'in_progress',
    taskUrl: 'https://atlas.app/tasks/t1',
  });
  assert.equal(email.subject, 'Task is now in progress: Write migration');
  assert.match(email.text, /moved the task "Write migration".*to In progress/s);
  assert.match(email.html, /In progress/);
});

test('deadline reminder email distinguishes overdue from due soon', () => {
  const overdue = renderTaskDeadlineReminderEmail({
    recipientName: 'Bo',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    taskUrl: 'https://atlas.app/tasks/t1',
    dueDate: '1999-01-01',
    isOverdue: true,
  });
  assert.equal(overdue.subject, 'Task overdue: Write migration');
  assert.match(overdue.text, /is overdue/);

  const dueSoon = renderTaskDeadlineReminderEmail({
    recipientName: 'Bo',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    taskUrl: 'https://atlas.app/tasks/t1',
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    isOverdue: false,
  });
  assert.equal(dueSoon.subject, 'Task due soon: Write migration');
});

test('blocker email includes the blocker note when present and escapes HTML', () => {
  const email = renderTaskBlockerEmail({
    recipientName: 'Bo',
    actorName: 'Cara',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    taskUrl: 'https://atlas.app/tasks/t1',
    blockerNote: 'Waiting on <vendor> & specs',
  });
  assert.equal(email.subject, 'Task blocked: Write migration');
  assert.match(email.text, /blocked the task/);
  assert.match(email.text, /Waiting on <vendor> & specs/);
  assert.match(email.html, /Waiting on &lt;vendor&gt; &amp; specs/);
});

test('blocker email omits the note block without misleading content', () => {
  const email = renderTaskBlockerEmail({
    recipientName: 'Bo',
    actorName: 'Cara',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    taskUrl: 'https://atlas.app/tasks/t1',
    blockerNote: null,
  });
  assert.match(email.text, /blocked the task/);
  assert.doesNotMatch(email.text, /Blocker note:/);
});

test('comment email escapes the comment body in HTML', () => {
  const email = renderTaskCommentEmail({
    recipientName: 'Bo',
    commenterName: 'Cara',
    projectName: 'Atlas Launch',
    taskTitle: 'Write migration',
    taskUrl: 'https://atlas.app/tasks/t1',
    commentBody: 'Ship <script>alert(1)</script> please',
  });
  assert.equal(email.subject, 'New comment on task: Write migration');
  assert.match(email.text, /Ship <script>alert\(1\)<\/script> please/);
  assert.match(email.html, /Ship &lt;script&gt;alert\(1\)&lt;\/script&gt; please/);
});