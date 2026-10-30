import { z } from "zod";

export const SIGNUP_INVALID_MESSAGE = "Enter a valid email address.";
export const SIGNUP_ERROR_MESSAGE = "Something went wrong. Try again.";

export const SIGNUP_KINDS = ["waitlist", "download"] as const;
export type SignupKind = (typeof SIGNUP_KINDS)[number];

export const SIGNUPS = {
  waitlist: {
    path: "/api/waitlist",
    source: "landing-page",
    successMessage: "You're on the list. We'll email you when Foleyard is ready.",
  },
  download: {
    path: "/api/download-signup",
    source: "download-page",
    successMessage:
      "Thanks! Your download is starting and we emailed you the link.",
  },
} as const satisfies Record<
  SignupKind,
  { path: string; source: string; successMessage: string }
>;

export const signupEmailSchema = z
  .string()
  .trim()
  .min(1, SIGNUP_INVALID_MESSAGE)
  .email(SIGNUP_INVALID_MESSAGE);

function requestSchemaFor<Source extends string>(source: Source) {
  return z.object({
    email: signupEmailSchema,
    source: z.literal(source),
    website: z.string().trim().max(200).default(""),
  });
}

export const signupRequestSchemas = {
  waitlist: requestSchemaFor(SIGNUPS.waitlist.source),
  download: requestSchemaFor(SIGNUPS.download.source),
};

export const signupResponseSchema = z.discriminatedUnion("status", [
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
