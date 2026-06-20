'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const config = require('./config');
const { renderPage } = require('./src/page');

const app = express();
app.disable('x-powered-by');

const stripe = config.stripeEnabled ? require('stripe')(config.stripeSecretKey) : null;

const COOKIE_NAME = 'ejresume';
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 1 year

// ---------- tiny signed-cookie helpers (HMAC, tamper-proof) ----------
function sign(payloadObj) {
  const body = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const mac = crypto.createHmac('sha256', config.cookieSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', config.cookieSecret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setUnlockCookie(res, data) {
  const token = sign({ email: data.email || '', sid: data.sid || '', iat: Date.now() });
  const secure = config.baseUrl.startsWith('https://');
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${Math.floor(
      COOKIE_MAX_AGE_MS / 1000
    )}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  );
}

// ---------- Stripe session verification (server-side source of truth) ----------
async function verifyStripeSession(sessionId) {
  if (!stripe || !sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session && session.payment_status === 'paid';
    if (!paid) return null;
    return { sid: session.id, email: (session.customer_details && session.customer_details.email) || '' };
  } catch (err) {
    console.error('Stripe verify error:', err.message);
    return null;
  }
}

// Resolve unlock state from (a) a valid Stripe session_id in the URL, or
// (b) a previously issued signed cookie. Returns { unlocked, email } and may
// set the cookie when a fresh session_id is confirmed.
async function resolveUnlock(req, res) {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (sessionId) {
    const ok = await verifyStripeSession(sessionId);
    if (ok) {
      setUnlockCookie(res, ok);
      return { unlocked: true, email: ok.email };
    }
  }
  const cookies = parseCookies(req);
  const claim = verify(cookies[COOKIE_NAME]);
  if (claim) return { unlocked: true, email: claim.email || '' };
  return { unlocked: false, email: '' };
}

// ---------- middleware ----------
app.use(express.json({ limit: '32kb' }));
app.use('/app.js', express.static(path.join(__dirname, 'public', 'app.js')));

// ---------- routes ----------
app.get('/', async (req, res) => {
  const state = await resolveUnlock(req, res);
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderPage(state, config));
});

// Create a Stripe Checkout Session and hand back the hosted URL.
app.post('/api/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payments are not configured yet (missing STRIPE_SECRET_KEY).' });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: config.currency,
            unit_amount: Math.round(config.priceUsd * 100),
            product_data: {
              name: config.productName,
              description: 'Editable Google Doc + ready-to-send PDF · lifetime access',
            },
          },
        },
      ],
      // Guest checkout; Stripe collects the email for the receipt + delivery.
      success_url: `${config.baseUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.baseUrl}/?canceled=1`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

// Gated download. Re-checks entitlement server-side every time.
app.get('/api/download', async (req, res) => {
  const state = await resolveUnlock(req, res);
  if (!state.unlocked) {
    return res.status(402).type('text/plain').send('Payment required. Purchase the template to download it.');
  }
  if (!fs.existsSync(config.templatePath)) {
    console.error('Template file missing at', config.templatePath);
    return res.status(500).type('text/plain').send('Template file is not available. Please contact support.');
  }
  res.download(config.templatePath, config.downloadFilename);
});

// 1:1 review requests — recorded server-side (appended to data/review-requests.jsonl).
app.post('/api/review-request', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !validEmail) {
    return res.status(400).json({ error: 'Please add your name and a valid email.' });
  }
  const record = {
    name,
    email,
    current: String(b.current || '').trim(),
    target: String(b.target || '').trim(),
    notes: String(b.notes || '').trim(),
    at: new Date().toISOString(),
  };
  try {
    const dir = path.join(__dirname, 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'review-requests.jsonl'), JSON.stringify(record) + '\n');
  } catch (err) {
    console.error('Could not record review request:', err.message);
    return res.status(500).json({ error: 'Could not submit your request. Please try again.' });
  }
  res.json({ ok: true });
});

app.get('/healthz', (req, res) => res.json({ ok: true, stripe: config.stripeEnabled }));

app.listen(config.port, () => {
  console.log(`Resume paywall running on ${config.baseUrl} (port ${config.port})`);
  if (!config.stripeEnabled) {
    console.warn('⚠  STRIPE_SECRET_KEY not set — checkout is disabled until you add it to .env');
  }
});
