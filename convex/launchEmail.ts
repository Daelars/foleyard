"use node";

import { Resend } from "resend";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  isAmbiguousEmailError,
  isIdempotencyConflictEmailError,
  isProviderWideEmailError,
} from "./lib/launchEmail";
import {
  createUnsubscribeLinks,
  isValidUnsubscribeEmail,
  normalizeUnsubscribeEmail,
  readUnsubscribeSecret,
} from "./lib/unsubscribe";

const env = (globalThis as any).process?.env as
  | { RESEND_FROM_EMAIL?: string; RESEND_API_KEY?: string }
  | undefined;

const fromEmail = env?.RESEND_FROM_EMAIL ?? "hello@foleyard.com";

// Small pause before each provider call so a batch of 25 does not arrive as a
// burst that trips the provider's rate limit. This action is called one
// recipient at a time, so the gap also applies between recipients.
const LAUNCH_EMAIL_SEND_THROTTLE_MS = 250;

type LaunchEmailSendResult = {
  // "unconfirmed" means the request may have reached the provider but no
  // definitive rejection came back. It is never retried automatically.
  status: "sent" | "failed" | "unconfirmed";
  errorMessage: string | null;
  // True when the failure is about the provider or the credentials, so every
  // other recipient would fail too.
  providerWide: boolean;
};

function truncateErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown email delivery error";
}

async function recordOutcome(
  ctx: ActionCtx,
  signupId: Id<"waitlistSignups">,
  outcome: "failed" | "unconfirmed",
  errorMessage: string,
  providerId?: string | null,
) {
  try {
    await ctx.runMutation(internal.launchHelpers.recordLaunchEmailResult, {
      signupId,
      outcome,
      errorMessage,
      providerId: providerId ?? null,
    });
  } catch (error) {
    // Leave the row "sending": the run recovery surfaces it as unconfirmed
    // instead of retrying an email that may have gone out.
    console.error("Failed to record launch email outcome", error);
  }
}

async function throttle() {
  await new Promise((resolve) =>
    setTimeout(resolve, LAUNCH_EMAIL_SEND_THROTTLE_MS),
  );
}

