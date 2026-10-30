import type { Auth } from "convex/server";

type Identity = { [key: string]: unknown } | null;

function readRole(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return (value as { role?: unknown }).role;
}

export function hasAdminRole(identity: Identity) {
  if (!identity) return false;

  return (
    identity.role === "admin" ||
    readRole(identity.metadata) === "admin" ||
    readRole(identity.publicMetadata) === "admin" ||
    readRole(identity.public_metadata) === "admin" ||
    readRole(identity.claims) === "admin"
  );
}

export async function assertAdmin(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!hasAdminRole(identity)) {
    throw new Error("Unauthorized");
  }
}
