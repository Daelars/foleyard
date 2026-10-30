import { z } from "zod";

export const UNSUBSCRIBE_SUCCESS_MESSAGE =
  "You're unsubscribed. You won't get any more Foleyard emails.";
export const UNSUBSCRIBE_INVALID_MESSAGE =
  "This unsubscribe link is invalid or has expired.";
export const UNSUBSCRIBE_UNAVAILABLE_MESSAGE =
  "Unsubscribing is temporarily unavailable. Please try again later.";
export const UNSUBSCRIBE_RATE_LIMITED_MESSAGE =
  "Too many unsubscribe attempts. Please try again in a few minutes.";

// A signed token looks like `v1.<list>.<email hex>.<issued at>.<hmac hex>`.
// The pattern is deliberately strict so a malformed value is rejected before it
// ever reaches the verifier.
const TOKEN_PATTERN =
  /^v1\.(?:waitlist|download)\.[0-9a-f]{2,1024}\.[0-9]{1,12}\.[0-9a-f]{64}$/;

export const unsubscribeTokenSchema = z
  .string()
  .trim()
  .min(24, UNSUBSCRIBE_INVALID_MESSAGE)
  .max(1024, UNSUBSCRIBE_INVALID_MESSAGE)
  .regex(TOKEN_PATTERN, UNSUBSCRIBE_INVALID_MESSAGE);

export const unsubscribeRequestSchema = z.object({
  token: unsubscribeTokenSchema,
});

export const unsubscribeResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unsubscribed"), message: z.string() }),
  z.object({ status: z.literal("invalid"), message: z.string() }),
  z.object({ status: z.literal("unavailable"), message: z.string() }),
  z.object({ status: z.literal("rate_limited"), message: z.string() }),
]);

export type UnsubscribeRequest = z.infer<typeof unsubscribeRequestSchema>;
export type UnsubscribeResponse = z.infer<typeof unsubscribeResponseSchema>;

// Display only. The address is part of the signed payload, so the page can
// show the recipient which address it is about to opt out. Nothing is trusted
// from this value: the server verifies the signature before writing anything.
export function readUnsubscribeTokenEmail(token: string): string | null {
  const parsed = unsubscribeTokenSchema.safeParse(token);
  if (!parsed.success) return null;

  const emailHex = parsed.data.split(".")[2];
  if (!emailHex || emailHex.length % 2 !== 0) return null;

  const bytes = new Uint8Array(emailHex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(emailHex.slice(index * 2, index * 2 + 2), 16);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
