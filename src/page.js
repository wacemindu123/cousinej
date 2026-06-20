'use strict';

// Renders the Resume Paywall page server-side. The visual is a faithful
// recreation of the Claude Design handoff (Resume Paywall.dc.html). The
// prototype's mocked, client-side "payment" is replaced by real Stripe
// Checkout + server-side verification, so the unlocked state is only ever
// produced by the server after Stripe confirms the charge.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The resume body that sits below the always-visible header/first role.
// Behind the blur overlay while locked; fully shown once unlocked.
const lockedResumeBody = `
  <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ activity, e.g. weekly market trends ] to [ purpose ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ tactic, e.g. product demos ] to [ outcome ]</li>
  </ul>

  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;">
    <span style="font-weight:700;color:#11362b;">[ Company Name ]</span><span style="font-size:12px;color:#7a776f;">[ City, State ]</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1px;">
    <span style="font-style:italic;color:#56534c;">[ Job Title ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
  </div>
  <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ result, e.g. $200K+ in new business ] through [ what you changed ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ scope, e.g. a client portfolio ], [ secondary action ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ what you built ] to [ result, e.g. cut churn 10% ]</li>
  </ul>

  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;">
    <span style="font-weight:700;color:#11362b;">[ Company Name ]</span><span style="font-size:12px;color:#7a776f;">[ City, State ]</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1px;">
    <span style="font-style:italic;color:#56534c;">[ Most Recent Title ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
  </div>
  <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ target, e.g. 18 meetings/month ], resulting in a [ outcome ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ activity, e.g. 70+ calls/day ] alongside [ channels ]</li>
    <li style="margin-bottom:6px;">Received [ recognition ] for [ reason ]</li>
  </ul>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;">
    <span style="font-style:italic;color:#56534c;">[ Earlier Title at Same Company ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
  </div>
  <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ activity, e.g. technical discovery with C-suite ] to [ purpose ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ result, e.g. $2M+ in qualified leads ] using [ method ]</li>
  </ul>

  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;">
    <span style="font-weight:700;color:#11362b;">[ Company Name ]</span><span style="font-size:12px;color:#7a776f;">[ City, State ]</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1px;">
    <span style="font-style:italic;color:#56534c;">[ Job Title ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
  </div>
  <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ activity, e.g. content strategy ] to [ outcome, e.g. 43% engagement growth ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> a team of [ number ] to [ responsibility ]</li>
  </ul>

  <div style="font-size:11.5px;font-weight:700;letter-spacing:1.6px;border-bottom:1.5px solid #1a1a18;padding-bottom:5px;margin:26px 0 11px;">LEADERSHIP &amp; COMMUNITY INVOLVEMENT</div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;">
    <span style="font-weight:700;color:#11362b;">[ Organization Name ]</span><span style="font-size:12px;color:#7a776f;">[ City, State ]</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1px;">
    <span style="font-style:italic;color:#56534c;">[ Role or Title ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
  </div>
  <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ initiative ] through [ contribution ]</li>
    <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ activity, e.g. legislative research ] in support of [ goal ]</li>
  </ul>

  <div style="font-size:11.5px;font-weight:700;letter-spacing:1.6px;border-bottom:1.5px solid #1a1a18;padding-bottom:5px;margin:26px 0 11px;">EDUCATION</div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;">
    <span style="font-weight:700;color:#11362b;">[ University or School Name ]</span><span style="font-size:12px;color:#7a776f;">[ City, State ]</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1px;">
    <span style="font-style:italic;color:#56534c;">[ Degree and Field ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
  </div>
`;

