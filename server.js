'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const config = require('./config');
const { renderPage } = require('./src/page');
const db = require('./src/db');

const app = express();
app.disable('x-powered-by');

const stripe = config.stripeEnabled ? require('stripe')(config.stripeSecretKey) : null;

// The downloadable PDF is embedded so it is always bundled into the serverless
// function. Falls back to reading from disk for local/custom setups.
let pdfBuffer = null;
try {
  pdfBuffer = require('./template/pdf-data.js');
} catch (e) {
  try {
    pdfBuffer = fs.readFileSync(config.templatePath);
  } catch (e2) {
    console.error('Could not load template PDF:', e2.message);
  }
}

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

// Build the public origin from the incoming request so Stripe redirects always
// return to the same domain the buyer started on (works on any Vercel URL).
function getBaseUrl(req) {
  if (config.explicitBaseUrl) return config.baseUrl;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${proto}://${host}` : config.baseUrl;
}

function setUnlockCookie(req, res, data) {
  const token = sign({ email: data.email || '', sid: data.sid || '', iat: Date.now() });
  const secure = getBaseUrl(req).startsWith('https://');
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
    if (!session || session.payment_status !== 'paid') return null;
    return {
      sid: session.id,
      email: (session.customer_details && session.customer_details.email) || '',
      amountCents: session.amount_total,
      currency: session.currency,
    };
  } catch (err) {
    console.error('Stripe verify error:', err.message);
    return null;
  }
}

// Resolve unlock state from (a) a valid Stripe session_id in the URL, or
// (b) a previously issued signed cookie.
async function resolveUnlock(req, res) {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (sessionId) {
    const ok = await verifyStripeSession(sessionId);
    if (ok) {
      setUnlockCookie(req, res, ok);
      // Best-effort durable record of the sale (no-op without a DB).
      db.recordPurchase({
        sid: ok.sid,
        email: ok.email,
        amountCents: ok.amountCents,
        currency: ok.currency,
      });
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
app.use(express.static(path.join(__dirname, 'public')));

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
    const base = getBaseUrl(req);
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
      success_url: `${base}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?canceled=1`,
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
  if (!pdfBuffer) {
    console.error('Template PDF buffer unavailable.');
    return res.status(500).type('text/plain').send('Template file is not available. Please contact support.');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${config.downloadFilename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdfBuffer);
});

// 1:1 review requests — persisted to Vercel Postgres when configured, otherwise
// logged (and written to a local file only in non-serverless dev).
app.post('/api/review-request', async (req, res) => {
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

  let stored = await db.recordReview(record);
  if (!stored && !config.isVercel) {
    try {
      const dir = path.join(__dirname, 'data');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'review-requests.jsonl'), JSON.stringify(record) + '\n');
      stored = true;
    } catch (err) {
      console.error('Local review write failed:', err.message);
    }
  }
  if (!stored) {
    // No DB configured (yet) — make sure it is at least captured in the logs.
    console.log('REVIEW_REQUEST', JSON.stringify(record));
  }
  res.json({ ok: true });
});

app.get('/healthz', (req, res) =>
  res.json({ ok: true, stripe: config.stripeEnabled, db: config.dbEnabled })
);

// Only listen when run directly (local dev). On Vercel the exported app is
// wrapped by the Node.js runtime.
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Resume paywall running on ${config.baseUrl} (port ${config.port})`);
    if (!config.stripeEnabled) {
      console.warn('⚠  STRIPE_SECRET_KEY not set — checkout is disabled until you add it.');
    }
  });
}

module.exports = app;
