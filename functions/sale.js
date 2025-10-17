// netlify/functions/sale.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !WEBHOOK_SECRET) {
  console.error('Missing required env vars');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  global: { headers: { 'x-netlify-function': 'sale' } }
});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const incomingSecret = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret'];
  if (!incomingSecret || incomingSecret !== WEBHOOK_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { device = null, vendo, amount, txn, ts = new Date().toISOString() } = payload;

  if (!vendo || amount == null || !txn) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: vendo, amount, txn' }) };
  }

  try {
    // Optional dedupe: check existing txn for same tenant-less setup; adapt to tenant_id if present
    const { data: existing, error: checkErr } = await supabase
      .from('sales')
      .select('id')
      .eq('txn', txn)
      .limit(1);

    if (checkErr) {
      console.error('Error checking duplicate txn', checkErr);
    } else if (existing && existing.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, message: 'Duplicate txn ignored', txn }) };
    }

    const row = {
      device,
      vendo,
      amount,
      txn,
      ts
    };

    const { data, error } = await supabase.from('sales').insert([row]).select();

    if (error) {
      console.error('Supabase insert error', error);
      return { statusCode: 502, body: JSON.stringify({ error: 'DB insert failed', detail: error.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, inserted: data }) };
  } catch (err) {
    console.error('Unhandled error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