function lockOverlay(price) {
  return `
  <div style="position:absolute;left:-60px;right:-60px;top:-10px;bottom:-44px;backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);background:linear-gradient(to bottom,rgba(255,255,255,0.45) 0%,rgba(255,255,255,0.82) 26%,rgba(255,255,255,0.97) 55%);display:flex;justify-content:center;padding-top:46px;">
    <div style="width:384px;max-width:calc(100vw - 56px);background:#fff;border:1px solid #e7e3da;border-radius:18px;box-shadow:0 26px 64px -22px rgba(20,30,25,0.5);overflow:hidden;height:max-content;text-align:left;">
      <div style="padding:30px 30px 26px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:1.8px;color:#146b54;text-transform:uppercase;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#146b54" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Locked
        </div>
        <div style="font-family:'Newsreader',serif;font-size:25px;font-weight:500;line-height:1.12;text-align:center;margin-top:11px;">Unlock the full template</div>

        <div style="margin-top:20px;display:flex;flex-direction:column;gap:13px;">
          <div style="display:flex;align-items:flex-start;gap:11px;">
            <span style="flex:none;margin-top:1px;width:20px;height:20px;border-radius:50%;background:#e3f1ea;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#11362b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
            <span style="font-size:13.5px;line-height:1.35;color:#33312c;">The complete resume — every section</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:11px;">
            <span style="flex:none;margin-top:1px;width:20px;height:20px;border-radius:50%;background:#e3f1ea;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#11362b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
            <span style="font-size:13.5px;line-height:1.35;color:#33312c;">Editable Google Doc — make a copy</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:11px;">
            <span style="flex:none;margin-top:1px;width:20px;height:20px;border-radius:50%;background:#e3f1ea;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#11362b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
            <span style="font-size:13.5px;line-height:1.35;color:#33312c;">Ready-to-send PDF included</span>
          </div>
        </div>

        <div style="margin-top:22px;padding-top:20px;border-top:1px solid #efece4;display:flex;align-items:flex-end;justify-content:space-between;">
          <div>
            <div style="font-size:11px;color:#9a978e;font-weight:700;letter-spacing:1px;">ONE-TIME</div>
            <div style="font-family:'Newsreader',serif;font-size:40px;font-weight:500;line-height:1;margin-top:3px;">$${esc(price)}</div>
          </div>
          <div style="font-size:12px;color:#9a978e;text-align:right;line-height:1.4;padding-bottom:5px;">yours<br>forever</div>
        </div>

        <button data-action="checkout" style="width:100%;margin-top:18px;background:#11362b;color:#fff;border:none;border-radius:11px;padding:15px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.2px;">Unlock for $${esc(price)}</button>
        <div data-checkout-error style="display:none;font-size:11.5px;color:#b5482f;margin-top:11px;text-align:center;">Something went wrong starting checkout. Please try again.</div>
        <div style="font-size:11.5px;color:#9a978e;margin-top:13px;display:flex;align-items:center;justify-content:center;gap:6px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9a978e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Secure checkout · No account needed
        </div>
      </div>
    </div>
  </div>`;
}

