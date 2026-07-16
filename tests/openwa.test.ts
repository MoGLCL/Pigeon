import { describe, expect, it } from "vitest";
import { normaliseOpenWaState, qrImageSource } from "@/lib/openwa";

describe("official OpenWA client values", () => {
  it("keeps the QR data URL emitted by the official qr event", () => {
    const qr = "data:image/png;base64,abc123";
    expect(qrImageSource(qr)).toBe(qr);
  });

  it("normalizes documented Client connection states", () => {
    expect(normaliseOpenWaState("CONNECTED")).toBe("connected");
    expect(normaliseOpenWaState("PAIRING")).toBe("waiting_for_qr");
    expect(normaliseOpenWaState("UNPAIRED")).toBe("waiting_for_qr");
    expect(normaliseOpenWaState("CONFLICT")).toBe("disconnected");
  });
});
