type ClerkClaims = {
  metadata?: {
    role?: unknown;
  };
  publicMetadata?: {
    role?: unknown;
  };
  public_metadata?: {
    role?: unknown;
  };
  role?: unknown;
};

export function hasAdminRole(sessionClaims: unknown) {
  const claims = sessionClaims as ClerkClaims | null | undefined;

  return (
    claims?.metadata?.role === "admin" ||
    claims?.publicMetadata?.role === "admin" ||
    claims?.public_metadata?.role === "admin" ||
    claims?.role === "admin"
  );
}
