// Signed, per-recipient unsubscribe links.
//
// The provider placeholder `{{{RESEND_UNSUBSCRIBE_URL}}}` only works for
// Broadcasts and Automations, so single emails have to carry their own link.
// A link must prove which address (and which list) it belongs to without
// storing anything: the token is an HMAC-SHA256 over the normalised address,
// the list it was issued for, and an issue timestamp. Verification is the only
// way to unsubscribe, so a guessed link cannot opt anybody out.
//
// This module uses the Web Crypto API so it runs in both the Convex default
// runtime (HTTP actions, mutations) and the Node.js runtime (email actions).

export const UNSUBSCRIBE_SECRET_ENV = "UNSUBSCRIBE_SECRET";

export const UNSUBSCRIBE_LISTS = ["waitlist", "download"] as const;
export type UnsubscribeList = (typeof UNSUBSCRIBE_LISTS)[number];

export const UNSUBSCRIBE_TOKEN_VERSION = "v1";

// Links older than this stop working. A year is long enough for an email to
// sit in an inbox and short enough that a leaked link does not stay valid for
// the lifetime of the list.
export const UNSUBSCRIBE_TOKEN_TTL_SEC = 365 * 24 * 60 * 60;

const CLOCK_SKEW_SEC = 5 * 60;
const MAX_TOKEN_LENGTH = 1024;
const MAX_EMAIL_LENGTH = 254;
const HMAC_SIGNATURE_BYTES = 32;

// The public site, which serves the confirmation page and the one-click proxy.
// Nothing secret is derived from it, so a constant is enough and avoids
// another environment variable that could be missing at send time.
export const UNSUBSCRIBE_LINK_BASE = "https://www.foleyard.com";
export const UNSUBSCRIBE_PAGE_PATH = "/unsubscribe";
export const UNSUBSCRIBE_ONE_CLICK_PATH = "/api/unsubscribe";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type UnsubscribeVerification =
  | { ok: true; email: string; list: UnsubscribeList }
  | {
      ok: false;
      // `unconfigured` means the deployment has no signing secret: nothing can
      // be verified, and callers must fail closed rather than accept the token.
      reason: "unconfigured" | "malformed" | "expired" | "invalid";
    };

export function normalizeUnsubscribeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isUnsubscribeList(value: string): value is UnsubscribeList {
  return (UNSUBSCRIBE_LISTS as readonly string[]).includes(value);
}

type Env = Record<string, string | undefined>;

function readEnv(): Env | undefined {
  return (globalThis as { process?: { env?: Env } }).process?.env;
}

// Read at call time, never at module load, so a deployment that sets the
// secret after the functions were bundled still picks it up.
export function readUnsubscribeSecret(): string | null {
  const value = readEnv()?.[UNSUBSCRIBE_SECRET_ENV];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getSubtle(): SubtleCrypto {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!webCrypto?.subtle) {
    throw new Error("Web Crypto is not available in this runtime");
  }
  return webCrypto.subtle;
}

function toHex(bytes: Uint8Array) {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/.test(hex)) return null;

  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function looksLikeEmail(value: string) {
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  return at > 0 && at === value.lastIndexOf("@") && at < value.length - 1;
}

