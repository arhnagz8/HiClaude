# Brief 03 — ir-payments-collection

**Goal:** How the business collects Toman and verifies payment (gateway, card-to-card, Bale wallet, USDT on-chain), plus identity-inquiry vendors, SMS, and e-invoicing.
**Deliverables:** `docs/03-research/03-ir-payments-collection.md`, `data/gateways.json`, `data/collection_methods.json`, `data/identity_vendors.json`, `scripts/research/03_fee_stack.py`.

## Checklist
1. **Gateways** — Zarinpal, IDPay, Zibal, NextPay, Vandar, Pay.ir, Sep/Saman, Behpardakht/Mellat, Parsian, Digipay/Asan Pardakht aggregators.
   Eligibility for digital-goods / currency-related merchants; **prohibited-category lists** (crypto/forex/gift cards/virtual cards?) and enforcement; Enamad + documents; fees (%, caps, fixed, VAT);
   settlement cycles (Paya windows, holidays); dispute process; **API specs** (request/verify/refund/inquiry; amount units Rial vs Toman; callback; error codes; sandbox; IP whitelist; rate limits);
   incidents and the 2025-26 closures of gateways for crypto businesses (Dey-1404/1405).
2. **Card-to-card collection** — per-card/day caps in 1405; unique-amount strategy; **receipt verification** (SMS parsing, bank business APIs, Finnotech/Jibit-style verification/open banking);
   fraud patterns (fake receipts, reversals, triangular fraud using third-party victims); **account-freeze risk from many inbound transfers** and the lawful structure (business account, PSP, gateway);
   tax triggers (≥100 deposits/month, ≥35M Toman, etc. — verify the numbers).
3. **Bale** — bot API base URL and methods, `sendInvoice` / `answerPreCheckoutQuery` / `inquireTransaction`, wallet fees, settlement to bank, `provider_token` acquisition, limits, KYC levels,
   mini-app/WebApp SDK and initData validation; Eitaa / Rubika / Soroush-Plus equivalents (brief). **SMS providers** (Kavenegar, Ghasedak, Melipayamak): API shape, price per SMS, OTP rules, line requirements.
4. **Identity & inquiry APIs** — Shahkar (mobile↔national-ID), card-owner inquiry, IBAN inquiry, civil-registry — vendors (Jibit, Finnotech, Zibal, Vandar, …), pricing/limits, legal basis & consent.
5. **USDT collection from customers** — per-order address vs unique-amount; chain monitors (TronGrid/TronScan, Etherscan v2/BscScan, TonAPI/TonCenter): endpoints, auth, limits/pricing, confirmations, webhooks;
   **AML screening** of sender addresses (OFAC SDN digital-currency address list, free vs paid APIs); energy/gas management for sweeping; wrong-network / wrong-token / underpay / overpay handling policy.
6. **E-invoice** — Moadian (سامانه مودیان) for B2C invoices: who must use it, thresholds, API/third-party providers, penalties.
7. **Fee stack table** per collection method for 100,000 / 1,000,000 / 10,000,000 / 30,000,000 Toman orders (Python).

## JSON
`data/gateways.json` (per gateway: eligibility, prohibited categories, fee Records, settlement, API summary, risks), `data/collection_methods.json` (c2c, gateway, bale_wallet, usdt_trc20/bep20/ton: costs, caps, verification method, fraud risk score, confirmation time),
`data/identity_vendors.json` (vendor, endpoint capability, price per call Record).
