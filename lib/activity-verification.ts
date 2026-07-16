import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ACTIVITY_VERIFICATION_COOKIE = "pigeon_activity_verified";
export const ACTIVITY_VERIFICATION_TTL_SECONDS = 30 * 60;

type VerificationPayload = { userId: string; session: string; expiresAt: number };

function signingKey() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error("ENCRYPTION_KEY is required for activity verification");
  return value;
}

function sessionFingerprint(sessionToken: string) {
  return createHash("sha256").update(sessionToken).digest("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function cookieValue(request: Request) {
  const raw = request.headers.get("cookie") || "";
  for (const item of raw.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === ACTIVITY_VERIFICATION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function createActivityVerification(userId: string, sessionToken: string) {
  const expiresAt = Date.now() + ACTIVITY_VERIFICATION_TTL_SECONDS * 1000;
  const encoded = Buffer.from(JSON.stringify({
    userId,
    session: sessionFingerprint(sessionToken),
    expiresAt,
  } satisfies VerificationPayload)).toString("base64url");
  return { value: `${encoded}.${signature(encoded)}`, expiresAt };
}

export function activityVerificationExpiresAt(request: Request, userId: string, sessionToken: string) {
  const token = cookieValue(request);
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as VerificationPayload;
    if (
      payload.userId !== userId ||
      payload.session !== sessionFingerprint(sessionToken) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) return null;
    return payload.expiresAt;
  } catch {
    return null;
  }
}

export function activityVerificationCookie(value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ACTIVITY_VERIFICATION_COOKIE}=${encodeURIComponent(value)}; Path=/api/activity; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
