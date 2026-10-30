export const CLIENT_IP_HEADER = "x-foleyard-client-ip";
export const CLIENT_IP_SECRET_HEADER = "x-foleyard-client-ip-secret";

export function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// Always forwards the visitor's address so Convex can rate-limit per visitor
// instead of per Next server. When a shared secret is configured we add the
// secret header alongside it; Convex only honours the address once that header
// matches, so a direct caller cannot spoof an IP to reset their rate limit.
// Without a configured secret the bare address is still forwarded, and Convex
// falls back to it because there is nothing to verify against.
export function getClientIpHeaders(request: Request): Record<string, string> {
  const clientIp = getClientIp(request);

  if (!clientIp) {
    return {};
  }

  const secret = process.env.FOLEYARD_CLIENT_IP_SECRET;

  if (!secret) {
    return { [CLIENT_IP_HEADER]: clientIp };
  }

  return {
    [CLIENT_IP_HEADER]: clientIp,
    [CLIENT_IP_SECRET_HEADER]: secret,
  };
}
