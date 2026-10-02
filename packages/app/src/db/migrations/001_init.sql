-- 001_init — all core tables (architecture §11). DO NOT EDIT after release; add 002_*.sql instead.
-- Conventions: money = INTEGER (Toman / micro-USDT / USD cents); JSON = TEXT (`*_json`, validated by zod in repos);
-- timestamps = INTEGER epoch ms (UTC); booleans = INTEGER 0/1.

-- ───────────────────────── customers & identity ─────────────────────────
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  national_id TEXT,
  tier TEXT NOT NULL DEFAULT 'new' CHECK (tier IN ('new','verified','trusted')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  telegram_id TEXT,
  bale_id TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT REFERENCES customers(id),
  wallet_irt INTEGER NOT NULL DEFAULT 0 CHECK (wallet_irt >= 0),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  flags_json TEXT NOT NULL DEFAULT '[]',
  limit_override_json TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  kyc_submitted_at INTEGER,
  kyc_verified_at INTEGER
);
CREATE UNIQUE INDEX ux_customers_national_id ON customers(national_id) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX ux_customers_telegram ON customers(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE UNIQUE INDEX ux_customers_bale ON customers(bale_id) WHERE bale_id IS NOT NULL;
CREATE INDEX ix_customers_created ON customers(created_at);
CREATE INDEX ix_customers_referred_by ON customers(referred_by);

CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  kind TEXT NOT NULL CHECK (kind IN ('phone','telegram','bale')),
  external_id TEXT NOT NULL,
  verified_at INTEGER,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_identities_external ON identities(kind, external_id);
CREATE INDEX ix_identities_customer ON identities(customer_id);

-- customer AND staff sessions. The primary key is the SHA-256 hash of the bearer token (the token itself is never stored).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('customer','staff')),
  subject_id TEXT NOT NULL,
  channel TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_sessions_subject ON sessions(subject_kind, subject_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);

CREATE TABLE otps (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER
);
CREATE INDEX ix_otps_phone ON otps(phone, created_at);

-- ───────────────────────── catalog ─────────────────────────
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  family TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_products_family ON products(family);
CREATE INDEX ix_products_provider ON products(provider_id);

CREATE TABLE product_overrides (
  product_id TEXT PRIMARY KEY,
  active INTEGER,
  margin_override_pct REAL,
  min_margin_override_irt INTEGER,
  loss_leader INTEGER,
  sla_json TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- ───────────────────────── quotes & orders ─────────────────────────
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  product_id TEXT NOT NULL,
  amount_usd_cents INTEGER NOT NULL,
  rush_tier TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL,
  rate_snapshot_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  per_method_json TEXT NOT NULL,
  funding_micro_usdt INTEGER NOT NULL,
  cost_irt INTEGER NOT NULL,
  margin_irt INTEGER NOT NULL,
  uncompetitive INTEGER NOT NULL DEFAULT 0,
  competitor_ref_irt INTEGER,
  warnings_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX ix_quotes_customer ON quotes(customer_id, created_at);
CREATE INDEX ix_quotes_locked ON quotes(locked_until);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  idempotency_key TEXT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_id TEXT NOT NULL,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  amount_usd_cents INTEGER NOT NULL,
  rush_tier TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '{}',
  pay_currency TEXT NOT NULL CHECK (pay_currency IN ('IRT','USDT')),
  pay_amount INTEGER NOT NULL,
  funding_micro_usdt INTEGER NOT NULL,
  cost_irt_at_quote INTEGER NOT NULL,
  margin_irt_at_quote INTEGER NOT NULL,
  vat_irt INTEGER NOT NULL DEFAULT 0,
  rush_irt INTEGER NOT NULL DEFAULT 0,
  discount_irt INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT NOT NULL,
  fulfilment_mode TEXT NOT NULL,
  channel TEXT NOT NULL,
  referral_code TEXT,
  waiting_funding INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  pay_expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  delivered_at INTEGER,
  completed_at INTEGER,
  sla_due_at INTEGER
);
CREATE UNIQUE INDEX ux_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_orders_customer ON orders(customer_id, created_at);
CREATE INDEX ix_orders_status ON orders(status, created_at);
CREATE INDEX ix_orders_pay_expires ON orders(status, pay_expires_at);
CREATE INDEX ix_orders_created ON orders(created_at);
CREATE INDEX ix_orders_product ON orders(product_id);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  at INTEGER NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  data_json TEXT
);
CREATE INDEX ix_order_events_order ON order_events(order_id, at);