function deliveryPanel({ emailDisplay, googleDocUrl, downloadUrl }) {
  return `
  <div style="max-width:760px;margin:0 auto;padding:0 28px 30px;">
    <div style="background:#11362b;color:#fff;border-radius:16px;padding:32px 34px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:30px;height:30px;border-radius:50%;background:#1f6f54;display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <span style="font-size:13px;font-weight:700;letter-spacing:.3px;color:#a9d8c6;">PAYMENT CONFIRMED</span>
      </div>
      <h2 style="font-family:'Newsreader',serif;font-weight:500;font-size:30px;margin:16px 0 0;line-height:1.1;">You’re in. Here’s your template.</h2>
      <p style="font-size:14.5px;line-height:1.6;color:#cfe0d8;margin:12px 0 0;max-width:520px;">Your purchase is tied to <strong style="color:#fff;">${esc(emailDisplay)}</strong>. Bookmark this page — your access link stays active, so you can come back anytime.</p>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px;">
        <a href="${esc(googleDocUrl)}" target="_blank" rel="noopener" style="flex:1;min-width:220px;text-decoration:none;background:#fff;color:#11362b;border-radius:10px;padding:16px 18px;display:flex;align-items:center;gap:13px;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#11362b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <span><span style="display:block;font-size:14px;font-weight:700;">Open the editable Google Doc</span><span style="display:block;font-size:12px;color:#5a7568;margin-top:1px;">Make your own copy →</span></span>
        </a>
        <a href="${esc(downloadUrl)}" data-auto-download download style="text-decoration:none;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:10px;padding:16px 18px;display:flex;align-items:center;gap:11px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span style="font-size:14px;font-weight:700;">Download PDF</span>
        </a>
      </div>
    </div>

    <div style="background:#fff;border:1px solid #e7e3da;border-radius:16px;padding:30px 34px;margin-top:16px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#146b54;text-transform:uppercase;">How to use it</div>
      <h3 style="font-family:'Newsreader',serif;font-weight:500;font-size:24px;margin:10px 0 22px;">Make a copy, then make it yours</h3>
      <div style="display:flex;flex-direction:column;gap:18px;">
        <div style="display:flex;gap:16px;align-items:flex-start;">
          <div style="flex:none;width:28px;height:28px;border-radius:50%;background:#11362b;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">1</div>
          <div><div style="font-weight:700;font-size:14.5px;">Open the Google Doc above</div><div style="font-size:13.5px;color:#6b6860;line-height:1.55;margin-top:3px;">It opens in view-only mode — that’s the master template, so you can’t edit it directly.</div></div>
        </div>
        <div style="display:flex;gap:16px;align-items:flex-start;">
          <div style="flex:none;width:28px;height:28px;border-radius:50%;background:#11362b;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">2</div>
          <div><div style="font-weight:700;font-size:14.5px;">Click File → Make a copy</div><div style="font-size:13.5px;color:#6b6860;line-height:1.55;margin-top:3px;">This saves an editable version to your own Google Drive. Now you can change anything.</div></div>
        </div>
        <div style="display:flex;gap:16px;align-items:flex-start;">
          <div style="flex:none;width:28px;height:28px;border-radius:50%;background:#11362b;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;">3</div>
          <div><div style="font-weight:700;font-size:14.5px;">Replace the content with your own</div><div style="font-size:13.5px;color:#6b6860;line-height:1.55;margin-top:3px;">Swap in your name, roles, and bullet points. Keep the structure — it’s what makes it ATS-friendly. Export to PDF when you apply.</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

function reviewSection() {
  return `
  <div style="background:#11362b;margin-top:34px;">
    <div style="max-width:760px;margin:0 auto;padding:60px 28px 64px;">
      <div style="text-align:center;">
        <div style="font-size:12px;font-weight:700;letter-spacing:2.5px;color:#7fc0a7;text-transform:uppercase;">Go deeper</div>
        <h2 style="font-family:'Newsreader',serif;font-weight:500;font-size:38px;color:#fff;margin:14px auto 0;max-width:520px;line-height:1.1;">Book a 1:1 resume review with EJ</h2>
        <p style="font-size:15.5px;line-height:1.6;color:#cfe0d8;max-width:480px;margin:16px auto 0;">30 minutes, screen-to-screen. We’ll go through your resume line by line and tighten your story for the roles you actually want.</p>
      </div>

      <div style="background:#fff;border-radius:16px;padding:32px 34px;margin-top:34px;">
        <div data-review-success style="display:none;text-align:center;padding:20px 0;">
          <div style="width:46px;height:46px;border-radius:50%;background:#e3f1ea;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#11362b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div style="font-family:'Newsreader',serif;font-size:26px;font-weight:500;">Request received</div>
          <p style="font-size:14px;color:#6b6860;line-height:1.6;margin:10px auto 0;max-width:380px;">Thanks<span data-review-name-suffix></span> — EJ will reach out at <strong data-review-email-display style="color:#1a1a18;">your email</strong> within 1–2 days with times to meet.</p>
          <button data-review-reset style="margin-top:18px;background:none;border:none;color:#9a978e;font-family:inherit;font-size:13px;cursor:pointer;text-decoration:underline;">Book another</button>
        </div>

        <form data-review-form>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:12px;font-weight:600;color:#6b6860;">Full name</label>
              <input name="name" placeholder="Your name" style="padding:12px 13px;border:1px solid #d8d4ca;border-radius:9px;font-family:inherit;font-size:14px;outline:none;" />
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:12px;font-weight:600;color:#6b6860;">Email</label>
              <input type="email" name="email" placeholder="you@email.com" style="padding:12px 13px;border:1px solid #d8d4ca;border-radius:9px;font-family:inherit;font-size:14px;outline:none;" />
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:12px;font-weight:600;color:#6b6860;">Current role</label>
              <input name="current" placeholder="e.g. SDR at Okta" style="padding:12px 13px;border:1px solid #d8d4ca;border-radius:9px;font-family:inherit;font-size:14px;outline:none;" />
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:12px;font-weight:600;color:#6b6860;">Target role</label>
              <input name="target" placeholder="e.g. Account Executive" style="padding:12px 13px;border:1px solid #d8d4ca;border-radius:9px;font-family:inherit;font-size:14px;outline:none;" />
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b6860;">What do you want to get out of the call? <span style="font-weight:400;color:#b3b0a7;">(optional)</span></label>
            <textarea name="notes" rows="3" placeholder="e.g. I keep getting screened out before interviews…" style="padding:12px 13px;border:1px solid #d8d4ca;border-radius:9px;font-family:inherit;font-size:14px;outline:none;resize:vertical;"></textarea>
          </div>
          <div data-review-error style="display:none;font-size:12px;color:#b5482f;margin-top:12px;">Please add your name and a valid email.</div>
          <button type="submit" style="width:100%;margin-top:20px;background:#11362b;color:#fff;border:none;border-radius:10px;padding:15px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;">Request my 1:1 review</button>
          <div style="font-size:11.5px;color:#9a978e;text-align:center;margin-top:11px;">No charge to request · EJ confirms times by email</div>
        </form>
      </div>
    </div>
  </div>`;
}

function renderPage(state, config) {
  const price = config.priceUsd;
  const unlocked = Boolean(state.unlocked);
  const emailDisplay = state.email || 'your email';
  const downloadUrl = '/api/download';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The resume template that got me 100 first-round interviews — EJ Green</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Libre+Franklin:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{background:#ece8e0;}
  ::selection{background:#cfe6dd;}
  @keyframes ejspin{to{transform:rotate(360deg);}}
  button[data-action="checkout"]:hover{background:#0c2820 !important;}
  input:focus,textarea:focus{border-color:#11362b !important;}
</style>
</head>
<body>
<div style="min-height:100vh;background:#ece8e0;font-family:'Libre Franklin',system-ui,sans-serif;color:#1a1a18;padding-bottom:0;">

  <!-- top bar -->
  <div style="max-width:1080px;margin:0 auto;padding:22px 28px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:30px;height:30px;border-radius:50%;background:#11362b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;letter-spacing:.5px;">EJ</div>
      <span style="font-weight:700;font-size:14px;letter-spacing:.3px;">EJ Green</span>
    </div>
    <a href="${esc(config.instagramUrl)}" target="_blank" rel="noopener" style="text-decoration:none;color:#5a5750;font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px;">
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#146b54;"></span>@ej on Instagram
    </a>
  </div>

  <!-- hero -->
  <div style="max-width:1080px;margin:0 auto;padding:30px 28px 40px;text-align:center;">
    <div style="font-size:12px;font-weight:700;letter-spacing:2.5px;color:#146b54;text-transform:uppercase;margin-bottom:18px;">The Template · One-Time $${esc(price)}</div>
    <h1 style="font-family:'Newsreader',serif;font-weight:500;font-size:54px;line-height:1.04;letter-spacing:-0.5px;margin:0 auto;max-width:780px;text-wrap:balance;">The resume template that got me 100 first-round interviews.</h1>
    <p style="font-size:17px;line-height:1.6;color:#4a473f;max-width:560px;margin:22px auto 0;text-wrap:pretty;">A recruiter-tested, ATS-friendly resume template with prompts built into every line. Editable Google Doc; just make a copy and drop in your own story.</p>
    <div style="display:flex;gap:26px;justify-content:center;flex-wrap:wrap;margin-top:26px;font-size:13px;color:#6b6860;font-weight:500;">
      <span style="display:flex;align-items:center;gap:8px;"><span style="color:#146b54;font-weight:800;">✓</span>Editable Google Doc</span>
      <span style="display:flex;align-items:center;gap:8px;"><span style="color:#146b54;font-weight:800;">✓</span>PDF included</span>
      <span style="display:flex;align-items:center;gap:8px;"><span style="color:#146b54;font-weight:800;">✓</span>No account needed</span>
    </div>
  </div>

  <!-- resume paper + lock -->
  <div style="max-width:760px;margin:0 auto;padding:0 28px 64px;position:relative;">
    <div style="background:#fff;border-radius:3px;box-shadow:0 20px 60px -24px rgba(20,30,25,0.4),0 2px 8px rgba(0,0,0,0.04);overflow:hidden;">
      <div style="padding:52px 60px 44px;font-size:13.5px;line-height:1.5;color:#1a1a18;">

        <!-- VISIBLE PART -->
        <div style="text-align:center;">
          <div style="font-size:27px;font-weight:700;letter-spacing:.4px;color:#11362b;"><span style="background:#edf2ef;border-radius:4px;padding:1px 8px;">[ Your Full Name ]</span></div>
          <div style="font-size:12px;color:#7a776f;margin-top:9px;letter-spacing:.2px;">[ Phone Number ] &nbsp;|&nbsp; [ Email Address ] &nbsp;|&nbsp; [ LinkedIn URL ]</div>
        </div>

        <div style="font-size:11.5px;font-weight:700;letter-spacing:1.6px;border-bottom:1.5px solid #1a1a18;padding-bottom:5px;margin:26px 0 11px;">SKILLS &amp; STRENGTHS</div>
        <div style="font-size:12.5px;color:#56534c;text-align:center;">[ Skill 1 ] &nbsp;·&nbsp; [ Skill 2 ] &nbsp;·&nbsp; [ Skill 3 ] &nbsp;·&nbsp; [ Skill 4 ] &nbsp;·&nbsp; [ Skill 5 ]</div>

        <div style="font-size:11.5px;font-weight:700;letter-spacing:1.6px;border-bottom:1.5px solid #1a1a18;padding-bottom:5px;margin:26px 0 11px;">PROFESSIONAL EXPERIENCE</div>

        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-weight:700;color:#11362b;">[ Company Name ]</span><span style="font-size:12px;color:#7a776f;">[ City, State ]</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:1px;">
          <span style="font-style:italic;color:#56534c;">[ Job Title ]</span><span style="font-size:12px;color:#7a776f;">[ MM/YYYY ] – [ MM/YYYY ]</span>
        </div>
        <ul style="margin:7px 0 0;padding-left:18px;color:#56534c;">
          <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> a [ cadence ] quota of [ target ] using [ framework ], while hitting a [ key metric ]</li>
          <li style="margin-bottom:6px;"><span style="color:#11362b;font-weight:600;">[ Action verb ]</span> [ volume, e.g. 100+ calls/day ] while managing a [ portfolio size ], driving a [ outcome ]</li>
          <li style="margin-bottom:6px;">Partnered cross-functionally with [ teams ] to [ what you resolved ]</li>
        </ul>

        <!-- LOCKED PART -->
        <div style="position:relative;">
          <div style="margin-top:6px;">
            ${lockedResumeBody}
          </div>
          ${unlocked ? '' : lockOverlay(price)}
        </div>

      </div>
    </div>

    ${unlocked ? '' : `<div style="text-align:center;font-size:12px;color:#9a978e;margin-top:16px;">Preview shows the top of the template. Unlock to view and download the full file.</div>`}
  </div>

  ${unlocked ? deliveryPanel({ emailDisplay, googleDocUrl: config.googleDocUrl, downloadUrl }) : ''}

  ${reviewSection()}

  <!-- footer -->
  <div style="max-width:760px;margin:0 auto;padding:30px 28px 50px;text-align:center;">
    <div style="font-size:12.5px;color:#8a877e;">© EJ Green · <a href="${esc(config.instagramUrl)}" target="_blank" rel="noopener" style="color:#146b54;text-decoration:none;">@ej on Instagram</a></div>
  </div>

</div>
<script src="/app.js"></script>
</body>
</html>`;
}

module.exports = { renderPage };
