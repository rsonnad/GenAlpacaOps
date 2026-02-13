# Instruction: Enhance Monastery Donation Page

**Target file:** `rahulio/pages/donate.html`
**Branch:** `claude/monastery-donation-payments-r5onx`
**Action:** Merge to main when complete

## What to Do

Enhance the existing donate.html page with three major additions:

---

### 1. Photo Gallery Section (add after the About/Mission section)

Add a visual gallery section between the About section and the Donation Amount Selector. Use real monastery imagery from Wikimedia Commons (freely licensed):

- **Monastery exterior** — Use Gaden monastery photos from `https://commons.wikimedia.org/wiki/Category:Ganden_Monastery` (66 files available)
- **Monks debating** — Classic Tibetan philosophical debate pose photos
- **Sand mandala creation** — The Gaden Shartse monks are famous for their USA sand mandala tours
- **Prayer hall interior** — Ornate Tibetan Buddhist temple interiors
- **Butter lamp offerings** — Rows of flickering butter lamps
- **Sacred texts / scriptures** — Tibetan Buddhist texts and study

Use Wikimedia Commons `upload.wikimedia.org` URLs for the images. Create a responsive CSS grid gallery (3 columns desktop, 2 tablet, 1 mobile) with:
- Rounded corners, subtle shadows
- Captions overlay at bottom of each image
- Hover zoom effect
- A lightbox on click (simple CSS/JS lightbox)

If Wikimedia images can't be fetched reliably, use elegant CSS gradient placeholder cards with descriptive text and Buddhist emoji icons (like the existing pattern on the page) — make them look intentional, not broken.

---

### 2. Expanded Payment Methods — Per-Method Deep Explanations

The current payment section has 4 category cards (India Digital, International, Crypto, Bank). Enhance each one significantly:

#### India — UPI & Digital Wallets
- **Google Pay (GPay):** Explain it's India's most popular UPI payment app. Donor scans QR code or enters UPI ID. Instant transfer, zero fees for sender. Available on Android and iOS. Settlement: Real-time to monastery's bank account.
- **PhonePe:** Second-largest UPI app. Same QR/UPI ID flow. Supports UPI Lite for small amounts (under Rs 500) without PIN.
- **Paytm:** Wallet + UPI hybrid. Can pay from Paytm Wallet balance or linked bank via UPI. Also supports Paytm Postpaid (buy now, pay later).
- **BHIM:** Government's official UPI app. Lightweight, works on basic smartphones. Direct bank-to-bank transfer.
- **UPI Explanation Box:** Add a callout explaining what UPI is — Unified Payments Interface, India's real-time payment system processing 12+ billion transactions/month, built by NPCI (National Payments Corporation of India). Zero fees for person-to-person transfers. Works 24/7 including holidays.
- Add a prominent QR code placeholder area with text "Scan with any UPI app"

#### International — Cards & Online
- **Credit/Debit Cards (Visa, Mastercard, Amex, Discover, Diners Club):** Processed via Razorpay. PCI-DSS Level 1 compliant. 3D Secure authentication. Supports cards from 100+ countries. Fee: 2% domestic India, 3% international.
- **Razorpay Checkout:** India's leading payment gateway. Single integration handles cards, UPI, netbanking, wallets. Donor sees a clean modal checkout. Supports saved cards for returning donors. Auto-retry on failures.
- **PayPal:** For donors who prefer PayPal's buyer protection. Supports 25 currencies. Higher fees (3.49% + $0.49) but familiar to Western donors. Can donate from PayPal balance or linked bank/card.
- **Wire Transfer / SWIFT:** For large donations ($1000+). Donor initiates from their bank. Provide full bank details: Bank name, Account name, Account number, IFSC code, SWIFT/BIC code, Bank address. Note: Takes 2-5 business days. Intermediary bank fees may apply ($15-30).
- **Netbanking (India):** Direct bank-to-bank via Razorpay. Supports 60+ Indian banks including SBI, HDFC, ICICI, Axis, PNB, BOB. Redirects to bank's secure login page.

