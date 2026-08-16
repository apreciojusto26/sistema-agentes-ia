// Loads admin/.env into process.env, if present, before anything else in
// this process reads it. MUST stay the very first import in main.ts —
// config.ts reads process.env.PORT at module-load time (top-level `export
// const`), so any later import order would read an unset variable and never
// see it, even though process.env itself gets populated moments later.
//
// No dotenv dependency: process.loadEnvFile (Node >=20.6, stable on this
// project's required >=22.12) does the same job with zero new dependencies.
// Silent no-op when the file is absent — production environments inject
// GEMINI_API_KEY etc. directly and have no .env file at all.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