export const sendLaunchEmailToSignup = internalAction({
  args: {
    email: v.string(),
    signupId: v.id("waitlistSignups"),
    // Captured once on the first attempt for this recipient. Reusing it keeps
    // the token (and therefore the whole request body) identical across
    // retries under the same idempotency key.
    issuedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LaunchEmailSendResult> => {
    const apiKey = env?.RESEND_API_KEY;
    if (!apiKey) {
      // Nothing was sent: a definitive, provider-wide failure.
      const errorMessage = "RESEND_API_KEY is not configured";
      await recordOutcome(ctx, args.signupId, "failed", errorMessage);
      return { status: "failed", errorMessage, providerWide: true };
    }

    // An unsigned or broken unsubscribe link must never be delivered. Without a
    // signing secret the whole run is unservable, so record a provider-wide
    // failure that pauses it instead of sending anything.
    const unsubscribeSecret = readUnsubscribeSecret();
    if (!unsubscribeSecret) {
      const errorMessage = "UNSUBSCRIBE_SECRET is not configured";
      await recordOutcome(ctx, args.signupId, "failed", errorMessage);
      return { status: "failed", errorMessage, providerWide: true };
    }

    // An address that cannot be signed is this recipient's problem, not the
    // provider's. It must be a definitive per-recipient failure so the run
    // advances instead of pausing every batch on one bad signup.
    if (!isValidUnsubscribeEmail(normalizeUnsubscribeEmail(args.email))) {
      const errorMessage = "Recipient address is not a valid email address";
      await recordOutcome(ctx, args.signupId, "failed", errorMessage);
      return { status: "failed", errorMessage, providerWide: false };
    }

    let unsubscribe: Awaited<ReturnType<typeof createUnsubscribeLinks>>;
    try {
      unsubscribe = await createUnsubscribeLinks({
        secret: unsubscribeSecret,
        email: args.email,
        list: "waitlist",
        issuedAt: args.issuedAt,
      });
    } catch (error) {
      const errorMessage = truncateErrorMessage(error);
      await recordOutcome(ctx, args.signupId, "failed", errorMessage);
      return { status: "failed", errorMessage, providerWide: true };
    }

    await throttle();

    const resend = new Resend(apiKey);
    let response: Awaited<ReturnType<typeof resend.emails.send>>;

    try {
      response = await resend.emails.send(
        {
        from: fromEmail,
        to: args.email,
        subject: "Foleyard v1 is live",
        text: [
          "Foleyard v1 is live.",
          "",
          "Hey,",
          "",
          "Foleyard v1 is live.",
          "",
          "It's for messy SFX folders, music cues, and big audio libraries.",
          "",
          "You can search, preview, favourite, tag, and organise your sounds without moving everything around.",
          "",
          "This first version has faster indexing, better search, auto-updates, extension support, and drag-and-drop into editing tools.",
          "",
          "Try Foleyard: https://www.foleyard.com",
          "",
          "Thanks,",
          "Dae",
          "",
          "Don't want these emails? Unsubscribe:",
          unsubscribe.pageUrl,
        ].join("\n"),
        html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Foleyard v1 is live</title>
    <style>
      body { margin: 0; padding: 0; background: #f4f3ef; font-family: Arial, Helvetica, sans-serif; color: #111111; }
      .preview { display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; }
      .wrapper { width: 100%; padding: 32px 16px; background: #f4f3ef; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e1d8; }
      .header { padding: 28px 28px 0; }
      .logo { width: 42px; height: 42px; border-radius: 50%; background: #111111; color: #ffffff; font-size: 14px; font-weight: 700; line-height: 42px; text-align: center; letter-spacing: -0.04em; }
      .content { padding: 34px 28px 28px; }
      h1 { margin: 0 0 20px; font-size: 32px; line-height: 1.1; letter-spacing: -0.04em; color: #111111; }
      p { margin: 0 0 18px; font-size: 16px; line-height: 1.6; color: #2b2b28; }
      .button { display: inline-block; margin: 6px 0 28px; padding: 14px 20px; background: #111111; color: #ffffff !important; text-decoration: none; border-radius: 999px; font-size: 15px; font-weight: 700; }
      .footer { padding: 24px 28px 28px; border-top: 1px solid #e8e5dc; font-size: 13px; line-height: 1.6; color: #77736a; }
      .footer a { color: #111111; text-decoration: underline; }
      @media only screen and (max-width: 600px) {
        .wrapper { padding: 16px 10px; }
        .header, .content, .footer { padding-left: 22px; padding-right: 22px; }
        h1 { font-size: 28px; }
        p { font-size: 15px; }
      }
    </style>
  </head>
  <body>
    <div class="preview">A browser for messy SFX folders, music cues, and big audio libraries.</div>
    <div class="wrapper">
      <div class="container">
        <div class="header"><div class="logo">FY</div></div>
        <div class="content">
          <h1>Foleyard v1 is live.</h1>
          <p>Hey,</p>
          <p>Foleyard v1 is live.</p>
          <p>It's for messy SFX folders, music cues, and big audio libraries.</p>
          <p>You can search, preview, favourite, tag, and organise your sounds without moving everything around.</p>
          <p>This first version has faster indexing, better search, auto-updates, extension support, and drag-and-drop into editing tools.</p>
          <a class="button" href="https://www.foleyard.com">Try Foleyard</a>
          <p>Thanks,<br />Dae</p>
        </div>
        <div class="footer">
          <a href="https://www.foleyard.com">www.foleyard.com</a>
          <br /><br />
          Don't want Foleyard updates?
          <a href="${unsubscribe.pageUrl}">Unsubscribe</a>
        </div>
      </div>
    </div>
  </body>
</html>`,
        // RFC 8058 one-click, so a mail client can offer Unsubscribe without
        // the recipient opening the page.
        headers: unsubscribe.headers,
        },
        // Stable per recipient, so a provider retry of the same attempt can
        // never deliver a second copy.
        //
        // Assumption, not verified against the provider: Resend remembers an
        // idempotency key for 24 hours (its documented window at the time this
        // was written). A retry of the same signup beyond that window may
        // deliver a second copy, which is why nothing retries a row that may
        // already have been delivered (`unconfirmed`) without a human deciding
        // to.
        { idempotencyKey: `launch/${args.signupId}` },
      );
    } catch (error) {
      // The request was already on its way, so the email may have been
      // accepted: record it as unconfirmed and let the batch abort rather than
      // retrying a possible duplicate.
      const errorMessage = truncateErrorMessage(error);
      await recordOutcome(ctx, args.signupId, "unconfirmed", errorMessage);
      return { status: "unconfirmed", errorMessage, providerWide: true };
    }

    if (response.error) {
      const errorMessage = response.error.message.slice(0, 500);
      // A definitive rejection (a 4xx with a status) never sent the mail, so it
      // is safe to retry as "failed". A 5xx or a null status is ambiguous: the
      // provider may have accepted it before failing, so it must never be
      // retried automatically.
      const ambiguous =
        isAmbiguousEmailError(response.error) ||
        isIdempotencyConflictEmailError(response.error);
      const status = ambiguous ? "unconfirmed" : "failed";
      await recordOutcome(ctx, args.signupId, status, errorMessage);
      return {
        status,
        errorMessage,
        // 5xx and null status are ambiguous, and every ambiguous failure is
        // also provider-wide.
        providerWide:
          isProviderWideEmailError(response.error) || ambiguous,
      };
    }

    // Neither data nor error is not a success. The provider may have accepted
    // the email without saying so, so it is ambiguous and must never be retried
    // automatically.
    if (!response.data) {
      const errorMessage = "Resend returned neither data nor an error";
      await recordOutcome(ctx, args.signupId, "unconfirmed", errorMessage);
      return {
        status: "unconfirmed",
        errorMessage,
        providerWide: false,
      };
    }

    // The email is out. Recording it must never mark it failed, or a retry
    // would send it again: if the mutation fails, the row stays "sending" and
    // the run recovery surfaces it as unconfirmed instead.
    try {
      await ctx.runMutation(internal.launchHelpers.recordLaunchEmailResult, {
        signupId: args.signupId,
        outcome: "sent",
        errorMessage: null,
        providerId: response.data.id,
      });
    } catch (error) {
      console.error("Failed to record delivered launch email", error);
    }

    return { status: "sent", errorMessage: null, providerWide: false };
  },
});