-- ───────────────────────── payments ─────────────────────────
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('IRT','USDT')),
  expected_amount INTEGER NOT NULL,
  received_amount INTEGER NOT NULL DEFAULT 0,
  unique_offset_irt INTEGER,
  gateway_id TEXT,
  authority TEXT,
  pay_url TEXT,
  destination_card_id TEXT,
  network TEXT,
  address TEXT,
  memo TEXT,
  tx_hash TEXT,
  confirmations INTEGER,
  receipt_json TEXT,
  matched_ref TEXT,
  fee_irt INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  note TEXT
);
CREATE UNIQUE INDEX ux_payments_tx_hash ON payments(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX ux_payments_authority ON payments(gateway_id, authority) WHERE authority IS NOT NULL;
CREATE INDEX ix_payments_order ON payments(order_id);
CREATE INDEX ix_payments_status ON payments(status, method);
CREATE INDEX ix_payments_address ON payments(address) WHERE address IS NOT NULL;

CREATE TABLE bank_credits (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  amount_irt INTEGER NOT NULL,
  at INTEGER NOT NULL,
  channel TEXT NOT NULL,
  sender_card_masked TEXT,
  sender_name TEXT,
  destination_card_id TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','ignored')),
  matched_payment_id TEXT,
  matched_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_bank_credits_ref ON bank_credits(ref);
CREATE INDEX ix_bank_credits_status ON bank_credits(status, at);
CREATE INDEX ix_bank_credits_amount ON bank_credits(amount_irt, at);

CREATE TABLE chain_transfers (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount INTEGER NOT NULL,
  memo TEXT,
  at INTEGER NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','failed')),
  matched_payment_id TEXT,
  screened_risk TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_chain_transfers_tx ON chain_transfers(network, tx_hash);
CREATE INDEX ix_chain_transfers_to ON chain_transfers(to_address, at);
CREATE INDEX ix_chain_transfers_status ON chain_transfers(status);

-- ───────────────────────── fulfilment ─────────────────────────
CREATE TABLE fulfilment_tasks (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL,
  rush_tier TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  claimed_by TEXT,
  claimed_at INTEGER,
  completed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT NOT NULL,
  instructions_json TEXT NOT NULL,
  result_json TEXT,
  failure_reason TEXT
);
CREATE INDEX ix_tasks_queue ON fulfilment_tasks(status, priority, due_at);
CREATE INDEX ix_tasks_order ON fulfilment_tasks(order_id);
CREATE INDEX ix_tasks_claimed ON fulfilment_tasks(claimed_by, status);

-- Delivery payloads (card PAN/CVV, voucher codes) are stored ONLY as envelope-encrypted blobs (secret_enc).
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  task_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('card','voucher','receipt','note')),
  summary_json TEXT NOT NULL,
  secret_enc TEXT,
  reveal_count INTEGER NOT NULL DEFAULT 0,
  last_revealed_at INTEGER,
  reveal_token_hash TEXT,
  reveal_token_expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_deliveries_order ON deliveries(order_id);

-- ───────────────────────── treasury ─────────────────────────
CREATE TABLE usdt_lots (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL,
  qty_micro INTEGER NOT NULL,
  remaining_micro INTEGER NOT NULL CHECK (remaining_micro >= 0),
  cost_irt INTEGER NOT NULL,
  acquired_at INTEGER NOT NULL,
  withdrawable_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('locked','available','withdrawn'))
);
CREATE INDEX ix_lots_avail ON usdt_lots(status, withdrawable_at);
CREATE INDEX ix_lots_exchange ON usdt_lots(exchange_id, status);

CREATE TABLE treasury_actions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','executing','done','failed')),
  exchange_id TEXT,
  provider_id TEXT,
  amount_irt INTEGER,
  amount_micro_usdt INTEGER,
  network TEXT,
  rate REAL,
  fee_irt INTEGER,
  fee_micro_usdt INTEGER,
  note TEXT,
  data_json TEXT
);
CREATE INDEX ix_treasury_actions_at ON treasury_actions(at);
CREATE INDEX ix_treasury_actions_status ON treasury_actions(status, type);

CREATE TABLE rate_snapshots (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  status TEXT NOT NULL,
  mid REAL NOT NULL,
  executable_ask REAL NOT NULL,
  executable_bid REAL NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE INDEX ix_rate_snapshots_ts ON rate_snapshots(ts);

-- ───────────────────────── ledger (append-only) ─────────────────────────
CREATE TABLE ledger_accounts (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('IRT','USDT'))
);

