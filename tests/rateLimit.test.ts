import { beforeEach, describe, expect, test } from "bun:test";

import {
  consumeRateLimit,
  consumeSignupRateLimits,
  EMAIL_LIMIT,
  EMAIL_WINDOW_MS,
  IP_LIMIT,
  IP_WINDOW_MS,
} from "../convex/lib/rateLimit";

type Row = {
  _id: string;
  key: string;
  scope: "ip" | "email";
  count: number;
  windowStartedAt: number;
  expiresAt: number;
};

// Implements only the `db` calls that the rate limiter makes.
function createMockCtx() {
  const rows = new Map<string, Row>();
  let nextId = 0;

  const db = {
    query(table: string) {
      expect(table).toBe("waitlistRateLimits");
      return {
        withIndex(
          index: string,
          range: (q: { eq: (field: string, value: string) => unknown }) => unknown,
        ) {
          expect(index).toBe("by_key");
          let key = "";
          range({
            eq: (field, value) => {
              expect(field).toBe("key");
              key = value;
              return null;
            },
          });
          return {
            unique: async () =>
              [...rows.values()].find((row) => row.key === key) ?? null,
          };
        },
      };
    },
    async insert(table: string, value: Omit<Row, "_id">) {
      expect(table).toBe("waitlistRateLimits");
      const _id = `id${nextId++}`;
      rows.set(_id, { _id, ...value });
      return _id;
    },
    async patch(id: string, value: Partial<Row>) {
      const row = rows.get(id);
      if (!row) throw new Error(`No row ${id}`);
      rows.set(id, { ...row, ...value });
    },
  };

  const ctx = { db } as unknown as Parameters<typeof consumeRateLimit>[0];
  return { ctx, rows };
}

const NOW = 1_700_000_000_000;

describe("consumeRateLimit", () => {
  let mock: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mock = createMockCtx();
  });

  const consume = (key: string, now = NOW, limit = 3, windowMs = 1000) =>
    consumeRateLimit(mock.ctx, "ip", key, limit, windowMs, now);

  test("allows up to the limit, then refuses", async () => {
    expect(await consume("ip:a")).toBe(true);
    expect(await consume("ip:a")).toBe(true);
    expect(await consume("ip:a")).toBe(true);
    expect(await consume("ip:a")).toBe(false);
    expect(await consume("ip:a")).toBe(false);
  });

  test("does not increase the count past the limit when it refuses", async () => {
    for (let i = 0; i < 5; i++) await consume("ip:a");
    const [row] = mock.rows.values();
    expect(row.count).toBe(3);
  });

  test("keeps a separate count for each key", async () => {
    for (let i = 0; i < 3; i++) await consume("ip:a");
    expect(await consume("ip:a")).toBe(false);
    expect(await consume("ip:b")).toBe(true);
  });

  test("records the scope, window start and expiry on the first hit", async () => {
    await consumeRateLimit(mock.ctx, "email", "email:x", 2, 5000, NOW);
    const [row] = mock.rows.values();
    expect(row).toMatchObject({
      key: "email:x",
      scope: "email",
      count: 1,
      windowStartedAt: NOW,
      expiresAt: NOW + 5000,
    });
  });

  test("refuses until the window expires, then starts a new window", async () => {
    for (let i = 0; i < 3; i++) await consume("ip:a");
    expect(await consume("ip:a", NOW + 999)).toBe(false);
    expect(await consume("ip:a", NOW + 1000)).toBe(true);

    expect(mock.rows.size).toBe(1);
    const [row] = mock.rows.values();
    expect(row).toMatchObject({
      count: 1,
      windowStartedAt: NOW + 1000,
      expiresAt: NOW + 2000,
    });

    expect(await consume("ip:a", NOW + 1001)).toBe(true);
    expect(await consume("ip:a", NOW + 1002)).toBe(true);
    expect(await consume("ip:a", NOW + 1003)).toBe(false);
  });
});

describe("consumeSignupRateLimits", () => {
  let mock: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mock = createMockCtx();
  });

  const signup = (ip: string, email: string, now = NOW) =>
    consumeSignupRateLimits(mock.ctx, { ip: `ip:${ip}`, email: `email:${email}` }, now);

  test("uses limits of 5 per IP in 15 minutes and 2 per email in 24 hours", () => {
    expect(IP_LIMIT).toBe(5);
    expect(IP_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(EMAIL_LIMIT).toBe(2);
    expect(EMAIL_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  test("allows 5 signups from one IP, then refuses the IP", async () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      expect(await signup("1.2.3.4", `user${i}@example.com`)).toBe(true);
    }
    expect(await signup("1.2.3.4", "another@example.com")).toBe(false);
  });

  test("a refused IP does not block other visitors", async () => {
    for (let i = 0; i <= IP_LIMIT; i++) {
      await signup("1.2.3.4", `user${i}@example.com`);
    }
    expect(await signup("5.6.7.8", "visitor@example.com")).toBe(true);
  });

  test("allows 2 signups for one email, then refuses it from any IP", async () => {
    expect(await signup("1.1.1.1", "same@example.com")).toBe(true);
    expect(await signup("2.2.2.2", "same@example.com")).toBe(true);
    expect(await signup("3.3.3.3", "same@example.com")).toBe(false);
    expect(await signup("3.3.3.3", "other@example.com")).toBe(true);
  });

  test("lets an IP sign up again after 15 minutes", async () => {
    for (let i = 0; i <= IP_LIMIT; i++) {
      await signup("1.2.3.4", `user${i}@example.com`);
    }
    expect(await signup("1.2.3.4", "late@example.com", NOW + IP_WINDOW_MS - 1)).toBe(false);
    expect(await signup("1.2.3.4", "later@example.com", NOW + IP_WINDOW_MS)).toBe(true);
  });

  test("lets an email sign up again after 24 hours", async () => {
    await signup("1.1.1.1", "same@example.com");
    await signup("2.2.2.2", "same@example.com");
    expect(await signup("3.3.3.3", "same@example.com", NOW + EMAIL_WINDOW_MS - 1)).toBe(false);
    expect(await signup("4.4.4.4", "same@example.com", NOW + EMAIL_WINDOW_MS)).toBe(true);
  });

  test("counts the email even when the IP is refused", async () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      await signup("1.2.3.4", `user${i}@example.com`);
    }
    expect(await signup("1.2.3.4", "victim@example.com")).toBe(false);
    expect(mock.rows.size).toBe(IP_LIMIT + 2);
    const emailRow = [...mock.rows.values()].find(
      (row) => row.key === "email:victim@example.com",
    );
    expect(emailRow?.count).toBe(1);
  });
});
