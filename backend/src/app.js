// The API: shared middleware first, then each feature's routes (src/modules/<feature>/<feature>.routes.js).
import cors from 'cors';
import express from 'express';
import { SITES } from './config.js';
import { postSampleJobs, trackActivity } from './middleware/activity.js';
import { errorHandler } from './middleware/errors.js';
import { originCheck } from './middleware/origin.js';
import { throttle } from './middleware/rateLimit.js';
import account from './modules/account/account.routes.js';
import admin from './modules/admin/admin.routes.js';
import analytics from './modules/analytics/analytics.routes.js';
import analyzer from './modules/analyzer/analyzer.routes.js';
import applications from './modules/applications/applications.routes.js';
import auth from './modules/auth/auth.routes.js';
import billing from './modules/billing/billing.routes.js';
import files from './modules/files/files.routes.js';
import jobs from './modules/jobs/jobs.routes.js';
import matches from './modules/matches/matches.routes.js';
import messages from './modules/messages/messages.routes.js';
import site from './modules/site/site.routes.js';
import support from './modules/support/support.routes.js';
import visits from './modules/visits/visits.routes.js';
import workers from './modules/workers/workers.routes.js';
import { hooks } from './services/hooks.js';

export const app = express();
app.set('trust proxy', 1); // behind Cloud Run's load balancer: req.ip is the real visitor
app.disable('x-powered-by');
app.locals = Object.assign(hooks, app.locals); // tests swap email, AI and storage through app.locals

app.use(originCheck);
app.use(cors({ origin: SITES }));
// Paddle signs the exact bytes it sends, so the webhook keeps the raw body for checking.
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { if (req.url === '/api/billing/webhook') req.rawBody = buf; } }));
app.use('/api', throttle(300, 60_000, 'a minute')); // any request, per visitor
app.use('/api', trackActivity);
app.use('/api', postSampleJobs);

for (const routes of [auth, account, site, jobs, admin, applications, visits, workers, analyzer, support, matches, analytics, messages, files, billing])
  app.use('/api', routes);

app.use(errorHandler);
