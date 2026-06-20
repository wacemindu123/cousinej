'use strict';

const path = require('path');
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const isVercel = Boolean(process.env.VERCEL);
const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

const config = {
  port: PORT,
  isVercel,

  // Used as a fallback only. Stripe redirect URLs are derived per-request from
  // the incoming host (see getBaseUrl in server.js) so they work on any domain.
  baseUrl: (
    process.env.BASE_URL ||
    (prodUrl ? `https://${prodUrl}` : `http://localhost:${PORT}`)
  ).replace(/\/+$/, ''),
  explicitBaseUrl: Boolean(process.env.BASE_URL),

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',

  // Pricing / product
  priceUsd: Number(process.env.PRICE_USD || 10),
  currency: (process.env.CURRENCY || 'usd').toLowerCase(),
  productName: process.env.PRODUCT_NAME || 'Resume Template',

  // Deliverables (swappable without touching code)
  googleDocUrl:
    process.env.GOOGLE_DOC_URL ||
    'https://docs.google.com/document/d/1AalTbrLfa4lf0Nlyk-1Dk8ajVXDTLEmEtREEUaHM6Ng/edit?usp=sharing',
  // Local override path; on Vercel the PDF ships embedded (template/pdf-data.js).
  templatePath: path.resolve(
    process.env.TEMPLATE_PDF_PATH || path.join(__dirname, 'template', 'resume-template.pdf')
  ),
  downloadFilename: process.env.DOWNLOAD_FILENAME || 'EJ-Green-Resume-Template.pdf',

  // Misc
  instagramUrl: process.env.INSTAGRAM_URL || 'https://instagram.com/ej',
  cookieSecret: process.env.COOKIE_SECRET || 'dev-insecure-secret-change-me',

  // Optional Vercel Postgres (activates automatically once POSTGRES_URL exists)
  postgresUrl: process.env.POSTGRES_URL || process.env.DATABASE_URL || '',
};

config.stripeEnabled = Boolean(config.stripeSecretKey);
config.dbEnabled = Boolean(config.postgresUrl);

module.exports = config;
