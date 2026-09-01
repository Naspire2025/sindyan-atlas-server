import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  acceptInvitationController,
  changePasswordController,
  currentUserController,
  inviteUserController,
  loginController,
  logoutController,
  resendInvitationController,
  revokeInvitationController,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/require-auth.middleware';
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
authRouter.post('/logout', requireAuth, logoutController);
authRouter.post('/change-password', requireAuth, changePasswordController);
authRouter.post('/invitations', requireAuth, inviteUserController);
authRouter.post('/invitations/:id/resend', requireAuth, resendInvitationController);
authRouter.delete('/invitations/:id', requireAuth, revokeInvitationController);
