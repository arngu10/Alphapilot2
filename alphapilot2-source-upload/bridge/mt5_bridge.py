import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import MetaTrader5 as mt5

DEFAULT_SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD"]
TIMEFRAME_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}
ALPHAPILOT_API_URL = os.getenv("ALPHAPILOT_API_URL", "http://localhost:3000")
ALPHAPILOT_BRIDGE_TOKEN = os.getenv("ALPHAPILOT_BRIDGE_TOKEN", "dev-bridge-token")
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("ALPHAPILOT_HEARTBEAT_INTERVAL_SECONDS", "15"))
CANDLE_COUNT = int(os.getenv("ALPHAPILOT_CANDLE_COUNT", "120"))
BRIDGE_ENABLE_LIVE_ORDERS = os.getenv("ALPHAPILOT_BRIDGE_ENABLE_LIVE_ORDERS", "false").lower() == "true"
ORDER_MAGIC = int(os.getenv("ALPHAPILOT_ORDER_MAGIC", "260505"))
ORDER_DEVIATION = int(os.getenv("ALPHAPILOT_ORDER_DEVIATION", "20"))
SYMBOLS = [
    symbol.strip().upper()
    for symbol in os.getenv("ALPHAPILOT_SYMBOLS", ",".join(DEFAULT_SYMBOLS)).split(",")
    if symbol.strip()
]
TIMEFRAMES = [
    timeframe.strip().upper()
    for timeframe in os.getenv("ALPHAPILOT_TIMEFRAMES", "M1,M15,M30,H1,H4,D1").split(",")
    if timeframe.strip().upper() in TIMEFRAME_MAP
]
LOG_FILE = os.getenv("ALPHAPILOT_BRIDGE_LOG", r"C:\AlphaPilot\bridge.log")
RUNNING = True


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def log(message):
    line = f"{utc_now()} {message}"
    print(line, flush=True)
    if LOG_FILE:
        try:
            os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
            with open(LOG_FILE, "a", encoding="utf-8") as file:
                file.write(line + "\n")
        except OSError:
            pass


def stop(*_args):
    global RUNNING
    RUNNING = False
    log("Shutdown requested")


def clean_account(account):
    if account is None:
        return None

    return {
        "login": account.login,
        "server": account.server,
        "company": account.company,
        "currency": account.currency,
        "balance": account.balance,
        "equity": account.equity,
        "margin": account.margin,
        "margin_free": account.margin_free,
        "leverage": account.leverage,
        "trade_mode": account.trade_mode,
    }


def clean_tick(symbol):
    mt5.symbol_select(symbol, True)
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return None

    return {
        "symbol": symbol,
        "bid": tick.bid,
        "ask": tick.ask,
        "time": tick.time,
    }


def clean_rate(rate):
    return {
        "time": int(rate["time"]),
        "open": float(rate["open"]),
        "high": float(rate["high"]),
        "low": float(rate["low"]),
        "close": float(rate["close"]),
        "tick_volume": int(rate["tick_volume"]),
    }


def clean_candles(symbol):
    mt5.symbol_select(symbol, True)
    timeframes = {}
    for label in TIMEFRAMES:
        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[label], 0, CANDLE_COUNT)
        timeframes[label] = [clean_rate(rate) for rate in rates] if rates is not None else []

    return {
        "symbol": symbol,
        "timeframes": timeframes,
    }


def clean_position(position):
    return {
        "ticket": position.ticket,
        "symbol": position.symbol,
        "type": position.type,
        "volume": position.volume,
        "price_open": position.price_open,
        "sl": position.sl,
        "tp": position.tp,
        "profit": position.profit,
    }


def build_report():
    initialized = mt5.initialize()
    account = mt5.account_info() if initialized else None
    positions = mt5.positions_get() if initialized else []

    return {
        "ok": initialized and account is not None,
        "timestamp": utc_now(),
        "account": clean_account(account),
        "symbols": [clean_tick(symbol) for symbol in SYMBOLS],
        "candles": [clean_candles(symbol) for symbol in SYMBOLS] if initialized else [],
        "positions": [clean_position(position) for position in positions] if positions else [],
        "last_error": mt5.last_error(),
    }


