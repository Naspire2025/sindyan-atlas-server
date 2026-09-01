import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler.middleware';
import { authRouter } from './routes/auth.routes';
import { projectRouter } from './routes/project.routes';
import { taskRouter } from './routes/task.routes';
import { membershipRouter } from './routes/membership.routes';
import { userRouter } from './routes/user.routes';
import { milestoneRouter, projectPlanningRouter } from './routes/project-planning.routes';
import { projectFinanceRouter, standaloneFinanceRouter } from './routes/finance.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { assetAllocationRouter, assetRouter, memberAllocationRouter, resourceRouter } from './routes/resource.routes';
import { standaloneIssueRouter, standaloneRiskRouter } from './routes/risk-issue.routes';
import { vaultRouter, vaultFileRouter } from './routes/vault.routes';
import { listInvitationsController } from './controllers/user.controller';
import { requireAuth } from './middleware/require-auth.middleware';
import { applySecurityHeaders } from './middleware/security-headers.middleware';

function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === undefined || env.frontendOrigins.includes(origin);
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(applySecurityHeaders);
  app.use(cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin) ? origin : false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.get('/api/invitations', requireAuth, listInvitationsController);
  app.use('/api/projects', projectRouter);
  app.use('/api/projects/:projectId', projectPlanningRouter);
  app.use('/api/projects/:projectId/members', membershipRouter);
  app.use('/api/projects/:projectId/finance', projectFinanceRouter);
  app.use('/api/milestones', milestoneRouter);
  app.use('/api', standaloneFinanceRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/project-member-allocations', memberAllocationRouter);
  app.use('/api/assets', assetRouter);
  app.use('/api/asset-allocations', assetAllocationRouter);
  app.use('/api/resources', resourceRouter);
  app.use('/api/risks', standaloneRiskRouter);
  app.use('/api/issues', standaloneIssueRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/vault/files', vaultFileRouter);
  app.use('/api/tasks', taskRouter);
  app.use(errorHandler);

  return app;
}