#### Cryptocurrency
- **Bitcoin (BTC):** Explain: decentralized digital currency. Donor sends from any Bitcoin wallet (Coinbase, Ledger, Trust Wallet, etc.). Provide a full BTC address (currently shows truncated placeholder). Note typical confirmation time: 10-60 minutes. Irreversible once confirmed.
- **Ethereum (ETH):** Explain: programmable blockchain. Lower fees than BTC for smaller amounts. Faster confirmation (15 seconds to 5 minutes). Provide full ETH address.
- **USDT/USDC (Stablecoins):** Add these — pegged to $1 USD, no volatility risk. Popular for international donations. Specify which networks accepted (ERC-20, TRC-20).
- **Tax Note:** Add a note that crypto donations may be tax-deductible in many countries (US: up to fair market value, no capital gains tax on appreciated crypto donated).

#### Bank Transfer & Offline
- **NEFT/RTGS/IMPS (India domestic):** Explain each:
  - NEFT: Batch processing, settles in 30 min, no minimum, max Rs 10 lakh online
  - RTGS: Real-time for amounts Rs 2 lakh+, instant settlement
  - IMPS: 24/7 instant transfer, up to Rs 5 lakh, small fee (Rs 2.50-25)
- **Check / Demand Draft:** Mail to monastery address. Make payable to "Gaden Shartse Norling College Buddhist Cultural Association"
- **US Donors — 501(c)(3):** Donations through the Gaden Shartse Cultural Foundation (Long Beach, CA) are tax-deductible. EIN: 20-5126355. Checks payable to "Gaden Shartse Cultural Foundation"
- **FCRA Status:** Note that the monastery has valid FCRA (Foreign Contribution Regulation Act) registration, which is legally required for Indian nonprofits to receive foreign donations.

#### Add a NEW 5th category: **In-Person / Tour Donations**
- Donations accepted at all USA tour stops (sand mandala events, teachings, ceremonies)
- Cash, check, card (Square reader) accepted at events
- Suggested donation: $15 per event, but all amounts welcome
- 100% of tour proceeds go to monastery in India
- Schedule: Annual tours typically Oct-Dec across US cities

---

### 3. Enhanced Tech Section — Deeper Explanations

Expand each tech card to include more detail. Also add new subsections:

#### Expand existing cards:
- **Frontend:** Add: "Pure HTML/CSS/JS — no React, no build step, no npm. The page you're viewing right now is a single .html file served from GitHub's global CDN (Fastly). Time-to-first-byte under 50ms worldwide. The entire page weighs under 50KB gzipped."
- **Payment Processing:** Add: "Razorpay handles PCI compliance so we never touch card numbers. Client-side tokenization converts sensitive data before it reaches our servers. Razorpay processes $100B+ annually for 10M+ businesses."
- **UPI Integration:** Add: "UPI QR codes are generated dynamically with the exact donation amount pre-filled. The donor just scans and confirms with their PIN. No app download needed — works with 300+ bank apps. UPI processed 12.02 billion transactions worth $250B in January 2024 alone."
- **Database:** Add: "PostgreSQL via Supabase — the same database engine that powers Instagram and Spotify. Row Level Security (RLS) ensures donors can only see their own data. Real-time subscriptions push updates to the admin dashboard instantly."
- **Email Receipts:** Add: "Branded HTML emails via Resend API (99.9% deliverability). Indian donors receive 80G tax exemption certificate number. International donors receive a receipt valid for tax deduction in their country. Emails sent within 30 seconds of payment confirmation."
- **SMS:** Add: "Telnyx carrier-grade SMS to 200+ countries. Indian donors get SMS in Hindi or English based on preference. Message includes: amount, transaction ID, and a thank-you blessing."
- **Recurring Billing:** Add: "Razorpay Subscriptions API handles retry logic automatically — if a monthly charge fails, it retries 3 times over 7 days before pausing. Donors can pause, resume, or cancel anytime via a self-service portal link in each receipt email."
- **Multi-Currency:** Add: "Real-time exchange rates from Razorpay. Donors see the amount in their local currency at checkout. Settlement in INR to monastery's Indian bank account. Currently supported: INR, USD, EUR, GBP, CAD, AUD, SGD, JPY, HKD."

