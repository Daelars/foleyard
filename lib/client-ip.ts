export function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// The signup routes build their forwarded-IP header in this one place. PR #13
// replaces this with the secret-bearing `getClientIpHeaders` helper; until it
// lands, swapping that helper in is a one-line change here.
export function getForwardedClientIpHeaders(
  request: Request,
): Record<string, string> {
  const clientIp = getClientIp(request);
  return clientIp ? { "x-foleyard-client-ip": clientIp } : {};
}
