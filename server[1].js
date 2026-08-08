/**
 * Retailer Copilot — backend
 * Express + JSON-file database (see db.js for the MongoDB swap notes).
 *
 * Run:   npm install && npm start   →  http://localhost:3000
 * The same index.html also works standalone (it falls back to local mode
 * when /api is unreachable), but with this server running you get:
 *   • server-generated & server-verified OTPs
 *   • user registration and refresh-proof persistence of ALL app state
 *   • "Continue as ..." session resume on the landing page
 *   • loan applications stored with reference numbers
 *   • an "Ask Copilot" LLM route (Gemini) with the key kept server-side
 *   • REST endpoints for products / festivals / peers you can demo in Postman
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const { db, save } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const now = () => new Date().toISOString();

/* ---------- health ---------- */
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, db: 'json-file', users: Object.keys(db.users).length, time: now() }));

/* ---------- OTP (server-side, demo mode returns the code) ---------- */
app.post('/api/otp/send', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: 'invalid phone' });
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  db.otps[phone] = { otp, exp: Date.now() + 5 * 60 * 1000, tries: 0 };
  console.log(`[otp] ${phone} → ${otp}`);
  // DEMO MODE: we return the code so the UI can display it.
  // PRODUCTION: remove `demo` and send via an SMS provider (e.g. MSG91, Twilio, Firebase Phone Auth).
  res.json({ sent: true, demo: otp });
});

app.post('/api/otp/verify', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const rec = db.otps[phone];
  if (!rec || Date.now() > rec.exp) return res.json({ ok: false, reason: 'expired' });
  rec.tries++;
  if (rec.tries > 5) { delete db.otps[phone]; return res.json({ ok: false, reason: 'too many tries' }); }
  const ok = String(req.body.code) === rec.otp;
  if (ok) delete db.otps[phone];
  res.json({ ok });
});

/* ---------- users & full app state ---------- */
app.post('/api/register', (req, res) => {
  const profile = req.body || {};
  if (!profile.owner || !profile.shop) return res.status(400).json({ error: 'owner and shop required' });
  const id = 'u' + Date.now().toString(36);
  db.users[id] = {
    id, user: profile, products: [], chats: {}, unread: {}, deals: [],
    kycDocs: {}, kycVerified: false, createdAt: now(), updatedAt: now(),
  };
  db.lastUser = id;
  save();
  console.log(`[user] registered ${id} — ${profile.shop} (${profile.city || '?'})`);
  res.json({ id });
});

app.get('/api/state/last', (_req, res) => {
  const u = db.lastUser && db.users[db.lastUser];
  res.json(u || {});
});

app.get('/api/state/:id', (req, res) => {
  const u = db.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u);
});

app.put('/api/state/:id', (req, res) => {
  const u = db.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  ['user', 'products', 'chats', 'unread', 'deals', 'kycDocs', 'kycVerified'].forEach(k => {
    if (b[k] !== undefined) u[k] = b[k];
  });
  u.updatedAt = now();
  db.lastUser = req.params.id;
  save();
  res.json({ saved: true, products: (u.products || []).length, updatedAt: u.updatedAt });
});

/* ---------- granular product REST (nice to demo in Postman) ---------- */
app.get('/api/products/:id', (req, res) => {
  const u = db.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u.products || []);
});

app.post('/api/products/:id', (req, res) => {
  const u = db.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'not found' });
  const p = req.body || {};
  if (!p.name) return res.status(400).json({ error: 'name required' });
  p.id = p.id || Date.now() + Math.random();
  u.products.push(p);
  u.updatedAt = now(); save();
  res.status(201).json(p);
});

app.delete('/api/products/:id/:pid', (req, res) => {
  const u = db.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'not found' });
  const before = u.products.length;
  u.products = u.products.filter(p => String(p.id) !== req.params.pid);
  u.updatedAt = now(); save();
  res.json({ deleted: before - u.products.length });
});

/* ---------- festivals & peers (server-owned reference data) ---------- */
const FESTIVALS = [
  { n: 'Makar Sankranti / Pongal', d: '2026-01-14', s: ['All'], c: ['Sweets & Gifting', 'Grocery', 'Puja Items'] },
  { n: 'Holi', d: '2026-03-04', s: ['All'], c: ['Sweets & Gifting', 'Grocery', 'Apparel'] },
  { n: 'Eid ul-Fitr', d: '2026-03-21', s: ['All'], c: ['Apparel', 'Sweets & Gifting', 'Grocery'] },
  { n: 'Onam (Thiruvonam)', d: '2026-08-26', s: ['Kerala'], c: ['Grocery', 'Apparel', 'Puja Items'] },
  { n: 'Raksha Bandhan', d: '2026-08-28', s: ['All'], c: ['Sweets & Gifting', 'Apparel'] },
  { n: 'Ganesh Chaturthi', d: '2026-09-14', s: ['Maharashtra', 'All'], c: ['Puja Items', 'Sweets & Gifting', 'Decor & Lighting'] },
  { n: 'Navratri begins', d: '2026-10-11', s: ['Gujarat', 'All'], c: ['Apparel', 'Puja Items'] },
  { n: 'Durga Puja (Ashtami)', d: '2026-10-18', s: ['West Bengal'], c: ['Apparel', 'Sweets & Gifting', 'Decor & Lighting'] },
  { n: 'Dussehra', d: '2026-10-20', s: ['All'], c: ['Electronics', 'Apparel', 'Sweets & Gifting'] },
  { n: 'Diwali (Lakshmi Puja)', d: '2026-11-08', s: ['All'], c: ['Decor & Lighting', 'Puja Items', 'Sweets & Gifting', 'Electronics'] },
  { n: 'Bhai Dooj', d: '2026-11-10', s: ['All'], c: ['Sweets & Gifting'] },
  { n: 'Guru Nanak Jayanti', d: '2026-11-24', s: ['Punjab', 'All'], c: ['Grocery', 'Sweets & Gifting'] },
  { n: 'Christmas', d: '2026-12-25', s: ['All'], c: ['Decor & Lighting', 'Sweets & Gifting', 'Apparel'] },
];
app.get('/api/festivals', (_req, res) => res.json(FESTIVALS));

