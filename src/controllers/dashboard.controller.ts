import type { NextFunction, Request, Response } from 'express';
import { getDashboardAttention, getDashboardOverview } from '../services/dashboard.service';
import { requireUser } from '../utils/request.util';

export async function dashboardOverviewController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getDashboardOverview(requireUser(request.user))); } catch (error) { next(error); }
}

export async function dashboardAttentionController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await getDashboardAttention(requireUser(request.user))); } catch (error) { next(error); }
}
