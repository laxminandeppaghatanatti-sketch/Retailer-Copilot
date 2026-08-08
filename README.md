# Retailer Copilot — full stack (frontend + backend + database)

AI copilot for Indian retailers: dead-stock decision tree, festival intelligence,
peer marketplace with in-platform chat, deals, loans & KYC.

## Run it

```bash
npm install
npm start          # → http://localhost:3000
```

That's it. The database is a JSON file at `data/data.json` — created automatically,
survives restarts. Register a shop, upload inventory, refresh the page: the landing
page shows **"↻ Continue as ..."** and everything is restored from the database.

> The frontend (`public/index.html`) also works standalone (double-click it) —
> it detects the missing backend and falls back to in-browser local mode.
> The sidebar shows which mode you're in: `● Backend connected` vs `○ Local mode`.

## What the backend does

| Feature | Endpoint |
|---|---|
| Health / mode check | `GET /api/health` |
| Send OTP (server-generated, 5 min expiry, 5 tries) | `POST /api/otp/send` `{phone}` |
| Verify OTP (server-side check) | `POST /api/otp/verify` `{phone, code}` |
| Register shop | `POST /api/register` `{owner, shop, ...}` → `{id}` |
| Resume last session | `GET /api/state/last` |
| Load / save full app state | `GET/PUT /api/state/:id` |
| Products REST (demo in Postman) | `GET/POST /api/products/:id`, `DELETE /api/products/:id/:pid` |
| Festival calendar (server-owned) | `GET /api/festivals` |
| Peer retailers | `GET /api/peers` |
| Loan application → reference no. | `POST /api/loan/apply`, `GET /api/loans` |

OTP demo mode: the response includes `demo: "1234"` so the UI can show the code.
In production, delete that field and plug an SMS provider (MSG91 / Twilio /
Firebase Phone Auth) into `/api/otp/send`.

## Adding "Ask Copilot" (free LLM, step by step)

The chat bubble (🤖, bottom-right, once you're logged into the app) already
works without any key — it gives rule-based answers. To upgrade it to real
AI:

1. Go to **https://aistudio.google.com/apikey** and sign in with any Google account.
2. Click **Create API key** → copy it (starts with `AIza...`). It's free, no credit card.
3. In this folder, copy the template: `cp .env.example .env`
4. Open `.env` and paste your key: `GEMINI_API_KEY=AIza...your key...`
5. Restart the server: `npm start`

That's it — the sidebar/chat will now show "✨ Gemini-powered" instead of
"⚙️ rule-based fallback", and answers come from the real model.

**Why this is safe:** the key lives only in `.env` on your machine/server
(git-ignored, never in the frontend). The browser calls **your** `/api/copilot`
route, which calls Gemini using the key — the key itself never reaches the
browser or gets committed to a repo you might push publicly. If Google
renames the model, edit `GEMINI_MODEL` in `.env` (check current names at
ai.google.dev/gemini-api/docs/models).



The DB layer (`db.js`) is shaped like a document store on purpose:

1. `npm i mongoose`
2. Create a free cluster at MongoDB Atlas → get `MONGODB_URI`
3. `mongoose.connect(process.env.MONGODB_URI)`
4. Replace `db.users[id]` reads/writes with a `User` model (schema included as a
   comment in `db.js`). Chats can later move to their own collection + Socket.io
   for real-time two-retailer messaging.

## Keys that belong on THIS server (never in the frontend)

- `RAZORPAY_KEY_SECRET` — order creation + payment signature verification
  (the public `rzp_test_...` Key ID alone is fine in the UI)
- Lending partner credentials (Setu / FinBox / NBFC) for real loan offers
- LLM API key (free tiers: Google Gemini via aistudio.google.com, or Groq) —
  add a `/api/copilot` route that proxies chat requests so the key stays hidden

## Project layout

```
server.js         Express app + REST API
db.js             persistent JSON-file DB (Mongo-swappable)
data/data.json    the database (auto-created)
public/index.html the entire frontend (works standalone too)
```
