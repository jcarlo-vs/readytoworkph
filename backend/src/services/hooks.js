// Outside services the app calls through this one object, so tests can swap them for fakes (app.locals is this
// same object): email, Google sign-in, the AI models and file storage. `relaxedLimits: true` turns off rate limits.
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { OAuth2Client } from 'google-auth-library';
import { analyzeApplication } from './ai/analyzer.js';
import { callClaude } from './ai/matchAgent.js';
import { sendBatch, sendEmail } from './mail.js';
import { storage } from './storage.js';

const googleClient = new OAuth2Client();

export const hooks = {
  sendEmail,
  sendBatch,
  // Real Google sign-in tokens are checked against GOOGLE_CLIENT_ID.
  verifyGoogle: async (idToken) => (await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })).getPayload(),
  analyzeApplication, // the Smart Score
  matchModel: callClaude, // Smart Matching's model
  storage, // private files on R2
  // Claude on Vertex AI (Admin › Testing zone). Vertex signs in with Google (locally `gcloud auth application-default
  // login`; on Cloud Run the service account needs roles/aiplatform.user), not the Anthropic key. A new client per
  // call, so a fixed Google sign-in works without restarting the server.
  vertexClient: () => new AnthropicVertex({ projectId: 'remotepinas', region: 'global' }),
  relaxedLimits: false,
};
