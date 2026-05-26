# AlphaPilot Backend Foundation

This first backend slice is a typed API contract for the frontend and optional advanced connectors.

Routes:

- `GET /api/health` checks service status and connector execution readiness.
- `GET /api/providers/health` checks external data provider health and config readiness without exposing secret values.
- `GET /api/persistence/health` checks Supabase table readiness without exposing secret values.
- `GET /api/mode` returns the active operating mode.
- `POST /api/mode` changes mode to `copilot`, `drive`, or `automation`.
- `GET /api/connectors` returns Vantage MT5, Binance, and Hyperliquid connector states.
- `GET /api/risk` returns risk settings, risk checks, and whether live orders can execute.
- `GET /api/trades` returns trade journal records.
- `GET /api/execution/kill-switch` returns kill switch state.
- `POST /api/execution/kill-switch` activates or deactivates the kill switch.
- `GET /api/execution/orders` returns governed execution orders for the operator or authenticated MT5 bridge.
- `POST /api/execution/orders` queues a Drive/Automation execution order or accepts an authenticated MT5 bridge execution report. Live queueing is blocked unless governance passes and `ALPHAPILOT_LIVE_EXECUTION_ENABLED=true`.
- `GET /api/mt5/heartbeat` returns the latest Vantage MT5 bridge heartbeat.
- `POST /api/mt5/heartbeat` receives a signed MT5 bridge heartbeat from the VPS.
- `GET /api/drive/plans` returns saved Drive trade plans.
- `POST /api/drive/plans` creates a read-only Drive plan for an enabled symbol. Public responses redact account equity and raw risk amount.
- `POST /api/drive/validate` validates a saved or supplied Drive plan against the shared review gate: entry, stop loss, targets, minimum R:R, scanner score, risk cap, symbol allowlist, open-trade cap, automation lock, and kill switch.
- `GET /api/scanner/run` runs the shared scanner powering Copilot, Drive, and locked Automation simulation.
- `GET /api/intelligence/latest` returns the UI-ready intelligence bundle.
- `GET /api/trade-cards/latest` returns simplified frontend market cards with bias, score, structure, risk status, and action labels. It intentionally does not return provider/source references.
- `GET /api/dashboard` returns the simple app dashboard contract: status, mode cards, quick actions, market cards, priority, risk checks, and alerts.
- `GET /api/readiness` returns the build/readiness checklist for Copilot, Drive, Automation, data providers, persistence, and public launch.
- `GET /api/launch/audit` returns the backend launch audit: write protection, bridge auth, scanner scheduling, persistence, provider, risk, automation lock, and MT5 connector gates.
- `GET /api/operator/status` returns the private operator status bundle: dashboard health, readiness, provider health, persistence health, latest scanner snapshot, and blocking issues.
- `GET /api/command` returns command capabilities and latest intelligence.
- `POST /api/command` runs frontend commands: `status`, `refresh`, `copilot_brief`, `drive_plan`, `automation_simulation`, `automation_cycle`, `provider_health`, `readiness`, `launch_audit`, `calendar_upcoming`, `scanner_snapshots`, `decision_journal`, `execution_orders`, `set_mode`, `kill_switch`, `unlock_live_execution`, and `lock_live_execution`.
- `GET /api/scanner/snapshots` returns recent scanner snapshots after the Supabase snapshot table is installed.
- `GET /api/journal/decisions` returns scanner, Copilot, Drive, and Automation decisions after the Supabase journal table is installed.

Automation mode is locked by default. AlphaPilot's public product is software-first: Copilot analysis and Drive trade planning. Broker execution connectors are advanced/private features and require explicit server and bridge flags before any live order can be sent.

Automation now reuses the Drive validation gate for every market decision. In the default configuration it records simulation-only decisions. When `ALPHAPILOT_LIVE_EXECUTION_ENABLED=true`, `ALPHAPILOT_APP_TOKEN` is configured, the kill switch is clear, Automation is explicitly unlocked through `POST /api/command`, and the MT5 bridge has `ALPHAPILOT_BRIDGE_ENABLE_LIVE_ORDERS=true`, automation cycles can queue governed MT5 market orders.

