import express from "express";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pg from "pg";

dotenv.config();
const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Configure a PostgreSQL database before starting Gullak.");
  process.exit(1);
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET is required and must be at least 32 characters.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "disable" ? false : (isProduction ? { rejectUnauthorized: false } : undefined),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const SESSION_COOKIE = "gullak_session";
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(80) NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      type VARCHAR(10) NOT NULL CHECK (type IN ('income','expense')),
      category VARCHAR(30) NOT NULL,
      date DATE NOT NULL,
      note VARCHAR(240) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions(user_id, date DESC);
    CREATE TABLE IF NOT EXISTS budgets (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
await initializeDatabase();

function safeUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}
function createSession(user, res) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d", issuer: "gullak" });
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: "Please log in to continue." });
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "gullak" });
    const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [payload.sub]);
    if (!result.rowCount) return res.status(401).json({ error: "Your session has expired. Please log in again." });
    req.user = safeUser(result.rows[0]);
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Gullak API" }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Name must be between 2 and 60 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 10 || password.length > 72) return res.status(400).json({ error: "Password must be at least 10 characters." });
    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    const result = await pool.query(
      "INSERT INTO users (id, name, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id,name,email",
      [id, name, email, passwordHash]
    );
    const user = safeUser(result.rows[0]);
    createSession(user, res);
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "An account with this email already exists. Please log in." });
    console.error("Registration failed:", error.message);
    res.status(500).json({ error: "Could not create your account right now." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT id,name,email,password_hash FROM users WHERE email = $1", [email]);
    const row = result.rows[0];
    const valid = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!valid) return res.status(401).json({ error: "Incorrect email or password." });
    const user = safeUser(row);
    createSession(user, res);
    res.json({ user });
  } catch (error) {
    console.error("Login failed:", error.message);
    res.status(500).json({ error: "Could not log in right now." });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
  res.json({ ok: true });
});

function validateTransaction(body) {
  const title = String(body.title || "").trim();
  const amount = Number(body.amount);
  const type = body.type;
  const category = String(body.category || "Other").trim();
  const date = String(body.date || "");
  if (!title || title.length > 80) return "Title is required (max 80 characters).";
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return "Enter a valid amount greater than zero.";
  if (!["income", "expense"].includes(type)) return "Type must be income or expense.";
  if (!category || category.length > 30) return "Enter a valid category.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Enter a valid date.";
  return null;
}

app.get("/api/transactions", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id,title,amount::float AS amount,type,category,TO_CHAR(date,'YYYY-MM-DD') AS date,note FROM transactions WHERE user_id=$1 ORDER BY date DESC,created_at DESC",
    [req.user.id]
  );
  res.json(result.rows);
});
app.post("/api/transactions", requireAuth, async (req, res) => {
  const error = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const result = await pool.query(
    `INSERT INTO transactions (id,user_id,title,amount,type,category,date,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id,title,amount::float AS amount,type,category,TO_CHAR(date,'YYYY-MM-DD') AS date,note`,
    [crypto.randomUUID(), req.user.id, String(req.body.title).trim(), Number(req.body.amount), req.body.type,
      String(req.body.category || "Other").trim(), req.body.date, String(req.body.note || "").trim().slice(0,240)]
  );
  res.status(201).json(result.rows[0]);
});
app.put("/api/transactions/:id", requireAuth, async (req, res) => {
  const error = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const result = await pool.query(
    `UPDATE transactions SET title=$1,amount=$2,type=$3,category=$4,date=$5,note=$6
     WHERE id=$7 AND user_id=$8
     RETURNING id,title,amount::float AS amount,type,category,TO_CHAR(date,'YYYY-MM-DD') AS date,note`,
    [String(req.body.title).trim(), Number(req.body.amount), req.body.type, String(req.body.category || "Other").trim(),
      req.body.date, String(req.body.note || "").trim().slice(0,240), req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Transaction not found." });
  res.json(result.rows[0]);
});
app.delete("/api/transactions/:id", requireAuth, async (req, res) => {
  const result = await pool.query("DELETE FROM transactions WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Transaction not found." });
  res.json({ ok: true });
});
app.get("/api/budget", requireAuth, async (req, res) => {
  const result = await pool.query("SELECT amount::float AS budget FROM budgets WHERE user_id=$1", [req.user.id]);
  res.json({ budget: result.rows[0]?.budget ?? null });
});
app.put("/api/budget", requireAuth, async (req, res) => {
  const budget = Number(req.body.budget);
  if (!Number.isFinite(budget) || budget < 1 || budget > 100000000) {
    return res.status(400).json({ error: "Enter a valid monthly budget." });
  }
  const result = await pool.query(
    `INSERT INTO budgets (user_id,amount) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=NOW()
     RETURNING amount::float AS budget`,
    [req.user.id, budget]
  );
  res.json(result.rows[0]);
});

function buildLocalInsights(transactions, budget) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const current = transactions.filter(t => t.date.startsWith(month));
  const expenses = current.filter(t => t.type === "expense");
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  const byCategory = {};
  expenses.forEach(t => byCategory[t.category] = (byCategory[t.category] || 0) + t.amount);
  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const insights = [];
  if (!expenses.length) insights.push("Add your first expense to unlock a personalized spending summary.");
  else if (budget && total > budget) insights.push(`You've crossed your monthly budget by ₹${Math.round(total - budget).toLocaleString("en-IN")}. Review non-essential spending before adding more commitments.`);
  else if (budget) insights.push(`You've used ${Math.round(total / budget * 100)}% of your monthly budget. You have ₹${Math.round(budget - total).toLocaleString("en-IN")} remaining.`);
  else insights.push(`You've recorded ₹${Math.round(total).toLocaleString("en-IN")} in expenses this month. Set a budget to track your spending.`);
  if (top) insights.push(`${top[0]} is your biggest expense category this month at ₹${Math.round(top[1]).toLocaleString("en-IN")}.`);
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  if (total > 0) insights.push(`Your average recorded spend is about ₹${Math.round(total / Math.max(1, now.getDate())).toLocaleString("en-IN")} per day. ${daysLeft} days remain in this month.`);
  return { insights, source: "local" };
}
app.get("/api/insights", requireAuth, async (req, res) => {
  const txResult = await pool.query(
    "SELECT title,amount::float AS amount,type,category,TO_CHAR(date,'YYYY-MM-DD') AS date,note FROM transactions WHERE user_id=$1 ORDER BY date DESC",
    [req.user.id]
  );
  const budgetResult = await pool.query("SELECT amount::float AS budget FROM budgets WHERE user_id=$1", [req.user.id]);
  const transactions = txResult.rows;
  const budget = budgetResult.rows[0]?.budget ?? null;
  if (!transactions.length) return res.json({ insights: ["Welcome to Gullak! Add your first transaction to start understanding your money."], source: "local" });
  const local = buildLocalInsights(transactions, budget);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.json(local);
  try {
    const prompt = `You are a careful budgeting assistant. Give 3 concise, practical, non-judgmental observations. Do not recommend investments or loans. Treat amounts as INR. Data: ${JSON.stringify({ budget, transactions })}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error("AI provider unavailable");
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
    res.json({ insights: text.split("\n").map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 4), source: "gemini" });
  } catch {
    res.json({ ...local, note: "AI is temporarily unavailable; showing built-in insights." });
  }
});

// Serve the production frontend when client/dist exists.
const dist = path.resolve(__dirname, "../client/dist");
try {
  await fs.access(dist);
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} catch { /* frontend is served by Vite during development */ }

app.listen(PORT, () => console.log(`Gullak backend running on port ${PORT}`));
