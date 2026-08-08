/**
 * db.js — tiny persistent database (JSON file on disk).
 *
 * Why a JSON file? Zero setup: `npm install && npm start` and you have real
 * persistence — perfect for a hackathon demo. The interface below is
 * deliberately shaped like a document store, so swapping to MongoDB later
 * is mechanical:
 *
 *   // MongoDB swap (production):
 *   //   npm i mongoose
 *   //   const mongoose = require('mongoose');
 *   //   await mongoose.connect(process.env.MONGODB_URI);   // free tier: MongoDB Atlas
 *   //   Then replace db.users[id] reads/writes with a User model:
 *   //   const User = mongoose.model('User', new mongoose.Schema({
 *   //     profile: Object, products: Array, chats: Object, unread: Object,
 *   //     deals: Array, kycDocs: Object, kycVerified: Boolean,
 *   //   }, { timestamps: true }));
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'data.json');

let db = { users: {}, lastUser: null, loans: [], otps: {} };

// load existing data on boot
try {
  if (fs.existsSync(FILE)) {
    db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8')));
    console.log(`[db] loaded ${Object.keys(db.users).length} user(s) from data/data.json`);
  }
} catch (e) {
  console.error('[db] could not read data.json, starting fresh:', e.message);
}

// debounced atomic-ish save
let t = null;
function save() {
  clearTimeout(t);
  t = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      // OTPs are ephemeral — don't persist them
      const { otps, ...persist } = db;
      fs.writeFileSync(tmp, JSON.stringify(persist, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('[db] save failed:', e.message);
    }
  }, 250);
}

module.exports = { db, save };
