import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  acceptInvitationController,
  changePasswordController,
  csrfTokenController,
  currentUserController,
  inviteUserController,
  loginController,
  logoutController,
  resendInvitationController,
  revokeInvitationController,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
import { requireCsrf } from '../middleware/require-csrf.middleware';
import { requireTrustedOrigin } from '../middleware/require-trusted-origin.middleware';

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, requireTrustedOrigin, loginController);
authRouter.post('/invitations/:token/accept', loginRateLimit, requireTrustedOrigin, acceptInvitationController);
authRouter.get('/me', requireAuth, currentUserController);
authRouter.get('/csrf', requireAuth, csrfTokenController);
authRouter.post('/logout', requireAuth, requireCsrf, logoutController);
authRouter.post('/change-password', requireAuth, requireCsrf, changePasswordController);
authRouter.post('/invitations', requireAuth, requireCsrf, inviteUserController);
authRouter.post('/invitations/:id/resend', requireAuth, requireCsrf, resendInvitationController);
authRouter.delete('/invitations/:id', requireAuth, requireCsrf, revokeInvitationController);
