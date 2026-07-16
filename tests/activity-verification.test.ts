import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVITY_VERIFICATION_COOKIE,
  activityVerificationCookie,
  activityVerificationExpiresAt,
  createActivityVerification,
} from "@/lib/activity-verification";

describe("activity password verification", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
  });

  it("creates a 30-minute proof bound to the user and current session", () => {
    const proof = createActivityVerification("user-1", "session-1");
    const request = new Request("http://localhost:3000/api/activity", {
      headers: { cookie: `${ACTIVITY_VERIFICATION_COOKIE}=${encodeURIComponent(proof.value)}` },
    });
    expect(activityVerificationExpiresAt(request, "user-1", "session-1")).toBe(proof.expiresAt);
    expect(activityVerificationExpiresAt(request, "user-1", "another-session")).toBeNull();
    expect(proof.expiresAt).toBeGreaterThan(Date.now() + 29 * 60_000);
  });

  it("rejects a modified proof and emits a scoped HttpOnly cookie", () => {
    const proof = createActivityVerification("user-1", "session-1");
    const tampered = `${proof.value.slice(0, -1)}x`;
    const request = new Request("https://pigeon.example/api/activity", {
      headers: { cookie: `${ACTIVITY_VERIFICATION_COOKIE}=${encodeURIComponent(tampered)}` },
    });
    expect(activityVerificationExpiresAt(request, "user-1", "session-1")).toBeNull();
    expect(activityVerificationCookie(proof.value, request, 1800)).toContain(
      "Path=/api/activity; HttpOnly; SameSite=Strict; Max-Age=1800; Secure",
    );
  });
});
