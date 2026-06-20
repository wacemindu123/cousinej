'use strict';

const path = require('path');
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);

const config = {
  port: PORT,
  baseUrl: (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, ''),

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',

  // Pricing / product
  priceUsd: Number(process.env.PRICE_USD || 10),
  currency: (process.env.CURRENCY || 'usd').toLowerCase(),
  productName: process.env.PRODUCT_NAME || 'Resume Template',

  // Deliverables (swappable without redeploying)
  googleDocUrl:
    process.env.GOOGLE_DOC_URL ||
    'https://docs.google.com/document/d/PLACEHOLDER_DOC_ID/edit?usp=sharing',
  templatePath: path.resolve(
    process.env.TEMPLATE_PDF_PATH || path.join(__dirname, 'template', 'resume-template.pdf')
  ),
  downloadFilename: process.env.DOWNLOAD_FILENAME || 'EJ-Green-Resume-Template.pdf',

  // Misc
  instagramUrl: process.env.INSTAGRAM_URL || 'https://instagram.com/ej',
  cookieSecret: process.env.COOKIE_SECRET || 'dev-insecure-secret-change-me',
};

config.stripeEnabled = Boolean(config.stripeSecretKey);

module.exports = config;
