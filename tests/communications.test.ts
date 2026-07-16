import { describe, expect, it } from "vitest";
import { automationSchema } from "@/lib/validators/features.schema";
import { isInternationalPhone, splitInternationalPhones } from "@/lib/phone";
import { canReplyToReport, replyStatus } from "@/lib/support";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("communications workflows", () => {
  it("requires a country code and leading plus sign", () => {
    expect(isInternationalPhone("+201225905719")).toBe(true);
    expect(isInternationalPhone("201225905719")).toBe(false);
    expect(isInternationalPhone("+01234567")).toBe(false);
    expect(splitInternationalPhones("+201225905719, +201225905719\n+971501234567")).toEqual(["+201225905719", "+971501234567"]);
  });

  it.each([
    ["whatsapp", { waAccountId: uuid }, "new_message"],
    ["messenger", { fbPageId: uuid }, "new_message"],
    ["facebook_comment", { fbPageId: uuid }, "new_comment"],
    ["facebook_post", { fbPageId: uuid }, "scheduled_publish"],
  ] as const)("accepts the %s automation with a real account selection", (channel, account, trigger) => {
    expect(automationSchema.safeParse({ name: "Test rule", channel, trigger, keywords: [], replyMessage: "Hello", isActive: true, ...account }).success).toBe(true);
  });

  it("rejects an automation without its owned account reference", () => {
    expect(automationSchema.safeParse({ name: "Missing account", channel: "whatsapp", trigger: "new_message", keywords: [], replyMessage: "Hello", isActive: true }).success).toBe(false);
  });

  it("lets customers continue their own closed ticket and reopens it", () => {
    expect(canReplyToReport({ role: "user", userId: "u1", reportOwnerId: "u1" })).toBe(true);
    expect(canReplyToReport({ role: "user", userId: "u2", reportOwnerId: "u1" })).toBe(false);
    expect(replyStatus({ role: "user", currentStatus: "closed" })).toBe("open");
    expect(replyStatus({ role: "owner", currentStatus: "closed" })).toBe("closed");
  });
});
