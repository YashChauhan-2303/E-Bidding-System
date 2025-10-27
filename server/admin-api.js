/*
 * Simple admin API server to perform privileged actions using the
 * Supabase service_role key. This avoids client-side RLS issues.
 *
 * Usage:
 * 1. Create a .env file in the project root with:
 *    SUPABASE_URL=https://...supabase.co
 *    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
 * 2. Run: node server/admin-api.js
 * 3. The server will listen on PORT (default 9999) and accept requests
 *    from http://localhost:8080 (the dev client).
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const app = express();
const PORT = process.env.PORT || 9999;

app.use(cors({ origin: 'http://localhost:8080' }));
app.use(bodyParser.json());

app.post('/api/admin/approve', async (req, res) => {
  const { auctionId } = req.body || {};
  if (!auctionId) return res.status(400).json({ error: 'auctionId required' });

  try {
    const { data, error } = await admin
      .from('auctions')
      .update({ status: 'live', start_time: new Date().toISOString() })
      .eq('id', auctionId)
      .select();

    if (error) return res.status(500).json({ error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

app.post('/api/admin/reject', async (req, res) => {
  const { auctionId } = req.body || {};
  if (!auctionId) return res.status(400).json({ error: 'auctionId required' });

  try {
    const { data, error } = await admin
      .from('auctions')
      .update({ status: 'cancelled' })
      .eq('id', auctionId)
      .select();

    if (error) return res.status(500).json({ error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Admin API listening on http://localhost:${PORT}`);
});