On the free Vercel Hobby plan, scanner refresh is on-demand through `/api/scanner/run` or `/api/command` because high-frequency cron requires a paid Vercel plan. The UI can call the command endpoint when a user opens the dashboard or presses refresh.

Local development bridge token:

```text
dev-bridge-token
```

Production should set `ALPHAPILOT_BRIDGE_TOKEN` in Vercel or the deployment environment.

Optional app write protection:

```text
ALPHAPILOT_APP_TOKEN=your-private-app-command-token
```

If this is set, write-style endpoints require either:

```text
Authorization: Bearer your-private-app-command-token
```

or:

```text
x-alphapilot-app-token: your-private-app-command-token
```

Protected writes include command POSTs, Drive plan creation/status changes, risk setting changes, mode changes, and kill-switch changes. Read endpoints remain open for now so the frontend can load public dashboard data.

Live execution flags:

```text
ALPHAPILOT_LIVE_EXECUTION_ENABLED=true
```

This server flag allows the backend to queue live execution orders only after risk, Drive validation, kill switch, connector, write-token, and Automation unlock checks pass. It does not by itself place broker trades.

On the VPS bridge, live order sending has a separate flag:

```powershell
$env:ALPHAPILOT_BRIDGE_ENABLE_LIVE_ORDERS="true"
```

Keep this unset or `false` while testing. With the bridge flag off, queued orders are reported back as dry runs instead of being sent to MT5.

Optional/free-first market data provider variables:

```text
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
FINNHUB_API_KEY=your-finnhub-key
FRED_API_KEY=your-fred-key
MYFXBOOK_EMAIL=your-myfxbook-email
MYFXBOOK_PASSWORD=your-myfxbook-password
SEC_API_KEY=your-sec-api-key
```

USAspending, Treasury Fiscal Data, Alternative.me Fear & Greed, Binance, Kraken, and Hyperliquid are called through public endpoints and do not need keys for the current AlphaPilot build.

Supabase persistence:

1. Run `docs/supabase.sql` in the Supabase SQL Editor.
2. Add these Vercel environment variables:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
```

Use the `service_role` key only in Vercel/server environments. Do not expose it in browser code or chat.

The first persisted tables are:

- `mt5_heartbeats`
- `drive_plans`
- `journal_entries`
- `economic_events`
- `scanner_snapshots`
- `decision_journal`

Check the live persistence state:

```text
GET /api/persistence/health
```

This endpoint reports whether each required Supabase table is readable, missing, or blocked by a permission/config issue. It is the quickest way to confirm whether Drive history, scanner snapshots, and the decision journal are production-ready.

If only the newer tables are missing, run:

```text
docs/supabase-missing-tables.sql
```

Until those tables exist, the backend keeps scanner snapshots, manual economic calendar events, and decision journal entries in temporary runtime memory so Copilot, Drive, and operator status can continue working during development. Runtime memory is not durable across Vercel cold starts or redeploys; Supabase remains required for real product history and public-launch audit trails.

The VPS bridge script lives at:

```text
bridge/mt5_bridge.py
```

It reads MT5 locally and POSTs a heartbeat report to `/api/mt5/heartbeat`. This bridge is for private/advanced connector testing, not required for standard AlphaPilot customers.

VPS bridge environment variables:

```powershell
$env:ALPHAPILOT_API_URL="https://files-mentioned-by-the-user-alphapi.vercel.app"
$env:ALPHAPILOT_BRIDGE_TOKEN="same-token-as-vercel"
$env:ALPHAPILOT_HEARTBEAT_INTERVAL_SECONDS="15"
$env:ALPHAPILOT_SYMBOLS="XAUUSD,EURUSD,GBPUSD"
$env:ALPHAPILOT_BRIDGE_ENABLE_LIVE_ORDERS="false"
```

Test once:

```powershell
py C:\AlphaPilot\mt5_bridge.py --once
```

Run continuously:

```powershell
py C:\AlphaPilot\mt5_bridge.py
```

The bridge writes logs to:

```text
C:\AlphaPilot\bridge.log
```

Recommended Windows Task Scheduler action:

```text
Program: py
Arguments: C:\AlphaPilot\mt5_bridge.py
Start in: C:\AlphaPilot
```
