import { z } from "zod";

export const DOWNLOAD_SOURCE = "download-page";
export const DOWNLOAD_SUCCESS_MESSAGE =
  "Thanks! Your download is starting and we emailed you the link.";
export const DOWNLOAD_INVALID_MESSAGE = "Enter a valid email address.";
export const DOWNLOAD_ERROR_MESSAGE = "Something went wrong. Try again.";

export const downloadEmailSchema = z
  .string()
  .trim()
  .min(1, DOWNLOAD_INVALID_MESSAGE)
  .email(DOWNLOAD_INVALID_MESSAGE);

export const downloadSignupRequestSchema = z.object({
  email: downloadEmailSchema,
  source: z.literal(DOWNLOAD_SOURCE),
  website: z.string().trim().max(200).default(""),
});

export const downloadSignupResponseSchema = z.discriminatedUnion("status", [
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

export type DownloadSignupRequest = z.infer<
  typeof downloadSignupRequestSchema
>;
export type DownloadSignupResponse = z.infer<
  typeof downloadSignupResponseSchema
>;
