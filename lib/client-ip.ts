export const CLIENT_IP_HEADER = "x-foleyard-client-ip";
export const CLIENT_IP_SECRET_HEADER = "x-foleyard-client-ip-secret";

export function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// Convex only honours the forwarded address when it arrives with the shared
// secret, so direct callers cannot spoof an IP to reset their rate limit.
// Without a configured secret we send nothing and Convex uses the connection's
// own address instead.
export function getClientIpHeaders(request: Request): Record<string, string> {
  const clientIp = getClientIp(request);
  const secret = process.env.FOLEYARD_CLIENT_IP_SECRET;

  if (!clientIp || !secret) {
    return {};
  }

  return {
    [CLIENT_IP_HEADER]: clientIp,
    [CLIENT_IP_SECRET_HEADER]: secret,
  };
}