#### Add NEW tech cards:
- **80G Tax Receipts (India):** "Indian donors receive automatic 80G tax exemption certificates. Section 80G of the Income Tax Act allows 50% deduction on donations to approved institutions. Our system generates unique certificate numbers, tracks PAN verification, and sends certificates before tax filing season."
- **501(c)(3) US Tax Deduction:** "US donors giving through the Gaden Shartse Cultural Foundation receive tax-deductible receipts. The Foundation (EIN: 20-5126355) is a registered 501(c)(3) nonprofit. Donations are deductible up to 60% of adjusted gross income for cash, 30% for appreciated property."
- **FCRA Compliance:** "The monastery holds valid FCRA registration (Foreign Contribution Regulation Act, 2010) from the Government of India's Ministry of Home Affairs. This legally permits receiving donations from foreign sources. All foreign donations are reported quarterly to the FCRA authority. Full transparency — annual reports available on request."
- **Fraud Prevention:** "Multi-layer protection: Razorpay's AI-powered fraud detection, 3D Secure card authentication, UPI PIN verification, webhook signature validation (HMAC-SHA256), and server-side amount verification. Every payment is verified server-side before recording — client-side amounts are never trusted."
- **Data Privacy:** "Donor data stored in Supabase with Row Level Security (RLS). No data shared with third parties. Compliant with India's Digital Personal Data Protection Act (DPDPA 2023). Anonymous donation option available — we don't store name or email if you check 'anonymous'. All data encrypted at rest (AES-256) and in transit (TLS 1.3)."
- **Admin Dashboard:** "Monastery administrators see real-time donation feeds, donor CRM, payment reconciliation, and financial reports. Built on the same AlpacApps admin infrastructure. Mobile-responsive for monks to check from their phones."

#### Add a NEW "Architecture Deep Dive" subsection:
A more detailed version of the flow diagram showing:
```
Donor Browser
  ├── Static HTML (GitHub Pages CDN — Fastly)
  ├── Razorpay.js SDK (loaded from Razorpay CDN)
  └── Supabase.js client (for donor record + analytics)

Payment Flow:
  1. Donor clicks "Donate Now"
  2. JS calls Supabase Edge Function → creates Razorpay Order
  3. Razorpay Checkout modal opens (hosted by Razorpay — PCI compliant)
  4. Donor completes payment (card/UPI/netbanking/wallet)
  5. Razorpay sends webhook → Supabase Edge Function
  6. Edge Function verifies HMAC signature
  7. Writes to: donations table + ledger table + api_usage_log
  8. Triggers: email receipt (Resend) + SMS confirmation (Telnyx)
  9. Updates: real-time admin dashboard via Supabase Realtime

Monthly Recurring:
  1. Razorpay Subscriptions API creates plan + subscription
  2. Auto-charges on billing date each month
  3. On each charge: same webhook flow (steps 5-9)
  4. Failed charge → 3 retries over 7 days → notification to donor
  5. Donor self-service portal for pause/cancel
```

---

### Style Notes

- Keep the existing Tibetan Buddhist color palette (maroon, gold, saffron, cream)
- Keep the existing Cormorant Garamond + DM Sans font pairing
- Keep the reveal scroll animation pattern
- Keep the demo banner at bottom
- Keep all existing interactivity (donation amount selector, frequency toggle, form, toast notifications)
- The page should remain a single self-contained HTML file (no external JS/CSS dependencies except Google Fonts)
- Make the expanded sections collapsible with `<details>/<summary>` where appropriate so the page doesn't feel overwhelming
- Ensure mobile responsive at 768px and 480px breakpoints

### After completing changes:
1. Commit with message: `feat: enhance donate page with gallery, expanded payments, and deeper tech docs`
2. Merge to main branch
3. Push main
