import { z } from "zod";

export const WAITLIST_SOURCE = "landing-page";
export const WAITLIST_SUCCESS_MESSAGE =
  "You're on the list. We'll email you when Foleyard is ready.";
export const WAITLIST_INVALID_MESSAGE = "Enter a valid email address.";
export const WAITLIST_ERROR_MESSAGE = "Something went wrong. Try again.";

// RFC 5321 puts the maximum address length at 254 characters. The unsubscribe
// signer enforces the same cap, so a longer address must be rejected here:
// otherwise one public signup could never have a valid opt-out link signed.
export const MAX_SIGNUP_EMAIL_LENGTH = 254;

export const waitlistEmailSchema = z
  .string()
  .trim()
  .min(1, WAITLIST_INVALID_MESSAGE)
  .max(MAX_SIGNUP_EMAIL_LENGTH, WAITLIST_INVALID_MESSAGE)
  .email(WAITLIST_INVALID_MESSAGE);

export const waitlistRequestSchema = z.object({
  email: waitlistEmailSchema,
  source: z.literal(WAITLIST_SOURCE),
  website: z.string().trim().max(200).default(""),
});

export const waitlistResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("invalid"),
    message: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    message: z.string(),
  }),
]);

export type WaitlistRequest = z.infer<typeof waitlistRequestSchema>;
export type WaitlistResponse = z.infer<typeof waitlistResponseSchema>;
