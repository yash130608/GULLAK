import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data.json");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function readData() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, "utf8")); }
  catch { return { transactions: [], budget: null }; }
}
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}
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

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Gullak API" }));
app.get("/api/transactions", async (_req, res) => {
  const data = await readData();
  res.json(data.transactions.sort((a, b) => b.date.localeCompare(a.date)));
});
app.post("/api/transactions", async (req, res) => {
  const error = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const data = await readData();
  const transaction = {
    id: crypto.randomUUID(),
    title: String(req.body.title).trim(),
    amount: Number(req.body.amount),
    type: req.body.type,
    category: String(req.body.category || "Other").trim(),
    date: req.body.date,
    note: String(req.body.note || "").trim().slice(0, 240)
  };
  data.transactions.push(transaction);
  await writeData(data);
  res.status(201).json(transaction);
});
app.put("/api/transactions/:id", async (req, res) => {
  const error = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const data = await readData();
  const index = data.transactions.findIndex(t => t.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Transaction not found." });
  data.transactions[index] = {
    ...data.transactions[index],
    title: String(req.body.title).trim(),
    amount: Number(req.body.amount),
    type: req.body.type,
    category: String(req.body.category || "Other").trim(),
    date: req.body.date,
    note: String(req.body.note || "").trim().slice(0, 240)
  };
  await writeData(data);
  res.json(data.transactions[index]);
});
app.delete("/api/transactions/:id", async (req, res) => {
  const data = await readData();
  const before = data.transactions.length;
  data.transactions = data.transactions.filter(t => t.id !== req.params.id);
  if (before === data.transactions.length) return res.status(404).json({ error: "Transaction not found." });
  await writeData(data);
  res.json({ ok: true });
});
app.get("/api/budget", async (_req, res) => {
  const data = await readData();
  res.json({ budget: data.budget ?? null });
});
app.put("/api/budget", async (req, res) => {
  const budget = Number(req.body.budget);
  if (!Number.isFinite(budget) || budget < 1 || budget > 100000000) {
    return res.status(400).json({ error: "Enter a valid monthly budget." });
  }
  const data = await readData();
  data.budget = budget;
  await writeData(data);
  res.json({ budget });
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
  else if (total > budget) insights.push(`You've crossed your monthly budget by ₹${Math.round(total - budget).toLocaleString("en-IN")}. Review non-essential spending before adding more commitments.`);
  else insights.push(`You've used ${Math.round(total / budget * 100)}% of your monthly budget. You have ₹${Math.round(budget - total).toLocaleString("en-IN")} remaining.`);
  if (top) insights.push(`${top[0]} is your biggest expense category this month at ₹${Math.round(top[1]).toLocaleString("en-IN")}.`);
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  if (total > 0) insights.push(`Your average recorded spend is about ₹${Math.round(total / Math.max(1, now.getDate())).toLocaleString("en-IN")} per day. ${daysLeft} days remain in this month.`);
  return { insights, source: "local" };
}
app.get("/api/insights", async (_req, res) => {
  const data = await readData();
  if (!data.transactions.length) return res.json({ insights: ["Welcome to Gullak! Add your first transaction to start understanding your money."], source: "local" });
  const local = buildLocalInsights(data.transactions, data.budget);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.json(local);
  try {
    const prompt = `You are a careful budgeting assistant. Give 3 concise, practical, non-judgmental observations. Do not recommend investments or loans. Treat amounts as INR. Data: ${JSON.stringify({ budget: data.budget, transactions: data.transactions })}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error("AI provider unavailable");
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map(p => p.text).join("\\n") || "";
    res.json({ insights: text.split("\\n").map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 4), source: "gemini" });
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

app.listen(PORT, () => console.log(`Gullak backend running at http://localhost:${PORT}`));
