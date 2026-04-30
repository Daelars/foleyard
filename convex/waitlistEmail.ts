"use node";

import { Resend } from "resend";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@foleyard.com";

function truncateErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Unknown email delivery error";
}

export const sendThankYouEmail = internalAction({
  args: {
    signupId: v.id("waitlistSignups"),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.runQuery(internal.waitlist.getSignupForEmail, {
      signupId: args.signupId,
    });
    const apiKey = process.env.RESEND_API_KEY;

    if (!signup || !apiKey) {
      const errorMessage = !signup
        ? "Signup record missing before email send"
        : "RESEND_API_KEY is not configured";

      await ctx.runMutation(internal.waitlist.markEmailDeliveryState, {
        signupId: args.signupId,
        state: "failed",
        sentAt: null,
        providerId: null,
        errorMessage,
      });
      return null;
    }

    try {
      const resend = new Resend(apiKey);

      const result = await resend.emails.send({
        from: fromEmail,
        to: signup.email,
        subject: "Thanks for joining the Foleyard waitlist",
        text: [
          "Thanks for joining the Foleyard waitlist.",
          "",
          "You're on the list.",
          "",
          "We'll share more when there's something worth sending.",
        ].join("\n"),
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #e7e5e4; background: #0c0a09; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; border: 1px solid #292524; padding: 32px; background: #1c1917;">
              <p style="margin: 0 0 16px; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #a8a29e;">Foleyard</p>
              <h1 style="margin: 0 0 16px; font-size: 28px; line-height: 1.1; color: #fafaf9;">Thanks for joining the waitlist.</h1>
              <p style="margin: 0 0 12px; font-size: 16px; color: #d6d3d1;">You're on the list.</p>
              <p style="margin: 0; font-size: 16px; color: #d6d3d1;">We'll share more when there's something worth sending.</p>
            </div>
          </div>
        `,
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

    return null;
  },
});