async function importHmacKey(secret: string) {
  return await getSubtle().importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function tokenPayload({
  list,
  email,
  issuedAtSec,
}: {
  list: UnsubscribeList;
  email: string;
  issuedAtSec: number;
}) {
  return `${UNSUBSCRIBE_TOKEN_VERSION}.${list}.${toHex(
    encoder.encode(email),
  )}.${issuedAtSec}`;
}

export async function createUnsubscribeToken({
  secret,
  email,
  list,
  issuedAt = Date.now(),
}: {
  secret: string;
  email: string;
  list: UnsubscribeList;
  issuedAt?: number;
}): Promise<string> {
  if (!secret) {
    throw new Error(`${UNSUBSCRIBE_SECRET_ENV} is not configured`);
  }

  const normalized = normalizeUnsubscribeEmail(email);
  if (!looksLikeEmail(normalized)) {
    throw new Error("Cannot sign an unsubscribe token for an invalid address");
  }

  const issuedAtSec = Math.floor(issuedAt / 1000);
  const payload = tokenPayload({ list, email: normalized, issuedAtSec });
  const signature = await getSubtle().sign(
    "HMAC",
    await importHmacKey(secret),
    encoder.encode(payload),
  );

  return `${payload}.${toHex(new Uint8Array(signature))}`;
}

// Constant-time in the only sense that matters here: the comparison itself is
// done by SubtleCrypto.verify, which never short-circuits on a mismatched byte.
export async function verifyUnsubscribeToken({
  token,
  now = Date.now(),
}: {
  token: string;
  now?: number;
}): Promise<UnsubscribeVerification> {
  const secret = readUnsubscribeSecret();
  if (!secret) return { ok: false, reason: "unconfigured" };

  if (typeof token !== "string") return { ok: false, reason: "malformed" };
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }

  const parts = trimmed.split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed" };

  const [version, list, emailHex, issuedAtRaw, signatureHex] = parts;
  if (version !== UNSUBSCRIBE_TOKEN_VERSION) {
    return { ok: false, reason: "malformed" };
  }
  if (!isUnsubscribeList(list)) return { ok: false, reason: "malformed" };

  const emailBytes = fromHex(emailHex);
  if (!emailBytes) return { ok: false, reason: "malformed" };

  const email = decoder.decode(emailBytes);
  if (!looksLikeEmail(email)) return { ok: false, reason: "malformed" };
  // Only an already-normalised address is signed, so a variant of the same
  // address cannot produce a second, different token.
  if (normalizeUnsubscribeEmail(email) !== email) {
    return { ok: false, reason: "malformed" };
  }

  if (!/^[0-9]{1,12}$/.test(issuedAtRaw)) {
    return { ok: false, reason: "malformed" };
  }
  const issuedAtSec = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isSafeInteger(issuedAtSec)) {
    return { ok: false, reason: "malformed" };
  }

  const signature = fromHex(signatureHex);
  if (!signature || signature.length !== HMAC_SIGNATURE_BYTES) {
    return { ok: false, reason: "malformed" };
  }

  const payload = tokenPayload({ list, email, issuedAtSec });
  const valid = await getSubtle().verify(
    "HMAC",
    await importHmacKey(secret),
    signature,
    encoder.encode(payload),
  );
  if (!valid) return { ok: false, reason: "invalid" };

  const nowSec = Math.floor(now / 1000);
  if (issuedAtSec > nowSec + CLOCK_SKEW_SEC) {
    // A signature from the future is not something this deployment issued.
    return { ok: false, reason: "invalid" };
  }
  if (nowSec - issuedAtSec > UNSUBSCRIBE_TOKEN_TTL_SEC) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, email, list };
}

export type UnsubscribeLinks = {
  // What the footer of the email links to: a page that asks for confirmation.
  pageUrl: string;
  // What List-Unsubscribe points to: accepts the RFC 8058 one-click POST.
  oneClickUrl: string;
  headers: {
    "List-Unsubscribe": string;
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click";
  };
};

export async function createUnsubscribeLinks({
  secret,
  email,
  list,
  issuedAt = Date.now(),
}: {
  secret: string;
  email: string;
  list: UnsubscribeList;
  issuedAt?: number;
}): Promise<UnsubscribeLinks> {
  const token = await createUnsubscribeToken({ secret, email, list, issuedAt });
  const query = `?token=${encodeURIComponent(token)}`;
  const oneClickUrl = `${UNSUBSCRIBE_LINK_BASE}${UNSUBSCRIBE_ONE_CLICK_PATH}${query}`;

  return {
    pageUrl: `${UNSUBSCRIBE_LINK_BASE}${UNSUBSCRIBE_PAGE_PATH}${query}`,
    oneClickUrl,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
