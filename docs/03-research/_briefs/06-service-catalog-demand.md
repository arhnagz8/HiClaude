# Brief 06 — service-catalog-demand

**Goal:** A priced catalogue of ≥80 SKUs/categories that people in Iran buy with foreign-currency cards, with demand ranking, supplier fit, risk labels and margin potential.
**Deliverables:** `docs/03-research/06-service-catalog.md`, `data/catalog.json`, `scripts/research/06_margin_table.py`.

## Per SKU/category capture
Official USD price in 2026 (tiers/regional); billing cadence; accepted payment instruments (virtual/prepaid accepted? typical declines); **geo/ToS stance re Iran → `risk_label` + `restriction_note`**;
**fulfilment mode**: A = top-up of the customer's own payment instrument for their own account; B = gift card/voucher code; C = direct pay on the customer's behalf; D = account provisioned by us —
**D only where the vendor's terms allow; otherwise flag high risk and recommend A/B**. Typical Iranian retail price in Toman and implied markup over USD × market rate (≥3 competitor quotes with dates);
demand tier S/A/B/C with evidence (search interest, forum volume, competitor prominence); typical order size; repeat frequency; support burden; fraud/refund risk.

## Categories
AI (ChatGPT Go/Plus/Pro/API credits, Claude Pro/Max/API, Gemini/Google AI Pro/Ultra, Perplexity, Midjourney, Cursor, GitHub Copilot, Replit, Lovable, Suno, ElevenLabs, Runway, HeyGen, Grok…);
dev/cloud (AWS, GCP, Azure, DigitalOcean, Hetzner, Vultr, Linode, Cloudflare, Vercel, domains, Google Workspace);
design/productivity (Adobe CC, Canva, Figma, Notion, Slack, Zoom, Microsoft 365, Dropbox, Grammarly);
ads (Google Ads, Meta, TikTok, X, Telegram Ads — ToS flags);
media (Netflix, Spotify, YouTube Premium, Disney+, Apple One);
gaming (Steam, PSN, Xbox, Nintendo, Epic, Riot, Blizzard, Roblox);
app stores (App Store/iTunes, Google Play gift cards);
education (Coursera, Udemy, Duolingo, IELTS/TOEFL/GRE/PTE, application & embassy/visa fees);
freelancing/marketplaces (Upwork, Fiverr, PayPal, Wise);
VPN/security; telecom top-ups; shopping (Amazon, AliExpress, Temu); travel (Booking, Airbnb, flights).
Also: merchants mpay explicitly lists as supported; lists of cards Iranians report working/failing.

## Compute
For 20 flagship SKUs: margin table = supplier cost (USD) → Toman price at 3 FX levels (current ≈257k, +20%, −10%), competitor price, headroom %.

## JSON
`data/catalog.json`: `{ "skus": [ { "id","name","category","fulfilment_modes":[...], "default_mode", "usd_price": <Record>, "billing": "...", "risk_label": <Record>, "restriction_note": <Record>,
"demand_tier": <Record>, "typical_order_usd": <Record>, "repeat_per_year": <Record>, "competitor_toman_prices": [ {"seller","price_irt","as_of","fx_at_quote"} ], "recommended_margin_pct": <Record>, "min_margin_irt": <Record> } ] }`.
