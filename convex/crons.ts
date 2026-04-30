import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "Clean up expired rate limit records",
  { hourUTC: 3, minuteUTC: 0 },
  internal.waitlist.cleanupExpiredRateLimits,
  {},
);

export default crons;
