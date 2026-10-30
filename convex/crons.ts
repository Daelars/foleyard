import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "Clean up expired rate limit records",
  "0 3 * * *",
  internal.waitlist.cleanupExpiredRateLimits,
  {},
);

export default crons;
