# Gullak

A responsive personal money tracker built with React, Vite, Node.js, Express and PostgreSQL.

## Features
- Account registration, login and logout
- Passwords hashed with bcrypt
- HTTP-only, signed session cookie (7-day expiry)
- Per-user transaction and budget isolation
- Add, edit, delete, search and filter transactions
- Monthly budget, category breakdown and spending trend
- Built-in spending insights; optional Gemini insights
- CSV export
- Responsive desktop and mobile interface

## Requirements
- Node.js 18+
- PostgreSQL 14+ (local development) or a hosted PostgreSQL database (deployment)

## Local setup

1. Open this `Gullak` folder in VS Code.
2. Create a PostgreSQL database named `gullak`.
3. Copy `server/.env.example` to `server/.env`.
4. Set `DATABASE_URL` to your PostgreSQL connection string.
5. Set `JWT_SECRET` to a private random value of at least 32 characters. Do not commit `.env`.
6. In the project terminal, run:

```bash
npm install
npm run install:all
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:5000. The database tables are created automatically on first server start.

## Render deployment

Keep the existing Render Web Service and GitHub repository.

- Root Directory: `Gullak` (or the directory containing this package.json in your repository)
- Build Command: `npm install && npm run install:all && npm run build`
- Start Command: `npm start`

Create a PostgreSQL database in Render, then open the web service's **Environment** settings and add:

- `DATABASE_URL` = the PostgreSQL Internal Database URL from your Render database (use the External URL only if connecting from outside Render)
- `JWT_SECRET` = a long, random secret of at least 32 characters
- `NODE_ENV` = `production`

Save changes and redeploy. The app creates its tables automatically. Do not set `PGSSL=disable` on Render.

## Important data note

This version uses PostgreSQL, not the old shared `server/data.json` file. Existing JSON-file records are intentionally not imported because the old file did not identify which account owned each record. Each new account starts with its own empty dashboard. Keep a private backup of any old data you need before replacing the deployed version.

## Security and scope

This is a learning project, not a bank-connected service or a financial adviser. It uses password hashing, HTTP-only session cookies, rate-limited login/register routes, and user-scoped database queries. Before handling sensitive or real financial records at scale, arrange an independent security review, configure database backups, and add account recovery and email verification. Never commit credentials or API keys.