def post_heartbeat(report):
    body = json.dumps(report).encode("utf-8")
    request = urllib.request.Request(
        f"{ALPHAPILOT_API_URL.rstrip('/')}/api/mt5/heartbeat",
        data=body,
        headers={
            "content-type": "application/json",
            "x-alphapilot-bridge-token": ALPHAPILOT_BRIDGE_TOKEN,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        return response.status, response.read().decode("utf-8")


def api_request(path, method="GET", payload=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{ALPHAPILOT_API_URL.rstrip('/')}{path}",
        data=body,
        headers={
            "content-type": "application/json",
            "x-alphapilot-bridge-token": ALPHAPILOT_BRIDGE_TOKEN,
        },
        method=method,
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        text = response.read().decode("utf-8")
        return response.status, json.loads(text) if text else {}


def fetch_execution_orders():
    try:
        _status, response = api_request("/api/execution/orders?status=queued&limit=5")
        return response.get("data", {}).get("orders", [])
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        log(f"Execution poll failed: {error}")
        return []


def report_execution_order(order_id, status, ticket=None, retcode=None, comment=None, raw=None):
    try:
        api_request(
            "/api/execution/orders",
            method="POST",
            payload={
                "report": {
                    "id": order_id,
                    "status": status,
                    "ticket": ticket,
                    "retcode": retcode,
                    "comment": comment,
                    "raw": raw,
                }
            },
        )
    except urllib.error.URLError as error:
        log(f"Execution report failed order={order_id}: {error}")


def order_type(side):
    return mt5.ORDER_TYPE_BUY if side == "long" else mt5.ORDER_TYPE_SELL


def execute_order(order):
    order_id = order.get("id")
    symbol = order.get("symbol")

    if order.get("dryRun") or not BRIDGE_ENABLE_LIVE_ORDERS:
        report_execution_order(order_id, "dry_run", comment="Bridge live-order flag is disabled or order is dry-run.")
        log(f"Execution dry-run order={order_id} symbol={symbol}")
        return

    initialized = mt5.initialize()
    if not initialized:
        last_error = mt5.last_error()
        report_execution_order(order_id, "rejected", comment="MT5 initialize failed", raw={"last_error": last_error})
        log(f"Execution rejected order={order_id} initialize_failed={last_error}")
        return

    try:
        mt5.symbol_select(symbol, True)
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            report_execution_order(order_id, "rejected", comment="No MT5 tick for symbol", raw={"last_error": mt5.last_error()})
            log(f"Execution rejected order={order_id} symbol={symbol} no_tick")
            return

        side = order.get("side")
        price = tick.ask if side == "long" else tick.bid
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(order.get("volumeLots")),
            "type": order_type(side),
            "price": price,
            "sl": float(order.get("stopLoss")),
            "tp": float(order.get("takeProfit")),
            "deviation": ORDER_DEVIATION,
            "magic": ORDER_MAGIC,
            "comment": f"AlphaPilot {order_id}",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        raw = result._asdict() if result is not None and hasattr(result, "_asdict") else str(result)
        retcode = raw.get("retcode") if isinstance(raw, dict) else None
        ticket = raw.get("order") if isinstance(raw, dict) else None
        success = retcode == mt5.TRADE_RETCODE_DONE
        report_execution_order(
            order_id,
            "filled" if success else "rejected",
            ticket=ticket,
            retcode=retcode,
            comment=raw.get("comment") if isinstance(raw, dict) else None,
            raw=raw,
        )
        log(f"Execution {'filled' if success else 'rejected'} order={order_id} symbol={symbol} retcode={retcode}")
    finally:
        mt5.shutdown()


def process_execution_orders():
    orders = fetch_execution_orders()
    for order in orders:
        execute_order(order)


def send_once():
    report = build_report()

    try:
        status, response_text = post_heartbeat(report)
        symbol_count = len([symbol for symbol in report["symbols"] if symbol])
        candle_count = sum(
            len(candles)
            for symbol_candles in report.get("candles", [])
            for candles in symbol_candles.get("timeframes", {}).values()
        )
        log(
            f"Heartbeat POST status={status} ok={report['ok']} "
            f"symbols={symbol_count}/{len(SYMBOLS)} candles={candle_count} positions={len(report['positions'])}"
        )
        return status, response_text, report
    except urllib.error.URLError as error:
        log(f"Heartbeat POST failed: {error}")
        return None, str(error), report
    finally:
        mt5.shutdown()


def run_loop():
    log(
        "AlphaPilot MT5 bridge started "
        f"api={ALPHAPILOT_API_URL} interval={HEARTBEAT_INTERVAL_SECONDS}s symbols={','.join(SYMBOLS)}"
    )

    while RUNNING:
        send_once()
        process_execution_orders()
        for _ in range(HEARTBEAT_INTERVAL_SECONDS):
            if not RUNNING:
                break
            time.sleep(1)

    mt5.shutdown()
    log("AlphaPilot MT5 bridge stopped")


def main():
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    if "--once" in sys.argv:
        status, response_text, report = send_once()
        print(json.dumps(report, indent=2))
        if response_text:
            print(response_text)
        raise SystemExit(0 if status and 200 <= status < 300 else 1)

    run_loop()


if __name__ == "__main__":
    main()