CREATE TABLE ledger_entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  memo TEXT NOT NULL,
  refs_json TEXT NOT NULL DEFAULT '{}',
  order_id TEXT,
  product_family TEXT,
  provider_id TEXT,
  exchange_id TEXT,
  customer_id TEXT,
  channel TEXT
);
CREATE INDEX ix_ledger_entries_ts ON ledger_entries(ts);
CREATE INDEX ix_ledger_entries_order ON ledger_entries(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX ix_ledger_entries_kind ON ledger_entries(kind, ts);
CREATE INDEX ix_ledger_entries_family ON ledger_entries(product_family) WHERE product_family IS NOT NULL;
CREATE INDEX ix_ledger_entries_provider ON ledger_entries(provider_id) WHERE provider_id IS NOT NULL;

CREATE TABLE ledger_lines (
  entry_id TEXT NOT NULL REFERENCES ledger_entries(id),
  line_no INTEGER NOT NULL,
  account TEXT NOT NULL,
  qty INTEGER NOT NULL,
  irt INTEGER NOT NULL,
  ts INTEGER NOT NULL, -- denormalised from the entry so (account, ts) range scans are index-only
  PRIMARY KEY (entry_id, line_no)
);
CREATE INDEX ix_ledger_lines_account_ts ON ledger_lines(account, ts);
CREATE INDEX ix_ledger_lines_entry ON ledger_lines(entry_id);

-- Append-only guarantees (corrections are posted as reversing entries, never edits).
CREATE TRIGGER trg_ledger_entries_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
CREATE TRIGGER trg_ledger_entries_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
CREATE TRIGGER trg_ledger_lines_no_update BEFORE UPDATE ON ledger_lines
BEGIN SELECT RAISE(ABORT, 'ledger_lines is append-only'); END;
CREATE TRIGGER trg_ledger_lines_no_delete BEFORE DELETE ON ledger_lines
BEGIN SELECT RAISE(ABORT, 'ledger_lines is append-only'); END;

-- ───────────────────────── settings, staff, audit ─────────────────────────
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE TABLE settings_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  old_json TEXT,
  new_json TEXT,
  version INTEGER NOT NULL,
  at INTEGER NOT NULL,
  actor TEXT,
  reason TEXT
);
CREATE INDEX ix_settings_audit_key ON settings_audit(key, at);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','operator','support','accountant','viewer')),
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  data_json TEXT
);
CREATE INDEX ix_audit_at ON audit_log(at);
CREATE INDEX ix_audit_actor ON audit_log(actor_id, at);
CREATE INDEX ix_audit_target ON audit_log(target, at);
CREATE INDEX ix_audit_action ON audit_log(action, at);

-- ───────────────────────── support ─────────────────────────
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  order_id TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','pending','closed')),
  assigned_to TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ix_tickets_customer ON tickets(customer_id, created_at);
CREATE INDEX ix_tickets_status ON tickets(status, updated_at);

CREATE TABLE ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  at INTEGER NOT NULL,
  from_kind TEXT NOT NULL CHECK (from_kind IN ('customer','staff')),
  author_id TEXT,
  text TEXT NOT NULL
);
CREATE INDEX ix_ticket_messages_ticket ON ticket_messages(ticket_id, at);

-- ───────────────────────── notifications ─────────────────────────
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  customer_id TEXT,
  event TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram','bale','sms','in_app')),
  target TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','delivered','retry','failed','read')),
  critical INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  data_json TEXT,
  dedupe_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  read_at INTEGER
);
CREATE UNIQUE INDEX ux_notifications_dedupe ON notifications(dedupe_key, channel) WHERE dedupe_key IS NOT NULL;
CREATE INDEX ix_notifications_queue ON notifications(status, next_attempt_at);
CREATE INDEX ix_notifications_customer ON notifications(customer_id, created_at);
CREATE INDEX ix_notifications_group ON notifications(group_id);

CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES customers(id),
  referred_id TEXT NOT NULL UNIQUE REFERENCES customers(id),
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('attributed','qualified','rewarded','rejected')),
  reward_irt INTEGER NOT NULL DEFAULT 0,
  qualified_order_id TEXT,
  created_at INTEGER NOT NULL,
  qualified_at INTEGER,
  rewarded_at INTEGER,
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX ix_referrals_referrer ON referrals(referrer_id, status);

-- ───────────────────────── reporting & platform state ─────────────────────────
CREATE TABLE kpi_daily (
  date TEXT PRIMARY KEY, -- IRST ISO date
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE jobs_state (
  name TEXT PRIMARY KEY,
  registered_at INTEGER,
  last_run_at INTEGER,
  last_ok_at INTEGER,
  last_slot INTEGER,
  last_error TEXT,
  runs INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE kill_switches (
  key TEXT PRIMARY KEY, -- 'all' | 'rates' | 'provider:<id>' | 'product:<id>'
  scope TEXT NOT NULL,
  scope_id TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  set_by TEXT,
  set_at INTEGER NOT NULL,
  cleared_at INTEGER
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  code TEXT NOT NULL,
  message_fa TEXT NOT NULL,
  data_json TEXT,
  acked_by TEXT,
  acked_at INTEGER,
  resolved_at INTEGER
);
CREATE INDEX ix_alerts_open ON alerts(resolved_at, severity, at);
CREATE INDEX ix_alerts_code ON alerts(code, at);