const PEERS = [
  { id: 'p1', n: 'Gupta Electronics', cat: 'Electronics', km: 2.4 },
  { id: 'p2', n: 'Mahalaxmi Puja Bhandar', cat: 'Puja Items', km: 1.1 },
  { id: 'p3', n: 'Style Junction', cat: 'Apparel', km: 3.8 },
  { id: 'p4', n: 'Annapurna Super Store', cat: 'Grocery', km: 0.9 },
  { id: 'p5', n: 'Mithai Mandir', cat: 'Sweets & Gifting', km: 2.0 },
  { id: 'p6', n: 'Roshni Lights & Decor', cat: 'Decor & Lighting', km: 4.6 },
  { id: 'p7', n: 'Vidya Book Depot', cat: 'Stationery', km: 1.6 },
];
app.get('/api/peers', (_req, res) => res.json(PEERS));

/* ---------- loans ---------- */
app.post('/api/loan/apply', (req, res) => {
  const ref = 'LN-' + String(1000 + db.loans.length + 1);
  db.loans.push({ ref, ...req.body, at: now() });
  save();
  console.log(`[loan] application ${ref} from user ${req.body.uid || '?'}`);
  // PRODUCTION: forward to a lending partner API (Setu / FinBox / an NBFC).
  res.json({ ref, status: 'received' });
});

app.get('/api/loans', (_req, res) => res.json(db.loans));

/* ---------- Ask Copilot (LLM, key stays server-side) ---------- */
function fallbackAnswer(message, ctx) {
  // No key configured yet — a small rule-based stand-in so the demo never breaks.
  const m = (message || '').toLowerCase();
  const dead = (ctx && ctx.deadCount) || 0;
  const fest = ctx && ctx.nextFestival;
  if (m.includes('dead') || m.includes('discount'))
    return `You currently have ${dead} dead-stock item(s). For items with no upcoming festival demand, a 20–30% clearance discount or a Peer Clearance deal usually recovers cash fastest. (This is a rule-based fallback — add GEMINI_API_KEY on the server for full AI answers.)`;
  if (m.includes('festival'))
    return fest
      ? `Your nearest relevant festival is ${fest.name} in ${fest.days} days — consider holding matching stock rather than discounting it. (Fallback answer — add GEMINI_API_KEY for full AI answers.)`
      : `No festival matches your current stuck stock — Marketplace clearance is likely your fastest option. (Fallback answer — add GEMINI_API_KEY for full AI answers.)`;
  return `I can help with dead stock, festivals, and clearance strategy once a real key is added. Ask me about a specific product or festival! (Fallback answer — add GEMINI_API_KEY on the server for full AI answers.)`;
}

app.post('/api/copilot', async (req, res) => {
  const { message, context } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  if (!GEMINI_KEY) {
    return res.json({ reply: fallbackAnswer(message, context), source: 'fallback' });
  }

  try {
    const prompt = `You are Retailer Copilot, an assistant for small Indian retail shop owners.
Be concise (2-4 sentences), practical, and friendly. Use ₹ for money.
Shop context: ${JSON.stringify(context || {})}
Owner's question: ${message}`;

    // NOTE: Google occasionally renames/deprecates model ids. If this call fails,
    // check the current free-tier model name at https://ai.google.dev/gemini-api/docs/models
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await r.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('[copilot] unexpected Gemini response:', JSON.stringify(data).slice(0, 300));
      return res.json({ reply: fallbackAnswer(message, context), source: 'fallback-error' });
    }
    res.json({ reply: reply.trim(), source: 'gemini' });
  } catch (e) {
    console.error('[copilot] Gemini call failed:', e.message);
    res.json({ reply: fallbackAnswer(message, context), source: 'fallback-error' });
  }
});

/* ---------- fallback to SPA ---------- */
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () =>
  console.log(`\n🛍  Retailer Copilot backend running → http://localhost:${PORT}\n   Database: data/data.json (auto-created)\n`));
