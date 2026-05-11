"use node";

import { Resend } from "resend";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const env = (globalThis as any).process?.env as
  | { RESEND_FROM_EMAIL?: string; RESEND_API_KEY?: string }
  | undefined;

const fromEmail = env?.RESEND_FROM_EMAIL ?? "hello@foleyard.com";

function truncateErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown email delivery error";
}

export const sendLaunchEmailToSignup = internalAction({
  args: {
    email: v.string(),
    signupId: v.id("waitlistSignups"),
  },
  handler: async (ctx, args) => {
    const apiKey = env?.RESEND_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.waitlist.markEmailDeliveryState, {
        signupId: args.signupId,
        state: "failed",
        sentAt: null,
        providerId: null,
        errorMessage: "RESEND_API_KEY is not configured",
      });
      return;
    }

    try {
      const resend = new Resend(apiKey);

      const result = await resend.emails.send({
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
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>
        </div>
      </div>
    </div>
  </body>
</html>`,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      await ctx.runMutation(internal.waitlist.markEmailDeliveryState, {
        signupId: args.signupId,
        state: "sent",
        sentAt: Date.now(),
        providerId: result.data?.id ?? null,
        errorMessage: null,
      });
    } catch (error) {
      const errorMessage = truncateErrorMessage(error);

      await ctx.runMutation(internal.waitlist.markEmailDeliveryState, {
        signupId: args.signupId,
        state: "failed",
        sentAt: null,
        providerId: null,
        errorMessage,
      });
    }
  },
});
