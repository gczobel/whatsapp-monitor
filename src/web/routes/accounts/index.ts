import { Router } from 'express';
import type { AccountRoutesOptions } from './shared.js';
export type { AccountRoutesOptions } from './shared.js';
import { createDashboardRouter } from './dashboard.js';
import { createSetupRouter } from './setup.js';
import { createGroupsRouter } from './groups.js';
import { createProfilesRouter } from './profiles.js';
import { createHistoryRouter } from './history.js';

export function createAccountRouter(options: AccountRoutesOptions): Router {
  const router = Router({ mergeParams: true });
  router.use('/', createDashboardRouter(options));
  router.use('/', createSetupRouter(options));
  router.use('/', createGroupsRouter(options));
  router.use('/', createProfilesRouter(options));
  router.use('/', createHistoryRouter(options));
  return router;
}
