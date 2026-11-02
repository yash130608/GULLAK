import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, ArrowLeftRight, Wallet, ChartNoAxesCombined, Settings,
  Plus, Search, Bell, ChevronDown, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  Sparkles, TrendingUp, Coffee, ShoppingBag, Car, House, HeartPulse, GraduationCap,
  Zap, SlidersHorizontal, CalendarDays, X, Trash2, Pencil, Menu, Check, Target,
  CircleHelp, Download, RefreshCw
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");
const money = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const categories = ["Food", "Transport", "Shopping", "Bills", "Health", "Education", "Entertainment", "Home", "Income", "Freelance", "Other"];
const icons = { Food: Coffee, Transport: Car, Shopping: ShoppingBag, Bills: Zap, Health: HeartPulse, Education: GraduationCap, Home: House, Income: Wallet, Freelance: Sparkles, Entertainment: MoreHorizontal, Other: Wallet };
const colors = ["#9b8cff", "#6dd9b0", "#f5b96b", "#71b7ff", "#ff8eaa", "#b5a7ff", "#78c8cf"];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function App() {
  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [period, setPeriod] = useState("This month");
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [budgetEdit, setBudgetEdit] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [form, setForm] = useState({ title: "", amount: "", type: "expense", category: "Food", date: today(), note: "" });
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [tx, b, ai] = await Promise.all([api("/transactions"), api("/budget"), api("/insights")]);
      setTransactions(tx); setBudget(b.budget); setBudgetDraft(b.budget == null ? "" : String(b.budget)); setInsights(ai.insights || []);
      setError("");
    } catch (e) { setError(`${e.message} Make sure the backend is running on port 5000.`); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthTx = transactions.filter(t => t.date.startsWith(monthKey));
  const income = monthTx.filter(t => t.type === "income").reduce((s,t)=>s+t.amount,0);
  const expenses = monthTx.filter(t => t.type === "expense").reduce((s,t)=>s+t.amount,0);
  const balance = income - expenses;
  const savings = income ? Math.max(0, Math.round(balance / income * 100)) : 0;
  const spentPct = budget ? Math.min(100, expenses / budget * 100) : 0;

  const filtered = useMemo(() => transactions.filter(t => {
    const matchesQuery = `${t.title} ${t.category} ${t.note || ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesType = filter === "All" || t.type === filter.toLowerCase();
    const matchesPeriod = period === "All time" || t.date.startsWith(monthKey);
    return matchesQuery && matchesType && matchesPeriod;
  }).sort((a,b)=>b.date.localeCompare(a.date)), [transactions, query, filter, period, monthKey]);

  const categoryData = categories.map((name, i) => ({
    name, amount: monthTx.filter(t=>t.type==="expense" && t.category===name).reduce((s,t)=>s+t.amount,0), color: colors[i % colors.length]
  })).filter(x=>x.amount>0).sort((a,b)=>b.amount-a.amount);
  const maxCat = Math.max(1, ...categoryData.map(x=>x.amount));
  const monthLabels = Array.from({length:6},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    return { key, label: d.toLocaleString("en",{month:"short"}), amount: transactions.filter(t=>t.type==="expense"&&t.date.startsWith(key)).reduce((s,t)=>s+t.amount,0) };
  });
  const maxMonth = Math.max(1, ...monthLabels.map(x=>x.amount));

  const openNew = () => { setEditing(null); setForm({ title:"", amount:"", type:"expense", category:"Food", date:today(), note:"" }); setModal(true); };
  const openEdit = t => { setEditing(t); setForm({ title:t.title, amount:String(t.amount), type:t.type, category:t.category, date:t.date, note:t.note || "" }); setModal(true); };
  const saveTransaction = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      await api(editing ? `/transactions/${editing.id}` : "/transactions", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      setModal(false); await refresh();
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  };
  const deleteTransaction = async id => {
    if (!window.confirm("Delete this transaction?")) return;
    try { await api(`/transactions/${id}`, { method:"DELETE" }); await refresh(); } catch(e) { setError(e.message); }
  };
  const saveBudget = async () => {
    try { const result = await api("/budget", { method:"PUT", body:JSON.stringify({budget:Number(budgetDraft)}) }); setBudget(result.budget); setBudgetEdit(false); await refresh(); }
    catch(e) { setError(e.message); }
  };
  const exportCSV = () => {
    const rows = [["Date","Title","Type","Category","Amount","Note"], ...transactions.map(t=>[t.date,t.title,t.type,t.category,t.amount,t.note||""])];
    const csv = rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    const a = document.createElement("a"); a.href=url; a.download="gullak-transactions.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const navItems = [{name:"Overview",Icon:LayoutDashboard},{name:"Transactions",Icon:ArrowLeftRight},{name:"Budgets",Icon:Target},{name:"Insights",Icon:ChartNoAxesCombined}];
  const navClick = name => { setActiveNav(name); setMobileMenu(false); if(name==="Transactions") document.getElementById("transactions")?.scrollIntoView({behavior:"smooth"}); if(name==="Budgets") document.getElementById("budget-card")?.scrollIntoView({behavior:"smooth"}); if(name==="Insights") document.getElementById("insights-card")?.scrollIntoView({behavior:"smooth"}); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu?"sidebar-open":""}`}>
      <div className="brand"><div className="brand-mark"><Wallet size={20}/></div><span>Gullak</span></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{navItems.map(({name,Icon})=><button key={name} className={`nav-item ${activeNav===name?"active":""}`} onClick={()=>navClick(name)}><Icon size={18}/><span>{name}</span>{name==="Transactions"&&<span className="nav-count">{transactions.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17}/></div><strong>Your money, in focus.</strong><p>Small insights. Smarter habits.</p><span className="upgrade-pill">SMART INSIGHTS</span></div>
        <button className="nav-item muted-nav"><Settings size={18}/><span>Settings</span></button>
        <div className="profile"><div className="avatar">Y</div><div className="profile-copy"><strong>Your account</strong><span>Personal workspace</span></div><MoreHorizontal size={18} className="profile-more"/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={21}/></button>
        <div className="breadcrumb">Workspace <span>/</span> <strong>{activeNav}</strong></div>
        <div className="top-actions"><div className="date-chip"><CalendarDays size={15}/>{now.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</div><button className="icon-button" title="Refresh" onClick={refresh}><RefreshCw size={17}/></button><button className="icon-button notification" title="Notifications"><Bell size={17}/><i/></button><div className="top-avatar">Y</div></div>
      </header>

      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR FINANCIAL OVERVIEW</div><h1>Good to see you<span className="wave">.</span></h1><p className="subtitle">Here's what's happening with your money.</p></div><button className="primary-button" onClick={openNew}><Plus size={18}/> Add transaction</button></section>
        {error&&<div className="error-banner"><CircleHelp size={17}/><span>{error}</span><button onClick={()=>setError("")}><X size={16}/></button></div>}
        {loading&&<div className="loading-line"><span/> Syncing your workspace…</div>}

        <section className="stats-grid">
          <div className="stat-card balance-card"><div className="stat-top"><span>Total cash flow</span><span className="stat-icon purple"><Wallet size={18}/></span></div><div className="stat-value">{money(balance)}</div><div className="stat-foot"><span className={`trend-chip ${balance>=0?"positive":"negative"}`}>{balance>=0?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {savings}%</span><span>net savings rate this month</span></div><div className="card-glow"/></div>
          <div className="stat-card"><div className="stat-top"><span>Total income</span><span className="stat-icon green"><ArrowDownRight size={18}/></span></div><div className="stat-value">{money(income)}</div><div className="stat-foot"><span className="tiny-dot green-dot"/> <span>Money received this month</span></div></div>
          <div className="stat-card"><div className="stat-top"><span>Total expenses</span><span className="stat-icon orange"><ArrowUpRight size={18}/></span></div><div className="stat-value">{money(expenses)}</div><div className="stat-foot"><span className="tiny-dot orange-dot"/> <span>Money spent this month</span></div></div>
          <div className="stat-card"><div className="stat-top"><span>Monthly budget</span><span className="stat-icon blue"><Target size={18}/></span></div><div className="stat-value">{budget ? money(budget) : "Not set"}</div><div className="budget-mini"><span style={{width:`${spentPct}%`}}/></div><div className="stat-foot"><span>{budget ? `${money(Math.max(0,budget-expenses))} left to spend` : "Set a monthly limit"}</span><button className="text-button" onClick={()=>setBudgetEdit(true)}>{budget ? "Edit" : "Set"}</button></div></div>
        </section>

        <section className="dashboard-grid">
          <div className="panel chart-panel"><div className="panel-heading"><div><h2>Spending overview</h2><p>Your expense activity over time</p></div><button className="select-chip" onClick={()=>setPeriod(period==="This month"?"All time":"This month")}>{period}<ChevronDown size={14}/></button></div>
            <div className="chart-summary"><strong>{money(expenses)}</strong><span className="chart-caption">Spent this month</span></div>
            {transactions.some(t=>t.type==="expense") ? <div className="bar-chart">{monthLabels.map((m,i)=><div className="bar-column" key={m.key}><div className="bar-track"><div className={`bar-fill ${i===5?"current":""}`} style={{height:`${m.amount ? Math.max(5,m.amount/maxMonth*100) : 0}%`}} title={money(m.amount)} /></div><span>{m.label}</span></div>)}</div> : <div className="empty-chart"><div className="empty-icon"><ChartNoAxesCombined/></div><strong>No spending history yet</strong><span>Your chart will appear after you add expenses.</span></div>}
            <div className="chart-legend"><span><i className="legend-dot"/> Monthly expenses</span><span className="chart-note">Last 6 months</span></div>
          </div>
          <div className="panel category-panel"><div className="panel-heading"><div><h2>Where it goes</h2><p>Expense breakdown by category</p></div><button className="more-button"><MoreHorizontal size={19}/></button></div>
            {categoryData.length ? <><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(${categoryData.map((c,i)=>{const start=categoryData.slice(0,i).reduce((s,x)=>s+x.amount/Math.max(1,expenses)*100,0);const end=start+c.amount/Math.max(1,expenses)*100;return `${c.color} ${start}% ${end}%`;}).join(",")})`}}>
              <div className="donut-hole"><strong>{money(expenses)}</strong><span>Total spent</span></div></div></div><div className="category-list">{categoryData.slice(0,4).map(c=><div className="category-row" key={c.name}><span className="category-name"><i style={{background:c.color}}/>{c.name}</span><strong>{money(c.amount)}</strong><span className="category-percent">{Math.round(c.amount/expenses*100)}%</span></div>)}</div></> : <div className="empty-chart"><div className="empty-icon"><ChartNoAxesCombined/></div><strong>No spending data yet</strong><span>Add an expense to see your breakdown.</span></div>}
          </div>
        </section>

        <section className="lower-grid">
          <div className="panel transactions-panel" id="transactions"><div className="panel-heading"><div><h2>Recent transactions</h2><p>A clear view of your latest activity</p></div><button className="subtle-button" onClick={exportCSV}><Download size={15}/> Export</button></div>
            <div className="table-tools"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search transactions…"/></div><button className="filter-chip" onClick={()=>setFilter(filter==="All"?"Expense":filter==="Expense"?"Income":"All")}><SlidersHorizontal size={15}/>{filter}</button></div>
            <div className="transaction-table"><div className="table-head"><span>TRANSACTION</span><span>CATEGORY</span><span>DATE</span><span>AMOUNT</span><span/></div>
              {filtered.slice(0,8).map(t=>{const Icon=icons[t.category]||Wallet;return <div className="transaction-row" key={t.id}><div className="transaction-title"><div className={`transaction-icon ${t.type}`}><Icon size={17}/></div><div><strong>{t.title}</strong><span>{t.note || (t.type==="income" ? "Income received" : "Personal transaction")}</span></div></div><span className="category-tag">{t.category}</span><span className="date-text">{new Date(t.date+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</span><strong className={`amount ${t.type}`}>{t.type==="income"?"+":"−"}{money(t.amount)}</strong><div className="row-actions"><button title="Edit" onClick={()=>openEdit(t)}><Pencil size={14}/></button><button title="Delete" onClick={()=>deleteTransaction(t.id)}><Trash2 size={14}/></button></div></div>})}
              {!filtered.length&&<div className="empty-table">{transactions.length ? "No transactions match your search. Try another filter." : "Your Gullak is empty for now. Add your first transaction to get started."}</div>}
            </div><button className="view-all" onClick={()=>{setPeriod("All time");setFilter("All");setQuery("");}}>View all transactions <ArrowUpRight size={15}/></button>
          </div>
          <div className="right-stack">
            <div className="panel budget-panel" id="budget-card"><div className="panel-heading"><div><h2>Monthly budget</h2><p>Keep your spending on track</p></div><span className="budget-status">THIS MONTH</span></div><div className="budget-numbers"><strong>{money(expenses)}</strong><span>{budget ? `of ${money(budget)}` : "spent this month"}</span></div><div className="budget-progress"><span style={{width:`${spentPct}%`}}/></div><div className="budget-foot"><span>{budget ? `${Math.round(spentPct)}% used` : "No budget set"}</span><strong>{budget ? `${money(Math.max(0,budget-expenses))} remaining` : "Set a limit to track progress"}</strong></div><button className="manage-budget" onClick={()=>setBudgetEdit(true)}>{budget ? "Manage budget" : "Set monthly budget"} <ArrowUpRight size={15}/></button></div>
            <div className="panel insights-panel" id="insights-card"><div className="insight-heading"><div className="ai-spark"><Sparkles size={17}/></div><div><h2>Smart insights</h2><p>Your personal money assistant</p></div><span className="live-pill"><i/> LIVE</span></div><div className="insight-content">{insights.length?insights.slice(0,3).map((s,i)=><div className="insight-item" key={i}><span className="insight-bullet">{i+1}</span><p>{s}</p></div>):<p className="muted-copy">Your insights will appear here as you add transactions.</p>}</div><div className="insight-footer"><Sparkles size={13}/> Powered by Gullak intelligence</div></div>
          </div>
        </section>
        <footer className="footer"><span>© 2026 Gullak</span><span>Built for better money habits <span className="footer-heart">✦</span></span></footer>
      </div>
    </main>

    {modal&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal(false)}><form className="modal" onSubmit={saveTransaction}><div className="modal-head"><div><span className="eyebrow">YOUR MONEY, YOUR RULES</span><h2>{editing?"Edit transaction":"Add transaction"}</h2></div><button type="button" className="icon-button" onClick={()=>setModal(false)}><X size={19}/></button></div><div className="type-switch"><button type="button" className={form.type==="expense"?"selected expense-select":""} onClick={()=>setForm({...form,type:"expense",category:"Food"})}>Expense</button><button type="button" className={form.type==="income"?"selected income-select":""} onClick={()=>setForm({...form,type:"income",category:"Income"})}>Income</button></div><label className="field-label">Title<input required maxLength="80" placeholder="e.g. Lunch, monthly stipend" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label className="field-label">Amount (₹)<input required type="number" min="1" step="1" placeholder="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><div className="form-two"><label className="field-label">Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.filter(c=>form.type==="income"?["Income","Freelance","Other"].includes(c):c!=="Income"&&c!=="Freelance").map(c=><option key={c}>{c}</option>)}</select></label><label className="field-label">Date<input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div><label className="field-label">Note <span className="optional">(optional)</span><input maxLength="240" placeholder="Add a little context…" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={()=>setModal(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?"Saving…":editing?"Save changes":"Add transaction"} <Check size={16}/></button></div></form></div>}

    {budgetEdit&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setBudgetEdit(false)}><form className="modal budget-modal" onSubmit={e=>{e.preventDefault();saveBudget();}}><div className="modal-head"><div><span className="eyebrow">PLAN WITH PURPOSE</span><h2>Set monthly budget</h2></div><button type="button" className="icon-button" onClick={()=>setBudgetEdit(false)}><X size={19}/></button></div><p className="modal-description">Choose a monthly spending limit that feels realistic for you.</p><label className="field-label">Monthly budget (₹)<input type="number" min="1" required value={budgetDraft} onChange={e=>setBudgetDraft(e.target.value)}/></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={()=>setBudgetEdit(false)}>Cancel</button><button className="primary-button">Save budget <Check size={16}/></button></div></form></div>}
  </div>;
}
export default App;
