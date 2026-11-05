import { describe, expect, it } from "vitest";
import { nextSendAt, recordRejection, recordSend, SEND_LIMIT, sendsAvailable } from "./rateLimit";

const { burst, refillMs } = SEND_LIMIT;
const T0 = 1_000_000_000;

function sendMany(count: number, at = T0) {
  let fullAt = 0;
  for (let i = 0; i < count; i++) fullAt = recordSend(fullAt, at);
  return fullAt;
}

describe("send limit", () => {
  it("allows a full burst with no wait", () => {
    expect(sendsAvailable(0, T0)).toBe(burst);
    expect(nextSendAt(sendMany(burst - 1), T0)).toBe(T0);
    expect(sendsAvailable(sendMany(burst - 1), T0)).toBe(1);
  });

  it("makes the next send wait one refill after the burst is spent", () => {
    const fullAt = sendMany(burst);
    expect(sendsAvailable(fullAt, T0)).toBe(0);
    expect(nextSendAt(fullAt, T0)).toBe(T0 + refillMs);
  });

  it("spaces sends by the refill from then on", () => {
    const first = nextSendAt(sendMany(burst), T0);
    const fullAt = recordSend(sendMany(burst), first);
    expect(nextSendAt(fullAt, first)).toBe(first + refillMs);
  });

  it("refills over time", () => {
    expect(sendsAvailable(sendMany(burst), T0 + 3 * refillMs)).toBe(3);
  });

  it("is fully available again after a long gap", () => {
    expect(sendsAvailable(sendMany(burst), T0 + burst * refillMs)).toBe(burst);
  });

  it("trusts a rejection over its own estimate", () => {
    const fullAt = recordRejection(0, T0, 177_000);
    expect(nextSendAt(fullAt, T0)).toBe(T0 + 177_000);
    expect(sendsAvailable(fullAt, T0)).toBe(0);
  });

  it("never shortens a longer wait because of a rejection", () => {
    const fullAt = sendMany(burst);
    expect(recordRejection(fullAt, T0, 1_000)).toBe(fullAt);
  });
});
