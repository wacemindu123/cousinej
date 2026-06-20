# Resume Template Paywall

A single page that previews a resume template for free and unlocks the full
template + downloads after a one-time payment. Built from the Claude Design
handoff (`Resume Paywall.dc.html`) and implemented per the PRD.

- **Preview** the top of the template; the rest is blurred behind a lock.
- **Pay** a one-time fee via **Stripe Checkout** (guest, no account, email collected by Stripe).
- **Unlock** is granted only after the server verifies the charge with Stripe.
- **Deliverables:** an editable **Google Doc** link + an auto-downloaded **PDF**.
- Buyers can return anytime — entitlement persists via a signed cookie and the
  re-accessible `?session_id=…` success link.

## Stack

Node.js + Express, server-rendered HTML (vanilla CSS/JS). No build step.

## Run locally

```bash
npm install
cp .env.example .env       # then fill in the values below
npm start                  # http://localhost:3000
```

`npm run dev` runs with `node --watch` for auto-reload.

## Configuration (`.env`)

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | **Required for payments.** `sk_live_…` (or `sk_test_…` in dev). |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…`. Stored for completeness; not required by the redirect flow. |
| `BASE_URL` | Public URL of the site, e.g. `https://yourdomain.com`. Used to build Stripe redirect URLs. No trailing slash. |
| `COOKIE_SECRET` | Long random string used to sign the unlock cookie. |
| `PRICE_USD` | Price in dollars. Design ships at `10`. |
| `CURRENCY` | Default `usd`. |
| `PRODUCT_NAME` | Shown on the Stripe Checkout line item. |
| `GOOGLE_DOC_URL` | Editable Google Doc link buyers receive. |
| `TEMPLATE_PDF_PATH` | Path to the downloadable PDF. Default `./template/resume-template.pdf`. |
| `DOWNLOAD_FILENAME` | Filename the browser saves. |
| `INSTAGRAM_URL` | Header/footer link. |

## How payment + unlock works (server-side trust)

1. Visitor clicks **Unlock** → `POST /api/checkout` creates a Stripe Checkout
   Session and returns its hosted URL → browser redirects to Stripe.
2. Stripe handles card entry, guest checkout, and email collection.
3. On success Stripe redirects to `BASE_URL/?session_id={CHECKOUT_SESSION_ID}`.
4. The server calls `stripe.checkout.sessions.retrieve()` and only renders the
   unlocked state if `payment_status === 'paid'`. The browser can never unlock
   on its own.
5. A tamper-proof signed cookie (`HMAC-SHA256`) is set so refreshes and return
   visits stay unlocked. `GET /api/download` re-checks entitlement on every hit.

## Swapping the deliverables (no redeploy)

- **PDF:** replace `template/resume-template.pdf` (or point `TEMPLATE_PDF_PATH`
  at a new file).
- **Google Doc:** update `GOOGLE_DOC_URL`. Share the doc as *Anyone with the
  link – Viewer*; buyers use *File → Make a copy*. A link ending in `/copy`
  opens the copy dialog directly.

## Stripe receipts

To email buyers a payment receipt automatically, enable
**Settings → Customer emails → Successful payments** in the Stripe Dashboard.
The on-page success panel already gives a re-accessible link to return to the
files.

## 1:1 review requests

The booking form posts to `POST /api/review-request` and appends each request
to `data/review-requests.jsonl` (gitignored). Read that file to follow up.

## Notes / decisions

- **Price:** the PRD mentioned $5; the design ships at **$10**. This uses the
  design value via `PRICE_USD` — change it in one place if you want $5.
- The inline "card details" form in the prototype was a mock; real card entry
  happens on Stripe's hosted, PCI-compliant Checkout page instead.
