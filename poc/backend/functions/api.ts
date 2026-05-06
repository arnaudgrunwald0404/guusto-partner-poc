/**
 * functions/api.ts — Netlify Function serverless entry point.
 *
 * Lives inside poc/backend/ so esbuild resolves node_modules from here.
 * Wraps the Express app with serverless-http; Netlify routes all /api/*
 * requests here via the redirect rule in netlify.toml.
 */

import 'dotenv/config';
import serverless from 'serverless-http';
import { app } from '../src/app.js';

export const handler = serverless(app);
