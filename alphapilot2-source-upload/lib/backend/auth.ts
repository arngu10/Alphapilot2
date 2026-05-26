const DEV_BRIDGE_TOKEN = "dev-bridge-token";

export function getBridgeToken() {
  if (process.env.ALPHAPILOT_BRIDGE_TOKEN) {
    return process.env.ALPHAPILOT_BRIDGE_TOKEN;
  }

  return process.env.NODE_ENV === "production" ? null : DEV_BRIDGE_TOKEN;
}

export function isBridgeRequestAuthorized(request: Request) {
  const headerToken = request.headers.get("x-alphapilot-bridge-token");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const token = headerToken || bearerToken;

  const bridgeToken = getBridgeToken();
  return Boolean(bridgeToken) && token === bridgeToken;
}

export function getAppToken() {
  return process.env.ALPHAPILOT_APP_TOKEN ?? null;
}

export function isAppRequestAuthorized(request: Request) {
  const appToken = getAppToken();
  if (!appToken) return true;

  const headerToken = request.headers.get("x-alphapilot-app-token");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  return (headerToken || bearerToken) === appToken;
}

export function areAppWritesProtected() {
  return Boolean(getAppToken());
}
