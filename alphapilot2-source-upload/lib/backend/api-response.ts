export function ok<T>(data: T) {
  return Response.json({
    ok: true,
    data,
    timestamp: new Date().toISOString()
  });
}

export function badRequest(message: string) {
  return Response.json(
    {
      ok: false,
      error: message,
      timestamp: new Date().toISOString()
    },
    { status: 400 }
  );
}

export function unauthorized(message = "unauthorized") {
  return Response.json(
    {
      ok: false,
      error: message,
      timestamp: new Date().toISOString()
    },
    { status: 401 }
  );
}
