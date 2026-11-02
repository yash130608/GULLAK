# Gullak

A premium, responsive personal money tracker built with React + Vite and Node.js + Express. The interface is designed for a clean, modern finance-app experience, with Indian Rupee formatting.

## What works
- Overview dashboard with monthly income, expenses, cash flow and savings rate
- Add, edit and delete income/expense transactions
- Search and filter transactions
- Monthly budget setting and progress tracking
- Spending category breakdown and six-month spending trend
- Smart spending insights (built-in analysis works without an API key)
- Optional Gemini-powered insights through the backend
- CSV export
- JSON-file persistence — no database setup required; fresh installs start with no transactions and no budget
- Responsive desktop and mobile layout

## Requirements
Install Node.js 18 or newer, then open this `Gullak` folder in VS Code.

## Start Gullak on your computer

Run these commands in the VS Code terminal, one at a time:

```bash
npm install
npm run install:all
npm run dev
```

Then open **http://localhost:5173** in your browser.

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000/api
- Health check: http://localhost:5000/api/health

Keep the terminal running while using the app. Press `Ctrl + C` to stop it.

## Optional AI insights
Gullak works without an AI key. To enable Gemini-generated spending insights:

1. Copy `server/.env.example` to `server/.env`.
2. Add your Gemini API key to `GEMINI_API_KEY`.
3. Restart the backend.

Example:

```env
PORT=5000
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```

Keep the API key in the backend `.env` file only. Never add it to frontend code or upload it to GitHub.

## Production build

```bash
npm run build
npm start
```

The Express server serves the built frontend from `client/dist`.

## Android app
This version is a responsive web app. It works in a mobile browser. Android packaging with Capacitor can be added as a separate next step after confirming the web version works.

## Important
This is a learning/demo project, not a bank-connected service or financial adviser. The starter stores data in `server/data.json` and has no user login or multi-user isolation. Do not deploy it publicly with real financial data until authentication, per-user authorization, HTTPS, backups and production database storage are implemented.
