import type { MutationCtx } from "../_generated/server";

export const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_LIMIT = 2;
export const IP_LIMIT = 5;

type RateLimitScope = "email" | "ip";

export async function consumeRateLimit(
  ctx: Pick<MutationCtx, "db">,
  scope: RateLimitScope,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
) {
  const existing = await ctx.db
    .query("waitlistRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing || existing.expiresAt <= now) {
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: 1,
        windowStartedAt: now,
        expiresAt: now + windowMs,
      });
    } else {
      await ctx.db.insert("waitlistRateLimits", {
        key,
        scope,
        count: 1,
        windowStartedAt: now,
        expiresAt: now + windowMs,
      });
    }

    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  await ctx.db.patch(existing._id, {
    count: existing.count + 1,
  });
  return true;
}

// Both limits are always consumed, so a refused IP still counts against the email.
export async function consumeSignupRateLimits(
  ctx: Pick<MutationCtx, "db">,
  keys: { ip: string; email: string },
  now: number,
) {
  const ipAllowed = await consumeRateLimit(
    ctx,
    "ip",
    keys.ip,
    IP_LIMIT,
    IP_WINDOW_MS,
    now,
  );

  const emailAllowed = await consumeRateLimit(
    ctx,
    "email",
    keys.email,
    EMAIL_LIMIT,
    EMAIL_WINDOW_MS,
    now,
  );

  return ipAllowed && emailAllowed;
}
